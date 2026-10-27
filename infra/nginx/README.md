# nginx — 호스트 설정 사본과 적용 절차

`dero.conf`는 EC2 `/etc/nginx/sites-available/dero`의 사본이다(nginx 1.24.0 Ubuntu).

**정본은 호스트 실물이고 이 파일은 자동 동기화되지 않는다.** 배포도 Jenkins도 nginx를 건드리지
않으므로, 양쪽을 맞추는 것은 사람 일이다. 라우팅을 왜 그렇게 갈랐는지는
`docs/context/deployment.md` §4가 정본이다 — 여기 복사하지 않는다.

**EC2에는 레포 체크아웃이 없다**(실측 2026-08-05: `~/dero`는 `compose.yaml`·`compose.data.yaml`만
손으로 올려 둔 디렉터리이고 `.git`이 없다). 그래서 드리프트 확인은 **로컬에서 실물을 끌어와** 한다.

```bash
# 로컬 레포 루트에서
ssh -i ~/.ssh/<키>.pem ubuntu@www.dero.life 'sudo cat /etc/nginx/sites-available/dero' \
  | diff - infra/nginx/dero.conf
```

`dero.conf`는 **목표 상태**다. 각 자리에 `[383]`·`[442]`·`[0026]`으로 근거를 달아 뒀고, 적용이
끝나면 위 `diff`가 아무것도 뱉지 않아야 한다.

**2026-08-06 기준 실물과 일치한다** — blue-green 전환(`[0026]`, ADR-0026)을 반영하면서 파일
전체를 덮었고 `diff`가 비었다.

⚠ **`[0026]` 부분은 파일만 덮으면 안 된다.** `include /var/lib/dero/nginx/active.conf;`가 있어서
**그 파일이 없으면 `nginx -t`가 실패하고 nginx가 안 뜬다.** 링크를 먼저 만들고 그 다음 이 파일을
반영해야 한다 — 순서와 호스트 선행 조건은 `docs/context/deployment.md` §4-1이 정본이다.

**손으로 한 줄씩 넣지 말고 파일을 그대로 덮는 것이 낫다** — 차이가 다섯 곳이라 옮겨 적다 빠뜨리기
쉽고, `diff`가 비었는지로 성공을 판정할 수 있다.

### 이 사본으로 실제 검증한 것 (2026-08-05, `nginx:1.24-alpine` 컨테이너 + 자체 서명 인증서)

호스트와 **같은 1.24.0**에 이 파일을 그대로 물려 띄우고 측정했다. 업스트림(8081·3000·8080)이 없으니
프록시 경로는 502가 정답이다 — 그 502가 "라우팅은 됐다"는 증거다.

| 확인 | 결과 |
|---|---|
| `nginx -t` (1.24.0) | `syntax is ok` · `test is successful` |
| `/api/actuator/prometheus` | **403** (deny 적중) |
| `/api/actuator/health` | **502** — deny에 안 걸린다. `=` 정확 일치가 접두사를 안 삼킨다 |
| `/` (프론트) | 502 (정상 라우팅) |
| HTTP 버전 | **HTTP/2** (`listen ... http2` 파라미터가 1.24에서 먹는다) |
| HSTS | `strict-transport-security: max-age=31536000` — **403 응답에도 붙는다**(`always`) |
| apex | `301 https://www.dero.life/desk-feed` (유지) |
| 업스트림 `Connection` (일반 요청) | **`close`** — 바꾸기 전에는 항상 `upgrade`였다 |
| 업스트림 `Connection` (HTTP/1.1 + `Upgrade: websocket`) | **`upgrade`** + `Upgrade: websocket` 통과 |

- 업스트림에 실제로 나간 헤더는 컨테이너 안에서 `nc -l -p 8081`로 요청을 받아 확인했다.
- **HTTP/2로 오면 `$http_upgrade`가 항상 비어 `close`가 된다** — h2가 `Upgrade`·`Connection` 헤더를
  금지하기 때문이다. WebSocket을 붙일 날에는 그 클라이언트가 HTTP/1.1로 핸드셰이크한다.
- 검증하지 않은 것: **실제 TLS 인증서 경로·certbot 갱신**(자체 서명으로 대체했다),
  `client_max_body_size` 상한 동작. 호스트에서 `sudo nginx -t`는 여전히 필수 게이트다.

---

## 이번에 넣는 것 — actuator `/prometheus` 차단 (DERO-383)

### 왜

`application.yaml`이 `management.endpoints.web.exposure.include`에 `prometheus`를 넣었다. actuator
base-path가 `/api/actuator`이고 nginx가 `/api/`를 **통째로** 프록시하므로, 그 설정만으로 이 주소가
인터넷에 열린다.

```
https://www.dero.life/api/actuator/prometheus
```

새 나가는 것: JVM 힙·GC·스레드, **엔드포인트별 호출량과 응답시간**, DB 커넥션 풀 상태. 공격 자체는
아니지만 정찰에 그대로 쓰이고 트래픽 규모가 외부에 노출된다.

**Spring 쪽에서 막지 않는다.** `SecurityConfig`가 `/api/actuator/**`를 `permitAll`로 두는 이유는
배포 헬스 게이트가 nginx를 우회해 **아직 트래픽이 없는 색의 포트**로 `/api/actuator/health`를
직접 치기 때문이고(`scripts/deploy-switch.sh`, ADR-0026 결정 6)
(`SecurityConfig.java:72-74`), Prometheus도 같은 결로 도커 네트워크에서 `backend:8080`을 직접 긁는다.
요청 출처로 갈라 세우는 규칙은 도커 게이트웨이 IP에 의존해 깨지기 쉬워서, ADR-0020 결정 4가
**차단 지점을 nginx 한 곳으로 고정**했다.

### 어디에

**3번 서버 블록**(`server_name www.dero.life`) 안, `location /api/`와 같은 레벨. `dero.conf`에
`▼▼▼ ... ▲▲▲`로 표시해 뒀다.

```nginx
location = /api/actuator/prometheus {
    deny all;
    access_log off;
}
```

- **`=` 정확 일치는 접두사 `location /api/`보다 항상 이긴다**(nginx 매칭 우선순위). 그래서 블록
  순서와 무관하고 기존 `location /api/`를 건드릴 필요가 없다.
- 1·2번 블록에는 넣지 않는다 — 둘 다 전부 301이라 apex로 들어온 요청은 www로 넘어가 이 블록에
  걸린다.
- `access_log off`는 스캐너 트래픽으로 액세스 로그가 부푸는 것을 막는다. 차단 사실은 error log에
  남는다.
- 응답은 **403**이다(404가 아니다). 존재는 드러나지만 본문은 안 나간다 — ADR-0020이 "조용한
  폴백보다 눈에 보이게 막는다"를 택한 것과 같은 결이다.

### 적용

```bash
sudo cp /etc/nginx/sites-available/dero /etc/nginx/sites-available/dero.bak.$(date +%F)  # 되돌릴 지점
sudo vi /etc/nginx/sites-available/dero            # deny 블록 추가 (또는 dero.conf를 그대로 복사)
sudo nginx -t                                      # syntax OK + test is successful 둘 다 확인
sudo systemctl reload nginx                        # restart 아니다 — reload는 무중단이다
```

**백엔드 배포보다 먼저 한다.** 순서를 뒤집으면 배포와 nginx 적용 사이 구간에서 지표가 공개된다.
`deny`만 먼저 들어간 상태는 안전하다 — 그때는 아직 엔드포인트가 404라 막을 것도 없다.

### 검증

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://www.dero.life/api/actuator/health      # 200 (유지)
curl -s -o /dev/null -w '%{http_code}\n' https://www.dero.life/api/actuator/prometheus  # 403
curl -s localhost:9090/api/v1/targets | jq '.data.activeTargets[].health'                # "up" (수집은 산다)
```

세 줄이 세트다. **`health`가 200인지 같이 봐야 한다** — 블록을 `location /api/actuator/`처럼 접두사로
잘못 쓰면 헬스체크까지 죽고, 그러면 다음 배포에서 Jenkins Verify가 30회 재시도 후 타임아웃으로
실패한다(`Jenkinsfile:95`).

### 되돌리기

```bash
sudo cp /etc/nginx/sites-available/dero.bak.<날짜> /etc/nginx/sites-available/dero
sudo nginx -t && sudo systemctl reload nginx
```

블록을 지우면 `/api/actuator/prometheus`가 다시 공개된다. 되돌릴 일이 생기면 `application.yaml`의
`exposure.include`에서 `prometheus`도 같이 빼는 것이 맞다 — 둘은 한 세트다.

---

## 같이 넣는 것 — 설정 미결 4건 (DERO-442)

사본을 뜨면서 실물에서 확인된 것들이다. 넷 다 `dero.conf`에 반영돼 있고 `[442]` 표시가 붙어 있다.

### ① `Connection: upgrade`를 조건부로

원래 `/api/`·`/` 두 location이 `proxy_set_header Connection "upgrade"`를 **무조건** 붙였다. WebSocket
핸드셰이크가 아닌 평범한 요청에도 업그레이드 의사가 실려 **업스트림 keep-alive가 매 요청 끊긴다.**
표준 형태로 바꿨다 — `map $http_upgrade $connection_upgrade`(빈 값이면 `close`)를 http 컨텍스트에 두고
두 location이 그 변수를 쓴다. **지금 WebSocket을 쓰는 기능은 없다**(있어도 이 형태가 맞다).

### ② HTTP/2

`listen 443 ssl;`에 `http2`가 없어 HTTP/1.1로만 돌았다. 3D 에셋처럼 작은 파일이 많은 페이지가
멀티플렉싱 이득을 못 받는다.

**버전이 갈린다.** `http2 on;` **지시어는 nginx 1.25.1에서 생겼다**(공식 문서 확인). 호스트는
**1.24.0**이므로 그 지시어를 쓰면 `unknown directive`로 `nginx -t`가 죽는다 — 이 버전에서는
`listen 443 ssl http2;` **파라미터가 유일한 방법**이다(1.25.1+에서는 이 파라미터가 deprecated다).
나중에 nginx를 올리면 이 줄을 지시어로 바꾼다.

### ③ TLS 공통 설정 + HSTS

`ssl_protocols`도 HSTS도 없어 nginx 기본값으로 돌고 있었다(TLSv1.2·1.3은 기본으로 켜져 있다).

**certbot의 `options-ssl-nginx.conf`를 include하지 않는다.** DNS-01 `certonly`로 발급했어서 그 파일이
호스트에 있는지 **확인되지 않았고, 없는 파일을 include하면 `nginx -t`가 실패한다.** 값을 직접 적어
두면 무엇이 켜져 있는지도 파일에서 보인다.

> ⚠ **HSTS는 되돌리기가 사실상 불가능하다.** 브라우저가 `max-age`(1년) 동안 이 호스트의 http 접근을
> **자체적으로** 차단하므로, **인증서 갱신이 실패하면 사이트가 통째로 안 열린다**(nginx를 되돌려도
> 이미 헤더를 받은 브라우저는 안 돌아온다). 적용 전에 자동 갱신이 실제로 도는지 확인할 것:
> ```bash
> sudo certbot renew --dry-run          # 성공해야 한다
> sudo systemctl list-timers | grep -i certbot   # 타이머가 걸려 있어야 한다
> ```
> 둘 중 하나라도 안 되면 **HSTS 줄만 빼고** 나머지를 적용하라. `includeSubDomains`는 넣지 않았다 —
> 아직 인증서가 없는 서브도메인(grafana 등)을 https로 강제하면 그쪽이 먼저 막힌다.

### ④ `client_max_body_size 20m`

없어서 기본 1MB였다. 지금은 업로드가 브라우저 → S3 presigned URL 직행이라 nginx 경로에 큰 본문이
없고 JSON 본문은 한참 아래지만, **`app.storage.mode=local`로 되돌리면 파일이 이 경로를 지나 즉시
걸린다**(`backend/dero-api/CLAUDE.md`). 상한이지 목표가 아니다.

### 손대지 않은 것

`/project/`의 `proxy_pass`에 끝 슬래시가 없는 것은 **의도한 것**이다(deployment.md §6). Grafana
서버 블록은 선행 조건이 없어 만들지 않는다(아래).

### 추가 검증 (383 검증 3줄에 더해서)

```bash
curl -sI --http2 https://www.dero.life/ | head -1              # HTTP/2 200
curl -sI https://www.dero.life/ | grep -i strict-transport     # max-age=31536000
curl -sI https://dero.life/ | grep -iE '^HTTP|^location'       # 301 → https://www.dero.life/ (유지)
```

되돌리기는 383과 같다 — 백업 파일을 복사하고 `nginx -t && systemctl reload nginx`. **단 HSTS는
브라우저 쪽에 남는다**(위 경고).
