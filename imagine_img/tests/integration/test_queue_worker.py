"""Redis 큐 동작 검증. GPU 도 Redis 서버도 필요 없다 (fakeredis + 스텁 생성기).

계약 정본은 백엔드의 `infra/LocalWorkerImageGeneration.java` 다. 여기서 지키려는 것은
그 클래스가 검사하는 것들이다.

```text
key 를 그대로 돌려준다      다른 key 를 주면 백엔드가 거부한다 — 고아 객체와 유령 행이 생긴다
장수가 정확히 count 다       부분 성공은 한도만 깎고 화면이 빈다
결과는 correlationId 리스트  공용 리스트면 요청이 겹칠 때 남의 결과를 집는다
결과에 TTL 을 건다           리프레시 토큰이 사는 Redis 에 아무도 안 읽는 값을 남기지 않는다
```
"""

from __future__ import annotations

import json
from pathlib import Path

import fakeredis
import pytest
from PIL import Image

from app.core.errors import ErrorCode, WorkerError
from app.queue.consumer import QueueWorker

SCREENSHOT = "https://example.invalid/screenshot.png"


def _message(count: int = 3, **overrides) -> dict:
    body = {
        "correlationId": "abc-123-def",
        "screenshotUrls": [SCREENSHOT],
        "roomLightOn": False,
        "timeOfDay": "NIGHT",
        "uploadTargets": [
            {"key": f"generated-images/{i}.png", "url": f"https://s3.invalid/put/{i}"}
            for i in range(count)
        ],
        "deskTexture": "Walnut",
        "deskFrame": "FOUR_LEG",
        "productNames": ["LG 27UP850", "로지텍 MX Master 3S"],
        "count": count,
    }
    body.update(overrides)
    return body


class _StubService:
    def __init__(self, settings):
        self.settings = settings
        self.fail_on: int | None = None
        self.calls = 0
        self.seeds: list[int] = []

    def load(self):
        pass

    def warmup(self):
        pass


@pytest.fixture
def worker(settings, monkeypatch, tmp_path):
    service = _StubService(settings)
    instance = QueueWorker(settings, service)
    instance._client = fakeredis.FakeStrictRedis(decode_responses=True)

    monkeypatch.setattr(
        "app.queue.runner.download", lambda url, s: Image.new("RGB", (64, 64), "white")
    )
    uploaded: list[str] = []

    def _fake_upload(target, path, s):
        uploaded.append(target.key)
        return target.key

    monkeypatch.setattr("app.queue.runner.upload", _fake_upload)

    def _fake_generate(request, image, svc):
        service.calls += 1
        service.seeds.append(request.seed)
        if service.fail_on is not None and service.calls == service.fail_on:
            raise WorkerError(ErrorCode.INFERENCE_FAILED, "생성 실패(테스트)")
        path = tmp_path / f"{request.job_id}.png"
        Image.new("RGB", (64, 64), "black").save(path)

        class _Response:
            output_path = str(path)
            warnings: list[str] = []
            timing = {"totalMs": 1}

        return _Response()

    monkeypatch.setattr("app.generation.generator.generate", _fake_generate)
    instance.uploaded = uploaded  # type: ignore[attr-defined]
    return instance, service


def _result(instance, correlation_id: str = "abc-123-def") -> dict | None:
    key = f"{instance.settings.redis_result_prefix}{correlation_id}"
    raw = instance._client.lrange(key, 0, -1)
    return json.loads(raw[0]) if raw else None


def test_success_returns_the_exact_keys_the_backend_gave(worker):
    """백엔드가 준 key 를 **그대로** 돌려줘야 한다.

    다른 key 를 주면 그 객체는 아무도 안 지우는 고아가 되고, DB 에는 없는 파일을 가리키는
    행이 남는다. 백엔드의 LocalWorkerImageGeneration 이 이걸 검사해서 거부한다.
    """
    instance, _ = worker
    message = _message(count=3)
    instance._handle(json.dumps(message))

    result = _result(instance)
    assert result["status"] == "OK"
    assert result["keys"] == [t["key"] for t in message["uploadTargets"]]


def test_result_goes_to_the_correlation_specific_list(worker):
    """공용 리스트가 아니라 correlationId 리스트다 — 요청이 겹쳐도 안 섞인다."""
    instance, _ = worker
    instance._handle(json.dumps(_message(correlationId="job-xyz")))

    assert _result(instance, "job-xyz") is not None
    assert _result(instance, "abc-123-def") is None


def test_result_list_gets_a_ttl(worker):
    """백엔드가 타임아웃으로 먼저 빠져나가면 아무도 안 읽는 값이 남는다.

    이 Redis 에는 리프레시 토큰이 같이 산다(ADR-0005) — 영구히 남기면 안 된다.
    """
    instance, _ = worker
    instance._handle(json.dumps(_message()))

    ttl = instance._client.ttl(f"{instance.settings.redis_result_prefix}abc-123-def")
    assert 0 < ttl <= instance.settings.result_ttl_seconds


def test_each_image_gets_a_different_seed(worker):
    """같은 seed 면 3장이 픽셀 단위로 같아진다 — 대표 1장을 고르는 의미가 없어진다."""
    instance, service = worker
    instance._handle(json.dumps(_message(count=3)))

    assert len(set(service.seeds)) == 3


def test_generation_failure_uploads_nothing(worker):
    """3장 중 2장째에서 깨지면 **한 장도 올리지 않는다.**

    generated_image 는 삭제 금지이고 일일 한도의 근거라 부분 업로드를 사후에 못 지운다.
    """
    instance, service = worker
    service.fail_on = 2

    instance._handle(json.dumps(_message(count=3)))

    assert instance.uploaded == [], "생성이 깨졌는데 업로드가 일어났다"
    result = _result(instance)
    assert result["status"] == "FAILED"
    assert result["keys"] == []


def test_count_must_match_upload_targets(worker):
    """자리 수와 count 가 어긋나면 백엔드가 기대하는 행 수와 달라진다."""
    instance, _ = worker
    body = _message(count=3)
    body["uploadTargets"] = [body["uploadTargets"][0]]

    instance._handle(json.dumps(body))

    result = _result(instance)
    assert result["status"] == "FAILED"
    assert "업로드 자리" in result["errorMessage"]


def test_malformed_message_is_dropped_silently(worker):
    """correlationId 를 못 읽으면 답을 보낼 곳이 없다.

    백엔드는 타임아웃으로 알아채고 그 배치를 FAILED 로 내린다 — 여기서 할 수 있는 게 없다.
    """
    instance, _ = worker
    instance._handle("{ not json")

    assert instance._client.keys("*") == []


def _spy_requests(monkeypatch) -> list:
    seen = []
    original = __import__("app.generation.generator", fromlist=["generate"]).generate
    monkeypatch.setattr(
        "app.generation.generator.generate",
        lambda request, image, svc: (seen.append(request), original(request, image, svc))[1],
    )
    return seen


def test_product_names_reach_the_prompt(worker, monkeypatch):
    """제품 이름이 빠지면 그 물건이 다른 카테고리의 물건이 된다 (실측: 스탠드 → 거울)."""
    instance, _ = worker
    seen = _spy_requests(monkeypatch)

    instance._handle(json.dumps(_message(count=1)))

    assert seen[0].product_summary == ["LG 27UP850", "로지텍 MX Master 3S"]


def test_lighting_state_reaches_the_prompt(worker, monkeypatch):
    """조명 상태가 생성 요청까지 실제로 전달돼야 한다.

    이 값이 조명을 만들지는 못한다 — 캡처에 구워져 있어야 한다(실측: 밝은 캡처에 NIGHT
    프롬프트를 줘도 193.6 → 186.4). 다만 모델에게 어떤 장면인지 알려주는 값이라 빠지면
    재질 표현이 엉뚱한 쪽으로 간다.
    """
    instance, _ = worker
    seen = _spy_requests(monkeypatch)

    instance._handle(json.dumps(_message(count=1, timeOfDay="NIGHT", roomLightOn=False)))

    assert seen[0].time_of_day == "NIGHT"
    assert seen[0].room_light_on is False


def test_one_capture_is_reused_for_every_image(worker, monkeypatch):
    """캡처가 1장이면 한 번만 내려받아 돌려 쓴다 — 같은 URL 을 3번 당기지 않는다."""
    instance, _ = worker
    fetched: list[str] = []
    monkeypatch.setattr(
        "app.queue.runner.download",
        lambda url, s: (fetched.append(url), Image.new("RGB", (64, 64), "white"))[1],
    )

    instance._handle(json.dumps(_message(count=3)))

    assert fetched == [SCREENSHOT]


def test_three_captures_are_used_one_per_image(worker, monkeypatch):
    """각도별 캡처가 오면 장마다 다른 것을 쓴다 — 스키마가 열리는 날 코드를 안 고쳐도 된다."""
    instance, _ = worker
    urls = [f"https://example.invalid/angle-{i}.png" for i in range(3)]
    fetched: list[str] = []
    monkeypatch.setattr(
        "app.queue.runner.download",
        lambda url, s: (fetched.append(url), Image.new("RGB", (64, 64), "white"))[1],
    )

    instance._handle(json.dumps(_message(count=3, screenshotUrls=urls)))

    assert fetched == urls
    assert _result(instance)["status"] == "OK"
