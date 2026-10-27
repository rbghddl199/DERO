"""DERO 카테고리 → 영어 명사 표 (app/generation/dero_categories.py, 2026-08-05)."""

from __future__ import annotations

import pytest

from app.generation.dero_categories import (
    DERO_CATEGORY_WORDS,
    Placement,
    resolve,
)


@pytest.mark.parametrize(
    ("korean", "expected"),
    [
        ("모니터", "monitor"),
        ("모니터암", "monitor arm"),
        ("팜레스트", "padded wrist rest"),
        ("타공판", "perforated pegboard"),
        ("헤드폰 거치대", "headphone stand"),
        ("러그·카펫", "area rug"),
        ("발받침", "footrest"),
    ],
)
def test_known_categories_resolve_to_an_english_noun(korean: str, expected: str):
    word = resolve(korean)

    assert word is not None
    assert word.word == expected


def test_spacing_does_not_matter():
    """화면 표기와 API 응답의 공백이 다를 수 있다 — `product_sort.normalize` 와 같은 규칙."""
    assert resolve("헤드폰거치대").word == resolve("헤드폰 거치대").word


def test_an_unknown_category_is_none_so_the_caller_can_report_a_stale_table():
    assert resolve("우주선") is None


@pytest.mark.parametrize("korean", ["장식", "데코", "기타", "거치대", "레코드", "소품"])
def test_untranslatable_categories_are_left_blank_with_a_reason(korean: str):
    """억지로 채우면 `photo of a decoration` 같은 프롬프트가 조용히 나간다.

    표에 **있으면서 word 가 None** 인 것과 표에 **없는** 것은 다르다 — 전자는 사람이
    판단한 것이고 후자는 표가 낡은 것이다.
    """
    word = resolve(korean)

    assert word is not None, "표에는 있어야 한다 (판단했다는 기록)"
    assert word.word is None
    assert word.note, "왜 비웠는지가 없으면 다음 사람이 그냥 채운다"


@pytest.mark.parametrize(
    ("korean", "placement"),
    [
        ("의자", Placement.FLOOR),
        ("발받침", Placement.FLOOR),
        ("러그·카펫", Placement.FLOOR),
        ("데스크톱", Placement.FLOOR),
        ("타공판", Placement.WALL),
        ("모니터", Placement.DESK),
        ("키보드", Placement.DESK),
    ],
)
def test_placement_is_recorded_so_the_prompt_does_not_lie(korean: str, placement: Placement):
    """`on the desk: ... office chair` 는 틀린 사실이다 (placement.py 머리말)."""
    assert resolve(korean).placement is placement


def test_the_pegboard_is_on_the_wall_not_the_desk():
    """벽을 따로 두지 않으면 모델이 타공판을 상판에 눕혀 놓는다."""
    assert resolve("타공판").placement is Placement.WALL


def test_no_english_word_is_a_bare_generic_that_clip_cannot_draw():
    """`stand`·`decoration` 처럼 실루엣이 정해지지 않는 단어를 그대로 두지 않는다.

    이 저장소의 실측 근거: `'tumbler'` 는 형태로 안 읽혀서 `water bottle` 로 바꿨다.
    """
    banned = {"stand", "decoration", "prop", "accessory", "item", "object", "thing"}
    for korean, entry in DERO_CATEGORY_WORDS.items():
        if entry.word is None:
            continue
        assert entry.word.lower() not in banned, f"{korean} → {entry.word}"


def test_every_entry_that_is_blank_explains_itself():
    for korean, entry in DERO_CATEGORY_WORDS.items():
        if entry.word is None:
            assert entry.note, korean
