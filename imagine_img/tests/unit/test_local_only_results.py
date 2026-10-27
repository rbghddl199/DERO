"""로컬 전용 결과 모드 (2026-08-05).

큐로 온 작업을 처리하되 **업로드하지 않고 로컬에만 남긴다.** 잘 나오는지 눈으로 확인하는
용도다.

## 왜 큐 키를 따로 강제하는가

로컬 전용 모드는 결과를 아무 데도 올리지 않는다. 그 워커가 **운영 요청 큐**를 소비하면,
실제 사용자의 요청을 집어가고 백엔드는 5분 타임아웃으로 실패한다 — 조용한 서비스 장애다.
그래서 이 모드는 기본 요청 키에서 **돌기를 거부한다.**
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.core.config import Settings
from app.core.errors import WorkerError
from app.queue.runner import assert_local_only_is_isolated, local_only_dir


def _settings(tmp_path: Path, **overrides) -> Settings:
    return Settings(
        output_dir=tmp_path / "outputs",
        model_cache_dir=tmp_path / "cache",
        **overrides,
    )


def test_local_only_refuses_the_production_request_key(tmp_path: Path):
    """운영 요청 큐를 소비하면 실제 사용자 요청을 삼킨다 — 답을 안 주므로 그 요청은 실패한다."""
    settings = _settings(tmp_path, local_only_results=True)
    assert settings.redis_request_key == "image:generate:requests"

    with pytest.raises(WorkerError) as caught:
        assert_local_only_is_isolated(settings)

    assert "REDIS_REQUEST_KEY" in caught.value.message


def test_local_only_allows_a_separate_key(tmp_path: Path):
    settings = _settings(
        tmp_path,
        local_only_results=True,
        redis_request_key="image:generate:requests:local-test",
    )

    assert assert_local_only_is_isolated(settings) is None


def test_normal_mode_is_not_restricted(tmp_path: Path):
    """평소 워커는 운영 큐를 소비하는 것이 역할이다 — 그것까지 막으면 배포를 못 한다."""
    settings = _settings(tmp_path, local_only_results=False)

    assert assert_local_only_is_isolated(settings) is None


def test_results_go_under_the_output_dir_keyed_by_correlation_id(tmp_path: Path):
    """상관 id 로 나눈다 — 여러 번 돌렸을 때 어느 실행의 결과인지 알아야 한다."""
    settings = _settings(tmp_path, local_only_results=True)

    target = local_only_dir(settings, "abc-123")

    assert target.parent == settings.output_dir / "queue-local"
    assert target.name == "abc-123"


@pytest.mark.parametrize("bad", ["../escape", "a/b", "..", "a\\b"])
def test_a_correlation_id_cannot_escape_the_output_dir(tmp_path: Path, bad: str):
    """상관 id 는 큐에서 온 값이다. 경로로 쓰기 전에 검사하지 않으면 디렉터리 탈출이 된다."""
    settings = _settings(tmp_path, local_only_results=True)

    with pytest.raises(WorkerError):
        local_only_dir(settings, bad)


def test_the_job_id_uses_the_full_correlation_id_so_outputs_do_not_collide():
    """앞 8자만 쓰면 출력 폴더가 겹쳐 metadata 가 덮인다 (2026-08-05 실측).

    `smoke-1785898004` 와 `smoke-1785903139` 는 앞 8자가 둘 다 `smoke-17` 이라
    같은 `outputs/smoke-17-1/` 에 썼다.
    """
    from app.queue.runner import _to_request
    from app.queue.schemas import WorkerRequest

    def job(correlation_id: str) -> WorkerRequest:
        return WorkerRequest.model_validate(
            {
                "correlationId": correlation_id,
                "screenshotUrls": ["http://x/y.png"],
                "uploadTargets": [{"key": "k.png", "url": "http://x/put"}],
                "count": 1,
            }
        )

    settings = Settings(output_dir=Path("out"), model_cache_dir=Path("cache"))
    first = _to_request(job("smoke-1785898004"), 0, settings)["jobId"]
    second = _to_request(job("smoke-1785903139"), 0, settings)["jobId"]

    assert first != second
