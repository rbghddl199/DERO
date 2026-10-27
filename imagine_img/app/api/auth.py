"""공유 토큰 인증.

워커를 터널(cloudflared/ngrok)로 외부에 열면 URL 을 아는 누구나 이 GPU 로 이미지를 만들고,
`jobId` 만 알면 남의 결과를 받아갈 수 있다. 백엔드만 호출할 수 있게 잠근다.

`WORKER_TOKEN` 이 비어 있으면 인증하지 않는다(로컬 개발용). 그 상태로 기동하면 경고를 남긴다.
"""

from __future__ import annotations

import hmac

from fastapi import Request
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.core.errors import ErrorCode
from app.core.logging import get_logger

log = get_logger(__name__)

HEADER = "X-Worker-Token"

#: 터널 상태 확인용. 토큰 없이 열어둔다 — 살아있는지만 알려주고 아무 일도 하지 않는다.
PUBLIC_PATHS = frozenset({"/health/live"})


async def require_token(request: Request, call_next):
    settings = get_settings()
    token = settings.worker_token.strip()

    if not token or request.url.path in PUBLIC_PATHS:
        return await call_next(request)

    provided = request.headers.get(HEADER, "")
    # 타이밍 공격을 피하려고 상수 시간 비교를 쓴다.
    if not hmac.compare_digest(provided, token):
        log.warning("rejected %s %s: bad or missing %s", request.method, request.url.path, HEADER)
        return JSONResponse(
            status_code=401,
            content={
                "status": "FAILED",
                "errorCode": str(ErrorCode.INVALID_REQUEST),
                "message": f"missing or invalid {HEADER}",
                "retryable": False,
            },
        )
    return await call_next(request)


def warn_if_unprotected() -> None:
    """기동 시 1회. 토큰 없이 떠 있으면 눈에 띄게 남긴다."""
    if not get_settings().worker_token.strip():
        log.warning(
            "WORKER_TOKEN is empty — anyone who can reach this port can use the GPU "
            "and download results. Set it before exposing the worker through a tunnel."
        )
