# ADR-0020. 관측 스택은 Prometheus+Grafana(지표) / Filebeat+ES+Kibana(로그) — Logstash·Kafka 없이

## 상태

**확정** — 2026-08-03, 승인 박동규.
배선 정본은 `docs/context/observability.md`. 검색 스택(ES 자체의 채택 근거·인덱스 설계)은 [ADR-0019](0019-search-elasticsearch-nori.md) 소관이고, 이 ADR은 **그 위에 관측을 얹는 방법**만 정한다.

## 맥락

`docs/context/architecture-map.md`의 "아직 못 박은 것"에 **"관측·로깅 최소선 — 4주에 감당 가능한 선이 어디까지인지"**가 열려 있다. **이 ADR이 그 항목을 졸업시킨다.**

지금 관측이라 부를 만한 것은 하나뿐이다 — `/api/actuator/health`. 장애가 나면 `docker logs`를 사람이 눈으로 읽는다.

**실측 (2026-08-03, EC2에서 직접 측정)**

- **EC2 1대**: 총 15GiB RAM(사용 3.6GiB, **available 12GiB**), **4 vCPU**, 디스크 276GB 여유, **swap 0**.
- 그 한 대에 **nginx + Jenkins(호스트 java) + Next.js + Spring Boot + postgres18 + redis8**이 전부 올라가 있다.
- compose는 **2계층**이다 — `compose.yaml`(Jenkins가 매 배포마다) / `compose.data.yaml`(사람이 최초 1회 수동).
  `docs/context/deployment.md` §5에 *"Jenkins는 `compose.data.yaml`을 절대 적용하지 않는다"* 함정이 이미 기록돼 있다.
- **Spring Boot 4.1.0.** `spring-boot-starter-actuator`가 **이미 의존성에 있다**(`build.gradle:24`). Micrometer Prometheus 레지스트리는 없다.
- `management.endpoints.web.base-path: /api/actuator`이고 nginx가 `/api/`를 프록시해서
  **`https://www.dero.life/api/actuator/health`가 인터넷에서 200**이다.
  `env`·`beans`·`metrics`·`heapdump`·`prometheus`는 전부 404 — 기본 노출값이 안전하게 잡혀 있다.
- **로그**: `logback.xml`이 없고 `logging.level`만 설정돼 있다(root: info). **구조화 로깅 미적용.**
- **Spring Boot 4.1은 구조화 로깅이 내장**이다 — `logging.structured.format.console: ecs` 두 줄이면 ECS(Elastic Common Schema) JSON을 뱉는다. `logstash-logback-encoder` 의존성이 **필요 없다.**
- `deployment.md` 포트 표에 *"3000·8081 열림 — nginx·TLS 우회. 보안 그룹에서 닫을 것"*이 **미결로 남아 있다.**
  (2026-08-06 해소 — 닫은 방법은 보안 그룹이 아니라 `compose.yaml`의 `127.0.0.1` 바인딩이다. 방화벽은 ufw이고 **Docker publish는 ufw를 우회한다**: `deployment.md` §7 · ADR-0026 결정 3.)

즉 제약은 셋이다 — **available 12GiB / 4 vCPU / swap 0**. 그리고 로그 원본은 이미 JSON으로 만들 수 있는 상태다.

---

## 결정

```
[Spring Boot]  ECS JSON → stdout ──► docker json-file
                    │                      │
                    │                 [Filebeat]  파일 오프셋 = 버퍼
                    │                      ▼
                    │                 [Elasticsearch]  app-logs-*(ILM 30일)
                    │                                  search-events-*(ILM 1년)
                    │                      ▼
                    │                 [Kibana]  로그 탐색 + Dev Tools   127.0.0.1 + SSH 터널
                    ▼
              /actuator/prometheus ◄── [Prometheus] ──► [Grafana]  서브도메인 + 로그인
                                        127.0.0.1                   ← 유일한 외부 노출
```

### 1. 지표는 Prometheus + Grafana, 로그는 Filebeat + ES + Kibana — 역할을 가른다

**Kibana = 로그 탐색 + ES 운영(Dev Tools). Grafana = 지표 대시보드.**

**Grafana에 로그 대시보드를 만들지 않는다.** Grafana는 ES를 데이터소스로 붙일 수 있어 마음만 먹으면 역할이 겹친다. 규칙을 명문화하는 이유는 하나다 — **안 가르면 대시보드가 둘로 흩어져 "어디를 봐야 하나"가 매번 헷갈린다.** 장애 중에 도구를 고르고 있으면 안 된다.

**Kibana를 빼지 않는 이유는 대시보드가 아니라 개발 도구다.** edge n-gram·Nori analyzer를 튜닝하려면 `_analyze`를 수십 번 때려야 하는데, Dev Tools 없이 curl로 하는 건 고문이다. Grafana Explore의 ES 지원은 Kibana Discover의 필드 탐색을 못 따라온다.

**메모리 예산** (available 12G에 대해):

| 프로세스 | 몫 |
|---|---|
| Elasticsearch (heap 2G) | ~3G |
| Kibana | ~1G |
| Prometheus | ~0.5G |
| Grafana | ~0.3G |
| Filebeat | ~0.2G |
| **합계** | **~5G** |

기존 사용 3.6G와 합쳐 **8.6G** — 12G 안에 들어간다.

### 2. Logstash를 넣지 않는다 — Filebeat → ES 직결

**파싱 일거리가 없다.** Spring Boot 4.1 내장 ECS JSON이라 grok으로 뜯을 문자열이 애초에 없고, ECS는 Elastic 자기네 스키마라 ES·Kibana가 필드를 그대로 알아먹는다. Logstash를 넣으면 **JSON을 파싱해서 그대로 다시 내보내는 프로세스**가 하나 생긴다.

**그리고 4 vCPU가 진짜 제약이다.** Jenkins 빌드(Gradle + Next)가 이미 4코어를 다 문다. Logstash는 JVM + 파이프라인 워커로 상시 CPU를 먹는 프로세스라, 배포 중에 로그 수집이 같이 굶는다.

변환이 필요해지면 **ES ingest pipeline**을 쓰되 **얇게 유지한다.** 두꺼워지면 나중에 Logstash로 옮길 때 이사가 아니라 **재작성**이 된다. 전환은 Filebeat의 `output.elasticsearch` → `output.logstash` **한 블록**이어야 한다.

**앱 → Logstash TCP 직송도 부결.** Logstash가 죽으면 로그가 유실되거나 앱이 블록된다. 파일을 거치지 않으므로 **버퍼가 없다** — 아래 결정 3이 기대는 성질이 통째로 사라진다.

### 3. Kafka를 로그 버퍼로 넣지 않는다

ELK 표준 배치 `Filebeat → Kafka → Logstash → ES`에서 Kafka의 역할은 **버퍼**다. 그 버퍼가 필요한 조건은 셋인데 **어느 것도 해당 없다** — ⑴ ES가 못 받아낼 만큼 몰림 ⑵ 다중 소비자 ⑶ 재생(replay).

**Filebeat 자체가 이미 버퍼다.** 파일 오프셋 기반이라 ES가 죽으면 안 읽고 멈추고, 살아나면 이어 읽는다. **끊김이 유실이 아니라 지연이 된다** — [ADR-0015](0015-placement-upload-async-pipeline.md) 결정 2가 Redis 큐를 고른 논리 그대로다.

**규모 실측 추정**: 하루 10만 요청 = **초당 1.2건**, JSON 1KB면 하루 100MB. ES 단일 노드는 초당 수천 건을 먹는다. **Kafka 임계까지 3~4자릿수 남았다.**

설계는 미래지향, 런타임은 YAGNI — `Filebeat → [버퍼] → ES` **모양을 지금부터 지키고**, 버퍼는 Filebeat 내장 디스크 큐로 둔다. 나중에 Kafka를 끼우면 바뀌는 곳은 `output` 블록 한 곳이다.

### 4. 노출은 Grafana만 — 나머지는 `127.0.0.1` + SSH 터널

- **Grafana만** 서브도메인 + 인증으로 외부 노출한다(전시·공유 목적). Grafana 자체 로그인을 쓴다.
- **Kibana는 노출하지 않는다.** 로그에는 사용자 id·요청 본문 조각이 섞이고, **소셜 로그인 서비스라 OAuth 흐름 로그에 토큰 조각이 섞일 수 있다.** 지표는 새어도 손해가 작지만 **로그가 새면 사고**다.
- **ES·Prometheus는 절대 외부 바인딩 금지** — `127.0.0.1:9200`. 인증 없는 ES 9200이 인터넷에 열리면 **누구나 인덱스를 지울 수 있다.** 랜섬 스캐너 상시 대상 포트다.
- **Grafana 기본 포트 3000은 frontend와 충돌한다.** 반드시 옮긴다.
- **actuator 함정**: `management.endpoints.web.exposure.include`에 `prometheus`를 추가하면 base-path가 `/api/actuator`이고 nginx가 `/api/`를 프록시하므로 **`https://www.dero.life/api/actuator/prometheus`가 그대로 공개된다** — JVM 상태·엔드포인트별 호출량·DB 커넥션 풀이 전부 딸려 나간다.
  → **nginx에 `location = /api/actuator/prometheus { deny all; }`**. Prometheus는 도커 네트워크로 `backend:8080`을 직접 긁으므로 **영향 없다.**
- **로그에 토큰·비밀번호·이메일 전문이 들어가지 않게 마스킹한다.** ES에 영구 보관되면 **실수 한 번이 영구 유출**이 된다.

### 5. compose 3계층 — `compose.observability.yaml`

`name: dero-observability`. 볼륨 3개(`es-data`·`prometheus-data`·`grafana-data`), `dero-data` 네트워크에 **external로 붙는다**(Prometheus가 `backend:8080`을, Filebeat이 `elasticsearch:9200`을 이름으로 찾아야 한다).

| 대안 | 판정 | 이유 |
|---|---|---|
| `compose.yaml`(Jenkins)에 넣기 | 부결 | **매 배포마다 ES가 재생성돼 검색이 30초~1분 죽는다.** 앱 생명주기와 ES 생명주기는 무관해야 한다 |
| `compose.data.yaml`에 합치기 | 부결 | postgres·redis는 **정본 데이터**고 거의 안 만진다. ES·Grafana는 **파생 데이터**고 자주 재시작한다(매핑 실험·ILM·대시보드). 같은 파일이면 `up -d` 한 번이 변경 감지로 **postgres 컨테이너를 재생성할 수 있다** |

**대가**: `deployment.md` §5의 *"Jenkins가 안 건드리는 수동 계층"* 함정이 **파일 2개로 늘어난다.** 그 문서를 갱신하는 것이 이 결정의 일부다.

Nori 커스텀 ES 이미지도 이 파일에서 `build:`로 짓는다 — **Jenkins가 안 짓는다.** 손으로 `docker compose -f compose.observability.yaml build`.

**호스트 선행 조건: `vm.max_map_count=262144`.** 안 올리면 **ES 컨테이너가 부팅부터 죽는다.** `sysctl -w` + `/etc/sysctl.conf` 영구화. 그리고 **swap이 0이라 OOM 시 즉시 kill**이므로 `mem_limit`가 필수다.

### 6. 인덱스 수명 — 로그는 데이터 스트림 + ILM 30일, 검색 이벤트는 1년

- **앱 로그 `app-logs-*`**: 데이터 스트림 + ILM, hot 7일 → **30일 후 삭제**(약 3GB). ILM은 basic 라이선스에서 무료다.
- **ILM 없이 단일 인덱스로 가면 나중에 못 지운다.** `delete_by_query`는 비싸고 디스크를 즉시 안 돌려준다. **인덱스를 통째로 삭제하는 것만 싸므로 처음부터 날짜 분할이 필요하다.**
- **검색어 이벤트 `search-events-*`**: **별도 데이터 스트림, ILM 1년.** 앱 로그와 섞지 않는 이유는 **보존 기간이 다르기 때문**이다 — 분석 데이터는 오래 봐야 값이 난다.
- 검색 인덱스 `products`의 별칭 전략은 **[ADR-0019](0019-search-elasticsearch-nori.md) 결정 5 소관**이다. 여기서는 참조만 한다.

### 7. 사용자 행동 이벤트는 검색어 하나만 수집한다

서버 `?q=` 핸들러에서 **검색어 · 결과 건수 · userId(내부 숫자 id, 비로그인 null) · 타임스탬프**를 남긴다. **이메일·토큰·IP 금지.**

라우팅은 **전용 logger 이름**(`...search.SearchEventLogger`)으로 하고, ingest pipeline이 logger 이름을 보고 스트림을 가른다 — **앱 코드는 그냥 로그를 찍는다.** 수집 경로를 앱이 알 필요가 없다.

값은 둘이고 둘 다 바로 쓴다:

- **결과 0건 검색어** = **카탈로그 구멍 목록.**
- **인기 검색어** = **completion suggester 가중치 입력.**

Kibana 대시보드 2개로 끝난다.

**전면 이벤트 수집(제품 클릭·상세 조회·배치 저장)은 부결.** 이벤트 스키마 설계(GLOSSARY 등재 대상) · 수집 API · 프론트 계측 · 개인정보 검토가 줄줄이 붙는 **별건 프로젝트**다.

### 8. 이사 경로 — 노드 분리 시 바뀌는 것은 두 곳뿐

교육 과정 종료 후 AWS 노드 분리(RDS·ElastiCache·ALB)가 예정돼 있다. 관측 스택을 **생명주기로 갈라 뒀으므로 그 경계가 그대로 이사 단위**가 된다.

바뀌는 것:

1. **Filebeat 수집 방식** — 도커 소켓 하나 → 노드별 DaemonSet / ECS FireLens. **`output` 블록은 그대로다.**
2. **Prometheus 타깃 발견** — `static_configs` → EC2/ECS service discovery.

나머지(ECS JSON 포맷·인덱스 템플릿·ILM·대시보드·ingest pipeline)는 **그대로 간다.**

ES 목적지는 **Elastic Cloud on AWS**다([ADR-0019](0019-search-elasticsearch-nori.md) 결정 7) — **OpenSearch로 가면 Filebeat이 접속을 거부한다.**

### 9. 지표 최소 세트는 "이 서버가 죽는 방식"으로 고른다 — 12패널

**추가 2026-08-05.** 결정 1이 "지표는 Prometheus+Grafana"만 정했고 **어떤 지표를 볼지는 결정으로 없었다.**
그래서 DERO-383이 만든 6패널(요청량·5xx·평균 응답시간·힙·CPU·HikariCP)은 근거가 어디에도 없는
상태였다. 그 6개는 **HTTP 교과서 세트**이고 웹앱 일반론으로는 맞지만, 이 서버가 실제로 죽는 방식 셋을
못 본다. 여기서 기준을 못 박는다 — **자동계측으로 이미 존재하는 지표 중, 이 배치에서 장애를 설명하는
것만 올린다.**

| 추가 패널 | 지표 | 이것 없이는 못 보는 것 |
|---|---|---|
| 생존 | `up` | 패널이 빈 게 **앱이 죽은 것인지 수집이 끊긴 것인지** — Prometheus가 붙이는 값이라 앱이 못 뱉어도 나온다 |
| 응답시간 p95·p99 | `http_server_requests_seconds{quantile}` | **long-tail.** GLB·상상도 업로드는 꼬리가 길어 p95가 3초여도 평균은 400ms로 정상처럼 보인다 |
| GC 일시정지 | `jvm_gc_pause_seconds` | 힙 톱니만 보면 **GC 스톨**이 안 보인다 |
| 힙 밖 메모리 | `jvm_memory_used_bytes{area="nonheap"}` · `jvm_buffer_memory_used_bytes` | **OOM kill의 원인.** swap 0 + `mem_limit`라 죽는 기준은 힙이 아니라 **RSS**다 — 힙 패널만 보면 "여유 있었는데 왜 죽었지"로 끝난다. direct buffer를 같이 보는 이유는 S3 SDK가 그 영역을 쓰기 때문이다 |
| 에러 로그 발생률 | `logback_events_total{level}` | **요청 밖에서 죽는 실패.** 비동기 이미지 파이프라인(ADR-0015 Redis 큐) 워커가 터져도 5xx도 지연도 안 움직인다 — HTTP 지표에 흔적이 아예 없다 |
| 커넥션 획득 대기·타임아웃 | `hikaricp_connections_acquire_seconds` · `hikaricp_connections_timeout_total` | `pending`은 순간값이라 스크레이프 사이에 지나간 포화를 놓친다. **타임아웃은 카운터라 한 건도 안 사라진다** |

**p95는 `percentiles`(클라이언트 사이드)로 켜고 `percentiles-histogram`은 켜지 않는다.**
인스턴스가 **1대**라 서버 사이드 재집계가 필요 없고, 히스토그램은 uri별 시계열이 버킷 개수만큼
곱해진다. 대가는 **이 값이 재집계 불가**라는 것 — 여러 uri의 p95를 합산하면 틀린 수가 나오므로
패널은 `max by (uri)`로만 읽는다. 인스턴스가 2대가 되는 날 히스토그램으로 바꾼다.

**Tomcat 스레드 풀은 넣지 않는다.** ①`tomcat_*`은 실제 서버가 떠 있어야 나와서 MockMvc 테스트로
지킬 수 없고 `server.tomcat.mbeanregistry.enabled`까지 켜야 한다 ②실측 규모가 **초당 1.2건**인데 기본
max 200 스레드라 포화가 현실적 실패 모드가 아니다(풀이 10인 HikariCP와 다르다). **검증 비용이 값보다
크다.** 초당 요청이 두 자릿수로 올라오면 그때 넣는다.

**큐 깊이 게이지도 이번에는 넣지 않는다** — 비동기 파이프라인의 유일한 건강 지표라 값은 크지만
자동계측이 아니라 **앱 코드 변경**(`ImagePublishQueue`에 게이지 등록 + 폴링 주기 결정)이 붙는다.
별건이다. 그동안은 위 "에러 로그 발생률"이 워커 실패의 유일한 신호다.

**부결**: node_exporter(호스트 디스크·메모리 — ES가 들어오면 디스크가 진짜 위험하므로 **384와 같이**
판단한다) · postgres_exporter · nginx 지표 · Redis 지표(Lettuce는 자동계측이 아니라 수동 배선이
필요하다).

**알림(alert)은 여전히 결정이 없다.** 대시보드는 사람이 볼 때만 보이는 도구고, 지금 아무도 상시로
보지 않는다 — 즉 이 12패널은 **사후 분석 도구**다. 그걸 알고 쓴다. 알림 채널·임계값은 별도 결정이다.

---

## 대안과 버린 이유

| 대안 | 판정 | 이유 |
|---|---|---|
| **Sentry만** (디버깅 전용) | 부결 | 30분이면 붙지만 로그 축적·검색어 분석·지표가 안 된다. **목적에 데이터 수집이 포함**돼 있다 |
| **Logstash 포함 정통 ELK** | 부결 | 결정 2 — 파싱할 게 없고 4 vCPU를 Jenkins와 다툰다 |
| **앱 → Logstash TCP 직송** | 부결 | 결정 2 — 파일 버퍼가 사라져 유실 아니면 블록이다 |
| **Kafka 버퍼** | 부결 | 결정 3 — Filebeat이 이미 버퍼고, 임계까지 3~4자릿수 남았다 |
| **Grafana 단일 도구**(ES 데이터소스) | 부결 | 결정 1 — Discover의 필드 탐색을 못 따라온다 |
| **Kibana만**(Metricbeat으로 지표) | 부결 | Prometheus보다 무겁고 쿼리가 불편하다 |
| **전부 외부 노출 / 전부 폐쇄** | 부결 | 결정 4 — **로그와 지표는 민감도가 다르다.** 한 규칙으로 묶으면 한쪽이 틀린다 |
| **`compose.yaml`·`compose.data.yaml`에 합침** | 부결 | 결정 5 — 배포마다 ES 재생성 / postgres 재생성 위험 |

## 파급

| 영역 | 내용 |
|---|---|
| 문서 | **`docs/context/observability.md`가 배선 정본**(신규). 루트 `CLAUDE.md` 라우팅 표에 등재된다 |
| 문서 | `docs/context/deployment.md` — **compose 3계층** + 수동 적용 함정(§5) + 포트 표 갱신 |
| 문서 | `docs/context/architecture-map.md` — **"관측·로깅 최소선" 미결 항목 졸업** |
| 백엔드 | `micrometer-registry-prometheus` 의존성 · `management.endpoints.web.exposure.include`에 `prometheus` · `management.metrics.distribution.percentiles`(결정 9) · `logging.structured.format.console: ecs` · `SearchEventLogger` |
| 대시보드 | `observability/grafana/dashboards/dero-backend.json` **12패널**(결정 9). 패널이 참조하는 지표명은 `PrometheusEndpointTest`가 문자열로 지킨다 — Grafana는 없는 지표를 에러로 만들지 않고 **조용히 빈 패널**이 되므로 기계 게이트가 필요하다 |
| nginx | `location = /api/actuator/prometheus { deny all; }` + Grafana 서브도메인 |
| 인프라 | `compose.observability.yaml`(신규, **수동 적용**) · Nori 커스텀 ES 이미지 수동 `build` · 호스트 `vm.max_map_count=262144` 영구화 · 전 컨테이너 `mem_limit`(swap 0) |
| 보안 | ES·Prometheus·Kibana `127.0.0.1` 바인딩 · Grafana 포트를 3000에서 이동 · 로그 마스킹(토큰·비밀번호·이메일) |
