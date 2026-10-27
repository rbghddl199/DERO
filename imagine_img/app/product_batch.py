"""제품 이미지 폴더 하나를 훑어 전부 다시 생성한다 (2026-08-04).

## 폴더 규약

```text
inputs/products/
  monitor/     <- 폴더 이름이 카테고리 코드다 (대소문자 무관, 공백은 _ 로)
    563.jpg
    785.jpg
  keyboard/
    528.jpg
```

폴더 이름이 두 가지를 정한다:

1. 프롬프트 파일의 `[when MONITOR]` 블록을 실을지 (prompt_file.py)
2. `{products}` 자리에 들어가는 영어 이름 (product_categories.py 의 표, 없으면 코드에서 만든다)

그래서 **이미지를 카테고리 폴더에 넣는 것만으로** 그 종류에 맞는 지시가 붙는다.
`inputs/products/` 바로 아래 놓인 파일은 카테고리를 알 수 없어 건너뛰고 그 사실을 보고한다 —
공통 프롬프트로 돌려버리면 모니터 화면 지시가 빠진 것을 결과를 보고서야 알게 된다.

## 왜 CLI 를 여러 번 부르지 않는가

`generate` 를 이미지마다 부르면 **매번 모델을 새로 올린다** (RealVisXL 로드 + 예열에
60~90초). 100장이면 로드에만 두 시간이다. 여기서는 한 번 올리고 돌려쓴다.

## 기본값이 실측 조합인 이유

`--strength 0.9`, `--controlnet-scale 0.45` 가 기본이다. 2026-08-04 실측에서 이 조합만
쓸 만한 결과를 냈다 (prompts/product_copyright_safe.txt 머리말에 세 번의 비교가 있다).
기본 설정(0.75 / 0.6)은 제품 실사화용이라 브랜드 문자까지 그대로 보존한다.

## 하지 않는 것

**crop 하지 않는다.** 판촉 배너를 넣으면 문자 레이아웃을 물려받는데, 어디가 제품인지는
사람이 봐야 안다. 자동으로 잘라내면 제품을 반토막 낸 이미지를 조용히 만들어 낸다.
배너는 미리 잘라서 넣을 것.
"""

from __future__ import annotations

import re
import shutil
import time
from dataclasses import dataclass
from pathlib import Path

from PIL import Image

from app.core.config import Settings
from app.core.errors import ErrorCode, WorkerError
from app.core.logging import get_logger
from app.generation.generator import generate
from app.generation.schemas import GenerationRequest, validate_job_id
from app.transport.input_loader import load_path

log = get_logger(__name__)

#: PIL 이 열 수 있고 이 파이프라인이 검증을 통과시키는 확장자.
IMAGE_SUFFIXES = frozenset({".png", ".jpg", ".jpeg", ".webp", ".bmp"})

#: 제품 하나가 화면을 얼마나 차지한다고 볼지. 제품 사진은 대상이 화면을 채우고 있으므로
#: `MIN_SCREEN_AREA_PERCENT` 하한(0.3)에 걸리지 않게 넉넉히 잡는다. 이 값은 프롬프트에
#: 이름을 넣을지 말지만 가르고, 생성 자체에는 쓰이지 않는다.
ASSUMED_SCREEN_AREA_PERCENT = 60.0

#: 카테고리별 canny 고정 강도. 없는 카테고리는 `--controlnet-scale` 값을 쓴다.
#:
#: **프롬프트로는 안 되고 이 값으로만 되는 것이 있다.** canny 는 원본의 윤곽을 픽셀 단위로
#: 붙드는데, 모니터 사진에서 그 윤곽에는 **화면에 깔린 사진과 화면 위에 얹힌 브랜드 로고**가
#: 포함된다. 프롬프트에 "다른 배경화면", 네거티브에 "logo" 를 적어도 고정된 윤곽을 이기지
#: 못한다. 그래서 카테고리마다 값이 다르다 (2026-08-04 실측, products.id=563 삼성 27인치):
#:
#: ```text
#: MONITOR  CN 0.45  화면 사진의 구도가 남고 "SAMSUNG" 로고가 선명하게 남는다   -> 못 쓴다
#: MONITOR  CN 0.15  로고와 원본 화면이 사라지고 화면이 새로 그려진다            -> 쓴다
#: KEYBOARD CN 0.45  키 격자가 유지된다. 더 낮추면 키보드가 뭉갠다               -> 쓴다
#: ```
#:
#: 즉 **화면·로고가 큰 면적을 덮는 제품은 낮게, 형태가 촘촘한 제품은 높게** 가야 한다.
#: 새 카테고리를 추가할 때는 한 장으로 두 값을 비교해 보고 여기 적을 것.
CATEGORY_CONTROLNET_SCALE: dict[str, float] = {
    "MONITOR": 0.15,
}

_UNSAFE_JOB_CHARS = re.compile(r"[^A-Za-z0-9._-]+")

#: 생성 전에 입력의 짧은 변을 이 길이까지 키운다. 0 이면 키우지 않는다.
#:
#: **쇼핑몰 썸네일을 그대로 넣으면 결과가 무너진다.** `SIZE_MODE=follow_input` 이라 생성
#: 해상도가 입력 크기에 묶이는데, SDXL 은 1024 로 학습된 모델이라 그 아래에서 급격히 나빠진다
#: (2026-08-04 실측, 492x492 입력):
#:
#: ```text
#: 492px 그대로  생성 448x448 (잠재 56x56)  -> 2010년대 저가 모니터 같은 흐린 이미지
#: 1024 로 키움   생성 1024x1024            -> 쓸 수 있다
#: ```
#:
#: Lanczos 확대는 디테일을 만들지 않는다. 디테일은 strength 0.9 의 확산이 만든다 — 확대는
#: 그 확산이 일어날 잠재 픽셀을 확보하는 것이다.
DEFAULT_UPSCALE_SHORT_SIDE = 1024

#: 완성된 최종 이미지를 한 곳에 모아 두는 폴더 이름 (출력 폴더 아래).
#:
#: 작업 폴더는 이미지마다 하나씩 생기고 그 안에 3단계 산출물이 들어 있어서, **60장이 돌는
#: 동안 어디까지 됐는지 보려면 폴더를 하나씩 열어야 한다.** 여기에 최종본만 평평하게 모아
#: 두면 파일 탐색기로 한 번에 훑어볼 수 있고, 한 장이 끝날 때마다 늘어난다.
#:
#: `_` 로 시작하는 이름이라 보관 기간 정리(output_store.cleanup_expired)가 건드리지 않는다.
GALLERY_DIR = "_final"

#: 진행 기록 파일. 한 줄이 한 장이고, 끝날 때마다 바로 덧붙인다(버퍼에 쌓아 두지 않는다).
PROGRESS_FILE = "_progress.tsv"


@dataclass(frozen=True)
class BatchItem:
    """한 장의 결과. 성공이면 output_path, 실패면 error 가 채워진다."""

    category: str
    source: Path
    job_id: str
    output_path: str | None = None
    error: str | None = None
    warnings: tuple[str, ...] = ()
    #: 이 장에 적용된 canny 강도. 카테고리마다 다를 수 있어 결과와 함께 봐야 한다.
    controlnet_scale: float | None = None
    #: 2단계 결과 (배경을 만든 것). 배경 단계를 건너뛰었으면 None.
    scene_path: str | None = None
    #: 3단계 결과 (조명·입자를 맞춘 것). 이것이 있으면 최종 산출물이다.
    final_path: str | None = None
    #: 배경 단계를 건너뛴 이유. 건너뛰지 않았으면 None.
    scene_skipped: str | None = None

    @property
    def deliverable(self) -> str | None:
        """사람이 볼 최종 이미지. 뒤 단계가 있으면 그것이 이긴다."""
        return self.final_path or self.scene_path or self.output_path

    @property
    def ok(self) -> bool:
        return self.output_path is not None


def make_job_id(category: str, source: Path, index: int, taken: set[str] | None = None) -> str:
    """`monitor/563.jpg` → `MONITOR-563`.

    jobId 는 **출력 폴더 이름**이 되므로 경로 문자와 예약어를 허용하지 않는다
    (schemas.validate_job_id). 크롤링 파일명에는 한글·괄호·공백이 섞여 있어 그대로 쓸 수 없다.

    지켜야 하는 것이 두 가지다:

    1. **이름을 억지로 살리지 않는다.** `삼성 27인치.jpg` 에서 못 쓰는 문자를 지우면 `27` 이
       남는데, 그건 파일 이름이 아니라 파일 이름의 파편이다. 살릴 수 없으면 순번을 쓴다 —
       원본 경로는 `metadata.json` 에 남으므로 어느 파일에서 나왔는지는 사후에 알 수 있다.
    2. **겹치면 안 된다.** 겹친 jobId 는 같은 출력 폴더를 가리켜 앞의 결과를 덮어쓴다.
       배치에서 조용히 결과가 사라지는 실패라서, 이미 쓴 이름은 `taken` 으로 받아 피한다.
    """
    used = taken if taken is not None else set()
    prefix = _UNSAFE_JOB_CHARS.sub("-", category).strip("-") or "batch"
    stem = source.stem
    # 문자가 하나라도 떨어져 나가면 이름이 아니라 파편이다. 그때는 순번을 쓴다.
    base = f"{prefix}-{stem}" if _UNSAFE_JOB_CHARS.sub("-", stem) == stem and stem else f"{prefix}-{index}"

    candidate = base[:64]
    try:
        validate_job_id(candidate)
    except WorkerError:
        candidate = f"batch-{index}"

    unique = candidate
    suffix = 2
    while unique in used:
        unique = f"{candidate[:60]}-{suffix}"
        suffix += 1
    used.add(unique)
    return validate_job_id(unique)


#: 카테고리가 아닌 폴더 이름. 훑지 않는다.
#:
#: `sort-products` 는 원본을 **복사**하므로 `origin/` 이 그대로 남는다. 그것까지 카테고리로
#: 보면 같은 이미지를 두 번 처리하고, 두 번째는 `ORIGIN` 카테고리라 `[when ...]` 블록도
#: 카테고리별 canny 강도도 안 붙는다 — 2026-08-04 실측으로 60장이 120장이 되고 절반이
#: "photo of a origin" 프롬프트로 나갔다. `_` 로 시작하는 폴더도 같은 뜻으로 무시한다
#: (output_store 가 `_` 접두사를 "산출물 아님" 으로 쓰는 것과 같은 규약이다).
NON_CATEGORY_DIRS = frozenset({"origin", "originals", "source", "raw", "unsorted", "trash"})


def is_category_dir(name: str) -> bool:
    return not name.startswith((".", "_")) and name.strip().lower() not in NON_CATEGORY_DIRS


def collect(root: Path, skip: Path | None = None) -> tuple[list[tuple[str, Path]], list[Path]]:
    """`(카테고리, 이미지 경로)` 목록과, 카테고리 폴더 밖에 놓인 파일 목록.

    `skip` 은 훑지 않는다. 출력 폴더를 `--root` 안에 두면(예: `--root x --out x/out`)
    **방금 만든 결과를 입력으로 다시 집는다** — 실측으로 `OUT-result` 라는 작업이 생겼다.
    보관 폴더(`NON_CATEGORY_DIRS`)도 훑지 않는다.
    """
    skipped = skip.resolve() if skip is not None else None
    found: list[tuple[str, Path]] = []
    loose: list[Path] = []
    for entry in sorted(root.iterdir()) if root.exists() else []:
        if skipped is not None and entry.is_dir() and entry.resolve() == skipped:
            continue
        if entry.is_dir() and not is_category_dir(entry.name):
            log.info("skipped %s/: not a category folder (input pile or hidden)", entry.name)
            continue
        if entry.is_dir():
            category = entry.name.strip().upper().replace(" ", "_").replace("-", "_")
            for image in sorted(entry.rglob("*")):
                if image.is_file() and image.suffix.lower() in IMAGE_SUFFIXES:
                    found.append((category, image))
        elif entry.suffix.lower() in IMAGE_SUFFIXES:
            loose.append(entry)
    return found, loose


def upscale_short_side(image, target: int):
    """짧은 변이 `target` 이 되도록 Lanczos 확대. 이미 크면 그대로 돌려준다.

    비율은 유지한다 — 제품 사진의 비율을 바꾸면 물건이 늘어난 채로 생성된다.
    """
    if target <= 0:
        return image
    width, height = image.size
    short = min(width, height)
    if short >= target:
        return image
    factor = target / short
    return image.resize((round(width * factor), round(height * factor)), Image.LANCZOS)


def record_progress(out_dir: Path, item: BatchItem, index: int, total: int) -> Path | None:
    """최종본을 `_final/` 에 모으고 진행 기록 한 줄을 덧붙인다. 모아 둔 경로를 돌려준다.

    **한 장이 끝날 때마다 바로 쓴다.** 배치가 한 시간 돌는 동안 사람이 진행을 봐야 하고,
    끝에 한 번에 쓰면 중간에 멈췄을 때 아무 기록도 남지 않는다.

    기록 실패로 생성을 중단하지 않는다 — 이미 만든 이미지를 버릴 이유가 없다.
    """
    gallery = out_dir / GALLERY_DIR
    copied: Path | None = None
    try:
        gallery.mkdir(parents=True, exist_ok=True)
        if item.deliverable:
            stage = "final" if item.final_path else ("scene" if item.scene_path else "result")
            target = gallery / f"{item.job_id}-{stage}.png"
            # 복사가 끝난 뒤에 대입한다 — 실패했는데 경로를 돌려주면 없는 파일을 가리킨다.
            shutil.copy2(item.deliverable, target)
            copied = target

        progress = out_dir / PROGRESS_FILE
        if not progress.exists():
            progress.write_text(
                "\t".join(("time", "n", "total", "job", "category", "status", "note", "source"))
                + "\n",
                encoding="utf-8",
            )
        if not item.ok:
            status, note = "FAILED", item.error or ""
        elif item.final_path:
            status, note = "ok", "final"
        elif item.scene_path:
            status, note = "ok", "scene (배경만, 조화 없음)"
        else:
            status, note = "ok-no-bg", item.scene_skipped or ""
        with progress.open("a", encoding="utf-8") as handle:
            handle.write(
                "\t".join(
                    (
                        time.strftime("%H:%M:%S"),
                        str(index),
                        str(total),
                        item.job_id,
                        item.category,
                        status,
                        note.replace("\t", " ").replace("\n", " "),
                        item.source.name,
                    )
                )
                + "\n"
            )
    except OSError as exc:
        log.warning("could not record progress for %s: %s", item.job_id, exc)
    return copied


def _add_background(
    response, request, service, seed: int
) -> tuple[str | None, str | None, str | None]:
    """1단계 결과에 배경(2단계)과 조화(3단계)를 얹는다. `(scene 경로, final 경로, 건너뛴 이유)`.

    배경 단계는 **실패해도 1단계 결과를 버리지 않는다.** 흰 배경 제품 사진이라도 쓸 수는
    있고, 이 단계는 그 위에 얹는 것이다. 건너뛴 이유는 호출부가 함께 보고한다.
    """
    from app.generation import background, scene
    from app.generation.background import build_mask
    from app.generation.prompt_file import load_prompt_file
    from app.transport import output_store

    settings = service.settings
    if not settings.prompt_file:
        return None, None, "프롬프트 파일이 없다 (배경 프롬프트는 [background] 섹션에서 읽는다)"

    codes = tuple(item.code for item in request.product_categories)
    words = [item.code.replace("_", " ").lower() for item in request.product_categories]
    loaded = load_prompt_file(settings.prompt_file, words, codes)
    if not loaded.background_prompt:
        return None, None, f"{loaded.path} 에 [background] 섹션이 없다"

    produced = Image.open(response.output_path).convert("RGB")
    mask = build_mask(produced)
    if not mask.usable:
        return None, None, (
            f"배경을 가려낼 수 없다 (마스크가 화면의 {mask.coverage:.0%}, 근거 {mask.source}) — "
            "라이프스타일 사진이거나 제품이 배경과 같은 밝기다"
        )

    # 장면을 만들기 전에 제품을 줄여 큰 캔버스에 다시 앉힌다. 원본 크기 그대로 두면
    # 모델이 거대한 물체 주변에 방을 억지로 끼워 넣어 원근이 어긋난다 (background.py).
    try:
        canvas, canvas_mask = background.place_product_on_canvas(produced, mask.mask)
    except ValueError as exc:
        return None, None, f"제품 영역을 찾지 못했다: {exc}"

    scened = scene.place_in_scene(
        canvas,
        canvas_mask,
        loaded.background_prompt,
        loaded.background_negative,
        service,
        settings,
        seed,
    )
    path = output_store.sibling_path(response.output_path, "scene")
    scened.save(path, format="PNG")

    # 3단계. 여기까지는 제품 픽셀이 얼어 있어서 "누끼 붙인" 것처럼 보인다 (scene.py).
    harmonized_path = None
    if loaded.harmonize_prompt:
        harmonized = scene.harmonize(
            scened,
            loaded.harmonize_prompt,
            loaded.harmonize_negative,
            service,
            settings,
            seed,
        )
        harmonized_path = output_store.sibling_path(response.output_path, "final")
        harmonized.save(harmonized_path, format="PNG")

    output_store.merge_metadata(
        response.metadata_path,
        {
            "background": {
                "scenePath": str(path),
                "finalPath": str(harmonized_path) if harmonized_path else None,
                "maskSource": mask.source,
                "maskCoverage": round(mask.coverage, 4),
                "maskHolesFilled": mask.holes_filled,
                "prompt": loaded.background_prompt,
                "negativePrompt": loaded.background_negative,
                "harmonizePrompt": loaded.harmonize_prompt,
                "harmonizeStrength": scene.HARMONIZE_STRENGTH,
                "seed": seed,
            }
        },
    )
    return str(path), (str(harmonized_path) if harmonized_path else None), None


def scale_for(category: str, default: float) -> float:
    """이 카테고리에 쓸 canny 강도. 표에 없으면 기본값."""
    return CATEGORY_CONTROLNET_SCALE.get(category.strip().upper(), default)


def run(
    settings: Settings,
    service,
    root: Path,
    *,
    strength: float,
    out: Path | None = None,
    min_size: int | None = None,
    upscale_to: int = DEFAULT_UPSCALE_SHORT_SIDE,
    place_background: bool = True,
    skip_existing: bool = False,
    seed: int | None = None,
    limit: int | None = None,
    on_item=None,
) -> list[BatchItem]:
    """폴더를 훑어 한 장씩 생성한다.

    한 장이 실패해도 멈추지 않는다 — 크롤링 폴더에는 512px 미만이거나 깨진 파일이
    섞여 있고, 그 한 장 때문에 나머지 99장을 다시 돌리게 만들면 안 된다. 실패 사유는
    `BatchItem.error` 로 모아 마지막에 함께 보고한다.

    `out` 을 주면 결과가 그 아래로 간다. 제품 사진 작업은 데스크 실사화와 **다른 작업**이라
    결과를 섞으면 안 된다 — `outputs/` 에 두 종류가 섞이면 어느 폴더가 무엇인지 이름만으로는
    갈리지 않고, 보관 기간 정리(`cleanup_expired`)가 둘을 같이 지운다.

    canny 강도는 카테고리마다 갈린다(`CATEGORY_CONTROLNET_SCALE`). 그 값과 `out` 은
    `service.settings` 를 장마다 갈아 끼워서 넘긴다 — generator 가 그 객체에서 읽기 때문이고,
    파이프라인 가중치와 무관한 값이라 이렇게 바꿔도 모델을 다시 올리지 않는다.
    """
    items, loose = collect(root, skip=Path(out) if out is not None else None)
    for path in loose:
        log.warning(
            "skipped %s: files directly under %s have no category. Move it into a category "
            "folder such as %s/monitor/.",
            path.name,
            root,
            root.name,
        )
    if limit is not None:
        items = items[:limit]

    results: list[BatchItem] = []
    taken: set[str] = set()
    base_settings = service.settings
    default_scale = settings.controlnet_conditioning_scale
    try:
        for index, (category, source) in enumerate(items, start=1):
            job_id = make_job_id(category, source, index, taken)

            # 이어서 돌리기. 한 시간짜리 작업이 중간에 멈췄을 때 앞의 것을 다시 만들지
            # 않는다. **jobId 는 순번을 쓸 수 있어서**(한글 파일 이름) 목록이 바뀌면 짝이
            # 어긋날 수 있으므로, 같은 폴더에 같은 순서로 다시 돌릴 때만 뜻이 있다.
            job_dir = Path(out) if out is not None else base_settings.output_dir
            done_marker = job_dir / job_id / ("final.png" if place_background else "result.png")
            if skip_existing and done_marker.exists():
                log.info("[%d/%d] %s: already done, skipped", index, len(items), job_id)
                skipped_item = BatchItem(
                    category, source, job_id, output_path=str(done_marker)
                )
                results.append(skipped_item)
                record_progress(job_dir, skipped_item, index, len(items))
                continue

            scale = scale_for(category, default_scale)
            overrides = {"controlnet_conditioning_scale": scale}
            if out is not None:
                # `model_copy` 는 검증을 다시 돌리지 않는다 — Settings 의 field_validator 가
                # 상대 경로를 절대 경로로 바꿔 주는데 이 경로로는 그게 실행되지 않는다.
                # 상대 경로가 그대로 들어가면 결과의 `resultUrl`(file URI) 을 만들 때 죽는다.
                overrides["output_dir"] = Path(out).resolve()
            if min_size is not None:
                overrides["input_min_size"] = min_size
            service.settings = base_settings.model_copy(update=overrides)
            request = GenerationRequest.model_validate(
                {
                    "jobId": job_id,
                    "strength": strength,
                    "seed": seed,
                    # jobId 가 순번으로 떨어질 수 있어서 입력 경로를 따로 남긴다 (schemas.py).
                    "sourceImagePath": str(source),
                    "productCategories": [
                        {"code": category, "screenAreaPercent": ASSUMED_SCREEN_AREA_PERCENT}
                    ],
                }
            )
            log.info(
                "[%d/%d] %s (%s, controlnet %s)", index, len(items), source.name, category, scale
            )
            try:
                image = load_path(source, service.settings)
                # **하한은 원본 크기로 검사한다.** 확대한 뒤에 넘기면 prepare() 의 검사가
                # 항상 통과해서 하한이 사라진다 — 40px 짜리 깨진 파일이 25배 확대되어
                # 뭉갠 이미지로 저장된다. 확대는 SDXL 이 쓸 해상도를 만드는 것이고,
                # "이 파일을 쓸지" 는 원본이 정한다.
                floor = service.settings.input_min_size
                if min(image.size) < floor:
                    raise WorkerError(
                        ErrorCode.INVALID_IMAGE,
                        f"Image {image.size[0]}x{image.size[1]} is smaller than the minimum "
                        f"{floor}x{floor}. Lower --min-size to use it.",
                    )
                image = upscale_short_side(image, upscale_to)
                response = generate(request, image, service)
            except WorkerError as exc:
                log.warning("failed %s: %s %s", source.name, exc.code, exc.message)
                item = BatchItem(
                    category, source, job_id, error=f"{exc.code}: {exc.message}",
                    controlnet_scale=scale,
                )
            else:
                scene_path = final_path = scene_skipped = None
                if place_background:
                    scene_path, final_path, scene_skipped = _add_background(
                        response, request, service, seed if seed is not None else 0
                    )
                item = BatchItem(
                    category,
                    source,
                    job_id,
                    output_path=response.output_path,
                    warnings=tuple(response.warnings),
                    controlnet_scale=scale,
                    scene_path=scene_path,
                    final_path=final_path,
                    scene_skipped=scene_skipped,
                )
            results.append(item)
            record_progress(job_dir, item, index, len(items))
            if on_item is not None:
                on_item(item, index, len(items))
    finally:
        # 배치가 끝나면 원래 설정으로 돌려놓는다. 같은 프로세스에서 REST 나 큐를
        # 이어 돌릴 수 있고, 그쪽이 배치가 쓴 값을 물려받으면 안 된다.
        service.settings = base_settings
    return results
