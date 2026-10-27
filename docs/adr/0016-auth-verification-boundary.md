# ADR-0016. 인증 검증 경계 — 행복 경로는 사람이, 실패 경로는 기계가

## 상태

**확정** — 2026-07-31, 승인 박동규. ADR-0005(소셜 OAuth + 회전 리프레시 JWT)의 검증 전략을 정한다.

## 맥락

ADR-0005의 구현은 사실상 끝나 있었다. `SecurityConfig`·`JwtConfig`·`JwtIssuer`·`RefreshTokenService`·
`RefreshCookieWriter`·성공/실패 핸들러·`AuthController`·`GET /users/me`가 전부 있고 결정 1~10이 코드에
들어가 있다. 그런데 **인가가 꺼져 있었다** — `SecurityConfig`의 `.anyRequest().permitAll()`(2026-07-29
재도입, 로그인 없이 배치·상품 기능을 먼저 검증하려고). 그래서 "토큰 없으면 거절한다"가 한 번도 돌아본
적이 없다.

검증 상태를 실측하니 이렇게 갈려 있었다.

| 무엇 | 어디서 검증되나 | 상태 |
|---|---|---|
| 서명·만료·변조·`typ=refresh` 거절 | `SecurityProblemDetailTest` 5건 | ✅ 통과 중 |
| 토큰이 **아예 없을 때** 401 | 같은 파일 `unauthorized()` | ⛔ `@Disabled` (permitAll 때문) |
| Redis jti Set 회전·재사용 탐지 | `RefreshTokenServiceTest`(Testcontainers Redis) | ✅ 통과 중 |
| 회전·로그아웃 컨트롤러 배선 | `AuthControllerTest`(`@WebMvcTest`, `addFilters = false`) | ✅ 통과 중 |
| 프론트 상태기계·returnTo | `e2e/oauth.spec.ts` 8건(전부 `page.route` 스텁) | ✅ 통과 중 |
| **제공자 왕복 전체** | — | ❌ 없음 |
| **전송 계약(쿠키 path·SameSite·Secure)** | — | ❌ 없음 |

마지막 줄이 실제로 사고를 냈다. 리프레시 쿠키 `Path`가 `/api/v1/auth/refresh`라 브라우저가
`/api/v1/auth/logout`에 그 쿠키를 안 보냈고, 로그아웃이 **한 번도** `revokeAll`을 못 불렀다(ADR-0005
결정 3 개정 절). 위 표의 어느 층도 이걸 못 봤다 — MockMvc는 쿠키 path 스코핑을 강제하지 않고,
Playwright 스펙은 그 엔드포인트를 204로 스텁한다. **브라우저의 쿠키 규칙을 모델링하지 않는 층에서만
검증하면 전송 계약 버그에 구조적으로 눈이 먼다.**

그리고 지울 수 없는 제약이 하나 있다. **진짜 구글·카카오 동의 화면은 CI에서 자동화할 수 없다** — 봇
탐지·2FA·약관. 그러니 제공자는 어딘가에서 반드시 가짜여야 하고, 질문은 "가짜로 하느냐"가 아니라
**"어느 이음매에서 가짜냐"**다.

## 결정

### 1. 제공자 왕복(행복 경로)은 사람이 손으로 밟는다 — 가짜 OAuth 서버를 만들지 않는다

박동규가 프론트에서 구글·카카오 버튼을 직접 누르고 로그인이 되는 것을 확인한다. 자동화하지 않는다.

가짜 제공자 서버(로컬 HTTP 서버가 `/authorize`·`/token`·`/userinfo`를 흉내내고 e2e 프로파일이
`spring.security.oauth2.client.provider.*`의 URI를 그쪽으로 덮어쓰는 방식)를 진지하게 검토했고 기술적으로
가능하다는 것도 확인했다 — 현재 설정은 `google.scope: email,profile`로 `openid`가 없어 구글·카카오 **둘
다 평범한 OAuth2 userinfo 플로우**라 JWKS도 id_token 서명도 필요 없다. 그런데 **그 서버가 존재할 이유가
"행복 경로를 자동으로 돌리기" 하나뿐이고, 그걸 사람이 맡으면 이유가 사라진다.**

### 2. 사람은 로컬과 배포 **양쪽**에서 밟는다

두 환경은 설정 축이 다르다 — 로컬은 `localhost:3000 → :8080` 크로스 오리진 + CORS + `cookie.secure=false`,
운영은 nginx 뒤 동일 오리진 + CORS 없음 + `secure=true`. **한쪽만 밟으면 다른 쪽 축은 증명되지 않는다.**
이 저장소는 운영 전용 설정이 배포에서만 죽는 사고를 3연속으로 냈다(ADR-0010 계열).

### 3. 나머지는 전부 기계가 맡는다 — 백엔드 통합테스트 + ArchUnit 불변식

제공자 왕복이 **필요 없는** 것은 전부 기계 몫이다. 사람이 UI에서 밀 수 없는 것들이기도 하다.

| 무엇 | 왜 사람이 못 하나 |
|---|---|
| 리프레시 재사용 탐지(결정 4) | 회전 직후 브라우저가 옛 쿠키를 버려 다시 못 들이민다 |
| 액세스 토큰 만료 후 자동 회전 | 30분 기다려야 한다 |
| `typ=refresh`를 Bearer로 재생 | UI에 그런 버튼이 없다 |
| 토큰 없이 보호 API → 401, 권한 없이 → 403 | 같음 |
| 로그아웃 후 Redis Set이 진짜 비었는지 | **화면에 안 나온다** — 쿠키는 지워지고 로그아웃된 것처럼 보인다 |

마지막 줄이 결정적이다. **휴먼인더루프는 그 버그를 못 잡는다.** 지금까지 못 잡힌 이유와 똑같다.

하네스는 새로 만들지 않는다. `AbstractPostgresIntegrationTest`(싱글턴 Postgres)와
`RefreshTokenServiceTest`의 `GenericContainer` Redis 패턴이 이미 있다.

### 4. 쿠키 전송 계약은 브라우저를 흉내내지 않고 **불변식**으로 박는다

*"리프레시 쿠키를 읽는 모든 핸들러의 매핑 경로는 그 쿠키 `Path`의 하위여야 한다."*

`@CookieValue(name = RefreshCookieWriter.COOKIE_NAME)`이 붙은 핸들러를 찾아 매핑 경로가 `COOKIE_PATH`
접두사인지 ArchUnit이 단언한다. 이미 `architecture/` 아래에서 컨벤션 25개가 같은 방식으로 강제되고 있다.

**브라우저 스펙보다 강하다** — 브라우저 스펙은 스펙을 쓴 엔드포인트만 잡지만, 불변식은 앞으로 추가될
엔드포인트까지 잡는다.

### 5. Playwright에 백엔드를 붙이지 않는다

`e2e/`는 지금대로 프론트 + `page.route` 스텁으로 둔다. `e2e/CLAUDE.md`에 SwiftShader 관련 실사고가
쌓여 있고 특히 **"풀스위트를 연달아 돌리면 `boot()`가 누적 열화해 손대지도 않은 스펙이 맨 타임아웃으로
죽는다"가 3회 재현**됐다. 그 위에 Spring·Postgres·Redis 기동을 얹으면 기존 시뮬레이터 스펙이 같이 흔들린다.
4주 프로젝트에 e2e 하네스를 둘 유지할 여력도 없다.

## 대안과 버린 이유

**가짜 OAuth 제공자 서버.** 결정 1에 적었다 — 사람이 행복 경로를 맡으면 존재 이유가 사라진다. 기술적
장벽이 없다는 것까지 확인했으므로, 나중에 "사람 손 없이 CI에서 로그인 왕복을 돌려야 한다"가 생기면
이 카드를 그대로 꺼내면 된다. `openid` 스코프를 추가하는 날에는 JWKS 엔드포인트가 추가로 필요해진다는
것만 기억할 것.

**테스트 프로파일 백도어 엔드포인트**(`POST /test/login?userId=1`이 쿠키·토큰을 직발급). 제일 싸다.
버린 이유는 ADR-0005가 결정 10개를 쓴 `oauth2Login` 필터 체인을 통째로 건너뛰기 때문이다. 검증하려는
바로 그 코드를 우회한다. 코드베이스에 인증 백도어가 생기는 것도 그 자체로 부채다.

**MockMvc/RestAssured만으로 끝낸다.** 결정 3이 이걸 채택하되 결정 4를 덧붙인 이유가 여기 있다.
브라우저가 없으면 쿠키 path 스코핑이 안 보이고, 그게 이번 버그가 숨은 자리다. 그래서 "브라우저를 들여온다"
대신 "브라우저 없이도 성립하는 불변식으로 바꾼다"를 골랐다.

**지금 그대로 `page.route` 스텁만 유지.** 인프라 0이지만 Spring이 한 번도 안 떠서 "기능 완성"을 아무것도
증명하지 못한다.

## 파급

- **회귀 방지가 사람 일정에 묶인다.** 제공자 왕복은 자동 게이트가 없다 — 누가 `SecurityConfig`나
  `OAuth2LoginSuccessHandler`를 건드리면 다음 손 테스트까지 아무도 모른다. 그 파일들을 바꾸는 MR은
  손 확인을 요구 사항으로 달 것.
- **로컬 손 테스트에는 선행 준비가 있다.** `backend/dero-api/.env.local`에 카카오·구글 client-id/secret이
  필요하고(현재 파일 없음), 두 콘솔에 리다이렉트 URI를 등록해야 한다. 배포 값은 운영 서버 `.env`에만 있다.

  ```
  http://localhost:8080/api/login/oauth2/code/kakao      https://www.dero.life/api/login/oauth2/code/kakao
  http://localhost:8080/api/login/oauth2/code/google     https://www.dero.life/api/login/oauth2/code/google
  ```

  **`/api`가 반드시 끼어야 한다** — ADR-0005 결정 11이 Spring OAuth 엔드포인트를 `/api/` 아래로 옮겼다
  (nginx가 백엔드로 넘기는 location이 `/api/` 하나뿐이라서다). 이 문단은 처음에 Spring 기본 경로
  (`/login/oauth2/code/...`)를 적었고, 결정 11이 나중에 확정되면서 **같은 작업 묶음의 두 ADR이 사람에게
  서로 다른 값을 지시하는 상태**가 잠깐 생겼다(2026-07-31 교차검증에서 검출·정정). 콘솔 등록은 사람만
  할 수 있고 틀리면 `redirect_uri_mismatch`로 손 테스트 전체가 막히므로, 이 값은 코드를 정본으로 삼는다 —
  `application-*.yaml`의 `redirect-uri`가 진짜다.
- **`SecurityProblemDetailTest.unauthorized()`의 `@Disabled`를 걷는 것이 인가 복구의 완료 신호다.**
  그 테스트의 단언이 곧 복원해야 할 계약이라 새로 쓸 게 없다(DERO-282).
- **"로그아웃 후 Redis가 비었는지"는 기계 단언과 사람 실측 둘 다 둔다.** 기계는 통합테스트로, 사람은
  손 테스트 때 `redis-cli KEYS 'refresh:*'` 한 번. 같은 사실을 다른 층에서 보는 게 이번 사고의 교훈이다.
