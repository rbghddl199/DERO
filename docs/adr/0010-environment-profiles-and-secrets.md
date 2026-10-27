# ADR-0010. 프로파일 3종 + 루트 `.env.local` 확장 + `.env.local` 로컬 시크릿

## 상태

**확정** — 2026-07-27, 승인 박동규.
결정 티켓 DERO-192 (에픽 DERO-125). 설계 맵: `docs/context/architecture-map.md`.

## 맥락

**배포는 이미 만들어져 돌고 있다.**

- `Jenkinsfile` — 같은 EC2에서 빌드하고 띄운다. **배포 경로에 pull이 없다.** Jenkins credential은 `dockerhub` 하나뿐이고 `docker login`에만 쓴다.
- `compose.yaml`(프로젝트 `dero`)이 앱 계층, `compose.data.yaml`(프로젝트 `dero-data`)이 postgres·redis를 소유하고 앱은 external 네트워크로 붙는다.
- 값은 **루트 `.env.local`(gitignore) → compose 보간 → 컨테이너 env**로 흐른다. 이미 `SPRING_DATASOURCE_*`·`SPRING_DATA_REDIS_HOST`가 이렇게 주입된다.
- 로컬은 `spring-boot-docker-compose`가 `backend/dero-api/compose.yaml`을 자동 기동한다.

즉 **DB·Redis 주입 경로는 이미 정해져 있었다.** 남은 건 프로파일 파일과 시크릿이다.

미결이던 것: ADR-0005가 시크릿 3종(카카오·구글 클라이언트 시크릿, JWT HMAC 키)을 늘렸고 로컬만 CORS가 필요하다는 점을 남겼다(운영은 nginx 뒤 동일 오리진). ADR-0006이 `ddl-auto: validate`·`open-in-view: false`·`default_batch_fetch_size: 100`을 확정했지만 파일 작성은 미뤘다. ADR-0008이 Swagger UI를 `local` 전용으로, 타임존을 `Asia/Seoul` 고정으로 못 박았다.

## 결정

### 1. 운영 시크릿은 루트 `.env.local`를 확장한다

경계선은 **시점**이다 — 빌드가 쓰면 Jenkins credential, 컨테이너가 런타임에 읽으면 `.env.local`.

`.env.local`에 `OAUTH_KAKAO_CLIENT_SECRET`·`OAUTH_GOOGLE_CLIENT_SECRET`·`JWT_SECRET`을 추가하고, `compose.yaml`의 `backend.environment`가 컨테이너 env로 넘긴다. 프로퍼티 바인딩은 프로파일 yaml의 placeholder가 맡는다(현재 배선 정본은 `compose.yaml`과 `application-prod.yaml`).

근거: **EC2에 SSH 되는 사람 = Jenkins 되는 사람 = 팀원 전부**다. Jenkins credential로 나눠도 실질 접근 경계가 안 바뀐다. `dockerhub` PAT만 credential에 남는 건 빌드 시점 값이라 생명주기가 다르기 때문이다.

대가: `.env.local`가 EC2 디스크에 평문으로 있고 스냅샷·백업에 딸려간다.

### 2. 프로파일은 파일 3개, 기본값은 닫힌 쪽으로 실패한다

| 파일 | 역할 |
|---|---|
| `application.yaml` | 공통 + **안전 기본값** — `springdoc.swagger-ui.enabled: false`, ADR-0006의 JPA 값 셋 |
| `application-local.yaml` | 여는 쪽 — Swagger on, CORS `http://localhost:3000` |
| `application-prod.yaml` | 운영 값 |

`build.gradle`의 `bootRun`에 `systemProperty 'spring.profiles.active', 'local'`, `compose.yaml`의 `backend.environment`에 `SPRING_PROFILES_ACTIVE: prod`.

근거: 프로파일 지정을 빠뜨렸을 때 **운영에 Swagger UI가 열리는 fail-open을 구조적으로 막는다.** bootRun 고정 덕에 팀원은 IDE 설정 없이 돈다.

대가: 파일이 3개로 늘고, 값이 공통에 있는지 local에 있는지 두 파일을 봐야 한다.

### 3. 로컬 시크릿은 팀 공용 개발앱 1쌍 + 개인 `.env.local`

카카오·구글 개발앱을 **팀 공용으로 하나씩만** 만들고 리다이렉트 URI에 로컬 주소를 등록한다. 값은 팀 비공개 채널로 1회 배포해 각자 `.env.local`에 채운다.

**JWT 로컬 키는 `application-local.yaml`에 평문 고정한다.** 로컬 DB에서만 유효한 토큰이라 유출 위험이 없고, 팀원마다 키가 달라 생기는 혼란을 없앤다.

### 4. 로컬 파일 이름은 `.env.local`, `spring.config.import`로 읽는다

`application-local.yaml`에 `spring.config.import: optional:file:./.env.local[.properties]`. `optional:`이라 파일이 없어도 부팅이 안 깨지고, IntelliJ와 `./gradlew bootRun`에서 똑같이 동작해 IDE 플러그인이 필요 없다.

**함정 둘. 둘 다 조용히 깨진다:**

- **Spring Boot는 `.env.local`를 네이티브로 읽지 않는다.** 루트 `.env.local`가 도는 건 Docker Compose가 읽어주기 때문이다.
- **`.env.local` 안의 키는 셸 스타일 대문자·언더스코어가 아니라 Spring 프로퍼티 키여야 한다.** 대문자→케밥 완화 바인딩(relaxed binding)은 **환경변수 소스에만** 적용되고 프로퍼티 파일 키는 문자 그대로 읽힌다. `OAUTH_KAKAO_CLIENT_SECRET=x`라고 쓰면 에러 없이 아무 데도 안 붙는다.

방어: 커밋하는 `.env.local.example`에 실제 Spring 키를 박아 **복사만 하면 맞도록** 한다.

### 5. 테스트는 `application-test.yaml` + Testcontainers `@ServiceConnection`

`src/test/resources/application-test.yaml`을 커밋하고 통합 테스트는 `@ActiveProfiles("test")`. postgres·redis는 `@ServiceConnection`이 자동으로 물려 datasource를 손으로 안 쓴다. `spring.flyway.enabled: true` + `ddl-auto: validate` 조합이라 **마이그레이션이 진짜로 돌고 엔티티↔스키마 불일치가 테스트마다 잡힌다.**

제약은 그대로 — H2 금지(JSONB), `reuse=true`는 각자 `~/.testcontainers.properties`에 `testcontainers.reuse.enable=true`가 필요하다(ADR-0001).

### 6. 타임존은 JVM 옵션 3곳에 박는다

`Dockerfile` ENTRYPOINT에 `-Duser.timezone=Asia/Seoul`, `build.gradle`의 `bootRun`·`test`에 같은 `systemProperty`. 운영·로컬·CI가 같아진다.

근거: **JDK는 자체 tzdb를 들고 다녀 `-Duser.timezone`은 alpine에 tzdata가 없어도 먹는다.** OS `TZ` 환경변수 쪽은 tzdata에 의존하고 컨테이너에만 걸려 로컬·CI가 갈린다.

ADR-0008이 이미 밝힌 대로 **이 고정은 정확성 조건이 아니다** — `OffsetDateTime` ↔ `TIMESTAMPTZ`라 절대 시각은 무관하게 맞는다. 걸리는 건 로그 시각과 `LocalDate` 기반 집계(일별 생성 횟수 제한, REQ-IMG-03)뿐이다.

## 대안과 버린 이유

**① 운영 시크릿을 Jenkins credential로 옮긴다** — 접근 경계가 실제로 안 나뉘고(결정 1 근거), 파이프라인을 안 거친 수동 `docker compose up`에서 시크릿이 비는 함정만 생긴다.

**② 팀원 각자 개인 개발앱** — 6명 × 2곳 등록이고, 리다이렉트 URI 실수가 사람마다 처음부터 반복된다.

**③ 로컬에서 소셜 로그인 끄기** — 우회 로그인 코드를 새로 지어야 하고, 소셜 경로가 운영에서야 처음 돈다.

**④ 테스트에서 `@DynamicPropertySource`만 쓰기** — 같은 속성 선언이 테스트마다 복사된다.

**⑤ 테스트가 `local` 프로파일을 재사용** — Swagger·CORS·`.env.local` 임포트가 CI에서 불필요하게 깨질 면을 만든다.

## 파급

- **백엔드 init이 이 결정에 의존한다** — 코드 단계 작업: `application.yaml` 3종 + `application-test.yaml` + `.env.local.example` + `.gitignore` 항목 + `build.gradle`의 `bootRun`/`test` systemProperty + `Dockerfile` ENTRYPOINT + `compose.yaml` `backend.environment` 추가 + 루트 `.env.example` 갱신.
- **실측 완료(2026-07-27, DERO-194)** — 위험한 건 빈 값이 아니라 **반쪽짜리 registration**이었다. `.env.local`이 **아예 없으면** registration이 만들어지지 않아 정상 부팅한다(`Started DeroApiApplication`). 반면 한 provider의 값을 **일부만** 채우면 `Client id of registration 'kakao' must not be empty.`로 부팅이 죽는다. 그래서 `.env.local.example`에 `client-id`까지 넣어 통째로 채우거나 통째로 비우게 만들었다. 같은 실행에서 `spring.config.import: optional:file:./.env.local[.properties]`가 실제로 읽힌다는 것도 확인됐다 — 임포트가 안 됐다면 `kakao` registration 자체가 없어 이 에러가 나지 않는다.
- **발견된 결함 2건** (init 브랜치에서 함께 고친다):
  - `backend/dero-api/compose.yaml`의 postgres healthcheck가 `pg_isready -U myuser -d mydatabase`인데 실제 자격증명은 `dero`/`dero_be`라 **헬스체크가 항상 실패한다**.
  - 같은 폴더 `CLAUDE.md`가 자격증명을 `myuser`/`secret`이라고 적어 실제 파일과 다르다.
- **맵의 안개 항목 "CI/CD 파이프라인"이 실제와 어긋난다** — Jenkins + compose 2계층이 이미 돌고 있다. 남은 건 OpenAPI 타입 생성 자동화 정도다.
- **`.env.local` 항목이 늘어 EC2에 이미 있는 `.env.local`를 사람이 손으로 갱신해야 한다.** 안 하면 배포는 성공하고 로그인만 죽는다.
