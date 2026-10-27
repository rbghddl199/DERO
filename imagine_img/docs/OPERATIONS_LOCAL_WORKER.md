# 로컬 GPU 워커 — 무엇이 오가고, 무엇이 서비스를 깨뜨릴 수 있는가

로컬 GPU 컴퓨터에서 상상도를 생성하고, EC2(운영)와는 **Redis 큐 하나**로만 연결한다.
이 문서는 두 가지를 못 박는다.

1. 단계별로 **어떤 정보가 오가는가**
2. 무엇이 고장났을 때 **서비스가 어떻게 되는가** (그리고 무엇은 절대 못 깨뜨리는가)

읽는 순서: §1 흐름 → §3 사고 시나리오. §2 는 "워커가 무엇을 모르는가" 로, 걱정의 크기를
줄이는 부분이다.

## 로컬에서 띄우기 — `scripts/local_stack.py`

손으로 순서를 맞추지 않는다. 프로파일 하나로 묶었다 (2026-08-05):

```bash
python scripts/local_stack.py                  # capture — 인증 스텁 + 프론트 dev
python scripts/local_stack.py --profile worker # 워커 REST API (:8010)
python scripts/local_stack.py --profile queue  # Redis 큐 소비자 (app.cli worker)
python scripts/local_stack.py --profile full   # capture + worker
```

### 큐를 테스트할 때 — 붙을 Redis 를 코드가 검사한다

주소 검사만으로는 **부족하다.** 원격 Redis 에는 터널로만 붙으므로(설계 규칙) 운영이든
dev 든 워커가 보는 주소는 똑같이 `127.0.0.1` 이다. 그리고 이 기계에는 운영 터널이 열려
있을 수 있다 — 2026-08-05 실제로 열려 있었다:

```text
ssh -N -L 6379:127.0.0.1:6379 ubuntu@www.dero.life
```

그래서 붙기 전에 **증거로 판정**해 무엇에 붙는지 보여 준다
(`queue_smoke.assess_target`, 두 스크립트가 같은 규칙을 공유한다):

```text
'refresh:*' 키가 있다        백엔드 RefreshTokenService.KEY_PREFIX — 살아 있는 로그인 세션
1일 이상 떠 있다             임시 테스트 인스턴스가 아니다
명령 10만 건 이상 처리        누군가 쓰고 있다
```

`queue_smoke --push` 는 하나라도 걸리면 **exit 3 으로 거절**한다. `--profile queue`(워커 소비)는
**막지 않고 사실만 찍는다** — 로컬 워커가 운영 큐를 소비하는 것은 이 시스템의 전제다.
운영 터널에서 실측한 판정:

```text
- 'refresh:*' 키가 있다 — 살아 있는 로그인 세션이 든 Redis 다
- 6.0일째 떠 있다 (임시 인스턴스가 아니다)
- 명령 758,430건을 처리했다 (누군가 쓰고 있다)
```

dev 서버로 붙일 때는 **포트를 달리** 해서 운영 터널을 건드리지 않는다:

```bash
ssh -N -L 6380:127.0.0.1:6379 <user>@<dev-server>
REDIS_PORT=6380 python scripts/queue_smoke.py               # 읽기만
REDIS_PORT=6380 python scripts/local_stack.py --profile queue
```

`scripts/queue_smoke.py` 는 백엔드 없이 작업 하나를 넣고 결과를 읽어 **큐 계약**(키 이름·
필드 이름·결과 리스트)을 확인한다. 이 연결의 주된 실패 모드가 로직이 아니라 문자열
불일치라서다 — 키가 한 글자 다르면 워커는 조용히 못 받고 백엔드는 타임아웃으로 실패한다.

- **루프백 아닌 주소를 거절한다.** `REDIS_HOST`·`API_BASE_URL`·`DB_HOST`·`S3_ENDPOINT` 가
  루프백이 아니면 **기동하지 않고 exit 2** 다. 원격에는 터널로만 붙는 것이 설계이고
  (`config.py`: "이 값을 원격 주소로 바꾸는 것은 설계 위반이다"), 그 규칙을 코드로 강제한다.
  막으려는 것은 "운영에 붙는 것" 이 아니라 **터널을 우회해 직접 붙는 것**이다.
- **이미 떠 있는 것은 재사용**하고 그 사실을 찍는다. 포트 충돌로 죽지 않는다.
- `capture` 는 **모델을 올리지 않는다.** 8GB 카드에서 모델이 6.5GB 를 잡으므로,
  캡처만 하려는데 같이 올리면 다른 것을 못 한다.
- 인증 스텁은 **백엔드를 대신하지 않는다.** `/auth/refresh`·`/users/me` 두 개만 답해서
  `/simulator` 의 AuthGate 를 통과시킨다(`e2e/helpers/auth.ts` 와 같은 응답). 시뮬레이터
  자체는 로컬 GLB 라이브러리로 돌아 백엔드가 필요 없다.
- **Browser 패널이 보여야 캡처가 된다.** 숨으면 `document.visibilityState === 'hidden'`
  이 되어 rAF 가 멈추고 3D 에셋 로딩이 끝나지 않는다(FINDINGS §3.4). 스크립트가 대신할
  수 없어서 기동 뒤에 그 사실을 찍어 준다.

---

## 1. 단계별 흐름

```text
[브라우저 시뮬레이터]        [EC2 · Spring]              [Redis]        [로컬 GPU]
        │                          │                        │               │
 ① 배치 저장 ────────────────────▶ placement 3테이블         │               │
        │                          │                        │               │
 ② presign 요청 ─────────────────▶ 업로드 URL 3개            │               │
        │◀─────────────────────────┘                        │               │
 ③ 캡처 3장 PUT ──────────────▶ (S3 / 로컬 디스크)           │               │
        │                          │                        │               │
 ④ feed-entry ───────────────────▶ 검증 → PENDING → 큐 ────▶│               │
        │                          │                        │               │
        │                     ⑤ 큐 소비 → publish()          │               │
        │                          │                        │               │
        │                     ⑥ 작업 LPUSH ────────────────▶│──BRPOP──────▶ │
        │                          │  (여기서 최대 5분 대기)   │               │
        │                          │                        │        ⑦ 캡처 GET
        │                          │                        │        ⑧ 3장 생성
        │                          │                        │        ⑨ 결과 PUT
        │                     ⑪ 결과 BRPOP ◀───────────────│◀──RPUSH────── ⑩
        │                          │                        │               │
        │                     ⑫ generated_image 3행 + PUBLIC │               │
```

### ① 배치 저장 — `POST/PUT /api/v1/placements`

사용자가 시뮬레이터에서 배치를 저장한다. `placement` · `placement_desk` · `placed_item`
세 테이블에 들어간다. **AI 와 무관한 기존 기능이다.**

### ② 캡처 업로드 URL 발급 — `POST /api/v1/placements/{id}/captures/upload-url?count=3`

서버가 presigned PUT URL 3개를 준다. key 는 결정론적이다:
`placement-captures/{placementId}-{0|1|2}.png`.

**서버가 key 를 정한다.** 클라이언트가 정하지 않으므로 남의 자리에 못 쓴다.

### ③ 캡처 업로드 — 시뮬레이터가 오프스크린으로 3각도 렌더

`captureForAI` 가 사용자 화면과 **다른 렌더 설정**으로 찍는다(툰 외곽선 OFF, 블룸 OFF,
발광 감쇠, 구도 당김, 3D 배경 드레싱). 사용자가 보는 화면은 안 바뀐다.

찍은 3장을 ②의 URL 로 PUT 한다. 서버를 거치지 않고 스토리지로 직행한다.

### ④ 피드 등록 요청 — `PUT /api/v1/placements/{id}/feed-entry`

본문에 캡처 key 3개를 담는다. 서버가 검증하는 것:

- 본인 배치인가 (아니면 404)
- key 가 **그 배치의 규약**과 맞는가 (`PlacementCapture.keyFor`) — 남의 key 는 400
- 순서가 `display_order` 와 1:1 인가 — 어긋나면 400

통과하면 `placement_capture` 3행을 쓰고 `PENDING` 으로 바꾸고 Redis 큐에 넣는다.
응답은 **202 Accepted** — 이 시점에 아직 피드에 없다.

### ⑤ WAS 워커가 큐를 소비 — `ImagePublishWorker`

EC2 의 Spring 앱 안에 있는 스레드다. 로컬 GPU 와 무관하게 원래 있던 것이다.
스위퍼(`requeueStale`)도 같은 루프에서 돈다.

### ⑥ 생성 요청을 로컬 워커에 넘김 — `ImageGenerationPort`

여기가 **갈아끼우는 지점**이다. 구현이 셋이고 `app.image.generation.mode` 로 고른다.

| mode | 하는 일 | 로컬 GPU 필요 |
|---|---|---|
| `stub` (기본값) | 캡처 key 를 3행에 그대로 꽂는다 | 아니오 |
| `gms` | GMS 프록시(gpt-image-2) 에 HTTP | 아니오 |
| `local-worker` | Redis 큐에 넣고 결과를 기다린다 | **예** |

`local-worker` 가 Redis 에 넣는 것은 이것뿐이다:

```json
{
  "correlationId": "b7f3…",          // 새로 만든 UUID. placement id 가 아니다
  "screenshotUrls": ["https://…"],   // presigned GET (시간 제한)
  "uploadTargets": [                 // presigned PUT + 서버가 정한 key
    { "key": "generated-images/8b6f….png", "url": "https://…" }
  ],
  "deskTexture": "오크",
  "deskFrame": "T_FRAME",
  "productNames": ["모니터", "키보드", …],
  "roomLightOn": true,
  "timeOfDay": "DAY",
  "count": 3
}
```

그리고 `rightPop(resultKey, 5분)` 으로 **블로킹 대기**한다.

### ⑦~⑨ 로컬 GPU 가 하는 일

1. `screenshotUrls` 로 캡처를 내려받는다 (HTTPS 아웃바운드)
2. 3장을 생성한다 (장당 약 41초)
3. **다 만든 뒤에** `uploadTargets` 로 몰아서 올린다 — 중간에 깨지면 아무것도 안 올린다

### ⑩~⑪ 결과 회신

워커가 `image:generate:results:{correlationId}` 에 RPUSH 하고 TTL 10분을 건다.
돌려주는 것은 **서버가 준 key 그대로**다.

```json
{ "status": "OK", "keys": ["generated-images/8b6f….png", …] }
```

### ⑫ 서버가 검증하고 기록

- 3장인가 (아니면 실패)
- **key 가 서버가 발급한 것과 정확히 같은가** (아니면 실패)
- 배치가 아직 `PENDING` 인가 (아니면 조용히 버린다 — 중복 전달 방어)

통과하면 `generated_image` 3행을 **한 트랜잭션**으로 쓰고 `PUBLIC` 으로 전이한다.

---

## 2. 로컬 워커가 **모르는** 것

걱정의 크기를 정하는 부분이다. 워커의 설정에 있는 자격증명은 **Redis 비밀번호 하나**다.

| 없는 것 | 그래서 |
|---|---|
| DB 접속 정보 | 운영 DB 를 읽거나 쓸 수 없다 |
| S3 자격증명 | presigned URL 로 **지정된 key** 만 만질 수 있다 |
| 백엔드 API 토큰 | API 를 호출할 수 없다 |
| 사용자 정보 | userId·이메일·닉네임이 페이로드에 없다 |
| placement id | `correlationId` 는 새 UUID 다. 이미지 key 도 UUID 다 |
| 가격·견적 | 페이로드에 없다 |

워커가 Redis 에서 쓰는 명령은 셋뿐이다:

```text
BRPOP  image:generate:requests            (읽기)
RPUSH  image:generate:results:{uuid}      (자기 응답만)
EXPIRE image:generate:results:{uuid}      (TTL)
```

`KEYS` · `FLUSHDB` · `DEL` 을 쓰지 않는다. **이 Redis 에는 리프레시 토큰이 같이 산다**
(ADR-0005) — 그래서 접두사 밖을 건드리지 않는 것이 규칙이고, 코드가 그렇게 되어 있다.

### 네트워크 방향

```text
로컬 GPU  ──SSH 터널──▶  EC2 Redis (127.0.0.1 바인딩, 포트 안 열림)
로컬 GPU  ──HTTPS──────▶  스토리지 (presigned GET/PUT)
로컬 GPU  ◀───────────── (인바운드 없음)
```

**로컬 컴퓨터로 들어오는 연결이 없다.** 모든 연결을 로컬이 먼저 건다. 공유기 포트포워딩도,
고정 IP 도 필요 없다.

---

## 3. 고장났을 때 서비스는 어떻게 되는가

### 3.1 로컬 컴퓨터가 꺼져 있다 / 워커가 안 돌고 있다

```text
사용자가 피드 등록 → 202 → 5분 대기 → 응답 없음 → placement FAILED
```

- **서비스는 안 죽는다.** 다른 API·화면·로그인 전부 정상이다.
- 사용자에게는 그 배치가 `FAILED` 로 보인다. 같은 `PUT` 을 다시 부르면 재시도다.
- `generated_image` 행이 안 생기므로 **일일 한도를 깎지 않는다.**

**주의할 것**: `ImagePublishWorker` 는 소비 스레드가 **하나**다. 5분 블로킹 동안 다음
작업이 안 나간다. 세 명이 줄서면 15분이다. 워커가 꺼진 상태로 방치하면 **처리량이 0** 이
되지만, 그것이 다른 기능을 깨뜨리지는 않는다.

### 3.2 EC2 에 `mode=local-worker` 를 켰는데 로컬이 준비 안 됨

**이것이 유일하게 서비스에 보이는 회귀다.** 상상도 기능이 전부 `FAILED` 가 된다.

> **운영 규칙**: EC2 의 기본값은 `stub`(또는 `gms`) 로 둔다. `local-worker` 는 로컬
> 컴퓨터와 터널이 올라온 것을 확인한 **뒤에** 켠다. `@ConditionalOnProperty` 라서
> 부팅 시 결정되므로, 전환은 재기동을 뜻한다.

### 3.3 워커가 이상한 값을 돌려준다

| 경우 | 결과 |
|---|---|
| 장수가 3이 아니다 | 실패 처리, 행 안 씀 |
| 서버가 안 준 key 를 돌려준다 | **거부**, 행 안 씀 |
| JSON 이 깨졌다 | 실패 처리 |
| `status: FAILED` | 실패 처리 |

전부 `IMAGE_GENERATION_FAILED` 로 끝나고 `placement` 는 `FAILED` 다.
**DB 에 반쪽 데이터가 남는 경로가 없다** — 3행이 한 트랜잭션이다.

### 3.4 워커가 작업 중에 죽는다

스위퍼가 `processing-timeout` 뒤에 그 작업을 큐로 되돌린다(at-least-once).
다시 처리될 때 `publish()` 가 **아직 PENDING 인지** 먼저 본다.

- 사용자가 그 사이 내렸으면 → 조용히 버린다 (내린 배치가 되살아나지 않는다)
- 이미 성공했으면 → 조용히 버린다 (한도를 두 번 깎지 않는다)

### 3.5 SSH 터널이 끊긴다

워커가 죽지 않는다. `redis connection lost` 를 남기고 재연결을 반복한다.
가정용 네트워크·노트북 절전을 정상 상태로 보고 만든 동작이다.

진행 중이던 작업 하나는 실패한다(§3.4 로 회수). 큐에 쌓인 것은 그대로 남는다.

### 3.6 로컬에서 실수로 운영 Redis 를 만졌다면?

워커는 접두사 밖을 건드리지 않는다(§2). 다만 **사람이 `redis-cli` 로 접속해 있을 때**가
위험하다. `FLUSHDB` 는 리프레시 토큰을 지워 **전원 로그아웃**시킨다.

> **운영 규칙**: 터널로 붙은 `redis-cli` 에서 `FLUSHDB`·`FLUSHALL`·`KEYS *` 를 쓰지 않는다.
> 큐를 비워야 하면 `DEL image:generate:requests` 처럼 **키를 명시**한다.

---

## 4. 지금 로컬에서 검증된 것 / 아직 안 된 것

### 검증됨 (2026-08-02, 전부 로컬 스택)

로컬 Postgres(포트 55432) · 로컬 Redis · 로컬 백엔드 · 로컬 GPU 워커로 끝까지 돌렸다.
**운영 DB 에 접속하지 않았다.**

```text
presign 3개 → PUT 200x3 → feed-entry 202
워커: 3장 생성 → OK
DB: placement_capture 3행 / generated_image 3행(대표 1행) / placement PUBLIC
Redis: image:generate:* 잔여 키 0  (결과 키 정리 확인)
재업로드: 같은 배치에 다시 3장 → 유니크 안 깨짐, 행 수 유지, 옛 대표 강등
```

### 아직 안 된 것

- **운영 Redis 로 붙여본 적이 없다.** SSH 터널 경로는 코드 주석의 설계이고 실측이 아니다.
- **운영 스토리지(S3) presigned URL 로 주고받은 적이 없다.** 로컬은
  `storage.mode=local`(`./data/uploads`) 로 돌았다.
- ERD 변경(V5 `placement_capture`)이 운영에 적용되지 않았다. 로컬에서만 Flyway 가 돌았다.
- 캡처 중 브라우저 리사이즈 가드가 없다 — 창 크기를 바꾸면 캡처가 검게 나온다
  (`FINDINGS_2026-08-02.md` §3.2).

### 붙이기 전에 정할 것

1. **`mode` 전환 절차** — 누가, 언제, 어떻게 되돌리는가 (§3.2)
2. **터널 운영** — 상시인가 작업 시간만인가. 끊겼을 때 누가 알아채는가
3. **처리량** — 소비 스레드 1개 × 장당 41초 = 배치당 약 2분. 대기가 쌓일 때 어떻게 할지
4. **`REQUIREMENTS.md` 의 "제품이 추가됨 = 실패"** 범위 — 배경 연출이 걸린다
5. **조명 연출** — 확정 설정은 사용자의 낮/밤 선택과 무관하게 밤으로 찍는다

---

## 5. 한 줄 요약

> 로컬 GPU 는 **Redis 큐에서 작업을 꺼내 이미지를 만들고 정해진 자리에 올려놓는 일**만
> 한다. DB·API·자격증명을 갖지 않고, 인바운드 연결도 없다. 로컬이 꺼져 있으면 상상도가
> `FAILED` 로 남을 뿐 다른 기능은 영향받지 않는다.
>
> 서비스에 보이는 위험은 **하나**다 — EC2 에 `mode=local-worker` 를 켠 상태로 로컬을
> 안 띄우면 상상도 기능 전체가 실패한다. 그래서 기본값을 `stub` 으로 두고 로컬 확인 뒤에
> 켠다.
