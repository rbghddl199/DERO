"""모델 상주 서비스 (설계서 §15).

Worker 시작 시 1회 로드하고 계속 유지한다. 요청마다 재로드하지 않는다.
동시 작업 1개를 보장하는 락도 여기서 갖는다.
"""

from __future__ import annotations

import threading
import time

from PIL import Image, ImageDraw

from app.core.config import Settings, get_settings
from app.core.errors import ErrorCode, WorkerError
from app.core.logging import get_logger
from app.core.metrics import cuda_available, gpu_name, snapshot_memory, total_vram_mb

log = get_logger(__name__)


class ModelService:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self.pipe = None
        self.runtime: dict = {}
        self.ready = False
        self.load_error: str | None = None
        self.job_lock = threading.Lock()
        self.model_load_ms: int | None = None
        self.warmup_ms: int | None = None
        self._inpaint_pipe = None

    # --- inpaint (배경 생성 2단계) -----------------------------------------
    def inpaint_pipe(self):
        """같은 가중치를 쓰는 inpaint 파이프라인. 처음 부를 때 만든다.

        **VRAM 을 더 쓰지 않는다.** `pipe.components` 로 이미 올라온 UNet·VAE·텍스트
        인코더·ControlNet 을 그대로 넘겨 껍데기만 새로 만든다 — 다시 내려받지도 않는다.
        8GB 카드에서 두 벌을 올리면 공유 메모리로 밀려나 추론이 수 분으로 무너진다.

        전용 inpaint 체크포인트가 아니라 일반 SDXL 체크포인트를 쓴다. 마스크 영역을
        strength 1.0 으로 다시 그리는 용도에는 충분하고(실측), 전용 모델을 받으면 5GB 가
        더 필요하다.
        """
        if self._inpaint_pipe is not None:
            return self._inpaint_pipe
        if self.pipe is None:
            raise WorkerError(ErrorCode.MODEL_NOT_READY, "Model is not loaded yet.")

        from diffusers import (
            StableDiffusionXLControlNetInpaintPipeline,
            StableDiffusionXLInpaintPipeline,
        )

        components = dict(self.pipe.components)
        # 파이프라인마다 받는 인자가 달라서, 넘길 수 없는 것은 빼야 __init__ 이 죽지 않는다.
        components.pop("image_encoder", None)
        components.pop("feature_extractor", None)
        if "controlnet" in components:
            factory = StableDiffusionXLControlNetInpaintPipeline
        else:
            factory = StableDiffusionXLInpaintPipeline
            components.pop("controlnet", None)
        self._inpaint_pipe = factory(**components)
        log.info("inpaint pipeline ready (%s, weights shared)", factory.__name__)
        return self._inpaint_pipe

    # --- 기동 -------------------------------------------------------------
    def load(self) -> None:
        from app.models.pipeline_factory import build_pipeline

        if self.settings.memory_mode != "cuda" and not cuda_available():
            log.warning("CUDA is not available; the pipeline will run on CPU and be very slow.")

        started = time.perf_counter()
        try:
            self.pipe, self.runtime = build_pipeline(self.settings)
        except WorkerError as exc:
            self.load_error = exc.message
            raise
        except Exception as exc:  # pragma: no cover
            self.load_error = str(exc)
            raise WorkerError(ErrorCode.MODEL_LOAD_FAILED, str(exc), cause=exc) from exc
        self.model_load_ms = int(round((time.perf_counter() - started) * 1000))
        log.info("model loaded in %d ms", self.model_load_ms)

        self.warmup()
        self.ready = True
        log.info("READY")

    def warmup(self) -> None:
        """작은 고정 입력으로 1회 예열한다. 첫 실사용 요청이 컴파일/캐시 비용을 물지 않게 한다."""
        import torch

        size = self.settings.warmup_size
        # 단색이면 canny 엣지가 하나도 안 나와 ControlNet 이 거부할 수 있으므로 사각형을 하나 그린다.
        dummy = Image.new("RGB", (size, size), (128, 128, 128))
        ImageDraw.Draw(dummy).rectangle((size // 4, size // 4, size * 3 // 4, size * 3 // 4), fill=(40, 40, 40))

        kwargs = {
            "prompt": "warmup",
            "image": dummy,
            "strength": self.settings.resolved_strength,
            "num_inference_steps": self.settings.resolved_steps,
            "guidance_scale": self.settings.resolved_guidance_scale,
            "num_images_per_prompt": 1,
            "generator": torch.Generator(device=self.settings.generator_device).manual_seed(0),
        }
        if self.settings.enable_controlnet:
            # ControlNet 파이프라인은 control_image 가 필수다. 예열도 같은 경로로 돌려야
            # 실제 요청에서 처음 겪는 비용이 없다.
            from app.generation import control_image

            kwargs["control_image"] = control_image.build_control_image(dummy, self.settings)
            kwargs["controlnet_conditioning_scale"] = self.settings.controlnet_conditioning_scale

        started = time.perf_counter()
        # IP-Adapter 가 붙어 있으면 UNet 이 `image_embeds` 를 **요구한다** — 예열이라고
        # 빼면 여기서 죽는다. 예열의 목적은 경로를 한 번 밟아 두는 것이므로 중립값
        # (scale 0)이면 충분하다. 어텐션 프로세서 자체는 scale 과 무관하게 돌아간다.
        from app.models import ip_adapter_manager

        with ip_adapter_manager.neutralized(self.pipe) as extra, torch.inference_mode():
            self.pipe(**kwargs, **extra)
        self.warmup_ms = int(round((time.perf_counter() - started) * 1000))
        log.info("warm-up done in %d ms (%dx%d)", self.warmup_ms, size, size)

    # --- 상태 -------------------------------------------------------------
    def describe(self) -> dict:
        memory = snapshot_memory()
        profile = self.settings.profile
        return {
            "ready": self.ready,
            "gpu": gpu_name(),
            "totalVramMb": round(total_vram_mb()),
            "modelProfile": profile.name,
            "model": self.runtime.get("checkpoint") or profile.name,
            "steps": self.settings.resolved_steps,
            "guidanceScale": self.settings.resolved_guidance_scale,
            "supportsNegativePrompt": self.settings.supports_negative_prompt,
            "negativePromptProfile": self.settings.negative_prompt_profile,
            "defaultStrength": self.settings.resolved_strength,
            "memoryMode": self.settings.memory_mode,
            "quantization": self.settings.quantization_mode,
            "loraEnabled": bool(self.runtime.get("lora", {}).get("loaded")),
            "modelLoadMs": self.model_load_ms,
            "warmupMs": self.warmup_ms,
            "busy": self.job_lock.locked(),
            "loadError": self.load_error,
            "runtime": self.runtime or None,
            "memory": memory.to_payload(),
        }


_service: ModelService | None = None


def get_service() -> ModelService:
    """프로세스 전역 단일 인스턴스. FastAPI 와 CLI 가 같은 것을 쓴다."""
    global _service
    if _service is None:
        _service = ModelService()
    return _service


def set_service(service: ModelService | None) -> None:
    """테스트에서 fake pipeline 을 주입할 때, 또는 프로필 비교에서 해제할 때 쓴다.

    None 을 주면 다음 get_service() 가 새로 만든다.
    """
    global _service
    _service = service
