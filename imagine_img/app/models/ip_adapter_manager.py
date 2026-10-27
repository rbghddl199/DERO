"""IP-Adapter — 레퍼런스 **사진**을 조건으로 건다 (2026-08-06).

## 무엇을 푸는가

지금 파이프라인에서 제품의 **재질과 색**을 정하는 근거가 없다:

```text
3D 캡처      위치·개수·카메라·실루엣
ControlNet   그 윤곽을 픽셀 단위로 고정
프롬프트     "condenser microphone" 같은 카테고리 명사 하나
확산         표면·재질·색은 여기서 지어낸다      <- 근거가 없는 유일한 단계
```

실측(2026-08-06, `outputs/verify-20260806`): 분홍 마이크가 흰 유리로, 데스크 램프는
사라지고, 없던 종이 더미가 생겼다. CLIP 텍스트로는 "이 분홍 마이크" 를 표현할 수단이
없다 — 조명을 프롬프트로 만들려다 실패한 것과 같은 종류의 한계다(FINDINGS §1.1).

IP-Adapter 는 이미지를 CLIP 비전 인코더로 임베딩해서 **텍스트와 나란한 크로스어텐션
경로**로 넣는다. 그래서 픽셀을 붙여넣지 않는다 — 원본 픽셀이 결과에 박히는 경로가
구조적으로 없다(합성·누끼 붙이기와 다른 점이다).

## 목표는 실사화다. 그래서 scale 이 낮다

레퍼런스는 **흰 스튜디오 배경의 제품 컷**이다. scale 을 올리면 제품의 재질만 오는 게
아니라 그 사진의 **배경·조명·구도까지** 따라온다 — 즉 "실제 방을 찍은 사진" 이라는
목표와 정면으로 싸운다. 이 저장소가 하려는 것은 입체적으로 보이게 만드는 것이 아니라
사진처럼 보이게 만드는 것이므로, 이 값은 **실사감을 깎지 않는 선까지만** 올린다.
기본값의 근거는 `Settings.ip_adapter_scale` 주석의 실측표에 있다.

## 어댑터는 하나, 레퍼런스는 여럿

diffusers 는 `ip_adapter_image` 의 장수와 **로드된 어댑터 수가 같아야 한다**
(`prepare_ip_adapter_image_embeds`). 어댑터를 여러 개 올리면 그만큼 UNet 이 커지는데
8GB 카드에서 이미 peak 6.4GB 라 그럴 여유가 없다. 그래서 **어댑터 하나에 임베딩을
평균해서** 넣는다.

평균의 성질을 알고 쓴다: 의자와 키보드를 평균하면 "의자스러움" 도 "키보드스러움" 도
약해진다. 제품이 많을수록 신호가 희석되므로 `IP_ADAPTER_MAX_REFERENCES` 로 끊는다.
영역별로 묶으려면(`ip_adapter_masks`) 제품별 바운딩 박스가 필요한데 요청에 없다
(`generation/references.py` 머리말).

## 왜 vit-h 인가

`ip-adapter_sdxl.bin` 은 ViT-bigG 인코더(fp16 약 1.8GB)를 요구하고 `_vit-h` 는 ViT-H
(약 1.2GB)를 쓴다. 8GB 카드에서 600MB 는 큰 차이다. `plus` 변형은 토큰이 16개라
정체성이 더 세게 실리는데, 그만큼 레퍼런스의 배경까지 세게 끌고 온다 — 실사화가
목적이라 기본은 비-plus 다. 바꾸려면 `IP_ADAPTER_WEIGHT_NAME`.
"""

from __future__ import annotations

import contextlib

from app.core.config import Settings
from app.core.errors import ErrorCode, WorkerError
from app.core.logging import get_logger

log = get_logger(__name__)

#: 우리가 건 scale 을 파이프라인에 적어 둔다. diffusers 에 getter 가 없어서
#: 임시로 0 으로 낮췄다가 되돌릴 때 원래 값을 알 방법이 이것뿐이다.
_SCALE_ATTRIBUTE = "_imagine_img_ip_adapter_scale"


def is_loaded(pipe) -> bool:
    """이 파이프라인의 UNet 에 IP-Adapter 가 붙어 있는가.

    `encoder_hid_proj` 는 어댑터를 올릴 때 UNet 에 생긴다. 이것이 있으면 UNet 이
    `added_cond_kwargs["image_embeds"]` 를 **요구한다** — 안 주면 죽는다. 그래서
    배경·조화 단계처럼 레퍼런스를 안 쓰는 호출도 이 함수를 보고 중립값을 넣어야 한다.
    """
    unet = getattr(pipe, "unet", None)
    projection = getattr(unet, "encoder_hid_proj", None)
    return getattr(projection, "image_projection_layers", None) is not None


def set_scale(pipe, scale: float) -> None:
    pipe.set_ip_adapter_scale(scale)
    setattr(pipe, _SCALE_ATTRIBUTE, scale)


def current_scale(pipe) -> float:
    return float(getattr(pipe, _SCALE_ATTRIBUTE, 0.0))


def encode(pipe, images, do_classifier_free_guidance: bool):
    """레퍼런스 사진들 → `ip_adapter_image_embeds` (어댑터 1개 기준, 평균).

    반환 형태는 diffusers 가 그대로 받는 모양이다. `prepare_ip_adapter_image_embeds` 는
    우리가 준 텐서를 `chunk(2)` 로 **[uncond, cond] 로 가른다.** 그래서 그 순서로 붙인다 —
    뒤집으면 조건과 무조건이 바뀌어 레퍼런스가 반대로 작용한다(조용히 이상해진다).
    """
    import torch
    from diffusers.models.embeddings import ImageProjection

    layers = pipe.unet.encoder_hid_proj.image_projection_layers
    # `plus` 계열은 마지막에서 두 번째 hidden state 를 쓰고, 기본형은 투영된 임베딩을 쓴다.
    # 이 판정은 diffusers 와 **같은 근거**로 해야 한다 — 다르게 고르면 차원이 어긋난다.
    output_hidden_state = not isinstance(layers[0], ImageProjection)
    device = pipe._execution_device

    positives = []
    negatives = []
    with torch.inference_mode():
        for image in images:
            positive, negative = pipe.encode_image(image, device, 1, output_hidden_state)
            positives.append(positive)
            negatives.append(negative)

        # 단순 평균이다. 면적으로 가중하는 것도 생각했지만, 면적이 큰 제품이 그 방의
        # 재질을 더 대표한다는 근거가 아직 없다 — 근거 없는 가중치는 나중에 결과를
        # 설명할 수 없게 만든다. 필요해지면 실측하고 여기서 바꾼다.
        positive = torch.stack(positives).mean(dim=0)
        negative = torch.stack(negatives).mean(dim=0)

    if do_classifier_free_guidance:
        return [torch.cat([negative[None], positive[None]])]
    return [positive[None]]


def neutral_embeds(pipe, do_classifier_free_guidance: bool = True):
    """"아무 레퍼런스도 없음" 을 뜻하는 임베딩. **scale 0 과 함께 써야 뜻이 맞는다.**

    이것만 넣고 scale 을 남겨 두면 "회색 사각형을 참조하라" 는 조건이 된다 — 무효화가
    아니다. 무효화는 scale 이 한다.
    """
    from PIL import Image

    return encode(pipe, [Image.new("RGB", (224, 224), (127, 127, 127))], do_classifier_free_guidance)


@contextlib.contextmanager
def neutralized(pipe):
    """이번 호출 동안만 어댑터를 **없는 것처럼** 만든다. 넣어야 할 kwargs 를 준다.

    배경(2단계)·조화(3단계)는 레퍼런스를 쓰지 않는다. 그런데 어댑터가 붙은 UNet 은
    `image_embeds` 를 요구하므로 그냥 부르면 죽는다. scale 을 0 으로 두면 어댑터의
    기여가 `scale * attn(...)` = 0 이라 **정확히** 아무 일도 하지 않는다 — 0 벡터를
    넣는 것과 다르다(그건 "아무것도 아닌 이미지" 라는 조건이지 무효화가 아니다).

    어댑터가 없으면 빈 dict 를 준다 — 호출부가 분기하지 않아도 되게.
    """
    if not is_loaded(pipe):
        yield {}
        return

    import torch

    previous = current_scale(pipe)
    set_scale(pipe, 0.0)
    try:
        with torch.inference_mode():
            yield {"ip_adapter_image_embeds": neutral_embeds(pipe)}
    finally:
        set_scale(pipe, previous)


class IpAdapterManager:
    """로드 담당. `LoraManager` 와 같은 자리에서 같은 방식으로 쓰인다."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.loaded = False
        self.error: str | None = None

    def load(self, pipe) -> None:
        """`enable_model_cpu_offload()` **전에** 불러야 한다.

        offload 는 모듈에 hook 을 설치한다. 그 뒤에 어댑터를 붙이면 hook 이 가리키는
        모듈과 실제 모듈이 어긋난다 — `pipeline_factory` 머리말이 LoRA·양자화에 대해
        적어 둔 것과 같은 이유이고, 그래서 호출 순서가 그 옆이다.
        """
        if not self.settings.enable_ip_adapter:
            log.info("IP-Adapter disabled (ENABLE_IP_ADAPTER=false).")
            return

        try:
            self._load_image_encoder(pipe)
            pipe.load_ip_adapter(
                self.settings.ip_adapter_repo_id,
                subfolder=self.settings.ip_adapter_subfolder,
                weight_name=self.settings.ip_adapter_weight_name,
                # 인코더는 위에서 직접 올렸다. None 을 주지 않으면 diffusers 가
                # `<subfolder>/image_encoder` 를 찾다가 없어서 실패한다 (SDXL 저장소는
                # 인코더가 `models/image_encoder` 에 따로 있다).
                image_encoder_folder=None,
                cache_dir=str(self.settings.model_cache_dir),
            )
        except Exception as exc:
            self.error = str(exc)
            raise WorkerError(
                ErrorCode.IP_ADAPTER_LOAD_FAILED,
                f"Failed to load IP-Adapter '{self.settings.ip_adapter_weight_name}': {exc}",
                cause=exc,
                hint="scripts/download_models.py 를 먼저 돌리거나 ENABLE_IP_ADAPTER=false 로 끈다.",
            ) from exc

        set_scale(pipe, self.settings.ip_adapter_scale)
        self.loaded = True
        log.info(
            "IP-Adapter loaded: %s/%s (scale=%s, max references=%d)",
            self.settings.ip_adapter_subfolder,
            self.settings.ip_adapter_weight_name,
            self.settings.ip_adapter_scale,
            self.settings.ip_adapter_max_references,
        )

    def _load_image_encoder(self, pipe) -> None:
        """CLIP 비전 인코더를 **파이프라인 dtype 으로** 올려 등록한다.

        diffusers 에 맡기지 않는 이유는 두 가지다: (1) SDXL 어댑터는 인코더가 다른
        폴더(`models/image_encoder`)에 있어 `../` 로 넘겨야 하는데 그 표기가 버전마다
        다르게 다뤄진다, (2) `cache_dir` 을 우리 것으로 확실히 고정해야 한다.

        dtype 을 맞추는 것이 중요하다 — fp32 로 올라가면 fp16 UNet 의 투영 레이어에
        fp32 임베딩이 들어가 형변환 오류로 죽는다.
        """
        if getattr(pipe, "image_encoder", None) is not None:
            return
        from transformers import CLIPVisionModelWithProjection

        encoder = CLIPVisionModelWithProjection.from_pretrained(
            self.settings.ip_adapter_repo_id,
            subfolder=self.settings.ip_adapter_image_encoder_subfolder,
            torch_dtype=pipe.dtype,
            cache_dir=str(self.settings.model_cache_dir),
        )
        pipe.register_modules(image_encoder=encoder)

    def describe(self) -> dict:
        return {
            "enabled": self.settings.enable_ip_adapter,
            "loaded": self.loaded,
            "weightName": self.settings.ip_adapter_weight_name if self.loaded else None,
            "scale": self.settings.ip_adapter_scale if self.loaded else None,
            "maxReferences": self.settings.ip_adapter_max_references if self.loaded else None,
            "error": self.error,
        }
