"""SDXL 텍스트 인코더 쌍의 가짜. 청킹 규칙을 GPU 없이 재기 위한 것이다.

## 왜 공용으로 뽑았는가

2026-08-02 에 `generator` 가 `service.pipe` 에 요구하는 것이 넓어졌다 — 전에는
`pipe(**kwargs)` 만 부르면 됐지만, 이제 긴 프롬프트를 직접 인코딩하려고
`pipe.tokenizer` · `pipe.text_encoder` · `pipe.tokenizer_2` · `pipe.text_encoder_2`
를 읽는다(`app/generation/long_prompt.py`).

그래서 파이프라인을 가짜로 세우는 곳이 둘이 됐고(청킹 단위 테스트, CPU 파이프라인
통합 테스트) 같은 가짜를 두 번 쓰면 **한쪽만 실물과 어긋나도 다른 쪽이 통과한다.**
정의를 한 곳에 둔다.
"""

from __future__ import annotations

import torch

#: SDXL 두 인코더의 히든 차원. 이어붙이면 UNet 이 기대하는 2048 이 된다.
HIDDEN_1 = 768
HIDDEN_2 = 1280
JOINED_HIDDEN = HIDDEN_1 + HIDDEN_2


class FakeTokenizer:
    """단어 하나 = 토큰 하나. BOS/EOS 를 직접 붙여야 하는 것까지 실물과 같게 둔다."""

    model_max_length = 77
    bos_token_id = 49406
    eos_token_id = 49407

    def __call__(self, text, add_special_tokens=True, truncation=False, **kwargs):
        ids = [hash(word) % 40000 + 1 for word in text.split()]
        if add_special_tokens:
            ids = [self.bos_token_id, *ids, self.eos_token_id]
        return {"input_ids": ids}


class FakeTextEncoder:
    """입력 id 길이만큼 히든을 돌려준다. 값은 id 에서 결정론적으로 만든다.

    `hidden_states` 를 3단으로 두는 이유: SDXL 은 마지막이 아니라 `[-2]`(penultimate)
    를 쓴다. 2단만 두면 그 규약을 어긴 코드도 통과한다.
    """

    def __init__(self, hidden: int, with_pooled: bool):
        self.hidden = hidden
        self.with_pooled = with_pooled
        self.device = torch.device("cpu")
        self.dtype = torch.float32
        self.calls: list[int] = []

    def __call__(self, input_ids, output_hidden_states=True, **kwargs):
        batch, length = input_ids.shape
        self.calls.append(length)
        last = input_ids.float().unsqueeze(-1).expand(batch, length, self.hidden) / 40000
        penultimate = last * 0.5
        out = {"hidden_states": (penultimate * 0.1, penultimate, last)}
        if self.with_pooled:
            out["text_embeds"] = torch.ones(batch, self.hidden)
        return type("Out", (), out)


def attach_text_encoders(pipe) -> None:
    """가짜 파이프라인에 SDXL 텍스트 인코더 표면을 붙인다."""
    pipe.tokenizer = FakeTokenizer()
    pipe.tokenizer_2 = FakeTokenizer()
    pipe.text_encoder = FakeTextEncoder(HIDDEN_1, with_pooled=False)
    pipe.text_encoder_2 = FakeTextEncoder(HIDDEN_2, with_pooled=True)
