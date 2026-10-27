# ADR-0008. 엔벨로프 없는 응답 + `ProblemDetail` 에러 + 커서/offset 목록

## 상태

**확정** — 2026-07-27, 승인 박동규.
결정 티켓 DERO-135 (에픽 DERO-125). 설계 맵: `docs/context/architecture-map.md`.

## 맥락

백엔드 2명 / 4주. Spring Boot 4.1, Java 21, Spring Security 7.

**백지 상태다.** 백엔드에 컨트롤러가 0개고, 프론트 `src/api/`·`src/types/`도 비어 있다. 굳은 관례가 없으니 되돌리는 비용이 아직 0이고, 이 결정이 첫 컨트롤러가 나오는 순간부터 관례가 된다.

이 ADR이 닫는 두 구멍:

| 남아 있던 것 | 어디서 왔나 |
|---|---|
| 401·403 응답 바디 배선 | [ADR-0005](0005-auth-social-oauth-jwt-rotation.md) 결정 9 — `oauth2ResourceServer().jwt()` 내장 사용을 확정하며 "필터에서 던진 예외는 `@ControllerAdvice`에 안 잡힌다"는 함정을 남겼다 |
| `global/response/`의 내용물 | [ADR-0007](0007-package-structure-and-aggregates.md) 결정 5 — 자리만 잡고 "135가 채운다"로 남겼다 |

## 결정

**응답 매트릭스** — 아래 결정들이 이 표로 수렴한다.

| 상황 | 상태 | 바디 |
|---|---|---|
| 조회 성공 | 200 | 리소스 그 자체 |
| 생성 성공 | 201 + `Location` | 생성된 리소스 |
| 삭제·빈 응답 | 204 | 없음 |
| 목록 조회 | 200 | 커서 또는 offset 봉투 |
| 검증 실패 | 400 | `ProblemDetail` + `errors` |
| 상태 충돌 | 409 | `ProblemDetail` |
| 도메인 규칙 위반 | 422 | `ProblemDetail` |
| 인증 없음·만료 | 401 | `ProblemDetail` (직접 배선) |
| 권한 없음 | 403 | `ProblemDetail` (직접 배선) |
| 서버 오류 | 500 | `ProblemDetail`, `detail`은 일반 문구 |

### 1. 성공 응답에 엔벨로프를 두지 않는다

성공 바디는 **리소스 그 자체**다. `{"success":true,"data":{...}}` 같은 봉투를 씌우지 않는다. 대신 상태 코드를 제대로 쓴다 — 조회 200, 생성 **201 + `Location` 헤더**, 삭제·빈 응답 **204(바디 없음)**.

근거 셋.

**① 엔벨로프의 "항상 한 모양" 약속은 원래 지켜지지 않는다.** 봉투에 못 담기는 응답이 실재한다.

| 응답 | 누가 내나 | 왜 봉투가 안 씌워지나 |
|---|---|---|
| 401 · 403 | Spring Security 필터 | 컨트롤러 앞에서 끊는다 |
| 502 · 504 | nginx | WAS가 죽어 있다 |
| 413 | 서블릿 컨테이너 | 업로드 크기 초과를 앱보다 먼저 잡는다 |

프론트는 어차피 "봉투 아닌 응답"을 처리하는 코드를 쓴다. 엔벨로프는 분기를 없애주지 못하면서 없앴다고 믿게 만든다. GLB 업로드가 20~30MB라 413은 가정이 아니다.

**② HTTP 의미를 되찾는다.** 항상 200 패턴은 201+`Location`(업로드·생성), 204(삭제), 304+`ETag`를 전부 못 쓴다. 카탈로그·규격 마스터는 거의 안 변해서 조건부 요청이 공짜 캐시가 되는데 그 길이 막힌다. 재시도·에러율 계측도 상태 코드로 돈다.

**③ 프레임워크 기본값이 공짜다.** 검증 실패·404·405·415가 `ProblemDetail`로 나간다. 엔벨로프를 고르면 그 넷을 갈아끼우는 핸들러를 우리가 쓴다.

> 정정(2026-07-27 구현 시 확인, DERO-195): 원래 "Boot 4는 자동 처리한다"고 적었으나 **부정확했다.** `spring.mvc.problemdetails.enabled`는 Boot 4.1에서도 기본값 `false`인 opt-in이고, Boot 4에서 속성 위치가 `spring-boot-webmvc` 모듈로 이사했다(`spring-boot-autoconfigure`에서 찾으면 없는 것처럼 보인다). 다만 **속성을 켤 필요는 없다** — 그 속성이 만드는 빈은 `@ConditionalOnMissingBean(ResponseEntityExceptionHandler.class)`라, 우리 `GlobalExceptionHandler`가 그 타입을 상속하는 이상 무동작이다. 결론은 그대로: 넷 다 `ProblemDetail`로 나간다(정적 리소스 404 포함).

**되돌리는 비용이 비대칭이다.** 엔벨로프 없음 → 있음 전환은 `ResponseBodyAdvice` 하나 + 프론트 인터셉터 하나다. 반대 방향은 프론트 전 호출부를 훑어야 해서 비싸다. 싼 쪽에서 출발한다.

프론트 파싱 규칙이 하나로 고정된다: **`res.ok`면 바디는 리소스, 아니면 `ProblemDetail`.** 상태 코드가 판별자라 바디 모양을 추측하지 않는다.

### 2. 에러는 RFC 9457 `ProblemDetail` + `code` 확장 필드

표준 5필드를 그대로 유지한다 — `type`(`about:blank`) · `title` · `status` · `detail` · `instance`. `instance`는 Spring이 자동으로 채우므로 빼려면 오히려 코드를 쓴다.

⚠️ **`type`은 실제 응답 바디에 실리지 않는다**(2026-07-27 구현 시 확인, DERO-195). Spring Framework 7의 `ProblemDetail.type`은 기본 미설정이고 `ProblemDetailJacksonMixin`의 `@JsonInclude(NON_EMPTY)`가 생략한다. RFC 9457이 **"필드 부재 = `about:blank`"**로 규정하므로 명세 위반이 아니다 — 값을 실으려면 오히려 코드를 써야 한다. 아래 예시에서 `type` 줄을 뺀 이유이고, 프론트는 `type`이 없는 것을 정상으로 다뤄야 한다.

- **확장 필드 `code`** — 프론트가 분기하는 안정된 문자열 키. HTTP 상태만으론 "제품이 없다"와 "사용자가 없다"를 못 가른다.
- **`detail`은 한국어 사용자 노출 문구다.** 그대로 화면에 띄운다.
- **검증 실패(400)에만 `errors` 배열이 추가로 붙는다.** 배열인 이유: 같은 필드에 오류가 2개일 수 있어 맵(`{"field":"reason"}`)은 하나를 잃는다.

404:

```json
{
  "title": "Not Found",
  "status": 404,
  "detail": "제품을 찾을 수 없습니다.",
  "instance": "/api/v1/products/999",
  "code": "PRODUCT_NOT_FOUND"
}
```

검증 실패 400:

```json
{
  "title": "Bad Request",
  "status": 400,
  "detail": "입력값이 올바르지 않습니다.",
  "instance": "/api/v1/products",
  "code": "INVALID_INPUT",
  "errors": [
    { "field": "widthMm", "reason": "0보다 커야 합니다." },
    { "field": "name", "reason": "필수입니다." }
  ]
}
```

`type`을 진짜 문서 URI로 만드는 안은 **나중 카드로 남긴다.** 에러 문서 사이트를 운영해야 성립하는데 4주에 안 만든다. 필드가 이미 있으니 나중에 값을 채워도 기존 클라이언트가 안 깨진다.

### 3. 에러 코드는 도메인별 enum, 예외 클래스는 `BusinessException` 하나

코드 문자열은 **의미형 `SCREAMING_SNAKE`** — `PRODUCT_NOT_FOUND`. 숫자혼합(`PRODUCT4001`)을 버린 이유: 번호 채번을 사람이 관리해야 하고, 프론트에서 `code === "MEMBER4001"`은 읽어도 뜻을 모른다.

**배치**: `global/exception/ErrorCode`(인터페이스) + 도메인마다 enum(`product/ProductErrorCode` 등).

```java
// global/exception/ErrorCode.java
public interface ErrorCode {
  HttpStatus status();
  String code();
  String detail();   // 한국어 필수 — 구현이 안 채우면 컴파일 안 됨
}

// product/ProductErrorCode.java
public enum ProductErrorCode implements ErrorCode {
  NOT_FOUND(HttpStatus.NOT_FOUND, "PRODUCT_NOT_FOUND", "제품을 찾을 수 없습니다."),
  SPEC_TYPE_IMMUTABLE(HttpStatus.CONFLICT, "PRODUCT_SPEC_TYPE_IMMUTABLE", "제품 종류는 변경할 수 없습니다.");
}
```

> **개정(2026-07-30, [ADR-0012](0012-backend-code-conventions.md) 결정 6): 코드 문자열을 손으로 쓰지 않는다 — 상수명이 곧 코드다.**
> **응답 JSON의 `code` 값은 바뀌지 않는다.** 바뀌는 것은 그 값을 어디서 얻느냐뿐이다 — 위 예시의 3인자 생성자에서 코드 문자열 인자가 빠지고, `code()`의 기본 구현이 `name()`을 반환한다. 상수명이 도메인 접두사를 포함하도록 바꾼다(`NOT_FOUND` → `PRODUCT_NOT_FOUND`).
> 이유: 실측(2026-07-30) 결과 상수명=문자열인 enum 2개와 접두사를 따로 붙이는 enum 3개가 공존했고, **`AUTH_` 접두사를 서로 다른 두 enum이 발행하고 있었다**(`auth/AuthErrorCode`와 `global/security/SecurityErrorCode`) — 프론트가 `code`로 분기하므로 충돌하면 조용히 잘못 분기한다. `name()`을 쓰면 오타·중복이 구조적으로 불가능해지고 `grep` 한 번으로 발행처를 찾는다(지금은 상수명과 문자열이 달라 두 번 필요하다).
> **위 "의미형 `SCREAMING_SNAKE`" 결정과 단일 거대 enum 기각은 그대로 유효하다** — 바뀐 것은 문자열을 손으로 쓰느냐 `name()`으로 얻느냐뿐이다.

단일 거대 enum을 버린 이유 둘. ① 백엔드 2명이 4주 내내 같은 파일 끝에 줄을 붙이면 머지 충돌이 상시 난다. ② ADR-0007 결정 7의 의존 방향 — 단일 enum은 `global`이 전 도메인 어휘를 알게 되는데, `global`은 아무도 몰라야 하는 자리다. 코드 문자열 중복 방지는 도메인 접두사가 한다.

**예외 클래스는 `BusinessException` 하나다.** `throw new BusinessException(ProductErrorCode.PRODUCT_NOT_FOUND)`. 도메인마다 예외 클래스를 만들면 `@ExceptionHandler`가 같이 늘거나, 어차피 공통 부모로 잡을 거면 애초에 나눌 이유가 없다. 잡아서 다르게 처리해야 할 예외가 생기면 그때 따로 만든다.

**이 구조가 강제 장치라는 점이 핵심이다.** `ProblemDetail`은 `ErrorCode`를 통해서만 만들어진다 → 문구 없는 에러가 나갈 길이 없다. 안 그러면 Spring 기본 문구가 그대로 나간다 — 영어 문구가 사용자 화면에 뜨고 프론트가 분기할 `code`도 없다.

> 정정(2026-07-27 실측, DERO-195): 원래 이 자리에 `"Failed to convert value of type 'java.lang.String' to required type 'java.lang.Long'"`을 인용했으나 **그건 Boot 3 시절 문구다.** Spring Framework 7의 `ResponseEntityExceptionHandler.handleTypeMismatch`가 실제로 내는 `detail`은 `"Failed to convert 'id' with value: 'abc'"`이고, 기대 타입 이름(`getRequiredType().getSimpleName()`)은 메시지 인자로만 넘겨 문자열에 박히지 않는다. **내부 타입 노출은 SF7에서 이미 막혀 있다.** 그래도 위 논지는 살아 있다 — 남은 위반은 ① 영어 `detail` ② `code` 부재 ③ 어느 파라미터가 문제인지 알려주는 `errors` 부재 셋이고, 195가 `handleTypeMismatch` 오버라이드로 셋 다 막았다(`reason`에 기대 타입 이름을 넣지 않는 것이 규칙이다).

**상태 코드 배정 규칙표** — 새 `ErrorCode` 상수를 만들 때 이 표로 정한다.

| 상황 | 상태 |
|---|---|
| 없는 리소스 | 404 |
| 요청 형식·검증 실패 | 400 |
| 상태 충돌(이미 존재, 중복) | 409 |
| 도메인 규칙 위반 | 422 |

이 표를 두는 이유: `code`가 의미를 다 지니면 `status`는 아무도 안 보는 장식이 되고, 장식은 관리가 안 돼 드리프트가 난다. 같은 "없다"인데 하나는 400, 하나는 404로 갈린 코드가 실재한다.

### 4. 401·403은 공유 팩터리로 직접 배선한다

ADR-0005 결정 9가 `oauth2ResourceServer().jwt()`(Spring 내장)로 확정했다. 기본 401은 `BearerTokenAuthenticationEntryPoint`가 내는데 **바디가 비어 있다.** 우리 `ProblemDetail`로 교체한다.

배선 방식은 **공유 정적 팩터리**다. `ProblemDetails.of(errorCode, request)`를 `@RestControllerAdvice`와 두 핸들러가 **같이** 쓰고, 핸들러는 `ObjectMapper`로 응답에 직접 쓴다.

```java
http.oauth2ResourceServer(oauth2 -> oauth2
    .jwt(Customizer.withDefaults())
    .authenticationEntryPoint(problemDetailEntryPoint)      // 401
    .accessDeniedHandler(problemDetailAccessDeniedHandler)  // 403
);
```

**인증 관련 코드 4종.**

| 코드 | 상태 | 언제 | 프론트 동작 |
|---|---|---|---|
| `AUTH_UNAUTHORIZED` | 401 | **액세스 토큰** 없음·만료·서명 불일치 | refresh 1회 시도 |
| `AUTH_REFRESH_INVALID` | 401 | **리프레시 쿠키** 없음·만료·서명 불일치·`typ` 불일치·주체가 탈퇴 | refresh 시도 **금지**, 재로그인 |
| `AUTH_SESSION_REVOKED` | 401 | 재사용 탐지로 전 세션 무효화(ADR-0005 결정 4) | refresh 시도 **금지**, 즉시 로그아웃 |
| `AUTH_FORBIDDEN` | 403 | 인증됐으나 권한 없음 | 로그인 화면 아님 — 권한 없음 표시 |

만료/없음/서명불일치를 안 가르는 이유: 프론트가 셋에 똑같이 반응한다. 코드를 늘려도 쓰는 데가 없고 공격자에게 토큰 판정 정보만 준다.

> **개정(2026-07-30, DERO-277): `AUTH_REFRESH_INVALID`를 더한다.**
>
> 위 "만료/없음/서명불일치를 안 가른다"는 그대로 유효하다 — 이 개정이 가르는 축은 **실패 원인이 아니라 어느 토큰이 죽었느냐**다. 액세스 토큰이 죽으면 프론트는 refresh를 한 번 시도해야 하고, 리프레시 토큰이 죽으면 시도해봐야 같은 401이라 재로그인이 유일한 답이다. 한 코드로 뭉쳐 있으면 프론트가 그 둘을 요청 URL로 추측해야 하는데, 그 추측은 계약이 아니라 관습이라 조용히 어긋난다.
>
> 공격자에게 새로 주는 정보는 없다 — 어느 엔드포인트를 불렀는지는 공격자가 이미 안다. 만료냐 위조냐는 여전히 안 가른다.
>
> `AUTH_SESSION_REVOKED`와 다른 점: 그건 **재사용 탐지**라는 보안 사건이고 `AUTH_REFRESH_INVALID`는 그냥 세션이 끝난 것이다. 프론트 동작(재로그인)은 같아도 뜻이 다르니 로깅·알림이 붙을 때 갈라야 한다.

`AUTH_SESSION_REVOKED`를 가르는 이유: 이게 없으면 무효화된 세션이 refresh → 401 → refresh 무한 루프를 돈다. **프론트 루프를 끊는 유일한 신호다.**

`WWW-Authenticate` 응답 헤더는 Spring이 붙이는 대로 **유지한다.** RFC 9110 §15.5.2가 401에 이 헤더를 필수로 요구한다 — 지우려면 코드를 써야 하고 지우면 명세 위반이다. (요청 헤더 `Authorization: Bearer <token>`과 방향이 다른 별개 헤더다. 실제로 헷갈린 지점이라 적어둔다.)

### 5. 목록은 사용자 대면 커서 / 관리자 offset

| 화면 | 방식 |
|---|---|
| 템플릿 갤러리 (REQ-COM-01) | 커서 |
| 제품 카탈로그 (배치 화면 패널) | 커서 |
| 내 배치 목록 (REQ-USR-02) | 커서 |
| 팔로워·팔로잉 (REQ-COM-07) | 커서 |
| 내 업로드 관리 (REQ-COM-10) | 커서 |
| 관리자 검수 대기 (REQ-ADM-04) | **offset** |

경계 기준은 **누가 보는 화면이냐**다. 사용자 대면은 무한 스크롤이라 커서, 관리자는 "몇 건 남았나"가 업무 정보라 페이지 번호·총 개수가 실제로 쓰인다. 두 모양이 공존하는 대가는 프론트 목록 훅이 둘이 되는 것이다.

**커서 응답**

```json
{
  "content": [ ],
  "nextCursor": "eyJjIjoiMjAyNi0wNy0yN1QwMzoxMjowMFoiLCJpIjo0MTd9",
  "hasNext": true
}
```

- `nextCursor`는 **불투명 base64**다. 프론트는 열어보지 않고 그대로 되돌려준다. 안을 노출하면(`?after_id=417`) 나중에 정렬 키를 바꿀 때 클라이언트가 깨진다.
- 담는 내용은 **`(정렬키값, id)` 복합**이다. `id` 단독은 틀린다 — 최신순 정렬인데 id로 자르면 순서가 어긋난다.
- 끝이면 `nextCursor: null`, `hasNext: false`. 요청은 `?cursor=<문자열>&size=20`이고 `page` 파라미터를 안 받는다.
- **총 개수를 주지 않는다.** 커서는 구조상 모른다. 무한 스크롤 UI에 총 개수를 쓰는 자리가 없다고 확인했다(2026-07-27, 박동규). 필요해지면 필드를 더한다 — 더하는 건 안 깨진다.
  - **정정(2026-07-29, 실사용 요청으로 `totalCount` 필드 추가)**: `CursorPage`에 `totalCount`(long)를 추가했다(`global/response/CursorPage.java`). 위 "필요해지면 필드를 더한다"가 실현된 경로다. 대가는 그대로 남는다 — 이 필드를 채우는 목록 API는 매 호출마다 `COUNT(*)` 쿼리가 하나 더 나간다(커서가 원래 피하려던 비용). 배치·책상 템플릿 목록 둘 다 적용됨.

**offset 응답**

```json
{
  "content": [ ],
  "page": { "number": 0, "size": 20, "totalElements": 137, "totalPages": 7 }
}
```

- **Spring `Page` 객체를 그대로 직렬화하지 않는다.** 우리 `record`로 옮겨 담는다. 이유 둘: ① `PageImpl`의 JSON 모양은 안정된 공개 계약이 아니라 버전을 올리면 필드가 바뀔 수 있고 프론트 타입이 프레임워크 내부에 묶인다 ② `pageable`·`sort`·`empty` 같은 안 쓰는 필드가 20줄쯤 딸려 나온다.
- 위 모양은 Spring `PagedModel`과 같은 형태라 나중에 갈아타도 프론트가 안 깨진다.
- 파라미터는 `page`·`size`·`sort`(Spring `Pageable` 자동 바인딩), **0-based**(Spring 기본. 1-based는 전역 설정 + 오프바이원 상시 위험), 기본 `size` 20, **최대 100 상한**. 상한이 없으면 `?size=100000`이 서버 메모리를 긁는 구멍이 된다.

**정렬은 마지막 키를 항상 `id`로 고정한다** — 동점 순서가 흔들리면 커서도 offset도 같은 항목을 두 번 보여준다.

**커서의 대가**: 정렬 키가 안정적이어야 정확하다. 최신순(`createdAt`)·가격순은 안전하지만, **인기순(좋아요 수)은 스크롤 중 값이 변해 이미 본 항목이 다시 나오거나 건너뛸 수 있다.** offset보다는 낫고, 정확히 하려면 정렬 스냅샷 캐시가 필요한데 그건 4주 밖이다. 감수한다.

⚠️ **ADR-0006 결정 11 연결**: 컬렉션 페치 조인과 `Pageable`을 같이 쓰면 Hibernate가 전 행을 메모리로 읽는다(`HHH90003004`). 목록 응답은 컬렉션을 안 물고 오는 납작한 프로젝션으로 짠다.

### 6. 프론트 타입은 OpenAPI로 생성한다

백엔드 `springdoc-openapi-starter-webmvc-ui` **3.x**(Boot 4.x 호환 — springdoc 공식 호환 표 확인. `2.8.x`는 Boot 3.5용이라 쓰면 안 된다) → `/v3/api-docs` → 프론트 `openapi-typescript`로 `src/types/api.d.ts` 생성.

```json
"api:types": "openapi-typescript http://localhost:8080/v3/api-docs -o src/types/api.d.ts"
```

**생성 산출물은 커밋한다** — 프론트가 백엔드를 안 띄우고도 `npm run typecheck`가 돌아야 한다.

근거 셋. ① 드리프트가 구조적으로 불가능해진다 — 백엔드 `record`가 곧 타입이다. 수기 작성은 백엔드가 필드명을 바꿔도 FE가 컴파일을 통과하고 런타임에 `undefined`가 된다. ② **Swagger UI가 딸려온다.** FE·BE가 나뉜 팀에서 실질 값이 크다 — 프론트가 백엔드 코드를 안 읽고 브라우저에서 엔드포인트·요청·응답을 본다. ③ 어노테이션을 거의 안 쓴다. springdoc가 런타임에 컨트롤러 시그니처·`record`·`@Valid` 제약을 읽어 추론한다.

대가 셋. ① **생성 시점이 수동이다** — 백엔드를 띄운 상태에서 사람이 스크립트를 친다. 안 치면 낡은 타입이 남는다. CI 자동화는 인프라 결정([131](DERO-131)·[137](DERO-137)) 뒤로 미룬다. ② **에러 `code` 목록은 스펙에 안 잡힌다** — `ProblemDetail`의 `code`는 문자열일 뿐이라 OpenAPI가 값 목록을 모른다. 프론트가 분기하는 코드는 손으로 유지하는 상수 파일이 따로 필요하다. ③ **Swagger UI를 운영에서 열어두면 안 된다** — `local` 프로파일에서만 켜는 설정이 세트다.

### 7. 공통 직렬화 규약

**URL 버전 접두사 `/api/v1/`.** 거의 무승부다 — 버저닝의 실익은 구버전 클라이언트가 남아 있을 때인데, 우리 클라이언트는 우리 프론트 하나뿐이라 그 상황이 안 온다. 붙이는 비용이 0이고 관행이라 붙인다.

**시각은 `OffsetDateTime`, JSON은 오프셋 포함 ISO-8601.**

```json
"createdAt": "2026-07-27T14:12:00+09:00"
```

**이것이 [ADR-0006](0006-persistence-jpa-conventions.md) 결정 6의 `Instant` 규칙을 부분 개정한다.** `Instant`는 항상 UTC라 한국 개발자가 로그·디버깅에서 +9를 암산해야 한다. `OffsetDateTime`은 KST 벽시계가 그대로 보이면서 `TIMESTAMPTZ` 정합을 지킨다. 개정 범위는 Java 시각 타입뿐이고, ADR-0006의 나머지 결정은 그대로다.

**`LocalDateTime`을 검토하고 버렸다.** 같은 논쟁을 두 번 하지 않기 위해 근거를 남긴다.

- 처음 제기된 근거는 "MySQL `TIMESTAMP`가 2038년까지밖에 표현 못 한다"였는데, **그건 PG에 성립하지 않는다.** PG `TIMESTAMPTZ`는 8바이트 64비트라 범위가 기원전 4713년~서기 294276년이다. MySQL `TIMESTAMP`의 32비트 한계는 PG로 넘어오지 않는다. "MySQL `TIMESTAMP`에 대응된다"는 설명은 동작 방식(저장 시 UTC 정규화, 출력 시 세션 존 변환)이 닮았다는 뜻이지 한계까지 물려받는다는 뜻이 아니다.
- Java 타입과 컬럼 타입은 짝지어 해석된다 — `Instant`·`OffsetDateTime` ↔ `TIMESTAMPTZ`가 정합이고, `LocalDateTime` ↔ `TIMESTAMP WITHOUT TIME ZONE`이 정합이다. `LocalDateTime`을 `TIMESTAMPTZ`에 물리면 드라이버가 JVM·세션 타임존으로 해석해, 환경이 바뀌면 값의 뜻이 바뀐다.
- **결정적 차이**: `LocalDateTime`을 쓰면 `TZ` 고정이 **정확성 요구사항**이 된다 — 새 컨테이너에 `TZ`를 빠뜨리면 9시간 어긋난 데이터가 조용히 쌓이고, 값이 그럴듯해서 안 걸린다. `OffsetDateTime`에선 `TZ` 고정이 **표시 취향**이다 — 빠뜨리면 로그가 UTC로 보일 뿐 저장 데이터는 정확하다.
- 부수 이득: `docs/context/erd.md`(**동결 문서**)를 손대지 않는다. `TIMESTAMPTZ` 그대로다. `LocalDateTime`으로 갔으면 동결 언락 + ADR-0006 전체 supersede + 별도 티켓이 필요했다.

알아둘 것: PG `TIMESTAMPTZ`는 오프셋을 그대로 보관하지 않는다. UTC로 정규화해 저장하고 읽을 때 세션 존 기준 오프셋을 붙여 돌려준다. `+09:00`으로 넣고 `+09:00`으로 나오는 건 저장된 게 아니라 재계산된 것이다. 절대 시각은 항상 정확하다. JVM·컨테이너 타임존은 `Asia/Seoul`로 고정할 예정이지만(팀 방침), 위 성격 차이 때문에 이 고정은 편의지 정확성 조건이 아니다.

**JSON에 존 없는 형식(`"2026-07-27T14:12:00"`)을 금지한다** — 브라우저 `new Date()`가 로컬 존으로 해석해 어긋난다.

**null 필드를 실어보낸다.** `@JsonInclude(NON_NULL)`을 쓰지 않는다. 생략하면 OpenAPI 생성 타입에서 "선택 필드인가 그냥 null인가"가 흐려지고 프론트가 `"field" in obj` 체크를 하게 된다. `ProblemDetail`의 `errors`도 검증 실패가 아니면 `null`로 나간다.

**단위를 필드명에 박는다** — `widthMm`·`weightG`·`priceKrw`. `width`·`weight` 같은 맨이름을 금지한다. 단위 없는 숫자가 프론트에 도착하면 그게 곧 버그다. `docs/GLOSSARY.md`가 mm·g를 정본 단위로 잡은 것과 정합이다.

## 대안과 버린 이유

**① 성공 응답 엔벨로프 (`{success, data, message}`)**
프론트 파싱이 한 모양으로 고정된다는 게 유일한 값인데, 그 약속을 401·403·413·502·504가 이미 깬다(결정 1의 표). 얻지 못하는 것을 위해 201·204·304와 프레임워크 기본 에러 처리를 전부 버리는 거래다. 되돌리는 비용도 이쪽이 비싸다.

**② 자체 에러 응답 포맷 (`{code, message, fieldErrors}`)**
필드를 우리 마음대로 짤 수 있고 `type`·`instance` 같은 안 쓰는 필드가 없다. 그러나 Boot 4가 검증 실패·404·405·415에 이미 내주는 `ProblemDetail`을 전부 갈아끼워야 하고, 표준을 버려 얻는 게 필드 두 개 절약이다. `code`는 확장 필드로 그냥 얹힌다.

**③ 숫자혼합 에러 코드 (`PRODUCT4001`)**
정렬과 검색이 쉽고 문서화 표를 만들기 좋다. 번호 채번을 사람이 관리해야 하고, 프론트 코드에 `code === "MEMBER4001"`이 박히면 읽어도 뜻을 모른다. 의미형 문자열은 그 자체가 문서다.

**④ 단일 거대 `ErrorCode` enum**
코드 중복을 컴파일러가 막아주고 전체 목록을 한 파일에서 본다. 2명이 4주 내내 같은 파일 끝에 줄을 붙여 머지 충돌이 상시 나고, ADR-0007 결정 7의 의존 방향이 깨진다(`global`이 전 도메인 어휘를 알게 된다).

**⑤ 401·403을 `HandlerExceptionResolver`에 위임**
"모든 에러가 `@RestControllerAdvice` 한 곳을 지난다"는 그림이 깔끔하다. 하지만 마법이 섞이고, advice에 해당 예외 핸들러가 없으면 **조용히 기본 500 페이지로 떨어진다.** 드리프트를 막는 건 "한 곳을 거치게 하기"가 아니라 "한 함수를 쓰게 하기"다 — 그래서 공유 팩터리를 골랐다.

**⑥ 목록을 offset 하나로 통일**
프론트 훅이 하나로 끝나고 총 개수를 어디서나 쓴다. 무한 스크롤에서 offset은 스크롤 중 데이터가 추가되면 항목이 밀려 중복·누락이 나고, 깊은 페이지의 `OFFSET n`은 앞의 n행을 매번 읽고 버린다. 사용자 대면 화면 5개가 전부 무한 스크롤이라 이 대가가 상시로 든다.

**⑦ 목록을 커서 하나로 통일**
모양이 하나라 훅도 하나다. 관리자 검수 화면은 "몇 건 남았나"와 페이지 번호가 업무 정보인데 커서는 구조상 총 개수를 모른다. 관리자 화면은 데이터가 적어 offset의 대가가 안 든다.

**⑧ Spring `Page`를 그대로 직렬화**
코드가 0줄이다. `PageImpl`의 JSON 모양이 안정된 공개 계약이 아니라 프론트 타입이 프레임워크 내부 구조에 묶이고, 안 쓰는 `pageable`·`sort`·`empty` 필드가 20줄쯤 딸려 나온다.

**⑨ 프론트 TS 타입을 손으로 작성**
백엔드를 안 띄워도 되고 도구가 0개다. 백엔드가 필드명을 바꿔도 FE가 컴파일을 통과해 런타임에 `undefined`가 되는 드리프트가 구조적으로 열려 있다.

**⑩ 수기 타입 + 공유 fixture 계약 테스트**
[ADR-0004](0004-judgment-frontend-mirror-server-authority.md)가 판정 로직 드리프트에 쓴 패턴이라 팀에 이미 익숙하다. 여기선 fixture를 사람이 관리하므로 드리프트가 타입에서 fixture로 옮겨갈 뿐이다. 판정 로직은 생성할 원본이 없어 fixture가 유일한 수였지만, API는 컨트롤러 시그니처라는 원본이 있다.

**⑪ `LocalDateTime` + `TZ` 고정**
로그·JSON이 KST 벽시계로 보이고 오프셋 문자열이 짧다. `TZ` 고정이 정확성 요구사항으로 승격돼, 빠뜨리면 9시간 어긋난 데이터가 조용히 쌓인다. 게다가 `TIMESTAMPTZ`와 타입 정합이 깨져 동결된 `erd.md`를 열어야 한다(결정 7).

**⑫ URL 버전 접두사 없음 (`/api/`)**
경로가 짧고, 클라이언트가 하나뿐이라 버저닝의 실익이 실제로 없다. 붙이는 비용도 0이라 관행 쪽으로 기울였다 — 무승부에서는 관행이 이긴다.

## 파급

- **`global/response/`의 내용물이 정해졌다** — 커서 페이지 `record`, offset 페이지 `record`. **`ApiResponse` 엔벨로프는 만들지 않는다.** ADR-0007 결정 5가 그 이름으로 자리를 잡아뒀으나 이 ADR이 엔벨로프 없음으로 결정했다.
- **`global/exception/`** — `ErrorCode` 인터페이스 · `BusinessException` · `GlobalExceptionHandler`(`@RestControllerAdvice`) · **`ProblemDetails` 팩터리**(2026-07-27 구현 시 `response/`에서 여기로 정정 — 에러 관심사고, `response/`엔 페이지 `record`만 남는다).
- **`global/security/`** — `AuthenticationEntryPoint`·`AccessDeniedHandler` 구현 2개. 둘 다 `ProblemDetails` 팩터리를 쓴다.
- 도메인 패키지마다 `<Domain>ErrorCode` enum이 하나씩 생긴다. 새 에러를 더할 때 결정 3의 상태 코드 배정 규칙표를 따른다.
- **ADR-0006 결정 6의 `Instant` 규칙이 `OffsetDateTime`으로 부분 개정된다.** 엔티티 시각 필드와 `BaseEntity`·`BaseSoftDeleteEntity`가 영향을 받는다. `docs/context/erd.md`의 `TIMESTAMPTZ`는 그대로다.
- **`build.gradle`에 `springdoc-openapi-starter-webmvc-ui` 3.x 추가가 필요하다** (코드 단계). Swagger UI는 `local` 프로파일에서만 켠다.
- **프론트에 `openapi-typescript` devDependency + `api:types` 스크립트 추가가 필요하다.** 생성물 `src/types/api.d.ts`는 커밋한다.
- **별도로 확인된 구멍**: `build.gradle`에 `spring-boot-starter-security-oauth2-client`는 있으나 ADR-0005 결정 9가 요구하는 **resource-server 스타터가 없다.** Boot 4 이름 규칙상 `spring-boot-starter-security-oauth2-resource-server`일 것이나 실제 아티팩트는 추가 시점에 의존성 해석으로 확인해야 한다(Boot 4 starter 네이밍 함정은 `backend/dero-api/CLAUDE.md`에 기록돼 있다). 인증 구현 착수 때 처리한다.
- 목록 API는 컬렉션을 안 물고 오는 납작한 프로젝션으로 짠다 — ADR-0006 결정 11의 `HHH90003004` 함정.
- **남는 결정**: 에러 `type` URI 문서 사이트(나중), CI에서 OpenAPI 타입 자동 생성(131·137 이후).
