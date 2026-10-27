"""Health API (설계서 §15)."""

from __future__ import annotations

from fastapi import APIRouter, Response, status

from app.models.model_service import get_service

router = APIRouter(tags=["health"])


@router.get("/health/live")
def live() -> dict:
    """프로세스가 살아 있는지만 본다. 모델 로딩 중에도 200 이어야 한다."""
    return {"status": "alive"}


@router.get("/health/ready")
def ready(response: Response) -> dict:
    service = get_service()
    if not service.ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return {"ready": service.ready, "busy": service.job_lock.locked(), "loadError": service.load_error}


@router.get("/health/model")
def model() -> dict:
    return get_service().describe()
