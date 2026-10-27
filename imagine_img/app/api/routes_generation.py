"""생성 API (설계서 §11).

엔드포인트를 async def 로 두면 동기 추론이 이벤트 루프를 막아 /health/live 까지 멈춘다.
그래서 def 로 선언해 starlette 의 threadpool 에서 돌린다 (DESIGN_GAP_REPORT G-12).
"""

from __future__ import annotations

import json

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from pydantic import ValidationError

from app.core.errors import ErrorCode, WorkerError
from app.generation.generator import generate
from app.generation.schemas import GenerationRequest, validate_job_id
from app.models.model_service import get_service
from app.transport import output_store
from app.transport.input_loader import load_bytes, load_simulator_view

router = APIRouter(prefix="/v1", tags=["generation"])


def _parse_request(request_json: str) -> GenerationRequest:
    try:
        payload = json.loads(request_json)
    except json.JSONDecodeError as exc:
        raise WorkerError(ErrorCode.INVALID_REQUEST, f"request_json is not valid JSON: {exc}") from exc
    if not isinstance(payload, dict):
        raise WorkerError(ErrorCode.INVALID_REQUEST, "request_json must be a JSON object.")
    try:
        return GenerationRequest.model_validate(payload)
    except ValidationError as exc:
        raise WorkerError(ErrorCode.INVALID_REQUEST, exc.json(indent=None)) from exc


@router.get("/generations/{job_id}/result")
def download_result(job_id: str, attempt: int | None = None):
    """생성 결과 이미지를 바이트로 돌려준다.

    백엔드가 터널 너머에 있어 워커의 로컬 경로(`outputs/...`)에 접근할 수 없다.
    생성 응답은 메타데이터만 가볍게 주고, 이미지는 여기서 가져간다.
    받다가 실패해도 27초짜리 생성을 다시 돌릴 필요 없이 재요청만 하면 된다.
    """
    try:
        # 경로 조작 방지 — 검증 없이 쓰면 outputs 밖 파일을 읽을 수 있다.
        validate_job_id(job_id)
        settings = get_service().settings
        path = output_store.find_result(job_id, settings, attempt)
    except WorkerError as exc:
        status = 404 if exc.code is ErrorCode.OUTPUT_WRITE_FAILED else exc.http_status
        return JSONResponse(status_code=status, content=exc.to_payload(job_id))

    return FileResponse(path, media_type="image/png", filename=path.name)


@router.post("/generations")
def create_generation(
    request_json: str = Form(..., description="GenerationRequest JSON 문자열"),
    image: UploadFile | None = File(
        default=None, description="PNG/JPEG 시뮬레이터 캡처. 생략하면 simulatorViewPath 를 쓴다"
    ),
):
    job_id: str | None = None
    try:
        request = _parse_request(request_json)
        job_id = request.job_id
        service = get_service()

        # 입력은 업로드 또는 simulatorViewPath 둘 중 하나다 (새 지시문 §4).
        if image is not None and image.filename:
            source = load_bytes(image.file.read(), service.settings)
        elif request.simulator_view_path:
            source = load_simulator_view(request.simulator_view_path, service.settings)
        else:
            raise WorkerError(
                ErrorCode.INVALID_REQUEST,
                "Provide either an uploaded image or simulatorViewPath.",
            )

        response = generate(request, source, service)
        return JSONResponse(status_code=200, content=response.model_dump(by_alias=True))
    except WorkerError as exc:
        return JSONResponse(status_code=exc.http_status, content=exc.to_payload(job_id))
