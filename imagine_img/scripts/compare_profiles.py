"""모델 프로필 비교 (새 지시문 §17 테스트 D, §18).

같은 입력·같은 seed 로 여러 모델 프로필을 돌려 실사 품질을 비교한다.

8GB VRAM 에서 두 모델을 동시에 올릴 수 없으므로 **한 프로필을 끝낸 뒤 완전히 해제하고**
다음 프로필을 로드한다. 해제가 실제로 됐는지 nvidia-smi 로 확인해 보고서에 남긴다.

CFG 가 켜진 프로필에서는 네거티브 프롬프트 full/compact 도 함께 비교한다 —
guidance_scale=0 인 Lightning 에서는 측정 자체가 불가능했던 항목이다 (§10).
"""

from __future__ import annotations

import argparse
import gc
import json
import shutil
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np  # noqa: E402
import torch  # noqa: E402
from PIL import Image  # noqa: E402

from app.core.config import Settings  # noqa: E402
from app.core.errors import WorkerError  # noqa: E402
from app.core.logging import setup_logging  # noqa: E402
from app.core.metrics import nvidia_smi_used_mb  # noqa: E402

FIXTURE = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "desk_capture_night_on.png"


def _teardown(service) -> float:
    """파이프라인을 해제하고 nvidia-smi 사용량을 돌려준다."""
    from app.models import model_service as ms

    if service is not None:
        service.pipe = None
        service.ready = False
    ms.set_service(None)
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
        torch.cuda.reset_peak_memory_stats()
    gc.collect()
    return nvidia_smi_used_mb()


def _run_profile(
    out_dir: Path,
    label: str,
    settings: Settings,
    image_path: Path,
    *,
    strength: float,
    seed: int,
    negative_profile: str | None = None,
) -> dict:
    from app.generation.generator import generate
    from app.generation.schemas import GenerationRequest
    from app.models.model_service import ModelService, set_service
    from app.transport.input_loader import load_path

    if negative_profile is not None:
        settings = settings.model_copy(update={"negative_prompt_profile": negative_profile})

    service = ModelService(settings)
    set_service(service)
    row: dict = {"label": label, "profile": settings.model_profile, "ok": False}
    try:
        service.load()
        image = load_path(image_path, settings)
        request = GenerationRequest.model_validate(
            {
                "jobId": f"prof-{label}",
                "timeOfDay": "NIGHT",
                "roomLightOn": True,
                "moodTags": ["WHITE_MINIMAL"],
                "productSummary": ["single monitor", "compact keyboard", "desk lamp"],
                "strength": strength,
                "seed": seed,
            }
        )
        response = generate(request, image, service)
        target = out_dir / f"{label}.png"
        shutil.copyfile(response.output_path, target)
        row.update(
            {
                "ok": True,
                "file": target.name,
                "checkpoint": response.checkpoint,
                "steps": response.steps,
                "effectiveSteps": response.effective_steps,
                "guidanceScale": response.guidance_scale,
                "scheduler": service.runtime.get("scheduler"),
                "negativePromptProfile": response.negative_prompt_profile,
                "negativePromptEffective": response.negative_prompt_effective,
                "negativePrompt": response.negative_prompt,
                "prompt": response.prompt,
                "strength": response.strength,
                "inferenceMs": response.timing["inferenceMs"],
                "totalMs": response.timing["totalMs"],
                "modelLoadMs": service.model_load_ms,
                "warmupMs": service.warmup_ms,
                "peakVramMb": response.peak_vram_mb,
                "peakVramReservedMb": response.peak_vram_reserved_mb,
                "peakNvidiaSmiVramMb": response.peak_nvidia_smi_vram_mb,
                "peakRamMb": response.peak_ram_mb,
                "warnings": response.warnings,
            }
        )
    except WorkerError as exc:
        row.update({"errorCode": str(exc.code), "message": exc.message})
        print(f"  !! {label} 실패: {exc.code} {exc.message}", flush=True)
    except Exception as exc:  # 프로필 하나가 죽어도 나머지는 계속 돈다
        row.update({"errorCode": "UNEXPECTED", "message": str(exc)})
        print(f"  !! {label} 예외: {exc}", flush=True)
    finally:
        row["vramAfterTeardownMb"] = _teardown(service)
    return row


def _metrics(path: Path) -> dict:
    """실사 품질을 대신 볼 수 있는 값들. 사람 평가를 대체하지는 않는다.

    - laplacianVar : 국소 대비(디테일)의 양. 평면 도형일수록 낮고 질감이 생기면 올라간다.
    - colorStd     : 색 분산
    - edgeDensity  : 강한 경계 픽셀 비율. 벡터 그림은 경계가 적고 사진은 많다.
    """
    array = np.asarray(Image.open(path).convert("L"), dtype=np.float32)
    kernel_out = (
        -4 * array[1:-1, 1:-1] + array[:-2, 1:-1] + array[2:, 1:-1] + array[1:-1, :-2] + array[1:-1, 2:]
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
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", type=Path, default=FIXTURE)
    parser.add_argument("--strength", type=float, default=0.35)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--photoreal-model", default="SG161222/RealVisXL_V5.0", help="sdxl_photoreal 프로필 모델 ID"
    )
    parser.add_argument("--juggernaut-model", default="", help="비우면 juggernaut 프로필은 건너뛴다")
    parser.add_argument(
        "--only", default="", help="쉼표로 구분한 라벨만 실행 (예: lightning,photoreal-neg-compact)"
    )
    args = parser.parse_args()

    setup_logging("ERROR")
    base = Settings()
    stamp = time.strftime("%Y%m%d-%H%M%S")
    out_dir = base.output_dir / f"profiles-{stamp}"
    out_dir.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(args.image, out_dir / "input.png")

    idle = nvidia_smi_used_mb()
    print(f"시작 시 GPU 사용량 {idle:.0f} MB")

    plan: list[tuple[str, Settings, str | None]] = [
        ("lightning", Settings(model_profile="sdxl_lightning"), None),
        (
            "photoreal-neg-compact",
            Settings(model_profile="sdxl_photoreal", sdxl_photoreal_model_id=args.photoreal_model),
            "compact",
        ),
        (
            "photoreal-neg-full",
            Settings(model_profile="sdxl_photoreal", sdxl_photoreal_model_id=args.photoreal_model),
            "full",
        ),
        (
            "photoreal-neg-none",
            Settings(model_profile="sdxl_photoreal", sdxl_photoreal_model_id=args.photoreal_model),
            "none",
        ),
    ]
    if args.juggernaut_model:
        plan.append(
            (
                "juggernaut",
                Settings(model_profile="sdxl_juggernaut", sdxl_juggernaut_model_id=args.juggernaut_model),
                "compact",
            )
        )

    if args.only:
        wanted = {name.strip() for name in args.only.split(",") if name.strip()}
        plan = [entry for entry in plan if entry[0] in wanted]
        if not plan:
            print(f"--only 로 고른 라벨이 없다: {sorted(wanted)}")
            return 1

    rows = []
    for label, settings, negative in plan:
        print(f"\n[{label}] profile={settings.model_profile} negative={negative}", flush=True)
        row = _run_profile(
            out_dir,
            label,
            settings,
            args.image,
            strength=args.strength,
            seed=args.seed,
            negative_profile=negative,
        )
        if row["ok"]:
            row["metrics"] = _metrics(out_dir / row["file"])
            print(
                f"  ok  steps={row['steps']}/{row['effectiveSteps']} "
                f"inf={row['inferenceMs']}ms vram={row['peakVramMb']:.0f}MB "
                f"smi={row['peakNvidiaSmiVramMb']:.0f}MB metrics={row['metrics']}",
                flush=True,
            )
        print(f"  해제 후 GPU 사용량 {row['vramAfterTeardownMb']:.0f} MB", flush=True)
        rows.append(row)

    # 입력 자체의 지표도 같은 방식으로 재서 기준선을 만든다.
    input_resized = out_dir / "_input_resized.png"
    Image.open(args.image).convert("RGB").resize((1328, 1184), Image.Resampling.LANCZOS).save(input_resized)
    input_metrics = _metrics(input_resized)
    input_resized.unlink()

    ok_rows = [r for r in rows if r["ok"]]

    def arr(name: str) -> np.ndarray:
        return np.asarray(Image.open(out_dir / name).convert("RGB"), dtype=np.float32)

    diffs = []
    for i in range(len(ok_rows)):
        for j in range(i + 1, len(ok_rows)):
            d = np.abs(arr(ok_rows[i]["file"]) - arr(ok_rows[j]["file"]))
            diffs.append(
                {
                    "pair": f"{ok_rows[i]['label']} vs {ok_rows[j]['label']}",
                    "mae": round(float(d.mean()), 4),
                    "maxDiff": int(d.max()),
                    "identical": bool((d == 0).all()),
                }
            )

    report = {
        "timestamp": stamp,
        "input": str(args.image),
        "inputMetrics": input_metrics,
        "strength": args.strength,
        "seed": args.seed,
        "idleVramMbBeforeStart": idle,
        "rows": rows,
        "pairwiseDiff": diffs,
    }
    (out_dir / "metadata.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False, default=str), encoding="utf-8"
    )

    lines = [
        f"# 모델 프로필 비교 — {stamp}",
        "",
        f"- 입력: `{args.image.name}` (strength {args.strength}, seed {args.seed})",
        f"- 시작 시 GPU 사용량: {idle:.0f} MB",
        "",
        "## 생성 결과",
        "",
        "| 라벨 | 프로필 | scheduler | steps(요청/실제) | guidance | 네거티브 | inference ms | 모델로드 ms | peak VRAM | nvidia-smi |",
        "|---|---|---|---|---|---|---|---|---|---|",
    ]
    for row in rows:
        if not row["ok"]:
            lines.append(
                f"| {row['label']} | {row['profile']} | — | — | — | — | **{row.get('errorCode')}** | | | |"
            )
            continue
        lines.append(
            f"| `{row['file']}` | {row['profile']} | {row['scheduler']} | "
            f"{row['steps']}/{row['effectiveSteps']} | {row['guidanceScale']} | "
            f"{row['negativePromptProfile']}({'적용' if row['negativePromptEffective'] else '무효'}) | "
            f"{row['inferenceMs']} | {row['modelLoadMs']} | {row['peakVramMb']:.0f} | "
            f"{row['peakNvidiaSmiVramMb']:.0f} |"
        )

    lines += [
        "",
        "## 실사 품질 대리 지표",
        "",
        "평면 벡터 그림은 국소 대비와 경계 밀도가 낮고, 사진 같은 질감이 생기면 올라간다.",
        "사람 평가를 대체하지는 않는다.",
        "",
        "| 라벨 | laplacianVar | colorStd | edgeDensity % | 평균 밝기 |",
        "|---|---|---|---|---|",
        f"| **입력 (기준선)** | {input_metrics['laplacianVar']} | {input_metrics['colorStd']} | "
        f"{input_metrics['edgeDensity']} | {input_metrics['meanBrightness']} |",
    ]
    for row in ok_rows:
        m = row["metrics"]
        lines.append(
            f"| {row['label']} | {m['laplacianVar']} | {m['colorStd']} | "
            f"{m['edgeDensity']} | {m['meanBrightness']} |"
        )

    lines += ["", "## 결과 간 차이 (MAE, 0~255)", "", "| 비교 | MAE | 최대 픽셀차 | 완전 동일 |", "|---|---|---|---|"]
    for d in diffs:
        lines.append(f"| {d['pair']} | {d['mae']} | {d['maxDiff']} | {'예' if d['identical'] else '아니오'} |")

    lines += ["", "## 사람 평가 (§18) — 1~5점", "", "| 항목 | " + " | ".join(r["label"] for r in ok_rows) + " |", "|---|" + "---|" * len(ok_rows)]
    for item in [
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
    ]:
        lines.append(f"| {item} | " + " | ".join([" "] * len(ok_rows)) + "|")

    lines += ["", "## 프롬프트", ""]
    for row in ok_rows:
        lines += [f"### {row['label']}", "```text", row["prompt"], "```"]
        if row["negativePrompt"]:
            lines += ["네거티브:", "```text", row["negativePrompt"], "```"]
        else:
            lines += ["네거티브: (없음/무효)"]
        lines.append("")

    (out_dir / "comparison-report.md").write_text("\n".join(lines), encoding="utf-8")
    print("\n" + "\n".join(lines[:60]))
    print(f"\nwrote {out_dir / 'comparison-report.md'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
