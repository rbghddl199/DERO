# AI 상상도 provider 조사

> 티켓: DERO-130 · 상위 맵: [architecture-map.md](../context/architecture-map.md)
> **조사 시점: 2026-07-24.** 이 문서의 모든 단가·한도·리전 정보는 이 날짜 기준이며, 이미지 생성 API 가격은 분기 단위로 바뀐다.
> **이 문서는 판단하지 않는다.** 추천도 순위도 없다. 사실과 대가만 모았다. 선택은 사람이 한다.

## 0. 조사 대상과 경계

- 대상 요구사항: REQ-IMG-01(배치 기반 상상도 생성) / REQ-IMG-02(시간대 설정) / REQ-IMG-03(생성 횟수 제한).
- 입력 후보 둘 다 검토했다 — (A) 3D 씬 스크린샷을 넣는 **img2img**, (B) 배치 메타데이터를 문장으로 푼 **text2img**.
- REQ-IMG-02(시간대)는 두 방식 모두 프롬프트 텍스트로 표현 가능해 provider 선택을 가르는 축이 아니다. 별도로 다루지 않는다.
- 표기 규칙: 1차 출처(공식 가격 페이지·공식 API 문서)에서 확인한 것만 수치로 적었다. 확인 못 한 것은 **확인 불가**로 명시했다. 2차 출처는 그렇다고 표시했다.

---

## 1. provider 후보와 이미지당 단가

### 1-1. Google — Gemini API (직접)

출처: [Gemini API 가격 페이지](https://ai.google.dev/gemini-api/docs/pricing)

| 모델 | 표준 단가 | Batch 단가 | 무료 티어 |
|---|---|---|---|
| `gemini-3.1-flash-image` (Nano Banana 2) | $0.045 / 0.5K 이미지 (출력 $60/1M tok) | $0.022 / 0.5K 이미지 | 없음 |
| `gemini-3.1-flash-lite-image` (Nano Banana 2 Lite) | $0.0336 / 1K 이미지 (출력 $30/1M tok) | $0.0168 / 1K 이미지 | 없음 |
| `gemini-3-pro-image` (Nano Banana Pro) | $0.134 / 1K·2K 이미지 (출력 $120/1M tok) | 이미지 크기별 상이 | 없음 |
| `gemini-2.5-flash-image` (legacy) | $0.039 / 이미지 | $0.0195 / 이미지 | 없음 |
| Imagen 4 Fast / Standard / Ultra | $0.02 / $0.04 / $0.06 | — | 없음 |

- Gemini 이미지 모델은 **토큰 과금**이다. 위 "이미지당" 값은 Google이 가격 페이지에 함께 적어둔 환산치다.
- **Imagen 4는 deprecated이며 2026-08-17 종료 예정**이라고 같은 페이지에 표기돼 있다. 즉 조사 시점 기준 3주 뒤다.
- 가격 페이지가 이미지 모델 전 라인에 대해 **"Free tier: Not available"**이라고 명시한다. AI Studio 무료 티어로는 이미지 생성 API를 못 쓴다는 뜻이다.

### 1-2. OpenAI

출처: [OpenAI API 가격](https://developers.openai.com/api/docs/pricing) · [Image generation 가이드](https://developers.openai.com/api/docs/guides/image-generation)

토큰 과금(백만 토큰당, Batch는 전 항목 50% 할인):

| 모델 | 이미지 입력 | 캐시된 이미지 입력 | 텍스트 입력 | 출력 |
|---|---|---|---|---|
| `gpt-image-2` | $8.00 | $2.00 | $5.00 | $30.00 |
| `gpt-image-1.5` | $8.00 | $2.00 | $5.00 | $32.00 |
| `gpt-image-1-mini` | $2.50 | $0.25 | $2.00 | $8.00 |

가이드 문서에 실린 이미지당 환산:

- `gpt-image-2` 1024×1024 Medium = **$0.053**
- `gpt-image-1.5` Low **$0.009~$0.013** / Medium **$0.034~$0.05** / High **$0.133~$0.2**

가격 페이지 자체는 "이미지당 비용은 image generation 가이드의 계산기를 쓰라"고만 안내한다. 즉 **해상도·품질 조합마다 단가가 달라 고정 단가를 가정할 수 없다.**

### 1-3. Black Forest Labs (FLUX, 직접)

출처: [BFL 가격 문서](https://docs.bfl.ai/quick_start/pricing)

| 엔드포인트 | 이미지당 |
|---|---|
| FLUX.2 [klein] 4B | from $0.014 |
| FLUX.2 [klein] 9B | from $0.015 |
| FLUX.2 [pro] | from $0.03 (편집 from $0.045) |
| FLUX.2 [flex] | from $0.05 |
| FLUX.2 [max] | from $0.07 |
| FLUX.1 Kontext [pro] | $0.04 |
| FLUX.1 Kontext [max] | $0.08 |
| FLUX1.1 [pro] | $0.04 |
| FLUX1.1 [pro] Ultra / Raw | $0.06 |
| FLUX.1 Fill [pro] | $0.05 |

- FLUX.2 계열은 **메가픽셀 과금**이라 "from"이 붙는다. 해상도를 올리면 비례해 오른다. FLUX.1 계열은 고정 크레딧이다.
- [가격 페이지](https://bfl.ai/pricing)는 계산기 UI라 정적 표가 없다. 위 수치는 문서 쪽에서 가져왔다.

### 1-4. Stability AI (직접)

출처: [Stability 가격 페이지](https://platform.stability.ai/pricing) — **1 credit = $0.01**

| 서비스 | 크레딧 | USD |
|---|---|---|
| Stable Image Ultra | 8 | $0.08 |
| SD 3.5 Large | 6.5 | $0.065 |
| SD 3.5 Large Turbo | 4 | $0.04 |
| SD 3.5 Medium | 3.5 | $0.035 |
| SD 3.5 Flash | 2.5 | $0.025 |
| Stable Image Core | 3 | $0.03 |
| SDXL 1.0 | from 0.9 | from $0.009 |
| **Control / Structure** | 5 | $0.05 |
| **Control / Sketch** | 5 | $0.05 |
| Control / Style Guide | 5 | $0.05 |
| Control / Style Transfer | 8 | $0.08 |
| Edit / Inpaint · Erase · Search&Replace · Search&Recolor · Remove BG | 5 | $0.05 |
| Edit / Outpaint | 4 | $0.04 |
| Edit / Replace Background & Relight | 8 | $0.08 |
| Upscale / Fast · Conservative · Creative | 2 / 40 / 60 | $0.02 / $0.40 / $0.60 |

같은 페이지에 "Pricing is subject to change as we improve our models and infrastructure"라고 적혀 있다.

### 1-5. 애그리게이터 — fal.ai

출처: [fal 가격 페이지](https://fal.ai/pricing) · 개별 모델 페이지

| 모델 | 단가 |
|---|---|
| Seedream V4 | $0.03 / 이미지 |
| [FLUX.1 Kontext [pro]](https://fal.ai/models/fal-ai/flux-pro/kontext) | $0.04 / 이미지 |
| Nano Banana | $0.0398 / 이미지 |
| Qwen | $0.02 / 메가픽셀 |
| [`fal-ai/flux-general`](https://fal.ai/models/fal-ai/flux-general) (FLUX.1 [dev] + ControlNet/LoRA/IP-Adapter) | **$0.075 / 메가픽셀** (베이스 FLUX.1 [dev]는 $0.055) |

### 1-6. 애그리게이터 — Replicate

출처: [Replicate 가격 페이지](https://replicate.com/pricing)

| 모델 | 단가 |
|---|---|
| FLUX 1.1 Pro | $0.04 / 이미지 |
| FLUX Dev | $0.025 / 이미지 |
| FLUX Schnell | $3.00 / 1,000장 ($0.003) |
| Ideogram v3 Quality | $0.09 / 이미지 |
| Recraft V3 | $0.04 / 이미지 |

주의 — 같은 페이지가 "Some models are billed by hardware and time, others by input and output"이라고 밝힌다. **위처럼 이미지당 고정가가 붙은 모델은 일부이고, 나머지(특히 커뮤니티 ControlNet 모델)는 GPU 초당 과금이라 단가가 실행시간에 따라 변동한다.** 프라이빗 모델은 셋업·유휴 시간까지 과금된다.

### 1-7. AWS Bedrock

출처: [Bedrock 가격 페이지](https://aws.amazon.com/bedrock/pricing/)

| 모델·서비스 | 단가 |
|---|---|
| Amazon Titan Image Generator (1024×1024 standard) | $0.01 / 이미지 |
| Stability — Control Structure / Control Sketch / Inpaint / Erase / Remove BG / Search&Replace / Search&Recolor / Style Guide | 각 $0.07 |
| Stability — Style Transfer | $0.08 |
| Stability — Outpaint | $0.06 |
| Stability — Fast / Conservative / Creative Upscale | $0.03 / $0.40 / $0.60 |

- Bedrock의 Stability 편집·컨트롤 단가($0.07)는 **Stability 직접 호출($0.05)보다 비싸다.** 위 수치는 페이지에 "US regions" 기준으로 표기돼 있다.
- Amazon Nova Canvas 단가는 페이지에서 **확인 불가**. 별개로 리전 문서상 Nova Canvas는 Legacy 상태다(§6 참조).

### 1-8. 국내 provider

- Naver CLOVA / Kakao Karlo의 **2026년 이미지 생성 API 공개 단가는 확인 불가.** 공식 가격 페이지에서 이미지 생성 항목을 찾지 못했다. 필요하면 NCP 콘솔·카카오 개발자 문의로 별도 확인이 필요하다.

---

## 2. img2img와 구조 보존 제어

3D 씬 스크린샷을 넣어 사진처럼 바꾸는 경로다. "입력 이미지를 받는가"와 "기하 구조를 얼마나 강하게 붙잡아 주는가"는 다른 문제라 나눠 적는다.

| provider | 입력 이미지 수용 | 명시적 구조 컨디셔닝(depth/canny/structure) | 근거 |
|---|---|---|---|
| OpenAI | ○ — edits 엔드포인트, mask 지원, 참조 이미지 복수 가능. `gpt-image-2`는 모든 입력 이미지를 자동으로 high fidelity 처리(`input_fidelity` 파라미터 없음) | **✕ — 노출된 depth/canny 컨디셔닝 없음** | [Image generation 가이드](https://developers.openai.com/api/docs/guides/image-generation) |
| Google Gemini | ○ — 입력 이미지로 편집(요소 추가·제거·수정, 스타일 변경, 색보정). 참조 이미지 최대 14장(3.1 Flash Image 기준 오브젝트 10 + 캐릭터 4) | **✕ — 노출된 depth/canny 컨디셔닝 없음** | [Image generation 문서](https://ai.google.dev/gemini-api/docs/image-generation) |
| Stability | ○ | **○ — `/v2beta/stable-image/control/structure` ("Use an input image to precisely guide generation"), `/control/sketch`, `/control/style`, `/control/style-transfer`** | [가격 페이지의 Control 절](https://platform.stability.ai/pricing) |
| BFL (FLUX) | ○ — Kontext(지시형 편집), Fill(인페인트/아웃페인트), Redux | **△ — FLUX.1 Depth [pro]·Canny [pro]/[dev] 엔드포인트는 deprecated. BFL이 더 이상 유지·호스팅하지 않는다**(오픈 웨이트는 HF에 남아 있음). Fill·Redux는 영향 없음 | [FLUX.1 Depth [pro] API 문서의 deprecation 안내](https://docs.bfl.ai/api-reference/tasks/generate-an-image-with-flux1-depth-%5Bpro%5D-using-a-control-image) — 2차 확인, 원문 페이지 직접 접근 실패 |
| fal.ai | ○ | **○ — `fal-ai/flux-general`이 ControlNet 컨디셔닝 + IP-Adapter + LoRA를 한 호출에 묶어 제공. $0.075/MP** | [모델 페이지](https://fal.ai/models/fal-ai/flux-general) |
| Replicate | ○ | **○ — ControlNet 컬렉션 호스팅**(커뮤니티 모델. depth2img 등) | [ControlNet 컬렉션](https://replicate.com/collections/control-net) |
| Bedrock | ○ | **○ — Stability Control Structure / Control Sketch를 $0.07에 제공** | [Bedrock 가격](https://aws.amazon.com/bedrock/pricing/) |

### 정리되는 갈림길 (사실만)

- **최신·최고품질 모델(GPT Image 2, Nano Banana Pro)에는 depth/canny 컨디셔닝이 없다.** 이들은 "참조 이미지 + 자연어 지시"로만 구조를 유지한다. 구조가 얼마나 보존되는지는 프롬프트·모델 품질에 달렸고, 수치로 보장되지 않는다.
- **명시적 구조 보존(depth map으로 벽·책상 모서리를 고정)을 원하면 Stability Control/Structure, fal의 ControlNet 계열, Replicate ControlNet으로 좁혀진다.** 이쪽은 모델 품질이 상대적으로 구세대다.
- BFL은 이 조사 시점 기준 depth/canny 경로를 접었다. 즉 "FLUX + ControlNet"을 쓰려면 BFL 직접이 아니라 fal·Replicate 같은 호스팅 경유가 된다.

### 선례 (2차 출처 — 참고용)

3D 뷰포트 스크린샷 → 사실적 렌더 변환을 상용 서비스로 제공하는 곳들이 있다: [Carve](https://carve.so/features/render)(CAD export·3D 모델 스크린샷 입력), [AI Render Studio](https://airender.studio/)(SketchUp 스크린샷 입력, 약 12초), [ArchiVinci](https://www.archivinci.com/). 이들 자체 문서는 "ControlNet(depth + canny)로 벽·기둥·시선을 그대로 고정한다"는 파이프라인을 설명한다. **다만 이들은 상용 툴의 마케팅·블로그 서술이지 API 1차 문서가 아니다.** 우리가 그대로 재현 가능하다는 근거로는 약하다.

---

## 3. 응답 방식 — 동기인가, 큐 + 폴링/웹훅인가

| provider | 방식 | 세부 |
|---|---|---|
| **OpenAI** | **동기** | REST 호출이 결과를 직접 반환. 폴링 불필요. `partial_images`(0~3)로 진행 중 스트리밍 가능. 문서 표기: "Complex prompts may take up to 2 minutes to process" ([출처](https://developers.openai.com/api/docs/guides/image-generation)) |
| **Google Gemini** | **동기** | `POST https://generativelanguage.googleapis.com/v1beta/interactions`가 결과 직접 반환. 별도로 Batch API(50% 할인)는 비동기 ([출처](https://ai.google.dev/gemini-api/docs/image-generation)) |
| **Stability** | **동기** | v2beta REST. `Accept: image/*`면 이미지 바이트를 바로 반환. multipart/form-data 요청. 일부 서비스(예: Creative Upscale)는 폴링 경로가 따로 있음 ([API 개요](https://platform.stability.ai/docs/getting-started/stable-image)) |
| **BFL** | **비동기 전용** | "It follows an asynchronous design, where you first make a request for a generation and then query for the result." POST → `{id, polling_url}` → `polling_url` GET 폴링 → status `Ready`면 서명 URL 획득. 공식 예제 폴링 간격 **0.5초**. `webhook_url`·`webhook_secret` 파라미터 지원. 동시 작업 **24개**(`flux-kontext-max`는 **6개**). **결과 URL은 10분 후 만료** → 받아서 우리 스토리지에 다시 올려야 한다 ([Quick start](https://docs.bfl.ai/quick_start/generating_images), [통합 가이드](https://docs.bfl.ml/api_integration/integration_guidelines)) |
| **fal.ai** | **큐 기반 (동기 래퍼 있음)** | 요청이 큐를 거친다. Java 클라이언트의 `subscribe()`가 폴링을 자동 처리하고 결과까지 블로킹. `webhook_url` 전달 시 완료 후 POST 콜백 ([웹훅 문서](https://docs.fal.ai/model-apis/model-endpoints/webhooks), [Java 클라이언트](https://fal.ai/docs/clients/java)) |
| **Replicate** | **비동기 기본 + 동기 옵션** | 기본은 prediction 생성 후 폴링. `Prefer: wait` 헤더로 동기 모드(기본 타임아웃 60초, `Prefer: wait=5`로 조정 가능). 웹훅 지원 + `webhook_events_filter` ([출처](https://replicate.com/docs/topics/predictions/create-a-prediction)) |

### 실측 생성 시간

- **한국에서 측정한 공개 수치는 어느 provider에서도 확인 불가.**
- [Artificial Analysis](https://artificialanalysis.ai/text-to-image)가 "Median time the provider takes to generate an image over the past 14 days" 기준으로 모델·provider별 생성 시간을 공개하고 있으나, **차트가 SVG 렌더라 개별 수치를 추출하지 못했다 → 확인 불가.** 필요하면 사람이 직접 페이지에서 읽어야 한다. 측정 지점도 한국이 아니다.
- provider 문서가 직접 밝힌 숫자는 OpenAI의 "최대 2분"뿐이다.
- 2차 출처(벤더 블로그·리뷰)들은 Gemini 3 Pro Image 8~12초, DALL·E 3 15~25초, Midjourney V7 20~30초를 언급하지만 **측정 조건이 공개되지 않아 신뢰도가 낮다.** Google 개발자 포럼에는 이미지 생성 지연이 9~40초에서 최대 5분까지 튀었다는 [사용자 신고](https://discuss.ai.google.dev/t/is-there-currently-an-issue-with-the-gemini-api-for-image-generation-latency-suddenly-increased-from-9-40s-to-up-to-5-minutes/136465)도 있다.

**설계에 걸리는 사실**: 동기 API라도 응답이 수십 초~2분이면 HTTP 요청 하나를 그 시간 동안 붙잡게 된다. EC2 1대에 톰캣 기본 스레드 풀이면 동시 생성 요청 수가 곧 점유 스레드 수다. 이건 provider가 동기냐 비동기냐와 별개로 우리 쪽에서 결정해야 하는 부분이다.

---

## 4. 무료 티어·초기 크레딧

| provider | 상태 | 출처 |
|---|---|---|
| Google Gemini API | **이미지 모델 전 라인 "Free tier: Not available"** | [가격 페이지](https://ai.google.dev/gemini-api/docs/pricing) |
| Stability AI | **가입 시 25 free credits ($0.25)** — 약 Core 8장 / Control Structure 5장 분량 | [가격 페이지](https://platform.stability.ai/pricing) |
| Replicate | "You can run select models on Replicate for free, but after a bit you'll be asked to set up billing." 명시적 크레딧 금액 없음 | [빌링 문서](https://replicate.com/docs/topics/billing) |
| OpenAI | 신규 계정 무료 크레딧 **확인 불가** (공식 페이지에서 확인하지 못함) | — |
| BFL | 공식 문서에서 **확인 불가**. 2차 출처들은 서드파티 프로모션(AI Engineer Pack 등)만 언급 | — |
| fal.ai | 공식 문서에서 **확인 불가**. 2차 출처는 "금액 비공개 일회성 가입 크레딧"이라고만 함 | — |
| AWS Bedrock | 이미지 모델 프리티어 **확인 불가** | — |

---

## 5. Java / Spring에서 호출하기

### 공식 SDK 유무

| provider | 공식 JVM SDK | 좌표 / 비고 |
|---|---|---|
| **OpenAI** | **○** | `com.openai:openai-java:4.45.0`. 이미지는 `client.images().generate(ImageGenerateParams)` 패턴 ([레포](https://github.com/openai/openai-java)) |
| **Google** | **○** | Google Gen AI Java SDK `googleapis/java-genai` (1.63.0) ([레포](https://github.com/googleapis/java-genai), [Javadoc](https://googleapis.github.io/java-genai/javadoc/)). 단 **Gemini 이미지 생성 문서의 코드 예시는 Python/JS만 있다** — Java 이미지 생성 예제는 확인 불가 |
| **fal.ai** | **○** | `ai.fal.client:fal-client:0.7.1`(동기), `fal-client-async`(CompletableFuture), `fal-client-kotlin`. Maven Central 배포. `subscribe()`가 큐 폴링 자동 처리 ([문서](https://fal.ai/docs/clients/java), [레포](https://github.com/fal-ai/fal-java)) |
| **AWS Bedrock** | **○** | AWS SDK for Java v2 (Bedrock Runtime) |
| **Stability AI** | **✕** | 공식 Java SDK 없음 |
| **BFL** | **✕** | 공식 SDK 없음. 문서 예제는 bash·Python의 표준 HTTP 라이브러리뿐 |
| **Replicate** | **✕** | 공식 클라이언트는 JavaScript·Python. Java 없음 |

### Spring AI 커버리지

[Spring AI ImageModel](https://docs.spring.io/spring-ai/reference/api/imageclient.html)이 기본 제공하는 이미지 생성 구현체는 **OpenAI · StabilityAI · Azure OpenAI 3종뿐**이다.

⚠ 함정: `spring-ai-starter-model-stability-ai`는 **Stability의 레거시 v1 엔드포인트(`https://api.stability.ai/v1`, 기본 모델 `stable-diffusion-v1-6`)를 호출한다** ([문서](https://docs.spring.io/spring-ai/reference/api/image/stabilityai-image.html)). **§2에서 정리한 v2beta Control/Structure는 이 스타터로 못 쓴다.** 쓰려면 REST를 직접 호출해야 한다.

### REST 직접 호출 난이도 (사실)

- 요청 포맷이 provider마다 다르다 — Stability는 `multipart/form-data` + `Accept: image/*` 바이너리 응답, OpenAI·Gemini·BFL은 JSON + base64.
- Spring의 `RestClient`/`WebClient`로 셋 다 가능하다. 특별한 프로토콜은 없다.
- **비용이 큰 쪽은 비동기 provider다.** BFL·fal·Replicate를 폴링/웹훅으로 쓰면 (a) 작업 상태를 어딘가 저장하고 (b) 폴링 루프나 웹훅 수신 엔드포인트를 만들고 (c) 실패·타임아웃을 정리하는 코드가 붙는다. 동기 provider(OpenAI·Gemini·Stability)는 이 셋이 없다.
- BFL은 여기에 더해 **결과 URL 10분 만료** 때문에 "받아서 우리 스토리지에 재업로드" 단계가 필수다.

---

## 6. 한국에서의 리전 가용성·지연

### 확인된 것

- **AWS Bedrock**: Amazon Nova Canvas는 **ap-northeast-2(서울) 미지원**. eu-west-1(아일랜드)·ap-northeast-1(도쿄) 지원. 게다가 us-east-1 기준 **Legacy 상태이며 EOL 2026-09-30**이다. Titan Image Generator G1 v2는 us-east-1·us-west-2만 지원 ([리전 호환성 문서](https://docs.aws.amazon.com/bedrock/latest/userguide/models-region-compatibility.html)).
- **Google Vertex AI**: 서울 리전 `asia-northeast3`은 존재한다. **다만 이미지 모델의 서울 지원 여부는 확인 불가** — 공식 리전 표의 지원 표시가 아이콘이라 자동 추출에 실패했다. 사람이 [해당 표](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/locations)를 직접 열어봐야 한다.
- **Google global endpoint**: `gemini-3-pro-image`, `gemini-3.1-flash-image`, `gemini-3.1-flash-lite-image`가 **global endpoint 지원 모델 목록에 명시돼 있다.** Google 설명: "Selecting a global endpoint for your requests can improve overall availability while reducing resource exhausted (429) errors." 단 같은 문서가 경고한다 — **"Don't use the global endpoint if you have ML processing requirements, because you can't control or know which region your ML processing requests are sent to"**, 그리고 **"Endpoints don't guarantee data residency or in-region ML processing."**
- **OpenAI**: 한국이 data residency 지원 국가에 포함되고 API Platform도 대상이다 ([OpenAI 공지](https://openai.com/index/introducing-data-residency-in-asia/)). 다만 이는 **저장 데이터(at rest) 위치** 보장이지 처리 리전이나 지연 보장이 아니다.
- **BFL**: 엔드포인트는 global(`api.bfl.ai`, 자동 페일오버) / EU(`api.eu.bfl.ai`) / US(`api.us.bfl.ai`) 셋뿐. **아시아 리전 없음** ([통합 가이드](https://docs.bfl.ml/api_integration/integration_guidelines)).

### 확인 불가

- **한국(또는 교육기관 EC2)에서 각 provider까지의 실측 RTT·생성 완료 시간은 어느 provider도 공식 공개하지 않는다.** 2차 벤치마크도 측정 지점이 한국이 아니다.
- Gemini API(`generativelanguage.googleapis.com`)의 처리 리전은 공개돼 있지 않다.
- fal.ai·Replicate·Stability의 리전 구성은 공개 문서에서 확인 불가.

→ 이 항목은 **직접 측정 외에 답이 없다.** EC2에서 후보 2~3곳에 실제 요청을 쏴서 p50/p95를 재는 것이 유일한 1차 데이터다.

---

## 7. 비용 통제 — 사용자당 생성 횟수 제한 구현 방식

우리 스키마에 맞추지 않고, 널리 쓰이는 방식을 사실 위주로 나열한다.

### 7-1. 애플리케이션 계층 (서버가 직접 센다)

| 방식 | 동작 | 성질 |
|---|---|---|
| **카운터 + TTL** | Redis `INCR` 키(예: `user:{id}:{yyyy-mm-dd}`)에 일 단위 TTL. 임계 초과 시 429 | 원자적. 일일 상한(REQ-IMG-03이 요구하는 형태)에 직접 대응. 인스턴스 수와 무관하게 전역 |
| **토큰 버킷 (Bucket4j)** | Bucket4j는 JCache 구현체를 꽂아 쓸 수 있고 Redis(Redisson)가 흔한 백엔드. 한도 초과 시 429 + 임시 차단 | 버스트 허용 + 평균 제한. 사용자·플랜별로 다른 한도 부여 가능 |
| **DB 행 카운터** | 사용자 행에 카운트 컬럼 + 낙관적 락/유니크 제약 | 별도 인프라 불필요. 락 경합 발생 가능 |
| **게이트웨이 필터** | Spring Cloud Gateway `RequestRateLimiter`(Redis 기반) | 앱 코드 밖. 게이트웨이가 있어야 함 |

출처: [Bucket4j + Redis on Spring Boot (INNOQ)](https://www.innoq.com/en/blog/2024/03/distributed-rate-limiting-with-spring-boot-and-redis/), [freeCodeCamp 가이드](https://www.freecodecamp.org/news/rate-limiting-with-bucket4j-and-redis/), [Spring Cloud Gateway 문서](https://docs.spring.io/spring-cloud-gateway/reference/spring-cloud-gateway-server-webflux/gatewayfilter-factories/requestratelimiter-factory.html) — **앞의 둘은 2차 출처(기술 블로그)다.** 마지막만 1차.

⚠ 인스턴스 수와의 관계 (2차 출처가 반복 지적하는 지점): Redis 없이 in-memory로만 세면 **한도가 인스턴스마다 따로 걸린다.** 3대면 실효 한도가 3배다. 우리는 EC2 1대가 확정 제약이라(architecture-map) 이 함정은 당장은 발생하지 않는다 — 단 인스턴스가 늘어나면 바로 뚫린다.

### 7-2. provider 계층 (지갑 자체를 막는다)

| provider | 하드캡 가능 여부 | 근거 |
|---|---|---|
| **OpenAI** | **○ 하드캡 있음** — "To enforce a monthly cap, set a hard spend limit. Hard spend limits stop affected API traffic when tracked spend reaches the limit." 별도로 spend alert도 있음 | [Production best practices](https://developers.openai.com/api/docs/guides/production-best-practices) |
| **Google Cloud** | **✕ 예산은 하드캡이 아니다** — **"Setting a budget does _not_ automatically cap Google Cloud or Google Maps Platform usage or spending."** 알림만 온다. 사용량을 실제로 막으려면 서비스별 "Capping API usage"를 따로 설정해야 하고, 문서도 "not a substitute for project-wide spending limits"라고 못 박는다 | [Cloud Billing 예산 문서](https://docs.cloud.google.com/billing/docs/how-to/budgets) |
| **Stability** | **○ 사실상 하드캡** — 선불 크레딧 구조라 잔액이 떨어지면 멈춘다 | [가격 페이지](https://platform.stability.ai/pricing) |
| **BFL** | **○ 사실상 하드캡** — 선불 크레딧(1 credit = $0.01), "No subscriptions, no seat fees. Only pay for what you generate." | [가격 페이지](https://bfl.ai/pricing) |
| **Replicate** | **△** — 선불 크레딧과 후불(arrears, 전월 사용분 익월 청구) 둘 다 존재. 후불이면 상한이 없다. 설정 가능한 spend limit은 문서에서 **확인 불가** | [빌링 문서](https://replicate.com/docs/topics/billing) |
| **fal.ai** | 확인 불가 | — |

**이 표에서 나오는 사실 하나**: 학생 프로젝트에서 "키가 새거나 루프가 돌아 청구서가 폭발"하는 시나리오에 대해, **선불 크레딧 provider(Stability·BFL)와 하드캡을 지원하는 OpenAI는 provider 쪽에서 상한이 걸리고, Google Cloud 계열은 예산 알림만으로는 안 걸린다.** 애플리케이션 카운터는 우리 코드가 정상 동작할 때만 유효하다.

### 7-3. 비동기 provider에서 추가로 생기는 것

BFL·fal·Replicate처럼 제출과 완료가 분리되면, 카운트를 **언제** 차감할지가 생긴다 — 제출 시점(선차감, 실패 시 환급)이냐 완료 시점(성공만 차감)이냐. 전자는 실패해도 한도를 먹고, 후자는 제출만 반복해 큐를 채울 수 있다. **이 트레이드오프는 문헌상 확립된 정답이 없어 근거 링크를 붙이지 못했다 — 설계 판단 사항으로 남긴다.**

---

## 8. 이 조사에서 확인하지 못한 것 (요약)

1. **한국에서의 실측 지연** — 전 provider. 직접 측정 필요.
2. **Vertex AI 서울 리전(asia-northeast3)의 이미지 모델 지원 여부** — 리전 표를 사람이 직접 열어봐야 함.
3. **provider별 생성 시간 실측치** — Artificial Analysis가 공개하나 차트에서 수치 추출 실패.
4. **OpenAI / BFL / fal / Bedrock의 신규 계정 무료 크레딧** — 공식 페이지에서 미확인.
5. **Amazon Nova Canvas 단가** — Bedrock 가격 페이지에서 미확인.
6. **Naver CLOVA / Kakao Karlo 이미지 생성 API 단가** — 공개 가격 페이지 미확인.
7. **Replicate의 설정형 spend limit 존재 여부** — 빌링 문서에서 미확인.
8. **fal.ai의 spend limit·리전 구성** — 미확인.
9. **BFL depth/canny deprecation 원문** — deprecation 사실은 확인했으나 원문 페이지 직접 접근에 실패해 2차 확인이다. 결정 전 재확인 권장.
10. **각 provider의 콘텐츠 정책·상업적 이용 조건·생성물 저작권 귀속** — 이번 조사 범위 밖. 서비스 공개 전 별도 확인 필요.
