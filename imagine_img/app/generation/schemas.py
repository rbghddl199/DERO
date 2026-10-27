"""요청/응답 스키마 (새 지시문 §4, §15)."""

from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.config import (
    ALL_ALLOWED_STRENGTHS,
    CONTROLNET_STRENGTHS,
    MAX_ALLOWED_STRENGTH,
    MOOD_ALIASES,
    STRENGTH_PRESETS,
)
from app.core.errors import ErrorCode, WorkerError

TimeOfDay = Literal["DAY", "NIGHT"]
CameraMode = Literal["PERSPECTIVE", "ORTHOGRAPHIC", "TOP", "FRONT"]
GenerationMode = Literal["REALISTIC"]

# Windows 예약 디바이스 이름. 디렉터리로 만들면 실패하거나 이상하게 동작한다.
_WINDOWS_RESERVED = {
    "CON", "PRN", "AUX", "NUL",
    *(f"COM{i}" for i in range(1, 10)),
    *(f"LPT{i}" for i in range(1, 10)),
}
_SAFE_JOB_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")


def validate_job_id(job_id: str) -> str:
    """jobId 는 출력 디렉터리 이름이 되므로 경로 조작과 예약어를 거부한다.

    새 지시문 §4 는 정수 jobId(184)를 쓰지만, 폴더 이름이 되는 성질은 그대로이므로
    문자열로 정규화한 뒤 같은 검사를 통과해야 한다.
    """
    if not _SAFE_JOB_ID.match(job_id):
        raise WorkerError(
            ErrorCode.INVALID_REQUEST,
            "jobId must match [A-Za-z0-9][A-Za-z0-9._-]{0,63} (no path separators).",
        )
    if job_id.split(".")[0].upper() in _WINDOWS_RESERVED:
        raise WorkerError(ErrorCode.INVALID_REQUEST, f"jobId '{job_id}' is a reserved Windows name.")
    return job_id


class ProductLight(BaseModel):
    """제품 조명 상태 (§4)."""

    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    product_id: int | str = Field(alias="productId")
    enabled: bool = False
    #: #RRGGBB. 프롬프트에는 색만 쓰이고 productId 는 노출되지 않는다.
    color: str | None = None

    @field_validator("color")
    @classmethod
    def _hex_color(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not re.fullmatch(r"#[0-9A-Fa-f]{6}", value):
            raise ValueError("color must be #RRGGBB")
        return value.upper()


class ProductCategory(BaseModel):
    """배치된 제품 한 건. 개별 상품이 아니라 **카테고리 코드**로 온다 (2026-08-02).

    배치된 것을 **전부** 보낸다. 무엇을 프롬프트에 넣고 무엇을 버릴지는 토큰 예산을
    아는 워커가 정하고, 버린 것은 응답 `warnings` 로 돌려준다. 백엔드가 미리
    골라 보내면, 그 뒤에서 예산 때문에 또 잘려도 백엔드가 그 사실을 모른다.
    """

    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    #: DB 카테고리 코드. 예: `MONITOR`, `DESK_LAMP`. 표는 app/generation/product_categories.py.
    code: str
    #: 이 카테고리에서 **가장 큰 개체**가 화면에서 차지하는 비율 (0~100).
    #: 시뮬레이터가 바운딩 박스를 카메라로 투영해서 계산한다.
    #: 0.3% 미만은 잠재공간에서 7x7 픽셀도 안 되어 이름을 줘도 못 그린다 — 워커가 뺀다.
    screen_area_percent: float = Field(default=0.0, alias="screenAreaPercent", ge=0.0, le=100.0)

    @field_validator("code")
    @classmethod
    def _normalize_code(cls, value: str) -> str:
        code = value.strip().upper()
        if not code:
            raise ValueError("productCategories[].code must not be empty")
        return code


class GenerationRequest(BaseModel):
    """multipart 의 request_json 부분, 또는 CLI 입력."""

    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    job_id: str = Field(alias="jobId")
    mode: GenerationMode = "REALISTIC"
    time_of_day: TimeOfDay = Field(default="DAY", alias="timeOfDay")
    room_light_on: bool = Field(default=True, alias="roomLightOn")
    product_lights: list[ProductLight] = Field(default_factory=list, alias="productLights")
    camera_mode: CameraMode = Field(default="PERSPECTIVE", alias="cameraMode")
    mood_tags: list[str] = Field(default_factory=list, alias="moodTags")

    #: 배치된 카테고리 전부. 서비스 경로가 쓰는 입구다 (2026-08-02).
    product_categories: list[ProductCategory] = Field(
        default_factory=list, alias="productCategories"
    )
    #: 완성된 영어 명사를 직접 넣는 구 경로. CLI 실험과 테스트가 쓴다.
    #: `productCategories` 가 있으면 무시된다 — 두 곳에서 제품을 정하면 어느 쪽이
    #: 이겼는지 응답만 보고 알 수 없다.
    product_summary: list[str] = Field(default_factory=list, alias="productSummary")

    #: 사용자가 고른 책상 재질 이름. **방 전체의 분위기를 정한다** (desk_moods.py).
    #:
    #: 2026-08-02 까지 이 값은 큐 메시지에 실려 워커까지 와서 그대로 버려졌다 —
    #: 그래서 화이트 책상이든 월넛이든 상상도의 벽·바닥·소품이 똑같이 나왔다.
    #: 운영 DB 의 `desk_texture.name` 은 한국어이고 로컬 시드는 영어다. 둘 다 받는다.
    desk_texture: str | None = Field(default=None, alias="deskTexture")

    #: 시뮬레이터 캡처. multipart 업로드를 쓰면 비워둔다 (§4).
    simulator_view_path: str | None = Field(default=None, alias="simulatorViewPath")
    #: 이 결과를 만든 입력 파일. 배치(`product_batch.py`)가 채운다.
    #:
    #: **jobId 만으로는 입력을 되짚을 수 없다.** 출력 폴더 이름은 jobId 인데, 파일 이름에
    #: 한글이나 공백이 있으면 jobId 가 `MONITOR-3` 같은 순번으로 떨어진다(경로 문자를 허용할
    #: 수 없어서다). 그러면 어느 사진에서 나온 결과인지 metadata 를 봐도 알 수 없다.
    #: 시뮬레이터 캡처가 아니라 **손으로 넣은 제품 사진**이므로 위 필드와 나눠 둔다.
    source_image_path: str | None = Field(default=None, alias="sourceImagePath")
    #: 참조 이미지 경로. `ENABLE_IP_ADAPTER=true` 면 **이 사진들이 조건으로 실린다**
    #: (2026-08-06, app/models/ip_adapter_manager.py). 꺼져 있으면 기록만 하고 경고한다.
    #:
    #: `INPUT_DIR` 하위만 허용한다 — HTTP 로 오는 값이라 제한이 없으면 임의 파일 읽기가
    #: 된다(`references._resolve_requested`). 비워 두면 워커가 `productCategories` 로
    #: `inputs/references/<카테고리>/` 에서 직접 고른다.
    product_reference_paths: list[str] = Field(default_factory=list, alias="productReferencePaths")

    #: strength 는 값(0.25/0.35/0.45) 또는 프리셋 이름으로 줄 수 있다. 둘 다 없으면 설정 기본값.
    strength: float | None = None
    strength_preset: Literal["PRESERVE", "BALANCED", "REALISTIC"] | None = Field(
        default=None, alias="strengthPreset"
    )
    seed: int | None = None
    enable_sharpen: bool | None = Field(default=None, alias="enableSharpen")

    @field_validator("job_id", mode="before")
    @classmethod
    def _job_id_to_str(cls, value) -> str:
        # 새 지시문 §4 는 정수 jobId 를 쓴다. 문자열로 정규화한다.
        if isinstance(value, bool):
            raise ValueError("jobId must be a string or an integer")
        if isinstance(value, int):
            return str(value)
        return value

    @field_validator("job_id")
    @classmethod
    def _job_id_safe(cls, value: str) -> str:
        # pydantic 은 ValueError 만 ValidationError 로 모아준다.
        try:
            return validate_job_id(value)
        except WorkerError as exc:
            raise ValueError(exc.message) from exc

    @field_validator("strength")
    @classmethod
    def _strength_allowed(cls, value: float | None) -> float | None:
        """허용 목록에 있는 값만 받는다.

        0.5 이상은 **ControlNet 이 켜진 경우에만** 유효하다. 그 판정은 설정을 알아야 하므로
        generator 가 한다 (§5 의 "0.5 이상은 기본 UI 에서 제공하지 않는다" 는 유지된다).
        """
        if value is None:
            return None
        if round(value, 4) not in [round(v, 4) for v in ALL_ALLOWED_STRENGTHS]:
            raise ValueError(
                f"strength must be one of {list(ALL_ALLOWED_STRENGTHS)}; got {value}. "
                f"Values above {MAX_ALLOWED_STRENGTH} require ENABLE_CONTROLNET=true."
            )
        return value

    @field_validator("mood_tags")
    @classmethod
    def _known_moods(cls, value: list[str]) -> list[str]:
        cleaned = []
        for raw in value:
            tag = raw.strip().upper()
            if not tag:
                continue
            if tag not in MOOD_ALIASES:
                raise ValueError(f"unknown moodTag '{raw}'. Allowed: {sorted(set(MOOD_ALIASES))}")
            cleaned.append(tag)
        return cleaned

    @field_validator("product_summary")
    @classmethod
    def _strip_items(cls, value: list[str]) -> list[str]:
        return [v.strip() for v in value if v and v.strip()]

    @model_validator(mode="after")
    def _one_strength_source(self):
        if self.strength is not None and self.strength_preset is not None:
            expected = STRENGTH_PRESETS[self.strength_preset]
            if round(expected, 4) != round(self.strength, 4):
                raise ValueError(
                    f"strength={self.strength} contradicts strengthPreset="
                    f"{self.strength_preset} ({expected}). Send only one of them."
                )
        return self

    # --- 해석 -------------------------------------------------------------

    def resolve_preset(self, settings) -> str:
        if self.strength_preset is not None:
            return self.strength_preset
        if self.strength is not None:
            target = round(self.strength, 4)
            for name, value in {**STRENGTH_PRESETS, **CONTROLNET_STRENGTHS}.items():
                if round(value, 4) == target:
                    return name
        return settings.default_strength_preset

    def resolve_strength(self, settings) -> float:
        if self.strength is not None:
            return self.strength
        return {**STRENGTH_PRESETS, **CONTROLNET_STRENGTHS}[self.resolve_preset(settings)]


class GenerationResponse(BaseModel):
    """새 지시문 §15 의 응답 형태."""

    model_config = ConfigDict(populate_by_name=True)

    job_id: str = Field(alias="jobId")
    status: Literal["COMPLETED"] = "COMPLETED"
    model_profile: str = Field(alias="modelProfile")
    checkpoint: str
    strength: float
    strength_preset: str = Field(alias="strengthPreset")
    seed: int
    steps: int
    effective_steps: int = Field(alias="effectiveSteps")
    guidance_scale: float = Field(alias="guidanceScale")
    generation_size: dict[str, int] = Field(alias="generationSize")
    output_size: dict[str, int] = Field(alias="outputSize")
    quantization_mode: str = Field(alias="quantizationMode")
    lora_enabled: bool = Field(alias="loraEnabled")
    negative_prompt_profile: str = Field(alias="negativePromptProfile")
    negative_prompt_effective: bool = Field(alias="negativePromptEffective")
    prompt: str
    negative_prompt: str = Field(alias="negativePrompt")
    #: 어느 레퍼런스 사진이 실렸는지 · 못 찾은 것과 사유. IP-Adapter 가 꺼져 있으면 None.
    #: 결과가 이상할 때 "무엇을 참조했나" 를 응답만 보고 알 수 있어야 한다.
    ip_adapter: dict | None = Field(default=None, alias="ipAdapter")
    timing: dict[str, int]
    peak_vram_mb: float = Field(alias="peakVramMb")
    peak_vram_reserved_mb: float = Field(alias="peakVramReservedMb")
    peak_nvidia_smi_vram_mb: float = Field(alias="peakNvidiaSmiVramMb")
    peak_ram_mb: float = Field(alias="peakRamMb")
    result_url: str = Field(alias="resultUrl")
    output_path: str = Field(alias="outputPath")
    webp_path: str | None = Field(default=None, alias="webpPath")
    metadata_path: str = Field(alias="metadataPath")
    warnings: list[str] = Field(default_factory=list)
