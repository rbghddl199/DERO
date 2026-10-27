"""설정. 모든 튜닝 값은 여기 한 곳에서만 읽는다.

설계서 §5 의 .env 키를 그대로 쓴다. 생성 코드에 조건문을 흩뿌리지 않기 위해
메모리 모드/양자화/LoRA 는 전부 설정값으로만 갈라진다 (설계서 §6.2).
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]

MemoryMode = Literal["cuda", "model_cpu_offload", "sequential_cpu_offload"]
QuantizationMode = Literal["none", "torchao_int8", "bnb_nf4_experimental"]
LightningVariant = Literal["unet", "lora", "none"]
StrengthPreset = Literal["PRESERVE", "BALANCED", "REALISTIC"]
NegativePromptProfile = Literal["full", "compact", "none"]
MoodTag = Literal["WHITE_MINIMAL", "BLUE", "PINK", "BLACK", "WOOD"]

# 새 지시문 §5 — 이 세 값 외의 strength 는 받지 않는다. 0.5 이상은 제공하지 않는다.
# 구 설계서의 0.25/0.50/0.75 에서 바뀐 값이다.
STRENGTH_PRESETS: dict[str, float] = {
    "PRESERVE": 0.25,
    "BALANCED": 0.35,
    "REALISTIC": 0.45,
}

#: 새 지시문 §5 의 상한. ControlNet 이 꺼져 있으면 이보다 큰 값은 받지 않는다.
MAX_ALLOWED_STRENGTH = 0.45

# ControlNet 을 켜면 구조가 조건 이미지로 고정되므로 더 높은 strength 를 쓸 수 있다.
# 이 값들은 §5 정책 밖이며 ENABLE_CONTROLNET=true 일 때만 허용된다.
CONTROLNET_STRENGTHS: dict[str, float] = {
    "CN_LOW": 0.60,
    "CN_BALANCED": 0.75,
    "CN_HIGH": 0.90,
}
# 1.00 은 **일부러 넣지 않았다.** 흰 배경 제품 사진에 방을 만들어 넣으려고 시험했지만
# (입력을 완전히 노이즈로 덮으면 흰 바닥도 사라질 것이라는 가정) 배경은 그대로 흰색이었고
# 제품만 망가졌다 — 탁상시계는 표시창을 잃고 키보드는 각인이 깨졌다 (2026-08-04 실측).
# 배경이 흰색인 이유는 strength 가 아니라 canny 조건 이미지의 빈 영역이다.
# 자세한 실측 목록은 prompts/product_copyright_safe.txt 머리말에 있다.

#: 요청으로 받을 수 있는 모든 strength 값. 모드별 허용 여부는 generator 가 판정한다.
ALL_ALLOWED_STRENGTHS: tuple[float, ...] = tuple(
    sorted({*STRENGTH_PRESETS.values(), *CONTROLNET_STRENGTHS.values()})
)

# 새 지시문 §4 예시는 moodTags 로 ["WHITE","BLUE","MINIMAL"] 을 쓰지만 §9 는 5종을 정의한다.
# 지시문 내부 불일치이므로 §9 의 5종을 정본으로 삼고 §4 표기를 여기로 매핑한다.
MOOD_ALIASES: dict[str, str] = {
    "WHITE": "WHITE_MINIMAL",
    "MINIMAL": "WHITE_MINIMAL",
    "WHITE_MINIMAL": "WHITE_MINIMAL",
    "BLUE": "BLUE",
    "PINK": "PINK",
    "BLACK": "BLACK",
    "WOOD": "WOOD",
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(REPO_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        protected_namespaces=(),
    )

    # --- Runtime ---
    app_env: str = "local"
    # 설계서 §11, §22 — 워커는 127.0.0.1 에만 바인딩한다.
    # 터널(cloudflared/ngrok)을 쓸 때도 이 값을 바꾸지 않는다. 터널 클라이언트가 같은 기계에서
    # 로컬 포트로 붙으므로, 바인딩은 로컬로 유지한 채 외부 요청을 받을 수 있다.
    host: str = "127.0.0.1"
    port: int = 8010
    log_level: str = "INFO"
    max_concurrent_jobs: int = 1

    #: 백엔드만 호출할 수 있게 하는 공유 토큰. 비어 있으면 인증하지 않는다(로컬 개발).
    #: 터널로 외부에 열 때는 **반드시** 설정해야 한다 — 아니면 URL 을 아는 누구나 GPU 를 쓴다.
    worker_token: str = ""
    #: 결과 보관 시간. 백엔드가 받아간 뒤에도 재요청에 대비해 남긴다.
    output_retention_hours: int = 24

    # --- Redis 큐 (DERO ADR-0015) --------------------------------------
    # 워커는 Redis 만 안다 — 백엔드 DB 도 S3 자격증명도 갖지 않는다.
    #
    # **포트를 열지 않는다.** Lightsail 의 Redis 는 127.0.0.1 바인딩이고 거기에 로그인
    # 리프레시 토큰이 산다(ADR-0005). 노트북이 SSH 터널을 열고 자기 로컬 포트로 붙는다:
    #
    #   ssh -N -L 6379:127.0.0.1:6379 ubuntu@<lightsail>
    #
    # 그래서 기본값이 localhost 다. 이 값을 원격 주소로 바꾸는 것은 설계 위반이다.
    redis_host: str = "127.0.0.1"
    redis_port: int = 6379
    redis_db: int = 0
    redis_password: str = ""

    #: 백엔드의 LocalWorkerImageGeneration 과 **문자열이 정확히 같아야 한다.**
    redis_request_key: str = "image:generate:requests"
    redis_result_prefix: str = "image:generate:results:"

    #: BRPOP 블로킹 시간(초). 이 주기로 깨어나 종료 신호를 확인한다.
    redis_block_seconds: int = 5
    #: 터널이 끊겼을 때 재연결 간격. 노트북 + 가정용 네트워크라 끊김은 정상 상태다.
    reconnect_seconds: int = 5
    #: 결과를 **올리지 않고 로컬에만 남긴다** (2026-08-05). 잘 나오는지 눈으로 확인하는 모드다.
    #:
    #: presigned PUT 을 건너뛰고 `OUTPUT_DIR/queue-local/{correlationId}/` 에 저장한다.
    #: 응답은 그대로 RPUSH 해서 왕복은 확인할 수 있게 둔다 — 다만 그 key 의 파일은 실제로
    #: 올라가 있지 않으므로, **진짜 백엔드가 이 응답을 받으면 없는 파일을 가리키는 행을 쓴다.**
    #: 그래서 이 모드는 기본 요청 키에서 돌기를 거부한다(`assert_local_only_is_isolated`) —
    #: 전용 키를 쓰라고 강제한다.
    local_only_results: bool = False

    #: 결과 리스트 TTL(초). 백엔드가 타임아웃으로 먼저 빠져나갔으면 아무도 안 읽는 값이
    #: 남는데, 이 Redis 에는 리프레시 토큰이 같이 산다(ADR-0005). 백엔드도 finally 에서
    #: 지우지만 그쪽이 죽었을 때의 마지막 방어다.
    result_ttl_seconds: int = 600
    #: 기동 직후 예열할지. 첫 사용자 요청이 느린 것을 떠넘기지 않는다.
    warmup_on_start: bool = True

    download_timeout_seconds: float = 60.0
    upload_timeout_seconds: float = 120.0

    # --- Model ---
    # 모델 프로필이 steps / guidance_scale / strength 후보를 정한다 (새 지시문 §3).
    #
    # 기본을 sdxl_photoreal 로 둔다 (2026-08-01). ControlNet 을 켜는 결정과 한 묶음이다 —
    # sdxl_lightning 은 guidance_scale=0 이라 네거티브 프롬프트가 무효이고, ControlNet 을 켜면
    # 툰 윤곽선 안을 평면으로 채워 오히려 더 일러스트가 된다(실측 채도 5.2%→2.8%).
    # 사진 품질은 실사 특화 체크포인트 + CFG 조합에서만 나왔다.
    # 되돌리려면 .env 에 MODEL_PROFILE=sdxl_lightning ENABLE_CONTROLNET=false.
    model_profile: str = "sdxl_photoreal"
    device: Literal["cuda", "cpu"] = "cuda"

    base_model_id: str = Field(
        default="stabilityai/stable-diffusion-xl-base-1.0",
        validation_alias=AliasChoices("SDXL_BASE_MODEL_ID", "BASE_MODEL_ID"),
    )
    #: 실사 특화 / 비교용 체크포인트. 비어 있으면 해당 프로필을 선택할 수 없다.
    #: RealVisXL V5.0 은 이 장비에서 검증하고 가중치를 받아뒀다 (openrail++).
    #: **상업 사용 조건은 모델 카드 원문을 사람이 확인해야 한다** (NOTICE.md).
    sdxl_photoreal_model_id: str = "SG161222/RealVisXL_V5.0"
    sdxl_juggernaut_model_id: str = ""

    lightning_repo_id: str = "ByteDance/SDXL-Lightning"
    # 8-step checkpoint 를 기본으로 쓴다. steps=9 에서 strength 0.25/0.35/0.45 가
    # 2/3/4 step 으로 갈라지려면 4-step 이 아니라 8-step 이어야 한다 (DESIGN_GAP_REPORT P2-3).
    lightning_checkpoint: str = "sdxl_lightning_8step_unet.safetensors"
    #: 로컬 .safetensors 경로를 직접 줄 때 사용한다. 비어 있으면 허브에서 받는다.
    sdxl_lightning_unet_path: str = ""
    lightning_variant: LightningVariant = "unet"
    torch_dtype: Literal["float16", "float32"] = Field(
        default="float16", validation_alias=AliasChoices("DTYPE", "TORCH_DTYPE")
    )

    #: 아래 둘은 비워두면 프로필 값을 쓴다. 채우면 프로필을 덮어쓴다(실험용).
    inference_steps: int | None = None
    guidance_scale: float | None = None
    img2img_strength: float | None = None

    #: 네거티브 프롬프트 프로필. CFG 가 꺼진 프로필에서는 무효이며 경고를 남긴다 (§10).
    #:
    #: 2026-08-03: `compact` → `full`. compact 였던 이유는 full 이 128 토큰이라 77 창에
    #: 안 들어가 절반이 잘렸기 때문이다. 청킹(`long_prompt.py`) 이후 그 제약이 없어졌고,
    #: full 에만 있는 항목(`low detail`·`over-sharpened`·`overprocessed`·`extra monitor`·
    #: `duplicated speakers`)이 그대로 실린다. 실측에서 선명도가 269 → 277 로 올랐고
    #: 구조 보존은 0.891 그대로였다.
    negative_prompt_profile: NegativePromptProfile = "full"

    #: 77 토큰 창을 넘는 프롬프트를 청킹해서 싣는다 (app/generation/long_prompt.py).
    #:
    #: 켜면 `PromptBuilder` 가 **문장을 버리지 않는다.** 끄면 옛 절단 동작으로 돌아간다 —
    #: `prompt_embeds` 를 받지 못하는 파이프라인을 붙일 때의 탈출구로 남겨 둔 것이고,
    #: 정상 경로에서 끌 이유는 없다.
    #:
    #: 기본 ON 인 이유: 77 을 한도로 착각해 예산을 강제하던 동안 재질 문장
    #: (`natural materials, plausible lighting, contact shadows, realistic exposure.`)
    #: 이 통째로 탈락한 채 생성이 돌았다(2026-08-02 실측). 실사화에 가장 직접
    #: 기여하는 문장이라 기본값이 그것을 버리는 쪽이면 안 된다.
    enable_long_prompt: bool = True

    #: 프롬프트를 이 파일에서 읽어 **그대로** 쓴다. 비어 있으면(기본) 아무것도 바뀌지 않는다.
    #:
    #: 켜면 `PromptBuilder` 의 조합 규칙(구조 보존·조명·무드·제품 목록)이 통째로 우회된다.
    #: 데스크 실사화가 아닌 이미지를 같은 모델로 한 번 뽑아 볼 때의 임시 입구다
    #: (app/generation/prompt_file.py). CLI 는 `--prompt-file` 로 이 값을 준다.
    #:
    #: 이 경로를 `.env` 에 박아두면 서비스 경로(REST·큐)에도 적용된다 — 실사화 요청이
    #: 조용히 다른 프롬프트로 돌게 되므로, 작업하는 동안만 CLI 플래그로 쓰는 것을 권한다.
    prompt_file: Path | None = None

    #: 책상 **밖** 공간(벽·바닥·배경)을 실제 방처럼 연출하라고 지시한다.
    #:
    #: **없는 물건을 만들어 넣는 지시다.** 시뮬레이터가 빈 흰 상자를 주기 때문에 켠 것이다 —
    #: 빈 방 캡처는 strength 0.9 로 돌려도 평탄 87.3% 로 타깃 사진(47~60%)의 절반도 못
    #: 갔고, 그 격차는 강도가 아니라 묘사할 것이 없음에서 왔다(2026-08-02 실측).
    #:
    #: `REQUIREMENTS.md` 의 "제품이 삭제되거나 추가됨 = 실패" 가 **책상 위 제품**을 뜻하는지
    #: **화면 전체**를 뜻하는지는 아직 갈리지 않았다. 책상 위는 ControlNet 이 붙들고 있어
    #: 여기 적은 것들은 벽·바닥으로 가지만, 규정 문구 확정은 별도 결정 사안이다.
    enable_background_decor: bool = True

    # --- ControlNet (기본 OFF) ---
    # 구조를 조건 이미지로 고정해 높은 strength 를 쓸 수 있게 한다.
    # 이것을 켜면 strength 상한이 MAX_ALLOWED_STRENGTH(0.45) 에서 CONTROLNET_MAX_STRENGTH 로 올라간다.
    # 기본 ON (2026-08-01 사용자 결정).
    # ControlNet 없이 strength 를 올리면 제품이 교체되고(모니터→iMac), 올리지 않으면
    # 입력이 거의 그대로 돌아온다. 둘 다 쓸 수 없어서 ControlNet 이 기본이 됐다.
    enable_controlnet: bool = True
    controlnet_type: Literal["canny", "depth"] = "canny"
    # small 변형(0.30GB)을 기본으로 쓴다. 표준 변형은 2.4GB 라 UNet 5GB 와 합쳐 8GB 를 넘겨
    # 공유 메모리로 밀려나고 추론이 27초 -> 130~180초로 무너진다 (실측).
    controlnet_model_id: str = "diffusers/controlnet-canny-sdxl-1.0-small"
    #: 0 = 조건 무시, 1 = 강하게 고정.
    #: 실측 최적점 0.6 — 0.35 는 제품이 교체되고(모니터→iMac), 0.7 이상은 툰 윤곽선을 그대로
    #: 되살려 "선 안에 색칠"한 일러스트가 된다 (docs/QUALITY_GAP_ANALYSIS.md 6절).
    controlnet_conditioning_scale: float = 0.6
    canny_low_threshold: int = 80
    canny_high_threshold: int = 180
    #: ControlNet 이 켜졌을 때 허용하는 strength 상한.
    controlnet_max_strength: float = 0.9
    #: ControlNet 모드의 기본 strength. 구조가 고정되므로 높게 쓴다.
    controlnet_strength: float = 0.75

    # --- IP-Adapter (레퍼런스 사진을 조건으로, 2026-08-06) --------------------
    #: `inputs/references/` 의 실제 제품 사진을 생성에 물린다 (app/models/ip_adapter_manager.py).
    #:
    #: **실측 결과 기본 OFF 다 (2026-08-06).** 작동은 한다 — 데스크매트가 레퍼런스
    #: (그리디파머스 가죽 장패드)의 베이지로 바뀌었다. 문제는 **그 대가**다:
    #:
    #: ```text
    #: scale  laplacianVar  edgeDensity  밝기    육안
    #:  0.0        167.75        3.124  69.67   나무 바닥결·러그 질감·가죽 의자 스티치·램프 발광
    #:  0.3        116.33        2.916  74.70   바닥결이 사라지고 전체가 평평해진다
    #:  0.5         98.41        2.782  79.85   플라스틱처럼 매끈. 스피커·마우스가 형태를 잃는다
    #: ```
    #: (test09 캡처 · seed 42 · 레퍼런스 3장(의자·데스크매트·키보드) · `scripts/compare_ip_adapter.py`)
    #:
    #: `laplacianVar` 는 이 저장소가 실사감의 대리 지표로 쓰는 값이다(질감이 있으면 올라간다).
    #: **scale 을 올릴수록 단조롭게 떨어지고 밝기는 올라간다** — 레퍼런스가 흰 스튜디오
    #: 배경 컷이라 제품의 재질만 오는 게 아니라 그 사진의 평평함과 밝기까지 따라오기
    #: 때문이다. 목표가 "실제 방을 찍은 사진" 이므로 이 거래는 지금 손해다.
    #:
    #: 켤 만해지는 조건은 **영역을 좁히는 것**이다: 시뮬레이터가 제품별 바운딩 박스를 주면
    #: `ip_adapter_masks` 로 제품 영역에만 걸 수 있고, 벽·바닥·조명은 건드리지 않는다.
    #: 그 전까지는 전역이라 배경까지 같이 끌려간다 (generation/references.py 머리말).
    enable_ip_adapter: bool = False
    ip_adapter_repo_id: str = "h94/IP-Adapter"
    ip_adapter_subfolder: str = "sdxl_models"
    #: 비-plus 를 쓴다. plus 는 토큰 16개라 정체성이 세게 실리는 대신 레퍼런스의 **흰
    #: 스튜디오 배경까지** 세게 끌고 온다 — 목표가 실사화라 그 거래가 불리하다.
    ip_adapter_weight_name: str = "ip-adapter_sdxl_vit-h.safetensors"
    #: 인코더는 어댑터와 다른 폴더에 있다. `sdxl_models/` 아래가 아니다.
    ip_adapter_image_encoder_subfolder: str = "models/image_encoder"

    #: 레퍼런스가 결과에 얼마나 실릴지 (0 = 없는 것과 같다).
    #:
    #: **올릴수록 실사화에서 멀어진다.** 레퍼런스가 흰 배경 제품 컷이라, 재질만 오는 게
    #: 아니라 그 사진의 배경·조명·구도가 함께 온다. 낮게 두고 실측으로 올린다.
    ip_adapter_scale: float = 0.3

    #: 한 번에 물릴 레퍼런스 장수. 어댑터가 하나뿐이라 **평균**해서 넣으므로
    #: (ip_adapter_manager 머리말) 장수가 늘수록 각각의 신호가 희석된다.
    ip_adapter_max_references: int = 3

    #: 레퍼런스 뿌리. `gate-references --out inputs/references` 가 만드는 그 폴더다.
    references_dir: Path = REPO_ROOT / "inputs" / "references"

    # --- Generation ---
    # follow_input : 출력 크기 = 입력 크기, 생성 크기 = 입력 비율에 맞춘 SDXL 친화 크기 (기본)
    # fixed        : 생성 1152x1024, 최종 1328x1184 로 고정 (구 규격)
    size_mode: Literal["follow_input", "fixed"] = "follow_input"
    #: 생성 픽셀 수 상한. **입력이 이보다 크면 그 차이만큼 확대되어 흐려진다** —
    #: 생성 크기로 그린 뒤 입력 크기로 되돌리기 때문이다.
    #:
    #: 2026-08-02 에 1152x1024(1.18M) → 2048x1152(2.36M) 로 올렸다. 옛 값은
    #: "넘기면 8GB 에서 OOM 위험" 이라는 이유로 잡혔는데, 그 위험의 실체는
    #: `long_prompt` 의 autograd 누수였고(peak 9,210MB) 그것을 고친 뒤로는 여유가 있다.
    #:
    #: 실측 (RTX 8GB · 캡처 2400x1350 · strength 0.75 · 밤):
    #: ```text
    #:   생성 1344x768   선명도 39   17.8s   peak 6,199MB   확대 1.79배
    #:   생성 1792x1024  선명도 47   33.1s   peak 6,571MB   확대 1.34배
    #:   생성 2048x1152  선명도 54   42.0s   peak 6,819MB   확대 1.17배
    #:   (캡처 원본 선명도 62 — 라플라시안 분산)
    #: ```
    #: 더 올려도 `size_multiple` 64 와 비율 허용치 때문에 2048x1152 에서 멈춘다.
    #: 시뮬레이터의 `AI_CAPTURE_WIDTH/HEIGHT`(2048x1152)와 **짝이다** — 한쪽만 바꾸면
    #: 다시 확대가 생긴다.
    generation_pixel_budget: int = 2048 * 1152
    #: 생성 크기는 이 값의 배수로 맞춘다. SDXL 은 VAE 8배 축소 + attention 형상 때문에 64 가 안전하다.
    size_multiple: int = 64
    #: 생성 크기의 비율 오차 허용치. 이 안에서는 픽셀 수가 큰 쪽을 고른다.
    #: 남는 오차는 후처리 중앙 crop 이 흡수한다.
    size_ratio_tolerance: float = 0.02

    # fixed 모드에서만 쓰이는 값들.
    generation_width: int = 1152
    generation_height: int = 1024
    final_width: int = 1328
    final_height: int = 1184
    default_seed: int = 42

    input_min_size: int = 512
    input_max_bytes: int = 25 * 1024 * 1024
    #: 입력의 음영량(3x3 국소 표준편차, prepare 후 측정) 하한.
    #: 이보다 낮으면 실사화가 걸리지 않는다고 보고 **경고**한다(거부하지 않는다).
    #:
    #: 실측값 — 같은 척도로 잰 것만 비교해야 한다:
    #:   실제 3D 렌더        1.71   ← 통과해야 함
    #:   합성 도형 DAY/ON     0.86   ← 걸러야 함
    #:   합성 도형 NIGHT/OFF  0.56   ← 걸러야 함
    #:
    #: **분리 폭이 얇다(1.71 대 0.86).** 지금 실제 렌더 표본이 1장뿐이라 잠정값이며,
    #: IBL·그림자를 켠 렌더가 들어오면 값이 올라갈 것이므로 그때 다시 잡아야 한다.
    #: 그래서 임계값을 낮게(1.2) 두어 명백한 평면만 잡는다 — 오탐이 더 해롭기 때문이다.
    min_shading_std: float = 1.2
    #: fixed 모드에서 입력 비율이 목표와 이 이상 다르면 거부한다 (자동 crop 금지).
    #: follow_input 모드에서는 비율을 입력에 맞추므로 이 검사를 하지 않는다.
    aspect_ratio_tolerance: float = 0.02

    # --- Memory ---
    # 새 지시문 §14 는 ENABLE_MODEL_CPU_OFFLOAD 로 켠다. MEMORY_MODE 와 함께 쓸 수 있게
    # 별도 플래그로 두고, MEMORY_MODE 가 명시되면 그쪽을 따른다.
    enable_model_cpu_offload: bool = True
    enable_xformers: Literal["auto", "true", "false"] = "auto"
    memory_mode: MemoryMode = "model_cpu_offload"
    enable_vae_tiling: bool = True
    enable_vae_slicing: bool = False
    enable_attention_slicing: bool = False
    enable_torch_compile: bool = False
    # offload 를 쓰면 실행 디바이스가 요청마다 바뀔 수 있어 seed 재현을 위해 cpu generator 를 쓴다.
    generator_device: Literal["cpu", "cuda"] = "cpu"
    warmup_size: int = 512

    # --- LoRA (기본 OFF, 새 지시문 §12) ---
    enable_dero_lora: bool = Field(
        default=False, validation_alias=AliasChoices("ENABLE_LORA", "ENABLE_DERO_LORA")
    )
    dero_lora_path: str = Field(
        default="", validation_alias=AliasChoices("LORA_PATH", "DERO_LORA_PATH")
    )
    dero_lora_weight_name: str = ""
    dero_lora_scale: float = Field(
        default=0.6, validation_alias=AliasChoices("LORA_SCALE", "DERO_LORA_SCALE")
    )
    fuse_dero_lora: bool = False

    # --- Quantization (기본 none, 새 지시문 §13) ---
    quantization_mode: QuantizationMode = "none"
    allow_experimental_quantization: bool = False
    quantization_fallback: Literal["fail"] = "fail"

    # --- Upscale refine (2026-08-05) ---
    #: 확대가 필요할 때 타일 SD 정련을 돌린다 (app/generation/upscaler.py).
    #:
    #: 출력이 생성 해상도보다 크면 LANCZOS 로 늘리는데, **그 확대가 화질 손실의 거의
    #: 전부다** (실측: 왕복 리사이즈만으로 선명도 34.3 → 25.2, 실제 출력 26.9,
    #: 확대 없이 돌린 출력 48.0). 늘린 뒤 낮은 strength 로 한 번 더 그려 되채운다.
    #:
    #: **기본 OFF 이고, 실측에서 이득이 없었다** — test8 에서 선명도 26.9 → 24.2 로
    #: 오히려 내려갔다. 원인은 타일마다의 VAE 왕복이다(upscaler.py 머리말의 표).
    #: 시간도 2.3배 늘어난다(59초 → 105초, 타일 6장). 다른 배율에서 다를 수 있어 남겨 둔다.
    enable_upscale_refine: bool = False
    #: 이 배율 이상 확대될 때만 정련한다. 1.0 에 가까우면 얻는 것이 없다.
    upscale_refine_min_scale: float = 1.05
    upscale_refine_strength: float = 0.25
    upscale_tile: int = 1024
    upscale_overlap: int = 128

    # --- Postprocess ---
    resample_filter: Literal["lanczos"] = "lanczos"
    enable_sharpen: bool = False
    # 새 지시문 §11 의 값. 구 설계서(0.6/20)에서 바뀌었다. 기본 OFF 는 동일하다.
    sharpen_radius: float = 0.8
    sharpen_percent: int = 40
    sharpen_threshold: int = 3
    save_optimize_png: bool = False
    #: PNG 원본은 항상 저장한다. true 면 전달용 WebP 를 추가로 저장한다 (§11).
    save_webp: bool = False
    webp_quality: int = 92

    # --- Storage ---
    output_dir: Path = REPO_ROOT / "outputs"
    model_cache_dir: Path = REPO_ROOT / "model-cache"
    #: simulatorViewPath 로 받은 경로는 이 디렉터리 하위로만 허용한다 (로컬 파일 읽기 방지).
    input_dir: Path = REPO_ROOT / "inputs"

    # --- 실험 플래그 ---
    # img2img 는 실제 denoise step 수가 int(steps*strength) 로 줄어든다 (DESIGN_GAP_REPORT G-2).
    # 켜면 effective step 이 4가 되도록 요청 step 을 올린다. 설계서 고정값과 어긋나므로 기본 OFF.
    compensate_steps_for_strength: bool = False

    @field_validator("output_dir", "model_cache_dir", "input_dir", "references_dir", mode="after")
    @classmethod
    def _absolute(cls, value: Path) -> Path:
        return value if value.is_absolute() else (REPO_ROOT / value).resolve()

    @field_validator("prompt_file", mode="after")
    @classmethod
    def _prompt_file_path(cls, value: Path | None) -> Path | None:
        """상대 경로는 현재 디렉터리 -> 프로젝트 루트 순으로 찾는다.

        위 디렉터리들과 달리 루트 기준으로만 풀 수 없다. CLI 플래그로 오는 값이라
        사용자가 셸에서 탭 완성한 경로(현재 디렉터리 기준)가 그대로 들어오고,
        `.env` 에 적힌 값은 루트 기준이기를 기대한다. 둘 다 받는다.
        """
        if value is None or value.is_absolute():
            return value
        return value if value.exists() else (REPO_ROOT / value)

    # --- 프로필과 환경변수의 합성 ---------------------------------------
    # 우선순위: 환경변수에 명시된 값 > 프로필 값. 어느 쪽이 이겼는지 metadata 에 남긴다.

    @property
    def profile(self):
        from app.models.profiles import get_profile

        return get_profile(self.model_profile)

    @property
    def resolved_model_id(self) -> str:
        """프로필이 지정한 환경변수에서 모델 ID 를 읽는다. 없으면 사용을 거부한다."""
        from app.core.errors import ConfigurationError

        profile = self.profile
        if profile.model_id_env is None:
            return self.base_model_id
        value = getattr(self, profile.model_id_env.lower(), "").strip()
        if not value:
            raise ConfigurationError(
                f"MODEL_PROFILE={profile.name} requires {profile.model_id_env} to be set. "
                "This POC does not auto-download unverified models; check the model card "
                "license first and then set the id explicitly."
            )
        return value

    @property
    def resolved_steps(self) -> int:
        return self.inference_steps if self.inference_steps is not None else self.profile.steps

    @property
    def resolved_guidance_scale(self) -> float:
        return (
            self.guidance_scale if self.guidance_scale is not None else self.profile.guidance_scale
        )

    @property
    def resolved_strength(self) -> float:
        if self.img2img_strength is not None:
            return self.img2img_strength
        # ControlNet 이 켜져 있으면 구조가 고정되므로 높은 기본값을 쓴다.
        if self.enable_controlnet:
            return self.controlnet_strength
        return self.profile.default_strength

    @property
    def max_strength(self) -> float:
        return self.controlnet_max_strength if self.enable_controlnet else MAX_ALLOWED_STRENGTH

    @property
    def default_strength_preset(self) -> str:
        """resolved_strength 에 대응하는 프리셋 이름. 허용값이 아니면 즉시 실패한다."""
        from app.core.errors import ConfigurationError

        target = round(self.resolved_strength, 4)
        table = {**STRENGTH_PRESETS, **CONTROLNET_STRENGTHS}
        for name, value in table.items():
            if round(value, 4) == target:
                return name
        raise ConfigurationError(
            f"IMG2IMG_STRENGTH={self.resolved_strength} is not one of the allowed values "
            f"{sorted(table.values())}."
        )

    @property
    def supports_negative_prompt(self) -> bool:
        """resolved_guidance_scale 기준. 프로필이 아니라 최종값으로 판단해야 한다."""
        return self.resolved_guidance_scale > 1.0

    @property
    def generation_size(self) -> tuple[int, int]:
        """(width, height) — AI 생성 크기."""
        return (self.generation_width, self.generation_height)

    @property
    def final_size(self) -> tuple[int, int]:
        """(width, height) — 최종 반환 크기."""
        return (self.final_width, self.final_height)

    @property
    def intermediate_size(self) -> tuple[int, int]:
        """Lanczos 리사이즈 중간 크기. 높이 기준 배율로 폭을 정하고 좌우를 잘라낸다.

        설계서 §2.4: 1152x1024 -> 높이 1.15625배 -> 1332x1184 -> 좌우 2px crop -> 1328x1184.
        비율을 억지로 늘리지 않기 위해 폭은 반올림으로 계산한다.
        """
        scale = self.final_height / self.generation_height
        width = round(self.generation_width * scale)
        return (width, self.final_height)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
