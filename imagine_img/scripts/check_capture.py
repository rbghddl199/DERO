"""캡처가 스펙대로 렌더됐는지 **생성 없이** 검사한다.

GPU 도 모델도 쓰지 않는다. 1초 안에 끝난다.
렌더 설정이 틀렸으면 18.7초짜리 생성을 돌리기 전에 알 수 있다.

```powershell
.\.venv\Scripts\python.exe scripts\check_capture.py inputs\render.png
.\.venv\Scripts\python.exe scripts\check_capture.py inputs\*.png     # 여러 장 비교
```

판정 기준은 `docs/SIMULATOR_CAPTURE_SPEC.md` 와 같다.
"""

from __future__ import annotations

import glob
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.core.logging import setup_logging  # noqa: E402
from app.generation import sizing  # noqa: E402
from app.generation.generator import measure_shading  # noqa: E402
from app.generation.image_preprocessor import prepare  # noqa: E402

OK, WARN, BAD = "OK  ", "주의", "문제"


def _canny_edge_percent(image: Image.Image, settings) -> float:
    """ControlNet 이 구조를 붙잡을 만큼 윤곽이 있는가."""
    from app.generation import control_image

    control = control_image.build_control_image(image, settings)
    return float((np.asarray(control.convert("L")) > 127).mean() * 100)


def _flat_percent(image: Image.Image) -> float:
    """빈 단색 면의 비율. 높을수록 씬이 비어 있다."""
    from numpy.lib.stride_tricks import sliding_window_view

    gray = np.asarray(image.convert("L"), dtype=np.float32)
    return float((sliding_window_view(gray, (3, 3)).std(axis=(-1, -2)) < 2).mean() * 100)


def check(path: Path, settings) -> bool:
    image = Image.open(path)
    raw_size = image.size
    problems: list[str] = []

    print(f"\n=== {path.name} ===")

    # 1) 크기 — 생성 크기와 확대 배율
    try:
        described = sizing.describe(raw_size, settings)
        prepared = prepare(image, settings)
    except Exception as exc:
        print(f"  {BAD}  입력을 처리할 수 없다: {exc}")
        return False

    generation = described["generationSize"]
    upscale = described["finalSize"][1] / generation[1]
    size_mark = WARN if upscale > 1.6 else OK
    print(
        f"  {size_mark}  크기      {raw_size[0]}x{raw_size[1]} → 생성 {generation[0]}x{generation[1]}"
        f" (비율 오차 {described['ratioDriftPercent']}%, 확대 {upscale:.2f}배)"
    )
    if upscale > 1.6:
        problems.append(f"확대 배율 {upscale:.2f}배 — Lanczos 는 디테일을 만들지 않는다. 긴 변 1100~1250 권장")

    # 2) 음영 — 실사화가 걸리는지를 가르는 값
    shading = measure_shading(prepared)
    threshold = settings.min_shading_std
    shading_mark = OK if shading >= threshold else BAD
    print(f"  {shading_mark}  음영량    {shading:.2f}  (기준 {threshold} 이상)")
    if shading < threshold:
        problems.append(
            f"음영 {shading:.2f} < {threshold} — 툰 아웃라인이 켜져 있거나 IBL/그림자가 꺼져 있다. "
            "이 상태로는 실사화가 걸리지 않는다"
        )

    # 3) 구조 신호 — ControlNet 이 붙잡을 윤곽
    edge = _canny_edge_percent(prepared, settings)
    edge_mark = OK if edge >= 1.2 else WARN
    print(f"  {edge_mark}  윤곽 밀도 {edge:.2f}%  (1.2% 이상이면 제품이 잘 고정된다)")
    if edge < 1.2:
        problems.append(f"윤곽 {edge:.2f}% — 어두운 장면이면 제품이 바뀔 수 있다. conditioning_scale 을 0.75 이상으로")

    # 4) 씬 밀도 — 목표 사진과의 격차 대부분이 여기다
    flat = _flat_percent(prepared)
    flat_mark = OK if flat < 70 else WARN
    print(f"  {flat_mark}  빈 면 비율 {flat:.1f}%  (목표 사진은 47~60%)")
    if flat >= 70:
        problems.append(f"화면의 {flat:.0f}% 가 빈 단색 면이다 — 소품·식물·직물로 씬을 채우면 크게 좋아진다")

    # 5) 밝기 — 조명 상태가 실제로 구워져 있는지
    brightness = float(np.asarray(prepared.convert("RGB"), dtype=np.float32).mean())
    print(f"  {OK}  평균 밝기 {brightness:.1f}  (조명 상태별로 이 값이 뚜렷이 달라야 한다)")

    if problems:
        print("\n  고칠 것:")
        for item in problems:
            print(f"    - {item}")
    else:
        print("\n  스펙을 만족한다. 생성해도 좋다.")
    return not any(p.startswith("음영") for p in problems)


def main() -> int:
    settings = get_settings()
    setup_logging("ERROR")

    patterns = sys.argv[1:]
    if not patterns:
        print(__doc__)
        return 2

    paths = [Path(p) for pattern in patterns for p in sorted(glob.glob(pattern))]
    if not paths:
        print(f"파일을 찾을 수 없다: {patterns}")
        return 2

    results = [check(path, settings) for path in paths]

    if len(paths) > 1:
        print("\n=== 조명 상태 비교 ===")
        print("조명이 구워져 있으면 밝기가 뚜렷이 갈린다. 비슷하면 렌더에 조명이 반영되지 않은 것이다.")
        for path in paths:
            image = prepare(Image.open(path), settings)
            value = float(np.asarray(image.convert("RGB"), dtype=np.float32).mean())
            print(f"  {path.name:44s} 밝기 {value:6.1f}")

    return 0 if all(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
