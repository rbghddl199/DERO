"""흰 배경 제품 사진에서 **배경 영역**을 골라낸다 (2026-08-04).

## 왜 필요한가

프롬프트로는 흰 배경을 방으로 바꿀 수 없다 (prompts/product_copyright_safe.txt 머리말의
실측 목록). strength·canny 강도·프롬프트 순서·네거티브를 다 시험했고 전부 흰 배경이었다.
원인은 canny 조건 이미지의 빈 영역이라, **어디가 배경인지 명시적으로 알려주는** 방법만 남는다.
그게 마스크다: 제품 픽셀은 그대로 두고 배경만 다시 그리게 한다 (inpaint).

## 왜 "밝은 픽셀" 이 아니라 "테두리에 닿은 밝은 덩어리" 인가

단순히 "밝은 픽셀 = 배경" 으로 하면 **제품 안의 흰색이 뚫린다** — 흰 키캡, 흰 시계 몸통,
모니터의 밝은 화면이 다 배경이 되어 그 자리에 방이 그려진다. 그래서 밝은 픽셀을 덩어리로
묶고 **이미지 테두리에 닿은 덩어리만** 배경으로 본다. 흰 키캡은 어두운 키 틈에 둘러싸여
테두리와 이어지지 않으므로 살아남는다.

flood fill(허용 오차로 번지기)을 먼저 써 봤지만 밝은 제품에서 새어 나갔다 — 흰 키보드는
마스크가 화면 전체(coverage 1.00)가 되어 제품까지 다시 그리게 됐다 (2026-08-04 실측).
허용 오차를 낮추면 배경의 옅은 그라디언트를 놓치고, 올리면 제품으로 샌다. 연결 요소로
가르면 그 절충이 필요 없다.

## 알파가 있으면 알파를 쓴다

투명 PNG(실측 60장 중 4장)는 배경이 이미 정확히 표시되어 있다. 밝기로 추측할 이유가 없다.
파이프라인은 알파를 흰색에 합성하므로(image_preprocessor.to_rgb), 마스크는 합성 전에 뽑는다.

## 경계를 제품 쪽으로 조금 먹는 이유

제품 외곽에는 흰 배경이 섞인 반투명 픽셀(안티에일리어싱)이 한 줄 있다. 마스크를 제품 경계에
정확히 맞추면 그 줄이 남아 **새 배경 위에 흰 테두리**가 생긴다. 그래서 마스크를 제품 쪽으로
몇 픽셀 넓힌 뒤 경계를 흐린다 — 실루엣을 조금 잃는 대신 잘라붙인 티가 사라진다.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from PIL import Image, ImageChops, ImageFilter

#: 테두리 픽셀의 평균이 이보다 밝고 편차가 작으면 "스튜디오 흰 배경" 으로 본다.
STUDIO_WHITE_MEAN = 238.0
STUDIO_WHITE_STD = 14.0

#: 이 밝기 이상을 "밝은 픽셀" 로 본다. 흰 배경에는 옅은 반사 그림자가 있어서 255 가 아니다.
WHITE_THRESHOLD = 232

#: 알파가 이 값 미만이면 배경으로 본다.
ALPHA_THRESHOLD = 250

#: 마스크가 화면의 이 비율을 넘으면 **제품까지 먹은 것으로 보고 쓰지 않는다.** 배경만
#: 다시 그리려는 것인데 제품이 마스크에 들어가면 다른 물건이 되어 나온다.
MAX_SAFE_COVERAGE = 0.92

#: 이 비율 미만이면 배경을 못 찾은 것으로 본다 (라이프스타일 사진 등).
MIN_SAFE_COVERAGE = 0.10

#: 이 밝기 이상이면서 **이미 찾은 배경에 붙어 있는** 픽셀은 배경에 흡수한다.
#:
#: 제품과 배경 사이에는 흰 배경이 섞인 반투명 픽셀이 한두 줄 있다. 그 밝기는 배경(255)과
#: 제품 사이의 중간값이라 `WHITE_THRESHOLD` 로는 안 잡히고, 남으면 **새 배경 위에 흰 후광**
#: 으로 보인다 (2026-08-04 실측: 의자 팔걸이·다리 주변이 빛나 보였다).
#:
#: 고정 픽셀 수로 넓히는 것(`EDGE_BITE_PX`)만으로는 부족하다 — 후광 두께가 이미지마다
#: 다르고, 넉넉히 넓히면 얇은 다리·베젤을 먹는다. 그래서 **밝은 쪽으로만** 자라게 한다:
#: 후광은 밝아서 흡수되고, 제품의 진짜 경계는 어두워서 여기서 멈춘다.
HALO_THRESHOLD = 196

#: 위 확장을 몇 번 반복할지. 한 번에 1px 자란다.
HALO_ITERATIONS = 8

#: 그 뒤에도 남는 한두 줄을 위한 고정 확장. 얇은 구조를 지키려고 작게 둔다.
EDGE_BITE_PX = 2

#: **제품에 둘러싸인 흰 구멍**을 배경으로 볼 판정 기준.
#:
#: 의자 팔걸이와 좌판 사이 틈, 모니터 스탠드 안쪽 구멍은 배경인데 테두리와 이어지지 않아
#: 위 연결 요소 규칙에서 빠진다. 그대로 두면 새 방 안에 **흰 반점**으로 남는다
#: (2026-08-04 실측, 의자 두 장).
#:
#: 그런데 흰 키캡·흰 시계 몸통도 둘러싸인 흰 영역이다. 그것까지 채우면 제품 가운데에 방이
#: 그려진다. 둘을 가르는 것은 **평탄함**이다: 틈으로 보이는 배경은 배경과 같은 색으로 균일하고,
#: 제품의 흰 부분은 음영·경계가 있어 편차가 생긴다.
HOLE_MAX_STD = 3.0
HOLE_MAX_MEAN_DELTA = 5.0

#: 이 픽셀 수 미만의 구멍은 판정하지 않고 넘긴다.
#:
#: 작게 잡아야 한다. 의자 다리 사이·바퀴 틈처럼 **얇은 배경 조각**이 여기서 걸러지면 새 방
#: 안에 흰 반점으로 남는다 (2026-08-04 실측: 16 이었을 때 의자 밑동에 흰 점들이 남았다).
#: 이만한 크기의 흰 영역이 정말 제품의 일부라면 어차피 보이지 않는다.
HOLE_MIN_AREA_PX = 4

#: 마스크 경계를 흐리는 반경. inpaint 가 경계를 부드럽게 잇는다.
FEATHER_PX = 2


@dataclass(frozen=True)
class BackgroundMask:
    """배경 마스크와 그 판정 근거."""

    #: 흰색(255) = 다시 그릴 영역. PIL "L" 모드.
    mask: Image.Image
    #: 마스크가 화면에서 차지하는 비율(0~1).
    coverage: float
    #: 테두리 밝기 평균/편차. 흰 배경 판정의 근거다.
    border_mean: float
    border_std: float
    #: `alpha` 또는 `white`. 무엇을 보고 골랐는지.
    source: str
    #: 제품에 둘러싸인 흰 구멍을 몇 개 배경에 더했는지 (의자 팔걸이 틈 등).
    holes_filled: int = 0

    @property
    def usable(self) -> bool:
        """이 마스크로 배경을 다시 그려도 되는가.

        너무 크면 제품까지 먹었고, 너무 작으면 배경을 못 찾았다. 둘 다 그냥 넘기면
        결과를 보고서야 알게 되므로 여기서 가른다.
        """
        return MIN_SAFE_COVERAGE <= self.coverage <= MAX_SAFE_COVERAGE


def border_stats(image: Image.Image) -> tuple[float, float]:
    """네 모서리 블록의 밝기 평균과 표준편차.

    가장자리 한 줄이 아니라 모서리 **블록**을 쓴다. 제품이 프레임에 닿아 있으면 가장자리
    한 줄에 제품이 걸리는데, 모서리는 대개 비어 있다.
    """
    array = np.asarray(image.convert("RGB"), dtype=np.float32)
    height, width, _ = array.shape
    block = max(4, min(height, width) // 12)
    corners = np.concatenate(
        [
            array[:block, :block].reshape(-1, 3),
            array[:block, -block:].reshape(-1, 3),
            array[-block:, :block].reshape(-1, 3),
            array[-block:, -block:].reshape(-1, 3),
        ]
    )
    return float(corners.mean()), float(corners.std())


def is_studio_white(image: Image.Image) -> bool:
    """스튜디오 흰 배경인가. 라이프스타일 사진이면 False.

    라이프스타일 사진에는 이미 배경이 있으므로 손대지 않는다 — 실측에서 그 입력은
    프롬프트만으로 좋은 결과가 나왔다.
    """
    mean, std = border_stats(image)
    return mean > STUDIO_WHITE_MEAN and std < STUDIO_WHITE_STD


def _keep_border_components(binary: np.ndarray) -> np.ndarray:
    """`binary`(0/1)에서 이미지 테두리에 닿은 덩어리만 남긴다."""
    import cv2

    count, labels = cv2.connectedComponents(binary.astype(np.uint8), connectivity=4)
    if count <= 1:
        return np.zeros_like(binary, dtype=np.uint8)
    border = np.concatenate([labels[0, :], labels[-1, :], labels[:, 0], labels[:, -1]])
    keep = {int(label) for label in np.unique(border) if label != 0}
    if not keep:
        return np.zeros_like(binary, dtype=np.uint8)
    return np.isin(labels, list(keep)).astype(np.uint8)


def _fill_flat_holes(
    background: np.ndarray, gray: np.ndarray, threshold: int
) -> tuple[np.ndarray, int]:
    """제품에 둘러싸인 **평탄한** 흰 영역을 배경에 더한다. `(마스크, 채운 개수)`.

    판정 근거는 위 `HOLE_MAX_STD` 주석에 있다. 밝기 편차가 거의 없고 배경과 같은 밝기인
    영역만 채운다 — 흰 키캡은 음영이 있어서 남는다.
    """
    import cv2

    if not background.any():
        return background, 0
    reference = float(np.median(gray[background > 0]))

    bright = (gray >= threshold).astype(np.uint8)
    holes = bright & (background == 0)
    count, labels = cv2.connectedComponents(holes, connectivity=4)
    filled = background.copy()
    added = 0
    for label in range(1, count):
        area = labels == label
        patch = gray[area]
        if patch.size < HOLE_MIN_AREA_PX:
            continue
        if patch.std() <= HOLE_MAX_STD and abs(patch.mean() - reference) <= HOLE_MAX_MEAN_DELTA:
            filled[area] = 1
            added += 1
    return filled, added


def _absorb_halo(background: np.ndarray, gray: np.ndarray, threshold: int, rounds: int) -> np.ndarray:
    """배경에 붙은 밝은 픽셀을 배경으로 흡수한다 (조건부 팽창).

    밝은 쪽으로만 자라므로 제품의 진짜 경계(어두운 쪽)에서 멈춘다. 위 `HALO_THRESHOLD` 주석.
    """
    import cv2

    allowed = (gray >= threshold).astype(np.uint8)
    kernel = cv2.getStructuringElement(cv2.MORPH_CROSS, (3, 3))
    grown = background.copy()
    for _ in range(rounds):
        expanded = cv2.dilate(grown, kernel) & allowed
        expanded |= grown
        if np.array_equal(expanded, grown):
            break
        grown = expanded
    return grown


def build_mask(
    image: Image.Image,
    *,
    threshold: int = WHITE_THRESHOLD,
    halo_threshold: int = HALO_THRESHOLD,
    halo_rounds: int = HALO_ITERATIONS,
    fill_holes: bool = True,
    bite: int = EDGE_BITE_PX,
    feather: int = FEATHER_PX,
) -> BackgroundMask:
    """배경 마스크를 만든다. 알파가 있으면 알파를, 없으면 밝기를 쓴다.

    `image` 는 **알파를 합성하기 전** 이미지여야 한다 — 합성 후에는 투명했던 자리가
    흰색이 되어 밝기 경로로 떨어지고, 제품 안의 흰색과 구별이 어려워진다.
    """
    import cv2

    if image.mode in ("RGBA", "LA", "PA") or "transparency" in image.info:
        alpha = np.asarray(image.convert("RGBA"))[:, :, 3]
        background = (alpha < ALPHA_THRESHOLD).astype(np.uint8)
        source = "alpha"
        # 알파도 경계가 반투명이다. 흰색에 합성되면 같은 후광이 되므로 같이 처리한다.
        gray = np.asarray(to_opaque(image).convert("L"), dtype=np.uint8)
    else:
        gray = np.asarray(image.convert("L"), dtype=np.uint8)
        background = _keep_border_components(gray >= threshold)
        source = "white"

    holes_filled = 0
    if fill_holes and source == "white":
        # 알파 경로에서는 하지 않는다. 알파가 "제품" 이라고 말한 자리를 밝기로 뒤집으면
        # 정확한 정보를 추측으로 덮는 것이다 — 흰 제품이 통째로 배경이 될 수 있다.
        background, holes_filled = _fill_flat_holes(background, gray, threshold)

    if halo_rounds > 0 and background.any():
        background = _absorb_halo(background, gray, halo_threshold, halo_rounds)

    if bite > 0:
        # 배경 쪽을 넓힌다 = 제품 쪽을 먹는다. 반투명 흰 테두리를 지우기 위한 것이다.
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (bite * 2 + 1, bite * 2 + 1))
        background = cv2.dilate(background, kernel)

    coverage = float(background.mean())
    mask = Image.fromarray(background * 255, mode="L")
    if feather > 0:
        mask = mask.filter(ImageFilter.GaussianBlur(feather))

    mean, std = border_stats(to_opaque(image))
    return BackgroundMask(
        mask=mask,
        coverage=coverage,
        border_mean=mean,
        border_std=std,
        source=source,
        holes_filled=holes_filled,
    )


#: 제품이 최종 화면의 긴 변에서 차지할 비율.
#:
#: **비율이 "붙여넣은 티" 의 진짜 원인이다.** 쇼핑몰 사진은 제품이 화면의 70~80% 를 채우는데,
#: 마스크가 그 크기를 그대로 얼려 버리면 모델은 거대한 물체 주변에 방을 억지로 끼워 넣는다 —
#: 책상이 부풀고 원근이 어긋나 잘라 붙인 것처럼 보인다 (2026-08-04 실측, 의자).
#:
#: 그래서 장면을 만들기 **전에** 제품을 줄여 큰 캔버스에 다시 앉힌다.
#:
#: 다만 **제품은 여전히 주인공이어야 한다** (사용자 요구). 줄이는 목적은 "작게 보이게" 가
#: 아니라 **주변에 방을 그릴 자리를 만드는 것**이다. 0.6 은 제품이 화면을 지배하면서도
#: 앞(책상 면)과 뒤(벽)가 들어갈 틈이 남는 값이다. 더 줄이면 제품이 배경에 묻히고,
#: 더 키우면 다시 "거대한 물체 주변에 억지로 끼운 방" 이 된다.
PRODUCT_FRAME_FRACTION = 0.6

#: 제품 밑동이 화면 아래에서 이만큼 떨어진 곳에 놓인다. 그 아래가 책상 앞면이 된다.
PRODUCT_BOTTOM_MARGIN = 0.2

#: 재배치할 캔버스 크기. SDXL 이 가장 잘 그리는 해상도다.
CANVAS_SIZE = (1024, 1024)


def place_product_on_canvas(
    image: Image.Image,
    background_mask: Image.Image,
    *,
    canvas_size: tuple[int, int] = CANVAS_SIZE,
    fraction: float = PRODUCT_FRAME_FRACTION,
    bottom_margin: float = PRODUCT_BOTTOM_MARGIN,
    feather: int = FEATHER_PX,
) -> tuple[Image.Image, Image.Image]:
    """제품만 잘라 **작게 줄여** 새 캔버스에 앉힌다. `(캔버스, 새 배경 마스크)`.

    돌려주는 마스크는 제품 자리만 비어 있다 — 그 바깥 전부가 새로 그려질 영역이다.
    캔버스의 빈 곳은 중간 회색으로 둔다. 어차피 전부 다시 그려지지만, 흰색으로 두면
    1단계에서 겪은 대로 흰 배경이 살아남는 쪽으로 기운다.

    제품을 사각형으로 붙이지 않는다 — 마스크를 알파로 써서 실루엣만 옮긴다. 사각형으로
    붙이면 원래 배경의 흰 판이 함께 따라와 그 경계가 그대로 보인다.
    """
    product = ImageChops.invert(background_mask.convert("L"))
    box = product.point(lambda value: 255 if value > 127 else 0).getbbox()
    if box is None:
        raise ValueError("mask has no product region")

    cut = image.convert("RGB").crop(box)
    cut_alpha = product.crop(box)

    canvas_width, canvas_height = canvas_size
    scale = min(
        canvas_width * fraction / cut.width,
        canvas_height * fraction / cut.height,
    )
    # 확대는 하지 않는다. 늘리면 1단계에서 만든 디테일이 뭉개진다.
    scale = min(scale, 1.0)
    size = (max(1, round(cut.width * scale)), max(1, round(cut.height * scale)))
    cut = cut.resize(size, Image.LANCZOS)
    cut_alpha = cut_alpha.resize(size, Image.LANCZOS)

    left = (canvas_width - size[0]) // 2
    bottom = round(canvas_height * (1 - bottom_margin))
    top = max(0, min(bottom - size[1], canvas_height - size[1]))

    canvas = Image.new("RGB", canvas_size, (128, 128, 128))
    canvas.paste(cut, (left, top), cut_alpha)

    kept = Image.new("L", canvas_size, 0)
    kept.paste(cut_alpha, (left, top))
    mask = ImageChops.invert(kept.point(lambda value: 255 if value > 127 else 0))
    if feather > 0:
        mask = mask.filter(ImageFilter.GaussianBlur(feather))
    return canvas, mask


def to_opaque(image: Image.Image) -> Image.Image:
    """알파를 흰색에 합성한 RGB. 파이프라인이 하는 것과 같다 (image_preprocessor.to_rgb)."""
    if image.mode in ("RGBA", "LA", "PA") or "transparency" in image.info:
        rgba = image.convert("RGBA")
        white = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
        return Image.alpha_composite(white, rgba).convert("RGB")
    return image.convert("RGB")
