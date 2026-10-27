"""오류 코드와 예외. 설계서 §11.3 의 코드 집합을 그대로 쓴다."""

from __future__ import annotations

from enum import StrEnum


class ErrorCode(StrEnum):
    INVALID_IMAGE = "INVALID_IMAGE"
    INVALID_REQUEST = "INVALID_REQUEST"
    MODEL_NOT_READY = "MODEL_NOT_READY"
    MODEL_LOAD_FAILED = "MODEL_LOAD_FAILED"
    LORA_LOAD_FAILED = "LORA_LOAD_FAILED"
    IP_ADAPTER_LOAD_FAILED = "IP_ADAPTER_LOAD_FAILED"
    QUANTIZATION_NOT_SUPPORTED = "QUANTIZATION_NOT_SUPPORTED"
    CUDA_OUT_OF_MEMORY = "CUDA_OUT_OF_MEMORY"
    INFERENCE_FAILED = "INFERENCE_FAILED"
    POSTPROCESS_FAILED = "POSTPROCESS_FAILED"
    OUTPUT_WRITE_FAILED = "OUTPUT_WRITE_FAILED"
    JOB_ALREADY_RUNNING = "JOB_ALREADY_RUNNING"
    CONFIGURATION_ERROR = "CONFIGURATION_ERROR"


#: HTTP 상태 매핑. 재시도 가능 여부는 아래 RETRYABLE 로 따로 표현한다.
HTTP_STATUS: dict[ErrorCode, int] = {
    ErrorCode.INVALID_IMAGE: 400,
    ErrorCode.INVALID_REQUEST: 400,
    ErrorCode.MODEL_NOT_READY: 503,
    ErrorCode.MODEL_LOAD_FAILED: 500,
    ErrorCode.LORA_LOAD_FAILED: 500,
    ErrorCode.IP_ADAPTER_LOAD_FAILED: 500,
    ErrorCode.QUANTIZATION_NOT_SUPPORTED: 500,
    ErrorCode.CUDA_OUT_OF_MEMORY: 507,
    ErrorCode.INFERENCE_FAILED: 500,
    ErrorCode.POSTPROCESS_FAILED: 500,
    ErrorCode.OUTPUT_WRITE_FAILED: 500,
    ErrorCode.JOB_ALREADY_RUNNING: 409,
    ErrorCode.CONFIGURATION_ERROR: 500,
}

RETRYABLE: frozenset[ErrorCode] = frozenset(
    {
        ErrorCode.MODEL_NOT_READY,
        ErrorCode.CUDA_OUT_OF_MEMORY,
        ErrorCode.JOB_ALREADY_RUNNING,
    }
)


class WorkerError(Exception):
    """식별 가능한 오류 코드를 가진 Worker 예외."""

    def __init__(
        self,
        code: ErrorCode,
        message: str,
        *,
        cause: BaseException | None = None,
        hint: str | None = None,
    ):
        super().__init__(message)
        self.code = code
        self.message = message
        #: 무엇을 하면 되는지. 메시지는 "무엇이 잘못됐나"이고 힌트는 "어떻게 고치나"다.
        #: 워커가 로그로만 남기는 오류가 많아서, 조치 방법을 붙여두면 다음 사람이 덜 헤맨다.
        self.hint = hint
        self.__cause__ = cause

    def __str__(self) -> str:
        return f"{self.message} — {self.hint}" if self.hint else self.message

    @property
    def http_status(self) -> int:
        return HTTP_STATUS.get(self.code, 500)

    @property
    def retryable(self) -> bool:
        return self.code in RETRYABLE

    def to_payload(self, job_id: str | None) -> dict:
        payload = {
            "jobId": job_id,
            "status": "FAILED",
            "errorCode": str(self.code),
            "message": self.message,
            "retryable": self.retryable,
        }
        if self.hint:
            payload["hint"] = self.hint
        return payload


class ConfigurationError(WorkerError):
    def __init__(self, message: str):
        super().__init__(ErrorCode.CONFIGURATION_ERROR, message)
