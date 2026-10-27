"""환경 검사 스크립트 진입점 (설계서 §20 Phase 1-3)."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.env_check import report  # noqa: E402

if __name__ == "__main__":
    raise SystemExit(report())
