"""Redis 큐 메시지. 백엔드(WAS)와의 계약이다.

정본은 백엔드의 `infra/LocalWorkerImageGeneration.java` 다. **ADR-0015 결정 5 의 payload 가
아니다** — 코드가 그 ADR 보다 앞서 있다.

```text
image:generate:requests       LPUSH  { correlationId, screenshotUrl, uploadTargets[],
                                       deskTexture, deskFrame, productNames[], count }
image:generate:results:{id}   RPUSH  { status: OK|FAILED, keys[] | errorMessage }
```

## ADR-0015 와 달라진 것 세 가지

**presigned URL 이 메시지에 실린다.** ADR 은 "presign 은 TTL 이 있고 큐 대기 시간은 상한이
없어서 워커가 늦게 집으면 만료된 URL 을 받는다"며 URL 을 안 실었다. 지금 구조는 그 걱정이
없다 — 이 메시지는 **큐에서 꺼낸 뒤** `ImageGenerationPort` 안에서 만들어지므로 발급 시점과
쓰는 시점이 같다.

**응답 리스트가 요청마다 다르다.** `results:{correlationId}` 다. 공용 리스트 하나면 요청이
겹칠 때 남의 결과를 집는다.

**key 를 워커가 정하지 않는다.** 백엔드가 `generated-images/{uuid}.png` 를 만들어 주고,
돌려줄 때도 **그대로** 돌려줘야 한다. 다른 key 를 주면 그 객체는 아무도 안 지우는 고아가
되고 DB 에는 없는 파일을 가리키는 행이 남는다 — 백엔드가 검사한다.

## 이 메시지에 없는 것

`timeOfDay` · `roomLightOn` · 카테고리 코드가 없다. `ImageGenerationRequest` 가 지금
`deskTexture` · `deskFrame` · `productNames`(제품 **이름**) 만 담기 때문이다.
`generated_image.time_of_day` 는 백엔드가 `DAY` 로 고정해 쓴다("시간대별 생성은 아직 없어
DAY 고정이다" — GeneratedImageService).

조명 상태가 왜 필요한지는 이 저장소에서 실측했다 — 밝은 캡처에 "nighttime" 을 넣어도 출력
밝기가 193.6 → 186.4 로 거의 그대로였다. 프롬프트는 조명을 만들지 못한다. 그 필드를 넣으려면
`ImageGenerationRequest` 부터 늘려야 한다(별건이라 여기서 하지 않았다).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class UploadTarget(BaseModel):
    """결과 1장을 올릴 자리. key 와 presigned PUT URL 둘 다 백엔드가 정한다."""

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    key: str
    url: str


class WorkerRequest(BaseModel):
    """`image:generate:requests` 에서 꺼낸 작업 하나."""

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    correlation_id: str = Field(alias="correlationId")
    #: 스크린샷 presigned GET 들. **지금은 1개다** — `placement.thumbnail_key` 컬럼이 하나뿐이라서다.
    #: 각도별 렌더가 들어오면 count 와 같아진다. 그때 워커는 코드를 안 고쳐도 된다.
    screenshot_urls: list[str] = Field(alias="screenshotUrls")
    upload_targets: list[UploadTarget] = Field(alias="uploadTargets")
    #: 상판 재질 이름. 책상이 없는 배치면 None.
    desk_texture: str | None = Field(default=None, alias="deskTexture")
    #: 프레임 구조(FrameType.name()). 책상이 없는 배치면 None.
    desk_frame: str | None = Field(default=None, alias="deskFrame")
    #: 책상에 올라간 제품 **이름**들(카테고리 코드가 아니다).
    product_names: list[str] = Field(default_factory=list, alias="productNames")
    #: 배치된 제품의 **카테고리 이름**들 (DERO 카테고리 트리의 중간 계층: `"모니터암"`·`"의자"`).
    #:
    #: 이름보다 이것이 확실하다 — 사람이 정한 유한한 집합이라 표로 옮길 수 있다
    #: (`app/generation/dero_categories.py`). 이름은 자유 문자열이라 추측이 섞인다.
    #:
    #: **아직 백엔드가 보내지 않는다.** 기본값이 빈 목록이라 없어도 돌아간다 — 필드 추가는
    #: 양쪽이 동시에 배포될 수 없으므로 받는 쪽이 먼저 준비돼 있어야 한다.
    #: 백엔드에서 채울 곳: `infra/ImageGenerationRequest.java` +
    #: `infra/LocalWorkerImageGeneration.WorkerRequest` + `image/service/GeneratedImageService`
    #: (placed_item → product → category.name 조인. 새 관계가 필요 없다).
    product_categories: list[str] = Field(default_factory=list, alias="productCategories")
    #: 방 조명 상태. **조명을 만드는 값이 아니다** — 캡처에 이미 구워져 있고, 이 값은 재질
    #: 표현을 그쪽으로 미는 용도다(실측: 밝은 캡처에 NIGHT 프롬프트를 줘도 193.6 → 186.4).
    room_light_on: bool = Field(default=True, alias="roomLightOn")
    #: DAY | NIGHT. 백엔드가 generated_image 행에 쓰는 값과 같다.
    time_of_day: str = Field(default="DAY", alias="timeOfDay")
    count: int

    @property
    def result_key(self) -> str:
        return f"image:generate:results:{self.correlation_id}"

    def screenshot_for(self, index: int) -> str:
        """N번째 결과에 쓸 캡처.

        캡처가 결과 장수보다 적으면(지금이 그렇다 — 1장으로 3장을 만든다) 첫 장을 돌려 쓴다.
        그 경우 **각도가 다른 3장이 아니라 seed 만 다른 3장**이 된다 — runner 가 경고를 남긴다.
        """
        return self.screenshot_urls[index % len(self.screenshot_urls)]

    @property
    def angles_are_real(self) -> bool:
        """캡처가 결과 장수만큼 왔는가. 아니면 각도가 아니라 seed 로만 갈린다."""
        return len(self.screenshot_urls) >= self.count


class WorkerResult(BaseModel):
    """`image:generate:results:{id}` 에 넣는 값.

    **부분 성공을 OK 로 보내지 않는다.** `generated_image` 3행이 한 트랜잭션이고 일일 생성
    한도의 근거라, 2장만 올라가면 한도만 깎이고 피드에는 안 뜬다. 그 테이블은 삭제 금지라
    사후 정리로 풀 수도 없다.
    """

    model_config = ConfigDict(populate_by_name=True)

    status: Literal["OK", "FAILED"]
    keys: list[str] = Field(default_factory=list)
    error_message: str | None = Field(default=None, alias="errorMessage")
