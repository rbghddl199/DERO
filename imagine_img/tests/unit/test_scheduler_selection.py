"""프로필별 scheduler 선택 (새 지시문 §3).

가중치는 필요 없다 — scheduler config 만으로 만들 수 있다.
"""

from __future__ import annotations

import pytest
from diffusers import DPMSolverMultistepScheduler, EulerDiscreteScheduler

from app.core.errors import WorkerError
from app.models.lightning_loader import make_scheduler

# SDXL 계열이 공통으로 쓰는 최소 config.
BASE_CONFIG = {
    "num_train_timesteps": 1000,
    "beta_start": 0.00085,
    "beta_end": 0.012,
    "beta_schedule": "scaled_linear",
    "prediction_type": "epsilon",
    "steps_offset": 1,
}


def test_none_keeps_the_checkpoint_scheduler():
    assert make_scheduler(BASE_CONFIG, None) is None


def test_euler_trailing_for_lightning():
    scheduler = make_scheduler(BASE_CONFIG, "euler_trailing")
    assert isinstance(scheduler, EulerDiscreteScheduler)
    assert scheduler.config.timestep_spacing == "trailing"


def test_dpmpp_2m_karras_for_photoreal():
    """RealVisXL 모델 카드가 권장하는 sampler."""
    scheduler = make_scheduler(BASE_CONFIG, "dpmpp_2m_karras")
    assert isinstance(scheduler, DPMSolverMultistepScheduler)
    assert scheduler.config.use_karras_sigmas is True
    assert scheduler.config.algorithm_type == "dpmsolver++"


def test_dpmpp_sde_karras():
    scheduler = make_scheduler(BASE_CONFIG, "dpmpp_sde_karras")
    assert isinstance(scheduler, DPMSolverMultistepScheduler)
    assert scheduler.config.algorithm_type == "sde-dpmsolver++"


def test_unknown_scheduler_is_rejected():
    with pytest.raises(WorkerError):
        make_scheduler(BASE_CONFIG, "magic_sampler_9000")
