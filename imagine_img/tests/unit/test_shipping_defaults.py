"""출하 기본값 — .env 없이 기동했을 때 실제로 무엇이 켜지는가.

기본값은 그냥 두면 아무도 안 보게 되므로 여기서 고정한다.
2026-08-01 사용자 결정으로 ControlNet 이 기본 ON 이 되었고, 그 결정은 모델 프로필과 한 묶음이다.
"""

from __future__ import annotations
from app.models.profiles import get_profile


def test_controlnet_is_on_by_default(shipped_settings):
    assert shipped_settings.enable_controlnet is True
    assert shipped_settings.controlnet_type == "canny"
    # small 변형이어야 8GB 에서 27초가 나온다. 표준 변형(2.4GB)은 130~180초로 무너진다.
    assert shipped_settings.controlnet_model_id.endswith("-small")
    assert shipped_settings.controlnet_conditioning_scale == 0.6


def test_photoreal_profile_is_the_default(shipped_settings):
    """ControlNet 을 켜는 것만으로는 부족하다 — Lightning 은 CFG 가 없어 오히려 나빠진다."""
    assert shipped_settings.model_profile == "sdxl_photoreal"
    assert shipped_settings.resolved_model_id == "SG161222/RealVisXL_V5.0"
    assert shipped_settings.supports_negative_prompt is True
    assert shipped_settings.resolved_guidance_scale == 5.0
    # 프로필을 본다 — steps 는 튜닝 대상이다(2026-08-03: 16 → 30, profiles.py 주석 참고).
    assert shipped_settings.resolved_steps == get_profile("sdxl_photoreal").steps
    # 네거티브는 full 이 기본이다 — 청킹 이후 128 토큰이 잘리지 않는다.
    assert shipped_settings.negative_prompt_profile == "full"


def test_default_strength_matches_controlnet_mode(shipped_settings):
    """ControlNet 이 구조를 고정하므로 strength 가 0.35 -> 0.75 로 올라간다."""
    assert shipped_settings.resolved_strength == 0.75
    assert shipped_settings.default_strength_preset == "CN_BALANCED"
    assert shipped_settings.max_strength == 0.9


def test_size_and_safety_defaults_unchanged(shipped_settings):
    """조명·크기·바인딩 정책은 그대로여야 한다."""
    assert shipped_settings.size_mode == "follow_input"
    assert shipped_settings.host == "127.0.0.1"
    assert shipped_settings.enable_sharpen is False
    assert shipped_settings.quantization_mode == "none"
    assert shipped_settings.enable_dero_lora is False


def test_base_mode_is_still_reachable(settings):
    """ControlNet 을 끄면 §5 정책(상한 0.45)이 그대로 돌아온다."""
    assert settings.enable_controlnet is False
    assert settings.max_strength == 0.45
    assert settings.resolved_strength == 0.35
