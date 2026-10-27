"""카테고리 코드 → CLIP 이 읽는 영어 명사, 그리고 자리가 모자랄 때의 순서.

## 왜 백엔드가 아니라 워커가 이 표를 갖는가 (2026-08-02 결정)

이 매핑은 **상품의 성질이 아니라 모델의 성질**이다. "텀블러"를 `tumbler` 로 보내면
안 되는 이유는 텀블러라는 물건 때문이 아니라 CLIP 토크나이저가 그 단어를 곡예사로도
읽기 때문이다. 나중에 FLUX(T5 인코더)로 갈아타면 문장을 이해하므로 이 표 자체가
필요 없어진다. 그때 카탈로그 DB 를 건드리게 만들면 안 된다.

백엔드는 카테고리 코드와 화면 면적만 보낸다. 무엇을 남기고 무엇을 버릴지는
토큰 예산을 아는 이쪽에서 정하고, 버린 것은 응답 `warnings` 로 되돌려준다.

## 왜 개별 상품이 아니라 카테고리인가

화분 4개를 놔도 프롬프트에 필요한 건 `potted plant` 하나다. CLIP 은 개수를 세지 않고,
개수와 위치는 ControlNet 이 잡는다. 제품 20~30개가 보통 10~12 카테고리로 접힌다.

## 왜 이름을 부르는 것이 필요한가

목록에서 빠진 물건은 **다른 카테고리의 물건이 되어 나온다** (2026-08-01 실측).

```text
"desk lamp" 빼고 생성        → 스탠드가 거울이 됨
"monitor","keyboard" 빼고    → 키보드가 접힌 수건이 됨
```

다만 전부 그렇지는 않다. 실루엣만으로 정체가 읽히는 물건은 이름 없이도 버틴다 —
머그(손잡이), 텀블러(원통)는 이름을 안 줘도 그대로 나왔고, 프록시 화분(초록색 구)만
깨졌다. 그래서 자리는 **실루엣이 모호한 쪽에 먼저 준다**.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import IntEnum

#: 이 면적 미만이면 이름을 줘도 그려낼 해상도가 없어서 자리를 주지 않는다.
#:
#: 추정이 아니라 계산이다. SDXL VAE 는 8배 다운샘플이고 생성 크기는 약 1.1M px 이다.
#:
#: ```text
#: 1152x960 → 잠재 144x120
#: 화면의 0.3% = 약 57x57 px = 잠재 7x7   ← 하한
#: 화면의 0.1% = 약 33x33 px = 잠재 4x4   ← 무엇을 그리든 뭉갠다
#: ```
MIN_SCREEN_AREA_PERCENT = 0.3


class Silhouette(IntEnum):
    """실루엣만으로 카테고리를 알 수 있는가. **작은 값이 먼저 자리를 받는다.**"""

    #: 이름이 없으면 다른 카테고리의 물건이 된다. 실측된 실패: 프록시 화분, 프록시 스탠드, 키보드.
    AMBIGUOUS = 0
    #: 형태가 특징적이라 이름이 없어도 카테고리는 유지된다. 실측: 머그, 텀블러, 모니터.
    READABLE = 1


@dataclass(frozen=True)
class CategoryWord:
    """카테고리 하나에 대한 프롬프트 지식."""

    #: CLIP 에 들어가는 영어 일반명사. 짧을수록 좋다 — 1~2 토큰.
    word: str
    silhouette: Silhouette
    #: 왜 이 단어인지. 실측 근거가 있으면 반드시 남긴다.
    note: str = ""


#: 카테고리 코드 → 프롬프트 단어.
#:
#: **의도적으로 거의 비어 있다.** 20종 목록은 아직 받지 않았고, `silhouette` 등급은
#: 실제 제품 GLB 렌더로 "이름 있을 때 / 없을 때"를 돌려봐야 정할 수 있다.
#: 지금 추측으로 채우면 틀린 값이 근거처럼 굳는다.
#:
#: 채우는 방법과 빈 칸 목록은 `docs/PRODUCT_CATEGORY_WORDS.md` 에 있다.
#: 등록되지 않은 코드는 아래 `_word_from_code()` 가 코드에서 단어를 만들고
#: "검증 안 됨" 경고를 남긴다 — 표를 채우는 일이 워커를 돌리는 일을 막지 않는다.
CATEGORY_WORDS: dict[str, CategoryWord] = {
    # 실측으로 확인된 유일한 항목 (2026-08-01).
    # 코드 그대로 소문자화하면 'tumbler' 인데, CLIP 에서 그 단어는 곡예사로도 읽혀
    # 텀블러가 각진 검은 덩어리로 나왔다. 'water bottle' 로 바꾸니 보온병이 나왔다.
    "TUMBLER": CategoryWord(
        "water bottle",
        Silhouette.READABLE,
        "'tumbler' 는 CLIP 에서 곡예사로도 읽힌다 (2026-08-01 실측). 원통 실루엣은 이름 없이도 버텼다.",
    ),
}


@dataclass(frozen=True)
class ProductPlacement:
    """백엔드가 보내는 배치 한 건."""

    code: str
    screen_area_percent: float


@dataclass(frozen=True)
class ResolvedProducts:
    """프롬프트에 넣을 후보와, 넣지 못한 것들."""

    #: 우선순위대로 정렬된 후보. 토큰 예산은 PromptBuilder 가 따로 적용한다.
    words: tuple[str, ...]
    #: 화면에서 너무 작아 제외한 코드.
    too_small: tuple[str, ...]
    #: 표에 없어서 코드에서 단어를 만든 항목. `(코드, 만든 단어)`.
    unverified: tuple[tuple[str, str], ...]


def _word_from_code(code: str) -> str:
    """표에 없는 코드에서 단어를 만든다. `DESK_LAMP` → `desk lamp`.

    코드가 영어라면 상당수는 이것만으로 맞는다. 틀릴 때를 대비해 호출부가
    "검증 안 됨" 경고를 남긴다 — 조용히 넘기면 TUMBLER 같은 실수가 되돌아온다.
    """
    return code.replace("_", " ").strip().lower()


def resolve(placements: list[ProductPlacement]) -> ResolvedProducts:
    """배치 목록을 프롬프트 후보로 바꾼다.

    1. 같은 코드를 하나로 접는다 (개수는 ControlNet 이 잡는다)
    2. 화면 면적이 `MIN_SCREEN_AREA_PERCENT` 미만인 코드를 뺀다
    3. (실루엣 모호성, 면적 내림차순) 으로 정렬한다

    면적은 같은 코드끼리 **합이 아니라 최대값**을 쓴다. 하한의 근거가 "물체 하나가
    잠재공간에서 몇 픽셀인가" 이므로, 작은 화분 4개를 합쳐 0.8% 로 만들면 하한의
    뜻이 사라진다. 가장 큰 개체가 그려질 수 있는지가 기준이다.
    """
    largest: dict[str, float] = {}
    for placement in placements:
        code = placement.code.strip().upper()
        if not code:
            continue
        largest[code] = max(largest.get(code, 0.0), placement.screen_area_percent)

    too_small = tuple(
        sorted(code for code, area in largest.items() if area < MIN_SCREEN_AREA_PERCENT)
    )
    keep = {code: area for code, area in largest.items() if area >= MIN_SCREEN_AREA_PERCENT}

    unverified: list[tuple[str, str]] = []
    scored: list[tuple[Silhouette, float, str]] = []
    for code, area in keep.items():
        known = CATEGORY_WORDS.get(code)
        if known is None:
            word = _word_from_code(code)
            unverified.append((code, word))
            # 등급을 모르면 AMBIGUOUS 로 본다 — 이름을 줘서 잃는 것은 자리 하나지만,
            # 안 줘서 잃는 것은 그 물건이 다른 물건이 되는 것이다.
            silhouette = Silhouette.AMBIGUOUS
        else:
            word, silhouette = known.word, known.silhouette
        scored.append((silhouette, -area, word))

    scored.sort()
    return ResolvedProducts(
        words=tuple(word for _, _, word in scored),
        too_small=too_small,
        unverified=tuple(sorted(unverified)),
    )
