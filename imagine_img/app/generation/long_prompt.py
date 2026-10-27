"""CLIP 77 토큰 창을 넘는 프롬프트를 절단 없이 인코딩한다.

## 왜 있는가

`prompt_builder` 는 77 토큰 예산을 넘는 문장을 **버려** 왔다. 2026-08-02 실측에서
`natural materials, plausible lighting, contact shadows, realistic exposure.` 가
통째로 탈락한 채 생성이 돌았다 — 실사화에 가장 직접적으로 기여하는 문장이다.

77 은 프롬프트 길이 한도가 아니라 **인코더 1회의 창 크기**다. 75 토큰씩 잘라 각각
인코딩하고 시퀀스 축으로 이어붙이면 크로스 어텐션이 그대로 받는다. A1111·ComfyUI 에서
200 단어 프롬프트가 먹히는 것이 이 방식이고, diffusers 파이프라인도 `prompt`
대신 `prompt_embeds` 를 받으므로 넣을 자리가 있다.

## CLIP 이 여전히 못 하는 것

길이를 열어도 **부정문과 관계는 표현되지 않는다.** CLIP 은 bag-of-concepts 라
`do not add or remove products` 에서 `do not` 을 무시하고 `add`·`remove`·`products`
만 읽는다. 그래서 이 모듈이 프롬프트를 길게 실을 수 있게 해 주더라도, 배치 보존은
프롬프트가 아니라 ControlNet 이 한다. 넣어서 되는 것은 재질·조명·무드·팔레트처럼
**나열로 성립하는 개념**이다.

## SDXL 규약 세 가지

1. **두 인코더의 penultimate 히든을 특징 축으로 이어붙인다** — 768 + 1280 = 2048.
   마지막 단이 아니라 `hidden_states[-2]` 를 쓰는 것이 SDXL 규약이다.
2. **pooled 는 이어붙이지 않는다.** `add_text_embeds` 가 `(batch, 1280)` 을 기대하는
   문장 요약이라, 첫 청크의 값만 쓴다. 청크마다 만들어 이어붙이면 UNet 이 못 받는다.
3. **positive 와 negative 의 시퀀스 길이가 같아야 한다.** CFG 가 둘을 배치로 concat
   하므로 길이가 다르면 런타임에 터진다. 짧은 쪽을 빈 청크로 채운다.
"""

from __future__ import annotations

from dataclasses import dataclass

import torch

#: 한 청크에 담는 **내용** 토큰 수. 창 77 에서 BOS/EOS 2개를 뺀 값이다.
CHUNK_TOKENS = 75


@dataclass(frozen=True)
class EncodedPrompt:
    """`StableDiffusionXLControlNetImg2ImgPipeline` 에 그대로 넘기는 네 텐서."""

    prompt_embeds: torch.Tensor
    negative_prompt_embeds: torch.Tensor
    pooled_prompt_embeds: torch.Tensor
    negative_pooled_prompt_embeds: torch.Tensor

    def as_call_kwargs(self) -> dict:
        return {
            "prompt_embeds": self.prompt_embeds,
            "negative_prompt_embeds": self.negative_prompt_embeds,
            "pooled_prompt_embeds": self.pooled_prompt_embeds,
            "negative_pooled_prompt_embeds": self.negative_pooled_prompt_embeds,
        }


def _content_ids(tokenizer, text: str) -> list[int]:
    """BOS/EOS 를 뗀 내용 토큰. 절단하지 않는다 — 자르는 것이 이 모듈이 없애려는 동작이다."""
    ids = tokenizer(text, add_special_tokens=True, truncation=False)["input_ids"]
    if isinstance(ids, torch.Tensor):
        ids = ids.tolist()
    if ids and isinstance(ids[0], list):  # 일부 토크나이저는 배치로 감싼다
        ids = ids[0]
    return list(ids[1:-1])


#: 인코더에 들어가는 창 길이. BOS + 내용 75 + EOS.
WINDOW_TOKENS = CHUNK_TOKENS + 2


def _empty_window(bos: int, eos: int) -> list[int]:
    """내용이 없는 창. **길이 계산을 한 곳에만 둔다** — 빈 창을 만드는 자리가 둘(빈
    프롬프트, 짧은 쪽 채우기)이라 산술을 복제했다가 두 곳 다 76 으로 틀렸다."""
    return [bos] + [eos] * (WINDOW_TOKENS - 1)


def _chunks(ids: list[int], bos: int, eos: int) -> list[list[int]]:
    """75 토큰씩 잘라 BOS/EOS 를 씌운 77 길이 창 목록.

    빈 프롬프트도 창 하나를 만든다 — negative 가 비었을 때 길이 0 을 돌려주면
    positive 와 짝이 안 맞는다.
    """
    if not ids:
        return [_empty_window(bos, eos)]
    windows = []
    for start in range(0, len(ids), CHUNK_TOKENS):
        content = ids[start : start + CHUNK_TOKENS]
        # 마지막 청크는 짧을 수 있다. 창 길이를 고정하지 않으면 위치 임베딩이 어긋난다.
        padding = [eos] * (CHUNK_TOKENS - len(content))
        windows.append([bos, *content, eos, *padding])
    return windows


def _encode_window(pipe, window: list[int]) -> tuple[torch.Tensor, torch.Tensor]:
    """창 하나 → (이어붙인 히든 2048, encoder_2 의 pooled)."""
    hidden_parts = []
    pooled = None
    for tokenizer, encoder in (
        (pipe.tokenizer, pipe.text_encoder),
        (pipe.tokenizer_2, pipe.text_encoder_2),
    ):
        del tokenizer  # 창은 이미 id 로 잘려 있다. 토크나이저는 특수 토큰 규약용으로만 봤다.
        ids = torch.tensor([window], dtype=torch.long, device=encoder.device)
        out = encoder(ids, output_hidden_states=True)
        hidden_parts.append(out.hidden_states[-2])
        text_embeds = getattr(out, "text_embeds", None)
        if text_embeds is not None:
            pooled = text_embeds
    return torch.concat(hidden_parts, dim=-1), pooled


@torch.no_grad()
def encode_long_prompt(pipe, prompt: str, negative_prompt: str) -> EncodedPrompt:
    """길이 제한 없는 프롬프트 쌍을 인코딩한다.

    positive·negative 를 같은 청크 수로 맞춘 뒤 각각 이어붙인다.

    ## `@torch.no_grad()` 가 없으면 8GB 에서 못 돈다

    `generator` 는 **파이프라인 호출만** `torch.inference_mode()` 로 감싼다. 이 함수는 그
    앞에서 돌므로 감싸는 쪽이 없고, 그러면 autograd 가 역전파용 그래프를 만들어 두 인코더의
    **모든 층 활성값을 보관**한다 — 실측(2026-08-02): 청크 3개에서 살아 있는 CUDA 텐서가
    2,664개가 되고 그것이 UNet 실행 중에도 남아 peak 가 9,210MB 로 올라간다. 8GB 를 넘겨
    WDDM 공유 메모리로 흘러 장당 16초가 385초가 됐다.
    """
    bos = pipe.tokenizer.bos_token_id
    eos = pipe.tokenizer.eos_token_id

    positive_windows = _chunks(_content_ids(pipe.tokenizer, prompt), bos, eos)
    negative_windows = _chunks(_content_ids(pipe.tokenizer, negative_prompt), bos, eos)

    # 짧은 쪽을 빈 창으로 채운다 (SDXL 규약 3).
    empty = _empty_window(bos, eos)
    while len(positive_windows) < len(negative_windows):
        positive_windows.append(empty)
    while len(negative_windows) < len(positive_windows):
        negative_windows.append(empty)

    positive_hidden, positive_pooled = [], None
    for index, window in enumerate(positive_windows):
        hidden, pooled = _encode_window(pipe, window)
        positive_hidden.append(hidden)
        if index == 0:
            positive_pooled = pooled

    negative_hidden, negative_pooled = [], None
    for index, window in enumerate(negative_windows):
        hidden, pooled = _encode_window(pipe, window)
        negative_hidden.append(hidden)
        if index == 0:
            negative_pooled = pooled

    encoded = EncodedPrompt(
        prompt_embeds=torch.concat(positive_hidden, dim=1),
        negative_prompt_embeds=torch.concat(negative_hidden, dim=1),
        pooled_prompt_embeds=positive_pooled,
        negative_pooled_prompt_embeds=negative_pooled,
    )

    # **인코더를 GPU 에서 내린다.** 이것이 없으면 8GB 에서 못 돈다.
    #
    # `enable_model_cpu_offload` 는 파이프라인이 모듈을 부를 때마다 앞 모듈을 CPU 로
    # 축출한다. 그런데 우리는 `pipe.__call__` 밖에서 인코더를 직접 부르므로 그 순서에
    # 끼지 못하고, `text_encoder_2`(fp16 약 1.4GB)가 GPU 에 남은 채 UNet 이 올라간다.
    #
    # 실측(2026-08-02, RTX 8GB · 1344x768 · 231 토큰):
    #   그냥 두면   peak alloc 9,253MB → WDDM 공유 메모리 스필 → 장당 439초
    #   내려주면    아래 측정 참고 (같은 입력에서 짧은 프롬프트는 5,946MB / 16초)
    # 어텐션 슬라이싱으로는 안 잡혔다 — 메모리가 어텐션이 아니라 **상주 가중치**에 있다.
    free_hooks = getattr(pipe, "maybe_free_model_hooks", None)
    if free_hooks is not None:
        free_hooks()

    return encoded
