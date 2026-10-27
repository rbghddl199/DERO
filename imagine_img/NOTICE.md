# NOTICE — 모델 가중치 라이선스 고지

이 Worker 는 아래 가중치를 **다운로드해서 사용**한다. 저장소에 가중치를 포함하지 않는다.
각 모델의 조건은 배포자가 정한 것이며, 아래는 위치를 가리키기 위한 안내다.
상업적 사용 여부는 각 라이선스 원문을 직접 확인해야 한다.

## stabilityai/stable-diffusion-xl-base-1.0

- 용도: SDXL Base 파이프라인의 VAE, 두 텍스트 인코더, 토크나이저, UNet config
- 라이선스: CreativeML Open RAIL++-M License
- 원문: https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0 의 `LICENSE.md`

## ByteDance/SDXL-Lightning

- 용도: `sdxl_lightning_4step_unet.safetensors` (4-step Full UNet, 이 POC 의 기본 denoiser)
- 라이선스: 배포 저장소의 라이선스 표기를 따른다 (SDXL 파생물)
- 원문: https://huggingface.co/ByteDance/SDXL-Lightning

## 생성 결과물

`outputs/` 아래 산출물은 위 모델의 라이선스 조건 아래 만들어진 것이다.
DERO 서비스에서 사용하기 전에 다음을 확인해야 한다.

- RAIL++-M 의 사용 제한 조항 (Attachment A) 준수
- 생성 이미지에 실제 제품의 브랜드·로고가 사실과 다르게 표현될 수 있다는 점
  (PromptBuilder 는 브랜드명을 추측하지 않지만, 모델이 유사 로고를 그릴 수 있다)

## 소프트웨어 의존성

`requirements-lock.txt` 의 패키지들은 각자의 라이선스를 따른다 (대부분 Apache-2.0 / MIT / BSD).
`diffusers`, `transformers`, `accelerate`, `peft`, `huggingface_hub` — Apache-2.0.
`torch` — BSD-3-Clause. `pillow` — MIT-CMU. `fastapi`, `uvicorn`, `pydantic` — MIT.
