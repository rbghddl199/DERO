# ADR-0005. 소셜 OAuth + 회전 리프레시 JWT 인증

## 상태

**확정** — 2026-07-27, 승인 박동규.
결정 티켓 DERO-129 인증 전략 결정. 부모 에픽 DERO-125, 맵은 `docs/context/architecture-map.md`.

## 맥락

제약이 셋이다. 백엔드 2명에 4주, 교육기관 EC2 **1대**, 그리고 `docs/context/erd.md` **동결**.

무엇을 지킬지는 이미 정해져 있다. `docs/CONTEXT.md` D14 — 비로그인은 커뮤니티(템플릿 목록·상세) 열람까지, 시뮬레이터 진입은 템플릿 복사를 포함해 로그인 필수. 관문을 통과하면 원래 가려던 곳으로 되돌려 보낸다. REQ-USR-01은 소셜 또는 이메일 로그인 1종 이상을 요구한다.

**동결된 ERD가 선택지를 거의 다 지워 놓았다.** `user` 테이블은 이렇게 생겼다.

| 컬럼 | 정의 | 읽히는 뜻 |
|---|---|---|
| `email` | `VARCHAR(320) NOT NULL` | 이메일은 반드시 채워져야 한다 |
| `provider` | `VARCHAR(10) NOT NULL` (KAKAO/GOOGLE) | 소셜 계정이 전제다 |
| `provider_id` | `VARCHAR(255) NOT NULL` | 신원 키는 provider 쪽에 있다 |
| `role` / `status` | USER·ADMIN / ACTIVE·INACTIVE | 권한과 정지가 같은 행에 산다 |
| — | **비밀번호 컬럼 없음** | 이메일+비번은 스키마를 고쳐야 성립 |

소셜 전용은 결정이 아니라 전제다. 스키마를 건드리지 않고 이메일+비번을 붙일 방법이 없다.

soft delete 테이블이라 유니크도 부분 인덱스다 — `uq_user_email(email) WHERE deleted_at IS NULL`, `uq_user_provider_provider_id(provider, provider_id) WHERE deleted_at IS NULL`, `uq_user_nickname(nickname) WHERE deleted_at IS NULL`(2026-07-28 추가, DERO-213). 탈퇴한 사람의 이메일·provider 키·닉네임은 재가입을 막지 않는다. 닉네임은 제공자 표시명을 그대로 쓰지 않고 **가입 시 사용자가 입력한다**(D23) — 그러지 않으면 흔한 실명에서 두 번째 가입자가 유니크 위반으로 막힌다.

**세션이나 리프레시 토큰을 담을 테이블은 ERD에 없다.** 동결이라 추가할 수도 없다. 토큰 상태를 서버가 알아야 한다면 자리는 Redis 하나뿐이다.

이미 깔려 있는 것도 답을 좁힌다. `backend/dero-api/build.gradle`에 `spring-boot-starter-security`, `spring-boot-starter-security-oauth2-client`, `spring-boot-starter-data-redis`가 들어 있다. Spring Boot 4.1.0, Java 21. 프론트는 Next.js 16 App Router이고 `next-auth`는 없다. 데이터를 가져오는 컴포넌트는 현재 전부 `'use client'`다.

Spring Security **7.0** 문서를 정본으로 확인한 사실 셋(context7):

- `and()`가 없어졌다. 람다 DSL만 남고 인가 설정은 `authorizeHttpRequests`다.
- `.csrf(csrf -> csrf.spa())` SPA 프리셋이 새로 생겼다.
- OAuth2 인가 요청 저장소의 기본 구현은 `HttpSessionOAuth2AuthorizationRequestRepository` 하나뿐이다. 세션 기반이다.

마지막 항목을 오래 붙잡고 있었다. 결정 1이 그 이야기다.

## 결정

### 1. OAuth 교환은 백엔드 Spring `oauth2-client`가 한다 — 필터 체인은 하나

`SecurityFilterChain` 한 개. `SessionCreationPolicy.STATELESS`, `csrf`·`formLogin`·`httpBasic`은 disable.

초안에서는 체인을 로그인용과 API용으로 쪼개려 했다. 무상태 API 옆에 세션 기반 인가 요청 저장소를 두면 state와 PKCE가 날아갈 거라고 봤다. **철회했다. 사실이 아니다.** `STATELESS`는 "SecurityContext를 세션에 저장하지도 복원하지도 않는다"는 뜻이지 서블릿 세션 생성을 막는 스위치가 아니다. `HttpSessionOAuth2AuthorizationRequestRepository`는 세션 정책을 거치지 않고 `request.getSession()`을 직접 부른다. state와 PKCE verifier는 정상 저장되고 콜백 검증도 통과한다. 쪼갤 이유가 없다.

대신 진짜 부수 효과가 하나 있다. `STATELESS`면 `RequestCacheConfigurer`가 `NullRequestCache`를 쓴다. 기본 `SavedRequestAwareAuthenticationSuccessHandler`의 "원래 가려던 곳으로 복귀"가 죽고 성공 후엔 언제나 `/`로 간다. 커스텀 성공 핸들러가 선택이 아니라 필수가 되고, 이것이 결정 8을 강제한다.

### 2. JWT 액세스 + 리프레시, 회전한다

리프레시 상태는 Redis에 둔다. 테이블이 없으니 다른 자리가 없다.

서버 세션 대신 JWT를 고른 이유를 솔직히 적는다. 기술적 이점 때문이 아니다. EC2 1대에 WAS 1개라 무상태 수평 확장이라는 JWT의 본래 값은 이 프로젝트에서 0이다. 골라 놓은 이유는 팀에 리프레시 회전을 구현해 본 사람이 있고 이번 프로젝트에 학습 목표가 걸려 있어서다. 나중에 "왜 세션을 안 썼지"를 다시 묻지 않도록 근거를 남겨 둔다.

### 3. 전송 경로

| 토큰 | 어디에 | 어떻게 |
|---|---|---|
| 액세스 | 브라우저 **메모리** | `Authorization: Bearer` 헤더 |
| 리프레시 | httpOnly·Secure·SameSite=Lax **쿠키**, `path=/api/v1/auth` | 그 서브트리에서만 자동 전송 |

`localStorage`는 쓰지 않는다. 이유는 대안 절에.

**(2026-07-31 개정, 승인 박동규) 쿠키 path를 `/api/v1/auth/refresh`에서 `/api/v1/auth`로 넓혔다.**
원래 값은 "refresh 경로에서만 자동 전송"이라는 노출면 최소화가 목적이었는데, **로그아웃이 리프레시
쿠키를 필요로 한다는 걸 이 결정이 예상하지 못했다.** RFC 6265 §5.1.4 path-match는 요청 경로
`/api/v1/auth/logout`을 쿠키 path `/api/v1/auth/refresh`에 매치시키지 않는다 — 동일하지도, 접두사도
아니다. 그 결과 `AuthController#logout`은 실제 브라우저에서 **항상** `refreshCookie == null`을 받아
`RefreshTokenService#revokeAll`을 한 번도 부르지 못했다. 브라우저 쿠키는 `Set-Cookie`가 지우므로
사용자에겐 로그아웃으로 보이지만, **Redis `refresh:{userId}` Set은 14일 TTL이 다 할 때까지 살아 있었다**
— 결정 4의 재사용 탐지·전 기기 무효화가 로그아웃 경로에서만 통째로 무력했다는 뜻이다.

기존 테스트가 못 잡은 이유를 남겨 둔다. `AuthControllerTest`는 MockMvc라 쿠키 path 스코핑을 강제하지
않아 `new Cookie(...)`를 손으로 붙이고, 프론트 `e2e/oauth.spec.ts`는 `/api/v1/auth/logout`을 204로
스텁한다. **둘 다 브라우저의 쿠키 전송 규칙을 흉내내지 않는 층에서 검증했다** — 이 계층에서만 도는
검증은 전송 계약 버그에 구조적으로 눈이 멀다.

넓힌 대가는 노출 경로가 1개에서 `/api/v1/auth/*` 서브트리로 늘어난 것뿐이다. 현재 그 아래 엔드포인트는
`refresh`·`logout` 둘이고, httpOnly·Secure·SameSite=Lax는 그대로다. `/api/v1/auth` 아래에 리프레시
쿠키를 봐선 안 되는 엔드포인트를 나중에 추가하려 하면 그때 이 결정을 다시 연다.

같이 따라오는 것: **`POST /api/v1/auth/logout`은 🔓다**(`docs/context/api-spec.md` §2 개정). 이 엔드포인트의
주체는 Bearer 액세스 토큰이 아니라 리프레시 쿠키다 — 코드도 원래 그렇게 쓰여 있었고(`Authentication`을
참조하지 않는다) 명세만 🔒로 어긋나 있었다. 🔒로 강제하면 **액세스 토큰이 이미 만료된 상태에서
로그아웃을 누르는 가장 흔한 경우**가 401로 막혀, 고치려던 바로 그 증상이 그대로 남는다.

### 4. 리프레시 재사용 탐지 = 그 사용자 전체 무효화

Redis 키 `refresh:{userId}`, 값은 jti Set, TTL 14일.

- 회전: 옛 jti `SREM` + 새 jti `SADD`
- 등록되지 않은 jti가 들어오면 Set을 통째로 `DEL` — 전 기기 로그아웃

훔친 토큰과 진짜 토큰을 구별할 방법이 없다. 재사용 신호가 한 번 뜨면 전부 끊는다.

### 5. 수명 — 액세스 30분, 리프레시 14일 슬라이딩

회전할 때마다 TTL을 다시 14일로 민다. 2주 넘게 안 들어오면 로그아웃된다.

### 6. provider는 카카오와 구글 둘 다

구글은 `CommonOAuth2Provider.GOOGLE`이 내장이라 설정 세 줄이면 끝난다. 카카오는 내장이 없어 authorization-uri·token-uri·user-info-uri와 `user-name-attribute`를 손으로 등록해야 한다.

둘 다 켜는 값은 보험이다. 카카오 앱 심사나 동의 항목이 막히는 날에도 로그인이 살아 있다. 4주짜리 프로젝트에서 로그인이 막히면 그 아래 기능 전부가 같이 막힌다. 설정 세 줄로 그 위험을 지운다.

### 7. 신원은 `(provider, provider_id)`, `email`은 표시값

로그인 조회 키는 `(provider, provider_id)`다. 이메일로 사람을 찾지 않는다.

provider가 이메일을 안 주면 `kakao_{provider_id}@dero.invalid`로 합성해 채운다. `NOT NULL`이라 비워 둘 수 없어서다. `.invalid`는 RFC 2606 예약 TLD라 실제로 발송될 일이 없다.

들어온 이메일이 살아 있는 다른 계정과 겹치면 **자동 연결하지 않는다.** 로그인을 거절하고 "이미 <provider>로 가입된 이메일입니다"를 안내한다. 이유가 둘이다. 하나, provider가 준 이메일에 소유 검증 보장이 없다 — 검증 안 된 이메일을 기존 계정에 붙여 주면 그게 계정 탈취 경로다. 둘, `provider` 컬럼이 하나뿐이라 자동 연결은 그 컬럼의 뜻을 "가입 provider"에서 "마지막 로그인 provider"로 무너뜨린다. 동결된 스키마가 표현하지 못하는 상태를 코드로 만들어 내는 셈이다.

### 8. 로그인 후 복귀 목적지는 프론트가 `sessionStorage`에 들고 있는다

백엔드 성공 핸들러가 하는 일은 둘뿐이다. 리프레시 쿠키를 굽고, **고정 경로** `/auth/callback`으로 리다이렉트한다. 프론트는 거기서 `POST /api/auth/refresh`로 액세스 토큰을 받아 메모리에 담고, `sessionStorage`에 넣어 둔 원래 목적지로 스스로 이동한다.

**토큰은 URL에 싣지 않는다.** 쿼리도 프래그먼트도 아니다. 브라우저 히스토리, `Referer` 헤더, nginx 액세스 로그가 전부 유출 경로다.

리다이렉트 대상이 상수라는 점에도 값이 있다. 백엔드가 목적지를 받지 않으니 오픈 리다이렉트 취약점이 원천 봉쇄되고, 화이트리스트 검증 코드를 짤 일도 없다.

### 9. 액세스 토큰 검증은 `oauth2ResourceServer().jwt()`

`NimbusJwtDecoder.withSecretKey`로 HMAC 대칭키를 물린다. 커스텀 `OncePerRequestFilter`에 jjwt를 손으로 얹지 않는다.

401 응답은 `BearerTokenAuthenticationEntryPoint`가 낸다. 이게 실질적인 이득이다. 필터에서 던진 예외는 `@ControllerAdvice`에 잡히지 않는다 — 아직 디스패처 서블릿까지 가지도 않았으니까. 손으로 짠 필터로 가면 401 JSON 모양을 맞추려고 별도 배선을 또 해야 한다.

### 10. 클레임 — `sub`는 `user.id`

`sub`에 `user.id`(BIGINT)를 넣는다. 권한은 커스텀 `role` 클레임으로 싣고, `JwtGrantedAuthoritiesConverter`에 `authorityPrefix("ROLE_")`와 `authoritiesClaimName("role")`을 설정해 `hasRole('ADMIN')`이 그대로 돌게 한다.

`sub`에 이메일을 쓰지 않는 이유는 결정 7에서 나온다. 합성 이메일을 허용하는 마당에 그걸 신원 키로 삼을 수 없고, provider 쪽 이메일은 사용자가 바꿀 수도 있다. 이 시스템에서 불변인 키는 `user.id` 하나뿐이다.

### 인가 규칙과 CSRF

인가 규칙은 D14를 그대로 옮긴다. 커뮤니티 조회 경로는 `permitAll`, 나머지는 `authenticated`.

`csrf.disable()`을 유지하는 근거는 이렇다. API는 Bearer 전용이라 브라우저가 알아서 붙여 주는 자격 증명이 없다. 쿠키를 받는 표면은 `/api/auth/refresh` 하나뿐이고, 그 쿠키는 SameSite=Lax에 path까지 한정돼 크로스사이트 POST에 실리지 않는다. 나중에 쿠키 기반으로 틀 일이 생기면 Spring Security 7.0의 `.csrf(csrf -> csrf.spa())`를 카드로 남겨 둔다.

### 11. OAuth 엔드포인트를 Spring 기본 경로가 아니라 `/api/` 아래로 옮긴다

**(2026-07-31 추가, 승인 박동규.)** 결정 1은 "Spring이 자동 등록하는 경로를 그대로 쓴다"를 암묵적
전제로 깔고 있었는데, **그 전제가 배포 토폴로지와 맞지 않는다.**

| 무엇 | 기본 경로 | 우리 경로 |
|---|---|---|
| 로그인 시작 | `/oauth2/authorization/{registrationId}` | `/api/oauth2/authorization/{registrationId}` |
| 콜백 | `/login/oauth2/code/{registrationId}` | `/api/login/oauth2/code/{registrationId}` |

`docs/context/deployment.md` §4의 nginx 라우팅 표에서 **백엔드로 가는 location은 `/api/` 하나뿐**이다
(`/project/`는 Jenkins, `/`는 Next.js). 기본 경로를 그대로 쓰면 `https://www.dero.life/oauth2/authorization/kakao`가
`location /`에 걸려 **Next.js가 받는다** — 404다. 콜백도 같은 운명이라 제공자가 돌려보낸 인가 코드가
백엔드에 영영 닿지 않는다. **로컬(`localhost:8080` 직접 호출)에서는 nginx가 없어 이 증상이 나타나지 않는다.**

배선은 `.oauth2Login(oauth2 -> oauth2.authorizationEndpoint(...baseUri).redirectionEndpoint(...baseUri))`와
각 `registration`의 `redirect-uri`를 같이 옮기는 것이다. 셋 중 하나만 옮기면 인가 요청과 콜백이 어긋난다.

**nginx에 `/oauth2/`·`/login/oauth2/` location 두 개를 더 다는 대안**을 버린 이유는 nginx 설정이
`/etc/nginx/sites-available/dero`에만 살고 **리포에 없어서 형상관리 밖**이기 때문이다. 같은 문서가
"nginx 설정에 죽은 `/db/` location이 남아 있다면 지워라"라고 적을 만큼 서버 설정이 드리프트해 왔다.
`/api/` 아래로 몰면 로컬과 배포가 같은 경로를 쓰고, 배선이 코드·yaml에 남아 리뷰를 탄다.

같은 판단의 전례가 이미 있다 — `application.yaml`이 액추에이터를 `/api/actuator`로 옮기며 그 이유를
"nginx가 리버스 프록시로 넘기는 접두사는 `/api`뿐이라"라고 적어 놓았다. 이 결정은 그 규칙을 OAuth
엔드포인트에도 적용한 것뿐이다.

**대가**: 팀이 참고하는 국내 레퍼런스와 경로가 달라진다("커스텀 JWT 필터를 버린다"에서 이미 한 번
치른 값과 같은 종류의 대가다). 그리고 **카카오·구글 콘솔에 등록하는 Redirect URI에 `/api`가 끼어야 한다** —
로컬 `http://localhost:8080/api/login/oauth2/code/{kakao,google}`, 운영
`https://www.dero.life/api/login/oauth2/code/{kakao,google}`. 이걸 빠뜨리면 제공자가
`redirect_uri_mismatch`로 거절한다.

### 12. 운영 프론트는 API를 상대 경로로 부른다

**(2026-07-31 추가, 승인 박동규.)** 결정 11과 세트다.

`frontend/src/constants/api.ts`가 `process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8080'`인데,
**그 환경변수가 리포 어디에도 설정돼 있지 않다** — `compose.yaml`의 frontend 서비스에 `environment`
블록 자체가 없고 `frontend/Dockerfile`·`Jenkinsfile`에도 없다. 즉 배포된 페이지의 브라우저가
`http://localhost:8080`, 곧 **사용자 자기 PC**를 친다.

배포 빌드에서 `NEXT_PUBLIC_API_BASE_URL`을 **`https://www.dero.life`**(절대 오리진)로 준다. 로컬은
값을 안 주면 기본값 `http://localhost:8080`이 살아 크로스 오리진으로 붙는다.

`NEXT_PUBLIC_*`는 빌드 타임에 번들 문자열로 인라인되므로 **런타임 env가 아니라 이미지 빌드 인자로
넣어야 한다** — `compose.yaml`의 `environment:`에 넣으면 안 먹는다. 배선은 두 자리다:
`frontend/Dockerfile` 빌드 스테이지의 `ARG`/`ENV`와 `compose.yaml` frontend의 `build.args`.
Jenkins가 `docker compose -p dero build`로 빌드하므로(`Jenkinsfile`) `build.args`가 그대로 먹고
파이프라인은 손댈 필요가 없다.

**빈 문자열(= `/api/v1/...` 상대 경로)을 골랐다가 철회했다.** 동일 오리진이라 상대 경로가 더 깨끗하고
`??`가 빈 문자열을 밀어내지 않아 동작도 한다. 버린 이유는 **서버 컴포넌트다** — `app/desk-feed/page.tsx`·
`[feedId]/page.tsx`·`new/page.tsx` 셋이 Node에서 `fetch`를 부르는데 **Node의 `fetch`는 상대 경로를
받지 못한다**(`Failed to parse URL from /api/v1/...`). 상대 경로로 가려면 그 셋을 클라이언트로 옮기거나
서버 전용 오리진 변수를 하나 더 두어야 하는데, 둘 다 이 티켓(인증)의 범위가 아니다. 절대 오리진은
변수 하나로 브라우저·Node 양쪽을 덮는다. 세 페이지가 클라이언트로 옮겨지는 날 빈 문자열로 줄일 수 있다.

절대 오리진의 대가는 **서버 컴포넌트 렌더가 nginx를 한 바퀴 돈다는 것**이다(컨테이너 → 공개 도메인 →
nginx → 백엔드 컨테이너). 요청당 홉이 하나 늘지만 같은 호스트라 실질 비용이 작고, 무엇보다 **로그인
경로는 전부 브라우저에서 일어나므로 이 홉을 타지 않는다.** 만에 하나 이 hairpin이 막히더라도 깨지는
것은 `/desk-feed` 서버 렌더뿐이고 인증은 영향이 없다 — 위험이 격리돼 있다는 점이 이 선택의 근거 중 하나다.

한편 이 결정은 "로컬 개발에는 CORS가 필요하다"는 아래 파급 항목을 **바꾸지 않는다.** 브라우저가 보는
오리진이 프론트(`https://www.dero.life`)와 API에서 같으므로 운영은 여전히 동일 오리진이고 CORS가 필요
없다 — `app.cors.allowed-origins`가 운영에서 빈 값인 것과 그대로 짝이다.

### 12-개정. 브라우저는 상대 경로, 서버 렌더만 절대 오리진

**(2026-08-03 개정, 승인 박동규.)** 결정 12가 "세 페이지가 클라이언트로 옮겨지는 날 빈 문자열로 줄일 수
있다"며 남긴 조건 대신, **같은 문단이 함께 제시한 다른 길**을 택했다 — 서버 전용 오리진 변수를 하나 더
둔다. 위 본문은 그 시점의 판단 기록으로 남기고, 지금 유효한 배선은 이 항목이다.

계기는 장애다. `dero.life` apex A 레코드가 등록되며 apex 유입이 생겼고, 절대 오리진이 페이지 오리진과
어긋나 **모든 API가 preflight에서 막혔다**(`/auth/refresh` 포함 → 로그인 끊김). nginx 301로 호스트를
www 하나로 모아 지혈했지만(`docs/context/deployment.md` §4), 절대 오리진이 남아 있으면 호스트가 하나
늘 때마다 재발한다. **"동일 오리진 전제로 CORS를 닫는다"는 이 ADR의 전제를 코드가 스스로 지키게 만드는
것**이 이 개정의 요지다.

- 브라우저: `NEXT_PUBLIC_API_BASE_URL`을 빈 문자열로 준다 → `/api/v1/...` 상대 경로. 페이지가 어느
  호스트로 서빙되든 동일 오리진이라 CORS가 원리적으로 발생하지 않는다.
- 서버 렌더(RSC): 런타임 env `INTERNAL_API_ORIGIN`(`http://backend:8080`). Node `fetch`가 상대 경로를
  못 받는 제약은 그대로다. `NEXT_PUBLIC_` 접두사가 없어 번들에 인라인되지 않고 브라우저로 새지 않는다.
- 부수 효과로 hairpin이 사라졌다. 서버 렌더가 공개 도메인·nginx·TLS를 거치지 않고 컨테이너로 직행한다.

**서버에서 실제로 fetch하는 곳은 결정 12가 적은 `/desk-feed` 셋이 아니다**(그 셋은 그 후 클라이언트
로더로 바뀌었다). 2026-08-03 실측으로 `app/product/page.tsx`·`app/product/[productId]/page.tsx`와
`api/terms.server.ts`다. 세 곳 모두 `generateStaticParams`가 없어 **빌드 타임 fetch가 없다** — 이미지
빌드 중에는 백엔드 컨테이너가 없으므로 이 조건이 깨지면 내부 오리진으로는 빌드가 실패한다. 정적 생성을
새로 켜는 변경은 이 항목을 먼저 다시 읽어야 한다.

`API_ORIGIN`(OAuth 이동용)은 브라우저 값을 그대로 쓴다 — 빈 문자열이면
`/api/oauth2/authorization/{provider}`로 동일 오리진 이동이라 결정 11과 그대로 맞물린다.

## 대안과 버린 이유

**서버 세션 (Spring Session + Redis).** 가장 아까운 대안이다. EC2가 1대라 JWT의 무상태 이점은 어차피 없고, Spring 기본값이라 코드가 제일 적고, 로그아웃과 정지가 즉시 먹는다. 결정 1에서 본 세션 정책 함정도 통째로 사라진다. 기술로만 재면 이쪽이 낫다. 팀 학습 목표(리프레시 회전 구현 경험)와 어긋나서 버렸다 — 그게 유일한 이유다.

**프론트 next-auth로 OAuth를 교환한다.** 버린 이유는 `user` 행 생성 규칙이 백엔드 몫이라는 점이다. 결정 7의 이메일 충돌 처리와 합성 이메일 규칙이 백엔드에 있는데 교환까지 프론트가 하면 신원 생성 경로가 둘로 갈라진다. 쿠키 편의도 next-auth를 부를 이유가 못 된다 — 운영은 nginx 뒤 동일 오리진이라 백엔드가 굽는 쿠키가 그냥 붙는다.

**액세스 토큰을 localStorage에 둔다.** 새로고침 왕복이 사라지고 프론트 코드가 단순해진다. 버린 이유는 XSS 한 번이면 영구 탈취라서다. 토큰이 스크립트에서 읽히는 순간 회전을 넣은 의미가 없어진다.

**리프레시 재사용 시 해당 체인만 무효화한다.** 결정 4보다 정교하다. 탈취된 기기만 끊고 나머지는 살려 둔다. 버린 이유는 체인 계보를 저장해야 성립하기 때문이다. 데스크 시뮬레이터는 데스크톱 1대에서 쓰는 서비스라 사용자당 기기가 사실상 하나다. 자료구조를 늘려 얻는 값이 작다.

**이메일이 같으면 계정을 자동 연결한다.** UX로는 이쪽이 매끄럽다. 버린 이유는 결정 7 그대로다 — provider 이메일에 소유 검증 보장이 없어 계정 탈취 경로가 되고, `provider` 컬럼 하나로는 연결된 상태를 표현할 수 없다.

**백엔드가 `redirect` 파라미터를 받아 보관한다.** 프론트가 `sessionStorage`를 다룰 필요가 없어진다. 버린 이유는 오픈 리다이렉트다. 파라미터를 받는 순간 화이트리스트 검증을 짜야 하고 그 검증은 틀리기 쉽다. 게다가 백엔드가 목적지 URL을 조립하기 시작하면 "토큰도 여기 붙이면 편한데"가 따라온다. 받지 않으면 둘 다 생기지 않는다.

**커스텀 JWT 필터 + jjwt.** 팀이 참고하는 국내 레퍼런스(개발자 유미 계열)가 대부분 이 모양이라 코드를 대조하기 쉽다. 그 대가를 명시해 둔다 — 우리 코드는 그 글들과 다르게 생겼고, 검색으로 따라 하기가 어려워진다. 그래도 버렸다. 코드량이 더 많고, 결정 9에 적은 401 배선 함정이 붙고, 서명 검증을 직접 짜면 그게 곧 우리가 유지보수할 보안 코드가 된다.

**매 요청 DB로 권한을 조회한다.** 정지가 즉시 먹고 권한 변경 지연도 사라진다. 버린 이유는 무상태를 고른 이유를 스스로 지우기 때문이다. 요청마다 DB를 때릴 거면 세션이 낫다. 절충처럼 보이지만 실제로는 두 방식의 비용만 합친 모양이 된다.

## 파급

- **권한·정지 변경이 최대 30분 늦게 반영된다.** 액세스 토큰 수명만큼이다. 즉시 끊어야 하면 `refresh:{userId}`를 `DEL`하고 남은 30분을 기다린다.
- **같은 사람이 카카오·구글로 계정 2개를 가질 수 있다.** 결정 7이 자동 연결을 막았으니 당연한 결과다. 이메일 발송 기능이 없어 실질 피해는 "저장한 배치가 다른 계정에 있다" 수준이고, 로그인 화면 안내로 완화한다.
- **프론트는 새로고침마다 `/api/auth/refresh` 왕복 1회 + 회전 1회를 치른다.** 첫 렌더에 "로그인 확인 중" 상태가 생긴다. 이 상태를 그리지 않으면 로그인한 사용자에게 비로그인 화면이 한 번 깜빡인다.
- **로컬 개발에는 CORS가 필요하다.** `localhost:3000` → `localhost:8080`은 크로스 오리진이라 `allowCredentials(true)`와 정확한 오리진 지정이 있어야 리프레시 쿠키가 오간다. 운영은 nginx 뒤 동일 오리진이라 CORS가 사라진다. 두 환경의 설정이 달라진다는 뜻이다.
- **시크릿이 늘었다.** OAuth 클라이언트 시크릿 2쌍 + JWT HMAC 시크릿. 보관 위치는 아직 미결이고, 맵의 안개 항목 "환경 분리·시크릿 관리"에 걸려 있다.
- **리다이렉트 URI 등록에는 확정된 호스트가 필요하다.** DERO-137 인프라 계정·스펙 확인이 EIP와 도메인을 확정해야 카카오·구글 콘솔 등록을 마칠 수 있다.
- **(2026-07-29 해소) 카카오 이메일 스코프는 아예 요청하지 않는다.** 비즈앱 전환 여부를 확인하는 대신, 카카오 `registration.scope`에서 `account_email`을 뺐다 — `profile_nickname`만 요청한다. 그 결과 카카오 로그인은 결정 7의 두 경로(이메일 있음/없음) 중 **합성 이메일(`kakao_{provider_id}@dero.invalid`) 경로만 실제로 탄다.** 이메일 있음 경로는 `SocialProfileExtractor`가 여전히 처리하지만(스코프가 나중에 바뀌어도 안전하도록) 지금 설정에서는 도달하지 않는다.
- **DERO-135 API 응답 규약 결정의 블로킹이 풀린다.** 401·403 응답이 어디서 어떤 모양으로 나가는지가 이 ADR 위에서 정해진다.
- 구현 착수 전이라 **코드 변경은 없다.** wayfinder 규칙대로 이 티켓의 산출물은 결정 그 자체다.
