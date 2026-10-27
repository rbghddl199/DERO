"""카테고리 → 프롬프트 단어 변환과 자리 배분 (2026-08-02 결정)."""

from __future__ import annotations

import pytest

from app.generation.product_categories import (
    CATEGORY_WORDS,
    MIN_SCREEN_AREA_PERCENT,
    ProductPlacement,
    Silhouette,
    resolve,
)
from app.generation.prompt_builder import PromptBuilder, resolve_products
from app.generation.schemas import GenerationRequest


def _placements(*pairs: tuple[str, float]) -> list[ProductPlacement]:
    return [ProductPlacement(code, area) for code, area in pairs]


def test_same_category_collapses_to_one_word():
    """화분 4개를 놔도 프롬프트에는 한 번만 들어간다 — 개수는 ControlNet 이 잡는다."""
    resolved = resolve(_placements(("PLANT", 1.0), ("PLANT", 2.0), ("PLANT", 0.8)))
    assert resolved.words == ("plant",)


def test_area_uses_largest_instance_not_the_sum():
    """작은 개체를 합쳐서 하한을 넘기면 하한의 뜻이 사라진다.

    하한의 근거는 "물체 하나가 잠재공간에서 몇 픽셀인가" 이므로 최대값이 기준이다.
    """
    resolved = resolve(_placements(("PIN", 0.2), ("PIN", 0.2), ("PIN", 0.2)))
    assert resolved.words == ()
    assert resolved.too_small == ("PIN",)


def test_too_small_categories_are_excluded_and_reported():
    resolved = resolve(_placements(("MONITOR", 8.0), ("STICKER", 0.05)))
    assert resolved.words == ("monitor",)
    assert resolved.too_small == ("STICKER",)


def test_min_area_boundary_is_inclusive():
    resolved = resolve(_placements(("MUG", MIN_SCREEN_AREA_PERCENT)))
    assert resolved.words == ("mug",)
    assert resolved.too_small == ()


def test_ambiguous_silhouettes_get_the_slots_first():
    """큰 물건이 아니라 이름이 없으면 깨지는 물건이 먼저다.

    TUMBLER 는 표에 READABLE 로 등록되어 있고(원통 실루엣), 미등록 코드는
    AMBIGUOUS 로 본다. 그래서 면적이 훨씬 작아도 미등록 코드가 앞에 온다.
    """
    resolved = resolve(_placements(("TUMBLER", 9.0), ("DIFFUSER", 0.5)))
    assert resolved.words == ("diffuser", "water bottle")


def test_same_tier_falls_back_to_area_descending():
    resolved = resolve(_placements(("SMALL_THING", 1.0), ("BIG_THING", 5.0)))
    assert resolved.words == ("big thing", "small thing")


def test_unknown_code_becomes_a_word_and_is_reported_as_unverified():
    """표를 채우는 일이 워커를 돌리는 일을 막지 않아야 한다 — 다만 조용히 넘기지 않는다."""
    resolved = resolve(_placements(("DESK_LAMP", 4.0)))
    assert resolved.words == ("desk lamp",)
    assert resolved.unverified == (("DESK_LAMP", "desk lamp"),)


def test_registered_code_is_not_reported_as_unverified():
    resolved = resolve(_placements(("TUMBLER", 4.0)))
    assert resolved.unverified == ()


def test_tumbler_is_not_translated_literally():
    """CLIP 에서 'tumbler' 는 곡예사로도 읽힌다 (2026-08-01 실측).

    이 한 줄이 표에 미리 들어가 있는 유일한 항목이고, 되돌아가면 안 되는 값이다.
    """
    assert CATEGORY_WORDS["TUMBLER"].word == "water bottle"
    assert CATEGORY_WORDS["TUMBLER"].silhouette is Silhouette.READABLE


def test_codes_are_normalized():
    resolved = resolve(_placements((" tumbler ", 4.0)))
    assert resolved.words == ("water bottle",)


@pytest.mark.parametrize("area", [0.0, 100.0])
def test_extreme_areas_do_not_crash(area):
    resolve(_placements(("THING", area)))


# --- 요청 두 경로 -----------------------------------------------------------


def _request(**overrides) -> GenerationRequest:
    return GenerationRequest.model_validate({"jobId": "cat", **overrides})


def test_categories_win_over_product_summary():
    """두 곳에서 제품을 정하면 응답만 보고 어느 쪽이 이겼는지 알 수 없다."""
    resolved = resolve_products(
        _request(
            productCategories=[{"code": "TUMBLER", "screenAreaPercent": 5.0}],
            productSummary=["ignored thing"],
        )
    )
    assert resolved.words == ("water bottle",)


def test_product_summary_still_works_without_categories():
    resolved = resolve_products(_request(productSummary=["monitor", "keyboard"]))
    assert resolved.words == ("monitor", "keyboard")
    assert resolved.unverified == ()


def test_product_summary_order_is_respected():
    """구 경로는 면적 정보가 없다. 준 순서를 재정렬하면 호출부의 의도가 사라진다."""
    resolved = resolve_products(_request(productSummary=["mug", "monitor"]))
    assert resolved.words == ("mug", "monitor")


# --- 예산 적용 --------------------------------------------------------------


def test_words_are_trimmed_one_at_a_time_not_all_at_once(settings):
    """예산을 넘겨도 문장을 통째로 버리지 않는다. 이름 하나가 더 들어가면 그만큼 낫다.

    절단 경로 전용이라 `enable_long_prompt=False` 를 명시한다 — 청킹이 켜져 있으면
    예산이 사실상 없어 애초에 버릴 이름이 생기지 않는다(2026-08-02, long_prompt.py).
    """
    long_off = settings.model_copy(update={"enable_long_prompt": False})
    many = [{"code": f"THING_NUMBER_{i}", "screenAreaPercent": 5.0} for i in range(8)]
    built = PromptBuilder(long_off).build(_request(productCategories=many))

    assert "on the desk:" in built.prompt
    assert built.products_dropped, "예산이 모자란데 버린 목록이 비어 있다"
    for word in built.products_dropped:
        assert word not in built.prompt


def test_nothing_is_dropped_when_everything_fits(settings):
    built = PromptBuilder(settings).build(
        _request(productCategories=[{"code": "TUMBLER", "screenAreaPercent": 5.0}])
    )
    assert built.products_dropped == ()
    assert "water bottle" in built.prompt


def test_no_product_sentence_when_all_categories_are_too_small(settings):
    built = PromptBuilder(settings).build(
        _request(productCategories=[{"code": "SPECK", "screenAreaPercent": 0.01}])
    )
    assert "on the desk:" not in built.prompt
    assert built.products_too_small == ("SPECK",)
    # 보존 지시는 제품 문장과 무관하게 남아야 한다. 부정문(`do not ...`)은 CLIP 에서
    # 무효라 기본 경로에서 뺐으므로, 개념으로 읽히는 이쪽만 확인한다.
    assert "keep object positions, count and camera angle." in built.prompt
