"""제품을 책상 위/바닥으로 가른다 (2026-08-05).

## 왜

프롬프트가 제품 목록 전체에 `on the desk:` 를 붙이고 있었다. 그런데 큐로 오는
`productNames` 에는 **의자·러그·서랍장처럼 바닥에 있는 것**이 섞여 온다. 결과가
"책상 위의 의자" 를 요구하는 틀린 지시였다.
"""

from __future__ import annotations

import pytest

from app.generation.placement import ON_FLOOR_CODES, is_floor_item, split_by_placement


@pytest.mark.parametrize(
    "name",
    ["의자", "컴퓨터의자", "white mesh office chair", "office chair", "러그", "rug",
     "서랍장", "drawer unit", "휴지통", "trash can", "발받침", "footrest"],
)
def test_floor_items_are_recognised_in_both_languages(name: str):
    """큐는 한국어 이름(`"의자"`)을 주고 CLI 는 영어 구절을 준다. 둘 다 받아야 한다."""
    assert is_floor_item(name), name


@pytest.mark.parametrize(
    "name",
    ["모니터", "monitor with a dark powered-off screen", "키보드", "white keyboard",
     "마우스", "condenser microphone on a shock mount", "mint green desk organiser",
     "white gooseneck desk lamp"],
)
def test_desk_items_are_not_moved_to_the_floor(name: str):
    assert not is_floor_item(name), name


def test_an_unknown_name_stays_on_the_desk():
    """모르는 이름은 책상으로 둔다 — 데스크테리어 제품의 대다수가 책상 위다.

    바닥으로 잘못 보내면 그 제품이 화면 아래쪽에 그려지려 해서 배치가 어긋난다.
    책상으로 두면 최악의 경우 지금과 같다.
    """
    assert not is_floor_item("르메이어 20W 무선충전기")


def test_split_preserves_the_given_order_within_each_group():
    """순서가 바뀌면 예산에 걸려 잘리는 대상이 달라진다 — 무엇이 잘렸는지 예측할 수 없게 된다."""
    names = ["모니터", "의자", "키보드", "러그", "마우스"]

    desk, floor, wall = split_by_placement(names)

    assert desk == ["모니터", "키보드", "마우스"]
    assert floor == ["의자", "러그"]
    assert wall == []


def test_split_handles_an_empty_list():
    assert split_by_placement([]) == ([], [], [])


def test_wall_items_get_their_own_group():
    """타공판을 `on the desk` 라고 하면 모델이 상판에 눕혀 놓는다."""
    desk, floor, wall = split_by_placement(["monitor", "perforated pegboard", "office chair"])

    assert desk == ["monitor"]
    assert floor == ["office chair"]
    assert wall == ["perforated pegboard"]


def test_a_monitor_arm_is_not_a_floor_item_despite_the_word_stand():
    """'스탠드' 가 든 이름이 바닥으로 가면 안 된다 — 모니터암·조명 스탠드는 책상 위다."""
    assert not is_floor_item("모니터암")
    assert not is_floor_item("무선 충전 스탠드")


def test_the_floor_code_table_is_not_empty():
    """표가 비면 이 기능이 조용히 꺼진다 — 전부 책상으로 가고 아무 에러도 안 난다."""
    assert ON_FLOOR_CODES
