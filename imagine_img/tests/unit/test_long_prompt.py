"""긴 프롬프트 인코딩 (77 토큰 창을 넘겨도 잘리지 않는다).

## 왜 필요한가

CLIP 은 **한 번에** 77 토큰만 본다. 그것을 프롬프트 길이 한도로 착각해서
`prompt_builder` 가 예산을 넘는 문장을 버려 왔다 — 2026-08-02 실측으로
`natural materials, plausible lighting, contact shadows, realistic exposure.`
가 통째로 탈락한 채 생성이 돌았다. 실사화에 가장 직접적으로 기여하는 문장이다.

77 은 **인코더 1회 창 크기**이고 프롬프트 길이 한도가 아니다. 75 토큰씩 잘라 각각
인코딩한 뒤 시퀀스 축으로 이어붙이면 크로스 어텐션이 그대로 받는다 (A1111·ComfyUI
가 기본으로 하는 방식). 이 모듈이 그 조립을 한다.

## 왜 가짜 인코더로 재는가

여기서 검증하는 것은 **자르고 이어붙이는 규칙**이고 가중치가 아니다. 실제 SDXL 을
올리면 테스트 한 번에 수십 초가 들고 GPU 가 필요해져, 규칙이 틀렸을 때 가장 빨리
알려주는 수단을 잃는다. 실제 파이프라인과 붙는지는 마지막에 생성 1회로 확인한다.
"""

from __future__ import annotations

import pytest
import torch

from app.generation.long_prompt import CHUNK_TOKENS, encode_long_prompt

#: SDXL 의 두 인코더가 내는 히든 차원. 이어붙인 결과가 2048 이어야 UNet 이 받는다.
HIDDEN_1 = 768
HIDDEN_2 = 1280
JOINED_HIDDEN = HIDDEN_1 + HIDDEN_2

WINDOW = CHUNK_TOKENS + 2  # BOS/EOS 를 더한 실제 인코더 창 = 77


class _FakeTokenizer:
    """단어 하나 = 토큰 하나. BOS/EOS 를 직접 붙여야 하는 것까지 실물과 같게 둔다."""

    model_max_length = WINDOW
    bos_token_id = 49406
    eos_token_id = 49407

    def __call__(self, text, add_special_tokens=True, truncation=False, **kwargs):
        ids = [hash(word) % 40000 + 1 for word in text.split()]
        if add_special_tokens:
            ids = [self.bos_token_id, *ids, self.eos_token_id]
        return {"input_ids": ids}


class _FakeTextEncoder:
    """입력 id 길이만큼 히든을 돌려준다. 값은 id 에서 결정론적으로 만든다."""

    def __init__(self, hidden: int, with_pooled: bool):
        self.hidden = hidden
        self.with_pooled = with_pooled
        self.device = torch.device("cpu")
        self.dtype = torch.float32
        self.calls: list[int] = []
        #: 학습 가능한 가중치. 실물 인코더처럼 출력이 이것에 의존해야
        #: `no_grad` 가 빠졌을 때 grad_fn 이 생겨 회귀 테스트가 의미를 갖는다.
        self.weight = torch.ones(1, requires_grad=True)

    def __call__(self, input_ids, output_hidden_states=True, **kwargs):
        batch, length = input_ids.shape
        self.calls.append(length)
        # hidden_states[-2] (penultimate) 를 쓰는 것이 SDXL 규약이라 최소 2단은 있어야 한다.
        last = input_ids.float().unsqueeze(-1).expand(batch, length, self.hidden) / 40000
        last = last * self.weight
        penultimate = last * 0.5
        out = {"hidden_states": (penultimate * 0.1, penultimate, last)}
        if self.with_pooled:
            out["text_embeds"] = torch.ones(batch, self.hidden) * self.weight
        return type("Out", (), out)


class _FakePipe:
    def __init__(self):
        self.tokenizer = _FakeTokenizer()
        self.tokenizer_2 = _FakeTokenizer()
        self.text_encoder = _FakeTextEncoder(HIDDEN_1, with_pooled=False)
        self.text_encoder_2 = _FakeTextEncoder(HIDDEN_2, with_pooled=True)


@pytest.fixture
def pipe() -> _FakePipe:
    return _FakePipe()


def _words(count: int) -> str:
    return " ".join(f"w{i}" for i in range(count))


# --- ① 한 창을 넘겨도 내용이 남는다 -----------------------------------------


def test_prompt_longer_than_one_window_is_not_truncated(pipe):
    """190 단어를 넣으면 3 청크가 되고 시퀀스가 그만큼 길어진다.

    지금 구현(절단)이라면 시퀀스 길이가 창 하나에 갇혀 여기서 실패한다.
    """
    embeds = encode_long_prompt(pipe, _words(190), "")

    expected_chunks = -(-190 // CHUNK_TOKENS)  # 천장 나눗셈
    assert expected_chunks == 3
    assert embeds.prompt_embeds.shape[1] == expected_chunks * WINDOW
    assert embeds.prompt_embeds.shape[2] == JOINED_HIDDEN


def test_short_prompt_still_uses_one_window(pipe):
    """짧은 프롬프트에 빈 청크를 덧붙이지 않는다 — 패딩만 늘면 품질이 흐려진다."""
    embeds = encode_long_prompt(pipe, _words(10), "")
    assert embeds.prompt_embeds.shape[1] == WINDOW


# --- ② positive 와 negative 의 길이가 같다 ----------------------------------


def test_negative_is_padded_to_the_same_length(pipe):
    """CFG 가 둘을 배치로 concat 하므로 길이가 다르면 런타임에 터진다.

    긴 쪽이 positive 인 경우다 — 실제로 이쪽이 흔하다(네거티브는 compact 44 토큰).
    """
    embeds = encode_long_prompt(pipe, _words(190), _words(20))
    assert embeds.negative_prompt_embeds.shape == embeds.prompt_embeds.shape


def test_negative_longer_than_positive_also_matches(pipe):
    """반대 방향도 성립해야 한다 — NEGATIVE_FULL(128 토큰)이 positive 보다 길 수 있다."""
    embeds = encode_long_prompt(pipe, _words(10), _words(150))
    assert embeds.negative_prompt_embeds.shape == embeds.prompt_embeds.shape
    assert embeds.prompt_embeds.shape[1] == 2 * WINDOW


# --- pooled 는 창 하나짜리다 -------------------------------------------------


def test_pooled_comes_from_the_first_chunk_only(pipe):
    """pooled 는 시퀀스가 아니라 문장 하나의 요약이라 이어붙이지 않는다.

    SDXL 의 `add_text_embeds` 가 이 값을 받는데 (batch, 1280) 을 기대한다.
    청크마다 만들어 이어붙이면 차원이 어긋나 UNet 이 받지 못한다.
    """
    embeds = encode_long_prompt(pipe, _words(190), _words(150))
    assert embeds.pooled_prompt_embeds.shape == (1, HIDDEN_2)
    assert embeds.negative_pooled_prompt_embeds.shape == (1, HIDDEN_2)


def test_every_chunk_is_a_full_window(pipe):
    """인코더에는 항상 77 길이로 들어간다 — 가변 길이면 위치 임베딩이 어긋난다."""
    encode_long_prompt(pipe, _words(190), "")
    assert set(pipe.text_encoder.calls) == {WINDOW}
    assert set(pipe.text_encoder_2.calls) == {WINDOW}


# --- 회귀: autograd 그래프를 남기지 않는다 (2026-08-02) ---------------------


def test_encoding_does_not_retain_a_grad_graph(pipe):
    """인코딩 결과에 `grad_fn` 이 붙으면 **모든 층 활성값이 함께 살아남는다.**

    실측: `@torch.no_grad()` 가 없던 동안 청크 3개에서 살아 있는 CUDA 텐서가 2,664개가
    되고, 그것이 UNet 실행 중에도 남아 peak 가 9,210MB(8GB 초과)로 올라갔다. 공유
    메모리로 흘러 장당 16초가 **385초**가 됐다. 붙인 뒤 22초 / 6,199MB.

    `generator` 는 파이프라인 호출만 `inference_mode` 로 감싸고 이 함수는 그 앞에서
    돌기 때문에, 감싸는 책임이 이 함수에 있다. 호출 순서를 바꾸면 조용히 되살아나는
    종류의 버그라 테스트로 못 박는다.
    """
    # 가짜 인코더는 `requires_grad=True` 가중치를 물고 있다(_FakeTextEncoder.weight) —
    # 그래야 no_grad 가 빠졌을 때 출력에 grad_fn 이 생겨 이 테스트가 빨개진다.
    # 실제로 빨개지는지 확인했다(2026-08-02): 데코레이터를 떼면 실패한다.
    assert pipe.text_encoder.weight.requires_grad

    embeds = encode_long_prompt(pipe, _words(190), _words(20))

    for name in ("prompt_embeds", "negative_prompt_embeds"):
        tensor = getattr(embeds, name)
        assert tensor.grad_fn is None, f"{name} 에 그래프가 붙어 있다"
        assert tensor.requires_grad is False
