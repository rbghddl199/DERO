"""시간·메모리 계측 (설계서 §16).

peak VRAM 은 두 가지를 따로 기록한다.
- torchPeakVramMb : torch 가 할당한 양. 재현 가능하고 코드 변경에 민감하다.
- nvidiaSmiVramMb : 프로세스 전체가 GPU 에서 잡고 있는 양. CUDA 컨텍스트와 단편화까지 포함한다.
model_cpu_offload 를 쓰면 두 값의 차이가 커서 하나만 보면 8GB 여유를 잘못 판단한다.
"""

from __future__ import annotations

import subprocess
import threading
import time
from dataclasses import dataclass, field

import psutil

try:  # torch 는 무거우므로 import 실패를 계측 레이어가 흡수한다.
    import torch
except Exception:  # pragma: no cover
    torch = None  # type: ignore[assignment]


def cuda_available() -> bool:
    return torch is not None and torch.cuda.is_available()


def reset_cuda_peak_memory() -> None:
    if cuda_available():
        torch.cuda.reset_peak_memory_stats()


def torch_peak_vram_mb() -> float:
    if not cuda_available():
        return 0.0
    return torch.cuda.max_memory_allocated() / 1024**2


def torch_peak_reserved_mb() -> float:
    """새 지시문 §16 이 함께 요구하는 값. allocated 보다 크고 실제 점유에 가깝다."""
    if not cuda_available():
        return 0.0
    return torch.cuda.max_memory_reserved() / 1024**2


def nvidia_smi_used_mb() -> float:
    """현재 프로세스가 아니라 GPU 전체 사용량. nvidia-smi 가 없으면 0."""
    try:
        out = subprocess.run(
            ["nvidia-smi", "--query-gpu=memory.used", "--format=csv,noheader,nounits"],
            capture_output=True,
            text=True,
            timeout=10,
            check=True,
        )
        return float(out.stdout.strip().splitlines()[0])
    except Exception:
        return 0.0


def process_rss_mb() -> float:
    return psutil.Process().memory_info().rss / 1024**2


def total_vram_mb() -> float:
    if not cuda_available():
        return 0.0
    return torch.cuda.get_device_properties(0).total_memory / 1024**2


def gpu_name() -> str:
    if not cuda_available():
        return "cpu"
    return torch.cuda.get_device_name(0)


@dataclass
class Stopwatch:
    """단계별 소요 시간(ms)과 절대 시각을 함께 남긴다."""

    marks: dict[str, float] = field(default_factory=dict)
    _started: float = field(default_factory=time.perf_counter)
    _last: float = field(default_factory=time.perf_counter)
    timings_ms: dict[str, int] = field(default_factory=dict)

    def mark(self, name: str) -> int:
        """지난 mark 이후 경과 시간을 name 으로 기록하고 ms 를 돌려준다."""
        now = time.perf_counter()
        elapsed_ms = int(round((now - self._last) * 1000))
        self.timings_ms[name] = elapsed_ms
        self.marks[name] = time.time()
        self._last = now
        return elapsed_ms

    def total_ms(self) -> int:
        total = int(round((time.perf_counter() - self._started) * 1000))
        self.timings_ms["total"] = total
        return total


class VramSampler:
    """추론 중 nvidia-smi 사용량을 주기적으로 찍어 최댓값을 남긴다.

    추론이 끝난 뒤에 한 번 재면 이미 메모리가 해제돼 있어 peak 이 아니라 잔여값이 잡힌다.
    실제 8GB 여유를 판단하려면 도는 동안의 최댓값이 필요하다.
    """

    def __init__(self, interval_s: float = 0.25):
        self.interval_s = interval_s
        self.peak_mb = 0.0
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def __enter__(self) -> VramSampler:
        if not cuda_available():
            return self
        self.peak_mb = nvidia_smi_used_mb()

        def loop() -> None:
            while not self._stop.wait(self.interval_s):
                self.peak_mb = max(self.peak_mb, nvidia_smi_used_mb())

        self._thread = threading.Thread(target=loop, name="vram-sampler", daemon=True)
        self._thread.start()
        return self

    def __exit__(self, *_exc) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=2)


@dataclass
class MemorySnapshot:
    peak_vram_mb: float
    peak_vram_reserved_mb: float
    peak_ram_mb: float
    nvidia_smi_vram_mb: float

    def to_payload(self) -> dict:
        return {
            "peakVramMb": round(self.peak_vram_mb, 1),
            "peakVramReservedMb": round(self.peak_vram_reserved_mb, 1),
            "peakRamMb": round(self.peak_ram_mb, 1),
            "nvidiaSmiVramMb": round(self.nvidia_smi_vram_mb, 1),
        }


def snapshot_memory(sampled_peak_mb: float | None = None) -> MemorySnapshot:
    """sampled_peak_mb 를 주면 그 값을 쓴다 (VramSampler 로 추론 중에 재둔 최댓값)."""
    return MemorySnapshot(
        peak_vram_mb=torch_peak_vram_mb(),
        peak_vram_reserved_mb=torch_peak_reserved_mb(),
        peak_ram_mb=process_rss_mb(),
        nvidia_smi_vram_mb=nvidia_smi_used_mb() if sampled_peak_mb is None else sampled_peak_mb,
    )
