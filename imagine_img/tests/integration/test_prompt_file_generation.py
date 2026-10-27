"""`--prompt-file` 로 돈 생성 한 건의 흐름 전체 (fake pipeline, GPU 불필요).

여기서 보는 것은 프롬프트 문구가 아니라 **배선**이다: 파일의 글이 파이프라인 호출까지
실제로 전달되는지, 그리고 실사화 규칙이 우회됐다는 사실이 응답과 metadata 에 남는지.

같이 딸려오는 이득이 하나 있다 — 이 테스트는 저장소에 들어 있는 실제 프롬프트 파일
(`prompts/product_copyright_safe.txt`)을 읽는다. 그래서 그 파일을 고치다 자리표를
깨뜨리거나 positive 를 통째로 지우면 GPU 를 켜기 전에 여기서 걸린다.
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

from app.core.config import REPO_ROOT
from app.generation.generator import generate
from app.generation.schemas import GenerationRequest
from tests.conftest import make_capture
from tests.integration.test_cpu_pipeline import make_service

SHIPPED_PROMPT_FILE = REPO_ROOT / "prompts" / "product_copyright_safe.txt"


def test_shipped_prompt_file_reaches_the_pipeline(settings, tmp_path):
    """실제로 쓸 파일 그대로 한 건 돌린다."""
    configured = settings.model_copy(
        update={"prompt_file": SHIPPED_PROMPT_FILE, "guidance_scale": 5.0}
    )
    service = make_service(configured)
    request = GenerationRequest.model_validate(
        {"jobId": "prompt-file-01", "productSummary": ["mechanical keyboard"]}
    )

    response = generate(request, make_capture(768, 768), service)

    call = service.pipe.calls[-1]
    # 청킹 경로라 문자열 대신 임베딩이 넘어간다. 문구는 응답으로 확인한다.
    assert "prompt_embeds" in call
    assert response.prompt.startswith("a single photograph of one mechanical keyboard")
    assert "{products}" not in response.prompt
    assert "logo" in response.negative_prompt

    # 실사화 규칙이 안 돌았다는 사실이 눈에 보여야 한다.
    assert any("read verbatim" in w for w in response.warnings)
    assert "keep object positions" not in response.prompt

    metadata = json.loads(Path(response.metadata_path).read_text(encoding="utf-8"))
    assert metadata["runtime"]["promptFile"] == str(SHIPPED_PROMPT_FILE)
    assert metadata["prompt"] == response.prompt


def test_blocks_do_not_run_together_without_punctuation():
    """블록 경계에서 두 문장이 한 구절로 붙지 않아야 한다.

    파일의 빈 줄과 주석은 사라지고 남은 줄이 공백 하나로 이어붙는다. 각 블록의 마지막
    줄에 마침표/쉼표가 없으면 `realistic exposure an environment` 처럼 원래 없던 구절이
    생기고, CLIP 은 그걸 하나의 개념으로 읽는다. 실제로 처음 작성했을 때 그랬다.
    """
    from app.generation.prompt_file import load_prompt_file

    # 규칙: 뒤에 주석·빈 줄·섹션 헤더가 오는 줄 — 즉 블록의 마지막 줄 — 은 구두점으로
    # 끝난다. 파일의 마지막 줄도 예외가 아니다: `[when ... negative]` 블록이 공통
    # negative 뒤에 이어붙으므로, 마지막 줄에 쉼표가 없으면 두 항목이 한 낱말로 붙는다.
    lines = SHIPPED_PROMPT_FILE.read_text(encoding="utf-8").splitlines()
    meaningful = [
        (index, line.strip())
        for index, line in enumerate(lines)
        if line.strip() and not line.strip().startswith("#") and not line.strip().startswith("[")
    ]
    for position, (index, line) in enumerate(meaningful):
        ends_block = position + 1 == len(meaningful) or meaningful[position + 1][0] > index + 1
        if ends_block:
            assert line.endswith((".", ",")), f"line {index + 1} ends a block without punctuation: {line}"

    # 처음 깨졌던 두 자리를 직접 못 박는다.
    loaded = load_prompt_file(SHIPPED_PROMPT_FILE, ["keyboard"])
    assert "exposure an environment" not in loaded.prompt
    assert "manual illustration" not in loaded.negative_prompt


def test_batch_gives_each_category_its_own_controlnet_scale(settings, tmp_path):
    """카테고리별 canny 강도가 실제 파이프라인 호출까지 간다.

    모니터를 기본값으로 돌리면 "SAMSUNG" 로고가 남은 이미지가 나온다(2026-08-04 실측).
    값이 여기서 새면 결과를 눈으로 보기 전까지 알 수 없으므로 호출 인자로 못 박는다.
    """
    from app.product_batch import CATEGORY_CONTROLNET_SCALE, run
    from tests.conftest import make_capture

    for category in ("monitor", "keyboard"):
        folder = tmp_path / "products" / category
        folder.mkdir(parents=True)
        make_capture(768, 768).save(folder / "1.png")

    configured = settings.model_copy(
        update={
            "prompt_file": SHIPPED_PROMPT_FILE,
            "guidance_scale": 5.0,
            "enable_controlnet": True,
            "controlnet_conditioning_scale": 0.45,
            "output_dir": tmp_path / "outputs",
        }
    )
    service = make_service(configured)

    results = run(configured, service, tmp_path / "products", strength=0.9)

    assert [item.category for item in results] == ["KEYBOARD", "MONITOR"]
    assert all(item.ok for item in results), [item.error for item in results]
    scales = [call["controlnet_conditioning_scale"] for call in service.pipe.calls]
    assert scales == [0.45, CATEGORY_CONTROLNET_SCALE["MONITOR"]]
    # 배치가 끝나면 서비스 설정이 원래대로 돌아가야 한다 — 같은 프로세스에서 REST 를
    # 이어 돌릴 수 있고, 그쪽이 배치 값을 물려받으면 안 된다.
    assert service.settings.controlnet_conditioning_scale == 0.45


def test_batch_out_is_resolved_to_an_absolute_path(settings, tmp_path, monkeypatch):
    """상대 경로 `--out` 이 그대로 들어가면 resultUrl(file URI) 을 만들 때 죽는다.

    Settings 의 field_validator 가 상대 경로를 절대 경로로 바꿔 주지만, model_copy 는
    검증을 다시 돌리지 않아서 이 경로로는 실행되지 않는다.
    """
    from app.product_batch import run
    from tests.conftest import make_capture

    folder = tmp_path / "products" / "mouse"
    folder.mkdir(parents=True)
    make_capture(768, 768).save(folder / "1.png")

    configured = settings.model_copy(
        update={"prompt_file": SHIPPED_PROMPT_FILE, "guidance_scale": 5.0}
    )
    monkeypatch.chdir(tmp_path)

    results = run(configured, make_service(configured), tmp_path / "products", strength=0.45,
                  out=Path("relative/out"))

    assert results[0].ok, results[0].error
    assert Path(results[0].output_path).is_absolute()
    assert (tmp_path / "relative" / "out").is_dir()


def test_small_inputs_are_upscaled_before_generation(settings, tmp_path):
    """492px 를 그대로 넣으면 448px 로 생성돼 무너진다 (2026-08-04 실측).

    SIZE_MODE=follow_input 이라 생성 해상도가 입력 크기에 묶이고, SDXL 은 1024 학습
    모델이라 그 아래에서 급격히 나빠진다. 그래서 배치는 생성 전에 짧은 변을 키운다.
    """
    from app.product_batch import run
    from tests.conftest import make_capture

    folder = tmp_path / "products" / "mouse"
    folder.mkdir(parents=True)
    make_capture(492, 492).save(folder / "small.png")

    configured = settings.model_copy(
        update={
            "prompt_file": SHIPPED_PROMPT_FILE,
            "guidance_scale": 5.0,
            "output_dir": tmp_path / "outputs",
            "input_min_size": 300,
        }
    )
    service = make_service(configured)
    # strength 는 이 검사와 무관하다. 픽스처는 ControlNet 이 꺼져 있어 상한이 0.45 다.
    results = run(configured, service, tmp_path / "products", strength=0.45, upscale_to=1024)

    assert results[0].ok, results[0].error
    assert min(service.pipe.calls[0]["image"].size) >= 1024


def test_the_size_floor_is_measured_on_the_original_not_the_upscaled_image(settings, tmp_path):
    """확대한 뒤에 검사하면 하한이 사라진다 — 40px 깨진 파일도 통과한다."""
    from app.product_batch import run
    from tests.conftest import make_capture

    folder = tmp_path / "products" / "mouse"
    folder.mkdir(parents=True)
    make_capture(64, 64).save(folder / "tiny.png")

    configured = settings.model_copy(
        update={
            "prompt_file": SHIPPED_PROMPT_FILE,
            "guidance_scale": 5.0,
            "output_dir": tmp_path / "outputs",
            "input_min_size": 300,
        }
    )
    results = run(configured, make_service(configured), tmp_path / "products", strength=0.45)

    assert not results[0].ok
    assert "INVALID_IMAGE" in results[0].error


def test_batch_keeps_going_when_one_image_is_rejected(settings, tmp_path):
    """크롤링 폴더에는 512px 미만 파일이 섞여 있다. 한 장 때문에 멈추면 안 된다."""
    from app.product_batch import run
    from tests.conftest import make_capture

    folder = tmp_path / "products" / "mouse"
    folder.mkdir(parents=True)
    make_capture(768, 768).save(folder / "big.png")
    make_capture(256, 256).save(folder / "small.png")

    configured = settings.model_copy(
        update={
            "prompt_file": SHIPPED_PROMPT_FILE,
            "guidance_scale": 5.0,
            "output_dir": tmp_path / "outputs",
        }
    )
    results = run(configured, make_service(configured), tmp_path / "products", strength=0.45)

    by_name = {item.source.name: item for item in results}
    assert by_name["big.png"].ok
    assert not by_name["small.png"].ok
    assert "INVALID_IMAGE" in by_name["small.png"].error


def test_the_background_stage_keeps_the_product_and_paints_only_the_mask(settings, tmp_path):
    """2단계는 마스크 **밖을 건드리지 않는다.** 제품이 보존되는 것은 마스크가 하는 일이다.

    가짜 inpaint 파이프라인이 화면 전체를 초록으로 칠해도 제품 픽셀은 그대로여야 한다.
    이게 깨지면 저작권 1단계에서 만든 제품이 배경 단계에서 다른 물건으로 바뀐다.
    """
    from PIL import ImageDraw

    from app.product_batch import run
    from tests.integration.test_cpu_pipeline import FakePipe

    folder = tmp_path / "products" / "clock"
    folder.mkdir(parents=True)
    # 흰 배경 + 어두운 제품. 마스크가 배경만 잡을 수 있는 모양이다.
    source = Image.new("RGB", (700, 700), (255, 255, 255))
    ImageDraw.Draw(source).rectangle((200, 200, 500, 500), fill=(30, 30, 30))
    source.save(folder / "1.png")

    configured = settings.model_copy(
        update={
            "prompt_file": SHIPPED_PROMPT_FILE,
            "guidance_scale": 5.0,
            "output_dir": tmp_path / "outputs",
            "input_min_size": 300,
        }
    )
    service = make_service(configured)

    class GreenPipe(FakePipe):
        """마스크 영역을 알아보기 쉬운 색으로 칠하는 가짜 inpaint 파이프라인."""

        def __call__(self, **kwargs):
            self.calls.append(kwargs)
            size = kwargs["image"].size
            return type("R", (), {"images": [Image.new("RGB", size, (0, 255, 0))]})()

    inpaint = GreenPipe()
    service.inpaint_pipe = lambda: inpaint

    results = run(configured, service, tmp_path / "products", strength=0.45, upscale_to=1024)

    item = results[0]
    assert item.ok, item.error
    assert item.scene_path, item.scene_skipped
    scene = Image.open(item.scene_path).convert("RGB")  # 2단계 산출물
    stage1 = Image.open(item.output_path).convert("RGB")
    width, height = scene.size
    assert scene.getpixel((5, 5)) == (0, 255, 0), "배경은 새로 그려져야 한다"
    middle = (width // 2, height // 2)
    assert scene.getpixel(middle) == stage1.getpixel(middle), "제품 픽셀은 그대로여야 한다"
    # 배경 단계는 배경 전용 프롬프트로 돈다 (1단계 프롬프트가 실리면 방을 그리지 말라는 뜻이 된다).
    assert inpaint.calls and "mask_image" in inpaint.calls[0]

    # 3단계(조화)는 마스크 없이 화면 전체를 낮은 strength 로 다시 그린다 — 그래야 제품과
    # 방의 조명이 섞인다. 최종 산출물은 그쪽이다.
    from app.generation.scene import HARMONIZE_STRENGTH

    assert item.final_path and item.deliverable == item.final_path
    last = service.pipe.calls[-1]
    assert last["strength"] == HARMONIZE_STRENGTH
    assert "mask_image" not in last


def test_the_background_stage_is_skipped_for_lifestyle_photos(settings, tmp_path):
    """배경이 이미 있는 사진은 손대지 않는다 — 이유가 보고돼야 한다."""
    import numpy as np

    from app.product_batch import run

    folder = tmp_path / "products" / "clock"
    folder.mkdir(parents=True)
    rng = np.random.default_rng(1)
    Image.fromarray(rng.integers(40, 200, (700, 700, 3), dtype=np.uint8), "RGB").save(
        folder / "1.png"
    )

    configured = settings.model_copy(
        update={
            "prompt_file": SHIPPED_PROMPT_FILE,
            "guidance_scale": 5.0,
            "output_dir": tmp_path / "outputs",
            "input_min_size": 300,
        }
    )
    results = run(configured, make_service(configured), tmp_path / "products", strength=0.45)

    assert results[0].ok
    assert results[0].scene_path is None
    assert "배경을 가려낼 수 없다" in results[0].scene_skipped


def test_default_settings_still_build_the_desk_prompt(settings):
    """기본값(파일 없음)에서는 이 기능이 없는 것과 같아야 한다."""
    service = make_service(settings)
    response = generate(
        request := GenerationRequest.model_validate(
            {"jobId": "no-prompt-file", "productSummary": ["single monitor"]}
        ),
        make_capture(768, 768),
        service,
    )
    assert request.job_id == "no-prompt-file"
    assert response.prompt.startswith("keep object positions")
    assert not any("read verbatim" in w for w in response.warnings)
