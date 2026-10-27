"""테스트가 저장소의 `outputs/` 를 건드리지 못하게 고정한다 (2026-08-06).

## 왜 이 파일이 있는가

`pytest` 를 한 번 돌렸더니 저장소의 `outputs/` 에서 24시간이 지난 작업 폴더가 전부
사라졌다 — 제품 배치 60여 건, t5~t7 조명·strength 비교 결과, `_final` 갤러리까지.
지운 것은 이 경로다:

```text
TestClient(create_app())  ->  lifespan  ->  output_store.cleanup_expired(get_settings())
```

테스트는 `settings` 픽스처(tmp_path)를 모델 서비스에 주입한다. 그런데 `lifespan` 안의
`get_settings()` 는 그 픽스처를 모른다 — lru_cache 된 진짜 설정이라 `output_dir` 이
`<repo>/outputs` 였다. **주입이 닿지 않는 곳이 한 군데 있었고 하필 거기가 파일을 지우는
유일한 코드였다.**

`conftest.real_settings_write_to_tmp` 가 진짜 설정 자체를 tmp 로 돌려서 막는다.
그 픽스처가 지워지거나 이름이 바뀌면 같은 사고가 조용히 돌아오므로, 여기서 고정한다.

"주입을 잘 하자"는 규율로는 못 막는다. 이번에도 대부분의 테스트는 주입을 하고 있었고
(`test_backend_integration` 은 `get_settings` 를 monkeypatch 까지 한다) 딱 한 파일이
빠져 있었다.
"""

from __future__ import annotations

from pathlib import Path

from app.core.config import REPO_ROOT, get_settings
from app.transport import output_store


def test_real_settings_never_point_at_the_repo_outputs():
    """`get_settings()` 는 테스트 중에 저장소 `outputs/` 를 가리키면 안 된다."""
    assert get_settings().output_dir != (REPO_ROOT / "outputs"), (
        "conftest.real_settings_write_to_tmp 가 동작하지 않는다. 이 상태로 "
        "TestClient(create_app()) 를 만드는 테스트가 하나라도 있으면 "
        "저장소의 실제 결과물이 보관 기간 정리로 지워진다."
    )


def test_the_repo_outputs_dir_is_not_writable_by_accident(tmp_path: Path):
    """정리 대상 계산이 tmp 안에서만 이뤄지는지 확인한다.

    `cleanup_expired` 는 `settings.output_dir` 만 훑는다. 그 값이 tmp 이면 저장소는
    열어보지도 않는다 — 위 테스트와 짝이다.
    """
    settings = get_settings().model_copy(update={"output_dir": tmp_path})
    assert output_store.cleanup_expired(settings) == 0
