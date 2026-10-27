"""로깅 설정. Windows 콘솔에서 한글이 깨지지 않게 stdout 을 UTF-8 로 강제한다."""

from __future__ import annotations

import logging
import sys

_CONFIGURED = False


def force_utf8_streams() -> None:
    """stdout/stderr 을 UTF-8 로 맞춘다.

    Windows 콘솔 기본 코드페이지(cp949)에서는 한글이 깨지고, em dash 같은 문자는
    UnicodeEncodeError 로 프로그램을 죽인다. rich/typer 가 첫 글자를 쓰기 전에 불러야 한다.
    """
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            try:
                reconfigure(encoding="utf-8")
            except (ValueError, OSError):
                pass


def setup_logging(level: str = "INFO") -> None:
    global _CONFIGURED
    if _CONFIGURED:
        return

    force_utf8_streams()

    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)-7s %(name)s | %(message)s",
        datefmt="%H:%M:%S",
        stream=sys.stdout,
    )
    _CONFIGURED = True


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
