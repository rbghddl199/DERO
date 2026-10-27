"""CPU 통합 테스트 (설계서 §18.2).

모델 없이 fake pipeline 을 주입해 API 요청부터 결과 저장까지 흐름 전체를 검증한다.
GPU 도, 가중치도 필요하지 않다.
"""

from __future__ import annotations

import io
import json
import threading
from dataclasses import dataclass

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.core.errors import ErrorCode
from app.generation.generator import resolve_steps
from app.generation.schemas import GenerationRequest
from app.models.model_service import ModelService, set_service
from tests.conftest import make_capture
from tests.fake_text_encoders import attach_text_encoders


@dataclass
class _Result:
    images: list


class FakePipe:
    """호출 인자를 기록하고 입력과 같은 크기의 이미지를 돌려주는 가짜 파이프라인.

    실제 SDXL Img2Img 처럼 **입력 이미지 크기를 그대로 따른다**.
    size 를 주면 그 크기로 돌려준다 (크기 불일치 감지 테스트용).
    """

    def __init__(self, size=None):
        self.size = size
        self.calls: list[dict] = []
        self.scheduler = type("S", (), {"config": {"timestep_spacing": "trailing"}})()
        # 청킹이 기본이라 generator 가 텍스트 인코더를 직접 부른다 (long_prompt.py).
        # 이걸 안 붙이면 프롬프트 길이와 무관한 테스트까지 AttributeError 로 죽는다.
        attach_text_encoders(self)

    def __call__(self, **kwargs):
        self.calls.append(kwargs)
        # 입력 이미지의 픽셀을 살짝 흔들어 "생성된" 이미지를 흉내낸다 (단색 검사 통과용).
        source: Image.Image = kwargs["image"]
        target = self.size or source.size
        generated = source.resize(target).point(lambda v: min(255, v + 7))
        return _Result(images=[generated])

    def set_progress_bar_config(self, **_):
        pass


def make_service(settings, pipe=None) -> ModelService:
    service = ModelService(settings)
    service.pipe = pipe or FakePipe()
    service.ready = True
    service.runtime = {
        "model": "fake",
        "checkpoint": "fake.safetensors",
        "steps": settings.inference_steps,
        "lora": {"enabled": False, "loaded": False, "scale": None, "fused": False, "path": None},
        "quantization": {"mode": "none", "applied": False},
    }
    set_service(service)
    return service


@pytest.fixture
def client(settings, monkeypatch):
    monkeypatch.setenv("SKIP_MODEL_LOAD", "1")
    from app.main import create_app

    service = make_service(settings)
    with TestClient(create_app()) as test_client:
        yield test_client, service


def _multipart(image: Image.Image, payload: dict):
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    buffer.seek(0)
    return (
        {"image": ("capture.png", buffer, "image/png")},
        {"request_json": json.dumps(payload)},
    )


# --- 정상 흐름 -----------------------------------------------------------


def test_full_request_to_saved_output(client, capture_image):
    test_client, service = client
    files, data = _multipart(
        capture_image,
        {
            "jobId": 184,  # 새 지시문 §4 는 정수 jobId 를 쓴다
            "mode": "REALISTIC",
            "seed": 42,
            "moodTags": ["WHITE", "BLUE"],
            "productLights": [{"productId": 501, "enabled": True, "color": "#6FA8FF"}],
        },
    )

    response = test_client.post("/v1/generations", files=files, data=data)
    assert response.status_code == 200, response.text
    body = response.json()

    # 새 지시문 §15 의 응답 필드
    assert body["status"] == "COMPLETED"
    assert body["jobId"] == "184"
    assert body["modelProfile"] == "sdxl_lightning"
    # 출력 크기는 입력 크기를 따른다 (fixture 가 1152x1024).
    assert body["outputSize"] == {"width": 1152, "height": 1024}
    assert body["generationSize"] == {"width": 1152, "height": 1024}
    assert body["seed"] == 42
    assert body["strength"] == 0.35
    assert body["strengthPreset"] == "BALANCED"
    assert body["steps"] == 9
    assert body["effectiveSteps"] == 3
    assert body["guidanceScale"] == 0.0
    assert body["quantizationMode"] == "none"
    assert body["loraEnabled"] is False
    assert body["negativePromptEffective"] is False
    assert body["resultUrl"].startswith("file:///")
    assert set(body["timing"]) >= {"downloadMs", "preprocessMs", "inferenceMs", "resizeMs", "uploadMs", "totalMs"}

    saved = Image.open(body["outputPath"])
    assert saved.size == (1152, 1024)

    metadata = json.loads(open(body["metadataPath"], encoding="utf-8").read())
    assert metadata["seed"] == 42
    assert metadata["runtime"]["strength"] == 0.35
    assert metadata["runtime"]["checkpoint"] == "fake.safetensors"
    assert metadata["prompt"].startswith("keep object positions, count and camera angle.")
    # 부정문(`do not ...`)은 CLIP 에서 무효라 기본 경로에서 뺐다. 대신 사진 어휘가 실린다.
    assert "35mm" in metadata["prompt"]
    assert "cool blue accent light" in metadata["prompt"]  # 제품 조명 색이 반영된다
    assert "501" not in metadata["prompt"]  # productId 는 노출되지 않는다

    # 파이프라인에 width/height 를 넘기지 않는다 (DESIGN_GAP_REPORT G-1).
    call = service.pipe.calls[-1]
    assert "width" not in call and "height" not in call
    assert call["num_inference_steps"] == 9
    assert call["guidance_scale"] == 0.0
    assert call["num_images_per_prompt"] == 1
    assert call["strength"] == 0.35
    assert call["image"].size == (1152, 1024)
    # CFG 가 꺼져 있으면 negative_prompt 를 아예 넘기지 않는다.
    assert "negative_prompt" not in call


def test_same_job_id_does_not_overwrite(client, capture_image):
    test_client, _ = client
    files, data = _multipart(capture_image, {"jobId": "dup"})
    first = test_client.post("/v1/generations", files=files, data=data)
    files, data = _multipart(capture_image, {"jobId": "dup"})
    second = test_client.post("/v1/generations", files=files, data=data)

    assert first.status_code == second.status_code == 200
    first_path = first.json()["outputPath"]
    second_path = second.json()["outputPath"]
    assert first_path != second_path
    assert second_path.endswith("result_002.png")
    assert second.json()["metadataPath"].endswith("metadata_002.json")


def test_sharpen_flag_is_applied(client, capture_image):
    test_client, _ = client
    files, data = _multipart(capture_image, {"jobId": "sharp", "enableSharpen": True})
    body = test_client.post("/v1/generations", files=files, data=data).json()
    assert body["status"] == "COMPLETED"
    metadata = json.loads(open(body["metadataPath"], encoding="utf-8").read())
    assert metadata["runtime"]["sharpen"] is True


def test_negative_prompt_profile_is_reported_as_ineffective(client, capture_image):
    """§10 의 네거티브 프롬프트가 guidance_scale=0 에서 무효라는 사실을 매 요청에 남긴다."""
    test_client, _ = client
    files, data = _multipart(capture_image, {"jobId": "neg"})
    body = test_client.post("/v1/generations", files=files, data=data).json()
    assert body["negativePromptEffective"] is False
    assert body["negativePrompt"] == ""
    assert any("has NO effect" in w for w in body["warnings"])


def test_reference_images_are_recorded_but_unused(client, capture_image):
    """§4 의 참조 이미지는 IP-Adapter 가 없어 사용되지 않는다 — 조용히 무시하지 않는다."""
    test_client, _ = client
    files, data = _multipart(
        capture_image, {"jobId": "ref", "productReferencePaths": ["inputs/ref.png"]}
    )
    body = test_client.post("/v1/generations", files=files, data=data).json()
    assert any("NOT used" in w for w in body["warnings"])


def test_strength_outside_policy_is_rejected(client, capture_image):
    """0.5 이상은 API 에서 받지 않는다 (§5)."""
    test_client, _ = client
    files, data = _multipart(capture_image, {"jobId": "toostrong", "strength": 0.75})
    response = test_client.post("/v1/generations", files=files, data=data)
    assert response.status_code == 400
    assert response.json()["errorCode"] == ErrorCode.INVALID_REQUEST


def test_simulator_view_path_outside_input_dir_is_rejected(client, tmp_path):
    """로컬 경로 입력이 임의 파일 읽기로 번지지 않게 막는다 (§4, DESIGN_GAP_REPORT C11)."""
    test_client, _ = client
    outside = tmp_path / "secret.png"
    Image.new("RGB", (1152, 1024), (10, 20, 30)).save(outside)
    response = test_client.post(
        "/v1/generations",
        data={"request_json": json.dumps({"jobId": "escape", "simulatorViewPath": str(outside)})},
    )
    assert response.status_code == 400
    assert response.json()["errorCode"] == ErrorCode.INVALID_REQUEST


def test_missing_image_and_path_is_rejected(client):
    test_client, _ = client
    response = test_client.post(
        "/v1/generations", data={"request_json": json.dumps({"jobId": "noinput"})}
    )
    assert response.status_code == 400
    assert response.json()["errorCode"] == ErrorCode.INVALID_REQUEST


# --- 오류 응답 -----------------------------------------------------------


def test_portrait_input_produces_portrait_output(client, settings):
    """세로형 실제 캡처가 거부되지 않고 같은 크기로 나온다."""
    test_client, _ = client
    files, data = _multipart(make_capture(1125, 1449), {"jobId": "portrait"})
    response = test_client.post("/v1/generations", files=files, data=data)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["outputSize"] == {"width": 1125, "height": 1449}
    # 생성 크기는 입력 비율에 맞추고 픽셀 예산 안에 있어야 한다.
    gen = body["generationSize"]
    assert abs(gen["width"] / gen["height"] - 1125 / 1449) / (1125 / 1449) < 0.02
    # 리터럴이 아니라 설정을 본다 — 예산은 튜닝 대상이다(2026-08-02: 1.18M → 2.36M).
    assert gen["width"] * gen["height"] <= settings.generation_pixel_budget
    assert Image.open(body["outputPath"]).size == (1125, 1449)


def test_too_small_input_is_still_rejected(client):
    test_client, _ = client
    files, data = _multipart(make_capture(320, 400), {"jobId": "tiny"})
    response = test_client.post("/v1/generations", files=files, data=data)
    assert response.status_code == 400
    assert response.json()["errorCode"] == ErrorCode.INVALID_IMAGE
    assert response.json()["retryable"] is False


def test_unsafe_job_id_returns_invalid_request(client, capture_image):
    test_client, _ = client
    files, data = _multipart(capture_image, {"jobId": "../escape"})
    response = test_client.post("/v1/generations", files=files, data=data)
    assert response.status_code == 400
    assert response.json()["errorCode"] == ErrorCode.INVALID_REQUEST


def test_broken_json_returns_invalid_request(client, capture_image):
    test_client, _ = client
    files, _ = _multipart(capture_image, {})
    response = test_client.post("/v1/generations", files=files, data={"request_json": "{oops"})
    assert response.status_code == 400
    assert response.json()["errorCode"] == ErrorCode.INVALID_REQUEST


def test_pipeline_returning_wrong_size_fails_loudly(settings, monkeypatch, capture_image):
    monkeypatch.setenv("SKIP_MODEL_LOAD", "1")
    from app.main import create_app

    make_service(settings, pipe=FakePipe(size=(1024, 1024)))
    with TestClient(create_app()) as test_client:
        files, data = _multipart(capture_image, {"jobId": "badsize"})
        response = test_client.post("/v1/generations", files=files, data=data)
    assert response.status_code == 500
    assert response.json()["errorCode"] == ErrorCode.INFERENCE_FAILED


def test_model_not_ready_returns_503(settings, monkeypatch, capture_image):
    monkeypatch.setenv("SKIP_MODEL_LOAD", "1")
    from app.main import create_app

    service = make_service(settings)
    service.ready = False
    with TestClient(create_app()) as test_client:
        files, data = _multipart(capture_image, {"jobId": "notready"})
        response = test_client.post("/v1/generations", files=files, data=data)
        assert response.status_code == 503
        assert response.json()["errorCode"] == ErrorCode.MODEL_NOT_READY
        assert response.json()["retryable"] is True
        # /health/live 는 모델 없이도 200 이어야 한다.
        assert test_client.get("/health/live").status_code == 200
        assert test_client.get("/health/ready").status_code == 503


# --- 단일 작업 락 --------------------------------------------------------


def test_second_concurrent_job_is_rejected(client, capture_image):
    """한 번에 하나만 처리한다. 대기하지 않고 409 로 거절한다."""
    test_client, service = client

    held = threading.Event()
    release = threading.Event()

    class BlockingPipe(FakePipe):
        def __call__(self, **kwargs):
            held.set()
            release.wait(timeout=10)
            return super().__call__(**kwargs)

    service.pipe = BlockingPipe()

    results: dict[str, int] = {}

    def first():
        files, data = _multipart(capture_image, {"jobId": "lock-a"})
        results["first"] = test_client.post("/v1/generations", files=files, data=data).status_code

    thread = threading.Thread(target=first)
    thread.start()
    assert held.wait(timeout=10), "첫 요청이 추론에 진입하지 못했다"

    files, data = _multipart(capture_image, {"jobId": "lock-b"})
    second = test_client.post("/v1/generations", files=files, data=data)
    assert second.status_code == 409
    assert second.json()["errorCode"] == ErrorCode.JOB_ALREADY_RUNNING
    assert second.json()["retryable"] is True

    release.set()
    thread.join(timeout=15)
    assert results["first"] == 200


# --- effective step 계산 -------------------------------------------------


@pytest.mark.parametrize(
    ("preset", "expected_effective"),
    [("PRESERVE", 2), ("BALANCED", 3), ("REALISTIC", 4)],
)
def test_effective_steps_are_reported(settings, preset, expected_effective):
    """steps=9 라서 0.25/0.35/0.45 가 2/3/4 step 으로 갈라진다 (DESIGN_GAP_REPORT P2-3)."""
    request = GenerationRequest.model_validate({"jobId": "steps", "strengthPreset": preset})
    requested, effective = resolve_steps(settings, request.resolve_strength(settings))
    assert requested == 9
    assert effective == expected_effective


def test_compensation_flag_restores_full_step_count(settings):
    compensated = settings.model_copy(update={"compensate_steps_for_strength": True})
    for preset in ("PRESERVE", "BALANCED", "REALISTIC"):
        request = GenerationRequest.model_validate({"jobId": "steps", "strengthPreset": preset})
        requested, effective = resolve_steps(compensated, request.resolve_strength(settings))
        assert effective == settings.resolved_steps, (preset, requested, effective)
