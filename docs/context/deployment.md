# 배포 토폴로지 — 실제 배선 정본

도메인 요청 한 건이 어디를 거쳐 어느 프로세스에 닿는지의 **정본**. 값은 전부 실측이며,
바뀌면 이 문서를 고친다. 각 절에 검증 명령을 달아뒀으니 의심되면 직접 돌려 확인하라.

**경계** — 여기는 "지금 어떻게 배선돼 있나"(사실)를 적는다. "왜 그렇게 정했나"(결정)는
`docs/context/architecture-map.md`와 `docs/adr/`에 있다. 결정을 여기 복사하지 말 것.

---

## 1. 전체 흐름

```
브라우저 / GitLab(gitlab.example.com)
        │
        ▼
┌──────────────────────────────────────────────────────────────┐
│ DNS — 호스팅케이알 (dero.life 등록)                            │
│   www          CNAME → ec2.example.com   (TTL 180)  ✅     │
│   _acme-challenge TXT → 인증서 발급용        (TTL 180)  ✅     │
│   @ (apex)     ← 레코드 없음                            ❌     │
└──────────────────────────────────────────────────────────────┘
        │  ec2.example.com ──A──► 203.0.113.10
        ▼
┌──────────────────────────────────────────────────────────────┐
│ EC2  ip-172-26-15-226 (사설 172.26.15.226 / 공인 203.0.113.10) │
│                                                              │
│  :80  nginx ── return 301 https://$host$request_uri          │
│  :443 nginx (TLS 종료)                                        │
│        │                                                     │
│        ├─ /api/     → upstream dero_backend  ─┐              │
│        ├─ /project/ → 127.0.0.1:8080 → Jenkins (호스트 java)  │
│        └─ /         → upstream dero_frontend ─┤              │
│                                               │              │
│   include /var/lib/dero/nginx/active.conf ────┘              │
│        심볼릭 링크가 가리키는 색이 곧 목적지 (§4-1)             │
│        blue  = 3000 / 8081     green = 3010 / 8091           │
│                                                              │
│  dero-<색>-backend-1 ──별칭 dero-data──┬─ postgres:5432       │
│                                        └─ redis:6379         │
└──────────────────────────────────────────────────────────────┘
```

**현재 색은 green** (2026-08-06 첫 전환, build 93). 확인은 `readlink /var/lib/dero/nginx/active.conf`.

관측 스택(ES·Kibana·Prometheus·Grafana·Filebeat)은 이 그림에 넣지 않았다 —
토폴로지는 `docs/context/observability.md` §1에 있다.

발표·온보딩용으로 **두 계층을 합친 한 장짜리 그림**이 필요하면
[`diagrams/system-architecture.svg`](diagrams/system-architecture.svg)를 쓴다. 사실 정본은
여기와 `observability.md`이고 그 그림은 뷰다 — 어긋나면 그림을 다시 뽑는다
([`diagrams/README.md`](diagrams/README.md)).

---

## 2. DNS

레지스트라는 **호스팅케이알**. 등록된 레코드는 3건이다.

| 유형 | 호스트 | 값 | TTL |
|---|---|---|---|
| A | `@` (apex) | `203.0.113.10` | 180 |
| CNAME | `www` | `ec2.example.com` | 180 |
| TXT | `_acme-challenge` | (certbot DNS-01 토큰) | 180 |

- **정규 호스트는 `www.dero.life` 하나다.** apex(`dero.life`)도 DNS로 살아 있지만 nginx가
  301로 www에 넘긴다(§4). **apex에 CNAME은 못 쓴다** — RFC 1034 §3.6.2가 CNAME과 다른 레코드의
  공존을 금지하는데 apex에는 SOA·NS가 반드시 있기 때문이다. 그래서 apex는 A 레코드다.
- `_acme-challenge` TXT는 **인증서 갱신에 계속 쓰인다. 지우지 말 것.**

```bash
dig +short dero.life A          # 203.0.113.10 (apex — 301 전용)
dig +short www.dero.life A      # CNAME 체인 → 203.0.113.10
```

---

## 3. TLS

- 발급: Let's Encrypt, **DNS-01** 챌린지(위 TXT 레코드). HTTP-01이 아니다.
- 경로: `/etc/letsencrypt/live/dero.life/{fullchain,privkey}.pem`
- SAN: `dero.life`, `www.dero.life` — **두 이름 다 커버한다.**

SAN이 두 이름을 덮으므로 apex 전용 서버 블록도 같은 인증서를 쓴다(§4의 301 블록).

```bash
echo | openssl s_client -connect 203.0.113.10:443 -servername www.dero.life 2>/dev/null \
  | openssl x509 -noout -subject -ext subjectAltName -dates
```

---

## 4. nginx

`/etc/nginx/sites-available/dero` (nginx 1.24.0 Ubuntu). 서버 블록은 3개다.
**설정 사본이 레포에 있다 — `infra/nginx/dero.conf`**(2026-08-05 추가). 자동 동기화되지 않으므로
정본은 여전히 호스트 실물이다. **EC2에 레포 체크아웃이 없으므로**(§5) 확인은 로컬에서
`ssh ... 'sudo cat /etc/nginx/sites-available/dero' | diff - infra/nginx/dero.conf`다. 적용 절차와
실물에서 확인된 미결 항목은 `infra/nginx/README.md`.

| 블록 | `server_name` | 역할 |
|---|---|---|
| `:80` | `dero.life www.dero.life` | 전부 `https://www.dero.life`로 301 |
| `:443` | `dero.life` | apex → `https://www.dero.life`로 301 (첫 443 블록이라 암묵적 기본 서버) |
| `:443` | `www.dero.life` | **실제 서비스** — 아래 location 표 |

⚠️ **정규 호스트는 `www.dero.life` 하나다. 새 호스트·서브도메인은 301로 www에 모은다.**
2026-08-03 apex A 레코드가 추가되자 apex로 들어온 사용자의 모든 API가 죽었다. 당시 프론트 번들이
API를 `https://www.dero.life` 절대주소로 불러 페이지 오리진과 어긋났고, 백엔드 CORS는 동일 오리진
전제로 닫혀 있어(`allowed-origins: ""`, ADR-0005) preflight에서 전멸했다 — `/auth/refresh`까지
막혀 **로그인이 끊겼다.** 위 301 블록으로 지혈하고, 프론트는 브라우저 호출을 상대 경로로 바꿔
근본 원인을 없앴다(ADR-0005 결정 12-개정: 브라우저 `/api/v1`, 서버 렌더만 `INTERNAL_API_ORIGIN`).
그래도 301은 계속 필요하다 — 호스트가 갈리면 OAuth 리다이렉트·쿠키 호스트가 흩어진다.

경로 매칭은 **가장 긴 접두사가 이긴다.**

| location | proxy_pass | 도착지 |
|---|---|---|
| `/api/` | `http://dero_backend` | 현재 색의 backend (Spring Boot) — §4-1 |
| `/project/` | `http://127.0.0.1:8080` | Jenkins (색 없음, 호스트 프로세스) |
| `/` | `http://dero_frontend` | 현재 색의 frontend (Next.js) — §4-1 |

⚠️ **백엔드로 가는 문은 `/api/` 하나뿐이다. 이 표가 백엔드 경로 설계를 강제한다.**
`/api/` 밖에 있는 백엔드 엔드포인트는 배포에서 `location /`에 걸려 **Next.js가 받는다** — 404가 나는데
로컬(`localhost:8080` 직접 호출)에서는 nginx가 없어 멀쩡히 돌아서, **로컬에서만 되는 기능**이 된다.

⚠️ **EC2 안에서 `127.0.0.1:8080`은 백엔드가 아니라 Jenkins(Jetty)다 — 백엔드는 8081이다**(위 표와
§4-1의 blue = 3000/8081). SSH로 들어가 `curl 127.0.0.1:8080/api/v1/...`을 치면 **Jetty의 404**가
돌아오는데, 그 404를 배포 실패로 오진하기 쉽다. 바로 위 문단의 "로컬 `localhost:8080`"은 **개발
머신에서 `bootRun`으로 띄운 백엔드**를 말하는 것이라 같은 숫자가 서버에서는 다른 것을 가리킨다.
서버에서 백엔드를 직접 치려면 `127.0.0.1:8081`(현재 색이 green이면 8091)이다.

실제로 두 번 걸렸다. ①액추에이터를 `/api/actuator`로 옮긴 것(`application.yaml` 주석) ②Spring OAuth
엔드포인트 — `/oauth2/authorization/*`·`/login/oauth2/code/*`가 기본값이라 배포에서 소셜 로그인이
물리적으로 불가능했고, `/api/oauth2/...`·`/api/login/oauth2/code/...`로 옮겨 해소했다(2026-07-31,
ADR-0005 결정 11). **새 백엔드 경로를 만들 때마다 `/api/` 아래인지 먼저 볼 것.**

**`proxy_pass` 끝의 슬래시 유무가 동작을 가른다.**

- 슬래시 없음 → 원본 경로를 **그대로** 전달 (`/project/` → Jenkins가 `/project/` 수신)
- 슬래시 있음 → 접두사를 **제거**하고 전달 (`/project/` → `/`)

Jenkins는 슬래시 **없는** 쪽이어야 한다(§6 참조). 슬래시를 붙여 접두사를 떼면 Jenkins가
뿌리는 절대 경로 링크(`/static/...`)가 전부 `location /`에 걸려 프론트로 새 나간다.

```bash
sudo nginx -t && sudo systemctl reload nginx

# 정규화 검증 — 앞의 둘은 301 + Location: https://www.dero.life/..., 마지막은 301이면 안 된다
curl -sI https://dero.life/collection | grep -iE '^HTTP|^location'
curl -sI http://dero.life/           | grep -iE '^HTTP|^location'
curl -sI https://www.dero.life/api/v1/posts?size=1 | head -1
```

### 4-1. blue-green 스위치 — 색은 upstream 파일이 정한다

배포는 **심볼릭 링크 하나를 바꾸고 reload하는 것**이 전부다. 링크가 가리키는 파일이 곧 현재 색이라
상태를 어디에도 따로 안 적는다 — 배선 자체가 상태다. 결정 근거는 ADR-0026.

```
/var/lib/dero/nginx/            (jenkins:jenkins 소유 — /etc/nginx 밖)
├── active.conf   → upstream-green.conf     ← 이 링크가 스위치
├── upstream-blue.conf    3000 / 8081
└── upstream-green.conf   3010 / 8091       ← 레포 infra/nginx/ 가 정본, 배포가 매번 덮는다
```

`dero.conf`의 `include /var/lib/dero/nginx/active.conf;`가 이 파일을 http 컨텍스트로 가져온다.
**이 파일이 없으면 `nginx -t`가 실패하고 nginx가 안 뜬다.**

```bash
readlink /var/lib/dero/nginx/active.conf        # 현재 색
sudo nginx -T | grep -A2 '^upstream dero_'      # 로드된 설정에 실재하는지
scripts/deploy-switch.sh status                 # 색 + 양쪽 컨테이너
```

#### 호스트 선행 조건 (사람이 최초 1회 — 2026-08-06 실행 완료)

**순서가 중요하다.** 링크를 먼저 만들지 않고 새 `dero.conf`를 반영하면 `nginx -t`가 include 대상
부재로 실패한다(안전한 방향이지만 최초 전환에서 막힌다).

```bash
# ① 링크 디렉터리 — /etc/nginx 밖에 두는 이유는 ADR-0026 결정 2
sudo mkdir -p /var/lib/dero/nginx && sudo chown jenkins:jenkins /var/lib/dero/nginx

# ② 링크를 blue로 먼저 만든다 (이 시점 blue = 3000/8081 = 기존 컨테이너라 무변화)
sudo install -o jenkins -g jenkins -m 644 upstream-blue.conf /var/lib/dero/nginx/
sudo -u jenkins ln -sfn /var/lib/dero/nginx/upstream-blue.conf /var/lib/dero/nginx/active.conf

# ③ sudoers 드롭인 — 설치 전에 반드시 visudo로 검증한다
sudo visudo -cf /tmp/dero-nginx-sudoers        # 내용: 아래 한 줄
sudo install -o root -g root -m 0440 /tmp/dero-nginx-sudoers /etc/sudoers.d/dero-nginx
sudo visudo -c                                  # 전체 재검증

# ④ 그 다음에 새 dero.conf 반영
sudo nginx -t && sudo systemctl reload nginx
```

```
jenkins ALL=(root) NOPASSWD: /usr/sbin/nginx -t, /bin/systemctl reload nginx
```

인자까지 정확히 일치해야 통과한다 — `nginx -t`에 다른 플래그를 붙이면 sudo가 거부한다.
확인: `sudo -u jenkins sudo -n -l`.

⚠ **이 sudoers를 보안 경계로 읽지 마라.** `id jenkins`가 `groups=113(jenkins),988(docker)`라
**jenkins는 docker 소켓으로 이미 root 등가**다(2026-08-06 실측). 이 배치의 값은 권한 축소가
아니라 **배포 스크립트가 TLS·Jenkins 라우팅을 실수로 못 건드리는 것**이다. 근거는 ADR-0026 결정 2.

#### 롤백

```bash
scripts/deploy-switch.sh rollback     # 링크만 되돌린다. 재빌드·재기동 없음
```

**실행 위치가 문제다** — `~/dero`는 git 체크아웃이 아니라(§5) 이 스크립트가 없다. 실물이 있는
곳은 Jenkins 워크스페이스 `/var/lib/jenkins/workspace/dero-deploy`이고 `jenkins` 소유다.
사람이 직접 칠 거면 `sudo -u jenkins`로 그 디렉터리에서 돌리거나, 레포에서 `scripts/`·
`infra/nginx/`를 `scp`로 올려 두어라. **롤백 창은 다음 배포까지**이고 그 이상은 Docker Hub
번호 태그 재배포다.

⚠ **지금은 색이 green 한 벌뿐이라 `rollback`이 돌 곳이 없다**(2026-08-06 기준). 첫 전환이
green만 만들었고 blue 자리는 비어 있다 — `docker compose -p dero-blue start`가 "컨테이너 없음"으로
죽는다. **다음 배포가 blue를 만들고 나서야 `rollback` 한 줄이 성립한다.** 그때까지 되돌릴 수단은
Docker Hub 번호 태그 재배포뿐이다.

---

## 5. Docker Compose — 3계층

생명주기를 일부러 분리했다. `dero` 프로젝트의 `--remove-orphans`가 DB를 걷어가지 못하게 하려는 것.

| 프로젝트 | 파일 | 서비스 | 누가 띄우나 |
|---|---|---|---|
| `dero-blue` / `dero-green` | `compose.yaml` | frontend, backend | **Jenkins가 매 배포마다, 노는 색 쪽으로** |
| `dero-data` | `compose.data.yaml` | postgres, redis | **사람이 최초 1회, 수동** |
| `dero-observability` | `compose.observability.yaml` | prometheus, grafana (elasticsearch·kibana·filebeat은 DERO-384·386이 추가) | **사람이 수동** |

- **앱 계층은 색이 둘이고 compose 파일은 한 벌이다.** `compose.yaml`에 `name:`이 없고 CLI
  `-p dero-blue` / `-p dero-green`이 프로젝트 이름을 정한다. 갈리는 것은 호스트 포트뿐이며
  `FRONTEND_PORT`·`BACKEND_PORT`를 `deploy-switch.sh`가 환경변수로 준다(셸 환경이 `.env`보다
  우선). **`-p` 없이 돌리면 프로젝트 이름이 디렉터리명이 되므로 항상 붙여라.**
- 색별 프로젝트는 **각자 `default` 네트워크를 가진다** — `INTERNAL_API_ORIGIN: http://backend:8080`은
  같은 색 안에서 해석되고 색끼리 섞이지 않는다. 단 `dero-data` 위에서는 양쪽 backend가 같은
  `backend` 별칭을 받아 Prometheus 스크레이프가 겹침 창에 라운드로빈한다(ADR-0026 결정 7).
- **`mem_limit`이 걸려 있다** — backend 2g · frontend 512m. 없으면 JVM이 cgroup이 아니라 호스트
  전체를 기준으로 힙 상한을 잡아(실측 `MaxHeapSize` 3.9GiB) 색 둘이 여유를 넘긴다. swap 0이라
  초과는 OOM kill이고 희생자가 서비스 중인 색일 수 있다.
- **옛 단일 프로젝트 `dero`는 없다** — 전환 전 컨테이너 `dero-frontend-1`·`dero-backend-1`은
  `stop` 후 `rm`으로 정리했다(2026-08-06). 앱 계층에 남은 것은 색뿐이다.
- 네트워크 `dero-data`는 `compose.data.yaml`이 만들고, 나머지 둘이 `external: true`로 붙는다.
- 백엔드는 서비스명을 네트워크 별칭으로 써서 붙는다 — `jdbc:postgresql://postgres:5432/...`.
- 관측 계층의 배선·운영은 `docs/context/observability.md`가 정본이다(여기엔 적지 않는다).

### ⚠ 함정 — Jenkins는 `compose.data.yaml`·`compose.observability.yaml`을 절대 적용하지 않는다

`Jenkinsfile`의 명령에 `-f`가 없다:

```
docker compose -p dero build --pull          # 빌드는 색과 무관 — 이미지 이름은 `image:` 키에서 온다
scripts/deploy-switch.sh                     # 내부에서 docker compose -p dero-<색> up -d
```

`-f`가 없으면 Compose는 **표준 이름만** 찾는다(`compose.yaml` → `compose.yml` →
`docker-compose.yaml` → `docker-compose.yml`). `compose.data.yaml`도 `compose.observability.yaml`도
이 목록에 없다. `-p`는 프로젝트 이름일 뿐 파일 선택과 무관하다.

**결론: 데이터 계층이나 관측 계층 설정을 바꾸면 EC2에서 손으로 재적용해야 한다.**

### ⚠ `.env`가 계층마다 다르다 — compose는 **compose 파일이 있는 디렉터리**의 `.env`를 읽는다

- Jenkins가 도는 `compose.yaml` → **Jenkins 워크스페이스의 `.env`**
  (`/var/lib/jenkins/workspace/<잡이름>/.env`)
- 사람이 도는 `compose.data.yaml`·`compose.observability.yaml` → **`~/dero/.env`**

**한쪽에 넣은 값은 다른 쪽에서 안 보인다.** `GRAFANA_ADMIN_PASSWORD`를 Jenkins 워크스페이스에
넣으면 `~/dero`에서 올리는 관측 스택은 그 값을 못 찾아 `up -d`가 멈춘다 — 그런데 오류 메시지는
"환경변수가 없다"이지 "다른 파일을 봤다"가 아니라서, 값을 방금 넣은 사람일수록 오래 헤맨다.
`--env-file`이나 `--project-directory`로 바꿀 수는 있지만 **지금은 계층별로 나뉘어 있다는 것이
사실이고, 그대로 둔다.**

### ⚠ `~/dero`는 git 체크아웃이 아니다 (실측 2026-08-05)

`git status`가 `not a git repository`이고 내용물은 **손으로 올린 `compose.yaml`·`compose.data.yaml`
둘뿐**이다. 그래서 **레포에 파일을 추가해도 `git pull` 한 번으로 서버에 생기지 않는다** — 새 파일은
`scp`로 올려야 하고, 이 사실이 "관측 계층은 수동"의 실제 비용이다.

특히 `compose.observability.yaml`은 **혼자서는 못 돈다** — `./observability/**`를 읽기 전용으로
마운트하고 그 상대 경로는 compose 파일이 있는 디렉터리 기준이다. 디렉터리가 없으면 도커가 빈
디렉터리를 붙여 Prometheus가 설정을 못 찾고, Grafana는 데이터소스·대시보드 없이 뜬다.

```bash
# 로컬 레포 루트에서 — compose 파일과 설정 디렉터리를 세트로 올린다
scp -i ~/.ssh/<키>.pem compose.observability.yaml ubuntu@www.dero.life:~/dero/
scp -i ~/.ssh/<키>.pem -r observability ubuntu@www.dero.life:~/dero/
```

```bash
cd ~/dero
sudo docker compose -f compose.data.yaml up -d              # -p 불필요 (파일에 name: dero-data)
sudo docker compose -f compose.observability.yaml build     # Nori 커스텀 ES 이미지 — Jenkins가 안 짓는다
sudo docker compose -f compose.observability.yaml up -d
```

실제로 물린 적 있다 — `ports: '127.0.0.1:5432:5432'`가 커밋된 뒤에도 컨테이너에 반영되지
않아 SSH 터널이 `Connection refused`를 받았다(2026-07-29).

### 스키마 생성은 Flyway가 한다

- `application.yaml`: `ddl-auto: validate` — **Hibernate는 테이블을 만들지 않는다.**
- `backend/dero-api/src/main/resources/db/migration/V1__baseline.sql`을 Flyway가 **부팅 시점 1회** 실행한다.
- 따라서 **DB를 비웠으면 백엔드를 재시작**해야 스키마가 다시 생긴다.
- 시딩 데이터는 Flyway 밖이다(ADR-0006 결정 9) — 별도로 넣어야 한다.

### PG18 볼륨 경로

PG18부터 `PGDATA=/var/lib/postgresql/18/docker`다. 튜토리얼대로 `/var/lib/postgresql/data`에
마운트하면 데이터가 볼륨 밖에 남아 컨테이너를 지울 때 사라진다. 정상 마운트는 이것:

```bash
sudo docker inspect -f '{{range .Mounts}}{{.Name}} → {{.Destination}}{{end}}' dero-data-postgres-1
# dero-data_postgres-data → /var/lib/postgresql
```

---

## 6. Jenkins

- 버전 2.568.1 / Jetty 12.1.8. **도커가 아니라 호스트에 설치된 java 프로세스**다.
- 포트 8080. **`*:8080`(전 인터페이스)으로 듣지만 외부에서는 닿지 않는다 — 막는 것은 ufw다**(§7).
  `https://www.dero.life/project/`가 유일한 입구. AWS 보안 그룹이 아니다 — 우리는 EC2만 받았고
  콘솔 접근이 없다(2026-08-06 실측 정정).
- 접두사 `/project`는 systemd 드롭인으로 준다:

```
/etc/systemd/system/jenkins.service.d/override.conf
─────────────────────────────────────────────────
[Service]
Environment="JENKINS_PREFIX=/project"
```

```bash
sudo systemctl daemon-reload && sudo systemctl restart jenkins
systemctl show jenkins -p Environment | tr ' ' '\n' | grep PREFIX
curl -sI http://127.0.0.1:8080/project/ | head -3   # 200/403 + Path=/project 쿠키면 성공
```

`systemctl edit`은 임시 파일이 비면 조용히 취소된다. 저장이 안 되면 드롭인 파일을 직접 써라.

### ⚠ 축소 마이그레이션은 **빌드가 두 번 돈다** — 설계된 값이다 (실측 2026-08-11)

컬럼·테이블 삭제, `NOT NULL` 강화 같은 축소 마이그레이션이 섞이면 `Validate Migrations` 단계가
막고 빌드가 **실패로 끝난다**. 여는 방법은 잡 파라미터 `ALLOW_DESTRUCTIVE_MIGRATION=true`이고,
그 파라미터는 **이 `Jenkinsfile`로 빌드가 한 번 돈 뒤에야 잡에 등록된다** — 그래서 push 트리거로
도는 첫 빌드는 파라미터 등록만 하고 가드에 막히고, 사람이 **Build with Parameters**로 켜서 다시
돌린다. 승인이 push가 아니라 사람의 클릭이어야 한다는 것이 그 두 번의 뜻이다(ADR-0026 결정 5,
DERO-586).

**첫 실패를 배포 실패로 오진하지 말 것** — 로그 끝의 `ALLOW_DESTRUCTIVE_MIGRATION을 켜고 다시
돌린다`가 그 신호다. 켜기 전에 확인할 것: blue-green 스위치 창에서 **서비스 중인 색의 옛 코드가
새 스키마를 본다**. V14(2026-08-11 데스크피드)처럼 옛 코드가 읽던 컬럼을 떨어뜨리면 그 창 동안
옛 색이 깨지므로, 코드와 마이그레이션을 같은 배포로 올리는 것이 전제다.

### 트리거 — GitLab이 Jenkins를 호출한다 (반대가 아니다)

```
GitLab(gitlab.example.com) ──HTTP POST──► nginx:443 /project/... ──► Jenkins
```

Jenkins가 GitLab을 감시하는 구조가 **아니다.** 웹훅은 GitLab이 거는 전화이고, 그래서
Jenkins가 인터넷에서 닿아야 한다. 인바운드가 싫으면 `pollSCM`으로 방향을 뒤집을 수 있다
(반응은 느리지만 주소·토큰이 어긋나 조용히 안 도는 사고가 없다).

- 웹훅 URL에 접두사를 반영해야 한다. GitLab plugin 경로도 `/project/`라 **`/project/project/<잡이름>`**
  형태가 되는데 오타가 아니다(앞=Jenkins 접두사, 뒤=플러그인 고정 경로).
- Jenkins 설정의 **Jenkins URL**은 `https://www.dero.life/project/`여야 한다.
- 배포 스테이지는 `main`에서만 돈다(`Jenkinsfile`의 `onDeployBranch()`). **`main`에 `Jenkinsfile`·
  compose·Dockerfile이 없으면 웹훅이 와도 아무 일도 안 일어난다.**
- Jenkins는 레포 루트 `.env`를 요구한다(gitignore 대상, `.env.example` 참고).

---

## 7. 포트 인벤토리

외부 스캔 실측 2026-07-29, **3000·8081·3010·8091은 2026-08-06 재측정**.

| 포트 | 외부 | 프로세스 | 비고 |
|---|---|---|---|
| 22 | 열림 | sshd | DataGrip SSH 터널 경로 |
| 80 | 열림 | nginx | 443으로 301 |
| 443 | 열림 | nginx | 정상 입구 |
| 3000 | 막힘 | docker-proxy → **blue** frontend | `127.0.0.1` 바인딩(2026-08-06). **frontend가 점유하므로 Grafana는 3000을 못 쓴다** |
| 3001 | 막힘 | docker-proxy → grafana | `127.0.0.1` 바인딩. 3000 충돌 회피용 호스트 포트 |
| 3010 | 막힘 | docker-proxy → **green** frontend | `127.0.0.1` 바인딩 |
| 8080 | 막힘 | Jenkins | 의도대로 |
| 8081 | 막힘 | docker-proxy → **blue** backend | `127.0.0.1` 바인딩(2026-08-06) |
| 8091 | 막힘 | docker-proxy → **green** backend | `127.0.0.1` 바인딩 |
| 5432 | 막힘 | postgres | 컨테이너 내부 전용 |
| 5601 | 막힘 | kibana | `127.0.0.1` 바인딩 — SSH 터널로만 |
| 9090 | 막힘 | prometheus | `127.0.0.1` 바인딩 — SSH 터널로만 |
| 9200 | 막힘 | elasticsearch | `127.0.0.1` 바인딩. **외부 노출 금지**(인증 없음) |
| 8989 | 열림 | Apache 2.4.66 | ❓ 정체 불명 — 우리 것 아님. 확인 필요 |
| 18080 | 없음 | — | 낡은 Jenkins URL이 가리키던 죽은 포트 |

3001·5601·9090·9200은 아직 스캔 실측이 아니다 — `compose.observability.yaml`이 규정하는
**바인딩 값**이다(`docs/context/observability.md` §2). 띄운 뒤 아래 스캔으로 확인하라.

**3000·8081 평문 노출은 2026-08-06에 닫혔다.** 그전까지 두 포트는 `0.0.0.0` 바인딩이라
nginx·TLS를 우회해 평문으로 응답했고(측정: `3000 → 200`, `8081 → 401`), 그 경로로 오간
자격증명은 암호화되지 않았다. `compose.yaml`의 `ports:`를 `127.0.0.1:...`로 바꿔(ADR-0026 결정 3)
컨테이너 쪽에서 막았다.

### 방화벽은 ufw다 — 그리고 **Docker는 ufw를 우회한다**

**AWS 보안 그룹은 우리 손에 없다.** 이 인스턴스는 EC2만 받은 것이고 콘솔 접근이 없다.
호스트 방화벽은 **ufw**이고, 허용 목록이 이게 전부다(실측 2026-08-06).

```
Status: active · Default: deny (incoming), allow (outgoing), deny (routed)
[1] 22   [2] 443   [3] 8989/tcp   [4] 80/tcp
```

그래서 Jenkins는 `*:8080`으로 듣는데도 외부에서 닿지 않는다(§6). 8989는 ufw가 **명시적으로
허용**하고 있으며 우리 것이 아니다(§10 미결).

⚠ **그런데 3000·8081은 ufw가 default-deny인데도 인터넷에 열려 있었다.** Docker의 publish는
`nat/PREROUTING`의 `DOCKER` 체인에서 DNAT되는데, 이건 ufw의 `filter/INPUT`보다 **먼저** 처리되고
이어지는 FORWARD에서도 Docker 규칙이 ufw 앞에 선다. **즉 ufw 규칙으로는 컨테이너 포트를 못 막는다.**

```bash
sudo iptables -t nat -S DOCKER | grep -E '3010|8091'
# -A DOCKER -d 127.0.0.1/32 ! -i br-... --dport 8091 -j DNAT --to 172.19.0.6:8080
#           ^^^^^^^^^^^^^^^ 이 제약이 곧 방어다. 없으면 어디서 와도 통과한다
```

**결론: `compose.yaml`의 `127.0.0.1:` 바인딩이 보조 방어가 아니라 유일한 방어다.**
컨테이너 포트를 새로 publish할 때 호스트 IP를 빼먹으면 **ufw가 켜져 있어도 그 순간 인터넷에
열린다.** 이 트랩은 `compose.yaml`·`compose.data.yaml`·`compose.observability.yaml` 셋 다 해당한다.

```bash
for p in 80 443 8080 8081 3000 3010 8091 5432; do nc -z 203.0.113.10 $p && echo "$p OPEN" || echo "$p closed"; done
sudo ss -tulpn                     # 서버 안에서 누가 듣는지
```

---

## 8. DataGrip — DB 접속

**nginx로는 붙을 수 없다.** PostgreSQL은 HTTP가 아니라서 nginx `http {}` 블록의 `proxy_pass`가
통하지 않는다(경로 개념도 없다). nginx 설정에 `/db/` location이 남아 있다면 죽은 설정이니 지워라.

**SSH 터널이 정답이다.**

| 탭 | 항목 | 값 |
|---|---|---|
| SSH | Host | `www.dero.life` (`dero.life`는 DNS 없음 — §2) |
| SSH | User / Auth | `ubuntu` / Key pair |
| Connection | Host / Port | `localhost` / `5432` |
| Connection | Database | `.env`의 `POSTGRES_DB` |

DataGrip은 터널이 켜져 있으면 Connection 탭의 Host를 **서버 입장에서** 해석한다. 그래서
`localhost`가 맞다. `Connection refused`가 나면 서버 `127.0.0.1:5432`에 아무도 없다는 뜻이고,
원인은 대개 §5의 `compose.data.yaml` 미적용이다.

로컬 **앱**까지 운영 DB에 물리려면 §9 — Flyway를 끄지 않으면 운영 스키마가 바뀐다.

---

## 9. 로컬 앱을 운영 DB에 물리기 (에러 재현용)

운영 데이터를 로컬 볼륨에 계속 동기화하는 게 번거로워서 터널로 바로 붙는 방식. 유효한
선택이지만 **Flyway 때문에 그냥 URL만 바꾸면 안 된다.**

### 절차

```bash
# 1. 터널 — 5432를 피한다(로컬 컨테이너가 이미 쓴다). -N 은 셸 없이 터널만 유지
ssh -N -L 55432:127.0.0.1:5432 ubuntu@www.dero.life -i ~/.ssh/<키>.pem
```

`backend/dero-api/.env.local`에 네 줄. **`application-local.yaml`은 건드리지 마라** — 커밋되는
파일이라 운영 계정이 리포에 박힌다. `spring.config.import`로 읽힌 파일이 불러온 쪽보다
우선순위가 높아서 `.env.local`이 이긴다(`application-local.yaml:5`).

```properties
spring.datasource.url=jdbc:postgresql://localhost:55432/dero_be
spring.datasource.username=<운영 POSTGRES_USER>
spring.datasource.password=<운영 POSTGRES_PASSWORD>
spring.flyway.enabled=false
```

키는 **Spring 프로퍼티 키**여야 한다. `SPRING_DATASOURCE_URL=` 같은 셸 스타일은 완화 바인딩이
프로퍼티 파일에 적용되지 않아 **에러 없이 조용히 안 붙는다**(ADR-0010 결정 4).

되돌릴 땐 네 줄을 지운다. `.env.local`은 gitignore 대상이라 팀에 영향이 없다.

### Flyway를 왜 끄나

**로컬 부팅마다 무조건 돈다.** `spring-boot-starter-flyway`가 컴파일 의존성이라 자동설정이
켜지고 기본값이 `enabled=true`다. `flyway_schema_history`를 읽어 미적용 버전만 실행하므로
**버전·체크섬이 맞으면 no-op**이지만, 운영 DB를 물면 두 가지가 걸린다.

| 상황 | 결과 |
|---|---|
| V1 그대로, 체크섬 일치 | ✅ 무해 |
| 네 브랜치가 V1을 고쳤고 운영은 옛 V1 (또는 반대) | ❌ 부팅 실패 — `Migration checksum mismatch` |
| 스키마 동결 후 누군가 V2 추가 | ☠️ **로컬 부팅이 운영 스키마를 마이그레이션한다** |

앞의 둘은 시끄럽게 실패해서 안전하다. 마지막이 조용히 일어나고 되돌릴 수 없다. **2026-07-31부터
V1은 동결이고 변경은 V2+로만 들어간다**(`.claude/rules/backend/flyway-migration.md` §1) — 새
마이그레이션이 언제든 늘어나는 지금은 세 번째 줄이 실제 위험이라, 끄는 것은 선택이 아니라 필수다.

끄면 `ddl-auto: validate`가 안전망이 된다(엔티티와 운영 스키마가 다르면 부팅 실패). 다만
identity 소유 시퀀스가 `information_schema.sequences`에서 빠지는 문제로 **스키마가 멀쩡해도**
`missing sequence`가 뜰 수 있다 — 메시지를 액면대로 믿지 말 것.

`clean`(전체 삭제)은 Boot 3부터 `spring.flyway.clean-disabled=true`가 기본이라 실수로 돌 일은 없다.

**끄고 나서 도로 켜지 않으면 며칠 뒤 엉뚱한 자리에서 터진다.** 2026-08-07 실측: `.env.local`에
`spring.flyway.enabled=false`가 살아 있는 채(운영 DB 줄만 도로 주석 처리) 로컬 컨테이너에 붙어
있었고, 그래서 V7 `placement_hashtag`가 영영 안 들어가 부팅이
`Schema validation: missing table [placement_hashtag]`로 죽었다. **증상이 스키마 얘기라
마이그레이션 파일·엔티티를 먼저 뒤지게 되지만 못은 프로퍼티 하나다** — 로그에 **Flyway 줄이 한
줄도 없으면** 그게 신호다(정상이면 `Current version of schema "public": N`이 찍힌다). 진단은
`--debug` 조건 리포트: `FlywayAutoConfiguration ... found different value in property
'spring.flyway.enabled'`. `.env.local`은 `application-local.yaml`보다 우선순위가 높아 yaml에
아무것도 없어도 이 파일 한 줄이 이긴다. 운영 DB에서 손 뗄 때 **datasource 줄과 이 줄을 같이**
주석 처리한다.

### 터널 자체의 함정 (실측)

- **터널 왕복 하나가 25ms다 — 키 입력마다 치는 엔드포인트는 이것만으로 체감이 무너진다.**
  2026-08-07 실측: `GET /products/suggestions`가 중앙값 78ms였고 그중 ES 25ms(쿼리 시간이 아니라
  `GET http://127.0.0.1:9200/` 루트 핑도 똑같이 25ms), 나머지가 Postgres 왕복이다. 로컬
  컨테이너면 각 1ms 미만이라 같은 코드로 5~10ms다. **증상이 "자동완성이 느리다"라
  디바운스·트랜잭션·쿼리 설계를 먼저 의심하게 되지만**, ES·Postgres·Redis 터널
  (`ssh -N -L 55432|9200|6379 ... ubuntu@www.dero.life`)이 떠 있는지부터 본다 —
  `lsof -nP -iTCP -sTCP:ESTABLISHED | grep -E ':(55432|9200|6379)'`. 로컬 데이터 컨테이너가 죽어
  있으면(`docker ps -a`에 `Exited`) 터널을 켜 놓은 채 잊었을 확률이 높다.
- **터널을 열어 둔 채 `./gradlew test`를 돌리면 운영 ES 인덱스가 날아간다** (2026-08-08 실측,
  DERO-499). `spring.elasticsearch.uris`가 없으면 Boot 기본값이 `localhost:9200`이고,
  `ssh -L 9200`이 떠 있는 머신에서 그것은 **운영 ES**다. ES 통합 테스트는
  `@DynamicPropertySource`로 컨테이너 주소를 덮어써 안전하지만 **ES와 무관한 컨텍스트도
  `ApplicationReadyEvent`에서 `prepareIndex`를 돈다** — 인덱스 정의 파일에 필드를 하나 더한
  브랜치에서 테스트를 돌리자 "매핑이 낡았다"고 판정해 **운영 `products` 별칭을 테스트 DB로 만든
  0건 인덱스로 스왑하고 옛 인덱스를 지웠다.** 증상은 "운영 검색만 통째로 0건"이고 **에러도
  경고도 없다**(카탈로그·다른 인덱스는 멀쩡해서 배포 사고로 오진하기 쉽다). 못은
  `application-test.yaml`의 `spring.elasticsearch.uris: http://127.0.0.1:1` — 닫힌 포트로 못 박아
  터널이 열려 있어도 운영을 못 본다. **`application-local.yaml`은 아직 안 막혀 있다** —
  `bootRun`으로 로컬 서버를 띄우는 것도 같은 경로다(터널 켜 두고 잊었는지
  `lsof -nP -iTCP -sTCP:LISTEN | grep 9200`). 복구는 `POST /api/v1/admin/search/reindex` 1회
  (정본은 Postgres라 데이터 손실은 없다).

### 남는 위험

- 로컬에서 만든 테스트 데이터가 전부 운영 DB에 쌓인다. **물고 있는 동안 팀에 알려라** —
  남들 눈엔 원인 불명의 데이터 오염으로 보인다.
- Redis는 여전히 로컬이다(`application-local.yaml`). 리프레시 토큰만 로컬에 남아 운영 세션과 어긋난다.
- 앱을 컨테이너로 띄우면 컨테이너 안의 `localhost`는 자기 자신이다 — `host.docker.internal:55432`가
  필요하다. 호스트에서 `bootRun`으로 띄우는 게 문서화된 로컬 흐름이고, 그때는 `localhost`가 맞다.

**데이터를 보기만 할 거면 DataGrip만 붙여라**(§8). 앱 전체를 물릴 이유가 분명할 때만 이 절차를 쓴다.

---

## 10. 미해결

- [x] apex `A @ → 203.0.113.10` 추가 + nginx 301로 www 정규화 (2026-08-03, §4)
- [x] 프론트 API 주소를 상대경로(`/api/v1`)로 전환 (2026-08-03, ADR-0005 결정 12-개정)
- [x] `develop → main` 머지 + 웹훅 배선 (2026-08-06 — `dero-deploy` 잡이 `*/main`을 빌드하고 build 93 SUCCESS)
- [x] 무중단 배포 — blue-green 전환 완료 (2026-08-06, ADR-0026 · §4-1)
- [x] 3000·8081 평문 노출 — 컨테이너를 `127.0.0.1` 바인딩으로 닫음 (2026-08-06, §7). **이게 끝이다** — 방화벽은 ufw이고 Docker publish는 ufw를 우회하므로 방화벽 쪽에 할 일이 없다(§7)
- [x] 옛 `dero` 프로젝트 컨테이너 정리 (2026-08-06 `stop` → `rm`, §5)
- [ ] `compose.data.yaml` 재적용 — postgres 포트 미퍼블리시
- [ ] Jenkins URL을 `https://www.dero.life/project/`로 변경 — 현재 죽은 `:18080` 주소
- [ ] 8989 Apache·8988/29418 java 프로세스 정체 확인 — **ufw가 8989를 명시적으로 허용 중이다**(§7). 우리가 만든 규칙이 아니라면 누가 왜 열었는지 확인하고, 우리 것이 아니면 교육기관 쪽에 문의한다. 29418은 Gerrit SSH 기본 포트다(추정 — 확인 필요)
