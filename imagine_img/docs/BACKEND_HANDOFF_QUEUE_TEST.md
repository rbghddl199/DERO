# 백엔드 쪽 작업 지시 — 로컬 GPU 워커와 큐로 잇기

이 문서는 **백엔드(dero-api)를 로컬로 띄운 컴퓨터**에서 할 일이다. 이미지 생성 워커는
다른 컴퓨터(RTX 4070 8GB)에서 돌고 있고, 둘은 **Redis 큐 하나로만** 만난다.

읽는 순서: §1 지금 상태 → §2 왜 안 이어지는가 → §3 해야 할 일 → §4 확인 방법.
§5 는 **하면 안 되는 것**이다.

---

## 1. 지금 상태

두 컴퓨터가 같은 서버(`www.dero.life`)에 SSH 터널을 열고 있는데 **다른 서비스**를 당긴다.

```text
GPU 컴퓨터   -L 6379:127.0.0.1:6379    → 운영 Redis
백엔드 컴퓨터 -L 55432:127.0.0.1:5432   → 운영 Postgres
```

그리고 백엔드는 Redis 를 자기 로컬 컨테이너로 보고 있다:

```yaml
# application-local.yaml
spring:
  data:
    redis:
      host: localhost   # 이 컴퓨터의 compose 컨테이너
      port: 6379
```

**결과: 큐가 두 개다.** 백엔드는 자기 로컬 Redis 에 작업을 넣고, GPU 워커는 운영 Redis 를
보고 있어서 서로 만나지 않는다.

---

## 2. 왜 이어지지 않는가 — 세 가지

### ① Redis 가 서로 다르다

위 §1.

### ② `mode` 가 `local-worker` 가 아니면 큐에 아무것도 안 들어간다

```text
app.image.generation.mode   기본값 stub
```

`stub` 이면 캡처 key 를 그대로 3행에 꽂고 끝난다. **큐에 넣지 않는다.** 에러도 안 나서
"워커는 떠 있는데 아무 일도 안 일어난다" 로만 보인다. 이 연결의 가장 흔한 원인이다.

구현은 `infra/ImageGenerationProperties.java`, 고르는 곳은
`infra/ImageGenerationPort.java` 의 세 구현체(`stub` / `gms` / `local-worker`).

### ③ 요청 큐 키가 **상수로 박혀 있다**

```java
// infra/LocalWorkerImageGeneration.java:50
private static final String REQUEST_KEY = "image:generate:requests";
private static final String RESULT_KEY_PREFIX = "image:generate:results:";
```

설정으로 바꿀 수 없다. 그래서 지금은 **테스트가 실제 사용자 요청과 같은 큐를 쓴다.**
그러면 안 되는 이유가 §5 에 있다.

---

## 3. 해야 할 일

### 3-1. 큐 키를 설정값으로 뺀다 (필수)

`REQUEST_KEY` · `RESULT_KEY_PREFIX` 를 상수에서 프로퍼티로 옮긴다.

```text
infra/ImageGenerationProperties.java   LocalWorker 레코드에 필드 두 개 추가
infra/LocalWorkerImageGeneration.java  상수 대신 그 값을 쓰도록
```

- 기본값은 **지금 문자열 그대로** 두어야 한다 (`image:generate:requests`,
  `image:generate:results:`). 기본값이 바뀌면 운영이 조용히 끊긴다.
- 워커 쪽은 이미 설정으로 바꿀 수 있다 (`REDIS_REQUEST_KEY` 환경변수). 양쪽 문자열이
  **정확히 같아야** 한다 — 한 글자 다르면 워커는 조용히 아무것도 못 받고 백엔드는
  5분 타임아웃으로 실패한다. **양쪽 다 에러가 안 난다.**

테스트할 때 쓸 값:

```properties
app.image.generation.local-worker.request-key=image:generate:requests:local-test
app.image.generation.local-worker.result-key-prefix=image:generate:results:
```

전용 키를 쓰면 운영 Redis 라도 **아무도 그 키를 BRPOP 하지 않는다** — 실제 사용자 요청과
섞이지 않는다.

### 3-2. Redis 터널을 하나 더 연다

DB 터널과 **별도**다. 로컬 Redis 컨테이너가 6379 를 쓰고 있으면 컨테이너를 끄거나 터널
포트를 달리한다.

```bash
ssh -N -L 6379:127.0.0.1:6379 ubuntu@www.dero.life -i <SSH_KEY>.pem
```

### 3-3. 설정을 맞춘다

```properties
# .env.local (Spring 프로퍼티 키다. 셸 스타일이 아니다)
spring.data.redis.host=localhost
spring.data.redis.port=6379
app.image.generation.mode=local-worker
app.image.generation.local-worker.request-key=image:generate:requests:local-test
```

### 3-4. (권장) 제품 카테고리를 큐에 싣는다

지금 큐 메시지에는 제품 **이름**만 실린다. 그런데 그것이 한국어라 **SDXL 의 CLIP 이 못
읽는다** — 실측:

```text
모니터   6 tok  ['ëª','¨','ëĭĪ','í','Ħ','°']   뜻이 없다
monitor  1 tok  ['monitor']
```

뜻은 안 실리고 토큰만 5~6배 먹는다. 워커는 **카테고리 이름**을 받으면 표로 영어 명사로
옮긴다(`app/generation/dero_categories.py`, 40개). 카테고리는 사람이 정한 유한한 집합이라
이름 추측보다 확실하다.

```text
infra/ImageGenerationRequest.java          record 에 List<String> productCategories 추가
infra/LocalWorkerImageGeneration.java      WorkerRequest(JSON) 에 같은 필드
image/service/GeneratedImageService.java   placed_item → product → category.name 조인
```

- 필드 이름은 **`productCategories`** 여야 한다. 워커가 그 alias 로 읽는다.
- 값은 카테고리 트리의 **중간 계층 이름**이다 (`"모니터암"`, `"의자"`, `"타공판"`).
- **ERD 변경 없음.** `category` 테이블과 `product.category_id` 가 `V1__baseline.sql` 에
  이미 있다. 새 관계도 마이그레이션도 필요 없다.
- 워커는 **없어도 돈다** (기본값 빈 목록). 양쪽이 동시에 배포될 수 없으므로 받는 쪽을
  먼저 준비해 뒀다.

---

## 4. 확인 방법

### 큐 계약이 맞는지 — 백엔드 없이

GPU 컴퓨터에서 이걸 돌리면 **아무것도 쓰지 않고** 상태만 본다:

```bash
REDIS_PORT=<터널포트> python scripts/queue_smoke.py
```

- `verdict 테스트용으로 보인다` → dev Redis
- `verdict 운영/공용으로 보인다` + `refresh:*` 키 → **운영 Redis 다.** 터널을 확인할 것

### 메시지 모양

워커가 기대하는 것(정본은 `LocalWorkerImageGeneration.WorkerRequest`):

```json
{
  "correlationId": "b7f3…",
  "screenshotUrls": ["https://…"],
  "uploadTargets": [{ "key": "generated-images/8b6f….png", "url": "https://…" }],
  "deskTexture": "화이트",
  "deskFrame": "T_FRAME",
  "productNames": ["모니터", "키보드"],
  "productCategories": ["모니터", "키보드"],
  "roomLightOn": true,
  "timeOfDay": "DAY",
  "count": 3
}
```

응답은 `image:generate:results:{correlationId}` 에 RPUSH 된다:

```json
{ "status": "OK", "keys": ["generated-images/8b6f….png"] }
```

**key 는 백엔드가 준 것을 그대로 돌려준다.** 다른 key 를 주면 백엔드가 거부한다(그 객체가
아무도 안 지우는 고아가 되고 DB 에는 없는 파일을 가리키는 행이 남기 때문).

### 이어졌는지

백엔드 로그에 `로컬 워커 응답 없음: correlationId=…, timeout=…` 이 뜨면 **키가 다르거나
워커가 안 돌고 있다.** 워커 쪽 로그에 `waiting on <키>` 가 찍히므로 그 문자열을 비교한다.

---

## 5. 하면 안 되는 것

### 운영 `generated_image` 에 행을 만들지 말 것

`application-local.yaml` 이 DB 를 `localhost:55432` 로 본다. 그 포트는 이 저장소가 스스로
**"원격(운영) 터널용"** 으로 정의한 것이다:

```text
backend/dero-api/CLAUDE.md:22
  터널 포트는 5432를 피한다 — 로컬 dero-data-postgres-1이 이미 127.0.0.1:5432를 쓴다.
  -L 55432:127.0.0.1:5432 처럼 다른 포트로 연다.
```

즉 **55432 터널을 열어 둔 채로 생성을 끝까지 돌리면 운영 DB 에 행이 남는다.**
`generated_image` 는 3행이 한 트랜잭션이고 **일일 생성 한도의 근거이며 삭제 금지**다.
사후 정리로 풀 수 없다.

끝까지 돌려 볼 거면 먼저 로컬 컨테이너로 돌린다:

```bash
docker compose -f compose.data.yaml up -d          # 레포 루트. postgres 는 5432 다
# .env.local 에서 55432 → 5432
```

### 공용 요청 큐에 테스트 작업을 넣지 말 것

`image:generate:requests` 는 실제 사용자 요청이 흐르는 큐다. 여기에 가짜 작업을 넣으면
다른 워커(팀원 GPU)가 집어가 헛돈다. §3-1 의 전용 키를 쓴다.

### `REDIS_HOST` 를 원격 주소로 바꾸지 말 것

워커 쪽 규칙이다(`app/core/config.py`):

> 이 값을 원격 주소로 바꾸는 것은 설계 위반이다.

그 Redis 에는 **리프레시 토큰이 같이 산다**(ADR-0005). 원격에는 터널로만 붙는다.
워커의 런처(`scripts/local_stack.py`)가 루프백이 아닌 주소를 받으면 **exit 2 로 거절**한다.

---

## 6. 요약 — 체크리스트

```text
[ ] REQUEST_KEY / RESULT_KEY_PREFIX 를 프로퍼티로 뺀다 (기본값은 현재 문자열 유지)
[ ] Redis 터널을 연다 (DB 터널과 별도)
[ ] spring.data.redis.port 를 터널 포트로
[ ] app.image.generation.mode = local-worker
[ ] request-key = image:generate:requests:local-test  ← 전용 키
[ ] (권장) productCategories 필드 추가 3곳
[ ] DB 를 로컬 컨테이너(5432)로 돌릴지 결정 — 운영에 행을 남기지 않으려면 필수
```

GPU 쪽은 준비됐다: 워커가 `REDIS_REQUEST_KEY` 로 키를 맞출 수 있고,
`LOCAL_ONLY_RESULTS=true` 면 업로드 없이 로컬에만 남긴다(그 모드는 **공용 키에서 기동을
거부한다** — 실제 요청을 삼키고 답을 주지 않으면 그 요청이 타임아웃으로 실패하기 때문).
