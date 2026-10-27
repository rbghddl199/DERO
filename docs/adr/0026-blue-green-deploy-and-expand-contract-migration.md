# ADR-0026. 무중단 배포는 blue-green(색 두 벌 + nginx upstream 스위치) — 그 대가로 마이그레이션은 확장/축소

## 상태

**확정** — 2026-08-06, 승인 박동규.
배선 정본은 `docs/context/deployment.md`. 이 ADR은 **배포 방식**만 정한다 — 관측 스택은 [ADR-0020](0020-observability-stack.md), 시크릿·프로파일은 [ADR-0010](0010-environment-profiles-and-secrets.md) 소관이다.

## 맥락

지금 배포는 `Jenkinsfile`의 두 줄이다.

```
docker compose -p dero build --pull
docker compose -p dero up -d --remove-orphans
```

`up -d`는 **같은 이름의 컨테이너를 제거하고 새로 만든다.** 두 가지가 따라온다.

1. **다운타임.** 옛 컨테이너가 사라진 뒤 Spring Boot가 부팅을 끝낼 때까지 `127.0.0.1:8081`에 아무도 없다 — nginx가 502를 뱉는다. Flyway 검증까지 도는 부팅이라 초 단위가 아니다.
2. **더 큰 문제 — 실패해도 옛 버전으로 돌아오지 않는다.** 새 이미지가 부팅에 실패하면 `restart: unless-stopped`가 재시작 루프를 돌고, 옛 컨테이너는 이미 없다. Verify 스테이지는 빨간 불을 켜지만 **그때 서비스는 이미 내려가 있다.** 복구 수단은 Docker Hub에서 번호 태그를 pull해 사람이 손으로 올리는 것뿐이다(`Jenkinsfile` post 블록 주석).

즉 **잃는 것은 무중단이 아니라 되돌릴 능력**이다. 무중단은 그걸 고치면 따라온다.

**실측·확정 사실 (전부 기존 문서에서)**

- nginx는 **호스트 설치**(1.24.0)이고 `127.0.0.1:3000`·`127.0.0.1:8081`을 **고정 포트로 박아** 프록시한다(`infra/nginx/dero.conf`). 같은 nginx가 **Jenkins UI(`/project/`)와 TLS 종료**도 물고 있다 — 이 설정이 깨지면 배포 도구 자체에 못 들어간다.
- compose는 3계층이고 **앱 계층만** Jenkins가 띄운다. postgres·redis(`compose.data.yaml`)·관측(`compose.observability.yaml`)은 사람이 수동이다(`deployment.md` §5).
- **EC2 1대 · 4 vCPU · 총 15GiB · swap 0**, ADR-0020 시점 available 12GiB. 관측 스택이 ~5GiB를 가져가 **여유는 약 6GiB**다.
- 스키마는 Flyway가 부팅 시점에 만든다. **`V1__baseline.sql`은 2026-07-31에 이미 동결됐고**(박동규 지시, `backend/dero-api/CLAUDE.md`) 그 뒤 `V2`~`V6`가 쌓여 있다 — 버전 파일을 쌓는 워크플로 자체는 blue-green이 도입하는 것이 아니다. 이 ADR이 새로 얹는 제약은 **각 파일의 내용이 확장/축소여야 한다**는 쪽이다(결정 5).
- 리프레시 토큰은 **Redis**에 있고([ADR-0005](0005-auth-social-oauth-jwt-rotation.md)) Redis는 데이터 계층이라 배포와 무관하게 산다.
- ~~`develop → main` 머지가 아직 안 됐다 — main에 파이프라인 파일이 없어 웹훅이 와도 아무 일도 안 난다.~~ **이 서술은 틀렸다(2026-08-06 실측 정정).** main에는 파이프라인 파일이 있고 잡 `dero-deploy`가 `*/main`을 빌드하며 build 92가 그날 오전에 SUCCESS였다 — **파이프라인은 이미 살아서 제자리 교체로 배포하고 있었다.** 즉 이 ADR이 고치는 것은 "배포가 안 되는 상태"가 아니라 **"되돌릴 수 없는 배포가 도는 상태"**다.

---

## 결정

```
                    nginx (호스트, 무변경)
                         │
        include /var/lib/dero/nginx/active.conf   ← 심볼릭 링크. 이것 하나가 스위치다
                         │
         ┌───────────────┴───────────────┐
   upstream-blue.conf              upstream-green.conf
   3000 / 8081                     3010 / 8091
         │                                │
   -p dero-blue                     -p dero-green      ← compose 파일은 한 벌
         └───────────────┬───────────────┘
                    dero-data 네트워크 (색 없음 — postgres · redis · ES)
```

### 1. blue-green이다 — 롤링도, 제자리 교체 개선도 아니다

**색 두 벌을 같은 호스트에 올리고, nginx upstream을 한 번에 넘긴다.** 고른 이유는 무중단이 아니라 **되돌리기 비용**이다 — 스위치 후에도 옛 색이 살아 있으므로 롤백이 `nginx reload` 한 번이다. 이미지 pull도, 재빌드도, 부팅 대기도 없다.

**되돌릴 수 있는 창을 명시적으로 남긴다.** 스위치 뒤 옛 색은 **`stop`하되 `rm`하지 않는다.** 컨테이너가 남아 있으면 `start` 한 번으로 부활하고, 이미지도 로컬에 있다. 다음 배포가 그 색을 재사용하며 덮는다 — **롤백 창은 "다음 배포까지"**이고 그 이상은 Docker Hub 번호 태그가 받는다(현행 유지).

### 2. 스위치 지점은 호스트 nginx의 upstream 파일 — 단, 파일은 `/etc/nginx` 밖에 둔다

`dero.conf`의 `proxy_pass`를 IP:포트에서 **upstream 이름**으로 바꾼다(`http://dero_frontend`·`http://dero_backend`). upstream 블록 정의는 `include /var/lib/dero/nginx/active.conf` 한 줄이 가져오고, 그 경로는 **`jenkins` 소유 디렉터리의 심볼릭 링크**다.

**`/etc/nginx` 밑에 두지 않는 이유**: 거기 쓰려면 jenkins가 root여야 한다. 배포 계정에 `/etc/nginx` 쓰기 권한을 주면 **TLS 설정과 Jenkins 자신의 라우팅까지 배포 스크립트 사정권에 들어온다.** 링크만 밖에 두면 jenkins가 요구하는 root 명령이 **딱 두 개**로 끝난다.

> ⚠ **이걸 보안 경계로 읽지 마라 (2026-08-06 실측 정정).** `id jenkins`가 `groups=113(jenkins),988(docker)`다 — **jenkins는 docker 소켓을 통해 이미 root 등가**이고, 위 sudoers는 그 사실을 바꾸지 않는다. 게다가 `include` 대상 디렉터리가 jenkins 소유이고 그 include는 `http` 컨텍스트라, 거기 `upstream`만 와야 한다고 강제하는 것이 없다(`server` 블록을 넣어 실제 vhost를 그림자화할 수 있고 `nginx -t`는 중복 `server_name`을 warning으로만 흘린다). **새로 열리는 구멍은 없다** — 이미 열려 있는 문보다 좁은 문을 하나 더 다는 것뿐이다. 이 결정의 진짜 이점은 권한 축소가 아니라 **배포 스크립트가 실수로 TLS·Jenkins 라우팅을 못 건드리는 것**(오작동 방지)이다. 권한을 실제로 좁히려면 docker 접근부터 봐야 하고, 그건 이 ADR 밖이다.

```
jenkins ALL=(root) NOPASSWD: /usr/sbin/nginx -t, /bin/systemctl reload nginx
```

`nginx -t`가 게이트다. **설정이 깨지면 reload가 아예 안 돌고 현재 배선이 그대로 산다** — 실패 방향이 안전한 쪽이다.

**nginx 컨테이너 라우터는 부결**(대안 표). **호스트 nginx 교체·이중화도 부결** — TLS·Jenkins 입구를 겸하는 단일 지점이라 손대는 비용이 얻는 것보다 크다. 이 결정은 nginx를 **한 번만 고치고 그 뒤로는 안 건드리는** 모양이다.

### 3. 색은 compose 프로젝트 이름으로 가른다 — 파일은 한 벌

`compose.yaml`에서 `name: dero`를 지우고 CLI `-p dero-blue` / `-p dero-green`이 정하게 한다. 호스트 포트는 변수로 뺀다.

```yaml
ports:
  - "127.0.0.1:${FRONTEND_PORT:-3000}:3000"
  - "127.0.0.1:${BACKEND_PORT:-8081}:8080"
```

- **파일을 색별로 복제하지 않는다.** 두 파일은 반드시 드리프트한다 — 한쪽에만 들어간 환경변수가 스위치 순간에 드러나는데, 그때는 이미 트래픽이 넘어간 뒤다.
- **`127.0.0.1` 바인딩을 이 작업에 포함한다.** 지금 3000·8081은 인터넷에 평문으로 열려 있고 `deployment.md` §10에 미결로 남아 있다. 색이 늘면 열린 포트도 늘어나므로 **여기서 같이 닫는다.**
- 색별 프로젝트는 각자 `default` 네트워크를 가지므로 `INTERNAL_API_ORIGIN: http://backend:8080`은 **같은 색 안에서 해석된다.** 무변경이다.
- 포트 배정: **blue = 3000/8081**(현행 그대로) · **green = 3010/8091**.

### 4. 데이터·관측 계층은 색을 갖지 않는다

postgres·redis·ES·Prometheus·Grafana는 **한 벌뿐이고 양쪽 색이 공유한다.** 이게 blue-green의 전제다 — 리프레시 토큰이 Redis에 있어서([ADR-0005](0005-auth-social-oauth-jwt-rotation.md)) **스위치가 로그인 세션을 끊지 않는다.** 세션이 인메모리였다면 이 결정 자체가 성립하지 않는다.

색별 DB(복제 후 스위치)는 **부결**이다. 스위치 순간 이후의 쓰기를 어느 쪽에 남길지 답이 없다.

### 5. 마이그레이션은 확장/축소(expand-contract)로 전환한다 — 이게 진짜 대가다

**결정 4의 필연적 귀결**: 스위치 전후로 **구 버전과 신 버전이 같은 스키마를 동시에 본다.** green이 부팅하며 Flyway를 돌리는 그 순간에도 blue가 옛 코드로 서비스 중이다.

따라서 **파괴적 변경은 한 배포에 담을 수 없다.**

| 변경 | 방식 |
|---|---|
| 컬럼·테이블 추가 | 한 배포. **NOT NULL이면 DEFAULT를 같이** — 구 버전 INSERT에는 그 컬럼이 없다 |
| 컬럼 삭제 | **두 배포.** ①코드에서 읽기·쓰기 제거 후 배포 ②다음 배포에서 `DROP` |
| 컬럼 이름 변경 | **삭제가 아니라 추가 + 백필 + 삭제** — 세 걸음 |
| 타입 변경 | 새 컬럼 추가 → 양쪽 쓰기 → 백필 → 옛 컬럼 삭제 |

**적용된 마이그레이션 파일을 나중에 고치는 것도 여기서 끝난다** — V1 동결(2026-07-31)이 이미 그 방향이고, 이 ADR은 그 규칙을 **모든 버전으로** 넓힌다. blue가 적용해 둔 V*와 green이 들고 온 V*의 체크섬이 어긋나면 **green이 부팅에서 죽는다.** 죽는 것 자체는 안전하다(스위치가 안 되고 blue가 산다) — 문제는 **한 번 어긋나면 배포가 통째로 막히고**, 뚫는 방법이 운영 DB의 `flyway_schema_history`를 손으로 고치는 것뿐이라는 점이다.

**진짜로 새로 잃는 것은 파일 개수가 아니라 한 배포에 담을 수 있는 변경의 종류다.** 이름 변경 하나가 배포 세 번이 된다. **그 비용을 받아들이는 것이 이 결정이다** — blue-green을 하면서 파괴적 마이그레이션을 유지할 방법은 없다.

**그리고 이 규칙은 사람 눈이 아니라 CI가 지킨다.** `Jenkinsfile`의 `Validate Migrations` 스테이지가 마지막 성공 빌드 이후 새로 들어온 마이그레이션에서 `DROP COLUMN`·`DROP TABLE`·`RENAME`·`SET NOT NULL`·`ALTER COLUMN … TYPE`을 찾으면 빌드를 세운다(DERO-480). 리뷰 항목으로만 두면 놓치는 순간이 곧 운영 장애다 — **Flyway는 헬스 게이트보다 먼저 커밋하므로**(아래) 배포가 뒤에 실패해도 스키마는 안 돌아온다.

**나눌 수 없는 축소에는 승인 통로가 있다**(2026-08-11, DERO-586). 가드는 파일 diff를 줄 단위로 보므로 **한 배포 안에서 서로 상쇄되는 변경을 구분하지 못한다** — V12가 `display_order`를 지우고 V13이 되살리면 순변화는 0인데 가드는 파괴적 2건으로 센다(2026-08-11 실측, 데스크피드 D32→D33). 그리고 "따로 내보내면 운영에 반쪽 UI가 며칠 노출된다"처럼 나누는 쪽이 더 나쁜 경우도 있다.

그래서 빌드 파라미터 `ALLOW_DESTRUCTIVE_MIGRATION`을 둔다. 기본은 꺼짐이고 **push 트리거는 언제나 기본값으로 돌기 때문에**, 켜는 것은 사람이 `Build with Parameters`로 하는 명시적 행위이며 그 사실과 승인된 grep 결과가 빌드 로그에 함께 남는다. 켜기 전에 확인할 것은 하나다 — **스위치 창 동안 서비스 중인 색이 무엇을 못 하게 되는가.** 파일 형태의 허용 목록으로 두지 않은 이유는 지우는 것을 잊으면 다음 축소가 조용히 통과하기 때문이다.

### 5-1. Flyway는 헬스 게이트보다 **먼저** 운영 DB에 커밋한다

이 순서를 오해하면 결정 6의 안전성을 과대평가하게 되므로 못 박아 둔다.

```
compose up (green 부팅 = Flyway 커밋)  →  헬스 판정  →  링크 교체
        ^^^^^^^^^^^^^^^^^^^^^^^^^^ 여기서 이미 스키마가 넘어갔다
```

Spring Boot가 부팅 시점에 Flyway를 돌리므로 이 순서는 바꿀 수 없다. 따라서 **헬스 게이트는 트래픽만 지키고 DB는 지키지 않는다.** 헬스 실패로 배포가 중단돼도, 스위치 뒤 `rollback`을 해도, 스키마는 새 버전인 채로 남는다. 그 상태에서 옛 색이 멀쩡히 도는 유일한 이유가 확장/축소다 — 그래서 결정 5가 이 ADR의 실제 대가다.

Flyway Community에는 undo가 없다. PostgreSQL은 DDL이 트랜잭션이라 **실패한 마이그레이션은 스스로 롤백**되지만, `CREATE INDEX CONCURRENTLY`처럼 트랜잭션 밖에서만 도는 구문은 예외다 — 중간에 죽으면 `flyway_schema_history`에 실패 행이 남고 **그 뒤 모든 배포가 부팅에서 막힌다.** 뚫는 것은 운영 DB에 `flyway repair`뿐이니, 그런 구문을 쓸 때는 그 사실을 알고 쓴다.

### 6. 스위치 판정은 새 색의 포트를 직접 친다

Verify 스테이지의 `127.0.0.1:3000`·`8081` 하드코딩을 제거한다. 판정 대상은 **아직 트래픽을 안 받는 새 색의 포트**다(`:3010` · `:8091/api/actuator/health`). 통과해야만 링크를 바꾸고, 실패하면 새 색만 내리고 빌드를 실패시킨다 — **사용자는 아무것도 못 느낀다.**

이 순서를 뒤집으면(먼저 넘기고 나중에 확인) blue-green이 제자리 교체보다 나빠진다.

### 7. 이 결정이 해결하지 않는 것 — 명시해 둔다

- **Next.js 배포 스큐.** 스위치 전에 페이지를 받은 브라우저 탭이 이후에 옛 빌드의 청크를 요청하면 404다. 지금도 같은 문제고 blue-green이 고치지 않는다. 쿠키 기반 sticky routing으로 옛 색에 묶어 둘 수는 있으나 **부결** — 라우팅에 상태가 생기고 롤백이 두 갈래가 된다.
- **Prometheus 지표 혼선.** blue·green 백엔드 둘 다 `dero-data` 네트워크에서 `backend` 별칭을 받는다(compose는 서비스명 별칭을 항상 붙이므로 뺄 수 없다). 겹치는 동안 `backend:8080` 스크레이프가 두 버전 사이를 라운드로빈한다. **색별 별칭 + 타깃 2개는 부결** — 평상시 한쪽이 항상 DOWN으로 떠 `up` 패널(ADR-0020 결정 9)의 의미가 망가진다. **겹침 창이 짧으므로 감수하고 문서에 적는다.**
- **카나리·트래픽 비율 분할·자동 롤백.** 전부 부결이다. 인스턴스 1대·규모 초당 1.2건(ADR-0020 결정 3 추정)에서 비율 분할은 통계가 안 나온다.

### 8. 선행 조건 — 이게 안 되면 이 ADR은 종이다

1. ~~**`develop → main` 머지.**~~ **해소 (2026-08-06).** 애초에 전제가 틀렸다 — main에는 파이프라인 파일이 있었고 배포는 이미 돌고 있었다(맥락 절 정정). 이 ADR의 코드는 `7bc00fe`로 main에 올라갔고 **첫 blue-green 배포가 build 93 SUCCESS**로 끝났다: `현재=blue → 대상=green` · 헬스 3010(4초)·8091(18초) 통과 · 링크 교체 · site/api 200. 호스트 선행 조건 실행 절차는 `deployment.md` §4-1이 정본이다.
2. ~~**메모리 실측.**~~ **해소 (2026-08-06 실측).** 결론은 **정상 상태는 안전, 상한은 안 잡혀 있었다** — 그래서 `compose.yaml`에 `mem_limit`을 같이 넣는 것이 이 조건의 이행이다.

   | 항목 | 실측 |
   |---|---|
   | 호스트 | total 15Gi · used 7.6Gi · buff/cache 7.2Gi · **available 8.1Gi** · **swap 0** · 4 vCPU |
   | `dero-backend-1` | RSS **699 MiB** (heap used 138 / committed 288 · nonheap used 238 MiB) |
   | `dero-frontend-1` | RSS **87 MiB** |
   | 앱 계층 한 벌 | **786 MiB** — 겹침 창에 한 벌 더 얹어도 여유의 약 10% |
   | 관측 스택 | ES 2.71GiB/3GiB · Kibana 883MiB/1GiB · 나머지 합 163MiB — **전부 한도가 걸려 있어 더 안 자란다** |

   ADR-0020 계산의 "여유 ~6GiB"는 보수적이었다(실제 8.1GiB). **정상 상태 OOM 위험은 없다.**

   **다만 컨테이너에 메모리 제한이 없었다**(`HostConfig.Memory = 0`). 그러면 JVM이 cgroup이 아니라 **호스트 전체**를 기준으로 힙 상한을 잡아 `MaxHeapSize = 3.9 GiB`(MaxRAMPercentage 25% × 15.6GiB)가 된다. 색이 둘이면 백엔드 둘이 각자 3.9GiB를 자기 몫으로 믿고, 힙만 7.8GiB + 논힙까지 더하면 여유 8.1GiB를 넘긴다. 초당 1.2건 규모에서 힙이 138MiB → 3.9GiB로 부풀 일은 사실상 없지만, **막는 값이 공짜라 막는다** — `backend: mem_limit 2g`(JDK 21이 cgroup을 읽어 힙 상한이 512MiB로 따라 내려간다) · `frontend: 512m`. 색 둘이어도 최악 5GiB로 묶인다. 한도에 닿으면 호스트가 아니라 해당 컨테이너만 죽으므로 스위치 전 헬스 게이트가 잡는다.

---

## 대안과 버린 이유

| 대안 | 판정 | 이유 |
|---|---|---|
| **현행 제자리 교체 유지** | 부결 | 맥락 — 다운타임보다 **실패 시 옛 버전이 안 돌아오는 것**이 문제다 |
| **롤링 업데이트**(replica 2 순차 교체) | 부결 | compose에 그 기능이 없다(swarm·k8s 영역). 그리고 **두 버전이 오래 공존**해 스키마 제약이 blue-green보다 더 심하다 |
| **k8s / ECS + ALB** | 부결 | 과정 종료까지 4주. 무중단 하나를 위해 오케스트레이터·로드밸런서·매니페스트가 붙는다. 노드 분리 시점의 목적지로는 유효하다(ADR-0020 결정 8) |
| **nginx를 컨테이너로 내려 색 라우터로 쓰기** | 부결 | jenkins에 sudo가 아예 필요 없어지는 건 장점이나, **호스트 nginx는 TLS·Jenkins 입구라 어차피 남는다** — 프록시 홉과 설정 정본이 둘로 늘어난다. 결정 2의 `nginx -t` 게이트로 위험이 이미 닫힌다 |
| **색별 compose 파일 2개** | 부결 | 결정 3 — 드리프트가 스위치 순간에 드러난다 |
| **색별 DB 복제** | 부결 | 결정 4 — 스위치 이후의 쓰기를 어디에 남길지 답이 없다 |
| **green만 Flyway 끄기** | 부결 | 스키마를 누가 언제 바꾸는지가 배포마다 달라진다. **"스키마는 부팅 때 Flyway가"라는 단일 규칙을 깨는 값이 무중단보다 크지 않다** |
| **쿠키 sticky routing으로 옛 색 유지** | 부결 | 결정 7 — 라우팅에 상태가 생기고 롤백이 두 갈래가 된다 |

## 파급

| 영역 | 내용 |
|---|---|
| 인프라 | `compose.yaml` — `name:` 제거, 호스트 포트 변수화 + `127.0.0.1` 바인딩 |
| 인프라 | `compose.yaml` — `mem_limit` (backend 2g · frontend 512m). 제한이 없으면 JVM이 호스트 기준으로 힙 3.9GiB를 잡아 색 둘이 여유를 넘긴다(선행 조건 2 실측) |
| 인프라 | **신규** `infra/nginx/upstream-blue.conf` · `upstream-green.conf` |
| 인프라 | **신규** `scripts/deploy-switch.sh` — 색 판별 → 반대 색 기동 → 헬스 → 링크 교체 → `nginx -t && reload` → 옛 색 `stop`(`rm` 없음) |
| nginx | `infra/nginx/dero.conf` — `proxy_pass`를 upstream 이름으로, `include /var/lib/dero/nginx/active.conf` 추가. **호스트 실물 반영 필요**(정본은 실물, `deployment.md` §4) |
| EC2 수동 | `/var/lib/dero/nginx/`(jenkins 소유) 생성 · sudoers 드롭인 2개 명령 · `~/dero`는 git 체크아웃이 아니므로 `scp`(§5) |
| CI | `Jenkinsfile` — Deploy·Verify를 스크립트 호출로 교체. Push는 `-p dero-$COLOR`(이미지 이름은 `image:`에서 오므로 태그 영향 없음). post 정리 블록은 실행 중 컨테이너가 문 이미지의 삭제 실패를 이미 넘기므로 무변경 |
| CI | `Jenkinsfile` — **신규** `Validate Migrations` 스테이지가 파괴적 마이그레이션에서 빌드를 세운다(결정 5, DERO-480). 나눌 수 없는 축소는 빌드 파라미터 `ALLOW_DESTRUCTIVE_MIGRATION`으로 사람이 승인한다(DERO-586) |
| 백엔드 | 적용된 마이그레이션 파일은 **모든 버전이 수정 금지**(결정 5). V1 동결은 2026-07-31에 이미 됐고 `backend/dero-api/CLAUDE.md`에 반영돼 있다 — 그 범위를 V2 이후로 넓히는 것이 여기서 추가되는 부분이다 |
| 백엔드 | 파괴적 스키마 변경은 **배포 2회로 분할**(결정 5 표). 리뷰가 아니라 `Validate Migrations`가 강제한다 |
| 문서 | `docs/context/deployment.md` — §5 compose 표에 색 개념, §7 포트 인벤토리에 3010·8091, §10에서 "3000·8081 인바운드 삭제" 항목 해소 |
| 문서 | `docs/context/architecture-map.md` — 배포 방식 결정 등재 |
| 관측 | Prometheus 스크레이프 혼선(결정 7)을 `docs/context/observability.md`에 함정으로 기록 |
| 보안 | 3000·8081 평문 노출 차단(결정 3) — **호스트 방화벽으로는 못 막는다.** ufw가 default-deny인데도 열려 있었다(Docker publish가 ufw를 우회한다, `deployment.md` §7). `127.0.0.1` 바인딩이 유일한 방어다. jenkins의 sudoers는 `nginx -t`·`reload` 둘뿐이지만 **권한 축소로 치지 않는다** — jenkins가 docker 그룹이라 이미 root 등가다(결정 2 경고 박스, 2026-08-06 실측) |
