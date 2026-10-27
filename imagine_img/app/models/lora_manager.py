"""LoRA adapter 관리 (설계서 §8).

기능은 구현하고 기본값은 OFF. 안전 규칙:
- SDXL 계열 LoRA 인지 확인한다. 다른 계열을 조용히 로드하지 않는다.
- 로드 실패 시 기본 모델로 조용히 계속 실행하지 않는다 (LORA_LOAD_FAILED).
- FUSE 는 기본 false. fuse 하면 scale 변경과 unload 가 불가능해진다.
"""

from __future__ import annotations

from pathlib import Path

from safetensors import safe_open

from app.core.config import Settings
from app.core.errors import ErrorCode, WorkerError
from app.core.logging import get_logger

log = get_logger(__name__)

ADAPTER_NAME = "dero_style"

# SDXL LoRA 는 text_encoder_2 (1280 dim) 를 갖는다. SD1.5/SD2 LoRA 에는 없다.
_SDXL_MARKERS = ("text_encoder_2", "add_embedding", "addition_embed_type")


class LoraManager:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.loaded = False
        self.scale: float | None = None

    # --- 검증 -------------------------------------------------------------
    def _resolve_path(self) -> Path:
        raw = (self.settings.dero_lora_path or "").strip()
        if not raw:
            raise WorkerError(
                ErrorCode.LORA_LOAD_FAILED,
                "ENABLE_DERO_LORA=true but DERO_LORA_PATH is empty.",
            )
        path = Path(raw)
        if not path.is_absolute():
            path = (Path(__file__).resolve().parents[2] / path).resolve()
        if not path.exists():
            raise WorkerError(ErrorCode.LORA_LOAD_FAILED, f"LoRA path does not exist: {path}")
        return path

    def _assert_sdxl_family(self, path: Path) -> None:
        """safetensors 키를 열어 SDXL 계열인지 확인한다.

        일반 SDXL Base 에 학습된 LoRA 가 distilled Lightning UNet 에서 같은 품질을 낸다고
        가정하지 않는다 (설계서 §8.3). 여기서 확인하는 것은 "계열이 맞는가" 뿐이다.
        """
        target = path
        if target.is_dir():
            name = (self.settings.dero_lora_weight_name or "").strip()
            candidates = [target / name] if name else sorted(target.glob("*.safetensors"))
            if not candidates:
                raise WorkerError(
                    ErrorCode.LORA_LOAD_FAILED,
                    f"No .safetensors weight found in LoRA directory {target}.",
                )
            target = candidates[0]

        if target.suffix != ".safetensors":
            log.warning(
                "LoRA %s is not a .safetensors file; family check is skipped. "
                "Verify manually that it is an SDXL LoRA.",
                target.name,
            )
            return

        try:
            with safe_open(str(target), framework="pt") as handle:
                keys = list(handle.keys())
        except Exception as exc:
            raise WorkerError(
                ErrorCode.LORA_LOAD_FAILED, f"Cannot read LoRA file {target}: {exc}", cause=exc
            ) from exc

        joined = "\n".join(keys)
        if not any(marker in joined for marker in _SDXL_MARKERS):
            raise WorkerError(
                ErrorCode.LORA_LOAD_FAILED,
                f"{target.name} does not look like an SDXL LoRA "
                f"(no {'/'.join(_SDXL_MARKERS)} keys among {len(keys)} tensors). "
                "Refusing to load a foreign-family adapter.",
            )

    # --- 계약 -------------------------------------------------------------
    def load_optional_adapter(self, pipe) -> None:
        if not self.settings.enable_dero_lora:
            log.info("DERO LoRA disabled (ENABLE_DERO_LORA=false).")
            return

        path = self._resolve_path()
        self._assert_sdxl_family(path)

        try:
            pipe.load_lora_weights(
                str(path),
                weight_name=self.settings.dero_lora_weight_name or None,
                adapter_name=ADAPTER_NAME,
            )
            pipe.set_adapters([ADAPTER_NAME], adapter_weights=[self.settings.dero_lora_scale])
        except Exception as exc:
            # 조용한 fallback 금지. 기동 자체를 실패시킨다.
            raise WorkerError(
                ErrorCode.LORA_LOAD_FAILED, f"Failed to load DERO LoRA from {path}: {exc}", cause=exc
            ) from exc

        self.loaded = True
        self.scale = self.settings.dero_lora_scale

        if self.settings.fuse_dero_lora:
            pipe.fuse_lora(lora_scale=self.settings.dero_lora_scale)
            log.warning("DERO LoRA fused; set_scale() and unload() are no longer possible.")

        log.info("DERO LoRA loaded from %s (scale=%s)", path, self.scale)

    def set_scale(self, pipe, scale: float) -> None:
        if not self.loaded:
            raise WorkerError(ErrorCode.LORA_LOAD_FAILED, "No LoRA adapter is loaded.")
        if self.settings.fuse_dero_lora:
            raise WorkerError(
                ErrorCode.LORA_LOAD_FAILED, "LoRA is fused; scale cannot be changed at runtime."
            )
        pipe.set_adapters([ADAPTER_NAME], adapter_weights=[scale])
        self.scale = scale

    def unload(self, pipe) -> None:
        if not self.loaded:
            return
        if self.settings.fuse_dero_lora:
            raise WorkerError(ErrorCode.LORA_LOAD_FAILED, "LoRA is fused and cannot be unloaded.")
        pipe.unload_lora_weights()
        self.loaded = False
        self.scale = None

    def describe(self) -> dict:
        return {
            "enabled": self.settings.enable_dero_lora,
            "loaded": self.loaded,
            "scale": self.scale,
            "fused": self.settings.fuse_dero_lora and self.loaded,
            "path": self.settings.dero_lora_path or None,
        }
