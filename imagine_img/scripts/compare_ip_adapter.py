"""IP-Adapter scale 을 바꿔가며 같은 캡처를 돌린다. 모델은 한 번만 올린다 (2026-08-06).

scale 0.0 이 기준선이다 — 어댑터가 붙어 있어도 기여가 `scale * attn(...)` = 0 이라
어댑터가 없는 것과 **정확히** 같다. 그래서 한 번의 로드로 켠 것과 끈 것을 비교할 수 있다
(로드를 두 번 하면 60~90초를 더 쓰고, 그 사이 다른 GPU 앱이 붙으면 비교가 오염된다).

이 스크립트가 낸 결론은 `Settings.enable_ip_adapter` 주석의 표에 있다. 레퍼런스가
좋아지거나(모니터 사진 확보) 영역 마스크가 생기면 **다시 돌려서 그 표를 갱신할 것.**

    .\\.venv\\Scripts\\python.exe scripts\\compare_ip_adapter.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO))

from app.core.config import Settings  # noqa: E402
from app.core.logging import setup_logging  # noqa: E402
from app.generation.generator import generate  # noqa: E402
from app.generation.schemas import GenerationRequest  # noqa: E402
from app.models.model_service import ModelService  # noqa: E402
from app.transport.input_loader import load_path  # noqa: E402

CAPTURE = REPO / "inputs" / "captures" / "test09" / "image.png"
OUT = REPO / "outputs"
SCALES = [0.0, 0.3, 0.5]
SEED = 42

# 실제 장면에 있는 것들. 면적은 눈대중이지만 **순서**가 뜻을 갖는다 —
# references.select 가 큰 것부터 고르고 상한에서 끊는다.
CATEGORIES = [
    {"code": "MONITOR", "screenAreaPercent": 20.0},   # 레퍼런스 0장 (FINDINGS: 화면 켜진 컷뿐)
    {"code": "CHAIR", "screenAreaPercent": 15.0},
    {"code": "DESK_MAT", "screenAreaPercent": 12.0},
    {"code": "KEYBOARD", "screenAreaPercent": 8.0},
    {"code": "SPEAKER", "screenAreaPercent": 5.0},
    {"code": "CLOCK", "screenAreaPercent": 3.0},
]


def metrics(path: Path) -> dict:
    """`scripts/compare_profiles.py::_metrics` 와 같은 식. 값을 이어서 비교하려면 같아야 한다."""
    array = np.asarray(Image.open(path).convert("L"), dtype=np.float32)
    kernel_out = (
        -4 * array[1:-1, 1:-1] + array[:-2, 1:-1] + array[2:, 1:-1]
        + array[1:-1, :-2] + array[1:-1, 2:]
    )
    rgb = np.asarray(Image.open(path).convert("RGB"), dtype=np.float32)
    gy, gx = np.gradient(array)
    magnitude = np.hypot(gx, gy)
    return {
        "laplacianVar": round(float(kernel_out.var()), 2),
        "colorStd": round(float(rgb.std()), 2),
        "edgeDensity": round(float((magnitude > 20).mean() * 100), 3),
        "meanBrightness": round(float(rgb.mean()), 2),
    }


def main() -> int:
    base = Settings(enable_ip_adapter=True, ip_adapter_scale=SCALES[0])
    setup_logging("WARNING")

    service = ModelService(base)
    print("모델 로드 중…", flush=True)
    service.load()
    print(f"로드 {service.model_load_ms}ms · 예열 {service.warmup_ms}ms", flush=True)

    rows = []
    for scale in SCALES:
        job = f"ipa-{str(scale).replace('.', '')}"
        service.settings = base.model_copy(update={"ip_adapter_scale": scale})
        request = GenerationRequest.model_validate(
            {
                "jobId": job,
                "seed": SEED,
                "productCategories": CATEGORIES,
                # 자연스러운 방 사진이 목표다. `timeOfDay`/`roomLightOn` 은 프롬프트를
                # 바꾸지 않으므로(2026-08-05 결정) 넘기지 않는다 — 넘기면 "밤을 지정했다"는
                # 오해만 남는다. 조명 문장은 아래 무드·책상 재질에서 온다.
                "moodTags": ["PINK"],
                "deskTexture": "white",
            }
        )
        image = load_path(CAPTURE, service.settings)
        response = generate(request, image, service)
        row = {
            "scale": scale,
            "job": job,
            "path": response.output_path,
            "inferenceMs": response.timing["inferenceMs"],
            "peakVramMb": round(response.peak_vram_mb),
            "references": [Path(r["path"]).name for r in (response.ip_adapter or {}).get("references", [])],
            "missing": [m["name"] for m in (response.ip_adapter or {}).get("missing", [])],
            **metrics(Path(response.output_path)),
        }
        rows.append(row)
        print(json.dumps(row, ensure_ascii=False), flush=True)

    # 결과가 실제로 다른지 확인한다 — "비교했다"고 쓰기 전에 픽셀이 갈렸는지 본다.
    arrays = {r["scale"]: np.asarray(Image.open(r["path"]).convert("RGB"), np.float32) for r in rows}
    diffs = []
    for i, a in enumerate(SCALES):
        for b in SCALES[i + 1 :]:
            d = np.abs(arrays[a] - arrays[b])
            diffs.append({"pair": f"{a} vs {b}", "mae": round(float(d.mean()), 3), "identical": bool((d == 0).all())})
    print(json.dumps({"pairwise": diffs}, ensure_ascii=False), flush=True)

    (OUT / "_ipa_sweep.json").write_text(
        json.dumps({"capture": str(CAPTURE), "seed": SEED, "rows": rows, "pairwise": diffs},
                   indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
