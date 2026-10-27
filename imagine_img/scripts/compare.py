"""strength 비교 스크립트 (새 지시문 §17, §18).

같은 입력·같은 seed 로 strength 0.25 / 0.35 / 0.45 를 생성하고
outputs/comparison-{timestamp}/ 에 결과와 보고서를 남긴다.

주의: steps 가 9 이상이어야 세 값이 2/3/4 step 으로 갈라진다.
steps=4 면 세 값이 모두 1 step 이라 **픽셀 단위로 동일한 이미지**가 나온다
(DESIGN_GAP_REPORT P2-3). 그래서 이 스크립트는 실행 전에 step 분리를 검사하고,
갈라지지 않으면 경고를 보고서 맨 앞에 적는다.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402

from app.core.config import STRENGTH_PRESETS, get_settings  # noqa: E402
from app.core.errors import WorkerError  # noqa: E402
from app.core.logging import setup_logging  # noqa: E402

FIXTURE = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "desk_capture.png"

#: §18 의 12개 평가 항목. 사람이 1~5점을 채운다.
SCORE_ITEMS = [
    "시뮬레이터 원본 배치 유지",
    "모니터 개수 및 위치 유지",
    "키보드·마우스·스피커 형태 유지",
    "제품 색상 유지",
    "책상과 벽의 구조 유지",
    "낮/밤 차이",
    "조명 ON/OFF 차이",
    "실제 사진 같은 재질",
    "CGI 또는 플라스틱 느낌 감소",
    "전체 실사 품질",
]
FAIL_ITEMS = [
    "모니터 개수가 변경됨",
    "책상 형태가 크게 바뀜",
    "제품이 사라지거나 추가됨",
    "의자가 비정상적으로 변형됨",
    "낮/밤 조건이 반영되지 않음",
    "조명 OFF인데 강한 조명이 생성됨",
    "결과가 명확한 일러스트 또는 3D 렌더링으로 보임",
]


def _label(strength: float) -> str:
    return f"lightning-strength-{str(strength).replace('.', '').ljust(3, '0')[:3]}"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", type=Path, default=FIXTURE)
    parser.add_argument("--time-of-day", default="NIGHT", choices=["DAY", "NIGHT"])
    parser.add_argument("--room-light", default="on", choices=["on", "off"])
    parser.add_argument("--seed", type=int, default=None)
    parser.add_argument("--mood", default="WHITE_MINIMAL")
    args = parser.parse_args()

    settings = get_settings()
    setup_logging(settings.log_level)

    from app.generation.generator import resolve_steps
    from app.generation.schemas import GenerationRequest
    from app.models.model_service import get_service
    from app.transport.input_loader import load_path

    strengths = sorted(STRENGTH_PRESETS.values())
    steps_map = {s: resolve_steps(settings, s) for s in strengths}
    effective = [steps_map[s][1] for s in strengths]
    distinguishable = len(set(effective)) == len(effective)

    stamp = time.strftime("%Y%m%d-%H%M%S")
    out_dir = settings.output_dir / f"comparison-{stamp}"
    out_dir.mkdir(parents=True, exist_ok=True)

    image = load_path(args.image, settings)
    shutil.copyfile(args.image, out_dir / "input.png")

    service = get_service()
    service.load()

    seed = settings.default_seed if args.seed is None else args.seed
    rows = []
    for strength in strengths:
        label = _label(strength)
        print(f"[{label}] strength={strength} steps={steps_map[strength]}", flush=True)
        request = GenerationRequest.model_validate(
            {
                "jobId": f"cmp-{stamp}-{label}",
                "timeOfDay": args.time_of_day,
                "roomLightOn": args.room_light == "on",
                "moodTags": [args.mood] if args.mood else [],
                "productSummary": ["single monitor", "compact keyboard", "desk lamp"],
                "strength": strength,
                "seed": seed,
            }
        )
        from app.generation.generator import generate

        try:
            response = generate(request, image, service)
        except WorkerError as exc:
            rows.append({"label": label, "strength": strength, "ok": False, "error": str(exc.code)})
            continue

        target = out_dir / f"{label}.png"
        shutil.copyfile(response.output_path, target)
        rows.append(
            {
                "label": label,
                "strength": strength,
                "ok": True,
                "requestedSteps": response.steps,
                "effectiveSteps": response.effective_steps,
                "inferenceMs": response.timing["inferenceMs"],
                "totalMs": response.timing["totalMs"],
                "peakVramMb": response.peak_vram_mb,
                "peakNvidiaSmiVramMb": response.peak_nvidia_smi_vram_mb,
                "outputSize": response.output_size,
                "prompt": response.prompt,
                "negativePrompt": response.negative_prompt,
                "file": target.name,
                "warnings": response.warnings,
            }
        )

    # 결과 간 차이를 수치로 남긴다 — "비교했다"고 쓰기 전에 실제로 다른지 확인해야 한다.
    def arr(name: str) -> np.ndarray:
        return np.asarray(Image.open(out_dir / name).convert("RGB"), dtype=np.float32)

    ok_rows = [r for r in rows if r["ok"]]
    diffs = []
    for i in range(len(ok_rows)):
        for j in range(i + 1, len(ok_rows)):
            a, b = arr(ok_rows[i]["file"]), arr(ok_rows[j]["file"])
            d = np.abs(a - b)
            diffs.append(
                {
                    "pair": f"{ok_rows[i]['strength']} vs {ok_rows[j]['strength']}",
                    "mae": round(float(d.mean()), 4),
                    "maxDiff": int(d.max()),
                    "identical": bool((d == 0).all()),
                }
            )

    report = {
        "timestamp": stamp,
        "modelProfile": settings.model_profile,
        "checkpoint": service.runtime.get("checkpoint"),
        "steps": settings.resolved_steps,
        "guidanceScale": settings.resolved_guidance_scale,
        "negativePromptProfile": settings.negative_prompt_profile,
        "negativePromptEffective": settings.supports_negative_prompt,
        "seed": seed,
        "timeOfDay": args.time_of_day,
        "roomLightOn": args.room_light == "on",
        "stepsDistinguishable": distinguishable,
        "modelLoadMs": service.model_load_ms,
        "warmupMs": service.warmup_ms,
        "runs": rows,
        "pairwiseDiff": diffs,
    }
    (out_dir / "metadata.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False, default=str), encoding="utf-8"
    )

    lines = [f"# strength 비교 보고서 — {stamp}", ""]
    if not distinguishable:
        lines += [
            "> **경고: 이 비교는 무의미하다.**",
            f"> steps={settings.resolved_steps} 에서 strength {strengths} 의 실제 denoise step 이 "
            f"{effective} 로 겹친다. 겹치는 값끼리는 완전히 같은 이미지가 나온다.",
            "> steps 를 9 이상으로 올려야 세 값이 갈라진다 (DESIGN_GAP_REPORT P2-3).",
            "",
        ]
    lines += [
        f"- 모델 프로필: `{settings.model_profile}` / checkpoint `{service.runtime.get('checkpoint')}`",
        f"- steps: {settings.resolved_steps}, guidance_scale: {settings.resolved_guidance_scale}",
        f"- 네거티브 프로필: `{settings.negative_prompt_profile}` "
        f"(실제 적용={settings.supports_negative_prompt})",
        f"- seed: {seed}, 조명: {args.time_of_day} / room light {args.room_light}",
        f"- 모델 로드 {service.model_load_ms} ms, warm-up {service.warmup_ms} ms",
        "",
        "## 생성 결과",
        "",
        "| 파일 | strength | 요청/실제 step | inference ms | total ms | peak VRAM MB | nvidia-smi MB |",
        "|---|---|---|---|---|---|---|",
    ]
    for row in rows:
        if not row["ok"]:
            lines.append(f"| {row['label']} | {row['strength']} | FAILED: {row['error']} | | | | |")
            continue
        lines.append(
            f"| `{row['file']}` | {row['strength']} | "
            f"{row['requestedSteps']}/{row['effectiveSteps']} | {row['inferenceMs']} | "
            f"{row['totalMs']} | {row['peakVramMb']:.0f} | {row['peakNvidiaSmiVramMb']:.0f} |"
        )

    lines += ["", "## 결과 간 실제 차이 (MAE, 0~255)", "", "| 비교 | MAE | 최대 픽셀차 | 완전 동일 |", "|---|---|---|---|"]
    for d in diffs:
        lines.append(f"| {d['pair']} | {d['mae']} | {d['maxDiff']} | {'예' if d['identical'] else '아니오'} |")

    lines += ["", "## 사람 평가 (§18) — 각 항목 1~5점", "", "| 항목 | " + " | ".join(str(r["strength"]) for r in ok_rows) + " |", "|---|" + "---|" * len(ok_rows)]
    for item in SCORE_ITEMS:
        lines.append(f"| {item} | " + " | ".join([" "] * len(ok_rows)) + "|")

    lines += ["", "### 실패 조건 체크 (§18) — 하나라도 해당하면 실패로 기록", ""]
    for item in FAIL_ITEMS:
        lines.append(f"- [ ] {item}")

    lines += ["", "## 프롬프트", ""]
    if ok_rows:
        lines += ["```text", ok_rows[0]["prompt"], "```", ""]
        if ok_rows[0]["negativePrompt"]:
            lines += ["네거티브:", "```text", ok_rows[0]["negativePrompt"], "```", ""]
        else:
            lines += ["네거티브: (없음 — guidance_scale 이 CFG 를 끄므로 사용되지 않는다)", ""]
        if ok_rows[0]["warnings"]:
            lines += ["경고:", *[f"- {w}" for w in ok_rows[0]["warnings"]], ""]

    (out_dir / "comparison-report.md").write_text("\n".join(lines), encoding="utf-8")
    print(f"\nwrote {out_dir / 'comparison-report.md'}")
    print("\n".join(lines[: 40]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
