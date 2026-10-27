"""책상 재질 → 장면 분위기(팔레트·배경 소품·조명).

## 왜 재질이 분위기를 정하는가

사용자가 시뮬레이터에서 고른 것 중 **방 전체의 톤을 정하는 가장 강한 단서**가 책상
재질이다. 화이트 책상 방과 월넛 책상 방은 벽 색·바닥·소품이 다 다르다. 그런데
2026-08-02 까지 이 값은 큐 메시지에 실려 워커까지 와서 **그대로 버려졌다** —
`runner._to_request` 가 프롬프트로 넘기지 않았다.

## 왜 팔레트만이 아니라 소품과 조명까지 묶는가

팔레트만 바꾸면 배경이 따로 논다. 웜 우드 톤인데 벽에 크롬 선반이 붙으면 한 장면으로
읽히지 않는다. 셋을 한 덩어리로 두면 어느 재질이든 장면이 일관되게 나온다.

## 왜 "cozy" 같은 형용사가 아니라 명사인가

CLIP 은 형용사로 물건을 만들지 않는다. `pegboard`·`area rug`·`framed print` 처럼
**명사**가 있어야 그 물건이 나타난다. 실측(2026-08-02): 배경 연출 문장을 넣은 뒤
평탄 92.1% → 80.9% 로 내려갔고 바닥결·걸레받이·러그·콘센트가 생겼다.

## 표에 없는 재질

`product_categories.py` 와 같은 판단이다. 카탈로그는 늘어나고 표는 뒤처진다. 모르는
이름은 중립 분위기로 떨어뜨리되 `unverified` 로 보고해서 표를 채울 근거를 남긴다 —
정보가 조용히 사라지는 것이 가장 나쁘다.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class SceneMood:
    """한 재질이 정하는 장면. 세 항목이 프롬프트에 그대로 실린다."""

    #: 벽·바닥·전반 색조.
    palette: str
    #: 배경에 놓을 **물건**. 쉼표로 나열하고 셋 이상이어야 한다(형용사로는 안 생긴다).
    decor: str
    #: 광원과 색온도. **프롬프트의 유일한 조명 출처다** (2026-08-05).
    #:
    #: 낮/밤 x 조명 ON/OFF 문장을 지운 뒤(prompt_builder 의 `_ENVIRONMENT` 주석) 조명을
    #: 말하는 문장이 여기 하나만 남았다. 그래서 **다섯 무드 전부 낮이어야 한다** — 어두운
    #: 조명을 적으면 그것이 유일한 지시가 되어 방 전체가 어두워지고, 같은 표의 배경 장식
    #: (창·커튼·햇빛 받는 바닥)과 어긋난다. walnut 의 "evening mood" 와 black 의
    #: "dim moody light ... deep falloff into shadow" 를 그래서 낮으로 바꿨다.
    #:
    #: 어두운 상상도가 필요해지면 여기가 아니라 **캡처**를 어둡게 찍어야 한다 —
    #: 조명은 캡처에 구워져 와야 반영된다(FINDINGS §1.1).
    lighting: str


#: 중립 분위기. 모르는 재질이 와도 배경이 비어버리지 않게 한다.
NEUTRAL = SceneMood(
    palette="soft off-white painted walls, light oak floor, muted neutral tones",
    decor=(
        "a framed art print on the wall, a small potted plant, a woven area rug, "
        "a floating shelf with a few books, painted baseboard"
    ),
    lighting="soft diffused daylight from the side, gentle warm fill, natural falloff",
)

DESK_MOODS: dict[str, SceneMood] = {
    "oak": SceneMood(
        palette="warm cream painted walls, honey oak floor, beige and off-white palette",
        decor=(
            "a perforated pegboard with small stationery, a framed botanical print, "
            "a trailing plant in a hanging pot, a woven jute rug, a rattan basket, "
            "painted baseboard"
        ),
        lighting="warm 3000K lamp light pooling on the desktop, soft daylight from a window",
    ),
    "walnut": SceneMood(
        palette="deep walnut floor, warm taupe walls, rich brown and amber palette",
        decor=(
            "a dark wood floating shelf with hardcover books, a brass framed print, "
            "a large monstera in a ceramic pot, a wool kilim rug, painted baseboard"
        ),
        lighting="warm afternoon daylight, amber bounce off the walnut, long soft shadows",
    ),
    "white": SceneMood(
        palette="bright white walls, pale grey floor, clean white and light grey palette",
        decor=(
            "a white perforated pegboard with minimal accessories, a thin black framed print, "
            "a single eucalyptus stem in a glass vase, a flat woven light grey rug, "
            "sheer white curtains, painted baseboard"
        ),
        lighting="bright soft daylight, low contrast, clean neutral 4500K fill",
    ),
    "black": SceneMood(
        palette="charcoal walls, dark grey floor, matte black and graphite palette",
        decor=(
            "a matte black wall shelf, a dark framed poster, a snake plant in a black pot, "
            "a low pile dark rug, a coiled black cable, painted baseboard"
        ),
        lighting="cool soft daylight, crisp shadows on the charcoal, clean 5000K fill",
    ),
    "wood": SceneMood(
        palette="natural wood tones, warm sand walls, light timber floor",
        decor=(
            "an unfinished wood shelf, a linen framed print, a fern in a terracotta pot, "
            "a braided rug, a stack of magazines, painted baseboard"
        ),
        lighting="warm afternoon daylight, soft warm bounce off the timber",
    ),
}

#: 운영 DB 의 `desk_texture.name` 은 한국어다 — 로컬 시드만 영어다. 두 표기를 다 받는다.
#: 표기가 늘면 여기에 넣는다. 못 찾으면 NEUTRAL 로 가고 `unverified` 로 보고된다.
_ALIASES: dict[str, str] = {
    "오크": "oak",
    "화이트오크": "oak",
    "월넛": "walnut",
    "호두나무": "walnut",
    "화이트": "white",
    "백색": "white",
    "블랙": "black",
    "검정": "black",
    "원목": "wood",
    "우드": "wood",
    "내추럴": "wood",
}


@dataclass(frozen=True)
class ResolvedMood:
    mood: SceneMood
    #: 표에 없어서 중립으로 떨어진 원래 이름. `None` 이면 표에서 찾았거나 값이 없었다.
    unverified: str | None


def resolve_desk_mood(desk_texture: str | None) -> ResolvedMood:
    """재질 이름을 장면 분위기로 푼다. **못 찾아도 분위기는 돌려준다.**

    부분 일치까지 본다 — 카탈로그 이름이 "화이트 오크 무광" 처럼 수식어를 달고 오는데,
    정확히 일치할 때만 찾으면 표에 있는 재질도 매번 중립으로 떨어진다.
    """
    if not desk_texture or not desk_texture.strip():
        return ResolvedMood(NEUTRAL, None)

    raw = desk_texture.strip()
    key = raw.lower()

    if key in DESK_MOODS:
        return ResolvedMood(DESK_MOODS[key], None)
    if raw in _ALIASES:
        return ResolvedMood(DESK_MOODS[_ALIASES[raw]], None)

    # 부분 일치. 긴 별칭을 먼저 봐서 "화이트오크" 가 "화이트" 로 잡히지 않게 한다.
    for alias in sorted(_ALIASES, key=len, reverse=True):
        if alias in raw:
            return ResolvedMood(DESK_MOODS[_ALIASES[alias]], None)
    for name in sorted(DESK_MOODS, key=len, reverse=True):
        if name in key:
            return ResolvedMood(DESK_MOODS[name], None)

    return ResolvedMood(NEUTRAL, raw)
