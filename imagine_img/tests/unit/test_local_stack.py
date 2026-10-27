"""로컬 스택 런처 (scripts/local_stack.py, 2026-08-05).

프로세스를 실제로 띄우지 않고 **계획과 안전장치**만 검증한다. 기동 자체는 사람이 눈으로
확인하는 일이고, 여기서 지켜야 하는 것은 "운영을 건드리지 않는다" 는 불변식이다.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))

from local_stack import (  # noqa: E402
    PROFILES,
    ProductionTargetError,
    assert_local_only,
    plan,
)


# --- 운영 보호 ---------------------------------------------------------------


@pytest.mark.parametrize(
    "value",
    [
        "redis://prod-cache.aws.com:6379",
        "10.0.3.14",
        "dero.co.kr",
        "ec2-3-35-1-2.ap-northeast-2.compute.amazonaws.com",
    ],
)
def test_non_local_hosts_are_refused(value: str):
    """운영 DB·Redis 를 건드리는 것이 이 작업의 유일한 진짜 위험이다.

    로컬 스택을 띄우는 스크립트가 원격 주소를 받아들이면, 오타 하나로 운영 큐에
    로컬 워커가 붙는다. 그래서 **주소를 검사하고 거절한다** — 경고가 아니라 거절이다.
    """
    with pytest.raises(ProductionTargetError):
        assert_local_only({"REDIS_HOST": value})


@pytest.mark.parametrize("value", ["127.0.0.1", "localhost", "::1", "0.0.0.0"])
def test_loopback_hosts_are_allowed(value: str):
    assert_local_only({"REDIS_HOST": value}) is None


def test_every_checked_variable_is_inspected_not_just_the_first():
    """변수가 여러 개일 때 하나만 보고 통과시키면 검사가 뜻을 잃는다."""
    with pytest.raises(ProductionTargetError):
        assert_local_only({"REDIS_HOST": "127.0.0.1", "API_BASE_URL": "https://api.dero.co.kr"})


def test_unrelated_variables_are_ignored():
    """검사 대상이 아닌 변수를 보고 거절하면 쓸 수 없는 스크립트가 된다."""
    assert_local_only({"MODEL_PROFILE": "sdxl_photoreal", "SEED": "42"}) is None


# --- 프로파일 ---------------------------------------------------------------


def test_capture_profile_starts_the_frontend_and_the_auth_stub_only():
    """캡처만 하려는데 모델을 올리면 8GB 카드에서 다른 작업을 못 한다."""
    services = [service.name for service in plan("capture")]

    assert services == ["auth-stub", "frontend"]


def test_worker_profile_starts_the_api_without_the_frontend():
    services = [service.name for service in plan("worker")]

    assert "worker-api" in services
    assert "frontend" not in services


def test_full_profile_is_the_union_of_the_others():
    full = {service.name for service in plan("full")}

    assert full == {name for profile in ("capture", "worker") for name in
                    {service.name for service in plan(profile)}}


def test_an_unknown_profile_names_the_valid_ones():
    with pytest.raises(ValueError) as caught:
        plan("prod")

    for name in PROFILES:
        assert name in str(caught.value)


def test_every_service_declares_a_readiness_probe():
    """준비 확인이 없으면 런처가 "떴다" 고 말한 뒤 사람이 빈 화면을 본다."""
    for profile in PROFILES:
        for service in plan(profile):
            assert service.ready_url or service.ready_log, service.name


def test_readiness_rejects_a_wrong_path_instead_of_calling_it_ready():
    """404 를 준비로 읽으면 프로브 경로 오탈자를 못 잡는다 (실제로 `/health` 로 적고 통과했다)."""
    import local_stack

    class _Response:
        status = 404

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    original = local_stack.urllib.request.urlopen
    local_stack.urllib.request.urlopen = lambda *a, **k: _Response()
    try:
        assert local_stack._is_ready("http://127.0.0.1:1/nope") is False
    finally:
        local_stack.urllib.request.urlopen = original


def test_the_worker_probe_uses_the_only_public_health_path():
    """`/health/ready` 는 API 키를 요구한다 (app/api/auth.py PUBLIC_PATHS)."""
    worker = next(service for service in plan("worker") if service.name == "worker-api")

    assert worker.ready_url.endswith("/health/live")


def test_the_queue_profile_runs_the_consumer():
    services = [service.name for service in plan("queue")]

    assert services == ["queue-worker"]


def test_the_queue_worker_is_marked_as_touching_redis():
    """붙을 Redis 가 무엇인지 기동 전에 **보여 주기** 위한 표시다.

    거절하기 위한 것이 아니다 — 로컬 워커가 운영 큐를 소비하는 것은
    `docs/OPERATIONS_LOCAL_WORKER.md` 의 전제이고 그 워커의 역할이다("EC2 와는 Redis 큐
    하나로만 연결한다"). 처음엔 여기서 운영이면 exit 3 으로 막았는데, 그건 **의도된 배포
    형태를 못 띄우게 하는 것**이었다.

    금지되는 것은 반대 방향이다: 운영 큐에 **가짜 작업을 넣는 것**(`queue_smoke --push`).
    그건 운영 백엔드가 처리해서 삭제 금지인 `generated_image` 행을 남긴다.
    """
    worker = next(service for service in plan("queue") if service.name == "queue-worker")

    assert worker.touches_redis is True
    for other in plan("capture"):
        assert other.touches_redis is False


def test_no_service_binds_outside_loopback():
    for profile in PROFILES:
        for service in plan(profile):
            if service.ready_url:
                assert "127.0.0.1" in service.ready_url, service.name
