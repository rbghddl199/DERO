# 검색·관측 스택 — 배선·운영 정본

ES·Kibana·Prometheus·Grafana·Filebeat을 **띄우고 · 노출하고 · 점검할 때** 읽는 문서.

**근거는 여기 없다.** 왜 이 조합인지는 ADR에 있다 — 검색 스택은
[ADR-0019](../adr/0019-search-elasticsearch-nori.md), 관측 스택은
[ADR-0020](../adr/0020-observability-stack.md). 여기는 `deployment.md`와 같은 성격의 문서다:
**측정된 사실과 실행 절차만** 적고, 바뀌면 이 문서를 고친다. 앱 계층 배선은 `deployment.md`.

---

## 1. 전체 흐름

```
브라우저 ── Grafana 서브도메인만 (유일한 외부 노출)
        │
        ▼
┌────────────────────────────────────────────────────────────────────────┐
│ EC2  203.0.113.10                                                     │
│                                                                        │
│  :443 nginx ─┬─ /api/  → 127.0.0.1:8081 → backend                      │
│              ├─ = /api/actuator/prometheus  → deny all   ⛔            │
│              └─ grafana.<도메인> → 127.0.0.1:3001                       │
│                                                                        │
│  ┌ dero (Jenkins가 매 배포) ┐   ┌ dero-data (수동) ┐                     │
│  │  frontend    backend     │   │ postgres  redis  │                   │
│  └──────────────┬───────────┘   └──────────────────┘                   │
│                 │  네트워크 dero-data (external, 서비스명이 별칭)         │
│  ┌──────────────┴──── dero-observability (수동) ─────────────────────┐  │
│  │                                                                   │  │
│  │  [Prometheus] ──scrape──► backend:8080/api/actuator/prometheus    │  │
│  │       ▲ 127.0.0.1:9090          (도커 네트워크 — nginx를 안 거친다) │  │
│  │  [Grafana] 127.0.0.1:3001                                         │  │
│  │                                                                   │  │
│  │  /var/lib/docker/containers/*.log                                 │  │
│  │       └──► [Filebeat] ──► [Elasticsearch] 127.0.0.1:9200          │  │
│  │            (오프셋 = 버퍼)         ▲                                │  │
│  │                              [Kibana] 127.0.0.1:5601 ← SSH 터널만  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

Spring은 ECS JSON을 stdout으로만 뱉는다 — 도커 json-file 드라이버가 파일로 떨구고 Filebeat이
그 파일을 읽는다. **앱은 수집 경로를 모른다.**

앱 계층까지 합친 발표용 한 장은 [`diagrams/system-architecture.svg`](diagrams/system-architecture.svg).
사실 정본은 이 문서와 `deployment.md`이고 그 그림은 뷰다([`diagrams/README.md`](diagrams/README.md)).

---

## 2. 컨테이너 — `compose.observability.yaml`

`name: dero-observability`. 네트워크 `dero-data`에 `external: true`로 붙는다(Prometheus가
`backend:8080`을, Filebeat이 `elasticsearch:9200`을 이름으로 찾아야 한다).

**아래 표 5종이 전부 이 파일에 들어 있다** — `prometheus`·`grafana`(DERO-383, 2026-08-04),
`elasticsearch`·`kibana`(DERO-384, 2026-08-06), `filebeat`(DERO-386, 2026-08-06).

**Filebeat은 컨테이너 이름이 아니라 compose 서비스 라벨(`com_docker_compose_service: backend`)로
대상을 고른다.** 무중단 배포 방식에 따라 서빙 컨테이너 이름이 `dero-backend-1` ↔
`dero-green-backend-1`로 바뀌는 것을 2026-08-06에 실측했고, 이름 규칙에 묶으면 그때 수집이
조용히 멈춘다. **백엔드만 수집하는 것도 의도다** — ECS JSON을 뱉는 건 그 컨테이너뿐이고
postgres·redis·ES는 평문이라 ndjson 파서가 줄마다 실패한다.

**ES 버전은 백엔드 클라이언트와 한 몸이다** — `observability/elasticsearch/Dockerfile`의 `9.4.2`는
`spring-boot-starter-elasticsearch` 4.1.0이 끌어오는 `elasticsearch-java` 9.4.2와 같은 번호다.
한쪽만 올리면 클라이언트가 보내는 API를 서버가 모르는 조합이 생긴다.

**백엔드는 `SPRING_ELASTICSEARCH_URIS=http://elasticsearch:9200`으로 이 컨테이너를 찾는다**
(`compose.yaml`). 로컬 개발도 같은 파일을 띄워 쓴다 — 기본값이 `http://localhost:9200`이라
`compose.observability.yaml up -d`면 바로 붙는다. **ES가 없어도 백엔드는 뜬다**: 검색만 503이고
(ADR-0019 결정 6) 헬스체크에서도 뺐다(`management.health.elasticsearch.enabled: false` — 켜 두면
ES 없는 서버에서 `/api/actuator/health`가 DOWN이 되어 **Jenkins Verify가 배포를 통째로 실패시킨다**).

| 서비스 | 이미지 | 호스트 바인딩 | 볼륨 | `mem_limit` |
|---|---|---|---|---|
| `elasticsearch` | **`build:`** — 공식 이미지 + `analysis-nori` | `127.0.0.1:9200` | `es-data` | **3g** (heap 2G) |
| `kibana` | `docker.elastic.co/kibana/kibana` | `127.0.0.1:5601` | 없음 | 1g |
| `prometheus` | `prom/prometheus` | `127.0.0.1:9090` | `prometheus-data` | 512m |
| `grafana` | `grafana/grafana` | **`127.0.0.1:3001`** → 컨테이너 3000 | `grafana-data` | 512m |
| `filebeat` | `docker.elastic.co/beats/filebeat` | 없음 | `/var/run/docker.sock:ro`<br>`/var/lib/docker/containers:ro` | 256m |

- **Grafana 호스트 포트는 3000이 아니다** — `compose.yaml`의 frontend가 `"3000:3000"`으로 이미
  잡고 있다. 컨테이너 안쪽 3000은 네임스페이스가 달라 그대로 둔다(`GF_SERVER_HTTP_PORT` 불필요).
- **`mem_limit`는 선택이 아니다** — swap이 0이라 초과 시 즉시 OOM kill이다(§3).
  ES 힙은 `ES_JAVA_OPTS: -Xms2g -Xmx2g`이고 `mem_limit`는 힙 + 오프힙이라 3g다.
- **`GRAFANA_ADMIN_PASSWORD`가 없으면 `up -d`가 멈춘다**(`.env.example` 참고). 기본 비밀번호
  `admin/admin`으로 뜬 채 나중에 서브도메인에 노출되는 경로를 만들지 않기 위해서다.

### 설정 파일 — 레포의 `observability/`

컨테이너에 **읽기 전용으로 마운트**한다. UI 클릭이 아니라 파일이 정본이다 — Jenkins가 이 계층을
안 건드려 수동 재적용이 잦고, 그때마다 손으로 다시 만들면 설정이 흔들린다.

| 경로 | 무엇 |
|---|---|
| `observability/prometheus/prometheus.yml` | 수집 대상 — `backend:8080/api/actuator/prometheus` |
| `observability/grafana/provisioning/datasources/` | 데이터소스(uid `dero-prometheus` 고정) |
| `observability/grafana/provisioning/dashboards/` | 대시보드 공급자(`allowUiUpdates: false`) |
| `observability/grafana/dashboards/dero-backend.json` | 패널 **12개** — 생존(`up`)·요청량·5xx·평균 응답시간·힙·CPU·HikariCP·p95·p99·GC·힙 밖 메모리·에러 로그·커넥션 획득 대기 (선택 근거는 ADR-0020 결정 9) |
| `infra/nginx/dero.conf` + `README.md` | 호스트 nginx 설정 **사본**(자동 동기화 안 됨)과 deny 블록 적용 절차 — §4 |

- **데이터소스 `uid`를 고정한 것은 장식이 아니다.** 비워 두면 Grafana가 임의 uid를 만들고
  프로비저닝된 대시보드의 패널이 전부 `Datasource not found`가 된다.
- **대시보드는 레포가 정본이다**(`allowUiUpdates: false`). UI에서 고친 것은 컨테이너를 다시
  만들면 사라진다 — 고칠 것이 있으면 JSON을 고쳐 커밋한다.
- 패널은 **히스토그램 버킷을 쓰지 않는다.** p95·p99는 `percentiles`(클라이언트 사이드)로
  뽑고 `percentiles-histogram`은 끈 상태다(ADR-0020 결정 9) — 인스턴스가 1대라 서버 사이드 재집계가
  필요 없고, 히스토그램을 켜면 uri별 시계열이 버킷 개수만큼 곱해진다. **대가**: 이 값은 재집계
  불가라 `histogram_quantile`이 빈 값이고 **여러 시계열의 p95를 합산·평균하면 틀린 수가 나온다** —
  패널이 `max by (uri)`만 쓰는 이유다. 인스턴스가 2대가 되는 날 히스토그램으로 바꾼다.
- **없는 지표는 빈 패널이 된다 — Grafana는 에러를 내지 않는다.** 그래서 패널이 참조하는 지표명은
  백엔드의 `PrometheusEndpointTest`가 문자열로 지킨다(§4). 지표명을 바꾸면 대시보드가 조용히
  죽는 대신 테스트가 먼저 깨진다.
- `provisioning/plugins`·`provisioning/alerting`은 **빈 디렉터리를 일부러 둔다**(`.gitkeep`).
  없으면 Grafana가 부팅마다 `level=error ... no such file or directory`를 두 줄 남겨,
  장애 중에 로그를 읽는 사람에게 거짓 신호를 준다.

### ⚠ 함정 — Jenkins는 `compose.observability.yaml`도 적용하지 않는다

`deployment.md` §5의 `compose.data.yaml` 함정과 **완전히 같은 구조**다. `Jenkinsfile`의 명령에
`-f`가 없어 Compose가 표준 파일명만 찾고, `compose.observability.yaml`은 그 목록에 없다.

**게다가 Nori 커스텀 이미지는 사람이 `build` 해야 한다** — Jenkins는 짓지 않는다.

**게다가 `~/dero`에는 레포 체크아웃이 없다**(실측 2026-08-05 — `compose.yaml`·`compose.data.yaml`만
손으로 올려 둔 디렉터리다). 그래서 **`compose.observability.yaml` 혼자 올려도 안 돈다** — 아래
`observability/` 디렉터리를 세트로 `scp`해야 한다(`deployment.md` §5).

```bash
# 로컬 레포 루트에서 — 세트로 올린다
scp -i ~/.ssh/<키>.pem compose.observability.yaml ubuntu@www.dero.life:~/dero/
scp -i ~/.ssh/<키>.pem -r observability ubuntu@www.dero.life:~/dero/

# EC2에서
cd ~/dero
sudo docker compose -f compose.observability.yaml build     # Nori 이미지 (첫 회·Dockerfile 변경 시)
sudo docker compose -f compose.observability.yaml up -d     # -p 불필요 (파일에 name: 있음)
```

**결론: 관측 계층 설정을 바꿔도 배포로는 반영되지 않는다. EC2에서 손으로 재적용해야 한다.**

---

## 3. 호스트 선행 조건 — `vm.max_map_count`

**안 하면 ES 컨테이너가 부팅부터 죽는다.** `max virtual memory areas vm.max_map_count [65530]
is too low` 한 줄 남기고 종료한다 — 설정 오류처럼 안 보여서 오래 헤맨다.

```bash
sudo sysctl -w vm.max_map_count=262144                          # 지금 적용
echo 'vm.max_map_count=262144' | sudo tee -a /etc/sysctl.conf   # 재부팅 후에도 유지
sysctl vm.max_map_count                                         # 262144 확인
```

`sysctl -w`만 하면 **재부팅 후 ES만 조용히 안 뜬다.** 두 줄이 세트다.

**swap은 0이다**(실측 2026-08-03). 메모리가 부족하면 느려지는 게 아니라 커널이 즉시 프로세스를
죽인다 — 그래서 §2의 `mem_limit`가 전 컨테이너에 필수다.

---

## 4. Spring 쪽 배선

Actuator는 **이미 있다**(`backend/dero-api/build.gradle:24`). 추가는 넷이다 — 의존성 1 + 설정 3.

```gradle
// backend/dero-api/build.gradle
implementation 'io.micrometer:micrometer-registry-prometheus'
```

```yaml
# backend/dero-api/src/main/resources/application.yaml
management:
  endpoints:
    web:
      base-path: /api/actuator      # 이미 있다 — 바꾸지 않는다 (deployment.md §4)
      exposure:
        include: health,prometheus
  prometheus:
    metrics:
      export:
        enabled: true               # Boot 4.1은 옵트인이다 — 아래 함정
  metrics:
    distribution:
      percentiles:
        http.server.requests: 0.95,0.99   # ADR-0020 결정 9 (히스토그램이 아니라 percentiles)

logging:
  structured:
    format:
      console: ecs                  # Spring Boot 4.1 내장 (2026-08-06 적용, prod 전용)
    json:
      stacktrace:
        root: first                 # 원인 예외를 맨 위로 — 잘려도 무엇이 터졌는지는 남는다
        max-length: 2048
```

### ⚠ 함정 — Boot 4.1에서 지표 익스포트는 옵트인이다

**`micrometer-registry-prometheus`를 넣고 `exposure.include`에 `prometheus`를 적어도
`/api/actuator/prometheus`는 404다.** `management.prometheus.metrics.export.enabled: true`가
없으면 `PrometheusMetricsExportAutoConfiguration`이
`management.defaults.metrics.export.enabled is considered false`로 백오프해 레지스트리 빈이
아예 안 만들어진다(2026-08-04 실측, Boot 4.1.0 + Micrometer 1.17.0).

**Boot 3 튜토리얼에는 이 줄이 없다.** 그리고 404는 예외도 경고도 남기지 않으므로 **배포 후
Prometheus 타깃이 DOWN인 것으로만** 드러난다 —
`PrometheusEndpointTest`가 이 셋(의존성·노출·익스포트)을 한꺼번에 지킨다.

**`logstash-logback-encoder`는 넣지 않는다** — Boot 4.1이 ECS(Elastic Common Schema) JSON을
내장으로 뱉는다. `logback.xml`도 필요 없다.

검색어 이벤트는 **전용 logger 이름**(`...search.SearchEventLogger`)으로 찍는다. 스트림 분기는
ES ingest pipeline이 하고 **앱 코드는 그냥 로그를 찍는다**(§6).

### ⚠ 보안 함정 — actuator가 이미 인터넷에 열려 있다

실측 2026-08-03: `https://www.dero.life/api/actuator/health`가 **200**이다. nginx가 `/api/`를
통째로 프록시하는데 base-path가 `/api/actuator`이기 때문이다(`deployment.md` §4). 나머지
(`env`·`beans`·`metrics`·`heapdump`)는 기본 노출값 덕에 404라 안전하다.

**`prometheus`를 `exposure.include`에 넣는 순간 그 하나가 공개된다** — JVM 상태·엔드포인트별
호출량·DB 커넥션 풀이 전부 딸려 나간다. **위 yaml 변경과 아래 nginx 변경은 같은 커밋에 들어가야
한다.**

**넣을 블록·적용·검증·되돌리기는 `infra/nginx/README.md`가 정본이고, 설정 사본은
`infra/nginx/dero.conf`다**(들어갈 자리를 표시해 뒀다) — 여기 복사하지 않는다(두 곳에 두면 갈린다).
요지만: `location = /api/actuator/prometheus { deny all; }`이고,
`=` 정확 일치가 접두사 `location /api/`보다 **항상 우선**하므로 블록 순서와 무관하다. Prometheus는
도커 네트워크로 `backend:8080`을 직접 긁으니 **수집에는 영향이 없다.**

**nginx 적용이 백엔드 배포보다 먼저다.** 뒤집으면 그 사이 구간에서 지표가 공개된다.

**로그에 토큰·비밀번호·이메일 전문을 남기지 않는다.** ES에 보관되므로 실수 한 번이 영구 유출이다.

### ⚠ 함정 — 배포 겹침 창에는 `backend` 지표가 두 버전 사이를 오간다

앱 계층이 blue-green이라(`deployment.md` §4-1) 배포 중 **backend 컨테이너가 두 벌 동시에 뜬다.**
compose는 서비스명을 네트워크 별칭으로 **항상** 붙이므로 `dero-blue-backend-1`과
`dero-green-backend-1`이 `dero-data` 위에서 **같은 `backend` 별칭**을 받는다. 뺄 수 있는 옵션이 없다.

```yaml
# observability/prometheus/prometheus.yml
- job_name: dero-backend
  static_configs:
    - targets: ['backend:8080']     # ← 겹침 창에 어느 색이 응답할지 도커 DNS가 정한다
```

그래서 **겹치는 동안 스크레이프가 구·신 버전 사이를 라운드로빈한다.** 배포 직후 몇 분간
`http_server_requests` 같은 카운터가 톱니처럼 보이거나 JVM 업타임이 오락가락하면 **버그가
아니라 이것**이다. 겹침 창은 헬스 대기 + `DRAIN_SECONDS`(10초)라 보통 1분 안쪽이다.

**색별 별칭 + 타깃 2개는 부결이다**(ADR-0026 결정 7) — 평상시 한쪽이 항상 DOWN으로 떠
`up` 패널(ADR-0020 결정 9)의 의미가 망가진다. 창이 짧으므로 감수하고 여기 적어 둔다.

---

## 5. 노출 정책

| 서비스 | 외부 | 접근 방법 |
|---|---|---|
| Grafana | (예정) | 목표는 서브도메인 + nginx TLS + **Grafana 자체 로그인**. **지금은 `127.0.0.1:3001` + SSH 터널** — 아래 선행 조건 |
| Kibana | ❌ | SSH 터널 → `http://localhost:5601` |
| Elasticsearch | ❌ | SSH 터널 (보통은 Kibana Dev Tools로 충분) |
| Prometheus | ❌ | SSH 터널 → `http://localhost:9090` |
| actuator `/prometheus` | ❌ | nginx `deny all` (§4) |

**Kibana를 노출하지 않는 이유**: 로그에 사용자 id·요청 본문 조각이 섞이고, 소셜 로그인
서비스라 OAuth 흐름 로그에 **토큰 조각이 섞일 수 있다** — 지표는 새어도 손해가 작지만 로그가
새면 사고다.

**ES 9200을 외부에 바인딩하지 마라.** 인증 없는 ES가 인터넷에 열리면 누구나 인덱스를 지울 수
있고, 랜섬 스캐너의 상시 대상 포트다.

### Grafana 외부 노출 선행 조건 — 아직 셋 다 없다 (실측 2026-08-04)

ADR-0020 결정 4가 "Grafana만 서브도메인으로 노출"을 정했지만, **호스트 쪽 준비가 안 돼 있어
지금은 터널로만 본다.** 컨테이너는 `127.0.0.1:3001`에 묶여 있으므로 이 세 가지를 하기 전까지
외부에서 닿을 방법이 없다(안전한 기본값).

1. **DNS** — `grafana` 레코드가 없다(`deployment.md` §2에 3건뿐).
2. **인증서** — SAN이 `dero.life`·`www.dero.life` 둘뿐이라 `grafana.dero.life`를 **덮지 않는다**
   (`deployment.md` §3). certbot으로 SAN을 늘리거나 별도 발급이 필요하다.
3. **nginx 서버 블록** — `deployment.md` §4의 *"새 호스트·서브도메인은 301로 www에 모은다"*가
   그대로 적용되면 **Grafana 호스트도 www로 301된다.** Grafana는 그 규칙의 예외이므로 전용
   `server` 블록이 필요하고, 그때 `GF_SERVER_ROOT_URL`도 같이 넣어야 한다 —
   없으면 로그인 리다이렉트가 컨테이너 주소로 나간다.

터널만으로 쓰는 동안은 `GF_SERVER_ROOT_URL`을 넣지 않는다(기본값이 터널 접속에 맞다).

```bash
ssh -N -i ~/.ssh/<키>.pem ubuntu@www.dero.life \
    -L 5601:127.0.0.1:5601 -L 9200:127.0.0.1:9200 -L 9090:127.0.0.1:9090
```

---

## 6. 인덱스와 수명

| 인덱스 / 스트림 | 종류 | ILM | 소관 |
|---|---|---|---|
| `products` (별칭 → `products_v<타임스탬프>`) | 일반 인덱스 | **없음** | [ADR-0019](../adr/0019-search-elasticsearch-nori.md) 결정 5 |
| `app-logs-*` | 데이터 스트림 | hot 7일 → **30일 삭제** | [ADR-0020](../adr/0020-observability-stack.md) 결정 6 |
| `search-events-*` | 데이터 스트림 | **1년** | ADR-0020 결정 6·7 |

- **`products` 실체 인덱스는 재색인마다 새로 만들어진다**(DERO-384 구현). 이름은
  `products_v20260806094757916`처럼 **밀리초까지** 찍는다 — 초 단위로 자르면 같은 초에 두 번
  재색인한 순간 `resource_already_exists_exception`으로 두 번째가 통째로 실패한다(실측). 스왑이
  끝나면 옛 인덱스는 지워지므로 실체는 항상 하나다. 스왑 전에 실패하면 반쯤 채운 인덱스를 앱이
  스스로 지운다.
- **부팅할 때 별칭이 없으면 앱이 인덱스를 만든다 — 단, 만드는 것은 *빈* 인덱스다.**
  채우는 경로는 `POST /api/v1/admin/search/reindex` 하나뿐이므로 **새 환경·새 인덱스에서는 최초
  1회 재색인이 절차의 일부다**(복구 수단이 아니라). 빠뜨리면 검색이 계속 0건인데 **에러도 로그도
  안 난다** — 카탈로그·상세는 Postgres라 멀쩡해서 "검색만 안 된다"로 보인다. 배치·게시글·작성자
  인덱스도 같다(`.../posts/reindex`·`.../users/reindex`·`.../placements/reindex`). ES가 안 떠
  있으면 로그만 남기고 부팅은 계속한다(ADR-0019 결정 6).
- **로그 라우팅은 logger 이름으로 한다.** ES ingest pipeline이 `log.logger`를 보고
  `...search.SearchEventLogger`면 `search-events-*`로, 나머지는 `app-logs-*`로 보낸다.
- 두 스트림을 가른 이유는 **보존 기간이 달라서**다 — 검색어는 분석 데이터라 오래 봐야 값이 난다.
- ILM은 basic 라이선스에서 무료다. **없이 단일 인덱스로 가면 나중에 못 지운다** —
  `delete_by_query`는 비싸고 디스크를 즉시 안 돌려준다.

### 부팅 순서 — `bootstrap-log-indices.sh`가 Filebeat보다 먼저다

데이터 스트림·ILM·라우팅 파이프라인은 **Filebeat이 만들지 않는다.** 스트림이 둘이고 보존 기간이
달라(30일 / 1년) Filebeat의 `setup.ilm` 한 벌로는 표현이 안 되기 때문이다. 그래서
`filebeat.yml`은 `setup.ilm.enabled: false` · `setup.template.enabled: false`로 자체 setup을 끄고,
아래 스크립트가 ES에 직접 만든다(PUT만 쓰므로 **몇 번 돌려도 같다**).

```bash
# EC2, 리포 루트에서. ES가 뜬 뒤 · filebeat을 올리기 전에.
./observability/elasticsearch/bootstrap-log-indices.sh
```

**순서가 뒤집히면 조용히 망가진다** — 템플릿이 없는 상태로 문서가 들어오면 ES가 스트림을 자동
생성하고, 그렇게 만들어진 인덱스에는 **ILM이 안 붙는다.** 나중에 정책을 만들어도 이미 생성된
인덱스는 대상이 아니라서 30일이 지나도 안 지워지고 영원히 쌓인다. 그때는 스트림을 지우고 다시
만드는 수밖에 없다.

### Kibana 저장 객체 — `bootstrap-dashboards.sh`

**인덱스를 아무리 잘 만들어도 Kibana 화면은 비어 있다.** 데이터 뷰·대시보드는 ES 인덱스가 아니라
`.kibana` 저장소에 사는 별개 객체라, 사람이 만들기 전까지 0장이다 — 2026-08-06에 실제로
"대시보드에 아무것도 안 나온다"로 드러났고 원인이 이것이었다. Grafana와 달리 Kibana는 파일
프로비저닝이 없어서 API로 넣는다(전부 `overwrite=true`라 **몇 번 돌려도 같다**).

```bash
# SSH 터널을 건 로컬에서도, EC2에서도 된다.
./observability/kibana/bootstrap-dashboards.sh
```

| id | 무엇 |
|---|---|
| `dero-app-logs` | 데이터 뷰 `app-logs-*` (시간 필드 `@timestamp`) |
| `dero-lens-volume` · `dero-lens-levels` | 시간대별 건수(레벨 누적) · 레벨 분포 |
| `dero-search-errors` | `log.level: ERROR` 목록 |
| `dero-search-500` | 500 예외 + `error.stack_trace` 컬럼 |
| `dero-app-logs-overview` | 위 넷을 얹은 대시보드 `앱 로그 개요` |
| `dero-search-events` | 데이터 뷰 `search-events-*` (387) |
| `dero-lens-top-queries` · `dero-lens-zero-hit-queries` | 인기 검색어 · 결과 0건 검색어 (표) |
| `dero-search-events-overview` | 위 둘을 얹은 대시보드 `검색어 이벤트` |

- **id를 전부 고정한 것이 요점이다.** 자동 UUID로 두면 다시 돌릴 때마다 새 객체가 생기고
  대시보드 패널이 옛 id를 가리켜 통째로 깨진다.
- **로그가 한 건이라도 들어온 뒤에 돌린다.** 데이터 뷰는 만들 때 매핑을 읽어 필드 목록을
  굳히므로, 인덱스가 비어 있으면 필드 없는 데이터 뷰가 생기고 패널이 전부 빈다. 그때는 다시 돌린다.
- 대시보드 그리드는 **48칸**이다(24 아님). 24 기준으로 계산하면 패널이 왼쪽 절반에 몰린다.
- 스크립트의 JSON 본문은 전부 **따옴표 친 heredoc**(`<<'JSON'`)이다. 따옴표를 빼면 bash가
  `\\\"`를 접어 `searchSourceJSON`의 중첩 이스케이프가 깨지고 Kibana가
  `Invalid request payload JSON format` 400을 낸다(실측).

- **검색어 이벤트 데이터 뷰만 `allowNoIndex: true`다.** 첫 검색 전에는 `search-events-*` 인덱스가
  아직 없고, 그 상태에서 데이터 뷰 생성은 `No matching indices found`로 실패한다. 대신 매핑을
  `bootstrap-log-indices.sh`가 못 박아 뒀으므로(`keyword`/`long`) **비어 있어도 필드 목록은 나온다**
  — 위의 "로그가 들어온 뒤에 돌린다" 함정이 이쪽에는 없다.

**인덱스·ILM 상태를 보는 화면은 만들지 않았다** — Kibana 내장이 이미 그 화면이다
(`/app/management/data/index_management/data_streams`, ILM은 `.../index_lifecycle_management`).
백킹 인덱스·크기·문서 수·붙은 정책이 전부 거기 있다.

### ⚠ 함정 — 500을 식별하는 신호는 logger 이름뿐이다

앱 로그에 **HTTP status 필드가 없다**(실측: 매핑에 `http.*`가 없다). 서버 오류는
`GlobalExceptionHandler`가 남기는 두 줄로만 드러난다 — 미처리 예외의 `처리되지 않은 예외: …`와
5xx `ErrorCode`를 든 `BusinessException`의 `서버 오류 응답: …`. **logger 이름이 유일한 신호이므로**
`dero-search-500`은 그 클래스명으로 거른다. **그 클래스를 옮기거나 이름을 바꾸면 저장된 검색도 같이 바꾼다.**

**4xx는 일부러 안 남긴다.** 사용자 입력이 틀린 것은 정상 흐름이고, ERROR로 찍으면 대시보드가 정상
거절로 덮여 진짜 장애가 안 보인다. 반대로 5xx 로깅은 2026-08-06에 DERO-474로 새로 넣은 것이다 —
그전까지 `handleBusinessException`은 아무것도 안 남겨서, 5xx를 든 `ErrorCode` 8개
(`PRODUCT_SEARCH_UNAVAILABLE` 503, `STORAGE_SIGN_FAILED` 500, `IMAGE_GENERATION_FAILED` 502 …) 중
하나가 던져지면 **클라이언트는 5xx를 받는데 Kibana에는 흔적이 0이었다.** 회귀는
`GlobalExceptionHandlerTest.BusinessExceptionLogging`이 막는다(응답 코드만 보는 테스트로는 안 잡힌다).

### 검색어 이벤트 — 계약이 세 곳에 걸쳐 있다 (387)

수집하는 사용자 행동 이벤트는 **검색어 하나뿐**이다(ADR-0020 결정 7). `GET /products?q=`의
컨트롤러가 `SearchEventLogger`로 한 줄 찍고, ingest pipeline이 logger 이름을 보고
`search-events-*`로 보낸다.

| 필드 | 타입 | 내용 |
|---|---|---|
| `search.index` | keyword | 무엇을 검색했는지 — `products`·`placements`·`posts`(`SearchIndex` 열거형) |
| `search.query` | keyword | 사용자가 친 검색어(앞뒤 공백 제거) |
| `search.result_count` | long | **노출 규칙까지 적용한 결과 수.** ES 히트 수가 아니다 |
| `search.user_id` | long | 로그인 사용자의 내부 숫자 id. 비로그인은 **필드 자체가 없다**(아래) |

**이메일·토큰·IP는 싣지 않는다.** ILM이 1년이라 앱 로그(30일)보다 오래 남는다.

**비로그인 검색은 `search.user_id` 키가 아예 없다** — SLF4J key-value의 `null`은 JSON에 안 실린다
(실측 2026-08-07). 그래서 Kibana에서 비로그인만 보려면 `search.user_id: 0` 같은 값 비교가 아니라
**`NOT search.user_id: *`**(존재 여부)로 거른다. 반대로 로그인 사용자만 보려면 `search.user_id: *`다.

- **첫 페이지에서만 남긴다** — 이벤트 하나가 "검색 한 번"이다. 페이지마다 남기면 인기 검색어
  순위가 스크롤 길이를 반영한다. **`/products/suggestions`는 아예 안 남긴다**(키 입력마다 오므로
  타이핑 도중의 접두사가 통째로 쌓인다).
- **필드 이름이 세 곳에 있다** — `SearchEventLogger`의 상수 · `bootstrap-log-indices.sh`의
  `dero-search-events-fields` 매핑 · `bootstrap-dashboards.sh`의 패널. **하나만 바뀌면 에러 없이
  패널이 빈다.** `SearchEventRoutingTest`가 세 파일을 직접 읽어 막는다.
- **매핑을 동적에 안 맡긴 이유**: 문자열이 기본 `text` + `.keyword`라 집계 필드 이름이
  `search.query.keyword`가 되고, `result_count`가 `text`로 잡히면 "0건만" 조건을 못 건다.
- **도메인마다 로거를 새로 두지 않는다** — `SearchEventLogger`는 `global/search/`에 하나뿐이고
  제품·배치·게시글이 모두 이걸 부른다(`search.index`로 가른다). 클래스를 쪼개면 라우팅 조건도
  도메인마다 늘어나고, 하나만 빠뜨리면 그 도메인 검색어만 조용히 앱 로그로 샌다. **패키지 끝은
  반드시 `.search`** — 파이프라인이 그 접미사로 판정한다.
- **컴포넌트 템플릿에 필드를 더해도 이미 도는 백킹 인덱스는 안 바뀐다** — 스크립트를 다시 돌린 뒤
  `POST /search-events-default/_rollover`까지 해야 새 필드가 매핑에 실린다.
- **logger 이름을 바꾸면 파이프라인 조건도 같이 바꾼다** — 아래 500 함정과 같은 종류이고, 이쪽은
  더 조용하다(검색어가 앱 로그로 섞여 들어가 30일 뒤 지워질 뿐 아무 오류도 안 난다).

#### ⚠ 함정 — EC2의 `~/dero/observability/`는 배포와 무관하게 낡는다 (실측 2026-08-07)

**Jenkins는 이 디렉터리를 안 건드린다.** 그래서 백엔드는 새 판인데 부트스트랩 스크립트는 옛 판인
상태가 만들어지고, 그 상태로 스크립트를 돌리면 **아무 오류 없이 옛 결과가 나온다.**

387 배포 때 실제로 걸렸다 — 옛 `bootstrap-log-indices.sh`가 돌아 `dero-search-events-fields`
컴포넌트 템플릿이 안 생겼고, 첫 검색어 이벤트가 도착하면서 ES가 **동적 매핑**으로 스트림을
만들었다(`search.query`가 `text` + `.keyword`). 그러면 대시보드가 `search.query`로 `terms` 집계를
거는데 **에러도 안 나고 패널만 빈다.**

**인덱스 템플릿은 인덱스를 만드는 순간에만 적용된다** — 나중에 템플릿을 넣어도 이미 만들어진
백킹 인덱스는 옛 매핑 그대로다. 고치려면 스트림을 지웠다 다시 만드는 수밖에 없고, **그때 그 안의
검색어가 같이 사라진다.** 배포 직후(유실 0)에 알아채는 것과 한 달 뒤에 알아채는 것의 값이 다르다.

```bash
# 스크립트를 올리는 정본 방법 — 로컬 체크아웃이 아니라 머지된 판을 보낸다
git archive origin/main observability | ssh -i ~/.ssh/<키>.pem ubuntu@<호스트> 'tar -x -C ~/dero'

# 돌리기 전에 최신인지 확인한다(0이면 옛 판이다)
grep -c dero-search-events-fields ~/dero/observability/elasticsearch/bootstrap-log-indices.sh

# 이미 옛 매핑으로 만들어졌으면 — 안에 든 검색어가 지워진다
curl -s -XDELETE 'localhost:9200/_data_stream/search-events-default'
```

매핑이 제대로 붙었는지는 이렇게 본다 — `query`가 `keyword`여야 한다:

```bash
curl -s 'localhost:9200/search-events-*/_mapping' | grep -o '"query":{[^}]*}'
```

**백엔드가 기동할 때마다 이 확인을 대신 한다**(DERO-495, `SearchEventMappingGuard`).
`search.query`가 `keyword`가 아닌 백킹 인덱스가 있으면 위 복구 절차를 **로그에 그대로 찍는다** —
배포 직후(유실 0)에 알아채라고 있는 것이다. **부팅은 계속한다**(ADR-0019 결정 6과 같은 결):
ES가 없거나 못 붙으면 `warn` 한 줄이고, 스트림이 아직 없는 상태(첫 검색 전)는 정상이라 조용하다.
로그는 검색어 이벤트가 아니라 `app-logs-*`로 간다 — 라우팅 조건이 `SearchEventLogger`라는 이름이다.

### ⚠ 함정 — ingest pipeline은 얇게 유지한다

라우팅과 최소 정규화까지다. 두꺼워지면 나중에 Logstash로 옮길 때 **이사가 아니라 재작성**이
된다. 전환은 Filebeat의 `output.elasticsearch` → `output.logstash` **한 블록**이어야 한다.

### 제품 색인 — 코드 쪽 계약과 함정

출처: `backend/dero-api/src/main/java/com/brunchies/dero/product/CLAUDE.md`(2026-08-10 감축 전 39·40·42·43·44·45번 항목). CLAUDE.md에는 각 항목의 예방 한 줄만 남았다.

- **검색 색인은 이름만 담고, 노출 판정은 Postgres가 한다**(ADR-0019, DERO-384). `ProductSearchService`가 ES에 넣는 문서는 `{name}` 하나이고 `_id`가 `product.id`다 — 숨김·검수·소프트 삭제 필터는 id로 다시 읽는 `findCatalogByIds(ids, specType, categoryIds)`가 판정한다. **테스트 데이터를 소품(PROP)으로 만들면 검수 통과 에셋을 안 붙인 순간 카탈로그에서 통째로 빠져 모든 단언이 공허하게 통과한다**(2026-08-06 실측 — 검색 결과가 늘 빈 목록인데 `doesNotContain` 류가 전부 초록이었다). `registerAsset(...)`으로 승인 에셋을 붙이거나 절차 생성 규격(DESK·MONITOR)을 쓴다.
- **한국어 오타는 형태소 분해 결과를 바꾸므로 `fuzziness`로 안 잡힌다.** `모니타`를 Nori가 `[모니, 타, 하, 다]`로 분해해(2026-08-06 실측) `모니터`와 토큰 편집거리가 성립하지 않는다 — `fuzziness=AUTO`도, `AND` 결합도 0건이다. 그래서 `name.autocomplete`(edge n-gram) 절만 `operator`를 기본값 `OR`로 둔다: `모니` 하나가 맞아 잡히고, 관련도는 본검색 절의 `boost`가 지킨다. 회귀 가드 `ProductSearchPersistenceTest.오타`.
- **completion suggester가 돌려주는 문자열을 그대로 화면에 세우면 안 된다**(DERO-385). FST는 색인 전량 위에 서 있어 **숨김·검수 대기 제품 이름까지 매치된다** — 옵션의 `text`(매치된 입력)를 드롭다운에 실으면 미공개 제품명이 노출되고 눌러도 결과가 0건이다. `suggestIds`는 `option.id()`(= `product.id`)만 돌려주고 `ProductCatalogService.suggest`가 `findCatalogByIds`로 다시 읽어 본검색과 같은 술어를 태운다. **FST는 첫 토큰부터의 접두만 매치하므로** 입력이 이름 하나뿐이면 `모니터 암`이 `암`으로 안 뜬다 — 어절 접미사를 전부 입력으로 싣는다(`ProductDocument.suggestInputs`). 회귀 가드 `ProductSearchPersistenceTest.추천어_중간_어절`·`추천어_숨긴_제품_제외`.
- **analyzer만 바꾼 배포는 `prepareIndex`가 못 잡는다 — 손으로 재색인해야 한다**(ADR-0028, DERO-486). 부팅 시 자동 재색인은 정의 파일과 살아 있는 인덱스의 **최상위 필드 이름**만 비교하므로, `product-index.json`의 `min_gram`처럼 **같은 필드의 분석 규칙**이 바뀐 배포는 통과해 버린다 — 코드만 바뀌고 검색 결과는 옛 토큰 그대로다(에러도 로그도 없다). 배포 후 `POST /api/v1/admin/search/reindex` 1회가 절차의 일부다. **접두 색인은 2글자부터**(`min_gram: 2`)이고 그 값이 오매칭 여부를 혼자 정한다 — 1로 내리면 1글자 형태소(`하`·`지`·`제`)가 그 글자로 시작하는 제품을 전부 끌어온다. 보장 계약 6건은 `ProductSearchPersistenceTest`가 들고 있고, 픽스처의 `하이엔드 풋레스트`를 지우면 오매칭 테스트가 공허하게 통과한다.
- **분류어 검색은 카테고리 **조상 경로**를 색인해서 푼다 — 잎 이름만 실으면 안 잡힌다**(ADR-0029, DERO-494). 제품은 소분류(`스피커`)에 달리는데 사용자는 대분류(`음향`)를 친다 — 운영에서 `음향`이 0건이던 이유가 이것이다(카탈로그 구멍이 아니다). `ProductDocument.categoryPath`가 잎부터 뿌리까지의 이름을 담고, 질의는 `should` 절이 하나 늘되 **그 절만 `operator=AND`다** — `OR`이면 조각 하나로 그 분류 전량이 딸려 와 "분류어 검색"이 "전체 목록"으로 조용히 퇴화한다(가드 `ProductSearchPersistenceTest.분류어는_그_분류만`). **픽스처는 두 단(`음향` → `스피커`)이어야 한다** — 한 단짜리로 만들면 조상 경로를 안 타고도 통과해 공허하다. 조상은 카테고리 마스터를 **한 번** 읽어 메모리에서 거슬러 오른다(제품마다 부모를 로드하면 전량 재색인이 그대로 N+1). **이 배포는 재색인 버튼이 필요 없다** — 새 최상위 필드라 `prepareIndex`가 부팅에 잡는다(바로 위 항목의 analyzer 변경과 반대 경우).
- **별칭 조회 404는 정상 상태다.** 인덱스가 하나도 없을 때 `indices().getAlias(products)`는 404(`alias [products] missing`)이고, `ignore_unavailable`은 **인덱스에만 걸리지 별칭에는 안 걸린다** — 안 잡으면 첫 색인이 통째로 실패한다(2026-08-06 실측). 실체 인덱스 이름은 **밀리초까지** 찍는다: 초 단위면 같은 초의 두 번째 재색인이 `resource_already_exists_exception`으로 죽는다.

---

## 7. 점검 체크리스트

**지표 계층만 올린 상태의 적용 순서**(DERO-383). ES·Filebeat 항목은 384·386 뒤에 본다.

1. **nginx `deny all` 먼저**(§4) — `sudo nginx -t && sudo systemctl reload nginx`.
   백엔드 배포가 먼저 나가면 그 사이 `/api/actuator/prometheus`가 인터넷에 공개된다.
2. `.env`에 `GRAFANA_ADMIN_PASSWORD` 추가 → `docker compose -f compose.observability.yaml up -d`.
3. 백엔드 배포(Jenkins) — `include: health,prometheus`가 들어간 이미지가 떠야 타깃이 UP이 된다.

```bash
sysctl vm.max_map_count && grep max_map_count /etc/sysctl.conf   # 262144 + 영구화
curl -s localhost:9200/_cluster/health | jq .status              # 단일 노드 → replica 0이면 green
curl -s localhost:9200/_cat/plugins                              # analysis-nori
curl -s 'localhost:9200/app-logs-*/_ilm/explain' | jq '..|.policy?|select(.)'
sudo ss -tulpn | grep -E '9200|5601|9090|3001'                   # 전부 127.0.0.1
sudo docker stats --no-stream                                    # MEM LIMIT 이 §2 표와 일치
```

- [ ] `vm.max_map_count=262144` — 현재값 + `/etc/sysctl.conf` 둘 다 (ES가 올 때까지는 무관)
- [ ] ES 클러스터 헬스 정상, `analysis-nori` 플러그인 적재됨 (384)
- [ ] `bootstrap-log-indices.sh`를 돌렸다 — **filebeat을 올리기 전에** (386)
- [ ] `app-logs` · `search-events`에 ILM 정책이 붙어 있다(`_ilm/explain`이 정책명을 돌려준다) (386·387)
- [ ] filebeat 컨테이너가 백엔드를 잡았다 — `docker logs dero-observability-filebeat-1`에
      `Harvester started` 가 뜨고, `curl -s 'localhost:9200/app-logs-*/_count'`가 0이 아니다 (386)
- [ ] Kibana에서 `log.level`·`log.logger`가 **필드로** 보인다 — `message` 한 덩어리면 prod에
      `logging.structured.format.console: ecs`가 안 들어간 것이다 (386)
- [ ] `bootstrap-dashboards.sh`를 돌렸다 — **로그가 들어온 뒤에.** 대시보드 `앱 로그 개요`가
      뜨고 패널 4개가 데이터를 그린다 (386)
- [ ] 제품을 한 번 검색한 뒤 `curl -s 'localhost:9200/search-events-*/_count'`가 0이 아니다 —
      0이면 라우팅이 안 걸린 것이다(같은 요청이 `app-logs-*`에 있는지 본다) (387)
- [ ] 대시보드 `검색어 이벤트`의 두 패널이 검색어를 **행으로** 그린다 — 비어 있으면 필드 이름이
      갈렸거나 매핑 없이 스트림이 자동 생성된 것이다 (387)
- [ ] `/api/actuator/health` 200 · `/api/actuator/prometheus` **403**
- [ ] Grafana 호스트 포트가 3000이 아니다 (frontend와 충돌 없음)
- [ ] `9200`·`5601`·`9090`이 `127.0.0.1`에만 바인딩됐다 (외부 스캔으로도 재확인)
- [ ] 전 컨테이너에 `mem_limit`가 붙어 있다 (swap 0)
- [ ] Prometheus 타깃 `backend:8080`이 `UP`이다 (`localhost:9090/api/v1/targets`)
- [ ] Grafana에 데이터소스 `dero-prometheus`와 대시보드 `dero-api 지표`가 자동으로 떠 있다
      (`curl -s -u admin:<비밀번호> localhost:3001/api/search?type=dash-db`)
- [ ] **12패널 중 값이 비는 패널이 없다**(ADR-0020 결정 9). 빈 패널은 Grafana가 에러로 알려주지
      않으므로 눈으로 본다 — `quantile="0.95"`는 그 uri에 요청이 한 건이라도 있어야 나오고,
      `jvm_gc_pause_seconds`는 GC가 한 번 일어난 뒤에 생긴다(부팅 직후엔 정상적으로 빈다)
