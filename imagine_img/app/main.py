"""FastAPI 앱. 127.0.0.1 전용 로컬 Worker (설계서 §11, §22)."""

from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api import auth, routes_generation, routes_health
from app.core.config import get_settings
from app.core.errors import WorkerError
from app.core.logging import get_logger, setup_logging
from app.models.model_service import get_service

log = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    setup_logging(settings.log_level)
    auth.warn_if_unprotected()

    # 보관 기간이 지난 결과를 치운다. 기동 시 1회.
    from app.transport import output_store

    output_store.cleanup_expired(settings)

    # 모델을 미리 로드할지 여부. 테스트/개발에서는 SKIP_MODEL_LOAD=1 로 끈다.
    if os.getenv("SKIP_MODEL_LOAD", "").strip() not in ("1", "true", "True"):
        try:
            get_service().load()
        except WorkerError as exc:
            # 기동은 계속하되 ready 는 false 로 남긴다. /health/model 이 원인을 알려준다.
            log.error("model load failed [%s]: %s", exc.code, exc.message)
    else:
        log.warning("SKIP_MODEL_LOAD is set; the worker starts without a model.")

    yield


def create_app() -> FastAPI:
    settings = get_settings()
    setup_logging(settings.log_level)
    app = FastAPI(
        title="imagine_img — DERO 실사화 로컬 AI Worker",
        version="0.1.0",
        description=(
            "SDXL-Lightning 4-step Img2Img (1152x1024) → Lanczos 1332x1184 → center crop 1328x1184"
        ),
        lifespan=lifespan,
    )
    app.middleware("http")(auth.require_token)
    app.include_router(routes_health.router)
    app.include_router(routes_generation.router)
    return app


app = create_app()


def run() -> None:
    """uvicorn 실행. host 는 설정값이지만 기본값은 127.0.0.1 이다."""
    import uvicorn

    settings = get_settings()
    if settings.host not in ("127.0.0.1", "localhost", "::1"):
        log.warning(
            "HOST=%s exposes this worker beyond localhost. The design requires 127.0.0.1.",
            settings.host,
        )
    uvicorn.run("app.main:app", host=settings.host, port=settings.port, log_level=settings.log_level.lower())


if __name__ == "__main__":
    run()
