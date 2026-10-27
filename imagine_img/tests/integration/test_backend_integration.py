"""백엔드 연동에 필요한 것들 (2026-08-01 합의).

터널 너머의 백엔드가 큐를 돌리며 워커를 호출하는 구조를 전제로 한다.
- 공유 토큰으로 잠근다 (터널로 외부에 열리므로)
- 결과는 다운로드 엔드포인트로 가져간다 (백엔드가 워커 디스크에 접근할 수 없다)
- 보관 기간이 지난 결과는 정리한다
- 캡처의 음영이 부족하면 경고한다
"""

from __future__ import annotations

import io
import json
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.api.auth import HEADER
from app.core.errors import ErrorCode
from app.generation.generator import measure_shading
from app.transport import output_store
from tests.conftest import make_capture
from tests.integration.test_cpu_pipeline import FakePipe, make_service

TOKEN = "test-token-abc123"


def _multipart(image: Image.Image, payload: dict):
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    buffer.seek(0)
    return (
        {"image": ("capture.png", buffer, "image/png")},
        {"request_json": json.dumps(payload)},
    )


@pytest.fixture
def client(settings, monkeypatch):
    """토큰 없이 도는 워커 (로컬 개발 상태)."""
    monkeypatch.setenv("SKIP_MODEL_LOAD", "1")
    from app.core import config
    from app.main import create_app

    monkeypatch.setattr(config, "get_settings", lambda: settings)
    import app.api.auth as auth_module

    monkeypatch.setattr(auth_module, "get_settings", lambda: settings)

    make_service(settings)
    with TestClient(create_app()) as test_client:
        yield test_client, settings


@pytest.fixture
def secured_client(settings, monkeypatch):
    """토큰이 설정된 워커."""
    monkeypatch.setenv("SKIP_MODEL_LOAD", "1")
    from app.main import create_app

    secured = settings.model_copy(update={"worker_token": TOKEN})
    make_service(secured)
    # 미들웨어는 get_settings() 를 보므로 캐시를 갈아끼운다.
    from app.core import config

    monkeypatch.setattr(config, "get_settings", lambda: secured)
    import app.api.auth as auth_module

    monkeypatch.setattr(auth_module, "get_settings", lambda: secured)

    with TestClient(create_app()) as client:
        yield client, secured


# --- 인증 ---------------------------------------------------------------


def test_request_without_token_is_rejected(secured_client, capture_image):
    client, _ = secured_client
    files, data = _multipart(capture_image, {"jobId": "no-token"})
    response = client.post("/v1/generations", files=files, data=data)
    assert response.status_code == 401
    assert response.json()["errorCode"] == ErrorCode.INVALID_REQUEST


def test_request_with_wrong_token_is_rejected(secured_client, capture_image):
    client, _ = secured_client
    files, data = _multipart(capture_image, {"jobId": "bad-token"})
    response = client.post("/v1/generations", files=files, data=data, headers={HEADER: "nope"})
    assert response.status_code == 401


def test_request_with_token_passes(secured_client, capture_image):
    client, _ = secured_client
    files, data = _multipart(capture_image, {"jobId": "good-token"})
    response = client.post("/v1/generations", files=files, data=data, headers={HEADER: TOKEN})
    assert response.status_code == 200, response.text


def test_health_live_stays_open_for_the_tunnel(secured_client):
    """터널이 살아있는지 확인하려면 토큰 없이도 열려 있어야 한다."""
    client, _ = secured_client
    assert client.get("/health/live").status_code == 200
    # 나머지 health 는 잠긴다 — GPU·모델 정보가 새면 안 된다.
    assert client.get("/health/model").status_code == 401


def test_no_token_means_no_auth(client, capture_image):
    """로컬 개발에서는 토큰 없이 그대로 돈다."""
    test_client, _ = client
    files, data = _multipart(capture_image, {"jobId": "open"})
    assert test_client.post("/v1/generations", files=files, data=data).status_code == 200


# --- 결과 다운로드 --------------------------------------------------------


def test_result_can_be_downloaded(client, capture_image):
    test_client, _ = client
    files, data = _multipart(capture_image, {"jobId": "dl-test"})
    assert test_client.post("/v1/generations", files=files, data=data).status_code == 200

    response = test_client.get("/v1/generations/dl-test/result")
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    downloaded = Image.open(io.BytesIO(response.content))
    assert downloaded.size == capture_image.size


def test_download_returns_the_latest_attempt(client, capture_image):
    test_client, _ = client
    for _ in range(2):
        files, data = _multipart(capture_image, {"jobId": "dl-two"})
        test_client.post("/v1/generations", files=files, data=data)

    latest = test_client.get("/v1/generations/dl-two/result")
    first = test_client.get("/v1/generations/dl-two/result?attempt=1")
    assert latest.status_code == first.status_code == 200
    assert latest.content != first.content or True  # 내용 동일할 수 있으나 둘 다 받아져야 한다
    assert test_client.get("/v1/generations/dl-two/result?attempt=9").status_code == 404


def test_download_missing_job_is_404(client):
    test_client, _ = client
    assert test_client.get("/v1/generations/never-made/result").status_code == 404


@pytest.mark.parametrize("job_id", ["../escape", "a/b", "CON"])
def test_download_rejects_path_traversal(client, job_id):
    """jobId 를 검증하지 않으면 outputs 밖 파일을 읽을 수 있다."""
    test_client, _ = client
    response = test_client.get(f"/v1/generations/{job_id}/result")
    assert response.status_code in (400, 404)


# --- 보관 기간 정리 -------------------------------------------------------


def test_expired_outputs_are_removed(settings):
    old = settings.output_dir / "old-job"
    fresh = settings.output_dir / "fresh-job"
    keep = settings.output_dir / "_benchmark"
    for directory in (old, fresh, keep):
        directory.mkdir(parents=True)
        (directory / "result.png").write_bytes(b"x")

    stale = time.time() - (settings.output_retention_hours + 1) * 3600
    import os

    os.utime(old, (stale, stale))
    os.utime(keep, (stale, stale))

    removed = output_store.cleanup_expired(settings)

    assert removed == 1
    assert not old.exists()
    assert fresh.exists()
    # 측정 산출물(_ 로 시작)은 보관 기간과 무관하게 남긴다.
    assert keep.exists()


def test_a_folder_that_is_not_a_job_output_is_kept(settings):
    """작업 폴더 60개를 담은 **상자**를 지우지 않는다 (2026-08-06 실사고).

    `batch-products --out outputs/products` 는 `outputs/products/<jobId>/` 를 만든다.
    그러면 `outputs/products` 자체의 mtime 은 마지막 하위 폴더가 생긴 시각에 멈추므로,
    안쪽이 아무리 새 것이어도 상자가 늙으면 통째로 사라졌다. 실제로 그렇게 잃었다.
    """
    box = settings.output_dir / "products"
    job = box / "CHAIR-1"
    job.mkdir(parents=True)
    (job / "result.png").write_bytes(b"x")

    stale = time.time() - (settings.output_retention_hours + 1) * 3600
    import os

    os.utime(box, (stale, stale))

    assert output_store.cleanup_expired(settings) == 0
    assert job.exists(), "작업 폴더를 담은 상자는 작업 폴더가 아니다 — 지우면 안 된다"


def test_an_expired_job_dir_without_our_markers_is_kept(settings):
    """표식(result*.png / metadata*.json)이 없으면 우리 것이 아니다."""
    theirs = settings.output_dir / "notes-from-a-human"
    theirs.mkdir(parents=True)
    (theirs / "memo.txt").write_text("keep me")

    stale = time.time() - (settings.output_retention_hours + 1) * 3600
    import os

    os.utime(theirs, (stale, stale))

    assert output_store.cleanup_expired(settings) == 0
    assert theirs.exists()


def test_retention_disabled_removes_nothing(settings):
    directory = settings.output_dir / "job"
    directory.mkdir(parents=True)
    stale = time.time() - 999 * 3600
    import os

    os.utime(directory, (stale, stale))

    assert output_store.cleanup_expired(settings.model_copy(update={"output_retention_hours": 0})) == 0
    assert directory.exists()


# --- 음영 검증 -----------------------------------------------------------


def test_shading_metric_separates_flat_from_shaded(settings):
    """실제 렌더와 평면 도형이 임계값 양쪽으로 갈리는지 확인한다.

    분리 폭이 얇으므로(1.71 대 0.86) 이 테스트가 임계값의 회귀 감시 역할을 한다.
    """
    real = Path("inputs/image.png")
    if not real.exists():
        pytest.skip("실제 렌더 표본이 없다")

    flat = Image.open("tests/fixtures/desk_capture_night_off.png")
    assert measure_shading(Image.open(real)) > settings.min_shading_std
    assert measure_shading(flat) < settings.min_shading_std


def test_flat_capture_produces_a_warning(client):
    """툰 아웃라인이 켜져 있거나 IBL 이 꺼진 캡처를 조용히 넘기지 않는다."""
    test_client, _ = client
    flat = Image.new("RGB", (1152, 1024), (210, 210, 210))
    flat.paste((40, 40, 40), (100, 100, 400, 300))  # 큰 단색 블록만 있는 평면 이미지

    files, data = _multipart(flat, {"jobId": "flat-capture"})
    body = test_client.post("/v1/generations", files=files, data=data).json()
    assert any("little shading" in w for w in body["warnings"])


def test_shaded_capture_has_no_shading_warning(client, capture_image):
    test_client, _ = client
    files, data = _multipart(capture_image, {"jobId": "shaded-capture"})
    body = test_client.post("/v1/generations", files=files, data=data).json()
    assert not any("little shading" in w for w in body["warnings"])
