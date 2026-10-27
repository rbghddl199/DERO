from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest
from PIL import Image

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO))

from app.core.config import Settings, get_settings  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def real_settings_write_to_tmp(tmp_path_factory):
    """`get_settings()` **자체**의 출력 폴더를 세션 tmp 로 돌린다.

    2026-08-06: 이게 없어서 `pytest` 한 번에 저장소의 `outputs/` 에서 24시간이 지난 작업
    폴더가 전부 사라졌다 (제품 배치 60여 건, t5~t7 조명 비교 결과 등). 경로는 이렇다:

    ```text
    TestClient(create_app())  ->  lifespan  ->  output_store.cleanup_expired(get_settings())
    ```

    아래 `settings` 픽스처는 tmp_path 를 쓰고 테스트는 그것을 서비스에 주입하지만,
    **`lifespan` 안의 `get_settings()` 는 그 픽스처를 모른다** — lru_cache 된 진짜 설정이라
    `output_dir` 이 `<repo>/outputs` 다. 즉 주입이 닿지 않는 곳이 한 군데 있었고, 하필
    그곳이 파일을 **지우는** 유일한 코드였다.

    그래서 픽스처를 하나 더 만드는 대신 **진짜 설정을 돌려놓는다.** 앞으로 어떤 테스트가
    `get_settings()` 를 새로 밟더라도 저장소 밖에 쓴다 — 주입을 잊었는지 매번 확인할
    필요가 없어진다. 이 성질은 `tests/unit/test_output_isolation.py` 가 고정한다.

    **`model_cache_dir` 은 건드리지 않는다.** CLIP 토크나이저 픽스처가 실제 가중치를
    읽어야 하고(`test_prompt_fits_clip`), 그쪽은 읽기만 해서 지울 위험이 없다.
    """
    outputs = tmp_path_factory.mktemp("real-settings-outputs")
    previous = os.environ.get("OUTPUT_DIR")
    os.environ["OUTPUT_DIR"] = str(outputs)
    # 이미 만들어진 캐시본은 옛 경로를 들고 있다. 비워야 다음 호출이 위 값을 읽는다.
    get_settings.cache_clear()
    try:
        yield outputs
    finally:
        if previous is None:
            os.environ.pop("OUTPUT_DIR", None)
        else:
            os.environ["OUTPUT_DIR"] = previous
        get_settings.cache_clear()


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    """**기본 모드**(ControlNet OFF, Lightning 프로필) 설정.

    출하 기본값은 sdxl_photoreal + ControlNet ON 이지만, 대부분의 테스트는
    §5 strength 정책과 기본 경로를 검증하므로 그 조합을 명시적으로 고정한다.
    출하 기본값 자체는 test_shipping_defaults.py 가 따로 검증한다.
    """
    return Settings(
        model_profile="sdxl_lightning",
        enable_controlnet=False,
        output_dir=tmp_path / "outputs",
        model_cache_dir=tmp_path / "model-cache",
    )


@pytest.fixture
def shipped_settings(tmp_path: Path) -> Settings:
    """.env 없이 그대로 기동했을 때의 설정 (출하 기본값)."""
    return Settings(
        output_dir=tmp_path / "outputs",
        model_cache_dir=tmp_path / "model-cache",
    )


@pytest.fixture
def capture_image() -> Image.Image:
    """1152x1024 의 가짜 시뮬레이터 캡처. 단색이 아니어야 검증을 통과한다."""
    return make_capture(1152, 1024)


def make_capture(width: int, height: int) -> Image.Image:
    image = Image.new("RGB", (width, height), (40, 44, 52))
    for x in range(0, width, 64):
        for y in range(0, height, 64):
            shade = (x + y) % 200 + 30
            image.paste((shade, shade // 2, 200 - shade // 2), (x, y, min(x + 64, width), min(y + 64, height)))
    return image
