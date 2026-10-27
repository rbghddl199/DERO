"""제품이 **책상 위인가 바닥인가** (2026-08-05).

## 왜 필요한가

프롬프트가 제품 목록 전체에 `on the desk:` 를 붙이고 있었다. 그런데 큐로 오는
`productNames` 에는 의자·러그·서랍장이 섞여 오므로 결과가 이랬다:

```text
on the desk: monitor ..., white mesh office chair, white keyboard, ...
                          ^^^^^^^^^^^^^^^^^^^^^^ 의자는 책상 위에 없다
```

CLIP 은 위치 관계를 약하게 읽어서 치명적이진 않지만, 모델에게 **틀린 사실**을 주는 것이다.
test8 결과에서 의자가 제대로 바닥에 있었던 것은 ControlNet 이 붙든 것이고 프롬프트가 도운
것이 아니다.

덤으로 하나 더 풀린다: 배경 장식 문장(`in the room: ... a flat woven light grey rug ...`)과
제품 목록에 **같은 물건이 다르게** 들어가 두 개가 생길 수 있었다. 러그가 바닥 쪽으로 가면
그 충돌이 한 문장 안에서 정리된다.

## 이름으로 판정한다 — 코드가 아니다

큐 메시지는 카테고리 코드가 아니라 **제품 이름**을 준다(`"모니터"`, `schemas.py`).
CLI 는 영어 구절을 준다(`"white mesh office chair"`). 그래서 두 표기를 다 받는다.

**모르는 이름은 책상으로 둔다.** 데스크테리어 제품의 대다수가 책상 위이고, 바닥으로 잘못
보내면 그 제품이 화면 아래쪽에 그려지려 해서 배치가 어긋난다. 책상으로 두면 최악의 경우가
지금과 같다 — 틀리는 방향을 고른 것이다.

**낱말 순서가 규칙이다: 좁은 것이 위에 온다.** `product_sort.KEYWORD_CATEGORIES` 와 같은
이유다 — `모니터암`·`무선 충전 스탠드` 가 '스탠드' 때문에 바닥으로 가면 안 된다.
"""

from __future__ import annotations

#: 바닥(또는 벽)에 있는 카테고리 코드. `product_categories.py` 의 코드와 같은 이름을 쓴다.
ON_FLOOR_CODES = frozenset(
    {
        "CHAIR",
        "RUG",
        "DRAWER_UNIT",
        "TRASH_CAN",
        "FOOTREST",
        "PARTITION",
        "DESK",  # 책상 자체는 "책상 위" 가 아니다
    }
)

#: 바닥 물건임을 알리는 낱말. **좁은 것이 위에 온다** — 위 모듈 주석 참고.
#: 한국어와 영어를 같이 둔다: 큐는 한국어 이름, CLI 는 영어 구절을 준다.
_FLOOR_KEYWORDS: tuple[str, ...] = (
    # 의자
    "의자",
    "체어",
    "chair",
    "stool",
    # 바닥 깔개
    "러그",
    "카펫",
    "rug",
    "carpet",
    # 수납 가구 (책상 위 정리함과 구별된다 — '정리함' 은 여기 없다)
    "서랍장",
    "이동장",
    "drawer unit",
    "filing cabinet",
    "cabinet",
    # 발·다리
    "발받침",
    "풋레스트",
    "footrest",
    "foot rest",
    # 그 외 바닥/큰 것
    "휴지통",
    "쓰레기통",
    "trash can",
    "waste bin",
    "파티션",
    "partition",
    # dero_categories 가 내는 영어 명사 (카테고리 → 영어 변환 뒤에 이 판정을 탄다)
    "pc tower",
    "desktop pc",
    "area rug",
    "책상",
    "데스크테이블",
    "desk frame",
)

#: 위 낱말이 들어 있어도 **책상 위**인 예외. 부분 문자열 판정의 함정을 막는다.
#:
#: 예: `모니터암` 은 '암' 이 아니라 '모니터암' 으로 걸러야 하고, 영어 `desk lamp` 에는
#: 'desk' 가 들어 있어 `책상` 계열 낱말과 충돌한다. 그래서 예외를 먼저 본다.
_DESK_EXCEPTIONS: tuple[str, ...] = (
    "모니터암",
    "모니터 암",
    "모니터받침대",
    "모니터 받침대",
    "데스크매트",
    "데스크 매트",
    "데스크패드",
    "데스크 패드",
    "데스크테리어",
    "desk lamp",
    "desk organiser",
    "desk organizer",
    "desk mat",
    "desk pad",
    "desk shelf",
    "monitor arm",
    "monitor stand",
    "cable organiser",
    "cable organizer",
)


def _normalize(name: str) -> str:
    """비교용. 소문자로 낮추고 공백을 줄인다 — 크롤링 이름의 공백이 일정하지 않다."""
    return " ".join(name.lower().split())


def is_floor_item(name: str) -> bool:
    """이 제품이 바닥(또는 벽)에 있는가. 모르면 False = 책상 위."""
    text = _normalize(name)
    if any(exception in text for exception in _DESK_EXCEPTIONS):
        return False
    return any(keyword in text for keyword in _FLOOR_KEYWORDS)


#: 벽에 걸리는 것. **책상 위라고 하면 모델이 상판에 눕혀 놓는다.**
#:
#: `dero_categories` 는 이것을 `Placement.WALL` 로 갖고 있지만, 이 함수는 카테고리가 아니라
#: **영어 명사**를 받는다(변환 뒤에 탄다). 그래서 그 단어들을 여기서 다시 알아본다 —
#: 표를 두 곳에 두는 대신 `dero_categories` 에서 끌어와 어긋나지 않게 한다.
def _wall_words() -> frozenset[str]:
    from app.generation.dero_categories import DERO_CATEGORY_WORDS, Placement

    return frozenset(
        entry.word.lower()
        for entry in DERO_CATEGORY_WORDS.values()
        if entry.word and entry.placement is Placement.WALL
    )


def is_wall_item(name: str) -> bool:
    text = _normalize(name)
    return any(word in text for word in _wall_words())


def split_by_placement(
    names: list[str] | tuple[str, ...],
) -> tuple[list[str], list[str], list[str]]:
    """`(책상 위, 바닥, 벽)`. **각 묶음 안의 순서는 준 그대로 둔다.**

    순서가 바뀌면 토큰 예산에 걸려 잘리는 대상이 달라져서, 무엇이 잘렸는지 예측할 수 없다.
    """
    desk: list[str] = []
    floor: list[str] = []
    wall: list[str] = []
    for name in names:
        if is_wall_item(name):
            wall.append(name)
        elif is_floor_item(name):
            floor.append(name)
        else:
            desk.append(name)
    return desk, floor, wall
