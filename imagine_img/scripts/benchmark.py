"""벤치마크 (설계서 §16, §17, §20 Phase 4-23, Phase 5).

모델은 한 번만 로드하고 여러 조합을 연속 실행한다.
결과는 outputs/_benchmark/<suite>.json 과 summary.md 로 남긴다.
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import get_settings  # noqa: E402
from app.core.errors import WorkerError  # noqa: E402
from app.core.logging import setup_logging  # noqa: E402
from app.core.metrics import nvidia_smi_used_mb  # noqa: E402

FIXTURE = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "desk_capture.png"

LIGHTING = [
    ("DAY", False),
    ("DAY", True),
    ("NIGHT", False),
    ("NIGHT", True),
]
PRESETS = ["PRESERVE", "BALANCED", "REALISTIC"]

FIXTURE_DIR = Path(__file__).resolve().parents[1] / "tests" / "fixtures"


def _lighting_fixture(time_of_day: str, room_light: bool) -> Path:
    """조명이 구워진 fixture 를 쓴다 (새 지시문 §8).

    조명 상태가 입력에 없으면 §18 의 평가 항목 6·7 을 측정할 대상 자체가 없다.
    """
    candidate = FIXTURE_DIR / f"desk_capture_{time_of_day.lower()}_{'on' if room_light else 'off'}.png"
    return candidate if candidate.exists() else FIXTURE

def _run_one(service, image, job_id: str, *, time_of_day: str, room_light: bool, preset: str, seed: int) -> dict:
    from app.generation.generator import generate
    from app.generation.schemas import GenerationRequest

    request = GenerationRequest.model_validate(
        {
            "jobId": job_id,
            "timeOfDay": time_of_day,
            "roomLightOn": room_light,
            "moodTags": ["WHITE_MINIMAL"],
            "productSummary": ["single monitor", "compact keyboard", "desk lamp"],
            "strengthPreset": preset,
            "seed": seed,
        }
    )
    started = time.time()
    try:
        response = generate(request, image, service)
    except WorkerError as exc:
        return {
            "jobId": job_id,
            "ok": False,
            "errorCode": str(exc.code),
            "message": exc.message,
            "timeOfDay": time_of_day,
            "roomLightOn": room_light,
            "strengthPreset": preset,
            "seed": seed,
        }
    return {
        "jobId": job_id,
        "ok": True,
        "timeOfDay": time_of_day,
        "roomLightOn": room_light,
        "strengthPreset": preset,
        "strength": response.strength,
        "requestedSteps": response.steps,
        "effectiveSteps": response.effective_steps,
        "seed": response.seed,
        "size": [response.output_size["width"], response.output_size["height"]],
        "timingsMs": {
            "preprocess": response.timing["preprocessMs"],
            "promptBuild": response.timing["promptBuildMs"],
            "inference": response.timing["inferenceMs"],
            "postprocess": response.timing["resizeMs"],
            "save": response.timing["saveMs"],
            "total": response.timing["totalMs"],
        },
        "memory": {
            "peakVramMb": response.peak_vram_mb,
            "peakVramReservedMb": response.peak_vram_reserved_mb,
            "peakRamMb": response.peak_ram_mb,
            "nvidiaSmiVramMb": response.peak_nvidia_smi_vram_mb,
        },
        "outputPath": response.output_path,
        "startedAtEpoch": started,
    }


def _summary(rows: list[dict]) -> dict:
    ok = [r for r in rows if r["ok"]]
    if not ok:
        return {"runs": len(rows), "succeeded": 0}
    inference = [r["timingsMs"]["inference"] for r in ok]
    total = [r["timingsMs"]["total"] for r in ok]
    return {
        "runs": len(rows),
        "succeeded": len(ok),
        "inferenceMs": {
            "min": min(inference),
            "median": int(statistics.median(inference)),
            "max": max(inference),
        },
        "totalMs": {"min": min(total), "median": int(statistics.median(total)), "max": max(total)},
        "peakTorchVramMb": max(r["memory"]["peakVramMb"] for r in ok),
        "peakNvidiaSmiVramMb": max(r["memory"]["nvidiaSmiVramMb"] for r in ok),
        "peakRamMb": max(r["memory"]["peakRamMb"] for r in ok),
        "sizes": sorted({tuple(r["size"]) for r in ok}),
    }


def _markdown(name: str, rows: list[dict], summary: dict) -> str:
    lines = [
        f"### {name}",
        "",
        "| job | time | roomLight | preset | steps(req/eff) | inference ms | total ms | peak torch VRAM MB | nvidia-smi MB | size |",
        "|---|---|---|---|---|---|---|---|---|---|",
    ]
    for row in rows:
        if not row["ok"]:
            lines.append(f"| {row['jobId']} | — | — | {row['strengthPreset']} | — | FAILED: {row['errorCode']} | | | | |")
            continue
        lines.append(
            f"| {row['jobId']} | {row['timeOfDay']} | {'ON' if row['roomLightOn'] else 'OFF'} | "
            f"{row['strengthPreset']} | {row['requestedSteps']}/{row['effectiveSteps']} | "
            f"{row['timingsMs']['inference']} | {row['timingsMs']['total']} | "
            f"{row['memory']['peakVramMb']:.0f} | {row['memory']['nvidiaSmiVramMb']:.0f} | "
            f"{row['size'][0]}x{row['size'][1]} |"
        )
    lines += ["", "```json", json.dumps(summary, indent=2), "```", ""]
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--suite", default="all", choices=["consecutive", "lighting", "strength", "all"])
    parser.add_argument("--repeat", type=int, default=10, help="consecutive suite 반복 횟수")
    parser.add_argument("--image", type=Path, default=FIXTURE)
    args = parser.parse_args()

    settings = get_settings()
    setup_logging(settings.log_level)

    from app.models.model_service import get_service
    from app.transport.input_loader import load_path

    image = load_path(args.image, settings)
    service = get_service()
    idle_vram = nvidia_smi_used_mb()
    service.load()

    suites: dict[str, list[dict]] = {}

    if args.suite in ("consecutive", "all"):
        rows = []
        for i in range(1, args.repeat + 1):
            print(f"[consecutive {i}/{args.repeat}]")
            rows.append(
                _run_one(
                    service,
                    image,
                    "bench-consecutive",
                    time_of_day="NIGHT",
                    room_light=True,
                    preset="BALANCED",
                    seed=settings.default_seed,
                )
            )
        suites["consecutive (10x, NIGHT/light ON, BALANCED)"] = rows

    if args.suite in ("lighting", "all"):
        rows = []
        for time_of_day, room_light in LIGHTING:
            label = f"{time_of_day.lower()}-{'on' if room_light else 'off'}"
            fixture = _lighting_fixture(time_of_day, room_light)
            print(f"[lighting {label}] input={fixture.name}")
            rows.append(
                _run_one(
                    service,
                    load_path(fixture, settings),
                    f"bench-light-{label}",
                    time_of_day=time_of_day,
                    room_light=room_light,
                    preset="BALANCED",
                    seed=settings.default_seed,
                )
            )
        suites["lighting (4 combos, BALANCED, 조명이 구워진 입력)"] = rows

    if args.suite in ("strength", "all"):
        rows = []
        for preset in PRESETS:
            print(f"[strength {preset}]")
            rows.append(
                _run_one(
                    service,
                    image,
                    f"bench-strength-{preset.lower()}",
                    time_of_day="NIGHT",
                    room_light=True,
                    preset=preset,
                    seed=settings.default_seed,
                )
            )
        suites["strength (0.25 / 0.35 / 0.45, same seed)"] = rows

    out_dir = settings.output_dir / "_benchmark"
    out_dir.mkdir(parents=True, exist_ok=True)

    report = {
        "idleVramMbBeforeLoad": idle_vram,
        "modelLoadMs": service.model_load_ms,
        "warmupMs": service.warmup_ms,
        "runtime": service.runtime,
        "suites": {name: {"rows": rows, "summary": _summary(rows)} for name, rows in suites.items()},
    }
    (out_dir / f"{args.suite}.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False, default=str), encoding="utf-8"
    )

    markdown = [
        f"idle VRAM before load: {idle_vram:.0f} MB",
        f"model load: {service.model_load_ms} ms, warm-up: {service.warmup_ms} ms",
        "",
    ]
    for name, rows in suites.items():
        markdown.append(_markdown(name, rows, _summary(rows)))
    summary_path = out_dir / f"{args.suite}_summary.md"
    summary_path.write_text("\n".join(markdown), encoding="utf-8")

    print("\n".join(markdown))
    print(f"\nwrote {summary_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
