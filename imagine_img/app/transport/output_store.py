"""결과 저장 (설계서 §11.2, §14).

outputs/<jobId>/result.png + metadata.json.
같은 jobId 로 다시 요청하면 기존 결과를 덮지 않고 result_002.png 로 번호를 올린다.
(10회 연속 생성 테스트가 같은 jobId 를 쓰는데 조용히 덮어쓰면 비교할 대상이 사라진다.)

이미지 저장과 metadata 쓰기를 나눈 이유: metadata 에 save 소요 시간까지 넣으려면
이미지를 먼저 저장하고 시간을 재고 나서 metadata 를 써야 한다.
"""

from __future__ import annotations

import json
import shutil
import time
from dataclasses import dataclass
from pathlib import Path

from PIL import Image

from app.core.config import Settings
from app.core.errors import ErrorCode, WorkerError
from app.core.logging import get_logger

log = get_logger(__name__)


@dataclass
class SavedOutput:
    image_path: Path
    metadata_path: Path
    attempt: int
    webp_path: Path | None = None


def _next_slot(job_dir: Path) -> SavedOutput:
    if not (job_dir / "result.png").exists():
        return SavedOutput(job_dir / "result.png", job_dir / "metadata.json", 1)
    for attempt in range(2, 1000):
        image_path = job_dir / f"result_{attempt:03d}.png"
        if not image_path.exists():
            return SavedOutput(image_path, job_dir / f"metadata_{attempt:03d}.json", attempt)
    raise WorkerError(
        ErrorCode.OUTPUT_WRITE_FAILED, f"More than 999 results already exist in {job_dir}."
    )


def save_image(image: Image.Image, job_id: str, settings: Settings) -> SavedOutput:
    """PNG 를 항상 저장하고, 설정에 따라 전달용 WebP 를 추가로 저장한다 (새 지시문 §11).

    원본 PNG 는 어떤 경우에도 보존한다 — WebP 는 손실 압축이라 품질 평가의 근거로 쓸 수 없다.
    """
    job_dir = settings.output_dir / job_id
    try:
        job_dir.mkdir(parents=True, exist_ok=True)
        saved = _next_slot(job_dir)
        # PNG 압축 최적화는 CPU 시간을 늘리므로 POC 기본값은 off.
        image.save(saved.image_path, format="PNG", optimize=settings.save_optimize_png)

        if settings.save_webp:
            webp_path = saved.image_path.with_suffix(".webp")
            image.save(webp_path, format="WEBP", quality=settings.webp_quality, method=4)
            saved.webp_path = webp_path
    except WorkerError:
        raise
    except OSError as exc:
        raise WorkerError(
            ErrorCode.OUTPUT_WRITE_FAILED, f"Cannot write output for job '{job_id}': {exc}", cause=exc
        ) from exc
    return saved


def find_result(job_id: str, settings: Settings, attempt: int | None = None) -> Path:
    """저장된 결과 이미지 경로. 백엔드가 가져갈 때 쓴다.

    attempt 를 주지 않으면 가장 최근 것을 돌려준다.
    job_id 는 호출 전에 반드시 검증해야 한다 — 경로 조작으로 outputs 밖을 읽을 수 있다.
    """
    job_dir = settings.output_dir / job_id
    if not job_dir.is_dir():
        raise WorkerError(ErrorCode.OUTPUT_WRITE_FAILED, f"No results for job '{job_id}'.")

    if attempt is not None:
        candidate = job_dir / ("result.png" if attempt == 1 else f"result_{attempt:03d}.png")
        if not candidate.exists():
            raise WorkerError(
                ErrorCode.OUTPUT_WRITE_FAILED, f"Job '{job_id}' has no attempt {attempt}."
            )
        return candidate

    results = sorted(job_dir.glob("result*.png"))
    if not results:
        raise WorkerError(ErrorCode.OUTPUT_WRITE_FAILED, f"No results for job '{job_id}'.")
    return results[-1]


#: 작업 폴더로 인정하는 표식. 하나라도 **바로 아래** 있으면 이 파이프라인이 만든 결과다.
_JOB_DIR_MARKERS = ("result*.png", "metadata*.json")


def is_job_dir(directory: Path) -> bool:
    """이 폴더가 **우리가 만든 작업 폴더**인가.

    2026-08-06 에 붙였다. 그 전에는 `outputs/` 바로 아래 디렉터리면 무엇이든 나이만 보고
    `rmtree` 했다. 그래서 제품 배치 결과를 담아 둔 `outputs/products/` 가 통째로 사라졌다 —
    그건 작업 폴더가 아니라 **작업 폴더 60개를 담은 상자**였고, 안에 있던 것들의 나이는
    보지도 않았다. 상자의 mtime 은 마지막으로 하위 폴더가 생긴 시각에 멈춰 있으니
    안쪽이 아무리 새 것이어도 상자가 늙으면 전부 같이 지워진다.

    보관 기간은 **이 파이프라인이 만든 결과**에 대한 약속이다. 사람이 `outputs/` 아래
    따로 만들어 둔 폴더까지 지울 근거는 그 약속에 없다. 그래서 표식을 확인한다.

    표식이 `result*.png` 인 이유: `save_image` 가 항상 먼저 쓰는 파일이다. metadata 만
    남은 폴더(저장 중 죽은 경우)도 우리 것이므로 같이 인정한다.
    """
    return any(next(directory.glob(pattern), None) is not None for pattern in _JOB_DIR_MARKERS)


def cleanup_expired(settings: Settings) -> int:
    """보관 기간이 지난 작업 디렉터리를 지운다. 지운 개수를 돌려준다.

    지우는 것은 **세 조건을 모두 만족한 것뿐**이다:

    ```text
    1. `_` 로 시작하지 않는다   (_benchmark 등 측정 산출물은 보관 기간과 무관하다)
    2. 작업 폴더다              (is_job_dir — 남의 폴더를 지우지 않는다)
    3. mtime 이 보관 기간보다 오래됐다
    ```

    전부 끄려면 `OUTPUT_RETENTION_HOURS=0`.
    """
    if settings.output_retention_hours <= 0:
        return 0

    cutoff = time.time() - settings.output_retention_hours * 3600
    removed = 0
    skipped: list[str] = []
    if not settings.output_dir.is_dir():
        return 0

    for entry in settings.output_dir.iterdir():
        if not entry.is_dir() or entry.name.startswith("_"):
            continue
        try:
            if entry.stat().st_mtime >= cutoff:
                continue
            if not is_job_dir(entry):
                # 조용히 넘기지 않는다. 안 지워진 이유를 남겨야 "왜 안 치워지나" 를
                # 나중에 물었을 때 답이 있다.
                skipped.append(entry.name)
                continue
            shutil.rmtree(entry)
            removed += 1
        except OSError as exc:  # 정리 실패가 생성을 막으면 안 된다
            log.warning("could not remove expired output %s: %s", entry, exc)

    if removed:
        log.info("removed %d output dir(s) older than %dh", removed, settings.output_retention_hours)
    if skipped:
        log.info(
            "kept %d expired dir(s) that are not job outputs (no result*.png/metadata*.json): %s",
            len(skipped),
            ", ".join(sorted(skipped)[:10]),
        )
    return removed


def sibling_path(image_path: Path | str, kind: str) -> Path:
    """`result_002.png` 옆에 `<kind>_002.png`. 같은 작업의 부가 산출물에 쓴다.

    번호를 그대로 물려받아야 어느 시도의 산출물인지 짝이 맞는다 — `scene.png` 하나로
    쓰면 같은 jobId 로 두 번 돌렸을 때 앞의 것을 덮어써서 비교가 불가능해진다.
    """
    path = Path(image_path)
    return path.with_name(path.name.replace("result", kind, 1))


def merge_metadata(metadata_path: Path | str, extra: dict) -> None:
    """이미 써 둔 metadata.json 에 항목을 더한다.

    생성이 끝난 뒤에야 알 수 있는 것(배경 단계 결과 등)을 남기려면 이 방법뿐이다 —
    metadata 는 생성 직후에 쓰이고, 그때는 아직 그 단계가 돌지 않았다.
    """
    path = Path(metadata_path)
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        payload.update(extra)
        path.write_text(
            json.dumps(payload, indent=2, ensure_ascii=False, default=str), encoding="utf-8"
        )
    except (OSError, ValueError) as exc:
        # metadata 갱신 실패가 결과 이미지를 버릴 이유는 아니다. 사실만 남긴다.
        log.warning("could not merge metadata into %s: %s", path, exc)


def write_metadata(saved: SavedOutput, metadata: dict) -> None:
    payload = {**metadata, "attempt": saved.attempt, "outputPath": str(saved.image_path)}
    try:
        saved.metadata_path.write_text(
            json.dumps(payload, indent=2, ensure_ascii=False, default=str), encoding="utf-8"
        )
    except OSError as exc:
        raise WorkerError(
            ErrorCode.OUTPUT_WRITE_FAILED, f"Cannot write metadata {saved.metadata_path}: {exc}", cause=exc
        ) from exc
