"""PromptBuilder 검증 (새 지시문 §6~§10)."""

from __future__ import annotations

import pytest

from app.generation.prompt_builder import (
    BUDGET_TOKENS,
    NEGATIVE_COMPACT,
    NEGATIVE_FULL,
    PromptBuilder,
    estimate_tokens,
)
from app.generation.schemas import GenerationRequest

BASE = {
    "jobId": "unit-001",
    "timeOfDay": "NIGHT",
    "roomLightOn": True,
    "cameraMode": "PERSPECTIVE",
    "moodTags": ["WHITE_MINIMAL"],
    "productSummary": ["single monitor", "compact keyboard", "desk lamp"],
}


def _request(**overrides) -> GenerationRequest:
    return GenerationRequest.model_validate({**BASE, **overrides})


def _build(settings, **overrides):
    return PromptBuilder(settings).build(_request(**overrides))


def test_same_input_gives_same_prompt(settings):
    assert _build(settings).prompt == _build(settings).prompt


def test_structure_prompt_comes_first_and_always_survives(settings):
    """구조 보존은 우선순위 0 이라 어떤 입력에서도 버려지지 않는다.

    `do not add or remove products.` 는 여기서 더 이상 확인하지 않는다 — CLIP 에서
    무효라 기본 경로에서 뺐다(`test_clip_invalid_negation_is_gone` 이 그 근거를 담는다).
    남은 `keep object positions...` 는 부정문이 아니라서 개념으로 읽힌다.
    """
    for overrides in (
        {},
        {"productSummary": ["very long product name here"] * 8},
        {"moodTags": ["WHITE_MINIMAL", "BLUE", "PINK", "BLACK", "WOOD"]},
    ):
        built = _build(settings, **overrides)
        assert built.prompt.startswith("keep object positions, count and camera angle.")


def test_prompt_stays_inside_the_token_budget(settings):
    """절단 경로 — `enable_long_prompt=False` 를 명시한다.

    2026-08-02 부터 청킹이 기본이라 예산은 강제되지 않는다(long_prompt.py). 이 테스트가
    지키는 것은 **청킹을 못 쓰는 경로에서도 프롬프트가 창을 넘지 않는다**는 것이고,
    그래서 설정을 명시적으로 끈다 — 기본값에 기대면 무엇을 재는 테스트인지 흐려진다.
    """
    long_off = settings.model_copy(update={"enable_long_prompt": False})
    built = PromptBuilder(long_off).build(
        _request(moodTags=["WHITE_MINIMAL", "BLUE"], productSummary=["a"] * 10)
    )
    assert estimate_tokens(built.prompt) <= BUDGET_TOKENS


def test_time_of_day_no_longer_writes_a_lighting_sentence(settings):
    """조명 문구는 **책상 무드 하나만** 낸다 (2026-08-05 결정).

    이전에는 `timeOfDay`x`roomLightOn` 네 조합이 각각 문장을 냈고, 그것이 무드 조명과
    같은 프롬프트에 들어가 **서로 모순**됐다 — NIGHT 요청의 프롬프트에
    "nighttime, lights off, dark low-light photo" 와 "warm afternoon daylight" 가 함께
    있었다(실측). CLIP 은 그 모순을 풀 방법이 없다.
    """
    prompts = {
        (tod, light): _build(settings, timeOfDay=tod, roomLightOn=light).prompt
        for tod in ("DAY", "NIGHT")
        for light in (True, False)
    }
    assert len(set(prompts.values())) == 1, "조명 상태가 프롬프트를 바꾸면 안 된다"
    for prompt in prompts.values():
        for banned in ("nighttime", "daytime", "room lights", "lights off", "low-light"):
            assert banned not in prompt, f"'{banned}' 가 남아 있다"


def test_the_mood_lighting_sentence_is_the_one_that_survives(settings):
    prompt = _build(settings, deskTexture="wood").prompt

    assert "warm afternoon daylight, soft warm bounce off the timber" in prompt


def test_mood_lighting_survives_with_background_decor_off(settings):
    """조명은 장식이 아니다.

    무드 조명이 배경 장식 블록 안에 있었는데, `ENABLE_BACKGROUND_DECOR=false` 로 끄면
    조명 문구가 **하나도 남지 않는다**. 낮/밤 문장을 지운 뒤에는 그게 유일한 조명 출처라
    장식과 따로 붙여야 한다.
    """
    no_decor = settings.model_copy(update={"enable_background_decor": False})
    built = PromptBuilder(no_decor).build(_request(deskTexture="wood"))

    assert "warm afternoon daylight" in built.prompt
    assert "in the room:" not in built.prompt, "장식은 꺼져 있어야 한다"


@pytest.mark.parametrize("texture", ["oak", "walnut", "white", "black", "wood", None])
def test_no_mood_asks_for_night_or_dim_light(settings, texture):
    """무드 조명 다섯 개도 낮과 어울려야 한다.

    walnut 은 "evening mood", black 은 "dim moody light ... deep falloff into shadow"
    였다. 낮/밤 문장을 지우면 그 두 개가 유일한 조명 지시가 되어 방 전체가 어두워진다 —
    낮 배경 장식(창·커튼·햇빛 받는 바닥)과 어긋난다.
    """
    prompt = _build(settings, deskTexture=texture).prompt

    for banned in ("evening", "dim ", "deep falloff", "2700K"):
        assert banned not in prompt, f"'{banned}' 가 {texture} 무드에 남아 있다"


def test_dropped_sentences_are_reported(settings):
    built = _build(settings, productSummary=["curved ultrawide monitor", "mechanical keyboard", "studio speakers", "desk lamp"])
    for sentence in built.dropped:
        assert sentence not in built.prompt


def test_product_ids_are_never_exposed(settings):
    built = _build(
        settings,
        productLights=[
            {"productId": 501, "enabled": True, "color": "#6FA8FF"},
            {"productId": 502, "enabled": False},
        ],
    )
    assert "501" not in built.prompt
    assert "502" not in built.prompt
    # 색은 쓰지만 hex 그대로가 아니라 CLIP 이 읽는 색 이름으로 바꾼다.
    assert "#6FA8FF" not in built.prompt
    assert "cool blue accent light" in built.prompt
    assert "controlled saturation" in built.prompt


def test_product_light_off_says_nothing(settings):
    built = _build(settings, productLights=[{"productId": 1, "enabled": False}])
    assert "emits" not in built.prompt


def test_mood_aliases_from_spec_section_4(settings):
    """§4 예시의 WHITE/MINIMAL 표기를 §9 의 WHITE_MINIMAL 로 매핑한다."""
    a = _build(settings, moodTags=["WHITE", "MINIMAL"]).prompt
    b = _build(settings, moodTags=["WHITE_MINIMAL"]).prompt
    assert a == b
    assert "white minimal desk" in a


def test_unknown_mood_is_rejected():
    with pytest.raises(Exception):
        GenerationRequest.model_validate({"jobId": "x", "moodTags": ["NEON"]})


def test_forbidden_hype_words_are_absent(settings):
    """§7 이 반복하지 말라고 한 표현."""
    prompt = _build(settings).prompt.lower()
    for banned in ("ultra realistic", "masterpiece", "best quality", "cinematic"):
        assert banned not in prompt


# --- 네거티브 프롬프트 (§10) ---------------------------------------------


def test_negative_prompt_is_empty_when_cfg_is_off(settings):
    """guidance_scale=0 인 lightning 프로필에서는 네거티브를 만들지 않는다."""
    assert settings.resolved_guidance_scale == 0.0
    built = _build(settings)
    assert built.negative_prompt == ""
    assert built.negative_effective is False


def test_negative_prompt_is_built_when_cfg_is_on(settings):
    cfg_on = settings.model_copy(update={"guidance_scale": 5.0, "negative_prompt_profile": "compact"})
    built = PromptBuilder(cfg_on).build(_request())
    assert built.negative_effective is True
    assert "illustration" in built.negative_prompt
    assert estimate_tokens(built.negative_prompt) <= BUDGET_TOKENS


def test_full_negative_profile_is_trimmed_and_reported(settings):
    """절단 경로에서 full 프로필(실측 128 토큰)은 잘리고, 무엇이 빠졌는지 보고해야 한다.

    청킹이 켜져 있으면 잘리지 않는다 — 그 쪽은
    `test_long_prompt_keeps_the_full_negative_profile` 이 잰다.
    """
    cfg_on = settings.model_copy(
        update={"guidance_scale": 5.0, "negative_prompt_profile": "full",
                "enable_long_prompt": False}
    )
    built = PromptBuilder(cfg_on).build(_request())
    assert built.negative_dropped, "full 프로필인데 버려진 항목이 보고되지 않았다"
    assert estimate_tokens(built.negative_prompt) <= BUDGET_TOKENS
    # 가장 중요한 항목(일러스트·CGI 억제)은 앞쪽이라 남아야 한다.
    assert "illustration" in built.negative_prompt
    assert "3d render" in built.negative_prompt


def test_negative_none_profile(settings):
    cfg_on = settings.model_copy(update={"guidance_scale": 5.0, "negative_prompt_profile": "none"})
    built = PromptBuilder(cfg_on).build(_request())
    assert built.negative_prompt == ""


def test_negative_sources_are_ordered_by_importance():
    assert NEGATIVE_FULL.startswith("illustration")
    assert NEGATIVE_COMPACT.startswith("illustration")


# --- 긴 프롬프트 (2026-08-02, ENABLE_LONG_PROMPT) ---------------------------
# 77 토큰은 인코더 1회 창이고 프롬프트 길이 한도가 아니다 — 청킹으로 실을 수 있다
# (app/generation/long_prompt.py). 그래서 예산 때문에 문장을 버릴 이유가 없어졌다.


def test_long_prompt_keeps_every_sentence(settings):
    """제품 8개 + 무드 2개를 넣어도 재질 문장이 살아 있고 버린 것이 없다.

    실측(2026-08-02): 예산을 강제하던 동안
    `natural materials, plausible lighting, contact shadows, realistic exposure.`
    가 통째로 탈락한 채 생성이 돌았다. 실사화에 가장 직접 기여하는 문장이다.
    """
    long_on = settings.model_copy(update={"enable_long_prompt": True})
    built = PromptBuilder(long_on).build(
        _request(
            moodTags=["WHITE_MINIMAL", "BLUE"],
            productSummary=["monitor", "keyboard", "mug", "potted plant",
                            "table lamp", "water bottle", "speaker", "desk mat"],
        )
    )
    assert "natural materials" in built.prompt
    assert built.dropped == []
    assert built.products_dropped == ()
    for name in ("monitor", "keyboard", "water bottle", "desk mat"):
        assert name in built.prompt


def test_long_prompt_keeps_the_full_negative_profile(settings):
    """full 네거티브(실측 128 토큰)가 잘리지 않는다 — compact 는 절반을 버렸다."""
    long_on = settings.model_copy(
        update={"enable_long_prompt": True, "guidance_scale": 5.0,
                "negative_prompt_profile": "full"}
    )
    built = PromptBuilder(long_on).build(_request())
    assert built.negative_dropped == []
    # compact 에는 없고 full 에만 있는 항목 — 잘렸으면 여기서 사라진다.
    assert "overprocessed" in built.negative_prompt


def test_budget_is_still_enforced_when_long_prompt_is_off(settings):
    """청킹을 못 쓰는 경로를 위해 절단 동작은 남는다 — 끄면 옛 동작 그대로다."""
    long_off = settings.model_copy(update={"enable_long_prompt": False})
    built = PromptBuilder(long_off).build(
        _request(productSummary=["very long product name here"] * 8)
    )
    assert estimate_tokens(built.prompt) <= BUDGET_TOKENS


# --- 사진 어휘 템플릿 (2026-08-02, 레퍼런스 두 장 기준) ----------------------
# 청킹으로 예산이 열렸으니 압축본을 쓸 이유가 없다. 실측 목표는 타깃 사진의
# 평탄 47~60% / 채도 34~44% 이고, 현재 0.9 strength 에서 87% / 12% 다.


def test_photographic_vocabulary_is_present(settings):
    """카메라·재질·음영 어휘가 프롬프트에 실린다 — 실사화를 만드는 것이 이 문장들이다."""
    built = PromptBuilder(settings).build(_request())
    for phrase in ("35mm", "shallow depth of field", "film grain",
                   "micro-scratches", "contact shadows", "highlight rolloff"):
        assert phrase in built.prompt, f"{phrase!r} 가 없다: {built.prompt}"


def test_background_decor_is_described(settings):
    """배경을 비워 두지 않는다 — 빈 흰 벽은 어떤 strength 로도 사진이 되지 않는다.

    실측(2026-08-02): 빈 방 캡처를 strength 0.9 로 돌려도 평탄 87.3% 로, 타깃
    사진(47~60%)의 절반도 못 갔다. 사진으로 만들 재료가 방에 없기 때문이다.
    """
    built = PromptBuilder(settings).build(_request())
    assert "in the room:" in built.prompt
    for phrase in ("framed art print", "area rug", "baseboard"):
        assert phrase in built.prompt, f"{phrase!r} 가 없다"


@pytest.mark.parametrize(
    ("texture", "expected"),
    [("화이트", "bright white walls"), ("월넛", "deep walnut floor"),
     ("블랙", "charcoal walls"), ("오크", "warm cream painted walls")],
)
def test_desk_texture_changes_the_room(settings, texture, expected):
    """화이트면 화이트, 우드면 우드 — 사용자가 고른 재질이 방의 톤을 정한다.

    2026-08-02 까지 `deskTexture` 는 워커까지 와서 버려졌고, 그래서 어떤 배치든
    같은 방이 나왔다(desk_moods.py).
    """
    built = PromptBuilder(settings).build(_request(deskTexture=texture))
    assert expected in built.prompt


def test_background_decor_can_be_turned_off(settings):
    """`REQUIREMENTS.md` 의 '제품이 추가됨' 판정이 확정되면 끌 수 있어야 한다."""
    off = settings.model_copy(update={"enable_background_decor": False})
    built = PromptBuilder(off).build(_request(deskTexture="화이트"))
    assert "in the room:" not in built.prompt


def test_emissive_product_is_described_as_internal_glow(settings):
    """발광 제품은 '안에서 은은하게' 로 적는다 — 흰색 클리핑이 실루엣을 지우기 때문이다.

    실측(2026-08-02): RGB PC 케이스가 흰 판·스탠드 조명·빈 공간으로 각각 다르게
    나왔다. `diffused through a tempered glass side panel` 이 그 확산을 지시한다.
    """
    built = PromptBuilder(settings).build(
        _request(productLights=[{"productId": 501, "enabled": True, "color": "#6FA8FF"}])
    )
    assert "diffused" in built.prompt
    assert "cool blue" in built.prompt


def test_clip_invalid_negation_is_gone(settings):
    """`do not ...` 는 CLIP 에서 무효라 뺀다 — 토큰만 먹고 아무 일도 안 한다.

    CLIP 은 bag-of-concepts 라 `do not` 을 무시하고 `add`·`remove`·`products` 만
    읽는다. 배치 보존은 프롬프트가 아니라 ControlNet 이 한다(실측: ControlNet 을
    끄고 strength 를 올리면 모니터가 iMac 으로 바뀐다). 그 자리는 재질·조명 서술에 쓴다.
    """
    built = PromptBuilder(settings).build(_request())
    assert "do not" not in built.prompt.lower()
    # 억제는 네거티브가 한다.
    cfg_on = settings.model_copy(update={"guidance_scale": 5.0})
    negative = PromptBuilder(cfg_on).build(_request()).negative_prompt
    assert "duplicated objects" in negative
