"""큐 연결 스모크 — 백엔드 없이 워커의 큐 쪽을 확인한다 (2026-08-05).

## 무엇을 확인하는가

백엔드 대신 **작업 하나를 직접 넣고**, 워커가 결과 리스트에 무엇을 넣는지 읽는다.
확인되는 것은 셋이다.

```text
1. 워커가 그 큐를 보고 있는가      (키 이름이 서로 같은가)
2. 메시지를 파싱하는가             (필드 이름이 서로 같은가)
3. 결과를 어디에 넣는가            (results:{correlationId})
```

이 연결의 주된 실패 모드는 로직이 아니라 **문자열 불일치**다. 키 이름이 한 글자 다르면
워커는 조용히 아무것도 못 받고, 백엔드는 타임아웃으로 실패한다. 양쪽 다 에러가 안 난다.
그래서 키는 리터럴로 적지 않고 **설정에서 읽는다** — 정본은 백엔드의
`infra/LocalWorkerImageGeneration.java` 다.

## 원격 서버에 붙일 때 — REDIS_HOST 를 바꾸지 말 것

`app/core/config.py` 가 못 박아 뒀다: **"이 값을 원격 주소로 바꾸는 것은 설계 위반이다."**
그 Redis 에는 리프레시 토큰이 같이 산다(ADR-0005). 정해진 방법은 SSH 터널이다:

```bash
ssh -N -L 6379:127.0.0.1:6379 <user>@<server>
```

터널을 열면 워커·이 스크립트 모두 `127.0.0.1:6379` 그대로 두면 된다.

**주의: 터널은 `local_stack.py` 의 가드가 막지 못한다.** 가드는 설정에 적힌 주소만 본다.
터널 뒤가 로컬 테스트 Redis 인지 운영 Redis 인지 127.0.0.1 만 보고는 알 수 없다.
운영 Redis 에 붙으면 이 스크립트가 **운영 큐에 작업을 넣는다** — 그건 사람이 확인할 일이다.
그래서 `--i-know-this-is-not-production` 없이는 넣지 않는다.

## 사용

```bash
python scripts/queue_smoke.py --check          # 연결과 큐 상태만 본다 (쓰지 않는다)
python scripts/queue_smoke.py --push --i-know-this-is-not-production
```
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from urllib.parse import urlsplit

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO))

from app.core.config import get_settings  # noqa: E402

#: 요청 큐 키를 담은 **설정 이름**. 값을 리터럴로 박으면 설정을 바꿨을 때 조용히 어긋난다.
REQUEST_KEY_SETTING = "redis_request_key"

#: 결과 키 접두사. `WorkerRequest.result_key` 와 같은 규칙이어야 한다.
RESULT_PREFIX = "image:generate:results:"

#: **운영 판정의 증거.** 백엔드의 `RefreshTokenService.KEY_PREFIX` 와 같은 문자열이다.
#: 이 키가 있으면 그 Redis 에는 살아 있는 로그인 세션이 들어 있다(ADR-0005).
AUTH_KEY_PATTERN = "refresh:"

#: 이 이상 오래 떠 있으면 임시 테스트 인스턴스가 아니다.
SHARED_UPTIME_DAYS = 1
#: 이 이상 명령을 처리했으면 누군가 쓰고 있는 Redis 다.
SHARED_COMMAND_COUNT = 100_000


def result_key_for(correlation_id: str) -> str:
    return f"{RESULT_PREFIX}{correlation_id}"


def describe_target(target: dict) -> str:
    """업로드 대상을 로그에 찍을 형태로 줄인다.

    **presigned URL 의 쿼리스트링을 지운다** — 서명이 붙어 있어서 그 자체가 자격증명이고,
    로그·터미널 스크롤백·이슈 첨부로 새면 누구나 그 자리에 올릴 수 있다.
    """
    parts = urlsplit(target.get("url", ""))
    return f"{target.get('key')} -> {parts.scheme}://{parts.netloc}{parts.path}"


def build_job(*, correlation_id: str, count: int, screenshot_url: str | None = None) -> dict:
    """백엔드가 넣는 것과 **같은 모양**의 메시지.

    필드 이름은 camelCase 다 — 정본이 Java 라서다. snake_case 로 보내면 워커가 기본값으로
    채우고 조용히 다른 그림을 만든다.
    """
    if count <= 0:
        raise ValueError(f"count must be positive; got {count}")
    # 실제 presigned URL 이 아니어도 된다. 워커가 다운로드에서 실패하면 그건 **큐가
    # 이어졌다는 증거**다 — 이 스모크가 확인하려는 것은 거기까지다.
    screenshot = screenshot_url or "http://127.0.0.1:9/smoke-not-a-real-capture.png"
    return {
        "correlationId": correlation_id,
        "screenshotUrls": [screenshot],
        "uploadTargets": [
            {
                "key": f"generated-images/smoke-{correlation_id}-{index}.png",
                "url": f"http://127.0.0.1:9/put/{index}",
            }
            for index in range(count)
        ],
        "deskTexture": "white",
        "deskFrame": "H_FRAME",
        # 큐가 실제로 보내는 모양: 카테고리 이름과 실제 상품명이 섞여 온다.
        # 책상/바닥/벽이 갈리는지, 한국어가 영어로 옮겨지는지 여기서 드러난다.
        "productNames": [
            "모니터",
            "키보드",
            "의자",
            "타공판",
            "카멜마운트 클램프형 싱글 모니터암 CA-2",
            "장식",
        ],
        "roomLightOn": True,
        "timeOfDay": "DAY",
        "count": count,
    }


def assess_target(*, has_auth_keys: bool, uptime_days: float, commands: int) -> list[str]:
    """"이건 운영/공용이다" 는 **증거** 목록. 비어 있으면 테스트해도 되는 것으로 본다.

    플래그로 사람의 확인만 받는 것으로는 부족하다 — 운영 터널과 dev 터널이 포트만 다르면
    (지금 그렇다: 6379=운영, dev 는 6380 을 쓸 예정) **오타 한 번에 운영 큐로 간다.**
    그래서 붙은 Redis 를 읽어 보고 증거가 있으면 거절한다.

    `refresh:` 는 백엔드가 리프레시 토큰에 쓰는 접두사다. 그 키가 있으면 살아 있는 로그인
    세션이 든 Redis 이고, 갓 띄운 테스트 컨테이너에는 없다.
    """
    evidence = []
    if has_auth_keys:
        evidence.append(f"'{AUTH_KEY_PATTERN}*' 키가 있다 — 살아 있는 로그인 세션이 든 Redis 다")
    if uptime_days >= SHARED_UPTIME_DAYS:
        evidence.append(f"{uptime_days:.1f}일째 떠 있다 (임시 인스턴스가 아니다)")
    if commands >= SHARED_COMMAND_COUNT:
        evidence.append(f"명령 {commands:,}건을 처리했다 (누군가 쓰고 있다)")
    return evidence


def _gather_evidence(client) -> tuple[bool, float, int]:
    """읽기만 한다. `KEYS` 를 쓰지 않는다 — 운영 Redis 에서 그건 전체를 블로킹한다."""
    has_auth = False
    for _ in client.scan_iter(match=f"{AUTH_KEY_PATTERN}*", count=100):
        has_auth = True
        break  # 하나만 있으면 충분하다. 전수를 세려고 운영을 훑지 않는다.
    info = client.info("server")
    stats = client.info("stats")
    uptime_days = float(info.get("uptime_in_days", 0) or 0)
    commands = int(stats.get("total_commands_processed", 0) or 0)
    return has_auth, uptime_days, commands


def _client(settings):
    import redis

    return redis.Redis(
        host=settings.redis_host,
        port=settings.redis_port,
        db=settings.redis_db,
        password=settings.redis_password or None,
        decode_responses=True,
        socket_connect_timeout=3,
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="큐 연결 스모크")
    parser.add_argument("--push", action="store_true", help="작업 하나를 실제로 넣는다")
    parser.add_argument(
        "--i-know-this-is-not-production",
        action="store_true",
        help="--push 에 필수. 터널 뒤가 운영이 아님을 사람이 확인했다는 뜻이다",
    )
    parser.add_argument("--wait", type=int, default=180, help="결과 대기 상한(초)")
    parser.add_argument("--correlation-id", default=None)
    parser.add_argument("--count", type=int, default=1)
    parser.add_argument(
        "--screenshot-url",
        default=None,
        help="워커가 내려받을 캡처 URL. 없으면 가짜 URL 을 넣어 다운로드 실패까지만 본다",
    )
    args = parser.parse_args(argv)

    settings = get_settings()
    request_key = getattr(settings, REQUEST_KEY_SETTING)
    target = f"{settings.redis_host}:{settings.redis_port}/{settings.redis_db}"
    print(f"redis   {target}")
    print(f"queue   {request_key}")

    try:
        client = _client(settings)
        client.ping()
    except Exception as exc:
        print(f"\n[fail] Redis 에 붙지 못했다: {type(exc).__name__}: {exc}")
        print("  원격이면 터널을 먼저 연다 (REDIS_HOST 를 바꾸지 않는다):")
        print("    ssh -N -L 6379:127.0.0.1:6379 <user>@<server>")
        return 1

    depth = client.llen(request_key)
    print(f"depth   {depth} (큐에 대기 중인 작업 수)")
    if depth:
        # 이미 쌓여 있으면 워커가 안 돌고 있다는 뜻일 수 있다. 남의 작업일 수도 있으니 읽지만 지우지 않는다.
        print("  주의: 대기 중인 작업이 있다 — 워커가 꺼져 있거나 다른 워커가 처리 중이다")

    # 붙은 Redis 가 무엇인지 **증거로** 판정한다. 터널 뒤는 주소로 알 수 없다.
    try:
        has_auth, uptime_days, commands = _gather_evidence(client)
        # 키워드로 넘긴다. 위치 인자로 넘겼다가 TypeError 가 나서 **예외 분기로 빠졌고**,
        # 거절은 됐지만 증거를 읽지 못한 채였다 — 안전한 쪽으로 틀렸을 뿐 탐지기는 안 돌았다.
        evidence = assess_target(
            has_auth_keys=has_auth, uptime_days=uptime_days, commands=commands
        )
    except Exception as exc:  # 권한이 없어 INFO/SCAN 이 막힌 경우
        print(f"  warn  판정 근거를 읽지 못했다: {type(exc).__name__}: {exc}")
        evidence = ["Redis 를 검사할 수 없다 (INFO/SCAN 이 막혔다)"]
    if evidence:
        print("verdict 운영/공용으로 보인다:")
        for line in evidence:
            print(f"  - {line}")
    else:
        print("verdict 테스트용으로 보인다 (증거 없음)")

    if not args.push:
        print("\n--push 없이 확인만 했다. 아무것도 쓰지 않았다.")
        return 0

    # **위험한 것은 Redis 인스턴스가 아니라 키다.**
    #
    # 처음엔 "운영 Redis 면 넣지 않는다" 로 막았는데, 백엔드 코드를 읽고 그 이유가 틀린 것을
    # 확인했다(`LocalWorkerImageGeneration`): 백엔드는 **자기가 만든 correlationId 의 결과
    # 리스트만** 기다린다. 우리가 넣은 작업의 결과는 아무도 읽지 않으므로 그것으로
    # `generated_image` 행이 생기는 일은 없다.
    #
    # 남는 실제 위험은 하나다: **공용 요청 큐**에 넣으면 다른 워커(팀원의 GPU)가 그것을
    # 집어가 헛돈다. 전용 키를 쓰면 그 일도 없다 — 아무도 그 키를 BRPOP 하지 않는다.
    if evidence and request_key == "image:generate:requests":
        print(
            "\n[refused] 공용 요청 큐에는 넣지 않는다 — 다른 워커가 집어가 헛돈다.\n"
            "  전용 키로 넣으면 운영 Redis 라도 아무도 그 키를 보지 않는다:\n"
            "    REDIS_REQUEST_KEY=image:generate:requests:local-test\n"
            "  dev 서버로 터널을 따로 열고 REDIS_PORT 를 그쪽으로 맞춘다:\n"
            "    ssh -N -L 6380:127.0.0.1:6379 <user>@<dev-server>\n"
            "    REDIS_PORT=6380 python scripts/queue_smoke.py --push ..."
        )
        return 3

    if not args.i_know_this_is_not_production:
        print(
            "\n[refused] --push 에는 --i-know-this-is-not-production 이 필요하다.\n"
            "  증거는 없었지만 터널 뒤를 코드가 끝까지 확인할 수는 없다."
        )
        return 2

    correlation_id = args.correlation_id or f"smoke-{int(time.time())}"
    job = build_job(
        correlation_id=correlation_id, count=args.count, screenshot_url=args.screenshot_url
    )
    result_key = result_key_for(correlation_id)

    print(f"\npush    {correlation_id} (count={args.count})")
    for entry in job["uploadTargets"]:
        print(f"  target {describe_target(entry)}")
    client.lpush(request_key, json.dumps(job, ensure_ascii=False))

    print(f"wait    {result_key} (최대 {args.wait}s)")
    # **한 번의 긴 BRPOP 을 쓰지 않는다.** `timeout=400` 으로 걸었더니 SSH 터널에서
    # `TimeoutError: Timeout reading from socket` 으로 끊겼다 — 워커는 이미 처리를
    # 끝냈는데 읽는 쪽이 죽어서 결과를 놓쳤다(실측). 워커도 같은 이유로 5초씩 끊어
    # 블로킹한다(`redis_block_seconds`, "터널이 끊김은 정상 상태다").
    deadline = time.monotonic() + args.wait
    popped = None
    while popped is None and time.monotonic() < deadline:
        try:
            popped = client.brpop([result_key], timeout=5)
        except Exception as exc:
            print(f"  warn  읽기 재시도: {type(exc).__name__}")
            time.sleep(1)
    if popped is None:
        print("\n[fail] 결과가 오지 않았다. 워커가 그 큐를 보고 있는지 확인한다:")
        print("    python -m app.cli worker")
        print(f"  워커의 REDIS_HOST/DB 와 여기({target})가 같아야 한다.")
        return 1

    result = json.loads(popped[1])
    print(f"\nresult  status={result.get('status')}")
    if result.get("status") == "OK":
        print(f"  keys  {result.get('keys')}")
        print("\n큐가 이어졌다. 업로드까지 성공했다.")
        return 0
    print(f"  error {result.get('errorMessage')}")
    print(
        "\n큐는 이어졌다 (워커가 메시지를 파싱하고 답을 넣었다). 실패는 그 다음 단계다 — "
        "가짜 URL 을 줬으면 다운로드/업로드 실패가 정상이다."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
