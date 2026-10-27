"""타일 SD 업스케일 — 확대로 잃은 디테일을 되찾는다 (2026-08-05).

## 왜 필요한가

출력이 생성 해상도보다 크면 LANCZOS 로 늘리는데, **그 확대가 화질 손실의 거의 전부다**
(2026-08-05 실측, test8 = 2152x1398):

```text
입력 원본 (2152)                    선명도 34.3
  → 1856 으로 줄임                        41.9
  → 2152 로 다시 늘림 (LANCZOS)           25.2   <- 모델을 안 거쳐도 26% 손실
실제 출력 (확대 있음)                     26.9   <- 왕복 리사이즈와 거의 같다
실제 출력 (확대 없음, 1856)               48.0   <- 모델은 오히려 디테일을 더한다
```

즉 흐려지는 것은 모델이 아니라 리사이즈다. 늘린 뒤 **낮은 strength 로 한 번 더 그려**
잃은 고주파를 되채우는 것이 표준 해법이고(SD upscale), 그것을 타일로 나눠서 한다.

## 그런데 이 구현은 **이 경우에 이득이 없었다** (2026-08-05 실측)

test8 에서 켜 보니 선명도가 오히려 내려갔다:

```text
LANCZOS 확대만                     26.9
+ 타일 SD 정련 (겹침 과다, 31% 단일)   20.8
+ 타일 SD 정련 (겹침 수정, 84% 단일)   24.2   <- 나아졌지만 여전히 아래
확대 없이 생성 (1856, 참고)           48.0
```

크롭으로 눈으로 봐도 더 **부드럽다**(키캡·정리함 모서리가 뭉갠다). 원인은 **VAE 왕복**이다:
타일마다 잠재공간(1/8)으로 인코딩했다가 디코딩하는데, strength 0.25 면 잠재가 거의 안
바뀌어서 결과가 사실상 "LANCZOS 이미지의 VAE 왕복" 이 된다. SDXL VAE 의 디테일 하한이
있어 그 왕복 자체가 손실이고, 7 step 짜리 디노이즈가 그걸 못 메운다.

일반적인 SD 업스케일이 통하는 조건은 **strength 0.35~0.5 로 실제로 다시 그리는** 것인데,
이 파이프라인은 제품이 바뀌면 실패이므로 그 강도를 쓸 수 없다(`MAX_REFINE_STRENGTH`).

**그래서 기본 OFF 다.** 코드는 남긴다 — 다른 입력·다른 배율에서는 다를 수 있고, 무엇을
시도했고 왜 안 됐는지가 남아야 같은 것을 다시 만들지 않는다.

측정된 최선은 여전히 **확대를 만들지 않는 것**이다: 2048x1152 로 캡처하면 확대가 0 이다.
확대가 불가피하면 VAE 를 거치지 않는 **전용 업스케일러**(Real-ESRGAN 계열)가 맞는 도구다.

## 왜 타일인가

늘린 이미지는 생성 픽셀 예산을 넘는다 — 예산을 넘겨 한 번에 돌리면 그게 다시 축소를
불러서 원점이다. 타일은 **한 장의 크기를 예산 안에 두면서** 최종 해상도를 지킨다.
VRAM 도 안전하다: 실측에서 해상도 종속분은 픽셀당 약 0.0004MB 라 768~1024 타일 하나는
100MB 안쪽이다(고정비 5.6GB 가 지배한다).

## 왜 strength 를 낮게 두는가

이 단계는 **디테일 복원**이고 재생성이 아니다. strength 를 실사화 본단계(0.75~0.9)처럼
주면 타일마다 제품을 다르게 다시 그려서 **경계에서 물건이 어긋난다** — 오른쪽 타일의
키보드와 왼쪽 타일의 키보드가 다른 키보드가 된다. 그래서 상한을 걸어 둔다.

## 경계

겹쳐 자르고 **페더(선형 가중)로 섞는다.** 겹치지 않고 이어 붙이면 타일마다 노이즈가
독립적이라 경계에 계단이 남는다.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

import numpy as np
from PIL import Image

#: 타일 한 변의 하한. SDXL 은 1024 학습이라 512 아래에서 형태가 무너진다
#: (product-image 작업에서 492px 입력이 무너진 것과 같은 이유).
MIN_TILE = 512

#: 기본 타일 · 겹침. 1024 는 SDXL 의 학습 해상도이고, 겹침 128 은 페더를 줄 여유다.
DEFAULT_TILE = 1024
DEFAULT_OVERLAP = 128

#: 정련 strength 상한과 기본값. 위 "왜 낮게 두는가" 참고.
MAX_REFINE_STRENGTH = 0.35
DEFAULT_REFINE_STRENGTH = 0.25


def _ceil_div(numerator: int, denominator: int) -> int:
    return -(-numerator // denominator)


@dataclass(frozen=True)
class TileGrid:
    boxes: list[tuple[int, int, int, int]]
    tile: int
    overlap: int


def plan_tiles(width: int, height: int, *, tile: int, overlap: int) -> TileGrid:
    """이미지를 덮는 타일 박스 목록. **모든 픽셀이 적어도 한 번 덮인다.**

    덮이지 않은 픽셀이 있으면 그 자리는 늘린 그대로 남아 주변보다 흐리다 — 부분만 선명한
    이미지가 더 이상하므로 계획 단계에서 전수를 보장한다.
    """
    if tile < MIN_TILE:
        raise ValueError(f"tile must be >= {MIN_TILE} (SDXL collapses below it); got {tile}")
    if overlap >= tile:
        raise ValueError(f"overlap({overlap}) must be smaller than tile({tile}) or stride is 0")

    def axis(extent: int) -> tuple[list[int], int]:
        """`(시작 좌표들, 실제 타일 크기)`.

        **타일 크기를 고정하지 않고 줄인다.** `tile` 은 상한일 뿐이다.

        고정했을 때 무슨 일이 나는지: 2152 를 1024 타일로 덮으려면 3장이 필요한데
        3x1024 = 3072 라 920px 이 강제로 겹친다. 그 겹침이 전부 평균으로 들어가서
        한 번만 덮인 픽셀이 31% 로 떨어졌고, 정련이 선명도를 26.9 → 20.8 로 **낮췄다**
        (2026-08-05 실측). 겹침은 이음매를 감추는 장치이고 화면의 대부분이어서는 안 된다.

        그래서 필요한 장수를 먼저 정하고, **그 장수로 요청한 겹침만 남게 타일을 줄인다.**
        """
        if extent <= tile:
            return [0], extent
        # 몇 장이 필요한가 — 상한 타일 기준의 하한이다.
        count = _ceil_div(extent - overlap, tile - overlap)
        # 그 장수로 `extent` 를 덮으려면 타일이 최소 얼마여야 하는가.
        #   (count-1)*(sized-overlap) + sized >= extent
        #   -> sized >= (extent + (count-1)*overlap) / count
        needed = _ceil_div(extent + (count - 1) * overlap, count)
        # 64 배수로 올린다 — 파이프라인이 어차피 맞추므로 미리 맞춰야 자리 계산이 어긋나지 않는다.
        sized = min(tile, _ceil_div(needed, 64) * 64)
        stride = sized - overlap
        # 마지막 타일은 끝에 붙인다. `count` 를 상한 타일로 셌으므로 줄인 타일에서는
        # 한 장이 모자랄 수 있다 — 그때 오른쪽·아래 띠가 덮이지 않고 남는다(실측: 11%).
        values = [index * stride for index in range(count)]
        while values[-1] + sized < extent:
            values.append(values[-1] + stride)
        values[-1] = extent - sized
        return sorted(set(values)), sized

    xs, tile_w = axis(width)
    ys, tile_h = axis(height)
    boxes = [
        (x, y, min(x + tile_w, width), min(y + tile_h, height)) for y in ys for x in xs
    ]
    return TileGrid(boxes=boxes, tile=max(tile_w, tile_h), overlap=overlap)


def _feather(width: int, height: int, overlap: int) -> np.ndarray:
    """타일 가중치 — 가장자리로 갈수록 0 에 가까워지는 선형 램프.

    겹친 자리에서 두 타일의 가중치 합으로 나누므로(호출부) 램프 모양이 정확할 필요는
    없고, **가장자리에서 0 이 아니어야** 한다는 것만 중요하다. 0 이면 그 열의 가중치
    합이 0 이 되어 나눗셈이 깨진다.
    """
    ramp = max(1, min(overlap, width // 2, height // 2))
    horizontal = np.ones(width, dtype=np.float32)
    vertical = np.ones(height, dtype=np.float32)
    edge = np.linspace(1.0 / (ramp + 1), 1.0, ramp, dtype=np.float32)
    horizontal[:ramp] = edge
    horizontal[-ramp:] = edge[::-1]
    vertical[:ramp] = edge
    vertical[-ramp:] = edge[::-1]
    return vertical[:, None] * horizontal[None, :]


def refine_upscaled(
    pipe,
    image: Image.Image,
    *,
    pipe_kwargs: dict,
    tile: int = DEFAULT_TILE,
    overlap: int = DEFAULT_OVERLAP,
    strength: float = DEFAULT_REFINE_STRENGTH,
    per_tile: Callable[[Image.Image], dict] | None = None,
) -> Image.Image:
    """이미 늘려 놓은 이미지를 타일별로 낮은 strength 로 다시 그려 디테일을 되찾는다.

    `pipe_kwargs` 는 타일마다 **그대로** 넘긴다 — 프롬프트 임베딩이 타일마다 다르면
    같은 방인데 타일마다 다른 장면이 된다.

    `per_tile` 은 타일 이미지를 받아 **그 타일에만 맞는** 인자를 만든다. ControlNet 의
    조건 이미지가 그것이다 — 크기가 타일과 같아야 하므로 전체 이미지 것을 재사용할 수 없다.
    """
    if strength > MAX_REFINE_STRENGTH:
        raise ValueError(
            f"refine strength {strength} exceeds {MAX_REFINE_STRENGTH}; "
            "this pass restores detail, it does not repaint (module docstring)"
        )
    grid = plan_tiles(image.width, image.height, tile=tile, overlap=overlap)
    source = image.convert("RGB")

    accumulator = np.zeros((image.height, image.width, 3), dtype=np.float32)
    weights = np.zeros((image.height, image.width, 1), dtype=np.float32)

    for left, top, right, bottom in grid.boxes:
        patch = source.crop((left, top, right, bottom))
        extra = per_tile(patch) if per_tile else {}
        refined = pipe(image=patch, strength=strength, **pipe_kwargs, **extra).images[0]
        if refined.size != patch.size:
            # 파이프라인이 64 배수로 맞추느라 크기를 바꿀 수 있다. 되돌려야 자리가 맞는다.
            refined = refined.resize(patch.size, Image.LANCZOS)
        weight = _feather(patch.width, patch.height, overlap)[:, :, None]
        accumulator[top:bottom, left:right] += np.asarray(refined, dtype=np.float32) * weight
        weights[top:bottom, left:right] += weight

    blended = accumulator / np.maximum(weights, 1e-6)
    return Image.fromarray(np.clip(blended, 0, 255).astype(np.uint8))
