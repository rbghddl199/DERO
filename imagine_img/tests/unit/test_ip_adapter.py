"""IP-Adapter 임베딩 조립 (`app/models/ip_adapter_manager.py`).

가중치를 받지 않고 검사한다 — 여기서 틀리면 GPU 를 60초 태운 뒤에야 알게 되고,
틀리는 방식이 **조용하다**(모양이 맞으면 그냥 이상한 그림이 나온다).
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest
import torch
from PIL import Image

from app.models import ip_adapter_manager


class _FakePipe:
    """`encode_image` 만 진짜처럼 흉내 낸다. 반환값은 입력 밝기로 정해져 검증할 수 있다."""

    def __init__(self):
        from diffusers.models.embeddings import ImageProjection

        layer = ImageProjection(image_embed_dim=8, cross_attention_dim=8, num_image_text_embeds=4)
        self.unet = SimpleNamespace(
            encoder_hid_proj=SimpleNamespace(image_projection_layers=[layer])
        )
        self._execution_device = torch.device("cpu")
        self.scales: list[float] = []

    def encode_image(self, image, device, num_images_per_prompt, output_hidden_states):
        assert output_hidden_states is False, "비-plus 어댑터는 투영된 임베딩을 쓴다"
        brightness = float(torch.tensor(list(image.convert("L").getdata()), dtype=torch.float32).mean())
        positive = torch.full((1, 8), brightness)
        return positive, torch.zeros_like(positive)

    def set_ip_adapter_scale(self, scale):
        self.scales.append(scale)


def test_is_loaded_is_false_without_an_adapter():
    assert ip_adapter_manager.is_loaded(SimpleNamespace(unet=SimpleNamespace())) is False
    assert ip_adapter_manager.is_loaded(_FakePipe()) is True


def test_embeds_are_the_average_of_every_reference():
    """어댑터는 하나뿐이라 여러 장은 평균으로 들어간다 (모듈 머리말)."""
    pipe = _FakePipe()
    images = [Image.new("RGB", (8, 8), (0, 0, 0)), Image.new("RGB", (8, 8), (200, 200, 200))]

    embeds = ip_adapter_manager.encode(pipe, images, do_classifier_free_guidance=True)

    assert len(embeds) == 1, "로드된 어댑터 수와 같아야 한다"
    negative, positive = embeds[0].chunk(2)
    single = ip_adapter_manager.encode(pipe, [images[0]], True)[0].chunk(2)[1]
    assert positive.shape == single.shape
    # 검정(0)과 밝은 회색(200)의 평균이 들어가야 한다 — 한쪽만 쓰면 다른 제품이 통째로 빠진다.
    assert positive.mean() == pytest.approx((single.mean() + 200) / 2, abs=1e-3)
    assert negative.abs().sum() == 0


def test_the_uncond_half_comes_first():
    """diffusers 는 우리가 준 텐서를 `chunk(2)` 로 [uncond, cond] 로 가른다.

    뒤집으면 레퍼런스가 **반대로** 작용하는데, 예외가 없어서 결과를 봐야만 안다.
    """
    pipe = _FakePipe()
    embeds = ip_adapter_manager.encode(
        pipe, [Image.new("RGB", (8, 8), (255, 255, 255))], do_classifier_free_guidance=True
    )
    negative, positive = embeds[0].chunk(2)
    assert negative.abs().sum() == 0 and positive.abs().sum() > 0


def test_without_cfg_only_one_half_is_sent():
    pipe = _FakePipe()
    embeds = ip_adapter_manager.encode(
        pipe, [Image.new("RGB", (8, 8), (255, 255, 255))], do_classifier_free_guidance=False
    )
    assert embeds[0].shape[0] == 1


def test_neutralized_zeroes_the_scale_and_restores_it():
    """배경·조화 단계는 레퍼런스를 쓰지 않지만 UNet 은 image_embeds 를 요구한다."""
    pipe = _FakePipe()
    ip_adapter_manager.set_scale(pipe, 0.4)

    with ip_adapter_manager.neutralized(pipe) as extra:
        assert pipe.scales[-1] == 0.0, "무효화는 scale 이 한다 (0 벡터가 아니다)"
        assert "ip_adapter_image_embeds" in extra

    assert ip_adapter_manager.current_scale(pipe) == 0.4


def test_neutralized_is_a_no_op_without_an_adapter():
    """어댑터가 없으면 호출부가 분기하지 않아도 되게 빈 dict 를 준다."""
    with ip_adapter_manager.neutralized(SimpleNamespace(unet=SimpleNamespace())) as extra:
        assert extra == {}
