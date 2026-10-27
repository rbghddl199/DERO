"""`PROMPT_FILE` 우회 경로 (app/generation/prompt_file.py, 2026-08-04)."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.core.errors import ConfigurationError
from app.generation.prompt_builder import PromptBuilder
from app.generation.prompt_file import load_prompt_file
from app.generation.schemas import GenerationRequest

BASE = {
    "jobId": "unit-prompt-file",
    "timeOfDay": "NIGHT",
    "roomLightOn": True,
    "moodTags": ["WHITE_MINIMAL"],
    "productSummary": ["mechanical keyboard"],
}

SAMPLE = """\
# 주석은 버린다
a single photograph of one {products} where it is used,
an environment that suits this product

[negative]
logo, printed text
"""


def _write(tmp_path: Path, text: str) -> Path:
    path = tmp_path / "prompt.txt"
    path.write_text(text, encoding="utf-8")
    return path


def _request(**overrides) -> GenerationRequest:
    return GenerationRequest.model_validate({**BASE, **overrides})


def test_sections_split_and_lines_join_with_a_space(tmp_path):
    loaded = load_prompt_file(_write(tmp_path, SAMPLE), ["mechanical keyboard"])
    assert loaded.prompt == (
        "a single photograph of one mechanical keyboard where it is used, "
        "an environment that suits this product"
    )
    assert loaded.negative_prompt == "logo, printed text"


def test_missing_product_name_fails_before_the_gpu_runs(tmp_path):
    """자리표를 못 채우면 40초짜리 생성을 돌리기 전에 멈춘다."""
    with pytest.raises(ConfigurationError, match="no product name"):
        load_prompt_file(_write(tmp_path, SAMPLE), [])


def test_comments_only_file_is_rejected(tmp_path):
    with pytest.raises(ConfigurationError, match="no positive prompt"):
        load_prompt_file(_write(tmp_path, "# 전부 주석\n\n[negative]\nlogo\n"))


def test_missing_file_names_the_path(tmp_path):
    with pytest.raises(ConfigurationError, match="does not exist"):
        load_prompt_file(tmp_path / "nope.txt", ["keyboard"])


def test_builder_uses_the_file_verbatim_and_drops_nothing(tmp_path, settings):
    """조합 규칙(구조 보존 문장·무드·조명)이 하나도 섞이지 않아야 한다."""
    with_file = settings.model_copy(
        update={"prompt_file": _write(tmp_path, SAMPLE), "guidance_scale": 7.0}
    )
    built = PromptBuilder(with_file).build(_request())

    assert built.prompt.startswith("a single photograph of one mechanical keyboard")
    assert "keep object positions" not in built.prompt
    assert "white minimal desk" not in built.prompt
    assert "nighttime" not in built.prompt
    assert built.dropped == []
    assert built.prompt_file is not None


def test_negative_comes_from_the_file_not_the_profile(tmp_path, settings):
    with_file = settings.model_copy(
        update={
            "prompt_file": _write(tmp_path, SAMPLE),
            "guidance_scale": 7.0,
            "negative_prompt_profile": "full",
        }
    )
    built = PromptBuilder(with_file).build(_request())
    assert built.negative_prompt == "logo, printed text"
    assert built.negative_effective is True


def test_negative_is_dropped_when_cfg_is_off(tmp_path, settings):
    """guidance_scale=0 프로필에서는 계산에 들어가지 않으므로 만들어 넘기지 않는다."""
    with_file = settings.model_copy(update={"prompt_file": _write(tmp_path, SAMPLE)})
    assert with_file.supports_negative_prompt is False
    built = PromptBuilder(with_file).build(_request())
    assert built.negative_prompt == ""
    assert built.negative_effective is False


WITH_CATEGORIES = """\
shared photo of a {products}.

[when MONITOR]
the screen shows a plain gradient wallpaper.

[when MONITOR negative]
desktop icons, taskbar,

[when KEYBOARD]
plain unmarked keycaps.

[negative]
logo, printed text,
"""


def test_only_the_matching_when_block_is_applied(tmp_path):
    loaded = load_prompt_file(_write(tmp_path, WITH_CATEGORIES), ["monitor"], ["MONITOR"])
    assert loaded.prompt == (
        "shared photo of a monitor. the screen shows a plain gradient wallpaper."
    )
    assert "keycaps" not in loaded.prompt
    assert loaded.negative_prompt == "logo, printed text, desktop icons, taskbar,"
    assert loaded.applied_categories == ("MONITOR",)


def test_category_sentences_come_after_the_shared_ones(tmp_path):
    """같은 대상을 두 번 말하면 나중 말이 남아야 한다 — 카테고리 지시가 뒤에 온다."""
    loaded = load_prompt_file(_write(tmp_path, WITH_CATEGORIES), ["monitor"], ["MONITOR"])
    assert loaded.prompt.index("shared photo") < loaded.prompt.index("gradient wallpaper")


def test_no_category_means_only_the_shared_prompt(tmp_path):
    loaded = load_prompt_file(_write(tmp_path, WITH_CATEGORIES), ["mouse"], ["MOUSE"])
    assert loaded.prompt == "shared photo of a mouse."
    assert loaded.negative_prompt == "logo, printed text,"
    assert loaded.applied_categories == ()
    # 파일에 어떤 블록이 있는지는 알려준다 — 폴더 이름 오타를 여기서 알아차린다.
    assert loaded.available_categories == ("MONITOR", "KEYBOARD")


def test_comma_separated_codes_share_one_block(tmp_path):
    text = "base.\n\n[when MONITOR, TV]\nthe screen is on.\n"
    for code in ("MONITOR", "TV"):
        loaded = load_prompt_file(_write(tmp_path, text), (), [code])
        assert loaded.prompt == "base. the screen is on."


BACKGROUND_FILE = """\
product photo of a {products}, large in frame, separated from the background.

[background]
an interior photo of a room, the {products} resting on a desk.

[background negative]
white background, pedestal,

[negative]
logo, printed text,
"""


def test_background_sections_do_not_leak_into_the_main_prompt(tmp_path):
    """1단계 프롬프트에 배경 문장이 섞이면 안 된다 — 둘은 서로 반대되는 지시를 한다.

    1단계는 "제품이 배경과 분리되어 보이게", 배경 단계는 "방을 그리라" 고 말한다.
    한 프롬프트에 같이 실리면 둘 다 약해진다.
    """
    loaded = load_prompt_file(_write(tmp_path, BACKGROUND_FILE), ["clock"], [])

    assert loaded.prompt == (
        "product photo of a clock, large in frame, separated from the background."
    )
    assert loaded.negative_prompt == "logo, printed text,"
    assert loaded.background_prompt == "an interior photo of a room, the clock resting on a desk."
    assert loaded.background_negative == "white background, pedestal,"


def test_a_file_without_a_background_section_reports_it_as_empty(tmp_path):
    """빈 문자열이면 배경 단계는 돌지 않는다 — 조용히 빈 프롬프트로 생성하지 않는다."""
    loaded = load_prompt_file(_write(tmp_path, "photo of a thing.\n"))

    assert loaded.background_prompt == ""
    assert loaded.background_negative == ""


def test_the_shipped_file_has_a_background_section():
    """배송되는 프롬프트 파일에는 배경 단계 프롬프트가 있어야 한다."""
    from app.core.config import REPO_ROOT

    loaded = load_prompt_file(
        REPO_ROOT / "prompts" / "product_copyright_safe.txt", ["monitor"], ["MONITOR"]
    )

    assert "editorial interior photograph" in loaded.background_prompt
    # 제품이 주인공으로 남아야 한다 — 배경에 묻히면 안 된다 (사용자 요구)
    assert "the object in sharp focus" in loaded.background_prompt
    # 마스크 안에 물건을 만들어 넣는 실패를 막는 말들 (2026-08-04 실측: 카메라 렌즈)
    assert "pedestal" in loaded.background_negative
    assert "camera lens" in loaded.background_negative
    # 3단계(조화)도 있어야 한다 — 없으면 "누끼 붙인" 느낌이 남는다.
    assert "same colour temperature" in loaded.harmonize_prompt
    assert "pasted object" in loaded.harmonize_negative


def test_unknown_section_header_is_rejected(tmp_path):
    """`[negativ]` 한 글자 오타는 네거티브 전체를 positive 로 실어버린다."""
    with pytest.raises(ConfigurationError, match="unknown section header"):
        load_prompt_file(_write(tmp_path, "base.\n\n[negativ]\nlogo\n"))


def test_builder_passes_request_categories_to_the_file(tmp_path, settings):
    with_file = settings.model_copy(
        update={"prompt_file": _write(tmp_path, WITH_CATEGORIES), "guidance_scale": 7.0}
    )
    built = PromptBuilder(with_file).build(
        _request(productSummary=[], productCategories=[{"code": "MONITOR", "screenAreaPercent": 60}])
    )
    assert "gradient wallpaper" in built.prompt
    assert built.prompt_file_categories == ("MONITOR",)
    assert built.prompt_file_unmatched == ()


def test_unmatched_category_is_reported(tmp_path, settings):
    """폴더 이름을 `moniter/` 로 잘못 적으면 조용히 공통 프롬프트만 실린다."""
    with_file = settings.model_copy(update={"prompt_file": _write(tmp_path, WITH_CATEGORIES)})
    built = PromptBuilder(with_file).build(
        _request(productSummary=[], productCategories=[{"code": "MONITER", "screenAreaPercent": 60}])
    )
    assert built.prompt_file_categories == ()
    assert built.prompt_file_unmatched == ("MONITER",)


def test_default_settings_do_not_touch_the_prompt_builder(settings, shipped_settings):
    """기본값에서는 이 기능이 존재하지 않는 것과 같아야 한다."""
    assert settings.prompt_file is None
    assert shipped_settings.prompt_file is None
    assert PromptBuilder(settings).build(_request()).prompt_file is None
