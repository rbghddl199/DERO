"""GPU 통합 테스트 (새 지시문 §17, §18, §22).

실제 가중치와 GPU 가 필요하다. 기본 실행에서 제외되며 다음으로만 돈다:
    pytest -m gpu

모델 로드가 비싸므로 module 스코프에서 한 번만 로드한다.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.core.config import get_settings
from app.core.metrics import cuda_available
from app.generation.generator import generate
from app.generation.schemas import GenerationRequest
from app.models.model_service import ModelService
from app.transport.input_loader import load_path

pytestmark = pytest.mark.gpu

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures"
DEFAULT_FIXTURE = FIXTURES / "desk_capture.png"

LIGHTING = [("DAY", False), ("DAY", True), ("NIGHT", False), ("NIGHT", True)]


@pytest.fixture(scope="module")
def gpu_service():
    if not cuda_available():
        pytest.skip("CUDA is not available")
    service = ModelService(get_settings())
    service.load()
    return service


@pytest.fixture(scope="module")
def capture(gpu_service):
    return load_path(DEFAULT_FIXTURE, gpu_service.settings)


def _request(**overrides) -> GenerationRequest:
    return GenerationRequest.model_validate(
        {
            "jobId": "gpu-test",
            "mode": "REALISTIC",
            "timeOfDay": "NIGHT",
            "roomLightOn": True,
            "moodTags": ["WHITE_MINIMAL"],
            "productSummary": ["single monitor", "compact keyboard", "desk lamp"],
            "seed": 42,
            **overrides,
        }
    )


def test_model_is_ready_with_expected_runtime(gpu_service):
    described = gpu_service.describe()
    assert described["ready"] is True
    assert described["modelProfile"] == "sdxl_lightning"
    assert described["memoryMode"] == "model_cpu_offload"
    assert described["quantization"] == "none"
    assert described["loraEnabled"] is False
    # sdxl_lightning 프로필은 CFG 가 꺼져 있으므로 네거티브 프롬프트가 무효다.
    assert described["supportsNegativePrompt"] is False
    assert described["steps"] == 9
    assert described["guidanceScale"] == 0.0
    assert gpu_service.runtime["scheduler"] == "EulerDiscreteScheduler"
    assert gpu_service.runtime["timestepSpacing"] == "trailing"
    assert gpu_service.runtime["checkpoint"] == "sdxl_lightning_8step_unet.safetensors"
    # fp32 로 조용히 올라가지 않았는지 (DESIGN_GAP_REPORT G-16)
    assert gpu_service.runtime["dtype"] == "float16"


def test_single_generation_produces_final_size(gpu_service, capture):
    response = generate(_request(jobId="gpu-single"), capture, gpu_service)
    assert response.output_size == {"width": 1328, "height": 1184}
    assert response.generation_size == {"width": 1152, "height": 1024}
    assert Path(response.output_path).exists()
    assert response.timing["inferenceMs"] > 0
    assert response.peak_vram_mb > 0
    assert response.peak_vram_reserved_mb >= response.peak_vram_mb
    assert response.result_url.startswith("file:///")


def test_same_seed_reproduces(gpu_service, capture):
    a = generate(_request(jobId="gpu-seed"), capture, gpu_service)
    b = generate(_request(jobId="gpu-seed"), capture, gpu_service)

    from PIL import Image, ImageChops

    diff = ImageChops.difference(Image.open(a.output_path), Image.open(b.output_path))
    assert diff.getbbox() is None, "같은 seed 인데 결과가 다르다"


@pytest.mark.parametrize(("strength", "expected_steps"), [(0.25, 2), (0.35, 3), (0.45, 4)])
def test_strength_values_map_to_distinct_step_counts(gpu_service, capture, strength, expected_steps):
    response = generate(
        _request(jobId=f"gpu-s{str(strength).replace('.', '')}", strength=strength), capture, gpu_service
    )
    assert response.effective_steps == expected_steps
    assert response.steps == 9
    assert response.output_size == {"width": 1328, "height": 1184}


def test_three_strengths_produce_different_images(gpu_service, capture):
    """§17 의 비교 테스트 A·B·C 가 실제로 서로 다른 결과여야 의미가 있다.

    steps=4 였다면 세 값 모두 1 step 이 되어 픽셀 단위로 동일했다 (DESIGN_GAP_REPORT P2-3).
    """
    import numpy as np
    from PIL import Image

    images = {}
    for strength in (0.25, 0.35, 0.45):
        response = generate(
            _request(jobId=f"gpu-cmp{str(strength).replace('.', '')}", strength=strength),
            capture,
            gpu_service,
        )
        images[strength] = np.asarray(Image.open(response.output_path).convert("RGB"), dtype=np.float32)

    pairs = [(0.25, 0.35), (0.35, 0.45), (0.25, 0.45)]
    for a, b in pairs:
        mae = float(np.abs(images[a] - images[b]).mean())
        assert mae > 0.05, f"strength {a} 와 {b} 의 결과가 사실상 동일하다 (MAE {mae})"


@pytest.mark.parametrize(("time_of_day", "room_light"), LIGHTING)
def test_lighting_state_is_preserved_from_the_input(gpu_service, time_of_day, room_light):
    """§8 — 조명은 프롬프트가 만드는 게 아니라 입력 캡처가 갖고 있어야 한다.

    조명이 구워진 fixture 를 넣고, 출력 밝기가 입력 밝기를 따라가는지 본다.
    """
    import numpy as np
    from PIL import Image

    label = f"{time_of_day.lower()}-{'on' if room_light else 'off'}"
    fixture = FIXTURES / f"desk_capture_{time_of_day.lower()}_{'on' if room_light else 'off'}.png"
    source = load_path(fixture, gpu_service.settings)

    response = generate(
        _request(jobId=f"gpu-lit-{label}", timeOfDay=time_of_day, roomLightOn=room_light),
        source,
        gpu_service,
    )

    input_mean = float(
        np.asarray(
            source.convert("RGB").resize((1328, 1184), Image.Resampling.LANCZOS), dtype=np.float32
        ).mean()
    )
    output_mean = float(np.asarray(Image.open(response.output_path).convert("RGB"), dtype=np.float32).mean())

    # 밝기가 크게 벗어나면 조명 상태가 무시된 것이다.
    assert abs(output_mean - input_mean) < 12.0, (label, input_mean, output_mean)


def test_negative_prompt_is_reported_ineffective_on_lightning(gpu_service, capture):
    response = generate(_request(jobId="gpu-neg"), capture, gpu_service)
    assert response.negative_prompt_effective is False
    assert response.negative_prompt == ""
    assert any("has NO effect" in w for w in response.warnings)


@pytest.mark.slow
def test_ten_consecutive_generations_without_oom(gpu_service, capture):
    peaks = []
    for _ in range(10):
        response = generate(_request(jobId="gpu-consecutive"), capture, gpu_service)
        assert response.output_size == {"width": 1328, "height": 1184}
        peaks.append(response.peak_vram_mb)
    # 반복해도 peak 이 계속 자라면 누수다.
    assert peaks[-1] <= peaks[0] * 1.5, peaks


def test_regression_properties_of_output(gpu_service, capture):
    """픽셀 완전 일치 대신 크기·손상·밝기·히스토그램 범위를 본다."""
    import numpy as np
    from PIL import Image

    response = generate(_request(jobId="gpu-regression"), capture, gpu_service)
    image = Image.open(response.output_path)
    image.load()  # 손상 여부

    assert image.size == (1328, 1184)
    array = np.asarray(image.convert("RGB"), dtype=np.float32)
    assert np.isfinite(array).all()

    mean = float(array.mean())
    assert 10.0 < mean < 245.0, f"평균 밝기 {mean} 가 정상 범위를 벗어났다"
    assert float(array.std()) > 3.0
