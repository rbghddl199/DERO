"""Redis 를 바라보다가 작업이 들어오면 처리한다.

정본은 백엔드의 `infra/LocalWorkerImageGeneration.java`.

```text
[WAS] GeneratedImageService.publish()
        └─ ImageGenerationPort.generate()          ← LocalWorkerImageGeneration
              ├─ LPUSH image:generate:requests     (presign 을 여기서 발급한다)
              └─ BRPOP image:generate:results:{id} (블로킹 대기)
                        ▲
[노트북]  BRPOP requests ──► 생성 ──► presigned PUT ──┘ RPUSH results:{id}
```

## 왜 처리중 리스트가 없는가

`ImagePublishQueue`(대기열·처리중·스위퍼)는 **백엔드 쪽 큐**다. 그쪽이 이미 유실을 막고
있으므로 여기서 또 만들면 두 겹이 된다. 이 워커가 죽으면 백엔드의 `rightPop` 이 타임아웃으로
깨지고, 그 배치는 `FAILED` 가 되며, 사용자가 같은 `PUT` 을 다시 눌러 재투입한다.

즉 **이 워커는 상태를 갖지 않는다.** 요청 하나를 받아 결과 하나를 밀어 넣는 것이 전부다.

## 동시에 한 건만 처리한다

8GB 카드에서 둘을 돌리면 둘 다 WDDM 공유 메모리로 밀려 **오류 없이 수십 배 느려진다**
(실측: 전체 GPU 상주 301초 vs 오프로드 18.7초). 백엔드도 소비 스레드가 하나라 맞는다.
"""

from __future__ import annotations

import json
import signal
import time

from app.core.config import Settings
from app.core.logging import get_logger
from app.queue.runner import run_job
from app.queue.schemas import WorkerRequest, WorkerResult

log = get_logger(__name__)


class QueueWorker:
    def __init__(self, settings: Settings, service):
        self.settings = settings
        self.service = service
        self._stop = False
        self._client = None

    # --- 수명 ---------------------------------------------------------------

    def _connect(self):
        import redis

        client = redis.Redis(
            host=self.settings.redis_host,
            port=self.settings.redis_port,
            db=self.settings.redis_db,
            password=self.settings.redis_password or None,
            decode_responses=True,
            socket_timeout=self.settings.redis_block_seconds + 10,
            socket_connect_timeout=10,
            health_check_interval=30,
        )
        client.ping()
        log.info(
            "redis connected %s:%s db=%s",
            self.settings.redis_host, self.settings.redis_port, self.settings.redis_db,
        )
        return client

    def request_stop(self, *_args) -> None:
        """SIGINT/SIGTERM 을 받으면 **현재 작업을 끝내고** 멈춘다.

        중간에 끊으면 백엔드가 타임아웃까지 기다린 뒤 그 배치를 FAILED 로 내린다.
        사람이 Ctrl-C 를 눌렀을 때까지 사용자 배치를 깨뜨릴 이유가 없다.
        """
        if not self._stop:
            log.info("stop requested — 현재 작업을 마치고 종료한다")
        self._stop = True

    # --- 루프 ---------------------------------------------------------------

    def run(self) -> int:
        signal.signal(signal.SIGINT, self.request_stop)
        signal.signal(signal.SIGTERM, self.request_stop)

        # 모델을 올리기 전에 확인한다 — 로컬 전용 모드가 공용 큐를 소비하면 실제 사용자
        # 요청을 삼키고 답을 주지 않아 그 요청이 타임아웃으로 실패한다. 수 분 걸리는 모델
        # 로딩 뒤에 알려주면 그 사이에 이미 한 건을 집을 수 있다.
        from app.queue.runner import assert_local_only_is_isolated

        assert_local_only_is_isolated(self.settings)
        if self.settings.local_only_results:
            log.warning(
                "LOCAL_ONLY_RESULTS=true — 업로드하지 않고 %s/queue-local/ 에만 남긴다. "
                "응답의 key 가 가리키는 파일은 스토리지에 없다.",
                self.settings.output_dir,
            )

        self.service.load()
        if self.settings.warmup_on_start:
            self.service.warmup()

        self._client = self._connect()
        log.info(
            "waiting on %s (results → %s*)",
            self.settings.redis_request_key, self.settings.redis_result_prefix,
        )
        while not self._stop:
            raw = self._take()
            if raw is not None:
                self._handle(raw)

        log.info("worker stopped")
        return 0

    def _take(self) -> str | None:
        """대기열 꼬리에서 하나 꺼낸다. 백엔드가 LPUSH 하므로 RIGHT 가 FIFO 다."""
        import redis as redis_lib

        try:
            popped = self._client.brpop(
                [self.settings.redis_request_key], timeout=self.settings.redis_block_seconds
            )
            return popped[1] if popped else None
        except redis_lib.ConnectionError as exc:
            # 터널이 끊기는 것은 정상 상태다(노트북 + 가정용 네트워크). 죽지 않고 다시 붙는다.
            log.warning(
                "redis connection lost (%s) — %d초 뒤 재연결", exc, self.settings.reconnect_seconds
            )
            time.sleep(self.settings.reconnect_seconds)
            try:
                self._client = self._connect()
            except Exception as retry_exc:  # noqa: BLE001
                log.warning("reconnect failed: %s", retry_exc)
            return None

    def _handle(self, raw: str) -> None:
        try:
            job = WorkerRequest.model_validate_json(raw)
        except Exception as exc:  # noqa: BLE001
            # 응답 리스트 이름을 correlationId 에서 얻는데 그걸 못 읽었다 — 답을 보낼 곳이 없다.
            # 백엔드는 타임아웃으로 알아채고 그 배치를 FAILED 로 내린다.
            log.error("잘못된 작업 메시지를 버린다: %s | %s", exc, raw[:300])
            return

        log.info(
            "[%s] count=%d desk=%s/%s products=%d",
            job.correlation_id[:8], job.count, job.desk_texture, job.desk_frame,
            len(job.product_names),
        )
        result = run_job(job, self.service)
        self._publish(job, result)

    def _publish(self, job: WorkerRequest, result: WorkerResult) -> None:
        payload = json.dumps(result.model_dump(by_alias=True), ensure_ascii=False)
        # 백엔드가 rightPop 으로 받으므로 RPUSH 로 넣는다. 그리고 **TTL 을 건다** —
        # 백엔드가 타임아웃으로 이미 빠져나갔으면 이 값을 아무도 안 읽는데,
        # Redis 에는 리프레시 토큰이 같이 살아서(ADR-0005) 영구히 남으면 안 된다.
        # 백엔드도 finally 에서 지우지만, 그쪽이 죽었을 때의 마지막 방어다.
        pipe = self._client.pipeline()
        pipe.rpush(job.result_key, payload)
        pipe.expire(job.result_key, self.settings.result_ttl_seconds)
        pipe.execute()
