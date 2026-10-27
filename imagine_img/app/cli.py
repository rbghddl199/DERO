"""CLI 단독 실행 (설계서 §3, §20 Phase 3-19).

서버 없이 이미지 1장을 실사화한다.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Annotated

import typer
from rich.console import Console
from rich.table import Table

from app.core.config import get_settings
from app.core.errors import ConfigurationError, WorkerError
from app.core.logging import force_utf8_streams, setup_logging

# typer/rich 가 도움말을 출력하기 전에 스트림 인코딩을 맞춰야 한다.
# cp949 콘솔에서는 em dash 하나로 UnicodeEncodeError 가 나서 --help 조차 죽는다.
force_utf8_streams()

app = typer.Typer(add_completion=False, help="imagine_img — DERO 실사화 로컬 Worker")
console = Console()

#: `sort-products` 가 못 나눈 카테고리를 몇 종까지 찍을지. 나머지는 한 줄로 접는다.
UNSORTED_REPORT_LIMIT = 12


@app.command()
def generate(
    image: Annotated[Path, typer.Argument(help="시뮬레이터 캡처 이미지 (PNG/JPEG)")],
    job_id: Annotated[str, typer.Option("--job-id", help="출력 폴더 이름이 된다")] = "cli-local",
    time_of_day: Annotated[str, typer.Option(help="DAY | NIGHT")] = "DAY",
    room_light_on: Annotated[bool, typer.Option("--room-light/--no-room-light")] = True,
    strength: Annotated[
        float | None, typer.Option(help="0.25 | 0.35 | 0.45 (기본값은 IMG2IMG_STRENGTH)")
    ] = None,
    seed: Annotated[int | None, typer.Option(help="기본값은 DEFAULT_SEED")] = None,
    sharpen: Annotated[bool, typer.Option("--sharpen/--no-sharpen")] = False,
    products: Annotated[str, typer.Option(help="쉼표로 구분한 제품 요약")] = "",
    mood: Annotated[
        str, typer.Option(help="쉼표로 구분한 무드 (WHITE_MINIMAL|BLUE|PINK|BLACK|WOOD)")
    ] = "",
    prompt_file: Annotated[
        Path | None,
        typer.Option(
            "--prompt-file",
            help="프롬프트를 이 파일에서 그대로 읽는다 (조합 규칙을 우회한다). "
            "예: prompts/product_copyright_safe.txt",
        ),
    ] = None,
    category: Annotated[
        str,
        typer.Option(
            help="카테고리 코드 (예: MONITOR). 프롬프트 파일의 [when CODE] 블록을 고르고, "
            "--products 가 없으면 제품 이름도 여기서 만든다"
        ),
    ] = "",
    ip_adapter: Annotated[
        bool | None,
        typer.Option(
            "--ip-adapter/--no-ip-adapter",
            help="inputs/references/ 의 실제 제품 사진을 조건으로 건다 (기본값은 ENABLE_IP_ADAPTER)",
        ),
    ] = None,
    ip_adapter_scale: Annotated[
        float | None,
        typer.Option(help="레퍼런스를 얼마나 실을지. 올릴수록 실사감이 줄어든다 (기본 0.3)"),
    ] = None,
) -> None:
    """이미지 1장을 실사화해 outputs/<job_id>/ 에 저장한다."""
    # 아래 첫 get_settings() 가 이 값들을 집어간다 (prompt_file 과 같은 방식).
    if ip_adapter is not None:
        os.environ["ENABLE_IP_ADAPTER"] = "true" if ip_adapter else "false"
    if ip_adapter_scale is not None:
        os.environ["IP_ADAPTER_SCALE"] = str(ip_adapter_scale)
    if prompt_file is not None:
        # 환경변수로 넘긴다. `Settings` 는 `get_settings()` 가 캐시하고 모델 서비스도 같은
        # 인스턴스를 읽으므로, 여기서 만든 사본을 넘길 곳이 없다 — 아래 첫 호출이 이 값을
        # 집어간다. 이 프로세스 안에서만 유효해서 "지금 이 실행에만" 이라는 성질이 남는다.
        os.environ["PROMPT_FILE"] = str(prompt_file)

    settings = get_settings()
    setup_logging(settings.log_level)

    from app.generation.generator import generate as run_generation
    from app.generation.schemas import GenerationRequest
    from app.models.model_service import get_service
    from app.transport.input_loader import load_path

    payload = {
        "jobId": job_id,
        "timeOfDay": time_of_day.upper(),
        "roomLightOn": room_light_on,
        "strength": strength,
        "seed": seed,
        "enableSharpen": sharpen,
        "productSummary": [p.strip() for p in products.split(",") if p.strip()],
        "moodTags": [m.strip() for m in mood.split(",") if m.strip()],
    }
    if category.strip():
        from app.product_batch import ASSUMED_SCREEN_AREA_PERCENT

        payload["productCategories"] = [
            {
                "code": code.strip(),
                "screenAreaPercent": ASSUMED_SCREEN_AREA_PERCENT,
            }
            for code in category.split(",")
            if code.strip()
        ]
    request = GenerationRequest.model_validate(payload)

    service = get_service()
    try:
        source = load_path(image, settings)
        if not service.ready:
            console.print("[cyan]모델 로딩 중… (첫 실행은 수 분 걸린다)[/cyan]")
            service.load()
        response = run_generation(request, source, service)
    except WorkerError as exc:
        console.print(f"[red]{exc.code}[/red] {exc.message}")
        raise typer.Exit(code=1) from exc

    table = Table(title=f"job {response.job_id}", show_header=False)
    table.add_row("profile", response.model_profile)
    if settings.prompt_file is not None:
        table.add_row("prompt file", str(settings.prompt_file))
    table.add_row("output", response.output_path)
    table.add_row("metadata", response.metadata_path)
    table.add_row("size", f"{response.output_size['width']}x{response.output_size['height']}")
    table.add_row("seed", str(response.seed))
    table.add_row("strength", f"{response.strength} ({response.strength_preset})")
    table.add_row("steps", f"{response.steps} → 실제 {response.effective_steps}")
    table.add_row("guidance", str(response.guidance_scale))
    table.add_row("negative", f"{response.negative_prompt_profile} (적용={response.negative_prompt_effective})")
    if response.ip_adapter is not None:
        used = response.ip_adapter["references"]
        table.add_row(
            "ip-adapter",
            f"scale {response.ip_adapter['scale']} · 레퍼런스 {len(used)}장"
            + ("\n" + "\n".join(f"  {item['category']}: {Path(item['path']).name}" for item in used) if used else " (없음)"),
        )
    table.add_row("timing ms", json.dumps(response.timing))
    table.add_row("peak VRAM MB", f"{response.peak_vram_mb:.0f} (reserved {response.peak_vram_reserved_mb:.0f})")
    console.print(table)
    for warning in response.warnings:
        console.print(f"[yellow]warning[/yellow] {warning}")


@app.command()
def sort_products(
    source: Annotated[
        Path | None,
        typer.Option(
            "--from",
            help="이미지를 가져올 폴더. 생략하면 <root> 바로 아래의 파일들을 나눈다 "
            "(그때는 복사가 아니라 이동이다)",
        ),
    ] = None,
    root: Annotated[Path, typer.Option(help="카테고리 폴더를 만들 곳")] = Path("inputs/products"),
    db: Annotated[Path, typer.Option(help="크롤링 DB")] = Path(
        "../deskterior/data/deskterior.sqlite3"
    ),
    by_name: Annotated[
        bool,
        typer.Option(
            "--by-name/--by-db",
            help="파일 이름의 낱말로 나눈다 (DB 를 열지 않는다). 파일 이름이 제품 id 가 "
            "아니라 제품명일 때 쓴다",
        ),
    ] = False,
    dry_run: Annotated[
        bool, typer.Option("--dry-run/--apply", help="옮기지 않고 계획만 본다")
    ] = False,
) -> None:
    """제품 이미지를 카테고리 폴더로 나눈다. 픽셀을 보고 맞히지 않는다.

    두 가지 길이 있고, 둘 다 **근거를 확인할 수 있는 것만** 쓴다:

        --by-db (기본)  파일 이름이 제품 id (`563.jpg`) 일 때. 크롤링 DB 의 카테고리를 읽는다
        --by-name       파일 이름이 제품명일 때. 이름에 든 낱말로 나눈다

    예:

        python -m app.cli sort-products --from ../deskterior/data/images   # DB 로, 복사
        python -m app.cli sort-products --from inputs/products/origin --by-name
        python -m app.cli sort-products                              # products/ 루트를 이동
    """
    settings = get_settings()
    setup_logging(settings.log_level)

    from app.product_sort import CATEGORY_BY_KOREAN, KEYWORD_CATEGORIES, apply_plan, build_plan

    # --from 을 주지 않으면 root 자체를 훑는다. 같은 폴더 안에서 옮기는 것이므로 이동이고,
    # 다른 폴더에서 가져오는 경우는 복사다 — 크롤링 저장소는 원본이라 건드리지 않는다.
    move = source is None
    from_dir = root if source is None else source

    try:
        plans, unsorted = build_plan(from_dir, root, db, by_name=by_name)
    except ConfigurationError as exc:
        console.print(f"[red]{exc.code}[/red] {exc.message}")
        raise typer.Exit(code=1) from exc

    if not plans and not unsorted:
        console.print(f"[yellow]{from_dir}[/yellow] 에 나눌 이미지가 없다.")
        raise typer.Exit(code=0)

    counts: dict[str, int] = {}
    for plan in plans:
        counts[plan.category] = counts.get(plan.category, 0) + 1
    table = Table(title="이동" if move else "복사", show_header=True)
    table.add_column("카테고리")
    table.add_column("장수", justify="right")
    table.add_column("근거 (파일 이름의 낱말)" if by_name else "근거 (한글 카테고리)")
    for name, number in sorted(counts.items(), key=lambda item: (-item[1], item[0])):
        korean = sorted({plan.matched for plan in plans if plan.category == name})
        table.add_row(name.lower(), str(number), ", ".join(korean[:3]))
    console.print(table)

    done, already = apply_plan(plans, move=move, dry_run=dry_run)

    # 못 나눈 것은 한글 카테고리별로 접어서 **많은 것부터** 보여준다. 표에 무엇을 추가하면
    # 몇 장이 풀리는지가 보여야 다음 행동이 정해진다. 1장짜리 카테고리가 100종 넘게 나오는데
    # (크롤링에 옷·카메라·식품까지 섞여 있다) 그걸 전부 찍으면 정작 큰 항목이 안 보인다.
    by_reason: dict[str, int] = {}
    for item in unsorted:
        key = item.korean or item.reason
        by_reason[key] = by_reason.get(key, 0) + 1
    ranked = sorted(by_reason.items(), key=lambda item: (-item[1], item[0]))
    for key, number in ranked[:UNSORTED_REPORT_LIMIT]:
        console.print(f"[yellow]못 나눔[/yellow] {number}장 · {key}")
    tail = ranked[UNSORTED_REPORT_LIMIT:]
    if tail:
        console.print(
            f"[yellow]못 나눔[/yellow] {sum(number for _, number in tail)}장 · "
            f"그 외 {len(tail)}종 (대부분 1~2장짜리)"
        )

    verb = "옮길 예정" if dry_run else ("옮김" if move else "복사")
    console.print(
        f"[cyan]{done}장[/cyan] {verb}"
        + (f" · {already}장은 이미 있어서 건너뜀" if already else "")
        + (f" · {len(unsorted)}장 못 나눔" if unsorted else "")
    )
    if unsorted:
        name, size = (
            ("KEYWORD_CATEGORIES", len(KEYWORD_CATEGORIES))
            if by_name
            else ("CATEGORY_BY_KOREAN", len(CATEGORY_BY_KOREAN))
        )
        console.print(
            f"표는 [cyan]app/product_sort.py[/cyan] `{name}` "
            f"({size}개 등록됨). 못 나눈 것은 폴더를 보고 직접 넣어도 된다."
        )


@app.command()
def batch_products(
    root: Annotated[
        Path, typer.Option(help="카테고리 폴더들이 들어 있는 디렉터리")
    ] = Path("inputs/products"),
    out: Annotated[
        Path,
        typer.Option(
            help="결과를 저장할 곳. 데스크 실사화 결과(outputs/)와 섞이지 않게 따로 둔다"
        ),
    ] = Path("outputs/products"),
    prompt_file: Annotated[
        Path, typer.Option(help="프롬프트 파일")
    ] = Path("prompts/product_copyright_safe.txt"),
    strength: Annotated[
        float, typer.Option(help="2026-08-04 실측 조합의 값. 0.9 미만은 브랜드 문자를 남긴다")
    ] = 0.9,
    controlnet_scale: Annotated[
        float,
        typer.Option(
            help="canny 고정 강도의 기본값. 카테고리별 값이 정해진 것은 그쪽이 이긴다 "
            "(app/product_batch.py CATEGORY_CONTROLNET_SCALE)"
        ),
    ] = 0.45,
    min_size: Annotated[
        int | None,
        typer.Option(
            help="입력 최소 변 길이. 기본값(INPUT_MIN_SIZE=512)은 시뮬레이터 캡처용 가드라, "
            "쇼핑몰 썸네일(492px 등)을 쓰려면 낮춰야 한다"
        ),
    ] = None,
    upscale_to: Annotated[
        int,
        typer.Option(
            help="생성 전에 짧은 변을 이 길이까지 키운다 (0=끔). SDXL 은 1024 학습 모델이라 "
            "그 아래 해상도에서 급격히 나빠진다 — 492px 를 그대로 넣으면 448px 로 생성된다"
        ),
    ] = 1024,
    background: Annotated[
        bool,
        typer.Option(
            "--background/--no-background",
            help="2단계로 배경까지 만든다 (제품은 마스크로 보존하고 배경만 inpaint). "
            "결과는 같은 폴더의 scene.png",
        ),
    ] = True,
    skip_existing: Annotated[
        bool,
        typer.Option(
            "--skip-existing/--redo",
            help="이미 결과가 있는 작업을 건너뛴다. 멈춘 배치를 이어서 돌릴 때 쓴다",
        ),
    ] = False,
    seed: Annotated[int | None, typer.Option(help="기본값은 DEFAULT_SEED")] = None,
    limit: Annotated[
        int | None, typer.Option(help="앞에서 N 장만. 전부 돌리기 전에 몇 장으로 확인할 때")
    ] = None,
) -> None:
    # 대괄호는 rich 마크업이라 도움말에서 사라진다. 그래서 \[ 로 escape 하고 docstring 을
    # raw 로 둔다 — 이 명령의 설명은 [when CODE] 라는 표기가 살아 있어야 뜻이 통한다.
    r"""`<root>/<카테고리>/*.png` 를 전부 다시 생성한다 (모델은 한 번만 올린다).

    폴더 이름이 카테고리 코드가 되고, 프롬프트 파일의 \[when CODE] 블록이 그때만 붙는다:

        inputs/products/monitor/563.jpg   -> \[when MONITOR] 가 붙는다 (화면 배경 교체, CN 0.15)
        inputs/products/keyboard/528.jpg  -> \[when KEYBOARD] 가 붙는다 (키캡 각인 제거)

    입력은 **제품 1개가 찍힌 사진 1장**이어야 한다. 판촉 배너나 색상 변형 4컷은 그 구성이
    결과에 그대로 남으므로 미리 잘라서 넣을 것 (여기서 자동으로 자르지 않는다).

    한 장이 실패해도 멈추지 않고, 마지막에 실패 목록을 함께 보여준다.
    """
    # get_settings() 보다 먼저 넣어야 캐시된 Settings 가 이 값을 집어간다.
    os.environ["PROMPT_FILE"] = str(prompt_file)
    os.environ["CONTROLNET_CONDITIONING_SCALE"] = str(controlnet_scale)

    settings = get_settings()
    setup_logging(settings.log_level)

    from app.models.model_service import get_service
    from app.product_batch import collect, run, scale_for

    items, loose = collect(root, skip=out)
    if not items:
        console.print(
            f"[red]{root}[/red] 에 카테고리 폴더가 없다. "
            f"[cyan]{root}/monitor/[/cyan] 처럼 만들어 이미지를 넣을 것."
        )
        raise typer.Exit(code=1)

    counts: dict[str, int] = {}
    for category, _ in items:
        counts[category] = counts.get(category, 0) + 1
    planned = ", ".join(
        f"{name} {number}장(CN {scale_for(name, controlnet_scale)})"
        for name, number in sorted(counts.items())
    )
    console.print(
        f"[cyan]{len(items)}장[/cyan] · {planned} · strength {strength} · prompt {prompt_file}\n"
        f"결과 → [cyan]{out}[/cyan]"
    )
    for path in loose:
        console.print(
            f"[yellow]건너뜀[/yellow] {path.name} — 카테고리 폴더 안에 넣어야 한다 "
            f"(예: {root}/monitor/{path.name})"
        )

    service = get_service()
    if not service.ready:
        console.print("[cyan]모델 로딩 중… (첫 실행은 수 분 걸린다)[/cyan]")
        service.load()

    def report(item, index: int, total: int) -> None:
        if not item.ok:
            console.print(f"[red]{index}/{total}[/red] {item.job_id} — {item.error}")
            return
        target = item.deliverable
        console.print(f"[green]{index}/{total}[/green] {item.job_id} → {Path(target).name}")
        if item.scene_skipped:
            console.print(f"    [yellow]배경 없음[/yellow] {item.scene_skipped}")

    results = run(
        settings,
        service,
        root,
        strength=strength,
        out=out,
        min_size=min_size,
        upscale_to=upscale_to,
        place_background=background,
        skip_existing=skip_existing,
        seed=seed,
        limit=limit,
        on_item=report,
    )

    done = [item for item in results if item.ok]
    failed = [item for item in results if not item.ok]
    table = Table(title="batch 결과", show_header=True)
    table.add_column("카테고리")
    table.add_column("성공", justify="right")
    table.add_column("실패", justify="right")
    for name in sorted(counts):
        table.add_row(
            name,
            str(sum(1 for item in done if item.category == name)),
            str(sum(1 for item in failed if item.category == name)),
        )
    console.print(table)
    for item in failed:
        console.print(f"[red]실패[/red] {item.source} — {item.error}")
    with_scene = [item for item in done if item.scene_path]
    console.print(
        f"[cyan]{out}[/cyan] 아래에 {len(done)}장 저장"
        + (
            f" · 그중 {len(with_scene)}장은 배경까지 (scene.png) · "
            f"{len(done) - len(with_scene)}장은 배경 없이 (result.png)"
            if background
            else ""
        )
        + ".\n저작권 판단은 프롬프트가 못 한다 — 원본과 나란히 놓고 눈으로 확인할 것."
    )
    if failed and not done:
        raise typer.Exit(code=1)


@app.command()
def gate_references(
    root: Annotated[
        Path,
        typer.Option(help="카테고리 폴더가 있는 곳. 폴더 이름이 카테고리 코드로 쓰인다"),
    ] = Path("inputs/products"),
    source: Annotated[
        Path | None,
        typer.Option("--from", help="카테고리 폴더가 아닌 평평한 폴더 하나만 볼 때"),
    ] = None,
    category: Annotated[
        str, typer.Option(help="--from 과 함께 쓴다. 화면 검사(MONITOR 등)에 필요하다")
    ] = "",
    out: Annotated[
        Path | None,
        typer.Option("--out", help="통과한 것을 crop 해서 여기에 쓴다. 없으면 보고만 한다"),
    ] = None,
) -> None:
    """IP-Adapter 레퍼런스로 쓸 제품 사진을 골라 crop 한다.

    통과하는 것은 **흰/단색 배경에 제품 하나**인 사진이다. 방 안 연출 컷은 거부한다 —
    어느 물건이 판매 상품인지 픽셀만 보고는 정할 수 없어서, 추측한 crop 을 통과시키면
    조용히 엉뚱한 레퍼런스가 된다 (app/reference_gate.py 머리말).

    예:

        python -m app.cli gate-references                          # 보고만
        python -m app.cli gate-references --out inputs/references  # crop 해서 쓰기
        python -m app.cli gate-references --from ../deskterior/data/images
    """
    settings = get_settings()
    setup_logging(settings.log_level)

    from PIL import Image

    from app.product_batch import IMAGE_SUFFIXES, NON_CATEGORY_DIRS
    from app.reference_gate import Kind, judge_path, summarize

    # (경로, 카테고리) 목록을 만든다. 카테고리는 폴더 이름에서 온다 — sort-products 가
    # 이미 그렇게 나눠 놓았고, 화면 검사는 카테고리를 알아야 걸 수 있다.
    jobs: list[tuple[Path, str]] = []
    if source is not None:
        jobs = [
            (path, category.upper())
            for path in sorted(source.iterdir())
            if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES
        ]
    elif root.exists():
        for folder in sorted(p for p in root.iterdir() if p.is_dir()):
            # `origin/` 같은 스테이징 폴더는 카테고리가 아니다. `product_batch` 가 같은
            # 함정을 밟아 "photo of a origin" 프롬프트를 내보낸 적이 있어 표를 공유한다.
            if folder.name.lower() in NON_CATEGORY_DIRS or folder.name.startswith("_"):
                continue
            jobs += [
                (path, folder.name.upper())
                for path in sorted(folder.iterdir())
                if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES
            ]
    if not jobs:
        console.print(f"[yellow]{source or root}[/yellow] 에 이미지가 없다.")
        raise typer.Exit(code=0)

    verdicts = []
    written = 0
    for path, code in jobs:
        # 누끼(U2Net)까지 쓴다 — 흰 배경 마스크가 실패한 연출 컷을 살린다
        # (실측: 통과 461 → 755장). CPU 로 돌아 VRAM 을 쓰지 않는다.
        verdict = judge_path(
            path, category=code or None, model_cache_dir=settings.model_cache_dir
        )
        verdicts.append(verdict)
        if out is None or not verdict.usable or verdict.crop is None:
            continue
        destination = out / (code.lower() if code else "unknown") / path.name
        destination.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(path) as image:
            image.convert("RGB").crop(verdict.crop).save(destination)
        written += 1

    report = summarize(verdicts)
    table = Table(title="레퍼런스 게이트", show_header=True)
    table.add_column("판정")
    table.add_column("장수", justify="right")
    table.add_column("비율", justify="right")
    for kind in Kind:
        number = report.by_kind.get(kind, 0)
        if number:
            table.add_row(kind.value, str(number), f"{100 * number / report.total:.1f}%")
    console.print(table)

    # 거부 사유는 많은 것부터. 무엇을 고치면 몇 장이 풀리는지가 보여야 다음 행동이 정해진다.
    # 묶는 열쇠는 `code` 다 — `reason` 으로 묶으면 측정값 때문에 한 부류가 열 줄로 갈라진다.
    ranked = sorted(report.reasons.items(), key=lambda item: -item[1])
    for code, number in ranked[:UNSORTED_REPORT_LIMIT]:
        console.print(f"[yellow]거부[/yellow] {number}장 · {code} — {report.labels.get(code, '')}")

    console.print(
        f"[cyan]{report.usable}장[/cyan] / {report.total}장 통과 "
        f"({100 * report.usable / report.total:.1f}%)"
        + (f" · [cyan]{written}장[/cyan] crop 해서 {out} 에 씀" if out else " · 쓰지 않음 (--out 없음)")
    )


@app.command()
def serve() -> None:
    """REST API 를 띄운다 (기본 127.0.0.1:8010)."""
    from app.main import run

    run()


@app.command()
def worker() -> None:
    """Redis 큐를 바라보다가 작업이 들어오면 처리한다 (DERO ADR-0015).

    기동하면 모델을 한 번 올리고 상주한다. Ctrl-C 를 누르면 **현재 작업을 마치고** 멈춘다.

    Redis 는 SSH 터널로 붙는다 — 포트를 열지 않는다:

        ssh -N -L 6379:127.0.0.1:6379 ubuntu@<lightsail>
    """
    from app.core.config import get_settings
    from app.core.logging import setup_logging

    settings = get_settings()
    setup_logging(settings.log_level)

    from app.models.model_service import get_service
    from app.queue.consumer import QueueWorker

    try:
        raise SystemExit(QueueWorker(settings, get_service()).run())
    except WorkerError as exc:
        # 설정이 어긋난 것은 사용자가 고칠 일이다. 트레이스백으로 던지면 정작 고쳐야 할
        # 문구가 스택 사이에 묻힌다 (LOCAL_ONLY_RESULTS 가드가 여기로 온다).
        console.print(f"[red]{exc.code}[/red] {exc.message}")
        raise typer.Exit(code=1) from exc


@app.command()
def env() -> None:
    """환경 검사 결과를 출력한다."""
    from app.core.env_check import report

    report()


if __name__ == "__main__":
    app()
