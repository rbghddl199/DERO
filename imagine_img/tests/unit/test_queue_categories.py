"""큐가 카테고리를 실어 보낼 때 (2026-08-05).

백엔드가 `productCategories` 를 추가하면 워커가 그것을 **이름보다 먼저** 쓴다.
카테고리는 사람이 정한 유한한 집합이라 이름 추측보다 확실하다.
"""

from __future__ import annotations

from pathlib import Path

from app.core.config import Settings
from app.queue.runner import _to_request
from app.queue.schemas import WorkerRequest


def _job(**overrides) -> WorkerRequest:
    return WorkerRequest.model_validate(
        {
            "correlationId": "c-1",
            "screenshotUrls": ["http://x/y.png"],
            "uploadTargets": [{"key": "k.png", "url": "http://x/put"}],
            "count": 1,
            **overrides,
        }
    )


def _settings() -> Settings:
    return Settings(output_dir=Path("out"), model_cache_dir=Path("cache"))


def test_categories_are_accepted_and_default_to_empty():
    """백엔드가 아직 안 보내도 깨지지 않아야 한다 — 필드 추가는 양쪽이 동시에 못 나간다."""
    assert _job().product_categories == []
    assert _job(productCategories=["모니터", "의자"]).product_categories == ["모니터", "의자"]


def test_categories_come_before_names_in_the_prompt_input():
    """카테고리가 더 확실하다. 예산에 걸려 잘릴 때 이름 쪽이 먼저 잘려야 한다."""
    job = _job(productCategories=["모니터", "의자"], productNames=["제닉스 팜레스트"])

    summary = _to_request(job, 0, _settings())["productSummary"]

    assert summary[:2] == ["모니터", "의자"]
    assert "제닉스 팜레스트" in summary


def test_names_still_work_when_no_category_is_sent():
    job = _job(productNames=["모니터", "키보드"])

    assert _to_request(job, 0, _settings())["productSummary"] == ["모니터", "키보드"]


def test_a_category_repeated_in_the_names_is_not_duplicated():
    """`localize` 가 중복을 없애지만, 그 전에 예산 계산을 두 번 먹지 않게 여기서도 줄인다."""
    job = _job(productCategories=["모니터"], productNames=["모니터"])

    assert _to_request(job, 0, _settings())["productSummary"] == ["모니터"]
