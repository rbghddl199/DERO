# ADR-0012. 코드 컨벤션은 문서가 아니라 기계로 강제한다

## 상태

**확정** — 2026-07-30, 승인 박동규.
결정 티켓 **미발행**. 설계 맵: `docs/context/architecture-map.md`.

## 맥락

2026-07-30에 백엔드 코드 컨벤션 **전수 감사**를 돌렸다. 규칙의 출처를 4개 축으로 나눠 — 폴더 `CLAUDE.md` / ADR / `.claude/rules` / 문서엔 없지만 코드에 반복되는 패턴 — **규칙 273행**을 뽑고, 각 규칙의 준수율을 `backend/dero-api/src/main` 실코드에서 실측했다.

결과는 한 문장으로 요약된다. **아키텍처 규칙은 잘 적혀 있고 잘 지켜지는데, 코드 레벨 세부는 적힌 곳이 아예 없어서 사람마다 다르게 썼다.**

계층 구조(ADR-0001)·패키지 의존 방향(ADR-0007)·응답 계약(ADR-0008)은 문서가 있고 대체로 지켜진다. 반면 **컨트롤러 핸들러 반환 타입, 소프트 삭제 필터를 어느 계층에 두나, try-catch를 언제 쓰나, 엔티티가 던지는 예외 종류, 들여쓰기** 같은 것을 정한 문서는 **하나도 없다.** 그 공백은 취향 차이로 끝나지 않았다.

**공백이 실제 버그를 낳았다.** `placement/repository/PlacementRepository.java:32`의 `findForUpdateById`만 소프트 삭제 필터가 빠져 있다.

```java
@Lock(LockModeType.OPTIMISTIC_FORCE_INCREMENT)
@Query("select p from Placement p where p.id = :id")   // deletedAt is null 이 없다
Optional<Placement> findForUpdateById(@Param("id") Long id);
```

같은 리소스인데 `get`·`delete`는 삭제된 배치에 404를 내고 **`PUT`만 200으로 먹는다.** 소프트 삭제 필터가 세 방식으로 흩어져 있으니(서비스 `.filter` 4곳 / 파생 쿼리 4곳 / JPQL 1곳) 한 곳이 빠진 걸 아무도 못 봤다.

### 문서를 더 쓰는 것은 답이 아니다 — 대조군이 있다

박동규의 이전 프로젝트 `tpt`(612파일)를 같은 방법으로 감사했다. tpt는 **규칙 119개를 문서 62KB**에 썼다. DERO보다 훨씬 촘촘하다. 그런데 **강제 장치는 0개**였고, 그 결과 컨트롤러 반환 타입이 **109:78로 갈렸다.** 규칙이 없어서 갈린 게 아니라, 규칙이 문서에만 있어서 갈렸다. DERO과 같은 병이고 문서량은 5배다.

반대 증거도 같은 감사에서 나왔다. **DERO에서 유일하게 100%로 지켜지는 규칙은 `@Builder(access = AccessLevel.PRIVATE)` 31/31**인데, 이건 문서가 지킨 게 아니다. **빌더를 private으로 막으면 정적 팩터리 말고는 인스턴스를 만들 길이 타입 레벨에서 사라진다.** 지키고 말고가 없다. tpt는 같은 불변식을 문서 30줄로 막으려 했고 실패해서 나중에 리팩터링으로 걷어냈다(`~/my_project/tpt/tpt-api/CLAUDE.md:589`의 안티패턴 명시, `:926`의 "83% code reduction" 완료 기록).

**그래서 이 ADR의 논지는 "무엇이 옳은 컨벤션인가"가 아니라 "무엇이 강제 가능한 컨벤션인가"다.** 아래 13개 결정은 그 원칙 아래 정해졌고, 선택지가 팽팽할 때는 **더 옳은 쪽이 아니라 기계가 판정할 수 있는 쪽**을 택했다(결정 1·6·7이 정확히 그 경우다). 사람의 판단을 매번 요구하는 규칙은, 그게 아무리 정확해도 273행 중 한 줄이 되어 잊힌다.

## 결정

### 1. 컨트롤러 핸들러는 항상 `ResponseEntity<T>`를 반환한다

실측: 핸들러 12개 중 `ResponseEntity` 5 : DTO 직접 반환 7.

`ResponseEntity`가 더 좋아서가 아니다. **다른 안들이 "언제 쓰나"의 경계를 기계에 못 넘긴다.**

- **대안 A "기본은 DTO 직접, 필요할 때만 `ResponseEntity`"** — 현재 코드의 사실상 규칙이고 가장 짧다. 그런데 "필요할 때"를 검사기가 판정할 수 없다. 실제로 `getThumbnail`은 **상태 코드가 200인데도** `Content-Type`을 직접 정해야 해서 `ResponseEntity`를 쓴다. "201·204만 예외"라는 단순한 규칙조차 이미 깨져 있다.
- **대안 B "DTO + `@ResponseStatus`"** — 애노테이션으로 상태 코드를 선언하니 겉보기엔 깔끔하다. 하지만 **`Location` 헤더를 붙일 수가 없다.** ADR-0008 결정 1이 생성 성공을 `201 + Location`으로 못박았으므로 `create` 계열이 전부 이 안을 벗어난다.

`ResponseEntity` 단일 규칙은 "모든 핸들러의 반환 타입이 `ResponseEntity`인가"라는 **한 줄짜리 기계 판정**으로 환원된다. 대가는 200 조회에서 `ResponseEntity.ok(...)` 한 겹이 늘어나는 것이고, 그건 판정 가능성과 바꿀 만하다.

### 2. 소프트 삭제 필터는 리포지토리 쿼리에 둔다

서비스에서 `.filter(x -> !x.isDeleted())` 하지 않는다. 파생 쿼리면 `...AndDeletedAtIsNull`, `@Query`면 JPQL에 `and x.deletedAt is null`을 쓴다.

**이 결정은 ADR-0006 결정 7과의 어긋남을 정리하는 것이다.** ADR-0006 결정 7은 Hibernate 네이티브 `@SoftDelete(strategy = TIMESTAMP, columnName = "deleted_at")`를 채택하면서, 지금 우리가 택하는 **수동 필터 방식을 명시적으로 기각**했다("11테이블 × 모든 조회에서 한 번이라도 빠뜨리면 삭제된 행이 샌다"). 그런데 **실제 코드는 `@SoftDelete`를 쓰지 않고 그 기각된 방식으로 갔다.** 그리고 ADR-0006이 예고한 사고가 정확히 그대로 났다 — `findForUpdateById` 한 곳이 빠졌다(맥락 절).

이 ADR은 ADR-0006 결정 7을 **뒤집지 않는다.** `@SoftDelete`로 되돌리는 것은 별개 판단이고, 되돌린다면 그건 새 ADR이다. 여기서 정하는 것은 **"수동 필터로 가 있는 현재 상태에서 필터가 어느 계층에 있어야 하는가"** 하나다. 리포지토리를 고른 이유:

- 필터가 쿼리에 있으면 **DB가 걸러 오지 않은 행을 자바가 받을 일이 없다.** 서비스 `.filter`는 삭제된 행을 메모리로 끌어온 뒤 버리는 것이고, `Optional` 하나면 티가 안 나지만 목록에선 페이징 개수가 틀어진다.
- **검사 지점이 한 파일 종류로 모인다.** "리포지토리 메서드마다 삭제 필터가 있는가"는 리포지토리 인터페이스만 훑으면 판정된다. 서비스에 흩어져 있으면 훑을 표면이 코드 전체다.

### 3. 들여쓰기는 탭이다

실측: **탭 70 / 스페이스 2칸 38 / 스페이스 4칸 3.** 다수파를 그대로 규칙으로 승격한다. 스타일 규칙에 옳고 그름은 없고, 고칠 파일이 적은 쪽이 이긴다.

**이 결정의 파급이 다른 어떤 결정보다 크다.** 2026-07-28에 "`docs/GoogleStyle_custom.xml`이 형식 정본"이라고 확정했는데 그 XML의 실제 값은 스페이스 2칸이었다. **정본 지위를 내리는 대신 XML을 탭으로 고쳤다** — 2026-07-28 결정의 알맹이는 "폭을 문서마다 적지 말고 XML 하나를 가리켜라"였고 그 규약은 이 결정과 충돌하지 않기 때문이다. 자세한 파급은 아래 "파급" 절.

### 4. 엔티티도 `BusinessException` + `ErrorCode`만 던진다

실측: 엔티티가 던지는 예외가 `BusinessException` 19 / `IllegalArgumentException` 8 / `UncheckedIOException` 3 / `IllegalStateException` 1.

**뒤의 12건은 전부 500으로 나간다.** `GlobalExceptionHandler`가 잡는 건 `BusinessException`이고, 나머지는 안 잡히거나 일반 500 핸들러로 떨어진다. `commerce/CartItem.java:93`이 그 대표 사례다.

```java
public void increaseQuantity(int amount) {
	if (amount < 1) {
		throw new IllegalArgumentException("더할 수량은 1 이상이어야 한다");
	}
	...
}
```

수량은 **사용자가 보내는 입력**이다. 400이어야 할 것이 500으로 나가고, 프론트가 분기할 `code`도 없고, 사용자에게 보일 한국어 문구도 없다(ADR-0008 결정 2·3이 요구하는 것 전부가 빠진다).

**대안 "경계로 나눈다"를 검토하고 버렸다.** 도메인 불변식 위반(사용자 입력이 원인) → `BusinessException`, 호출부의 프로그래밍 실수(그런 입력이 도달할 리 없음) → `IllegalStateException`. 의미상으론 이쪽이 정확하다. 버린 이유는 **매번 사람이 "이건 어느 쪽이지"를 판단해야 하고 기계가 검증할 수 없기 때문**이다. 잘못 판단하면 결과는 500이다 — 판단 비용을 물면서 안전하지도 않다. 반대로 "엔티티는 `BusinessException`만"은 `throw new` 문의 타입만 보면 판정된다. 진짜 호출부 버그라면 `ErrorCode`에 500짜리 상수를 하나 두면 되고, 그때도 응답 형식은 `ProblemDetail`로 일관된다.

### 5. 컨트롤러가 리포지토리를 직접 부르지 않는다

현재 위반 1건 — `auth/controller/AuthController.java:25`(`private final UserRepository users;`)와 `:57`(`users.findById(...)`).

ADR-0001은 "서비스는 조회·조립·트랜잭션을 맡는다"고 **서비스의 책임**만 적었고, **컨트롤러가 무엇을 못 하는지는 안 적었다.** 그 공백을 이 결정이 메운다. 컨트롤러 → 서비스 → 리포지토리, 화살표는 한 방향이다.

`AuthController`가 리포지토리를 직접 쓰는 자리는 트랜잭션 경계 밖에서 엔티티를 읽고 `.filter(found -> !found.isDeleted())`로 삭제 여부까지 컨트롤러에서 판정한다 — 결정 2가 없애려는 패턴이 컨트롤러에 있는 셈이라 두 결정이 같은 자리를 가리킨다.

### 6. `ErrorCode` 상수명 = 코드 문자열. `code()` 대신 `name()`을 쓴다

현재 `ErrorCode` 구현 enum이 5개인데 포맷이 두 갈래다 — **상수명과 코드 문자열이 같은 것 2개**, **코드 문자열에만 도메인 접두사를 붙인 것 3개.** 게다가 `AUTH_` 접두사를 **서로 다른 두 enum이 발행**한다. ADR-0008 결정 3이 "코드 문자열 중복 방지는 도메인 접두사가 한다"고 했는데, 접두사가 손으로 쓰는 문자열이라 그 방어가 이미 뚫렸다.

```java
// 이렇게 — 상수명이 곧 코드다
public enum PlacementErrorCode implements ErrorCode {
	PLACEMENT_NOT_FOUND(HttpStatus.NOT_FOUND, "배치를 찾을 수 없습니다."),
	PLACEMENT_STALE(HttpStatus.CONFLICT, "다른 곳에서 먼저 저장되었습니다.");
}
```

`ErrorCode` 인터페이스의 `String code()`를 없애고 enum이 공짜로 주는 `name()`을 쓴다. **손으로 쓰는 문자열이 사라지면 오타와 중복이 구조적으로 불가능해진다** — enum 상수는 같은 파일 안에서 중복될 수 없고, IDE가 이름을 바꾸면 코드 문자열도 같이 바뀐다. 맥락 절의 `@Builder(access = PRIVATE)`가 100%인 것과 같은 종류의 강제다. 대가는 상수명이 길어지는 것뿐이다(`NOT_FOUND` → `PLACEMENT_NOT_FOUND`).

**대안 tpt 방식(`DOMAIN_HTTPSTATUS_SEQ`, 예: `REVIEW_404_0`)을 버렸다.** 실적은 이쪽이 더 좋다 — tpt에서 **292/292 통일**을 달성했다. 버린 이유 둘. ① **사람도 프론트도 코드만 보고 뜻을 모른다.** ADR-0008 결정 3이 숫자혼합 코드를 버릴 때 쓴 논리 그대로다. ② **순번(`_0`, `_1`)을 사람이 관리해야 한다** — 다시 손으로 쓰는 값이 생기고, 그게 이 결정이 없애려는 바로 그 물건이다.

### 7. 엔티티 Lombok은 "불변식"만 강제한다 — 빌더 형태는 자유

| 애노테이션 | 규칙 |
|---|---|
| `@Getter` | 필수 |
| `@NoArgsConstructor(access = AccessLevel.PROTECTED)` | 필수 |
| `@Setter` · `@Data` · `@EqualsAndHashCode` · `@ToString` | **금지** |
| 빌더 (`@Builder` 위치·`@SuperBuilder`·미사용) | **자유** |

`backend/CLAUDE.md`는 원래 `@Getter` + `@NoArgsConstructor(PROTECTED)` + `@Builder(access=PRIVATE)` + `@AllArgsConstructor(PRIVATE)` **넷을 세트**로 요구했다. 실측하니 넷을 다 붙인 엔티티는 **24/31**이고, 나머지 7개는 게으름이 아니라 **하위 `CLAUDE.md`에 사유가 적힌 정당한 예외**였다 — JOINED 상속 규격 서브타입 5종, `Placement`, 추상 루트 `Product`.

결정적으로 **`product/CLAUDE.md`가 `@SuperBuilder`와 클래스 레벨 `@Builder`를 실측 근거로 부결시켰다.** 즉 상속 계층에서는 "넷 세트"를 **물리적으로 만족할 수 없다.** 달성 불가능한 규칙은 규칙이 아니라 상시 위반 목록이다.

그래서 규칙을 **진짜 지키려던 불변식**으로 좁힌다: **생성 경로를 우회한 인스턴스가 만들어지지 않을 것**, 그리고 **엔티티가 자기 상태를 임의로 열지 않을 것.** 앞은 `@NoArgsConstructor(PROTECTED)`가, 뒤는 `@Setter` 금지가 담당한다. 빌더를 어디에 어떻게 붙이는지는 그 불변식과 무관하므로 강제하지 않는다. `@EqualsAndHashCode`·`@ToString` 금지는 ADR-0001 결정 2("id 기반 `equals`/`hashCode` 금지")와 지연 로딩 프록시 폭발 방지가 근거다.

### 8. try-catch는 원칙 금지 — 예외 번역 목적만 허용하고, 삼키기는 금지한다

`catch`를 쓰는 유일한 정당한 이유는 **프레임워크 예외를 우리 `BusinessException`으로 번역하는 것**이다. 잡고 아무것도 안 하는 `catch`는 금지한다.

**위반**: `auth/controller/AuthController.java:75`

```java
} catch (BusinessException ignored) {
	// 이미 무효한 토큰 — 로그아웃 목적은 이미 달성된 상태다.
}
```

**정당한 예시**: `placement/service/PlacementService.java:156-160` — **이건 유지한다.**

```java
try {
	placements.saveAndFlush(placement);
} catch (ObjectOptimisticLockingFailureException e) {
	throw new BusinessException(PlacementErrorCode.PLACEMENT_STALE);
}
```

`saveAndFlush`와 `catch`는 **떼어놓을 수 없는 쌍**이다. `save()`만 쓰면 Hibernate가 flush를 커밋 시점까지 미루므로, 낙관적 락 예외가 **서비스 밖(트랜잭션 커밋 중)에서 터진다.** 그러면 이 `catch`에 안 잡히고 409가 아니라 **500**이 나간다. ADR-0009가 정한 "충돌 시 409"가 조용히 깨진다.

**이 쌍을 ADR에 박아 넣는 것 자체가 이 결정의 목적이다.** 감사에서 이 코드는 처음에 "왜 `save`가 아니라 `saveAndFlush`지? 왜 굳이 잡지?"로 보였다 — **문서화되지 않은 의도적 패턴은 게으름과 겉모습이 완전히 같다.** 근거가 없으면 다음 사람이 "정리"하면서 `save()`로 바꾸고, 그 순간 낙관적 락이 500으로 새기 시작한다. 잡히지도 않는다(테스트에서 동시 저장을 재현하지 않는 한).

### 9. 로깅 방식은 정하지 않는다 — 단, `System.out`·`printStackTrace`는 금지

**WAS 내부에 로깅 규칙을 지금 만들지 않는다**(박동규 결정). 나중에 RDB 로그 테이블 또는 ELK로 처리한다. 현재 `main` 139파일 중 로거를 가진 클래스는 `GlobalExceptionHandler` 하나뿐인데, 그 상태를 그대로 둔다.

금지만 명시한다 — **`System.out.println`·`e.printStackTrace()`를 쓰지 않는다.** 현재 위반 2줄이 `auth/service/JwtIssuer.java:79`·`:85`에 있다(`"TEMP_DEBUG decode failed: ..."`). 이름 그대로 임시 디버그 코드가 남은 것이라 **별건으로 제거**한다.

리스크는 "미결 사항" 절에 적는다.

### 10. `@Transactional`은 클래스에 `readOnly = true`, 쓰기 메서드에만 재선언

```java
@Service
@Transactional(readOnly = true)
public class PlacementService {

	@Transactional
	public PlacementSaveResponse save(...) { ... }
}
```

**안전한 기본값이 읽기이기 때문이다.** 반대로 하면(클래스에 쓰기, 읽기 메서드에 `readOnly` 재선언) 애노테이션을 빠뜨렸을 때 쓰기 트랜잭션이 열린 채로 조회가 돌고, 아무 증상도 안 나서 안 걸린다. 이 방향이면 빠뜨렸을 때 쓰기가 막혀 **즉시 터진다.**

현재 어긋난 곳 둘: `ProductImageService`는 `@Transactional`이 아예 없고, `PlacementService.saveThumbnail`은 `readOnly`인데 **스토리지에 쓴다**(DB 쓰기가 아니라 안 터졌을 뿐, 의도와 선언이 어긋나 있다).

### 11. 엔티티 1개 → DTO 1개는 `from()` 정적 팩터리, 여러 소스는 서비스가 조립

DTO가 엔티티 하나만 보고 만들어진다면 변환은 **DTO의 `static from(Entity e)`** 에 둔다. 소스가 둘 이상이면 `from()`을 만들지 않고 서비스에서 조립한다.

tpt는 `from()`을 **절대 규칙**으로 강제했다(`~/my_project/tpt/tpt-api/CLAUDE.md:143-144`). **DERO에는 그 규칙이 깨지는 자리가 실재해서 완화한다** — `PlacementSaveResponse`는 엔티티 + `byRef` 맵 + 위반 목록 **3개 소스**로 만들어진다(`PlacementService:150-165`). 억지로 `from()`에 밀어 넣으면 인자가 3개인 정적 팩터리가 되는데, 그건 이름만 `from`이지 생성자다.

경계가 "소스 개수 1개인가"라서 기계 판정이 가능하다는 점도 이 형태를 고른 이유다.

### 12. 테스트 메서드명은 자유, `@DisplayName` 한글은 필수

실측: `@DisplayName` 한글 90 / 영문 11(**영문 11개가 전부 `global/`에 몰려 있다**).

메서드명 규칙(`snake_case` vs `camelCase` vs `given_when_then`)은 **통일하지 않는다.** 통일하려면 어느 쪽으로 가든 90개 또는 11개를 고쳐야 하고, 그 diff가 사는 값이 없다.

강제 가능한 최소치만 규칙으로 승격한다 — **모든 테스트에 `@DisplayName`이 있고, 그 문구가 한글일 것.** 존재 여부는 애노테이션 유무로, 한글 여부는 문자 범위로 판정된다.

### 13. tpt에서 이식하는 6건 (문서 정본은 `.claude/rules/java/architecture.md`)

아래 6건은 tpt에서 이미 검증된 규칙이고, DERO에 그대로 적용한다. 개별 근거를 여기 다 풀지 않고 **결정 사실과 출처만** 남긴다 — 서술 정본은 `.claude/rules/java/architecture.md`다.

| 규칙 | 근거 |
|---|---|
| **엔티티 빌더 재생성 금지 / JPA dirty checking 사용 / `@Transactional` 안에서 불필요한 `save()` 금지** | tpt `CLAUDE.md:589` 안티패턴 명시 + `:926` 리팩터링 완료 기록("83% code reduction") |
| **스프링 빈은 `@RequiredArgsConstructor` + `final` 필드 생성자 주입** | tpt 컨트롤러 37/37. DERO은 빈 16개 중 **15개가 수동 생성자**라 이식 효과가 가장 큰 항목 |
| **요청 DTO 검증은 Bean Validation + `@Valid`** | 컨트롤러에서 손으로 `if` 검증하지 않는다. **예외 — `DeskSnapshot.validate()`는 조건부 검증이라 애노테이션으로 표현되지 않으므로 그대로 둔다** |
| **`@ManyToOne`·`@OneToOne`에 `fetch = FetchType.LAZY` 명시** | DERO 이미 **44/44**. 굳히기(기본값이 `EAGER`라 명시가 유일한 방어) |
| **API 경로는 `/api/v1/…` 접두** | DERO 이미 **5/5**. ADR-0008 결정 7과 동일 — 여기선 재확인만 |
| **`@Modifying`은 `(clearAutomatically = true, flushAutomatically = true)`** | tpt 26/26. 벌크 연산 후 1차 캐시가 낡은 값을 들고 있는 사고를 구조적으로 막는다 |

## 대안과 버린 이유

**① 컨트롤러 반환 타입: "기본은 DTO 직접, 필요할 때만 `ResponseEntity`"** (결정 1)
현재 코드의 사실상 규칙이고 가장 짧다. `ResponseEntity.ok(...)` 한 겹이 없어 200 조회가 깨끗하다. 버린 이유는 **"필요할 때"를 기계가 판정 못 하기 때문**이다. "201·204만 예외"로 좁혀도 `getThumbnail`(200인데 `Content-Type` 때문에 `ResponseEntity`)이 이미 그 밖에 있다. 경계가 사람 판단에 있으면 273행 중 한 줄로 잊힌다 — tpt가 109:78로 갈린 게 정확히 이 안을 문서로만 쥐고 있었기 때문이다.

**② 컨트롤러 반환 타입: "DTO + `@ResponseStatus`"** (결정 1)
상태 코드가 선언적으로 보이고 반환 타입에 노이즈가 없다. **`Location` 헤더를 붙일 수 없어 201에 못 쓴다** — ADR-0008 결정 1이 생성 성공을 `201 + Location`으로 못박았고 `create` 계열이 정확히 그 경우다. 규칙에 "생성은 예외"를 다시 파면 ①과 같은 병으로 돌아간다.

**③ 예외 종류를 경계로 나누기: 도메인 불변식 → `BusinessException`, 호출부 버그 → `IllegalStateException`** (결정 4)
의미상 가장 정확한 안이다. 자바 관용에도 맞는다. 버린 이유는 **분류를 매번 사람이 해야 하고 기계 검증이 불가능한데, 틀렸을 때의 값이 500이라는 것**이다. 판단 비용을 물면서 안전하지도 않은 거래다. 진짜 호출부 버그는 500짜리 `ErrorCode` 상수로 표현하면 되고, 그러면 응답 형식이라도 일관된다.

**④ `ErrorCode` 코드 문자열: tpt 방식 `DOMAIN_HTTPSTATUS_SEQ` (`REVIEW_404_0`)** (결정 6)
tpt에서 **292/292 통일**을 달성한, 실적으로는 가장 강한 안이다. 상태 코드가 문자열에 박혀 있어 정렬·검색·문서화 표가 쉽다. 버린 이유 둘 — ① 사람도 프론트도 `REVIEW_404_0`만 보고 무슨 일이 났는지 모른다(ADR-0008 결정 3이 `PRODUCT4001`을 버린 논리 그대로다). ② **순번을 사람이 관리해야 한다.** 손으로 쓰는 값을 없애자는 게 이 결정의 전부인데 새 손글씨를 들여오는 셈이다.

**⑤ 엔티티 Lombok 4종 세트 강제 유지** (결정 7)
`backend/CLAUDE.md`가 이미 그렇게 적어뒀으니 문서를 안 고쳐도 된다. 그러나 **달성 불가능하다** — `product/CLAUDE.md`가 상속 계층에서 `@SuperBuilder`·클래스 레벨 `@Builder`를 실측으로 부결시켰고, 24/31이라는 숫자의 나머지 7은 게으름이 아니라 문서화된 정당한 예외다. 지킬 수 없는 규칙을 남겨두면 "규칙은 원래 다 안 지켜지는 것"이라는 학습이 생겨 **다른 규칙까지 같이 죽는다.**

**⑥ 소프트 삭제를 ADR-0006 결정 7대로 Hibernate `@SoftDelete`로 되돌리기** (결정 2)
원래 결정이고, 필터를 빠뜨리는 것이 구조적으로 불가능해진다는 점에서 이 ADR의 논지("기계로 막아라")에 가장 잘 맞는 안이다. 이 ADR에서 하지 않은 이유는 **범위**다 — 엔티티 11개 + 기존 쿼리 9곳을 동시에 바꾸는 마이그레이션이고, ADR-0006 결정 7 본문이 경고한 "삭제된 행을 참조하는 연관이 끊긴다"(`placed_item.product_id`, `placement.user_id`)를 같이 처리해야 한다. **컨벤션 ADR이 다룰 크기가 아니다.** 여기서는 현재 방식 안에서 위치만 한 곳으로 모으고, 되돌림은 별도 판단으로 남긴다(미결 사항 아님 — 원래 ADR-0006이 정본이고 코드가 어긋나 있는 상태라는 사실만 기록한다).

**⑦ 테스트 메서드명 통일** (결정 12)
읽기 일관성이 올라가고 신입이 볼 표본이 하나가 된다. 어느 쪽으로 가든 **90개 또는 11개를 고쳐야 하는데** 그 diff가 사는 값이 사실상 없다. `@DisplayName`이 이미 90:11로 존재하므로 테스트가 무엇을 검증하는지는 이미 읽힌다 — 메서드명은 두 번째 정보다.

**⑧ 들여쓰기를 XML 정본(스페이스 2칸)에 맞추기** (결정 3)
`google-java-format`을 그대로 쓸 수 있어 티켓 DERO-257이 살아남는 게 유일한 실질 이점이었다. 2026-07-28 결정을 지키는 것은 이점이 아니다 — XML을 고치면 그 결정은 어느 쪽을 골라도 살아남는다(정본이 XML이라는 규약과 XML의 값은 별개다). 그리고 **탭 70 / 스페이스2 38로 실코드의 다수파가 탭**이라, 이쪽을 고르면 70파일을 고치고 그 diff가 이후 모든 `git blame`을 덮는다. 스타일은 옳고 그름이 없으므로 **고칠 파일이 적은 쪽**이 이긴다.

## 파급

### 형식 정본은 유지하되 그 내용을 개정한다 (결정 3)

**2026-07-28 "`docs/GoogleStyle_custom.xml`이 형식 정본" 결정은 뒤집지 않는다.** 그 결정의 알맹이는 "탭이냐 스페이스냐"가 아니라 **"폭을 문서마다 적지 말고 XML 하나를 가리켜라"**였고, 그 규약은 결정 3과 충돌하지 않는다 — 충돌하는 것은 XML의 *값*뿐이다. 그래서 정본을 내리는 대신 **XML을 고쳤다**(2026-07-30, 박동규 제안).

- **`docs/GoogleStyle_custom.xml`의 JAVA 블록을 개정했다** — `USE_TAB_CHARACTER=true` · `SMART_TABS=false` · `TAB_SIZE=4` · `INDENT_SIZE=4` · `CONTINUATION_INDENT_SIZE=8`. 이어쓰기 2탭은 추정이 아니라 실측이다(탭 파일 전체에서 이어쓰기 +2탭 100건 vs +1탭 2건). **전역 블록과 다른 언어 블록은 건드리지 않았다** — 프론트는 prettier(스페이스)를 쓰므로 IntelliJ에서 JSON·XML까지 탭이 되면 어긋난다.
- **`.claude/rules/java/project-convention.md`** — XML을 정본으로 가리키는 서술을 유지하고, "2026-07-30 이전 임포트자는 재임포트 필요"를 추가했다. 옛 스킴이 남아 있으면 저장할 때마다 탭이 스페이스로 되돌아간다. (2026-08-14 rules 다이어트: 탭·XML 정본 서술은 `architecture.md` §3으로, 스킴 임포트 절차와 재임포트 안내는 사람용 `README.md`로 이주했다.)
- **`backend/CLAUDE.md:72`** — "XML 실제 값: 스페이스 2칸 + 이어쓰기 4칸"이 거짓이 되어 탭·재임포트 안내로 교체했고, 아키텍처 규칙 정본이 `.claude/rules/java/architecture.md`임을 가리키는 줄을 추가했다(2026-07-30).
- **티켓 DERO-257의 포매터 선택은 여전히 무효다.** `google-java-format`에는 **탭 옵션이 없다**(2칸 스페이스 고정, 설정 불가가 그 도구의 설계다). XML을 고쳐도 이 제약은 안 풀린다 — XML은 IntelliJ용이고 Gradle 포매터가 아니기 때문이다. 대체안은 eclipse 포매터(탭 설정 가능) 또는 `.editorconfig`(`indent_style = tab`, IDE·CI 양쪽이 읽는다). **어느 쪽으로 갈지는 257에서 정한다.**

### 다른 ADR과의 관계

- **ADR-0006 결정 7(소프트 삭제)** — 뒤집지 않는다. `@SoftDelete`가 여전히 정본 결정이고, **코드가 그 결정이 기각한 수동 필터 방식으로 가 있다**는 사실을 이 ADR이 기록한다. 결정 2는 그 어긋난 상태 안에서 필터 위치를 리포지토리 한 곳으로 모으는 것이다. `@SoftDelete`로의 복귀는 별도 판단·별도 ADR.
- **ADR-0001** — 서비스 책임만 적고 **컨트롤러 제약을 안 적은 공백**을 결정 5가 메운다. ADR-0001을 개정하지는 않는다(추가지 변경이 아니다).
- **ADR-0008 결정 3** — 결정 6이 `ErrorCode` 인터페이스에서 `String code()`를 제거한다. ADR-0008이 보인 예시 코드(`NOT_FOUND(HttpStatus.NOT_FOUND, "PRODUCT_NOT_FOUND", "...")`)가 3인자에서 2인자로 바뀐다. **응답 JSON의 `code` 필드 값 자체는 안 바뀐다**(`name()`이 같은 문자열을 낸다) — 프론트는 영향 없다.
- **ADR-0009** — 결정 8이 `saveAndFlush` + `catch(ObjectOptimisticLockingFailureException)` 쌍을 보존하는 근거를 박는다. ADR-0009의 "충돌 시 409"를 실제로 지키는 것이 그 쌍이다.

### 기존 코드 위반 목록

| 위반 | 규모 | 결정 |
|---|---|---|
| `ResponseEntity`를 안 쓰는 핸들러 | **7개** (12개 중) | 1 |
| 소프트 삭제 필터 누락 | **1곳** — `PlacementRepository.findForUpdateById:32` (**버그**) | 2 |
| 소프트 삭제 필터 위치 이동 | 서비스 `.filter` **4곳** | 2 |
| 들여쓰기 비-탭 | 스페이스2 **38파일** / 스페이스4 **3파일** | 3 |
| 엔티티가 던지는 비-`BusinessException` | **12건** (`IllegalArgumentException` 8 / `UncheckedIOException` 3 / `IllegalStateException` 1) | 4 |
| 컨트롤러 → 리포지토리 직결 | **1곳** — `AuthController:25`,`:57` | 5 |
| `ErrorCode` 포맷 불일치 | **5 enum** (상수명=문자열 2 / 접두사 부착 3, `AUTH_`를 두 enum이 발행) | 6 |
| 예외 삼키기 | **1곳** — `AuthController:75` `catch (BusinessException ignored)` | 8 |
| `System.out.println` | **2줄** — `JwtIssuer:79`,`:85` (별건 제거) | 9 |
| `@Transactional` 누락·오선언 | **2곳** — `ProductImageService`(부재), `PlacementService.saveThumbnail`(`readOnly`인데 스토리지 쓰기) | 10 |
| 수동 생성자 주입 | **15개** (빈 16개 중) | 13 |

### 집행 수단 — ArchUnit

**이 ADR의 결정들은 ArchUnit 없이는 또 하나의 273행이 된다.** 논지 전체가 "강제 형태가 변수다"인데 강제 장치를 안 붙이면 자기모순이다.

- **ADR-0007이 걸어둔 도입 트리거가 이미 발동했다.** ADR-0007은 "ArchUnit을 지금 넣지 않는다 — **도입 트리거: 역류가 실제로 한 번 나면** 그때 테스트 한 장을 추가한다"고 적었다(`0007-package-structure-and-aggregates.md:138`). **`global/security/SecurityConfig.java:3`,`:4`가 `com.brunchies.dero.auth.service.OAuth2LoginSuccessHandler`·`OAuth2LoginFailureHandler`를 import한다** — `global`이 `auth`를 아는 역류이고, ADR-0007 결정 7("`global`은 아무도 모른다")의 정확한 위반이다. 조건이 충족됐으므로 다음 단계는 ArchUnit이다.
- ArchUnit으로 판정 가능한 결정: **1**(반환 타입) · **4**(엔티티가 던지는 예외 타입) · **5**(컨트롤러→리포지토리 금지) · **7**(금지 애노테이션·필수 애노테이션) · **10**(`@Transactional` 존재) · **12**(`@DisplayName` 존재) · **13**의 필드 주입 금지·`LAZY` 명시. 판정 불가한 것은 **3**(들여쓰기 — 포매터/`.editorconfig` 담당) · **2**·**6**·**8**·**9**·**11**(사람 리뷰 또는 별도 수단).

> ⚠️ **선행 조건 — 지금 CI는 테스트를 돌지 않는다.** Jenkins가 `docker compose build`를 부르고 Dockerfile이 `bootJar`를 실행하는 경로라 **`./gradlew test`가 파이프라인 어디에서도 안 돈다.** 이 상태에서 ArchUnit 테스트를 추가하면 **아무도 그 실패를 못 본다.** CI에 테스트 단계를 넣는 것이 ArchUnit 도입의 선행 조건이다.

### 문서

- **`.claude/rules/java/architecture.md`** — 결정 13(tpt 이식 6건)의 서술 정본. 이 ADR은 결정 사실과 출처만 남긴다.
- **`docs/SPEC.md`** — 이 ADR은 기능 추가가 아니므로 체크 대상 없음.

## 미결 사항

**① 로깅 방식** (결정 9)
RDB 로그 테이블인지 ELK인지 정하지 않았고, WAS 내부 로깅 규칙도 지금 만들지 않는다.

> ⚠️ **리스크**: ELK로 가는 경우 **통상 컨테이너 stdout을 수집한다.** 그런데 현재 `main` 139파일 중 로거를 가진 클래스가 `GlobalExceptionHandler` 하나뿐이라, **앱이 아무것도 안 찍으면 수집 대상 자체가 없다.** "나중에 ELK 붙이면 로그가 보인다"가 성립하지 않는다 — 로그를 남기는 코드가 먼저 있어야 수집 파이프라인이 의미를 갖는다. 로깅 방식을 정하는 시점에 **"무엇을 찍을 것인가"를 같이 정해야 한다.**

**② ADR-0007 결정 5 ↔ 결정 7의 내부 충돌**
`SecurityConfig`를 `global/security/`에 두라는 결정 5와, "`global`은 아무도 모른다"는 결정 7이 **양립하지 않는다.** `SecurityConfig`는 구조상 `auth`의 핸들러를 알아야 하기 때문이다(위 "집행 수단" 절의 역류가 그 결과다). **이 ADR은 이 충돌을 풀지 않는다** — 코드 컨벤션이 아니라 패키지 구조 문제이고, ADR-0007의 후속 ADR이 다룰 몫이다. 여기서는 이 역류가 ArchUnit 도입 트리거를 발동시켰다는 사실만 기록한다.

**③ 포매터 도구 선택** (결정 3 파급)
탭을 강제할 수단이 eclipse 포매터인지 `.editorconfig`인지 미정. 티켓 DERO-257에서 정한다.
