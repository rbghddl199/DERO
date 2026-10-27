"""DERO 카테고리 트리 → CLIP 이 읽는 영어 명사 + 놓이는 자리 (2026-08-05).

## 왜 이 표가 필요한가

큐 메시지는 제품 **이름**을 한국어로 준다(`"모니터"`, `queue/schemas.py`). 그런데 SDXL 의
CLIP 은 영어로 학습돼서 한국어가 **바이트 조각으로 부서진다** — 실측:

```text
모니터   6 tok  ['ëª','¨','ëĭĪ','í','Ħ','°']     의미 없음
monitor  1 tok  ['monitor']
```

의미는 안 실리고 토큰만 5~6배를 먹는다. 즉 지금 운영 큐로 오는 제품 이름은 프롬프트에서
**일하지 않으면서 예산만 잡아먹고 있다.**

카테고리는 유한하고 사람이 정한 것이라 표로 옮길 수 있다. 이 파일이 그 표다.

## 직역하지 않는다

기준은 이 저장소가 이미 실측으로 적어 둔 것이다(`product_categories.py`):

> `'tumbler'` 는 CLIP 에서 형태로 안 읽힌다 (2026-08-01 실측). 같은 실루엣의 **더 쉬운
> 이름**이 낫다 → `water bottle`

그래서 사전적 번역이 아니라 **실루엣이 읽히는 흔한 명사**를 고른다. `장식` 을
`decoration` 으로 옮기면 모델은 아무것도 못 그린다 — 그런 항목은 **비워 둔다.**

## 비워 둔 것을 조용히 넘기지 않는다

`product_sort.py` 와 같은 규칙이다: 옮길 명사가 마땅치 않으면 비우고 **보고한다.** 억지로
채우면 `photo of a decoration` 같은 프롬프트가 조용히 나간다.

## 자리(placement)를 같이 둔다

`placement.py` 는 이름 낱말로 책상/바닥을 **추측**한다. 카테고리가 오면 그게 **사실**이
된다. 벽을 따로 둔 이유는 타공판·액자가 벽에 걸리기 때문이다 — 책상 위라고 하면 모델이
상판에 눕혀 놓는다.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class Placement(Enum):
    DESK = "desk"
    FLOOR = "floor"
    WALL = "wall"


@dataclass(frozen=True)
class CategoryWord:
    #: CLIP 이 형태로 읽는 영어 명사. **None 이면 옮기지 못한 것**이고 보고 대상이다.
    word: str | None
    placement: Placement = Placement.DESK
    #: 왜 이 단어인지 / 왜 비웠는지.
    note: str = ""


#: 중간 계층(및 자식 없는 루트) 이름 → 영어 명사.
#:
#: 키는 **화면에 보이는 그대로**의 한국어다. 공백만 지워 비교한다(`resolve` 참고) —
#: `헤드폰 거치대` 와 `헤드폰거치대` 가 같아야 한다.
DERO_CATEGORY_WORDS: dict[str, CategoryWord] = {
    # --- 모니터 · 모니터암 (자식 없음) ---
    "모니터·모니터암": CategoryWord("monitor", note="루트에 제품이 직접 붙는 경우"),
    "모니터": CategoryWord("monitor"),
    "모니터암": CategoryWord("monitor arm"),
    # --- 키보드 · 마우스 ---
    "키보드·마우스": CategoryWord("keyboard"),
    "키보드": CategoryWord("mechanical keyboard", note="'keyboard' 만으로도 읽히지만 키캡 격자가 더 선명해진다"),
    "마우스": CategoryWord("computer mouse", note="'mouse' 단독은 동물로 읽힌다"),
    "마우스패드": CategoryWord("mouse pad"),
    "팜레스트": CategoryWord("padded wrist rest", note="'palm rest' 는 노트북 부위로도 읽힌다"),
    # --- 음향 ---
    "음향": CategoryWord("desktop speaker"),
    "헤드폰": CategoryWord("headphones"),
    "스피커": CategoryWord("desktop speaker", note="'speaker' 단독은 사람(연설자)으로도 읽힌다"),
    "마이크": CategoryWord("condenser microphone", note="'microphone' 만으로는 핸드마이크가 나온다"),
    "레코드": CategoryWord(
        None,
        note="'레코드' 가 LP 판인지 턴테이블인지 정해지지 않는다. 실제 제품을 보고 "
        "'vinyl record' / 'record player' 중에 고를 것",
    ),
    # --- 식물 ---
    "식물": CategoryWord("potted plant"),
    # --- 정리 · 거치 ---
    "정리·거치": CategoryWord("desk organiser"),
    "거치대": CategoryWord(
        None,
        note="무엇을 거치하는지가 빠져 있다. 소품 하위의 '헤드폰 거치대'·'노트북 거치대' "
        "처럼 대상이 붙어야 실루엣이 정해진다",
    ),
    "타공판": CategoryWord("perforated pegboard", placement=Placement.WALL),
    "파티션": CategoryWord("desk privacy panel", note="'partition' 단독은 사무실 칸막이가 나온다"),
    "수납": CategoryWord("storage box"),
    # --- 소품 ---
    "소품": CategoryWord(None, note="무엇이든 될 수 있다. 하위 항목이 실제 단어를 준다"),
    "헤드폰거치대": CategoryWord("headphone stand"),
    "노트북거치대": CategoryWord("laptop stand"),
    "휴대폰거치대": CategoryWord("phone stand"),
    "모니터받침대": CategoryWord("monitor riser"),
    "케이블정리": CategoryWord("cable organiser"),
    "머그": CategoryWord("ceramic mug"),
    "보틀": CategoryWord("water bottle", note="`product_categories.TUMBLER` 와 같은 이유"),
    "데코": CategoryWord(None, note="상위 '데코' 와 같은 이유로 비운다"),
    "시계": CategoryWord("desk clock"),
    # --- 데코 ---
    "디퓨저·캔들": CategoryWord("reed diffuser bottle", note="캔들과 한 칸이라 둘 중 실루엣이 뚜렷한 쪽"),
    "인형·피규어": CategoryWord("small figurine"),
    "러그·카펫": CategoryWord("area rug", placement=Placement.FLOOR),
    "컵": CategoryWord("ceramic mug", note="'머그' 와 같은 실루엣이다"),
    "장식": CategoryWord(None, note="옮길 명사가 없다. 억지로 채우면 아무것도 안 그려진다"),
    # --- 의자 ---
    "의자": CategoryWord("office chair", placement=Placement.FLOOR),
    "발받침": CategoryWord("footrest", placement=Placement.FLOOR),
    # --- 조명 (자식 없음) ---
    "조명": CategoryWord("desk lamp"),
    # --- 기타 ---
    "데스크톱": CategoryWord("desktop PC tower", placement=Placement.FLOOR,
                          note="타워는 보통 바닥이나 책상 아래다"),
    "독·허브": CategoryWord("USB hub"),
    "태블릿PC": CategoryWord("tablet on a stand", note="'tablet' 단독은 약(정제)으로도 읽힌다"),
    "게임기": CategoryWord("game console"),
    "기타": CategoryWord(None, note="이름 그대로 미분류다"),
}


def _normalize(name: str) -> str:
    """공백만 지운다. `헤드폰 거치대` 와 `헤드폰거치대` 가 같아야 한다.

    `product_sort.normalize` 와 같은 규칙이다 — 표기가 소스마다 다르게 들어온다.
    """
    return "".join(name.split())


def resolve(category_name: str) -> CategoryWord | None:
    """카테고리 이름 → 영어 명사. 표에 없으면 None.

    표에 있지만 `word` 가 None 인 것과 **표에 아예 없는 것**을 구별한다 — 전자는 "옮길 수
    없다고 사람이 판단한 것" 이고 후자는 "표가 낡았다" 다. 호출부가 다르게 보고해야 한다.
    """
    return DERO_CATEGORY_WORDS.get(_normalize(category_name))


#: 같은 이름이 두 곳에 있는 카테고리. **트리가 중복이라는 사실을 기록한다.**
#:
#: 화면에서 확인한 것 (2026-08-05):
#:
#: ```text
#: 시계    소품 · 데코 양쪽에 있다
#: 식물    루트 · 소품 양쪽에 있다
#: 데코    루트이면서 소품의 자식이기도 하다
#: 머그/컵 소품의 '머그' 와 데코의 '컵' 이 같은 물건이다
#: ```
#:
#: 이 표는 **이름으로 조회**하므로 중복이 문제되지 않는다(어느 부모든 같은 단어로 간다).
#: 다만 배치가 갈리는 경우가 생기면 그때는 부모까지 봐야 한다 — 지금은 없다.
KNOWN_DUPLICATES = ("시계", "식물", "데코", "머그", "컵")
