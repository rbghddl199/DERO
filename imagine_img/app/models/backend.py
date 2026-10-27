"""생성 백엔드 인터페이스 (새 지시문 §3).

```python
class ImageGenerationBackend:
    def load(self) -> None: ...
    def generate(self, request: GenerationRequest) -> GenerationResult: ...
```

모델을 바꿀 때 API·후처리 코드를 수정하지 않기 위한 경계다.
현재 구현체는 `SdxlImg2ImgBackend` 하나이고, 모델 프로필(profiles.py)이 그 안에서
steps / guidance_scale / scheduler / 네거티브 프롬프트 지원 여부를 갈라낸다.

다른 아키텍처(예: SD3, FLUX)를 붙일 때는 이 Protocol 을 구현한 클래스를 추가하고
`build_backend()` 에 분기를 넣는다. API·후처리·계측은 그대로 재사용된다.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from PIL import Image

from app.core.config import Settings
from app.core.logging import get_logger
from app.generation.schemas import GenerationRequest, GenerationResponse

log = get_logger(__name__)

#: §3 의 GenerationResult. 이 POC 에서는 응답 스키마가 곧 결과 객체다.
GenerationResult = GenerationResponse


@runtime_checkable
class ImageGenerationBackend(Protocol):
    name: str

    def load(self) -> None: ...

    def generate(self, request: GenerationRequest, image: Image.Image) -> GenerationResult: ...

    def describe(self) -> dict: ...


class SdxlImg2ImgBackend:
    """SDXL Img2Img 백엔드. Lightning full UNet 과 일반 SDXL 체크포인트를 모두 다룬다."""

    def __init__(self, service) -> None:
        # service: app.models.model_service.ModelService
        self._service = service

    @property
    def name(self) -> str:
        return f"sdxl_img2img[{self._service.settings.model_profile}]"

    @property
    def settings(self) -> Settings:
        return self._service.settings

    def load(self) -> None:
        self._service.load()

    def generate(self, request: GenerationRequest, image: Image.Image) -> GenerationResult:
        from app.generation.generator import generate

        return generate(request, image, self._service)

    def describe(self) -> dict:
        return {"backend": self.name, **self._service.describe()}


def build_backend(service) -> ImageGenerationBackend:
    """현재는 SDXL 계열 하나뿐이다. 프로필은 백엔드 안에서 갈린다."""
    return SdxlImg2ImgBackend(service)
