"""PromptBuilder (새 지시문 §6~§10).

§6 이 요구한 5개 빌더를 그대로 나눴다.

```text
build_base_prompt()          §7  공통 실사 프롬프트
build_environment_prompt()   §8  조명 — 책상 무드에서 온다 (낮/밤 문장은 2026-08-05 삭제)
build_mood_prompt()          §9  무드 5종
build_structure_prompt()     구조 보존
build_negative_prompt()      §10 full / compact
```

## 왜 §7 어휘를 그대로 쓰지 않는가 (DESIGN_GAP_REPORT P2-5)

실제 SDXL 토크나이저로 측정한 결과:

```text
§7 공통 실사 프롬프트만            85 토큰   ← 한도 75 를 이미 초과
§7 + §8 + §9 + 구조 보존         156 토큰   ← 한도의 2.1배, 절반이 잘려나간다
§10 네거티브 full                128 토큰
§10 네거티브 compact              44 토큰
```

CLIP 은 77 토큰까지만 본다. 그대로 쓰면 뒤쪽 절반 — 조명 상태와 배치 보존 지시 — 이
경고 한 줄과 함께 조용히 사라진다. 그래서 §7 의 어휘를 **뜻이 남는 범위로 압축**하고,
문장마다 우선순위를 매겨 예산을 넘으면 낮은 우선순위부터 버리며 무엇을 버렸는지 보고한다.

우선순위: 구조 보존(필수) > 조명 상태 > 실사 어휘 > 사용자 무드/제품 정보 > 일반 수식어.
§8 의 "조명 상태가 먼저 적용된 캡처를 입력으로 쓴다" 원칙 때문에 조명 문장은 프롬프트가
새로 만드는 것이 아니라 입력에 이미 있는 것을 "유지·강화"하는 역할이다.

## §7 이 경계한 표현

"ultra realistic", "masterpiece", "best quality", "cinematic" 은 쓰지 않는다.
실제 인테리어 사진 어휘를 우선한다.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from app.core.config import MOOD_ALIASES, Settings
from app.generation.desk_moods import resolve_desk_mood
from app.generation.localize import localize_products
from app.generation.placement import split_by_placement
from app.generation.product_categories import ProductPlacement, ResolvedProducts
from app.generation.product_categories import resolve as resolve_categories
from app.generation.schemas import GenerationRequest

#: CLIP 한도 77 에서 BOS/EOS 2개를 뺀 내용 예산.
BUDGET_TOKENS = 75

#: 이 우선순위의 문장은 예산과 무관하게 항상 남는다.
MANDATORY_PRIORITY = 0

#: 제품 이름 개수의 **폭주 방지 상한**. 실제 한도는 토큰 예산이고, 압축된 문장 기준으로
#: 보통 6~7개에서 예산이 먼저 걸린다. 카테고리 20종이 다 와도 여기서 멈춘다.
#:
#: 이름을 부르는 이유는 **목록에서 빠진 물건이 다른 카테고리의 물건이 되기** 때문이다
#: (2026-08-01 실측). 자세한 근거는 product_categories.py.
MAX_PRODUCT_WORDS = 8

#: 토크나이저 없이 문장을 고를 때 쓰는 근사 (실측 대비 약 15% 과대평가 → 안전한 방향).
_TOKENS_PER_WORD = 1.35

TokenCounter = Callable[[str], int]


@dataclass(frozen=True)
class _Part:
    text: str
    priority: int  # 낮을수록 먼저 지킨다


@dataclass(frozen=True)
class _Products:
    """길이가 토큰 예산에 따라 달라지는 문장.

    다른 문장은 예산을 넘기면 통째로 버리지만, 제품 목록은 **단어 단위로** 줄인다.
    이름 하나가 더 들어가면 그만큼 카테고리 오류가 줄어들기 때문에, 문장을 통째로
    버리는 것보다 짧게라도 넣는 편이 낫다.
    """

    words: tuple[str, ...]
    priority: int


def _product_sentence(words: list[str] | tuple[str, ...]) -> str:
    """제품 목록 문장. **책상 위와 바닥을 갈라서** 두 문장으로 낸다 (2026-08-05).

    이전에는 전부 `on the desk:` 였다. 그런데 큐로 오는 `productNames` 에는 의자·러그·
    서랍장이 섞여 와서 "책상 위의 의자" 라는 **틀린 사실**을 모델에게 주고 있었다
    (`app/generation/placement.py`).

    한 함수에서 두 문장을 만드는 이유: `_fit_products` 가 이 함수를 예산 계산에 쓴다.
    문장을 따로 만들면 예산 계산이 두 곳으로 갈라져 한쪽만 고쳤을 때 조용히 넘친다.
    """
    if not words:
        return ""
    desk, floor, wall = split_by_placement(words)
    parts = []
    if desk:
        parts.append(f"on the desk: {', '.join(desk)}.")
    if floor:
        # `in the room:` 을 쓰지 않는다 — 배경 장식 문장이 이미 그 접두사를 쓰고 있어서
        # 두 문장이 한 목록처럼 읽힌다.
        parts.append(f"on the floor: {', '.join(floor)}.")
    if wall:
        # 타공판·액자를 책상 위라고 하면 모델이 상판에 눕혀 놓는다.
        parts.append(f"on the wall behind the desk: {', '.join(wall)}.")
    return " ".join(parts)


def resolve_products(request: GenerationRequest) -> ResolvedProducts:
    """요청에서 제품 이름 후보를 뽑는다.

    `productCategories` 가 서비스 경로이고, `productSummary` 는 CLI 실험용 구 경로다.
    둘이 같이 오면 카테고리를 쓴다 — 두 곳에서 제품을 정하면 응답만 보고 어느 쪽이
    이겼는지 알 수 없다.
    """
    if request.product_categories:
        return resolve_categories(
            [
                ProductPlacement(item.code, item.screen_area_percent)
                for item in request.product_categories
            ]
        )
    # 구 경로는 면적 정보가 없다. 준 순서를 그대로 존중한다.
    #
    # **한국어 이름은 여기서 영어로 옮긴다.** 큐가 주는 것은 한국어 제품/카테고리 이름인데
    # (`queue/schemas.py`), SDXL 의 CLIP 은 영어로 학습돼서 한국어가 바이트 조각으로
    # 부서진다 — `모니터` 가 6토큰이고 뜻이 없다(실측). 옮기지 못한 이름은 **버린다**:
    # 그 자리에 뜻이 실리는 이름 하나가 더 들어가는 편이 낫다. 버린 것은 보고한다.
    words, untranslatable = localize_products(request.product_summary)
    return ResolvedProducts(words=words, too_small=(), unverified=untranslatable)


def estimate_tokens(text: str) -> int:
    """CLIP 토큰 수 어림값. 실제 토크나이저가 없을 때만 쓴다."""
    punctuation = sum(text.count(mark) for mark in ".,:")
    return int(len(text.split()) * _TOKENS_PER_WORD) + punctuation


# --- §7 공통 실사 프롬프트 (압축) ------------------------------------------
# 원문 85 토큰 → 아래 2문장 합계 22 토큰. 남긴 개념:
# 실내 사진 / 실제 방 / 자연 재질 / 물리적으로 그럴듯한 조명 / 접지 그림자 /
# 자연스러운 노출.
#
# 2026-08-01: 원래 3문장(30토큰)이었으나 제품 목록에 자리를 내주려고 더 줄였다.
# - "of a real desk in a real room" → "of a real room": 책상은 제품 문장과 구조 문장이
#   이미 말하고 있어 중복이었다.
# - 4순위·5순위 두 문장을 하나로 합쳤다. 나뉘어 있으면 예산이 빠듯할 때 둘 중 하나가
#   통째로 탈락하는데, 실측상 탈락하는 쪽이 매번 달라져 결과를 재현하기 어려웠다.
#
# 우선순위 주의: base1 만 1순위이고 나머지는 사용자가 고른 상태(조명 색·무드·제품)보다 뒤다.
# 일반 수식어를 지키려고 사용자 선택을 버리면 프롬프트가 입력에 반응하지 않게 된다.
_BASE_PARTS = (
    _Part("photorealistic interior photo of a real room.", 1),
    _Part("natural materials, plausible lighting, contact shadows, realistic exposure.", 4),
)

# --- 사진 어휘 (2026-08-02, 청킹으로 예산이 열린 뒤 추가) --------------------
#
# 위 압축본은 77 토큰 예산 아래에서 "뜻만 남긴" 것이다. 청킹(long_prompt.py) 이후
# 자리가 있으므로 실제 사진 어휘를 되살린다. 목표는 레퍼런스 두 장(웜 미니멀 / 블루
# 게이밍)이고, 실측 격차는 **평탄 47~60% · 채도 34~44%** (타깃) 대 **87% · 12%**
# (strength 0.9 현재)다. 그 격차는 강도가 아니라 **묘사할 것이 없음**에서 온다.
#
# 우선순위는 3 — 조명 상태(0)·기본 실사(1)·사용자 선택(2) 뒤이고, 압축본(4) 앞이다.
_PHOTO_PARTS = (
    # 카메라. 렌즈·조리개·그레인이 "렌더가 아니라 찍은 것"을 만드는 가장 강한 신호다.
    _Part("shot on 35mm lens at f/2.8, shallow depth of field, natural vignette, "
          "fine film grain.", 3),
    # 재질. 실제 물건에는 먼지·미세 스크래치·지문이 있다 — 없으면 플라스틱으로 읽힌다.
    _Part("matte laminate desktop, brushed aluminium, ceramic glaze, natural wood grain, "
          "woven fabric, real dust and micro-scratches, fingerprint smudges.", 3),
    # 음영. 워커가 실사화 가능 여부를 재는 지표(local std)가 바로 이 항목이다.
    _Part("soft contact shadows under every object, ambient occlusion in corners, "
          "light falloff across the wall, realistic exposure with gentle highlight rolloff.", 3),
)

# --- §8 조건별 프롬프트 (압축) ---------------------------------------------
# DAY/ON 의 "daylight plus" 와 NIGHT/OFF 의 "but visible" 은 2026-08-01 에 뺐다.
# 앞의 "daytime"/"dark" 와 겹치는데, 그 4토큰이 없으면 제품 6개가 예산에 안 들어간다.
# 밝기는 어차피 프롬프트가 아니라 입력 캡처가 정한다 (SIMULATOR_CAPTURE_SPEC §1.2).
# 낮/밤 x 조명 ON/OFF 문장 표가 여기 있었다. **지웠다** (2026-08-05).
#
# 그 문장과 무드 조명(`desk_moods`)이 같은 프롬프트에 들어가 서로 모순됐다. NIGHT 로 요청한
# 실사화의 프롬프트가 이랬다(실측, outputs/t7-night-s075):
#
#     앞: "nighttime, lights off, dark low-light photo."
#     뒤: "warm afternoon daylight, soft warm bounce off the timber."
#
# CLIP 은 부정도 우선순위도 표현하지 못하므로(FINDINGS §1.4) 이 모순을 풀 방법이 없다.
# 그리고 애초에 **조명은 캡처에 구워져 와야 반영된다**(FINDINGS §1.1) — 프롬프트로 밤을
# 만들려는 시도 자체가 이미 실패로 측정돼 있었다. 그래서 낮/밤 쪽을 지우고 무드 조명 하나만
# 남겼다. 무드 조명은 배경 장식(벽·바닥·소품)과 같은 표에서 나오므로 서로 어긋나지 않는다.
#
# `timeOfDay` / `roomLightOn` 필드는 스키마에 그대로 둔다 — 백엔드가 보내고 있고, 나중에
# 캡처 단계(시뮬레이터 조명)로 넘길 값이다. 지금은 **프롬프트에 영향을 주지 않는다.**

# --- §9 무드별 프롬프트 (압축) ---------------------------------------------
# "controlled saturation" / "subtle accent" 은 색이 필터처럼 덮이지 않게 하는 장치라
# 압축해도 유지한다 (§9 의 지시).
_MOOD = {
    "WHITE_MINIMAL": "white minimal desk, neutral materials.",
    "BLUE": "subtle cool blue accent, controlled saturation.",
    "PINK": "soft pink accent, controlled saturation.",
    "BLACK": "dark minimal desk, matte black accessories.",
    "WOOD": "natural wood desk texture, warm light.",
}

# 제품 조명 색을 CLIP 이 읽을 수 있는 단어로 바꾼다.
# "#6FA8FF" 같은 hex 는 토큰을 6개 이상 쓰면서 CLIP 이 색으로 해석하지도 못한다.
_COLOR_NAMES: tuple[tuple[tuple[int, int, int], str], ...] = (
    ((255, 255, 255), "white"),
    ((255, 214, 150), "warm white"),
    ((255, 80, 80), "red"),
    ((255, 150, 60), "orange"),
    ((255, 230, 90), "yellow"),
    ((110, 220, 120), "green"),
    ((90, 220, 220), "cyan"),
    ((110, 168, 255), "cool blue"),
    ((70, 90, 230), "blue"),
    ((170, 110, 230), "purple"),
    ((255, 130, 200), "pink"),
)


def color_name(hex_color: str) -> str:
    """가장 가까운 색 이름. RGB 유클리드 거리로 고른다."""
    value = hex_color.lstrip("#")
    rgb = (int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16))
    return min(
        _COLOR_NAMES,
        key=lambda entry: sum((a - b) ** 2 for a, b in zip(entry[0], rgb)),
    )[1]

# --- §10 네거티브 프롬프트 --------------------------------------------------
# full 은 실측 128 토큰이라 77 을 넘는다. 아래 순서가 곧 우선순위이며,
# CFG 가 켜진 프로필에서 예산을 넘으면 뒤쪽부터 버린다.
NEGATIVE_FULL = (
    "illustration, anime, cartoon, painting, concept art, 3d render, CGI, low poly, "
    "game asset, dollhouse, miniature, isometric, toy-like, plastic appearance, "
    "fake materials, overly smooth surfaces, excessive bloom, dreamy glow, "
    "fantasy lighting, neon color cast, oversaturated, surreal, unrealistic proportions, "
    "distorted furniture, warped monitor, bent screen, malformed keyboard, "
    "incorrect keyboard layout, extra monitor, duplicated objects, duplicated speakers, "
    "extra keyboard, extra mouse, floating objects, merged objects, "
    "broken furniture geometry, blurry, low detail, heavy noise, over-sharpened, overprocessed"
)
NEGATIVE_COMPACT = (
    "illustration, anime, cartoon, 3d render, CGI, miniature, toy-like, plastic materials, "
    "unrealistic furniture, warped monitor, malformed keyboard, duplicated objects, "
    "floating objects, blurry, oversaturated"
)


#: 두 문장의 단어 집합이 이 비율 이상 겹치면 같은 말로 본다.
_REDUNDANCY_THRESHOLD = 0.6


def _is_redundant(text: str, kept: list[_Part]) -> bool:
    words = {w.strip(".,:") for w in text.lower().split()}
    if not words:
        return True
    for part in kept:
        other = {w.strip(".,:") for w in part.text.lower().split()}
        overlap = len(words & other) / len(words)
        if overlap >= _REDUNDANCY_THRESHOLD:
            return True
    return False


class PromptBuilder:
    def __init__(self, settings: Settings, count_tokens: TokenCounter | None = None):
        self.settings = settings
        self.count_tokens = count_tokens or estimate_tokens

    @property
    def budget(self) -> int:
        """토큰 예산. 청킹을 쓰면 사실상 없다.

        `float("inf")` 대신 큰 정수를 쓴다 — 이 값은 정수 비교에만 쓰이고, inf 를
        넣으면 로그·예외 메시지에 섞였을 때 "예산 inf" 라는 읽기 나쁜 문구가 남는다.
        """
        return 1_000_000 if self.settings.enable_long_prompt else BUDGET_TOKENS

    # --- §6 의 5개 빌더 ---------------------------------------------------

    def build_base_prompt(self, request: GenerationRequest | None = None) -> list[_Part]:
        """압축본 + (청킹이 켜졌을 때만) 사진 어휘·재질 분위기.

        청킹이 꺼진 절단 경로에서는 압축본만 쓴다 — 사진 어휘를 얹으면 예산을 넘어
        우선순위가 낮은 제품 목록부터 밀려나고, 그건 제품이 다른 카테고리가 되는
        더 나쁜 실패다(product_categories.py).
        """
        parts = list(_BASE_PARTS)
        if not self.settings.enable_long_prompt:
            return parts
        parts.extend(_PHOTO_PARTS)
        if self.settings.enable_background_decor:
            # 배경은 **책상 재질이 정한 분위기**를 따른다 — 화이트 책상 방과 월넛 책상
            # 방은 벽·바닥·소품이 다 다르다. 재질을 무시하고 고정 문장을 쓰면 어떤
            # 배치든 같은 방이 되어, 사용자가 재질을 고른 의미가 사라진다.
            #
            # **이 문장들은 없는 물건을 만들어 넣는 지시다.** `REQUIREMENTS.md` 는
            # "제품이 삭제되거나 추가됨"을 실패로 규정하는데, 그 규정이 **책상 위 제품**을
            # 뜻하는지 **화면 전체**를 뜻하는지가 아직 갈리지 않았다. 책상 위는 ControlNet
            # 이 붙들고 있어 여기 적은 것들은 벽·바닥으로 간다(2026-08-02 실측: 러그·걸레
            # 받이·콘센트가 생기고 책상 위 6종은 유지됐다). 규정 문구 확정은 별도 결정이고,
            # 그때까지 `ENABLE_BACKGROUND_DECOR=false` 로 끌 수 있다.
            resolved = resolve_desk_mood(request.desk_texture if request else None)
            mood = resolved.mood
            parts.append(_Part(f"{mood.palette}.", 2))
            parts.append(_Part(f"in the room: {mood.decor}.", 3))
        return parts

    def build_environment_prompt(self, request: GenerationRequest) -> list[_Part]:
        """조명 = **무드 조명 하나**. 낮/밤 문장은 지웠다(위 `_ENVIRONMENT` 주석).

        무드 조명은 배경 장식 블록에 있었는데 여기로 옮겼다 — **조명은 장식이 아니다.**
        거기 두면 `ENABLE_BACKGROUND_DECOR=false` 로 껐을 때 조명 문구가 하나도 남지
        않는다. 낮/밤 문장을 지운 뒤에는 이것이 유일한 조명 출처다.
        """
        mood = resolve_desk_mood(request.desk_texture).mood
        parts = [_Part(f"{mood.lighting}.", 0)]
        glow = self._product_light_sentence(request)
        if glow:
            parts.append(_Part(glow, 2))
        return parts

    def build_mood_prompt(self, request: GenerationRequest) -> list[_Part]:
        seen: list[str] = []
        for raw in request.mood_tags:
            canonical = MOOD_ALIASES.get(raw.strip().upper())
            if canonical and canonical not in seen:
                seen.append(canonical)
        # 입력 순서를 유지한다 — 정렬하면 사용자가 의도한 우선순위가 사라진다.
        # 우선순위 2: 사용자가 고른 상태이므로 일반 실사 수식어보다 먼저 지킨다.
        return [_Part(_MOOD[name], 2) for name in seen]

    def build_structure_prompt(self, request: GenerationRequest) -> list[_Part]:
        """배치 보존. 우선순위 0 이라 어떤 경우에도 버려지지 않는다.

        제품 목록 문장은 여기에 없다 — 길이가 토큰 예산에 따라 달라져서 build() 가
        `_Products` 로 따로 넣는다.
        """
        parts = [_Part("keep object positions, count and camera angle.", 0)]
        if not self.settings.enable_long_prompt:
            # `do not add or remove products.` 는 **CLIP 에서 무효다.** bag-of-concepts 라
            # `do not` 을 무시하고 `add`·`remove`·`products` 만 읽는다. 배치 보존은
            # 프롬프트가 아니라 ControlNet 이 한다(ControlNet 을 끄고 strength 를 올리면
            # 모니터가 iMac 으로 바뀐다 — 2026-08-01 실측). 억제는 네거티브가 맡는다
            # (`duplicated objects`, `extra monitor`, `floating objects`).
            #
            # 절단 경로에서만 남긴다: 그쪽은 이 문장을 지우면 회귀 테스트가 무너지고,
            # 어차피 예산이 빠듯해 사진 어휘를 대신 넣을 자리도 없다.
            parts.append(_Part("do not add or remove products.", 0))
        return parts

    def build_negative_prompt(self) -> tuple[str, list[str]]:
        """(네거티브 프롬프트, 버린 항목).

        CFG 가 꺼진 프로필에서는 빈 문자열을 돌려준다 — 계산에 들어가지 않으므로
        만들어 넘기는 것 자체가 사실을 흐린다. 무효라는 경고는 generator 가 남긴다.
        """
        if not self.settings.supports_negative_prompt:
            return "", []
        profile = self.settings.negative_prompt_profile
        if profile == "none":
            return "", []
        source = NEGATIVE_FULL if profile == "full" else NEGATIVE_COMPACT

        kept: list[str] = []
        dropped: list[str] = []
        for term in (t.strip() for t in source.split(",")):
            if not term:
                continue
            candidate = ", ".join(kept + [term])
            if self.count_tokens(candidate) > self.budget:
                dropped.append(term)
                continue
            kept.append(term)
        return ", ".join(kept), dropped

    # --- 조합 -------------------------------------------------------------

    def build(self, request: GenerationRequest) -> "BuiltPrompt":
        if self.settings.prompt_file is not None:
            return self._build_from_file(request)

        resolved = resolve_products(request)

        parts: list[_Part | _Products] = [
            *self.build_structure_prompt(request),
            *self.build_environment_prompt(request),
            *self.build_base_prompt(request),
            *self.build_mood_prompt(request),
        ]
        if resolved.words:
            # 우선순위 2 — 제품 이름이 빠지면 그 물건이 다른 카테고리의 물건이 되므로
            # 무드나 제품 조명 색보다 먼저 지킨다 (product_categories.py 참고).
            parts.append(_Products(resolved.words, 2))

        # 원래 순서를 색인으로 기억한다. 문장 내용으로 되찾으면 같은 문장이 두 번
        # 나올 때 섞인다.
        indexed = [
            (index, part)
            for index, part in enumerate(parts)
            if isinstance(part, _Products) or part.text
        ]

        kept: list[tuple[int, _Part]] = [
            (index, part)
            for index, part in indexed
            if not isinstance(part, _Products) and part.priority == MANDATORY_PRIORITY
        ]
        settled = {index for index, _ in kept}

        dropped: list[str] = []
        product_dropped: tuple[str, ...] = ()

        for index, part in sorted(
            (item for item in indexed if item[0] not in settled), key=lambda item: item[1].priority
        ):
            if isinstance(part, _Products):
                # 이 문장만 통째로 버리지 않고 단어 단위로 줄인다.
                text, product_dropped = self._fit_products(part.words, kept)
                if text:
                    kept.append((index, _Part(text, part.priority)))
                continue

            # 거의 같은 문장을 두 번 넣지 않는다. 제품 조명 색과 무드(BLUE/PINK)는
            # 둘 다 "subtle <색> accent, controlled saturation" 형태가 되어 겹친다.
            # 중복을 그냥 두면 토큰만 먹고 제품 목록 같은 뒷문장이 밀려난다.
            if _is_redundant(part.text, [p for _, p in kept]):
                dropped.append(part.text)
                continue
            candidate = " ".join(p.text for _, p in kept + [(index, part)])
            if self.count_tokens(candidate) > self.budget:
                dropped.append(part.text)
                continue
            kept.append((index, part))

        kept.sort(key=lambda item: item[0])
        prompt = " ".join(part.text for _, part in kept)

        negative, negative_dropped = self.build_negative_prompt()
        return BuiltPrompt(
            prompt=prompt,
            negative_prompt=negative,
            dropped=dropped,
            negative_dropped=negative_dropped,
            negative_effective=bool(negative) and self.settings.supports_negative_prompt,
            products_dropped=product_dropped,
            products_too_small=resolved.too_small,
            products_unverified=resolved.unverified,
        )

    def _build_from_file(self, request: GenerationRequest) -> "BuiltPrompt":
        """`PROMPT_FILE` 이 지정되면 조합 규칙을 전부 건너뛴다 (prompt_file.py).

        문장을 버리지도, 중복을 지우지도, 예산에 맞추지도 않는다 — 사람이 쓴 파일을
        조용히 깎으면 무엇이 실렸는지 알 수 없다. 그래서 `dropped` 는 항상 비어 있다.

        네거티브는 `NEGATIVE_PROMPT_PROFILE` 이 아니라 파일의 `[negative]` 블록에서
        온다. 파일이 프롬프트의 유일한 출처라는 뜻이고, 두 출처가 섞이면 결과를 만든
        쪽이 어디인지 알 수 없다. 다만 CFG 가 꺼진 프로필에서는 계산에 들어가지 않으므로
        빈 문자열로 만든다(기존 경로와 같은 규칙, generator 가 경고를 남긴다).
        """
        from app.generation.prompt_file import load_prompt_file

        codes = tuple(item.code for item in request.product_categories)
        loaded = load_prompt_file(self.settings.prompt_file, resolve_products(request).words, codes)
        negative = loaded.negative_prompt if self.settings.supports_negative_prompt else ""
        return BuiltPrompt(
            prompt=loaded.prompt,
            negative_prompt=negative,
            dropped=[],
            negative_dropped=[],
            negative_effective=bool(negative),
            prompt_file=str(loaded.path),
            prompt_file_categories=loaded.applied_categories,
            # 요청이 카테고리를 줬는데 파일에 그 블록이 없으면 사실을 남긴다. 배치에서
            # 폴더 이름을 `moniter/` 로 잘못 적으면 조용히 공통 프롬프트만 실린다.
            prompt_file_unmatched=tuple(
                code for code in codes if code not in loaded.applied_categories
            ),
        )

    def _fit_products(
        self, words: tuple[str, ...], kept: list[tuple[int, _Part]]
    ) -> tuple[str, tuple[str, ...]]:
        """예산이 허용하는 만큼 제품 이름을 담고, 못 담은 것을 돌려준다.

        긴 단어가 안 들어가도 멈추지 않고 다음 단어를 시도한다. 우선순위가 높은 단어를
        건너뛰는 게 아쉽지만, 그 단어는 이미 못 들어가는 상태이므로 뒤 단어를 포기해도
        얻는 것이 없다. 이름 하나가 더 들어가면 그만큼 카테고리 오류가 줄어든다.
        """
        base = " ".join(part.text for _, part in kept)
        chosen: list[str] = []
        cut: list[str] = []
        for word in words[:MAX_PRODUCT_WORDS]:
            candidate = _product_sentence(chosen + [word])
            joined = f"{base} {candidate}" if base else candidate
            if self.count_tokens(joined) > self.budget:
                cut.append(word)
                continue
            chosen.append(word)
        cut.extend(words[MAX_PRODUCT_WORDS:])
        return (_product_sentence(chosen) if chosen else ""), tuple(cut)

    # --- 내부 -------------------------------------------------------------

    def _product_light_sentence(self, request: GenerationRequest) -> str:
        """켜진 제품 조명의 개수와 색만 말한다. productId 는 노출하지 않는다 (§4)."""
        on = [light for light in request.product_lights if light.enabled]
        if not on:
            return ""
        # **확산**을 명시한다. 그냥 "빛난다"고 하면 발광면이 흰색으로 클리핑되어 실루엣이
        # 사라지고, 그 자리를 모델이 흰 판·스탠드 조명·빈 공간으로 각각 다르게 채운다
        # (2026-08-02 실측, RGB PC 케이스). 안에서 새어 나오는 빛이라고 적어야 형태가 남는다.
        diffusion = (
            "glowing softly from inside, diffused through a translucent panel, "
            "faint light spill onto nearby surfaces"
        )
        colors = [light.color for light in on if light.color]
        if colors:
            # 색은 하나만 쓴다. 여러 색을 나열하면 전체가 색 필터처럼 덮인다 (§9).
            return (
                f"subtle {color_name(colors[0])} accent light, controlled saturation, "
                f"{diffusion}."
            )
        count = "one product" if len(on) == 1 else f"{len(on)} products"
        return f"{count} {diffusion}."

    # 제품 문장은 길이가 예산에 따라 달라져서 _fit_products() 가 만든다.
    # 모듈 수준 _product_sentence() 를 쓴다.


@dataclass
class BuiltPrompt:
    prompt: str
    negative_prompt: str
    dropped: list[str]
    negative_dropped: list[str]
    negative_effective: bool
    #: 토큰 예산 때문에 못 넣은 제품 이름. 이 물건들은 카테고리가 바뀔 수 있다.
    products_dropped: tuple[str, ...] = ()
    #: 화면에서 너무 작아서 아예 후보에서 뺀 카테고리 코드.
    products_too_small: tuple[str, ...] = ()
    #: 표에 없어서 코드로 단어를 만든 항목. `(코드, 만든 단어)`.
    products_unverified: tuple[tuple[str, str], ...] = ()
    #: 프롬프트를 파일에서 읽었을 때 그 경로. 조합 규칙으로 만들었으면 None.
    #: 파일은 언제든 고쳐지므로 경로가 없으면 출력만 보고 프롬프트를 되짚을 수 없다.
    prompt_file: str | None = None
    #: 실제로 실린 `[when ...]` 카테고리 코드.
    prompt_file_categories: tuple[str, ...] = ()
    #: 요청이 준 코드 중 파일에 블록이 없던 것. 폴더 이름 오타를 잡는다.
    prompt_file_unmatched: tuple[str, ...] = ()
