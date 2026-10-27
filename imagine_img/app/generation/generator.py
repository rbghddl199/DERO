"""생성 처리 (새 지시문 §4·§5·§15·§16, 구 설계서 §13).

한 번에 하나의 작업만 처리한다. 파이프라인은 요청 사이에 상주하고 매 요청마다 재로드하지 않는다.
"""

from __future__ import annotations

import math
from pathlib import Path

import numpy as np
import torch
from PIL import Image

from app.core.config import Settings
from app.core.errors import ErrorCode, WorkerError
from app.core.logging import get_logger
from app.core.metrics import Stopwatch, VramSampler, reset_cuda_peak_memory, snapshot_memory
from app.generation import control_image, postprocessor, references, sizing, upscaler
from app.generation.image_preprocessor import prepare
from app.generation.long_prompt import encode_long_prompt
from app.generation.product_categories import MIN_SCREEN_AREA_PERCENT
from app.generation.prompt_builder import MAX_PRODUCT_WORDS, PromptBuilder
from app.generation.schemas import GenerationRequest, GenerationResponse
from app.models import ip_adapter_manager
from app.transport import output_store

log = get_logger(__name__)

CLIP_TOKEN_LIMIT = 77

#: 음영량을 재기 전에 줄이는 고정 크기. 3x3 창 지표가 해상도에 종속이라 척도를 고정하지
#: 않으면 설정(픽셀 예산)이 바뀔 때마다 같은 그림이 다른 값을 낸다.
#: 1152x648 은 옛 기본 생성 크기(1344x768)와 비슷한 척도라 그때 잡은 실측값들과 이어진다.
SHADING_REFERENCE_SIZE = (1152, 648)


def make_token_counter(pipe):
    """파이프라인의 실제 CLIP 토크나이저로 내용 토큰 수를 세는 함수.

    토크나이저가 없으면(fake pipeline) None 을 돌려주고, PromptBuilder 는 근사값을 쓴다.
    """
    tokenizer = getattr(pipe, "tokenizer", None)
    if tokenizer is None:
        return None

    def count(text: str) -> int:
        # BOS/EOS 2개를 빼고 내용 토큰만 센다.
        return max(len(tokenizer(text, truncation=False)["input_ids"]) - 2, 0)

    try:
        count("probe")
    except Exception:  # pragma: no cover - 토크나이저 구현 차이를 흡수한다
        return None
    return count


def resolve_steps(settings: Settings, strength: float) -> tuple[int, int]:
    """(요청 step, 실제 denoise step).

    diffusers 는 init_timestep = min(int(steps * strength), steps) 로 시작 지점을 정한다.
    steps=9, strength 0.25/0.35/0.45 -> 2/3/4 step 으로 갈라진다.
    steps=4 였다면 세 값 모두 1 step 이 되어 결과가 픽셀 단위로 동일해진다
    (DESIGN_GAP_REPORT P2-3 에서 실측으로 확인).
    """
    requested = settings.resolved_steps
    if settings.compensate_steps_for_strength and strength > 0:
        requested = max(requested, math.ceil(requested / strength))
    effective = min(int(requested * strength), requested)
    return requested, max(effective, 1)


def measure_shading(image: Image.Image) -> float:
    """입력의 음영량(3x3 국소 표준편차 평균).

    실사화가 걸리는지를 가르는 값이다. 모델은 입력에 있는 명암 단서를 **증폭**할 뿐
    없는 것을 만들지 않는다. 실측:

    같은 척도(3x3, prepare 후)로 잰 값만 비교해야 한다. 창 크기나 해상도가 다르면 값이 달라진다.

    ```text
    실제 3D 렌더        1.71  → 실사화 걸림
    합성 도형 DAY/ON     0.86  → 일러스트 그대로
    합성 도형 NIGHT/OFF  0.56  → 물체 소실
    ```
    """
    from numpy.lib.stride_tricks import sliding_window_view

    # **고정 크기로 줄여서 잰다.** 3x3 창은 해상도에 종속이라, 생성 크기가 바뀌면 같은
    # 그림도 다른 값이 나온다 — 2026-08-02 에 픽셀 예산을 1.18M → 2.36M 으로 올렸더니
    # 같은 픽스처가 임계값 아래로 떨어져 없던 경고가 붙었다. 척도를 설정에 묶어 두면
    # 임계값이 설정마다 달라져 비교가 불가능하다.
    reference = image.convert("L")
    if reference.size != SHADING_REFERENCE_SIZE:
        reference = reference.resize(SHADING_REFERENCE_SIZE, Image.LANCZOS)
    gray = np.asarray(reference, dtype=np.float32)
    if min(gray.shape) < 3:
        return 0.0
    return float(sliding_window_view(gray, (3, 3)).std(axis=(-1, -2)).mean())


def _assert_usable_output(image: Image.Image) -> None:
    """fp16 VAE 오버플로로 검은 이미지가 나오는 경우를 잡는다 (DESIGN_GAP_REPORT G-5)."""
    array = np.asarray(image.convert("RGB"), dtype=np.float32)
    if not np.isfinite(array).all():
        raise WorkerError(ErrorCode.INFERENCE_FAILED, "Generated image contains non-finite values.")
    if float(array.max()) <= 1.0:
        raise WorkerError(
            ErrorCode.INFERENCE_FAILED,
            "Generated image is fully black, which usually means the fp16 VAE overflowed. "
            "Check that vae.config.force_upcast is true and VAE tiling is enabled.",
        )


def generate(
    request: GenerationRequest,
    image: Image.Image,
    service,  # app.models.model_service.ModelService — 순환 import 를 피해 타입만 생략
) -> GenerationResponse:
    settings = service.settings
    if not service.ready:
        raise WorkerError(ErrorCode.MODEL_NOT_READY, "Model is not loaded yet.")

    # 동시 작업 1개. 대기하지 않고 즉시 거절한다.
    if not service.job_lock.acquire(blocking=False):
        raise WorkerError(ErrorCode.JOB_ALREADY_RUNNING, "Another generation job is already running.")

    warnings: list[str] = []
    watch = Stopwatch()
    try:
        reset_cuda_peak_memory()

        # 크기는 입력이 정한다 (SIZE_MODE=follow_input). 입력 크기를 먼저 붙잡아 둔다 —
        # prepare() 가 이미지를 생성 크기로 바꾸므로 그 뒤에는 원본 크기를 알 수 없다.
        input_size = image.size
        sizes = sizing.describe(input_size, settings)
        prepared = prepare(image, settings)
        generation_size = prepared.size
        final_size = sizing.compute_final_size(input_size, settings)
        watch.mark("preprocess")

        builder = PromptBuilder(settings, make_token_counter(service.pipe))
        built = builder.build(request)
        watch.mark("promptBuild")

        if built.prompt_file:
            # 조용히 넘기지 않는다. 이 경로에서는 조명 상태·무드·제품 목록이 프롬프트에
            # 반영되지 않으므로, 요청 필드를 채워 보낸 쪽이 "왜 안 먹었나" 를 묻게 된다.
            applied = ", ".join(built.prompt_file_categories) or "none"
            message = (
                f"prompt was read verbatim from {built.prompt_file} (category blocks applied: "
                f"{applied}); the desk-setup prompt rules (lighting state, mood tags, product "
                "list) did NOT run for this job."
            )
            log.warning(message)
            warnings.append(message)
        if built.prompt_file_unmatched:
            # 조용히 넘기면 폴더 이름 오타가 "카테고리 지시가 안 실린 이미지" 로만 나타난다.
            message = (
                f"no [when ...] block in {built.prompt_file} matches "
                f"{', '.join(built.prompt_file_unmatched)}; only the shared prompt was used. "
                "Check the category spelling, or add the block to the prompt file."
            )
            log.warning(message)
            warnings.append(message)

        # 왜 이유를 갈라 적는가: 청킹이 켜지면(기본) 예산이 사실상 없어 **버려지는 유일한
        # 이유가 중복 제거**다. 그런데도 "77-token CLIP limit" 이라고 적으면 워커 로그를
        # 읽는 사람이 프롬프트를 더 깎으려 들게 된다 — 고칠 곳이 아닌 데를 고치게 만든다.
        budget_enforced = not settings.enable_long_prompt
        reason = "to fit the 77-token CLIP limit" if budget_enforced else "as redundant"
        for sentence in built.dropped:
            message = f"prompt sentence dropped {reason}: {sentence!r}"
            log.warning(message)
            warnings.append(message)
        if built.negative_dropped:
            message = (
                f"{len(built.negative_dropped)} negative prompt terms dropped {reason}: "
                f"{', '.join(built.negative_dropped[:5])}"
                + (" ..." if len(built.negative_dropped) > 5 else "")
            )
            log.warning(message)
            warnings.append(message)

        # 제품 이름 관련 경고 세 종류. 백엔드가 이걸 로그에 남기면 "왜 저 물건이 이상하게
        # 나왔는지" 를 사후에 알 수 있다 — 목록에서 빠진 물건은 다른 카테고리가 된다.
        if built.products_dropped:
            cause = (
                "did not fit the 77-token CLIP limit"
                if budget_enforced
                else f"exceeded MAX_PRODUCT_WORDS ({MAX_PRODUCT_WORDS})"
            )
            message = (
                f"{len(built.products_dropped)} product names {cause} and may be rendered "
                f"as a different category: {', '.join(built.products_dropped)}"
            )
            log.warning(message)
            warnings.append(message)
        if built.products_too_small:
            message = (
                f"{len(built.products_too_small)} categories were excluded for occupying less "
                f"than {MIN_SCREEN_AREA_PERCENT}% of the frame (too few latent pixels to render): "
                f"{', '.join(built.products_too_small)}"
            )
            log.info(message)
            warnings.append(message)
        for code, word in built.products_unverified:
            message = (
                f"unverified prompt word {word!r} for category {code} — add it to "
                f"CATEGORY_WORDS; see docs/PRODUCT_CATEGORY_WORDS.md"
            )
            log.warning(message)
            warnings.append(message)

        if not settings.supports_negative_prompt and settings.negative_prompt_profile != "none":
            # 새 지시문 §10 은 네거티브 프롬프트를 요구하지만 §2 의 guidance_scale=0 과 양립하지 않는다.
            # 조용히 넘기지 않고 매 요청에 사실을 남긴다 (DESIGN_GAP_REPORT P2-4).
            message = (
                f"negative prompt profile '{settings.negative_prompt_profile}' has NO effect: "
                f"guidance_scale={settings.resolved_guidance_scale} disables classifier-free "
                f"guidance in model profile '{settings.model_profile}'."
            )
            log.warning(message)
            warnings.append(message)

        # 비율을 정확히 맞추다 보면 픽셀 예산을 크게 남기는 입력 비율이 있다(예: 16:9).
        # 그만큼 Lanczos 확대 배율이 커져 결과가 부드러워지므로 사실을 남긴다.
        upscale = final_size[1] / generation_size[1]
        if upscale > 1.6:
            message = (
                f"generation {generation_size[0]}x{generation_size[1]} is upscaled "
                f"{upscale:.2f}x to reach {final_size[0]}x{final_size[1]}; "
                "Lanczos does not add detail, so the result will look softer. "
                "Capture closer to the generation size, or raise GENERATION_PIXEL_BUDGET."
            )
            log.warning(message)
            warnings.append(message)

        # 캡처가 규격대로 렌더됐는지 확인한다. 툰 아웃라인이 켜져 있거나 IBL 이 꺼져 있으면
        # 음영이 부족해 실사화가 걸리지 않는다 — 조용히 일러스트가 나오는 대신 사실을 남긴다.
        # 거부하지 않는 이유: 렌더 설정은 프런트에 고정된 값이라, 위험한 건 나중의 회귀이고
        # 그건 경고로 잡힌다. 거부하면 사용자가 아무것도 못 받는다.
        shading = measure_shading(prepared)
        if shading < settings.min_shading_std:
            # 이 문구는 2026-08-02 에 고쳤다. 전에는 "툰 외곽선이 꺼졌는지 확인하라"고
            # 했는데 **외곽선을 끄면 이 값은 오히려 내려간다** — 검은 윤곽선이 국소 대비에
            # 기여하고 있었다(실측: ON 0.91~0.98 / OFF 0.74~0.79, 그런데 OFF 가 결과는 좋다).
            # 즉 이 지표로는 렌더 설정을 판정할 수 없고, 임계값 자체가 재산정 대상이다
            # (docs/FINDINGS_2026-08-02.md §1.3). 사실만 남기고 원인 추정은 뺀다.
            message = (
                f"capture has little shading (local std {shading:.2f} < "
                f"{settings.min_shading_std}). NOTE: this threshold was calibrated on "
                "synthetic shapes vs a GLB render and mis-judges outline-off simulator "
                "captures, which photorealize fine at 0.74-0.79 — do not treat this as "
                "proof the render settings are wrong (docs/FINDINGS_2026-08-02.md)."
            )
            log.warning(message)
            warnings.append(message)

        if request.product_reference_paths and not settings.enable_ip_adapter:
            message = (
                "productReferencePaths were recorded but NOT used: set ENABLE_IP_ADAPTER=true "
                "to condition on reference photos."
            )
            log.warning(message)
            warnings.append(message)

        preset = request.resolve_preset(settings)
        strength = request.resolve_strength(settings)

        # §5 의 "0.5 이상은 기본 UI 에서 제공하지 않는다" 는 ControlNet 이 꺼진 경우에 적용된다.
        # ControlNet 이 구조를 고정할 때만 상한이 올라간다.
        if strength > settings.max_strength + 1e-9:
            raise WorkerError(
                ErrorCode.INVALID_REQUEST,
                f"strength {strength} exceeds the limit {settings.max_strength} for this mode. "
                + (
                    "Raise CONTROLNET_MAX_STRENGTH."
                    if settings.enable_controlnet
                    else "Values above 0.45 need ENABLE_CONTROLNET=true, because without a "
                    "structure condition the products get replaced."
                ),
            )

        requested_steps, effective_steps = resolve_steps(settings, strength)
        seed = settings.default_seed if request.seed is None else request.seed
        generator = torch.Generator(device=settings.generator_device).manual_seed(seed)

        call_kwargs = {
            "image": prepared,
            "strength": strength,
            "num_inference_steps": requested_steps,
            "guidance_scale": settings.resolved_guidance_scale,
            "num_images_per_prompt": 1,
            "generator": generator,
        }
        if settings.enable_long_prompt:
            # 청킹 임베딩을 직접 만들어 넘긴다 — `prompt` 로 넘기면 diffusers 가 창 하나로
            # 조용히 자른다(경고도 없다). 여기서만 프롬프트 길이 제약이 사라진다.
            call_kwargs.update(
                encode_long_prompt(
                    service.pipe, built.prompt, built.negative_prompt
                ).as_call_kwargs()
            )
        else:
            call_kwargs["prompt"] = built.prompt
            if built.negative_prompt:
                call_kwargs["negative_prompt"] = built.negative_prompt

        # --- IP-Adapter: 레퍼런스 사진을 조건으로 건다 ---------------------------
        #
        # 어댑터가 붙어 있으면 UNet 이 `image_embeds` 를 **요구한다.** 그래서 레퍼런스를
        # 못 찾아도 빈손으로 부를 수 없다 — 그때는 scale 0 + 중립 임베딩으로 "없는 것과
        # 같게" 만들고 그대로 진행한다. 레퍼런스가 없다고 생성을 실패시키지 않는다.
        ip_info: dict | None = None
        if ip_adapter_manager.is_loaded(service.pipe):
            do_cfg = settings.supports_negative_prompt
            pick = references.select(request, settings, seed)
            if pick.references:
                images = [Image.open(item.path).convert("RGB") for item in pick.references]
                ip_adapter_manager.set_scale(service.pipe, settings.ip_adapter_scale)
                call_kwargs["ip_adapter_image_embeds"] = ip_adapter_manager.encode(
                    service.pipe, images, do_cfg
                )
                for image in images:
                    image.close()
            else:
                ip_adapter_manager.set_scale(service.pipe, 0.0)
                call_kwargs["ip_adapter_image_embeds"] = ip_adapter_manager.neutral_embeds(
                    service.pipe, do_cfg
                )
            ip_info = {
                "scale": ip_adapter_manager.current_scale(service.pipe),
                "references": [item.describe() for item in pick.references],
                "missing": [{"name": name, "reason": reason} for name, reason in pick.missing],
                "droppedOverLimit": list(pick.dropped),
            }
            log.info("IP-Adapter references: %s", ip_info)

            # 조용히 넘기지 않는다. 목록에서 빠진 제품은 **레퍼런스 없이** 그려지므로
            # "왜 저 제품만 딴판인가" 의 답이 여기 있어야 한다.
            for name, reason in pick.missing:
                message = f"no reference photo for {name!r}: {reason}"
                log.info(message)
                warnings.append(message)
            if pick.dropped:
                message = (
                    f"{len(pick.dropped)} reference(s) dropped over IP_ADAPTER_MAX_REFERENCES "
                    f"({settings.ip_adapter_max_references}): {', '.join(pick.dropped)}"
                )
                log.info(message)
                warnings.append(message)

        control_info: dict | None = None
        if settings.enable_controlnet:
            control = control_image.build_control_image(prepared, settings)
            call_kwargs["control_image"] = control
            call_kwargs["controlnet_conditioning_scale"] = settings.controlnet_conditioning_scale
            control_info = {
                "type": settings.controlnet_type,
                "conditioningScale": settings.controlnet_conditioning_scale,
                **control_image.describe(control),
            }
            log.info("control image ready: %s", control_info)

        try:
            with VramSampler() as sampler, torch.inference_mode():
                # width/height 는 넘기지 않는다. SDXL Img2Img 는 그 인자를 받지 않고
                # 입력 이미지 크기를 그대로 따른다 (DESIGN_GAP_REPORT G-1).
                generated = service.pipe(**call_kwargs).images[0]
        except torch.cuda.OutOfMemoryError as exc:
            # OOM 복구 경로에서만 캐시를 비운다.
            torch.cuda.empty_cache()
            raise WorkerError(
                ErrorCode.CUDA_OUT_OF_MEMORY,
                "Generation failed because GPU memory was exhausted.",
                cause=exc,
            ) from exc
        except WorkerError:
            raise
        except Exception as exc:
            if "out of memory" in str(exc).lower():
                torch.cuda.empty_cache()
                raise WorkerError(
                    ErrorCode.CUDA_OUT_OF_MEMORY,
                    "Generation failed because GPU memory was exhausted.",
                    cause=exc,
                ) from exc
            raise WorkerError(ErrorCode.INFERENCE_FAILED, f"Inference failed: {exc}", cause=exc) from exc

        watch.mark("inference")

        if generated.size != generation_size:
            raise WorkerError(
                ErrorCode.INFERENCE_FAILED,
                f"Pipeline returned {generated.size}, expected {generation_size}.",
            )
        _assert_usable_output(generated)

        sharpen = settings.enable_sharpen if request.enable_sharpen is None else request.enable_sharpen
        try:
            final = postprocessor.resize_and_crop(generated, settings, final_size)
            # 확대가 있었다면 타일 SD 정련으로 잃은 고주파를 되채운다. LANCZOS 는 디테일을
            # 더하지 못하므로, 늘린 뒤 낮은 strength 로 다시 그리는 것이 표준 해법이다.
            # 정련은 **리사이즈 뒤, 샤픈 앞**이다 — 샤픈은 이미 있는 엣지를 강조할 뿐이라
            # 없는 디테일을 만들지 못하고, 정련 전에 걸면 그 인공 엣지를 정련이 물려받는다.
            if settings.enable_upscale_refine and upscale >= settings.upscale_refine_min_scale:
                refine_kwargs = {
                    key: value
                    for key, value in call_kwargs.items()
                    if key not in {"image", "strength", "control_image", "generator"}
                }
                final = upscaler.refine_upscaled(
                    service.pipe,
                    final,
                    pipe_kwargs=refine_kwargs,
                    tile=settings.upscale_tile,
                    overlap=settings.upscale_overlap,
                    strength=settings.upscale_refine_strength,
                    per_tile=(
                        (lambda patch: {"control_image": control_image.build_control_image(patch, settings)})
                        if settings.enable_controlnet
                        else None
                    ),
                )
                watch.mark("upscaleRefine")
            if sharpen:
                final = postprocessor.apply_optional_sharpen(final, settings)
        except WorkerError:
            raise
        except Exception as exc:
            raise WorkerError(
                ErrorCode.POSTPROCESS_FAILED, f"Postprocess failed: {exc}", cause=exc
            ) from exc
        watch.mark("resize")

        memory = snapshot_memory(sampled_peak_mb=sampler.peak_mb or None)
        runtime = {
            **service.runtime,
            "modelProfile": settings.model_profile,
            "strength": strength,
            "strengthPreset": preset,
            "requestedSteps": requested_steps,
            "effectiveSteps": effective_steps,
            "guidanceScale": settings.resolved_guidance_scale,
            "negativePromptProfile": settings.negative_prompt_profile,
            "negativePromptEffective": built.negative_effective,
            # 파일에서 읽었을 때만 채워진다. 파일은 언제든 고쳐지므로 프롬프트 원문
            # (아래 metadata["prompt"])과 함께 남겨야 나중에 되짚을 수 있다.
            "promptFile": built.prompt_file,
            "promptFileCategories": list(built.prompt_file_categories),
            "sharpen": sharpen,
            "generatorDevice": settings.generator_device,
            "controlnet": control_info,
            "ipAdapter": ip_info,
            "loraEnabled": bool(service.runtime.get("lora", {}).get("loaded")),
        }
        metadata = {
            "jobId": request.job_id,
            "request": request.model_dump(by_alias=True),
            "prompt": built.prompt,
            "negativePrompt": built.negative_prompt,
            "promptDropped": built.dropped,
            "negativeDropped": built.negative_dropped,
            "seed": seed,
            "sizes": sizes,
            "runtime": runtime,
            "memory": memory.to_payload(),
            "warnings": warnings,
        }

        saved = output_store.save_image(final, request.job_id, settings)
        watch.mark("save")
        watch.total_ms()
        output_store.write_metadata(saved, {**metadata, "timingsMs": watch.timings_ms})

        log.info(
            "job %s done in %d ms (inference %d ms, %d/%d steps, peak torch VRAM %.0f MB)",
            request.job_id,
            watch.timings_ms["total"],
            watch.timings_ms["inference"],
            effective_steps,
            requested_steps,
            memory.peak_vram_mb,
        )

        # 새 지시문 §15 의 timing 키. 로컬 POC 라 download/upload 는 0 이다.
        timing = {
            "downloadMs": 0,
            "preprocessMs": watch.timings_ms["preprocess"],
            "promptBuildMs": watch.timings_ms["promptBuild"],
            "inferenceMs": watch.timings_ms["inference"],
            "resizeMs": watch.timings_ms["resize"],
            "saveMs": watch.timings_ms["save"],
            "uploadMs": 0,
            "totalMs": watch.timings_ms["total"],
        }

        return GenerationResponse(
            jobId=request.job_id,
            modelProfile=settings.model_profile,
            checkpoint=str(service.runtime.get("checkpoint", "")),
            strength=strength,
            strengthPreset=preset,
            seed=seed,
            steps=requested_steps,
            effectiveSteps=effective_steps,
            guidanceScale=settings.resolved_guidance_scale,
            generationSize={"width": generation_size[0], "height": generation_size[1]},
            outputSize={"width": final.width, "height": final.height},
            quantizationMode=settings.quantization_mode,
            loraEnabled=bool(service.runtime.get("lora", {}).get("loaded")),
            negativePromptProfile=settings.negative_prompt_profile,
            negativePromptEffective=built.negative_effective,
            prompt=built.prompt,
            negativePrompt=built.negative_prompt,
            ipAdapter=ip_info,
            timing=timing,
            peakVramMb=memory.peak_vram_mb,
            peakVramReservedMb=memory.peak_vram_reserved_mb,
            peakNvidiaSmiVramMb=memory.nvidia_smi_vram_mb,
            peakRamMb=memory.peak_ram_mb,
            resultUrl=Path(saved.image_path).as_uri(),
            outputPath=str(saved.image_path),
            webpPath=str(saved.webp_path) if saved.webp_path else None,
            metadataPath=str(saved.metadata_path),
            warnings=warnings,
        )
    finally:
        service.job_lock.release()
