"""양자화·LoRA 안전 규칙 (설계서 §8.3, §9, §18.1)."""

from __future__ import annotations

import pytest

from app.core.errors import ConfigurationError, ErrorCode, WorkerError
from app.models.lora_manager import LoraManager
from app.models.quantization import NoQuantization, build_strategy


def test_default_is_no_quantization(settings):
    strategy = build_strategy(settings)
    assert isinstance(strategy, NoQuantization)
    assert strategy.describe()["applied"] is False


def test_unknown_quantization_mode_is_rejected(settings):
    broken = settings.model_copy(update={"quantization_mode": "int2_magic"})
    with pytest.raises(ConfigurationError):
        build_strategy(broken)


@pytest.mark.parametrize("mode", ["torchao_int8", "bnb_nf4"])
def test_experimental_modes_need_the_opt_in_flag(settings, mode):
    broken = settings.model_copy(update={"quantization_mode": mode})
    with pytest.raises(ConfigurationError):
        build_strategy(broken)


def test_nf4_on_full_unet_path_reports_not_supported(settings):
    """지원되지 않는 4bit 를 조용히 fp16 으로 돌리지 않는다."""
    opted_in = settings.model_copy(
        update={"quantization_mode": "bnb_nf4", "allow_experimental_quantization": True}
    )
    strategy = build_strategy(opted_in)
    with pytest.raises(WorkerError) as exc:
        strategy.validate_environment()
    assert exc.value.code is ErrorCode.QUANTIZATION_NOT_SUPPORTED
    assert strategy.describe()["applied"] is False


def test_torchao_without_the_package_fails_fast(settings):
    opted_in = settings.model_copy(
        update={"quantization_mode": "torchao_int8", "allow_experimental_quantization": True}
    )
    strategy = build_strategy(opted_in)
    try:
        import torchao  # noqa: F401
    except ImportError:
        with pytest.raises(WorkerError) as exc:
            strategy.validate_environment()
        assert exc.value.code is ErrorCode.QUANTIZATION_NOT_SUPPORTED
    else:  # pragma: no cover - 설치된 환경
        strategy.validate_environment()


# --- LoRA ----------------------------------------------------------------


class _FakePipe:
    def __init__(self):
        self.calls = []

    def load_lora_weights(self, *args, **kwargs):
        self.calls.append(("load", args, kwargs))

    def set_adapters(self, names, adapter_weights):
        self.calls.append(("set", names, adapter_weights))


def test_lora_disabled_by_default_does_nothing(settings):
    manager = LoraManager(settings)
    pipe = _FakePipe()
    manager.load_optional_adapter(pipe)
    assert pipe.calls == []
    assert manager.describe() == {
        "enabled": False,
        "loaded": False,
        "scale": None,
        "fused": False,
        "path": None,
    }


def test_enabled_without_path_fails(settings):
    manager = LoraManager(settings.model_copy(update={"enable_dero_lora": True}))
    with pytest.raises(WorkerError) as exc:
        manager.load_optional_adapter(_FakePipe())
    assert exc.value.code is ErrorCode.LORA_LOAD_FAILED


def test_missing_lora_file_fails(settings, tmp_path):
    manager = LoraManager(
        settings.model_copy(
            update={"enable_dero_lora": True, "dero_lora_path": str(tmp_path / "nope.safetensors")}
        )
    )
    with pytest.raises(WorkerError) as exc:
        manager.load_optional_adapter(_FakePipe())
    assert exc.value.code is ErrorCode.LORA_LOAD_FAILED
    assert "does not exist" in exc.value.message


def test_non_sdxl_lora_is_refused(settings, tmp_path):
    """다른 모델 계열 LoRA 를 조용히 로드하지 않는다."""
    import torch
    from safetensors.torch import save_file

    path = tmp_path / "sd15_style.safetensors"
    save_file(
        {"lora_unet_down_blocks_0_attentions_0.lora_down.weight": torch.zeros(4, 4)},
        str(path),
    )

    manager = LoraManager(
        settings.model_copy(update={"enable_dero_lora": True, "dero_lora_path": str(path)})
    )
    with pytest.raises(WorkerError) as exc:
        manager.load_optional_adapter(_FakePipe())
    assert exc.value.code is ErrorCode.LORA_LOAD_FAILED
    assert "SDXL" in exc.value.message


def test_sdxl_lora_is_loaded_with_configured_scale(settings, tmp_path):
    import torch
    from safetensors.torch import save_file

    path = tmp_path / "dero_style.safetensors"
    save_file({"lora_te2_text_encoder_2_layer.lora_down.weight": torch.zeros(4, 4)}, str(path))

    manager = LoraManager(
        settings.model_copy(
            update={"enable_dero_lora": True, "dero_lora_path": str(path), "dero_lora_scale": 0.4}
        )
    )
    pipe = _FakePipe()
    manager.load_optional_adapter(pipe)

    assert manager.loaded is True
    assert manager.scale == 0.4
    assert pipe.calls[-1] == ("set", ["dero_style"], [0.4])
    assert manager.describe()["fused"] is False  # FUSE 기본값은 false
