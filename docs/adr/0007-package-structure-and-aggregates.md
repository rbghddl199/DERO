# ADR-0007. 도메인 패키지 9개 + 애그리거트 루트 5종 + 객체 참조

## 상태

**확정** — 2026-07-27, 승인 박동규.
결정 티켓 DERO-134 (에픽 DERO-125). 설계 맵: `docs/context/architecture-map.md`.

## 맥락

백엔드 2명 / 4주. [ADR-0001](0001-backend-layering.md)이 계층형 유지 + **깊은 엔티티**를 확정하며 "애그리거트 경계는 미결, 134에서 잡는다"를 남겼다. [ADR-0006](0006-persistence-jpa-conventions.md)은 JPA 단독과 매핑 규칙을 확정했다. `docs/context/erd.md`는 **동결**된 28테이블이다.

**팀 경험**: 기능 단위 패키지 분할까지만 해봤다. 애그리거트를 명시적으로 설계한 적이 없다. 그래서 이 ADR은 결정만이 아니라 **판단 기준**을 남긴다 — 다음에 테이블이 늘 때 같은 논쟁을 처음부터 하지 않게.

**축을 분리해 둔다.** 헥사고날/클린 채택 여부는 이 ADR의 주제가 아니다 — 128에서 이미 "전면 채택 안 함, 외부 경계 3곳만"으로 끝났다. 애그리거트는 그것과 직교하는 축이고, 실무적으로는 **"리포지토리를 몇 개 만드나"**로 환원된다.

**애그리거트 판단 기준 한 줄:**

> 두 테이블이 따로 저장돼서 잠깐 어긋나 있어도 괜찮은가? 괜찮으면 따로, 안 괜찮으면 한 덩어리.

## 결정

### 1. 애그리거트 루트는 5종 + 마스터 데이터 6종

**리포지토리는 애그리거트 루트에만 만든다.**

| 애그리거트 루트 | 안에 든 것 | 왜 한 덩어리인가 |
|---|---|---|
| `Placement` | `placement_desk` · `placed_item` | 저장 시점 판정(ADR-0004)이 배치 **전체**를 봐야 한다. 하중 합산·클램프 물림·VESA 결합은 아이템 하나만 봐선 못 푼다 |
| `Product` | `asset` · 규격 서브타입 5종 · `product_vesa` · `product_vibe` · `product_hashtag` | `asset.product_id`가 PK 겸 FK다 — 제품 없는 에셋은 존재 자체가 불가능하다. 서브타입은 ADR-0006 결정 4가 JOINED 상속으로 이미 못 박았다(`Desk extends Product`) |
| `User` | `follow` | |
| `CartItem` | | 사용자·제품과 독립 생명주기 |
| `GeneratedImage` | | 배치가 지워져도 이미지는 남는다(`placement_id` NULL 허용) |

**마스터 데이터 6종은 각자 루트다** — `brand` · `category` · `vibe` · `hashtag` · `desk_texture` · `vesa_spec`. 자체 id에 독립 생명주기고, 제품 없이도 존재한다.

커뮤니티 4종(`comment` · `placement_like` · `product_like` · `placement_bookmark`)도 각자 루트다. `placement_bookmark_group`은 `placement_bookmark`가 NULL 허용으로 참조하므로 **별도 루트**다(그룹 없는 북마크가 정상 상태다).

**`follow`도 별도 루트다** (2026-08-02 개정, DERO-344 — 팔로우 구현에서 발견). 위 표는 `follow`를 `User` **안**에 넣었지만(그 칸의 "왜 한 덩어리인가"가 비어 있다), `User`에 `@OneToMany`로 매달면 팔로워 **목록**(커서 페이지네이션)과 팔로워 **수**(집계)가 둘 다 컬렉션 통째 로드가 된다 — ADR-0006 결정 11이 금지한 조합이다. 모양도 수명도 `placement_like`와 같고(정션 + hard delete + 독립 생명주기) 그쪽은 이미 루트다. 자기 자신 팔로우 금지 같은 불변식은 루트를 통과해야 지켜지는 종류가 아니라 서비스가 두 id를 비교하면 끝난다.

**`terms`·`user_consent`도 각자 루트다** (2026-08-01 추가, DERO-337 — 온보딩 구현에서 발견). 원안이 둘을 어느 쪽으로도 분류하지 않아 조회 경로 자체가 없었다. `terms`는 마스터 6종과 같은 성격이고(자체 id·독립 생명주기, 사용자가 없어도 존재한다), `user_consent`는 커뮤니티 토글 4종과 같은 자리다 — `User`로 걸어가려면 동의 이력 전체를 컬렉션으로 물고 와야 하고, 온보딩 판정은 "필수 항목의 현행 회차 동의가 다 있는가" 하나라 이력 전체가 필요 없다.

`PlacedItemRepository`·`AssetRepository`를 만들지 않는다. 아이템 추가·이동·에셋 승인은 전부 루트를 통해 간다.

**대가**: `placed_item`이 배치당 수십 개면 매 수정에 컬렉션 통째 로드다. `@OneToMany` + `orphanRemoval`로 통째 교체하면 delete-insert가 난다. 배치 **목록** 화면은 ADR-0006 결정 11("컬렉션 페치 + `Pageable` 금지") 때문에 `placed_item`을 안 물고 가는 별도 조회를 써야 한다.

### 2. 쓰기는 루트를 통과한다. 읽기는 자유다

애그리거트 규칙은 **쓰기에만** 건다.

관리자 검수 목록("`asset.review_status = PENDING`인 것 전부")은 `Product` 루트로 걸어갈 수 없다. `ProductRepository`에 `@Query` 조인 조회를 둔다. 조회 전용 프로젝션·DTO 조회는 애그리거트 경계를 안 지켜도 된다.

읽기까지 루트로 강제하면 목록 화면마다 N+1이거나 통째 로드가 되어, 애그리거트가 사주는 것보다 잃는 게 커진다.

### 3. 애그리거트 간 참조는 **객체 참조**

`@ManyToOne(fetch = LAZY) Product product`를 쓴다. ID(`Long productId`)로 끊지 않는다.

순수 DDD는 ID 참조가 정답이지만 그 대가가 조회마다 수동 2차 조회다. 팀에 JPA 프록시를 포기할 이유가 없고, ADR-0006 결정 11이 `LAZY` 명시를 이미 강제해 N+1 구멍은 닫혀 있다.

대신 규칙 둘:

1. **다른 애그리거트 루트는 읽기만.** 수정은 자기 루트만 한다 — `placedItem.getProduct().updateName(...)` 금지.
2. **애그리거트를 넘는 연관에 `cascade`를 걸지 않는다.** `CascadeType.ALL` + `orphanRemoval`은 애그리거트 **안**(`Placement`→`PlacedItem`·`PlacementDesk`, `Product`→`Asset`·서브타입·태깅 조인)에만 쓴다. 밖으로 걸면 저장이 애그리거트를 넘어 번진다.

**이 결정이 오늘 것 중 제일 못 무른다.** 필드 타입을 ID로 바꾸면 그 엔티티를 쓰는 코드가 전부 흔들린다. 나머지 결정은 폴더 이동이나 인터페이스 추가로 끝난다.

### 4. 톱레벨 패키지 9개 + `global`

```
com.brunchies.dero
├── user          user · follow
├── catalog       brand · category · vibe · hashtag · desk_texture · vesa_spec
├── auth          로그인·토큰 재발급 컨트롤러 · OAuth 교환 · 리프레시 토큰 저장소
├── product       product · desk/monitor/arm/light/prop · asset · product_vesa/vibe/hashtag
├── placement     placement · placement_desk · placed_item
├── community     comment · placement_like · product_like · placement_bookmark(_group)
├── commerce      cart_item
├── image         generated_image
├── infra         포트 3곳 (결정 6)
└── global        전역 설정·예외·응답·베이스 엔티티·시큐리티 (결정 5)
```

도메인 패키지 하위는 기존 규칙대로 `controller/` · `service/` · `repository/` · `dto/`, 엔티티는 도메인 패키지 바로 아래에 둔다.

`commerce`는 `cart_item` 1테이블이라 얇다. 그래도 톱레벨로 둔다 — 견적·구매 링크가 붙을 자리고, `community`에 섞으면 나중에 떼는 게 더 비싸다.

### 5. `global` 하나. `common`을 만들지 않는다

```
global
├── config/      SecurityConfig · RedisConfig · JpaAuditingConfig · CorsConfig
├── exception/   GlobalExceptionHandler(@RestControllerAdvice) · BusinessException · ErrorCode
├── response/    ProblemDetails 팩터리 · 커서 페이지 record · offset 페이지 record   ← ADR-0008
├── entity/      BaseEntity · BaseSoftDeleteEntity   ← ADR-0006 결정 5의 @MappedSuperclass 2단
└── security/    SecurityConfig · NimbusJwtDecoder 빈 · 인증 실패 핸들러   ← ADR-0005 · ADR-0008
```

`exception/`의 `ErrorCode`는 **인터페이스**다. 구현 enum은 각 도메인 패키지에 산다 — `global`이 도메인 에러 목록을 알면 아래를 향한 의존이 생겨 결정 7의 "`global`은 아무도 모른다"가 깨진다(ADR-0008).

`global`과 `common`을 둘 다 두면 "이건 어느 쪽이냐"를 파일마다 다툰다. 하나만 둔다. 이름은 팀이 이미 쓰던 `global`을 택했다.

`JpaAuditingConfig`가 여기 있는 것은 ADR-0006 결정 6의 요구다 — `@EnableJpaAuditing`을 메인 애플리케이션 클래스에 달면 `@WebMvcTest` 슬라이스가 JPA 컨텍스트를 요구하며 깨진다.

**인증이 두 곳으로 갈리는 기준:**

> 요청 하나를 처리하면 도메인 패키지, 모든 요청을 가로채면 `global`.

`SecurityConfig`와 인증 실패 핸들러(`AuthenticationEntryPoint`·`AccessDeniedHandler` 구현)는 전 요청을 가로채니 `global/security/`. **필터는 우리가 짜지 않는다** — 토큰 검증은 Spring Security 내장 `oauth2ResourceServer().jwt()`가 한다(ADR-0005 결정 9). 로그인·토큰 재발급 API와 카카오·구글 OAuth 교환, 리프레시 토큰 Redis 저장소는 요청 하나를 처리하니 `auth/`.

`auth`를 `user`에 섞지 않는 이유: ADR-0005가 인증을 한 덩어리 결정으로 묶었다. 로그인 흐름을 고칠 때 사용자 프로필 코드를 헤집지 않게 떼어둔다.

### 6. 포트 3곳은 인터페이스와 구현을 `infra`에 같이 둔다

```
infra
├── storage/    ObjectStorage        + S3ObjectStorage          ← DERO-131 대기
├── ai/         ImageGenerator       + <provider>ImageGenerator ← DERO-139 대기
└── recommend/  RecommendationEngine + RuleBasedRecommendationEngine
```

순수 DIP는 인터페이스를 도메인에 두라 하지만 128이 이미 순수주의를 버렸다. 팀이 포트/어댑터가 처음이라 **갈아끼울 것 3개가 한 폴더에 보이는 것**이 값이 크다. 도메인 서비스는 인터페이스만 주입받는다.

`RecommendationEngine` 시그니처는 ADR-0001대로 **RAG 제약 기준**(실패·타임아웃·근거 필드)으로 짠다. 룰베이스 기준(동기·무실패)으로 짜면 RAG를 붙이는 날 갈아엎게 되어 포트를 둔 의미가 사라진다.

### 7. 의존 방향 — 위에서 아래로만

```
community · commerce · image
        ↓
     placement
        ↓
   product · auth
        ↓
   user · catalog
```

- 역방향·순환 **금지**. `product`가 `placement`를 import하면 잘못된 것이다.
- `product`와 `auth`는 같은 층이고 **서로 모른다**.
- `infra`는 도메인을 모른다. 도메인이 `infra`의 인터페이스를 부른다.
- `global`은 아무도 모른다. 전부가 `global`을 부른다.

**ArchUnit을 지금 넣지 않는다.** 규칙은 `backend/CLAUDE.md`에 글로 박고 순환은 IDE가 잡는다. **도입 트리거 — 역류가 실제로 한 번 나면** 그때 테스트 한 장을 추가한다. 4주 2명에 아직 존재하지 않는 코드를 지키는 하네스를 먼저 세우지 않는다.

## 대안과 버린 이유

**① `PlacedItem`을 독립 루트로 열기**
아이템 단건 추가·이동 API가 잦으면 편하다. 하지만 저장 시점 판정이 배치 전체를 봐야 해서(ADR-0004) 그 불변식이 결국 서비스로 새어나간다 — ADR-0001이 깊은 엔티티로 산 것을 도로 잃는다.

**② `Asset`을 별도 루트로 열어 검수 워크플로 독립**
관리자 검수가 `AssetRepository` 하나로 끝나 읽기 조회가 단순해진다. 그러나 `asset.product_id`가 PK 겸 FK라 생명주기가 완전 종속이고, 승인 판단은 `product.status`와 같이 봐야 한다. 게다가 검수(REQ-ADM-04)는 **Should라 잘릴 후보**다 — 잘릴 기능 때문에 애그리거트를 쪼개면 남는 건 인터페이스뿐이라는 게 128에서 헥사고날을 버린 논리와 같다. 되돌리기도 싸다(인터페이스 하나 추가, 스키마 무관).

**③ 애그리거트 간 ID 참조 (순수 DDD)**
경계가 컴파일 타임에 강제되고 애그리거트를 넘는 지연 로딩이 원천 차단된다. 그러나 조회마다 수동 2차 조회가 붙고, 팀에 그 비용을 감당할 경험이 없다. `LAZY` 강제(ADR-0006)로 최악은 이미 막혀 있다.

**④ `global`과 `common` 분리** (`global`=프레임워크 결합, `common`=도메인 공유 유틸)
개념적으로 깔끔하지만 파일마다 어느 쪽인지 다투게 된다. 베이스 엔티티 하나 놓을 자리로 논쟁을 사지 않는다.

**⑤ 포트 인터페이스를 도메인 패키지에, 구현만 `infra`에**
DIP 교과서 배치다. 스토리지는 `product`(GLB)와 `image`(상상도) 둘이 써서 인터페이스를 어느 도메인에 둘지부터 답이 없다. 128이 순수주의를 버린 것과 일관하게 한 자리로 모았다.

**⑥ ArchUnit을 지금 도입**
테스트 파일 하나로 끝나 싸 보인다. 그러나 지킬 코드가 아직 0줄이고, 규칙이 굳기 전에 하네스부터 세우면 규칙을 고칠 때마다 테스트를 같이 고친다. 언제 넣어도 비용이 같으므로 미룬다.

## 파급

- `backend/CLAUDE.md`에 패키지 트리·애그리거트 5종·객체 참조 규칙·의존 방향을 반영했다.
- **`global/response/`의 내용물은 [DERO-135 API 응답 규약 결정](DERO-135)이 채운다.** 이 ADR은 자리만 잡았다.
- **`infra/storage/`·`infra/ai/`의 구현체는 [131](DERO-131)·[139](DERO-139)가 정해져야 이름이 붙는다.** 인터페이스는 그 전에 짤 수 있다.
- **배치 저장 페이로드 형태는 여전히 미결이다.** 결정 1이 "루트를 통과한다"만 정했지, API가 씬 전체를 받는지 델타를 받는지는 안 정했다 — 설계 맵의 안개에 남는다.
- ADR-0001이 남긴 "애그리거트 경계 미결"이 이 ADR로 닫혔다.
- `@OneToMany` + `orphanRemoval` 통째 교체가 delete-insert를 내므로, 배치 저장 API가 확정될 때 그 비용을 다시 본다.
