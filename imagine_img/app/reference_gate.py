"""IP-Adapter 레퍼런스로 쓸 만한 제품 사진만 통과시킨다 (2026-08-04).

## 왜 소스를 바꾸는 대신 게이트를 두는가

크롤링해 둔 제품 사진에 배경이 섞여 있어서 "쿠팡에서 다시 검색해 오자" 는 안이 나왔다.
두 가지 이유로 그 길을 가지 않았다.

1. **쿠팡은 robots DENY 다** (2026-07-28 실측: `link.coupang.com` DENY,
   `www.coupang.com/robots.txt` 403). 이 저장소의 방침은 403 이면 차단으로 기록만 하고
   우회 코드를 넣지 않는 것이다.
2. **소스를 바꿔도 같은 문제를 다시 사 온다.** 쇼핑몰 사진은 어디서 가져와도 브랜드 띠와
   연출 컷이 섞여 있고, 저작권 노출도 그대로다.

레퍼런스에 필요한 것은 새 소스가 아니라 **제품 영역으로의 crop** 이고, 그것은 지금 있는
1,199장에서 절반 이상 얻을 수 있다.

## 무엇을 거부하고 무엇을 통과시키는가

```text
PLAIN      흰/단색 배경 + 제품 하나   -> 제품 박스로 crop 해서 통과
BANDED     그 위에 브랜드 로고 띠     -> 띠를 자른 뒤 PLAIN 과 같게
SCENE      방 안 연출 컷              -> 거부. 사람에게 넘긴다
SCREEN_ON  화면이 켜진 모니터         -> 거부
```

**SCENE 에 추측한 crop 을 돌려주지 않는다.** 가운데를 자르는 것은 통과율만 올리고 조용히
엉뚱한 레퍼런스를 만든다. 그래서 추측하지 않고 **세그멘테이션으로 실제로 갈랐다**
(2026-08-05, `app/generation/cutout.py` — U2Net).

수확이 크게 달라졌다:

```text
                흰 배경 마스크만    + U2Net 누끼
통과              461 (42.8%)      755 (70.2%)
no-separation     363              69        <- 294장이 살아났다
not-studio        230              230       <- 그대로 (밝기로 거부, 누끼까지 안 간다)
og-aspect          22               22
```

순서는 **알파 → 흰 배경 → 누끼**다. 흰 배경에서는 연결 요소가 더 정확하고 10배 빠르다.
누끼는 흰 배경 마스크가 실패한 뒤에만 돈다.

**누끼의 한계**: U2Net 이 찾는 것은 "제품" 이 아니라 **돋보이는 전경**이다. `1096.jpg`(방 안
의자)에서 의자는 정확히 잡았지만 **아래 러그가 같이 왔다**. 그래서 누끼로 통과한 것의 crop
에는 주변 소품이 섞일 수 있다. `1466.jpg`(조화 여러 다발) 같은 컷은 "어느 다발이 상품인가"
가 여전히 정해지지 않는다 — DB 카테고리가 `조화` 하나뿐이라 답을 주지 못한다.

배경을 고르는 부분은 `app/generation/background.py` 를 그대로 쓴다 — 흰 키캡이 배경으로
뚫리는 함정과 그 해법(테두리에 닿은 덩어리만 배경)이 이미 거기서 해결돼 있다.

## 모니터는 화면이 꺼진 컷만 받는다

시뮬레이터의 모니터를 **꺼진 검은 패널**로 확정했다(`docs/FINDINGS_2026-08-02.md` §1.8 —
밝은 화면은 실사화가 액자·창문으로 바꾼다). 화면에 사진이 깔린 레퍼런스를 IP-Adapter 로
물리면 그 결정과 정면으로 싸우므로 여기서 거른다. 판정은 **제품 박스 안의 채도**다:
꺼진 패널은 무채색이고, 켜진 화면은 거의 항상 색이 있다.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops

from app.core.logging import get_logger
from app.generation.background import MAX_SAFE_COVERAGE, MIN_SAFE_COVERAGE, build_mask, to_opaque

log = get_logger(__name__)


class Kind(Enum):
    """판정 결과. 통과 여부와 따로 두어 **왜** 통과/거부인지 집계할 수 있게 한다."""

    PLAIN = "plain"
    BANDED = "banded"
    SCENE = "scene"
    SCREEN_ON = "screen_on"


#: 판정을 이 크기로 줄여서 한다 (짧은 변 아님 — 긴 변 기준).
#:
#: 판정 근거는 **테두리 통계와 덩어리 연결성**이라 원본 해상도가 필요 없다. 그런데 비용은
#: 해상도에 비례한다: `build_mask` 의 후광 흡수가 8회 팽창이라 3024x4032 한 장에 **62초**가
#: 걸렸고(실측), 1,199장이면 그것만으로 몇 시간이다. 768 로 줄이면 장당 0.1초 아래다.
#:
#: crop 박스는 **원본 좌표로 돌려준다** — 호출부가 원본을 잘라야 화질을 잃지 않는다.
ANALYSIS_MAX_SIDE = 768

#: 테두리 밝기 **평균**이 이보다 낮으면 스튜디오 배경이 아니라고 본다.
#:
#: `background.STUDIO_WHITE_MEAN` 과 같은 값을 같은 목적으로 쓴다.
#:
#: **편차로 가르려던 것을 평균으로 바꿨다** (2026-08-04). 처음엔 편차 22 를 기준으로 삼았는데,
#: 1,199장 실측에서 그 기준이 **좋은 레퍼런스를 거부했다**:
#:
#: ```text
#: 859.jpg  mean 241.9  std 50.9   흰 배경 · 마이크 하나 · 화면을 꽉 채움  <- 이상적인데 거부됐다
#: 803.jpg  mean 243.8  std 46.2   흰 배경 · LG 울트라와이드              <- 같이 거부됐다
#: ```
#:
#: 편차가 큰 이유는 배경이 번잡해서가 아니라 **제품이 테두리에 닿아서**다. 그리고 임계값을
#: 아무리 올려도 통과 장수는 470 에서 포화한다 — 즉 실제로 갈리는 것은 편차가 아니라 평균이다:
#:
#: ```text
#: std<=14  360장 (mean>238  341)
#: std<=22  417장 (mean>238  389)
#: std<=50  584장 (mean>238  469)
#: 제한없음  701장 (mean>238  470)   <- 470 에서 멈춘다
#: ```
#:
#: **238 은 측정이 아니라 판단이다.** 임계값을 낮추면 통과가 늘지만(234 → 482장,
#: 230 → 495장) 그 구간은 좋은 것과 나쁜 것이 섞여 있다:
#:
#: ```text
#: 800.jpg   237.9   흰 배경에 독서대 하나. 좋은 레퍼런스인데 0.1 차로 떨어진다
#: 1679.jpg  235.3   흰 책상 위 데스크매트 + 노트북 + 머그 + 마우스. 연출 컷이다
#: ```
#:
#: 밝기로는 이 둘이 갈리지 않는다. 그래서 **놓치는 쪽으로 기울였다** — 연출 컷이 통과하면
#: IP-Adapter 가 머그와 노트북까지 참조에 넣는데, 그 손해가 레퍼런스 21장을 잃는 것보다
#: 크다. 이미 461장이 통과한다. 세그멘테이션이 붙으면 이 구간을 다시 볼 것.
BORDER_STUDIO_MEAN = 238.0

#: `og:image` 로 쓰이는 비율(1.91:1) 대역. 이 범위는 **제품 사진이 아니라고 본다.**
#:
#: 크롤러가 상품 페이지의 `og:image` 를 집어온 결과가 1,199장 중 22장 있고, 열어 보면
#: 제품이 한 개도 없다 — `114.png` 는 색상 팔레트 사이트의 배너이고 `117.png` 는
#: "안녕하세요. 디자인베이스입니다" 다. 둘 다 흰 배경이라 밝기로는 걸리지 않는다.
#:
#: 비용: 진짜 1.91:1 제품 사진이 있으면 같이 거부된다. 사유 문구에 이유를 적어 두었으니
#: 그런 경우가 보이면 대역을 좁히면 된다. 1.78(1920x1080) 은 대역 밖이라 안전하다.
OG_ASPECT_RANGE = (1.85, 1.95)

#: 띠로 인정할 색 거리. 배경색과 이만큼 떨어져야 "붙여 넣은 띠" 다.
#:
#: 흰 여백(거리 0~10)을 띠로 자르면 안 된다 — 여백은 배경이고 마스크가 처리한다.
#: 근거를 두 곳(여기와 background.py)에 두면 한쪽만 고쳤을 때 조용히 어긋난다.
BAND_COLOR_DISTANCE = 60.0

#: 띠 한 줄로 인정할 편차. 로고가 든 줄은 편차가 있으므로 넉넉하게 본다.
BAND_ROW_STD = 46.0

#: 띠가 이미지의 이 비율을 넘으면 자르지 않는다. 절반이 띠면 그건 배너다.
BAND_MAX_FRACTION = 0.34

#: crop 에 남길 여백 (제품 박스 짧은 변 기준). 0 이면 실루엣이 화면 끝에 붙어
#: IP-Adapter 의 이미지 인코더가 잘린 물체로 읽는다.
CROP_MARGIN_FRACTION = 0.06

#: 제품 박스가 이 비율보다 작으면 제품을 못 찾은 것으로 본다 (빈 이미지·배너).
MIN_PRODUCT_AREA = 0.01

#: "켜진 화면 픽셀" 의 기준: 절대 채도 `max(RGB)-min(RGB)` 와 밝기 `max(RGB)`.
#:
#: HSV 의 S 를 쓰면 안 된다. S 는 max 로 나눈 상대값이라 **어두운 회색이 높게 나온다** —
#: 꺼진 패널 (13,14,17) 의 S 가 60 이다(= (17-13)/17*255). 절대 채도는 같은 픽셀에서 4 다.
SCREEN_LIT_CHROMA = 40.0
SCREEN_LIT_VALUE = 90.0

#: 그런 픽셀이 제품 박스에서 이 비율을 넘으면 "켜진 화면" 으로 본다.
#:
#: **평균 채도로는 못 가른다.** 처음에 제품 박스의 평균 절대 채도(임계 30)를 썼는데,
#: `803.jpg` 는 화면에 영상 편집 UI 가 떠 있는 **명백히 켜진** 모니터인데 평균이 26.0 이라
#: 통과했다 — UI 가 대부분 어두운 회색 패널이라 평균이 눌린 것이다. 켜진 화면의 표식은
#: 평균이 아니라 **밝고 색 있는 영역이 존재한다는 것**이라 비율로 바꿨다.
#:
#: 실측 (`inputs/products/monitor/` 10장, 전부 화면이 켜져 있다):
#:
#: ```text
#: 평균채도  p90   밝고유채색%
#:    33.1  132.0     21.0   Dell SE2725HG
#:    29.9  111.0     21.0   주연테크 X25F-360
#:    ...
#:     8.8   31.0      1.3   기가바이트 GS27F2   <- 가장 낮다. 그래도 게임 화면이 떠 있다
#: ```
#:
#: 그래서 1% 로 잡으면 열 장 다 걸린다. **여유가 크지 않다** — 꺼진 화면 모니터 사진이
#: 크롤링 데이터에 한 장도 없어서 반대쪽을 실측으로 못 잡았다. 꺼진 컷이 들어오면 다시 잰다.
SCREEN_LIT_FRACTION = 0.01

#: 채도를 화면 판정에 쓰는 카테고리. 화면이 없는 제품에 적용하면 파란 마우스패드가 거부된다.
SCREEN_CATEGORIES = frozenset({"MONITOR", "LAPTOP", "TABLET", "TV", "SMART_DISPLAY"})


@dataclass(frozen=True)
class Verdict:
    """한 장의 판정. `crop` 은 **원본 좌표계**의 박스라 호출부가 그대로 쓸 수 있다."""

    usable: bool
    kind: Kind
    crop: tuple[int, int, int, int] | None
    #: 사람이 읽는 사유. **측정값이 들어 있어도 된다** — 한 장을 볼 때 필요하다.
    reason: str
    #: 집계용 **안정된 열쇠**. 측정값이 들어가지 않는다.
    #:
    #: `reason` 으로 집계하면 안 된다: 처음에 그렇게 했다가 "테두리 밝기 219.3 < 238.0"
    #: 처럼 사유마다 측정값이 달라서 **한 부류가 열 줄로 갈라졌고**(실측) 정작 큰 항목이
    #: 안 보였다. `product_sort` 가 같은 함정을 주석으로 남겨 뒀는데 여기서 다시 밟았다.
    code: str = ""
    border_mean: float = 0.0
    border_std: float = 0.0


@dataclass(frozen=True)
class GateReport:
    total: int
    usable: int
    by_kind: dict[Kind, int] = field(default_factory=dict)
    #: 거부 사유 **코드**별 장수. 사람이 읽을 문구는 `labels` 에 있다.
    reasons: dict[str, int] = field(default_factory=dict)
    #: 코드 → 그 부류에서 처음 본 사유 문구 (측정값이 든 예시 하나).
    labels: dict[str, str] = field(default_factory=dict)


def _border_pixels(array: np.ndarray) -> np.ndarray:
    height, width, _ = array.shape
    thickness = max(2, min(height, width) // 25)
    return np.concatenate(
        [
            array[:thickness].reshape(-1, 3),
            array[-thickness:].reshape(-1, 3),
            array[:, :thickness].reshape(-1, 3),
            array[:, -thickness:].reshape(-1, 3),
        ]
    )


def _background_color(array: np.ndarray) -> np.ndarray:
    """테두리의 **중앙값**. 평균을 쓰면 띠가 배경색을 자기 쪽으로 끌어당긴다."""
    return np.median(_border_pixels(array), axis=0)


def _scan_band(lines: np.ndarray, background: np.ndarray, limit: int) -> int:
    """가장자리에서 배경과 동떨어진 색이 몇 줄 이어지는가.

    **띠 안의 로고를 줄 편차로 끊어서는 안 된다.** 처음엔 `줄 편차 > BAND_ROW_STD` 를
    중단 조건에 넣었는데, LG 로고가 든 줄에서 끊겨 띠의 아래쪽만 잘리고 검은 나머지가
    남았다 — 그 상태로 테두리를 다시 재면 편차 107.9 가 나와 흰 배경 사진이 '번잡' 으로
    거부됐다. 그래서 **가장자리 줄의 색을 띠 색으로 잡고, 줄 평균이 그 색 근처에
    머무는 동안** 이어 간다. 로고가 있어도 줄 평균은 띠 색 근처다.
    """
    if len(lines) == 0:
        return 0
    edge = lines[0].reshape(-1, 3)
    band = edge.mean(axis=0)
    if float(np.linalg.norm(band - background)) < BAND_COLOR_DISTANCE:
        return 0
    # **가장자리 줄 자체가 고르지 않으면 띠가 아니다.** 이 검사가 없으면 아래 띠가 있는
    # 사진에서 모든 **열**이 띠를 19% 씩 물고 있어 열 평균이 흰색에서 멀어지고, 좌우가
    # 두께 150 의 '띠' 로 잡혀 아래 띠(120)보다 먼저 잘린다(실측). 진짜 띠의 가장자리
    # 줄은 한 색이고(편차 0), 오염된 열은 흰색 512px + 검정 120px 라 편차가 90 이다.
    if float(edge.std()) > BAND_ROW_STD:
        return 0
    count = 0
    for index in range(min(limit, len(lines))):
        mean = lines[index].reshape(-1, 3).mean(axis=0)
        if float(np.linalg.norm(mean - band)) > BAND_ROW_STD:
            break
        count += 1
    return count


def _trim_bands(array: np.ndarray) -> tuple[int, int, int, int]:
    """배경색과 동떨어진 **가장자리 띠**를 뺀 박스. 없으면 이미지 전체.

    **한 번에 네 변을 판정하면 안 된다.** 803.jpg 처럼 아래에 검은 띠가 있는 사진에서는
    모든 **열**이 그 띠를 19% 씩 물고 있어서 열 평균이 흰 배경에서 멀어진다 — 그래서
    좌우까지 띠로 읽혀 crop 이 제품 너비로 잘렸다(실측: 512x632 이미지가 x 150~363 으로).

    그래서 **가장 두꺼운 띠 하나를 잘라내고 남은 박스에서 다시 잰다.** 아래 띠를 걷어내면
    열 평균이 흰색으로 돌아오고 좌우는 띠가 아니게 된다. 더 잘릴 것이 없으면 멈춘다.
    """
    height, width, _ = array.shape
    left, top, right, bottom = 0, 0, width, height
    max_rows = int(height * BAND_MAX_FRACTION)
    max_cols = int(width * BAND_MAX_FRACTION)

    for _ in range(4):  # 변이 넷이므로 네 번이면 더 자를 것이 없다
        view = array[top:bottom, left:right]
        if view.shape[0] < 16 or view.shape[1] < 16:
            break
        background = _background_color(view)
        columns = view.transpose(1, 0, 2)
        candidates = (
            ("top", _scan_band(view, background, max_rows - top)),
            ("bottom", _scan_band(view[::-1], background, max_rows - (height - bottom))),
            ("left", _scan_band(columns, background, max_cols - left)),
            ("right", _scan_band(columns[::-1], background, max_cols - (width - right))),
        )
        side, thickness = max(candidates, key=lambda item: item[1])
        if thickness <= 0:
            break
        if side == "top":
            top += thickness
        elif side == "bottom":
            bottom -= thickness
        elif side == "left":
            left += thickness
        else:
            right -= thickness
    return left, top, right, bottom


def _cutout_box(
    image: Image.Image, model_cache_dir
) -> tuple[tuple[int, int, int, int], float] | None:
    """U2Net 누끼로 제품 박스를 잡는다. 흰 배경 마스크가 실패한 뒤의 두 번째 시도다.

    **왜 두 번째인가**: 흰 배경에서는 연결 요소 마스크가 더 정확하고 빠르다(0.1초 대
    0.3~0.9초). U2Net 은 "돋보이는 전경" 을 찾는 것이라 흰 배경 제품 사진에서도 그림자나
    반사를 물고 올 수 있다. 그래서 순서를 지킨다: 알파 → 흰 배경 → 누끼.

    **한계**: 찾는 것이 "제품" 이 아니라 전경이다. 실측(1096.jpg, 방 안 의자)에서 의자는
    정확히 잡았지만 **의자 아래 러그가 같이 왔다** — 러그도 전경이라서다. 그래서 이 경로로
    통과한 것은 crop 에 주변 소품이 섞일 수 있다.
    """
    from app.generation.cutout import CutoutUnavailable, cutout_mask

    try:
        mask = cutout_mask(image, model_cache_dir)
    except CutoutUnavailable as exc:
        log.debug("cutout unavailable: %s", exc)
        return None
    product = ImageChops.invert(mask).point(lambda value: 255 if value > 127 else 0)
    box = product.getbbox()
    if box is None:
        return None
    coverage = 1.0 - (np.asarray(product, dtype=np.float32) / 255.0).mean()
    # 흰 배경 경로와 같은 안전 범위를 쓴다 — 전경이 거의 전부이거나 거의 없으면 뜻이 없다.
    if not MIN_SAFE_COVERAGE <= coverage <= MAX_SAFE_COVERAGE:
        return None
    area = (box[2] - box[0]) * (box[3] - box[1]) / (image.width * image.height)
    return box, area


def _product_box(image: Image.Image) -> tuple[tuple[int, int, int, int], float] | None:
    """제품 실루엣의 경계 박스와 면적 비율. 배경을 못 가르면 None.

    `build_mask` 의 `usable` 을 그대로 신뢰한다 — coverage 가 범위를 벗어난 것은
    "제품까지 먹었다" 또는 "배경을 못 찾았다" 이고, 두 경우 다 박스가 뜻을 잃는다.
    """
    mask = build_mask(image, bite=0, feather=0)
    if not mask.usable:
        return None
    product = ImageChops.invert(mask.mask.convert("L")).point(lambda v: 255 if v > 127 else 0)
    box = product.getbbox()
    if box is None:
        return None
    area = (box[2] - box[0]) * (box[3] - box[1]) / (image.width * image.height)
    return box, area


def _lit_fraction(image: Image.Image) -> float:
    """**밝고 색이 있는** 픽셀의 비율. 켜진 화면의 표식이다 (상수 주석에 실측표)."""
    array = np.asarray(image.convert("RGB"), dtype=np.float32)
    value = array.max(axis=2)
    chroma = value - array.min(axis=2)
    return float(((chroma > SCREEN_LIT_CHROMA) & (value > SCREEN_LIT_VALUE)).mean())


def judge(
    image: Image.Image,
    *,
    category: str | None = None,
    max_side: int = ANALYSIS_MAX_SIDE,
    model_cache_dir: Path | None = None,
) -> Verdict:
    """레퍼런스로 쓸 수 있는가. `crop` 은 **원본 좌표계**다.

    거부할 때 `crop` 은 항상 None 이다 — 값을 채워 두면 호출부가 `usable` 을 보지 않고
    그것을 쓴다.
    """
    original = to_opaque(image)
    scale = min(1.0, max_side / max(original.width, original.height))
    opaque = (
        original
        if scale >= 1.0
        else original.resize(
            (max(1, round(original.width * scale)), max(1, round(original.height * scale))),
            Image.LANCZOS,
        )
    )
    array = np.asarray(opaque, dtype=np.float32)
    if array.ndim != 3:
        return Verdict(False, Kind.SCENE, None, "RGB 로 읽을 수 없다", code="not-rgb")

    aspect = original.width / max(1, original.height)
    if OG_ASPECT_RANGE[0] <= aspect <= OG_ASPECT_RANGE[1]:
        return Verdict(
            False,
            Kind.SCENE,
            None,
            f"og:image 비율({aspect:.2f}:1)이다 — 상품 페이지 배너이고 제품이 없다",
            code="og-aspect",
        )

    band_box = _trim_bands(array)
    trimmed = opaque.crop(band_box) if band_box != (0, 0, opaque.width, opaque.height) else opaque
    banded = trimmed is not opaque
    if trimmed.width < 16 or trimmed.height < 16:
        return Verdict(False, Kind.SCENE, None, "띠를 빼면 남는 것이 없다", code="band-empty")

    border = _border_pixels(np.asarray(trimmed, dtype=np.float32))
    border_mean = float(border.mean())
    border_std = float(border.std())

    found = _product_box(trimmed)
    cut_out = False
    if found is None and model_cache_dir is not None:
        # 흰 배경 마스크가 실패했다 = 연출 컷일 가능성이 높다. 누끼로 한 번 더 본다.
        found = _cutout_box(trimmed, model_cache_dir)
        cut_out = found is not None
    if found is None:
        return Verdict(
            False,
            Kind.SCENE,
            None,
            "배경과 제품을 가를 수 없다 (연출 컷이거나 제품이 없다)",
            code="no-separation",
            border_mean=border_mean,
            border_std=border_std,
        )
    box, area = found
    if area < MIN_PRODUCT_AREA:
        return Verdict(
            False,
            Kind.SCENE,
            None,
            "제품으로 볼 만한 덩어리가 없다",
            code="no-product",
            border_mean=border_mean,
            border_std=border_std,
        )
    if not cut_out and border_mean < BORDER_STUDIO_MEAN:
        return Verdict(
            False,
            Kind.SCENE,
            None,
            f"스튜디오 배경이 아니다 (테두리 밝기 {border_mean:.1f} < {BORDER_STUDIO_MEAN})",
            code="not-studio",
            border_mean=border_mean,
            border_std=border_std,
        )

    margin = round(min(box[2] - box[0], box[3] - box[1]) * CROP_MARGIN_FRACTION)
    # 축소본 좌표 → 원본 좌표. `round` 로 되돌리면 경계에서 1px 모자랄 수 있어 바깥으로
    # 넉넉히 잡는다(왼·위는 내림, 오른·아래는 올림) — 제품이 잘리는 쪽 실수를 막는다.
    crop = (
        max(0, int((band_box[0] + max(0, box[0] - margin)) / scale)),
        max(0, int((band_box[1] + max(0, box[1] - margin)) / scale)),
        min(original.width, -(-(band_box[0] + min(trimmed.width, box[2] + margin)) // scale)),
        min(original.height, -(-(band_box[1] + min(trimmed.height, box[3] + margin)) // scale)),
    )
    crop = (int(crop[0]), int(crop[1]), int(crop[2]), int(crop[3]))

    if category and category.upper() in SCREEN_CATEGORIES:
        lit = _lit_fraction(trimmed.crop(box))
        if lit > SCREEN_LIT_FRACTION:
            return Verdict(
                False,
                Kind.SCREEN_ON,
                None,
                f"화면이 켜져 있다 (밝고 유채색인 픽셀 {lit * 100:.1f}% > "
                f"{SCREEN_LIT_FRACTION * 100:.0f}%). "
                "시뮬레이터 모니터는 꺼진 검은 화면이다 (FINDINGS §1.8)",
                code="screen-on",
                border_mean=border_mean,
                border_std=border_std,
            )

    return Verdict(
        True,
        Kind.BANDED if banded else Kind.PLAIN,
        crop,
        "브랜드 띠를 자르고 제품 박스로 crop" if banded else "제품 박스로 crop",
        code="banded" if banded else "plain",
        border_mean=border_mean,
        border_std=border_std,
    )


def judge_path(
    path: Path, *, category: str | None = None, model_cache_dir: Path | None = None
) -> Verdict:
    """파일 하나. 열 수 없는 파일도 예외 대신 판정으로 돌려준다 — 1,199장을 도는 중에
    한 장이 깨져서 멈추면 나머지 결과를 잃는다."""
    try:
        with Image.open(path) as image:
            image.load()
            return judge(image, category=category, model_cache_dir=model_cache_dir)
    except Exception as exc:  # PIL 은 파일별로 다른 예외를 던진다
        return Verdict(
            False, Kind.SCENE, None, f"이미지를 열 수 없다: {type(exc).__name__}", code="unreadable"
        )


def summarize(verdicts: list[Verdict]) -> GateReport:
    """`code` 로 묶는다 — `reason` 으로 묶으면 측정값 때문에 한 부류가 갈라진다."""
    by_kind: dict[Kind, int] = {}
    reasons: dict[str, int] = {}
    labels: dict[str, str] = {}
    for verdict in verdicts:
        by_kind[verdict.kind] = by_kind.get(verdict.kind, 0) + 1
        if not verdict.usable:
            reasons[verdict.code] = reasons.get(verdict.code, 0) + 1
            labels.setdefault(verdict.code, verdict.reason)
    return GateReport(
        total=len(verdicts),
        usable=sum(1 for v in verdicts if v.usable),
        by_kind=by_kind,
        reasons=reasons,
        labels=labels,
    )
