"""2단계: 제품은 그대로 두고 **배경만** 새로 그린다 (2026-08-04).

## 왜 두 단계인가

두 요구가 서로 반대다:

```text
저작권  -> 제품을 바꿔야 한다 (로고·각인·고유 장식을 지운다)
배경    -> 제품을 지켜야 한다 (그대로 두고 주변만 만든다)
```

한 번에 하면 둘 중 하나를 포기한다. 그래서 나눈다:

```text
1단계  img2img + canny, strength 0.9   제품을 브랜드 없는 물건으로 다시 그린다 (배경은 흰색)
2단계  inpaint + 배경 마스크            1단계 결과의 제품은 보존하고 배경만 방으로 만든다
```

2단계에서 제품이 보존되는 것은 프롬프트가 아니라 **마스크**가 하는 일이다. 마스크 밖은
파이프라인이 손대지 않는다. 그래서 흰 배경이 프롬프트로는 안 바뀌던 문제
(prompts/product_copyright_safe.txt 머리말의 실패 목록)가 여기서 풀린다.

## 왜 ControlNet 을 쓰지 않는가

배경 단계에서 canny 를 주면 **제품 외곽선 바깥의 빈 영역이 다시 "아무것도 없음" 으로
고정된다** — 그게 바로 1단계에서 흰 배경이 남던 이유다. 그래서 이 단계는 조건 이미지 없이
돈다. 구조를 지키는 일은 마스크가 이미 하고 있다.
"""

from __future__ import annotations

import torch
from PIL import Image

from app.core.config import Settings
from app.core.errors import ErrorCode, WorkerError
from app.core.logging import get_logger

log = get_logger(__name__)

#: 마스크 영역을 얼마나 새로 그릴지. 배경은 남길 것이 없으므로 1.0 이다.
SCENE_STRENGTH = 1.0

#: 3단계(조화)에서 화면 전체를 얼마나 다시 그릴지.
#:
#: 마스크가 없는 단계라 이 값이 곧 "제품이 얼마나 바뀌는가" 다. 낮으면 조명이 덜 섞여
#: 붙여넣은 티가 남고, 높으면 제품이 다른 물건으로 흘러간다 — 1단계에서 이미 실측한
#: 성질이다(strength 를 올리면 모니터가 iMac 이 된다). ControlNet 이 함께 형태를 붙든다.
#: 0.25 에서는 경계가 아직 보였고 0.32 에서 방과 하나로 읽혔다 (2026-08-04 실측).
HARMONIZE_STRENGTH = 0.32


def place_in_scene(
    image: Image.Image,
    mask: Image.Image,
    prompt: str,
    negative_prompt: str,
    service,
    settings: Settings,
    seed: int,
) -> Image.Image:
    """`mask` 가 흰색인 영역에 방을 그린다. 나머지 픽셀은 그대로 남는다."""
    if not prompt:
        raise WorkerError(
            ErrorCode.INVALID_REQUEST,
            "background prompt is empty; add a [background] section to the prompt file.",
        )

    pipe = service.inpaint_pipe()
    generator = torch.Generator(device=settings.generator_device).manual_seed(seed)
    kwargs = {
        "image": image,
        "mask_image": mask,
        "strength": SCENE_STRENGTH,
        "num_inference_steps": settings.resolved_steps,
        "guidance_scale": settings.resolved_guidance_scale,
        "num_images_per_prompt": 1,
        "generator": generator,
        # 마스크 경계 바깥을 픽셀 단위로 보존한다. diffusers 는 VAE 를 거친 결과를
        # 마스크로 다시 합성해 주는데, 이 플래그가 없으면 제품 전체가 VAE 왕복으로
        # 미세하게 흐려진다 — 1단계에서 만든 디테일을 잃는 것이다.
        "padding_mask_crop": None,
    }
    if settings.enable_long_prompt:
        from app.generation.long_prompt import encode_long_prompt

        kwargs.update(encode_long_prompt(pipe, prompt, negative_prompt).as_call_kwargs())
    else:
        kwargs["prompt"] = prompt
        if negative_prompt:
            kwargs["negative_prompt"] = negative_prompt

    if getattr(pipe, "controlnet", None) is not None:
        # ControlNet 파이프라인은 control_image 를 요구한다. 배경을 고정하지 않으려면
        # 조건이 없어야 하므로(모듈 주석) 검은 이미지를 주고 강도를 0 으로 만든다.
        kwargs["control_image"] = Image.new("RGB", image.size, (0, 0, 0))
        kwargs["controlnet_conditioning_scale"] = 0.0

    # 이 단계는 레퍼런스를 쓰지 않는다. 그런데 IP-Adapter 가 붙은 UNet 은 image_embeds 를
    # 요구하므로 중립값을 넣어야 한다 (ip_adapter_manager.neutralized).
    from app.models import ip_adapter_manager

    try:
        with ip_adapter_manager.neutralized(pipe) as extra, torch.inference_mode():
            produced = pipe(**kwargs, **extra).images[0]
    except torch.cuda.OutOfMemoryError as exc:
        torch.cuda.empty_cache()
        raise WorkerError(
            ErrorCode.CUDA_OUT_OF_MEMORY, "Background pass ran out of GPU memory.", cause=exc
        ) from exc
    except Exception as exc:
        raise WorkerError(
            ErrorCode.INFERENCE_FAILED, f"Background pass failed: {exc}", cause=exc
        ) from exc

    if produced.size != image.size:
        produced = produced.resize(image.size, Image.LANCZOS)

    # 마스크 밖을 원본 픽셀로 되돌린다. 파이프라인이 이미 합성하지만 구현에 따라 경계에서
    # 미세하게 어긋난다 — 제품을 지키는 것이 이 단계의 전제이므로 명시적으로 한다.
    #
    # **여기서는 흐린 마스크를 쓰지 않는다.** 흐린 값(예: 128)은 "새 배경과 옛 픽셀을 반씩
    # 섞어라" 는 뜻인데, 옛 픽셀은 흰 배경이라 경계에 흰 테두리가 생긴다 (2026-08-04 실측:
    # 의자 좌판·다리 주변이 빛나 보였다). 조금이라도 배경인 자리는 **전부** 생성된 픽셀을
    # 쓴다. 흐린 마스크는 파이프라인에만 준다 — 그쪽에서는 경계를 자연스럽게 잇는 데 쓰인다.
    return Image.composite(produced, image, mask.point(lambda value: 255 if value > 8 else 0))


def harmonize(
    image: Image.Image,
    prompt: str,
    negative_prompt: str,
    service,
    settings: Settings,
    seed: int,
    strength: float = HARMONIZE_STRENGTH,
) -> Image.Image:
    """화면 전체를 낮은 strength 로 한 번 더 그려 **한 장의 사진으로 맞춘다.**

    2단계까지는 제품 픽셀이 마스크로 얼어 있다. 그래서 스튜디오 조명 그대로인 제품이 창문
    조명의 방 위에 얹혀 "누끼 따서 붙인" 것처럼 보인다 — 프롬프트로는 못 고친다. 얼어붙은
    픽셀을 다시 비출 수 없기 때문이다. 여기서 마스크를 풀어야 조명이 섞인다.

    1단계와 같은 img2img 파이프라인을 쓴다(새로 만들지 않는다). ControlNet 은 켜 둔다 —
    마스크가 없는 단계라 형태를 붙들 것이 그것뿐이다.
    """
    if not prompt:
        raise WorkerError(
            ErrorCode.INVALID_REQUEST,
            "harmonize prompt is empty; add a [harmonize] section to the prompt file.",
        )

    from app.generation import control_image

    pipe = service.pipe
    generator = torch.Generator(device=settings.generator_device).manual_seed(seed)
    kwargs = {
        "image": image,
        "strength": strength,
        "num_inference_steps": settings.resolved_steps,
        "guidance_scale": settings.resolved_guidance_scale,
        "num_images_per_prompt": 1,
        "generator": generator,
    }
    if settings.enable_long_prompt:
        from app.generation.long_prompt import encode_long_prompt

        kwargs.update(encode_long_prompt(pipe, prompt, negative_prompt).as_call_kwargs())
    else:
        kwargs["prompt"] = prompt
        if negative_prompt:
            kwargs["negative_prompt"] = negative_prompt

    if settings.enable_controlnet:
        kwargs["control_image"] = control_image.build_control_image(image, settings)
        kwargs["controlnet_conditioning_scale"] = settings.controlnet_conditioning_scale

    # 배경 단계와 같은 이유로 중립값을 넣는다. 조화 단계에 레퍼런스를 물리는 것은
    # **아직 실측하지 않았다** — 붙여넣은 티를 지우는 것이 이 단계의 일이고, 거기에
    # 스튜디오 배경 컷을 조건으로 걸면 반대로 갈 수 있다.
    from app.models import ip_adapter_manager

    try:
        with ip_adapter_manager.neutralized(pipe) as extra, torch.inference_mode():
            produced = pipe(**kwargs, **extra).images[0]
    except torch.cuda.OutOfMemoryError as exc:
        torch.cuda.empty_cache()
        raise WorkerError(
            ErrorCode.CUDA_OUT_OF_MEMORY, "Harmonize pass ran out of GPU memory.", cause=exc
        ) from exc
    except Exception as exc:
        raise WorkerError(
            ErrorCode.INFERENCE_FAILED, f"Harmonize pass failed: {exc}", cause=exc
        ) from exc

    if produced.size != image.size:
        produced = produced.resize(image.size, Image.LANCZOS)
    return produced
