"""실제 SDXL 토크나이저로 프롬프트 길이 동작을 확인한다.

## 이 파일이 재는 것은 **절단 경로**다

2026-08-02 부터 청킹(`app/generation/long_prompt.py`)이 기본이라 프롬프트는 77 토큰에
갇히지 않는다. 그래서 아래 테스트들은 `enable_long_prompt=False` 인 **탈출 경로**를
잰다 — `prompt_embeds` 를 받지 못하는 파이프라인을 붙였을 때도 프롬프트가 창을 넘지
않아야 한다. 파일을 지우지 않고 남긴 이유는 그 경로가 코드에 살아 있기 때문이다.

새 지시문 §7~§10 의 원문은 실측 156 토큰(긍정) / 128 토큰(네거티브 full)이라
절단 경로에서는 그대로 쓸 수 없다 (DESIGN_GAP_REPORT P2-5). 압축·우선순위 방식이
실제 토크나이저 기준으로 한도를 지키는지가 여기서 고정된다.

청킹이 켜진 기본 경로는 마지막 테스트가 잰다 — 실제 토크나이저로 **77 을 넘는지**를
확인한다. 넘지 않으면 청킹을 붙인 의미가 없다.

GPU 는 필요 없지만 토크나이저 파일(model-cache)이 있어야 한다. 없으면 skip 한다.
"""

from __future__ import annotations

import glob

import pytest

from app.core.config import get_settings
from app.generation.generator import CLIP_TOKEN_LIMIT, make_token_counter
from app.generation.prompt_builder import PromptBuilder
from app.generation.schemas import GenerationRequest

LIGHTING = [
    ("DAY", False),
    ("DAY", True),
    ("NIGHT", False),
    ("NIGHT", True),
]
MOODS = ["WHITE_MINIMAL", "BLUE", "PINK", "BLACK", "WOOD"]


@pytest.fixture(scope="module")
def clip_tokenizer():
    settings = get_settings()
    matches = glob.glob(
        str(
            settings.model_cache_dir
            / "models--stabilityai--stable-diffusion-xl-base-1.0"
            / "snapshots"
            / "*"
            / "tokenizer"
        )
    )
    if not matches:
        pytest.skip("SDXL tokenizer is not in model-cache; run scripts/download_models.py first")

    from transformers import CLIPTokenizer

    return CLIPTokenizer.from_pretrained(matches[0])


@pytest.fixture(scope="module")
def counter(clip_tokenizer):
    class _Pipe:
        tokenizer = clip_tokenizer

    count = make_token_counter(_Pipe())
    assert count is not None
    return count


@pytest.fixture
def settings(settings):  # noqa: F811 — conftest 의 fixture 를 감싼다
    """이 파일의 모든 테스트는 **절단 경로**를 잰다 (모듈 docstring 참고).

    conftest 의 `settings` 를 그대로 쓰면 청킹이 켜진 기본값이라 한도가 강제되지 않아
    전부 무의미하게 통과한다. 여기서 한 번 끄고, 청킹 쪽은 아래 전용 테스트가 잰다.
    """
    return settings.model_copy(update={"enable_long_prompt": False})


def _request(**overrides) -> GenerationRequest:
    return GenerationRequest.model_validate(
        {
            "jobId": "clip-fit",
            "moodTags": ["WHITE_MINIMAL"],
            "productSummary": ["single monitor", "compact keyboard", "desk lamp"],
            "productLights": [{"productId": 501, "enabled": True, "color": "#6FA8FF"}],
            **overrides,
        }
    )


@pytest.mark.parametrize(("time_of_day", "room_light"), LIGHTING)
def test_prompt_fits_in_77_tokens(settings, counter, time_of_day, room_light):
    built = PromptBuilder(settings, counter).build(
        _request(timeOfDay=time_of_day, roomLightOn=room_light)
    )
    total = counter(built.prompt) + 2  # BOS/EOS
    assert total <= CLIP_TOKEN_LIMIT, f"{total} tokens: {built.prompt}"
    # 보존 지시는 어떤 경우에도 남아야 한다.
    assert "do not add or remove products." in built.prompt
    # 조명 문장은 어떤 조합에서도 남아야 한다. 다만 그 문장은 `timeOfDay` 가 아니라
    # **책상 무드**에서 온다 (아래 test_time_of_day_does_not_change_the_prompt).
    assert "light" in built.prompt or "daylight" in built.prompt


def test_time_of_day_does_not_change_the_prompt(settings, counter):
    """`timeOfDay` · `roomLightOn` 은 프롬프트를 바꾸지 않는다 (2026-08-05 결정).

    낮/밤 문장은 프롬프트에서 **지웠다**. 두 가지 이유가 실측으로 있었다:

    ```text
    1. 프롬프트로는 밝기가 안 바뀐다   밝은 캡처에 "nighttime" 을 넣어도 193.6 -> 186.4
    2. 무드 조명 문장과 모순됐다       앞: "nighttime, lights off"  뒤: "warm afternoon daylight"
    ```

    CLIP 은 부정도 우선순위도 표현하지 못해서(FINDINGS §1.4) 2번을 풀 방법이 없다.
    조명은 **캡처에 구워져 와야** 반영된다(FINDINGS §1.1).

    필드 자체는 스키마에 남아 있다 — 백엔드가 보내고 있고 나중에 캡처 단계로 넘길 값이다.
    그래서 "받지만 프롬프트에는 안 쓴다" 는 상태를 여기서 고정한다. 이게 깨지면
    `prompt_builder` 에 조명 문장이 되살아난 것이고, 그러면 무드 조명과 다시 싸운다.
    """
    day = PromptBuilder(settings, counter).build(_request(timeOfDay="DAY", roomLightOn=True))
    night = PromptBuilder(settings, counter).build(_request(timeOfDay="NIGHT", roomLightOn=False))
    assert day.prompt == night.prompt


@pytest.mark.parametrize("mood", MOODS)
def test_every_mood_fits(settings, counter, mood):
    built = PromptBuilder(settings, counter).build(_request(moodTags=[mood]))
    assert counter(built.prompt) + 2 <= CLIP_TOKEN_LIMIT


@pytest.mark.parametrize(("time_of_day", "room_light"), LIGHTING)
def test_six_products_survive_every_lighting_state(settings, counter, time_of_day, room_light):
    """제품 6개는 어떤 조명 상태에서도 통째로 남아야 한다 (2026-08-01).

    목록에서 빠진 물건은 다른 물건이 되어 나온다 — 실측으로 스탠드가 거울이 되고
    키보드가 접힌 수건이 됐다. 그래서 이건 "들어가면 좋은 것"이 아니라 회귀 방지선이다.
    문장 하나라도 더 길어지면 여기서 걸린다.
    """
    products = ["monitor", "keyboard", "desk lamp", "water bottle", "mug", "potted plant"]
    built = PromptBuilder(settings, counter).build(
        _request(
            timeOfDay=time_of_day,
            roomLightOn=room_light,
            productSummary=products,
            productLights=[],
        )
    )
    assert counter(built.prompt) + 2 <= CLIP_TOKEN_LIMIT
    for name in products:
        assert name in built.prompt, f"'{name}' 이 밀려났다: {built.prompt}"


def test_long_product_list_still_fits(settings, counter):
    built = PromptBuilder(settings, counter).build(
        _request(
            productSummary=[
                "curved ultrawide monitor",
                "mechanical keyboard",
                "studio monitor speakers",
                "articulated desk lamp",
                "vertical laptop stand",
            ],
            moodTags=["WHITE_MINIMAL", "BLUE"],
        )
    )
    assert counter(built.prompt) + 2 <= CLIP_TOKEN_LIMIT
    for sentence in built.dropped:
        assert sentence not in built.prompt


@pytest.mark.parametrize("profile", ["compact", "full"])
def test_negative_prompt_fits_when_cfg_is_on(settings, counter, profile):
    """§10 의 full 목록은 128 토큰이라 잘린다. 잘려도 한도는 지켜야 한다."""
    cfg_on = settings.model_copy(
        update={"guidance_scale": 5.0, "negative_prompt_profile": profile}
    )
    built = PromptBuilder(cfg_on, counter).build(_request())
    assert built.negative_effective is True
    assert counter(built.negative_prompt) + 2 <= CLIP_TOKEN_LIMIT
    if profile == "full":
        assert built.negative_dropped, "full 프로필인데 버려진 항목 보고가 없다"
    assert "illustration" in built.negative_prompt


# --- 청킹이 켜진 기본 경로 (2026-08-02) -------------------------------------


def test_default_path_exceeds_one_clip_window_and_keeps_everything(shipped_settings, counter):
    """출하 기본값에서는 프롬프트가 창 하나를 **넘고**, 아무것도 버리지 않는다.

    77 을 넘지 않으면 청킹을 붙인 의미가 없다 — 이 테스트가 그 전제를 고정한다.
    제품 8개 + 무드 2개는 실제 배치에서 흔한 규모다(카테고리 20종 중 절반).
    """
    products = [
        "curved ultrawide monitor", "mechanical keyboard", "studio monitor speakers",
        "articulated desk lamp", "vertical laptop stand", "insulated water bottle",
        "ceramic mug", "potted plant",
    ]
    built = PromptBuilder(shipped_settings, counter).build(
        _request(productSummary=products, moodTags=["WHITE_MINIMAL", "BLUE"])
    )

    assert counter(built.prompt) + 2 > CLIP_TOKEN_LIMIT, (
        "기본값인데 창 하나에 들어간다 — 청킹이 필요 없다는 뜻이라 전제가 무너진다"
    )
    # `dropped` 를 비었다고 단정하지 않는다 — 예산과 **중복 제거**가 같은 목록을 쓴다.
    # 이 요청의 productLights(#6FA8FF → "cool blue")는 BLUE 무드 문장과 60% 겹쳐서
    # 정당하게 버려진다. 예산 때문에 버려지지 않았음은 아래 두 단정이 잡는다.
    assert built.products_dropped == ()
    assert "natural materials" in built.prompt, "재질 문장이 예산에 밀렸다"
    for name in products:
        assert name in built.prompt, f"'{name}' 이 밀려났다"
