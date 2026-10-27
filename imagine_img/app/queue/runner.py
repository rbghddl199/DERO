"""작업 하나를 처리한다 — 스크린샷 내려받기 → N장 생성 → presigned PUT 업로드.

## 전부 아니면 전무다

`generated_image` 는 **3행이 한 트랜잭션**이고 일일 생성 한도의 근거이며 **삭제 금지**다.
2장만 올라가면 한도만 깎이고 피드에는 안 뜨는데, 사후 정리로 풀 수 없다. 그래서 여기서는
**생성을 전부 끝낸 뒤에 업로드를 몰아서** 한다. 중간에 깨지면 아무것도 올리지 않는다.

## 캡처가 한 장인데 결과가 세 장이다

`ImageGenerationRequest` 가 스크린샷 하나만 준다. **각도가 다른 3장은 만들 수 없다** —
img2img 는 입력에 있는 것만 다시 칠하고, 카메라를 옮기면 안 보이던 면이 필요한데 그 정보가
사진에 없다. 억지로 시키면 모델이 지어낸다(실측: 없던 스탠드 조명이 생기고 화분이 늘었다).

그래서 **seed 만 바꿔 3장을 만든다.** 같은 각도의 미묘하게 다른 3장이다. ERD 는 "각도가
다른 3장"이라고 적혀 있으므로 이건 **약속을 다 못 지킨 상태**이고, 응답 경고로 남긴다.
제대로 하려면 시뮬레이터가 각도별로 렌더해서 스크린샷을 N장 보내야 한다.
"""

from __future__ import annotations

import re
import shutil
import time
from io import BytesIO
from pathlib import Path

import httpx
from PIL import Image

from app.core.config import Settings
from app.core.errors import ErrorCode, WorkerError
from app.core.logging import get_logger
from app.queue.schemas import UploadTarget, WorkerRequest, WorkerResult

log = get_logger(__name__)

CONTENT_TYPE = "image/png"


def download(url: str, settings: Settings) -> Image.Image:
    try:
        response = httpx.get(url, timeout=settings.download_timeout_seconds, follow_redirects=True)
    except httpx.HTTPError as exc:
        raise WorkerError(ErrorCode.INVALID_IMAGE, f"스크린샷을 받지 못했다: {exc}") from exc
    if response.status_code >= 400:
        raise WorkerError(
            ErrorCode.INVALID_IMAGE,
            f"스크린샷 GET {response.status_code}",
            hint="presigned GET 은 15분이다. 워커가 오래 멈춰 있었다면 만료됐을 수 있다.",
        )
    image = Image.open(BytesIO(response.content))
    image.load()
    return image


def upload(target: UploadTarget, path: Path, settings: Settings) -> str:
    """presigned PUT 으로 올리고 **백엔드가 준 key 를 그대로** 돌려준다.

    다른 key 를 돌려주면 백엔드가 거부한다 — 그 객체는 아무도 안 지우는 고아가 되고
    DB 에는 없는 파일을 가리키는 행이 남기 때문이다.
    """
    with Image.open(path) as image:
        buffer = BytesIO()
        image.convert("RGB").save(buffer, format="PNG")
        body = buffer.getvalue()

    try:
        response = httpx.put(
            target.url,
            content=body,
            headers={"Content-Type": CONTENT_TYPE},
            timeout=settings.upload_timeout_seconds,
        )
    except httpx.HTTPError as exc:
        raise WorkerError(ErrorCode.OUTPUT_WRITE_FAILED, f"업로드 실패: {exc}") from exc
    if response.status_code >= 400:
        raise WorkerError(
            ErrorCode.OUTPUT_WRITE_FAILED,
            f"presigned PUT {response.status_code} for key {target.key}",
        )
    return target.key


def _to_request(job: WorkerRequest, index: int, settings: Settings) -> dict:
    """큐 메시지를 생성 요청으로 옮긴다.

    seed 를 장마다 바꾼다 — 캡처가 한 장뿐일 때 같은 seed 를 쓰면 3장이 픽셀 단위로 같아져
    대표 1장을 고르는 의미가 사라진다.
    """
    return {
        # **전체 correlationId 를 쓴다.** 앞 8자만 쓰면 출력 폴더가 충돌한다 —
        # 실측(2026-08-05): 스모크 세 번이 모두 `smoke-17-1` 로 떨어져 **metadata.json 이
        # 덮였고**, 방금 만든 이미지가 어떤 프롬프트로 나왔는지 확인할 수 없었다.
        # 운영은 UUID 라 확률이 낮지만 0 이 아니고, 그때 잃는 것이 "왜 저렇게 나왔나" 의
        # 유일한 기록이다. `validate_job_id` 가 64자까지 받으므로 UUID 가 그대로 들어간다.
        "jobId": f"{job.correlation_id}-{index + 1}",
        # 조명 상태는 백엔드가 준 값을 그대로 쓴다. 이 값이 조명을 만들지는 못하고
        # (캡처에 구워져 있어야 한다) 재질 표현을 그쪽으로 미는 역할이다.
        "timeOfDay": job.time_of_day,
        "roomLightOn": job.room_light_on,
        # **카테고리를 이름보다 앞에 둔다.** 예산에 걸려 잘릴 때 덜 확실한 쪽(이름)이
        # 먼저 잘려야 한다 — 카테고리는 사람이 정한 유한한 집합이고 표로 옮겨진다
        # (`dero_categories.py`), 이름은 자유 문자열이라 낱말 추측이 섞인다.
        # 중복은 여기서 한 번 줄인다 — `localize_products` 도 줄이지만, 그 전에 예산
        # 계산이 같은 물건을 두 번 먹지 않게 한다.
        "productSummary": list(dict.fromkeys([*job.product_categories, *job.product_names])),
        # 사용자가 고른 책상 재질. **방 전체의 분위기를 정한다**(desk_moods.py) —
        # 2026-08-02 까지 여기서 넘기지 않아 화이트 책상이든 월넛이든 같은 방이 나왔다.
        "deskTexture": job.desk_texture,
        "seed": settings.default_seed + index,
    }


#: 로컬 전용 결과가 쌓이는 하위 폴더. 평소 출력(`outputs/<jobId>/`)과 섞이지 않게 나눈다.
LOCAL_ONLY_SUBDIR = "queue-local"

#: 이 요청 키에서는 로컬 전용 모드로 돌지 않는다 — 운영/공용 요청 큐다.
_SHARED_REQUEST_KEY = "image:generate:requests"


def assert_local_only_is_isolated(settings: Settings) -> None:
    """로컬 전용 모드가 **공용 요청 큐를 소비하지 않도록** 막는다.

    이 모드는 결과를 아무 데도 올리지 않는다. 그런 워커가 실제 사용자 요청을 집어가면
    백엔드는 5분 타임아웃으로 실패한다 — 아무 에러 없이 조용한 서비스 장애가 된다.
    그래서 전용 키를 쓰게 강제한다.
    """
    if not settings.local_only_results:
        return None
    if settings.redis_request_key == _SHARED_REQUEST_KEY:
        raise WorkerError(
            ErrorCode.INVALID_REQUEST,
            "LOCAL_ONLY_RESULTS=true 는 공용 요청 큐에서 돌 수 없다 — 실제 사용자 요청을 "
            "집어가고 응답을 주지 않아 그 요청이 타임아웃으로 실패한다. "
            f"REDIS_REQUEST_KEY 를 따로 지정해라 (예: {_SHARED_REQUEST_KEY}:local-test).",
        )
    return None


def local_only_dir(settings: Settings, correlation_id: str) -> Path:
    """로컬 전용 결과를 담을 폴더. `correlationId` 는 **큐에서 온 값이라 검사한다.**

    경로 구분자나 `..` 가 들어오면 출력 디렉터리 밖에 쓰게 된다.
    """
    if not correlation_id or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}", correlation_id):
        raise WorkerError(
            ErrorCode.INVALID_REQUEST,
            f"correlationId {correlation_id!r} 을 폴더 이름으로 쓸 수 없다.",
        )
    return settings.output_dir / LOCAL_ONLY_SUBDIR / correlation_id


def _keep_locally(job: WorkerRequest, produced: list[Path], settings: Settings) -> list[str]:
    """업로드 대신 로컬에 복사하고 **백엔드가 준 key 를 그대로** 돌려준다.

    key 를 바꾸지 않는 이유는 평소 계약과 같다 — 다른 key 를 주면 검증에서 떨어진다.
    """
    target = local_only_dir(settings, job.correlation_id)
    target.mkdir(parents=True, exist_ok=True)
    keys = []
    for upload_target, path in zip(job.upload_targets, produced):
        # key 의 파일 이름만 쓴다. key 에 슬래시가 있어 그대로 쓰면 하위 폴더가 생긴다.
        destination = target / Path(upload_target.key).name
        shutil.copyfile(path, destination)
        keys.append(upload_target.key)
    log.warning(
        "[%s] LOCAL_ONLY_RESULTS — 업로드를 건너뛰고 %s 에 남겼다. "
        "이 key 들의 파일은 스토리지에 없다.",
        job.correlation_id[:8], target,
    )
    return keys


def run_job(job: WorkerRequest, service) -> WorkerResult:
    """작업 하나를 끝까지 처리한다. 예외를 밖으로 내지 않고 FAILED 로 돌려준다."""
    settings: Settings = service.settings
    started = time.perf_counter()

    try:
        if len(job.upload_targets) != job.count:
            raise WorkerError(
                ErrorCode.INVALID_REQUEST,
                f"count={job.count} 인데 업로드 자리는 {len(job.upload_targets)}개다.",
            )

        from app.generation.generator import generate
        from app.generation.schemas import GenerationRequest

        if not job.angles_are_real:
            # ERD 는 "각도가 다른 3장"을 요구하는데 캡처가 1장이라 그 약속을 다 못 지킨다.
            # 조용히 넘어가면 "각도가 왜 다 같냐"가 나중에 돌아온다.
            log.warning(
                "[%s] 캡처가 %d장인데 결과는 %d장이다 — 각도가 아니라 seed 로만 갈린다. "
                "각도별 3장은 시뮬레이터가 렌더해서 보내야 한다(ERD 개정 사항).",
                job.correlation_id[:8], len(job.screenshot_urls), job.count,
            )

        # 같은 URL 을 여러 번 받지 않는다 — 캡처가 1장이면 한 번만 내려받아 돌려 쓴다.
        captured: dict[str, Image.Image] = {}
        produced: list[Path] = []
        for index in range(job.count):
            url = job.screenshot_for(index)
            if url not in captured:
                captured[url] = download(url, settings)
            request = GenerationRequest.model_validate(_to_request(job, index, settings))
            response = generate(request, captured[url], service)
            produced.append(Path(response.output_path))
            log.info(
                "[%s] %d/%d generated in %d ms",
                job.correlation_id[:8], index + 1, job.count,
                response.timing.get("totalMs", 0),
            )

        # 여기까지 와야 업로드를 시작한다 — 부분 업로드를 만들지 않기 위해서다.
        if settings.local_only_results:
            keys = _keep_locally(job, produced, settings)
        else:
            keys = [upload(t, p, settings) for t, p in zip(job.upload_targets, produced)]

        elapsed = round((time.perf_counter() - started) * 1000)
        log.info("[%s] OK — %d images in %d ms", job.correlation_id[:8], len(keys), elapsed)
        return WorkerResult(status="OK", keys=keys)

    except WorkerError as exc:
        log.error("[%s] FAILED: %s", job.correlation_id[:8], exc)
        return WorkerResult(status="FAILED", errorMessage=str(exc))
    except Exception as exc:  # noqa: BLE001
        log.exception("[%s] FAILED (unexpected)", job.correlation_id[:8])
        return WorkerResult(status="FAILED", errorMessage=f"{type(exc).__name__}: {exc}")
