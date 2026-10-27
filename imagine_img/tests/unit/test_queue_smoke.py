"""큐 스모크 (scripts/queue_smoke.py, 2026-08-05).

Redis 없이 **계약**만 검증한다. 이 연결의 주된 실패 모드가 "문자열이 서로 다르다" 라서,
검증할 값은 키 이름과 필드 이름이다.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))

from queue_smoke import (  # noqa: E402
    AUTH_KEY_PATTERN,
    assess_target,
    build_job,
    describe_target,
    result_key_for,
)

from app.core.config import Settings  # noqa: E402
from app.queue.schemas import WorkerRequest  # noqa: E402


def test_the_job_parses_as_the_worker_request_the_consumer_expects():
    """워커가 실제로 쓰는 스키마로 파싱돼야 한다 — 여기가 계약의 유일한 진실이다."""
    payload = build_job(correlation_id="smoke-1", count=3)

    job = WorkerRequest.model_validate_json(json.dumps(payload))

    assert job.correlation_id == "smoke-1"
    assert job.count == 3
    assert len(job.upload_targets) == 3


def test_upload_targets_match_count_so_the_worker_has_a_slot_per_image():
    payload = build_job(correlation_id="smoke-2", count=2)

    assert len(payload["uploadTargets"]) == 2


def test_the_result_key_matches_what_the_worker_writes_to():
    """`results:{correlationId}` 다. 공용 리스트를 쓰면 남의 결과를 집는다(schemas 머리말)."""
    job = WorkerRequest.model_validate_json(json.dumps(build_job(correlation_id="abc", count=1)))

    assert result_key_for("abc") == job.result_key
    assert result_key_for("abc") == "image:generate:results:abc"


def test_the_request_key_comes_from_settings_not_a_literal():
    """백엔드의 `LocalWorkerImageGeneration` 과 문자열이 정확히 같아야 한다.

    스크립트에 리터럴로 박아 두면 설정을 바꿨을 때 조용히 다른 큐로 넣는다 —
    워커는 조용히 아무것도 못 받는다.
    """
    import queue_smoke

    assert queue_smoke.REQUEST_KEY_SETTING == "redis_request_key"
    assert Settings().redis_request_key == "image:generate:requests"


def test_camel_case_aliases_are_used_because_the_backend_sends_java_names():
    payload = build_job(correlation_id="smoke-3", count=1)

    for key in ("correlationId", "screenshotUrls", "uploadTargets", "productNames"):
        assert key in payload
    for snake in ("correlation_id", "screenshot_urls", "upload_targets", "product_names"):
        assert snake not in payload


def test_describe_target_hides_the_presigned_query_string():
    """presigned URL 에는 서명이 붙는다. 로그에 그대로 찍으면 그 자체가 자격증명이다."""
    described = describe_target(
        {"key": "generated-images/x.png", "url": "https://s3/x.png?X-Amz-Signature=deadbeef"}
    )

    assert "generated-images/x.png" in described
    assert "deadbeef" not in described
    assert "X-Amz-Signature" not in described


@pytest.mark.parametrize("count", [0, -1])
def test_a_non_positive_count_is_refused(count: int):
    with pytest.raises(ValueError):
        build_job(correlation_id="bad", count=count)


# --- 운영 판정 ---------------------------------------------------------------


def test_a_redis_holding_login_sessions_is_flagged():
    """`refresh:*` 는 백엔드의 리프레시 토큰 접두사다 — 그게 있으면 살아 있는 세션이 든 Redis 다."""
    evidence = assess_target(has_auth_keys=True, uptime_days=0.0, commands=0)

    assert evidence
    assert AUTH_KEY_PATTERN in evidence[0]


def test_a_long_lived_redis_is_flagged_even_without_auth_keys():
    """로그인이 아직 없는 운영 초기에도 걸러야 한다."""
    assert assess_target(has_auth_keys=False, uptime_days=12.0, commands=0)


def test_a_busy_redis_is_flagged():
    assert assess_target(has_auth_keys=False, uptime_days=0.0, commands=5_000_000)


def test_a_fresh_empty_redis_is_not_flagged():
    """갓 띄운 테스트 컨테이너는 통과해야 한다 — 아니면 쓸 수 없는 스크립트가 된다."""
    assert assess_target(has_auth_keys=False, uptime_days=0.0, commands=42) == []


def test_all_reasons_are_reported_not_just_the_first():
    """왜 거절됐는지가 다 보여야 사람이 판단할 수 있다."""
    evidence = assess_target(has_auth_keys=True, uptime_days=30.0, commands=9_000_000)

    assert len(evidence) == 3
