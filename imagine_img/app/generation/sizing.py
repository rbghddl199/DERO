"""생성/출력 크기 결정.

## 왜 이 모듈이 생겼나

이전 규격은 생성 1152x1024, 최종 1328x1184 로 **고정**이었고, 입력 비율이 2% 이상 다르면
거부했다. 사용자 지시로 바뀐 규칙은 이렇다.

> 인풋에 들어오는 이미지 사이즈 대로 만들어야 해. 아니면 비율이라도 여기에 맞춰야 해.

그래서 `SIZE_MODE=follow_input`(기본)에서는

```text
최종 출력 크기 = 입력 이미지 크기 그대로
생성 크기      = 입력 비율에 가장 가까우면서 SDXL 이 다룰 수 있는 크기
```

## 생성 크기를 입력 크기와 똑같이 두지 않는 이유

SDXL 은 약 1024x1024(약 1.05M 픽셀) 부근에서 학습됐고, 그 범위를 크게 벗어난 크기로 바로
생성하면 구도가 반복되거나(복제된 책상·모니터) 품질이 무너진다. 또 8GB VRAM 에서 픽셀 수가
늘면 그대로 OOM 으로 간다. 예: 1125x1449 는 1.63M 픽셀로 기준선의 1.4배다.

그래서 **비율은 입력에 맞추고, 픽셀 수는 예산 안으로** 맞춘 뒤 Lanczos 로 입력 크기까지
확대한다. 확대는 AI 업스케일러가 아니므로 없는 디테일을 만들지 않는다 — 기존 정책과 같다.
"""

from __future__ import annotations

from app.core.config import Settings
from app.core.errors import ErrorCode, WorkerError


def compute_generation_size(input_size: tuple[int, int], settings: Settings) -> tuple[int, int]:
    """(width, height) — 파이프라인에 넣을 크기.

    fixed 모드면 설정값을 그대로 쓴다.
    follow_input 모드면 입력 비율에 가장 가까운 `size_multiple` 배수 크기를 고른다.
    """
    if settings.size_mode == "fixed":
        return settings.generation_size

    width, height = input_size
    if width <= 0 or height <= 0:
        raise WorkerError(ErrorCode.INVALID_IMAGE, f"Invalid input size {input_size}.")

    ratio = width / height
    # **입력보다 크게 생성하지 않는다.** 예산이 입력보다 크면 입력을 늘려 넣고 다시
    # 줄이는 셈이라 시간만 더 쓴다 (2026-08-02 에 예산을 2.36M 으로 올리면서 드러났다 —
    # 1152x1024 입력에 1600x1408 생성이 잡혔다). "follow_input" 의 뜻이 그것이다:
    # 입력만큼만 그리고, 예산이 모자라면 그때만 줄인다.
    budget = min(settings.generation_pixel_budget, width * height)
    step = settings.size_multiple

    tolerance = settings.size_ratio_tolerance

    # 후보: step 배수이고 픽셀 예산을 넘지 않는 조합.
    # **픽셀 수를 최대화**하고, 비율 오차는 허용치 안에 있으면 동등하게 본다.
    #
    # 비율 오차를 먼저 최소화하면 안 된다. 그렇게 하면 예산이 조금 줄었을 때 해상도가
    # 붕괴한다 — 실측: 예산 0.79M px 에서 비율 우선 알고리즘이 448x576(0.26M px)을 골라
    # 국소 대비가 106 -> 48.7 로 무너졌다. 정확한 비율보다 픽셀 수가 품질에 훨씬 크게 기여한다.
    # 남는 비율 오차는 후처리의 중앙 crop 이 흡수한다(최대 tolerance 만큼만 잘린다).
    best: tuple[int, float, tuple[int, int]] | None = None
    max_side = 2048
    for w in range(step, max_side + 1, step):
        for h in range(step, max_side + 1, step):
            pixels = w * h
            if pixels > budget:
                continue
            drift = abs((w / h) - ratio) / ratio
            if drift > tolerance:
                continue
            key = (-pixels, round(drift, 6), (w, h))
            if best is None or key < best:
                best = key

    if best is None:
        # 허용치 안에 후보가 없으면(극단적 비율) 오차 최소값으로 되돌아간다.
        fallback: tuple[float, int, tuple[int, int]] | None = None
        for w in range(step, max_side + 1, step):
            for h in range(step, max_side + 1, step):
                if w * h > budget:
                    continue
                drift = abs((w / h) - ratio) / ratio
                key = (round(drift, 6), -(w * h), (w, h))
                if fallback is None or key < fallback:
                    fallback = key
        if fallback is None:  # pragma: no cover - step^2 <= budget 이면 항상 있다
            raise WorkerError(
                ErrorCode.CONFIGURATION_ERROR,
                f"No generation size fits the pixel budget {budget} with multiple {step}.",
            )
        return fallback[2]
    return best[2]


def compute_final_size(input_size: tuple[int, int], settings: Settings) -> tuple[int, int]:
    """(width, height) — 최종 반환 크기.

    follow_input 모드면 입력 크기 그대로다. fixed 모드면 설정값(1328x1184)이다.
    """
    if settings.size_mode == "fixed":
        return settings.final_size
    return input_size


def compute_intermediate_size(
    generation_size: tuple[int, int], final_size: tuple[int, int]
) -> tuple[int, int]:
    """Lanczos 리사이즈 중간 크기.

    최종 크기를 '덮는' 최소 배율로 확대한 크기다. 가로·세로를 서로 다른 비율로 늘리지 않는다.
    이후 중앙 crop 으로 정확히 최종 크기를 만든다.

    이 계산은 기존 고정 규격과 결과가 같다:
    1152x1024 -> 배율 max(1328/1152, 1184/1024)=1.15625 -> 1332x1184 -> 좌우 2px crop -> 1328x1184
    """
    gen_w, gen_h = generation_size
    final_w, final_h = final_size
    scale = max(final_w / gen_w, final_h / gen_h)
    return (max(round(gen_w * scale), final_w), max(round(gen_h * scale), final_h))


def describe(input_size: tuple[int, int], settings: Settings) -> dict:
    generation = compute_generation_size(input_size, settings)
    final = compute_final_size(input_size, settings)
    intermediate = compute_intermediate_size(generation, final)
    return {
        "mode": settings.size_mode,
        "inputSize": list(input_size),
        "generationSize": list(generation),
        "intermediateSize": list(intermediate),
        "finalSize": list(final),
        "generationPixels": generation[0] * generation[1],
        "inputRatio": round(input_size[0] / input_size[1], 4),
        "generationRatio": round(generation[0] / generation[1], 4),
        "ratioDriftPercent": round(
            abs(generation[0] / generation[1] - input_size[0] / input_size[1])
            / (input_size[0] / input_size[1])
            * 100,
            3,
        ),
    }
