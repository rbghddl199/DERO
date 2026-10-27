# ADR-0009. 배치 저장은 스냅샷 페이로드 + id 매칭 병합, 저장 게이트를 공개 게이트로

## 상태

**확정** — 2026-07-27, 승인 박동규.
결정 티켓 DERO-177 (에픽 DERO-125). 설계 맵: `docs/context/architecture-map.md`.

## 맥락

백엔드 2명 / 4주. Spring Boot 4.1 + Java 21 + PostgreSQL 18, JPA 단독([ADR-0006](0006-persistence-jpa-conventions.md)), EC2 1대.

[ADR-0007](0007-package-structure-and-aggregates.md) 파급 절이 남긴 미결을 닫는다 — **"결정 1이 '루트를 통과한다'만 정했지, API가 씬 전체를 받는지 델타를 받는지는 안 정했다."**

**애그리거트 모양** (`docs/context/erd.md` §5)

| 테이블 | 배치당 행 수 | 특기사항 |
|---|---|---|
| `placement` | 1 | 애그리거트 루트. 벽 3면 토글·방 조명·예산·`visibility` |
| `placement_desk` | 1 | `uq_placement_desk_placement_id`가 1행을 강제. `ON DELETE CASCADE` |
| `placed_item` | **20 내외** | `ON DELETE CASCADE`. `mounted_to_placed_item_id`는 **자기참조 FK**(VESA 결합), nullable, ON DELETE 미명시 → **NO ACTION** |

아이템 수 근거는 `erd.md` `joint_values` 절이다 — "배치당 100행(아이템 20 × 관절 5)".

**이 ADR에 이미 걸려 있는 결정들**

- [ADR-0004](0004-judgment-frontend-mirror-server-authority.md) 결정 1: 저장 시점에 **WAS가 배치 전체를 재판정**한다. 프론트 판정은 미러일 뿐이다.
- ADR-0007 결정 1·2: 리포지토리는 애그리거트 루트에만. **`PlacedItemRepository`를 만들지 않는다.** 쓰기는 루트를 통과한다.
- [ADR-0008](0008-api-response-contract.md): 성공 엔벨로프 없음(리소스 그대로 + 201·`Location`·204) / 에러는 RFC 9457 `ProblemDetail` + `code` 확장 필드(검증 실패만 `errors` 배열) / 도메인별 `ErrorCode` enum + `BusinessException` 하나 / `/api/v1` 접두사 / 시각은 `OffsetDateTime` ISO-8601 오프셋 포함 / null 필드도 실어 보냄 / 단위 접미사(`widthMm`).

## 결정

### 1. 페이로드는 스냅샷이다 — 씬 전체를 매 저장마다 보낸다

델타(변경분만)를 보내지 않는다. 근거 셋:

**① 서버가 어차피 전체 씬을 봐야 한다.** ADR-0004 재판정은 충돌·경계 검사라 아이템 하나만 보고 못 한다. 델타를 받으면 *현재 상태 로드 → 델타 적용 → 판정*이고, 스냅샷이면 *받은 것 판정*으로 끝난다. **델타는 코드를 줄이는 게 아니라 늘린다.**

**② 크기가 무의미하다.** 아이템 20행 × 컬럼 12개 ≈ 3~5KB. GLB 업로드가 20~30MB인 서비스에서 아낄 자리가 아니다.

**③ 델타는 클라이언트 상태를 신뢰한다.** "3번을 지웠다"를 검증하려면 결국 현재 상태와 대조해야 한다. 프론트가 델타 계산을 틀리면(되돌리기·다중 탭) DB가 조용히 어긋난다.

대가는 덮어쓰기 경쟁이다 — 결정 4가 받는다.

### 2. 영속화는 id 매칭 병합이다

`id`가 있으면 UPDATE, 없으면 INSERT, **요청에 안 온 id는 DELETE.**

| | 통째 교체(전량 DELETE 후 재INSERT) | **id 매칭 병합(채택)** |
|---|---|---|
| 코드량 | 적다 | diff 3갈래 |
| `placed_item.id` | 매 저장마다 바뀐다 | **안정** |
| `created_at` | 매 저장 리셋 | 보존 |
| 보안 | 클라이언트 id를 안 받는다 | **id마다 배치 소유 검증 필수** |

**결정 근거**: 아이템 단위 외부 참조 기능(아이템별 댓글·핀·태그)을 넣을 계획이 확인됐다(2026-07-27, 박동규). 통째 교체는 저장마다 id가 전부 바뀌어 그런 기능과 **양립 불가**다.

소유 검증 비용은 0에 가깝다 — 판정에도 필요해서 어차피 현재 아이템을 전부 로드하므로 **집합 포함 검사 한 줄, 추가 쿼리 0개**다.

ADR-0007 파급 절이 경고한 "`orphanRemoval` 통째 교체가 delete-insert를 낸다"는 이 결정으로 해소된다 — 컬렉션을 새 인스턴스로 갈아끼우지 않고 기존 요소를 제자리에서 수정한다.

### 3. 아이템 참조는 `ref`로 통일한다

모든 아이템이 `ref`(클라이언트 로컬 키)를 갖고, 기존 아이템은 `id`(서버 id)도 함께 갖는다. 마운트 참조는 **`mountedToRef` 하나로만** 표현한다.

**`ref`는 DTO 전용이다. DB 컬럼이 아니다.** 서버가 참조를 풀어 `mounted_to_placed_item_id`에 실제 id를 넣고 `ref`는 버린다. **`placed_item`에 추가되는 컬럼이 없다.**

`id`는 오직 **"이게 기존 행인가"**를 답하는 데만 쓴다(결정 2의 diff 3갈래 + 소유 검증). 참조에는 쓰지 않는다.

**채택 근거는 프론트가 이미 그 모양이라는 것이다.**

| 자리 | 현행 |
|---|---|
| `frontend/src/three/scene/scene.ts:802` | 인스턴스 id를 `p1`·`p2`… 형태 문자열로 만든다 — 이미 클라이언트 로컬 키다 |
| `frontend/src/three/scene/scene.ts:77` | `mountedToId?: string` — 참조가 이미 그 로컬 키다 |
| `frontend/src/store/simulatorStore.ts:801` | `mountedToId: i.mountedToId ?? null`로 그대로 내보낸다 |

변환 비용이 0에 가깝다. 필드명만 `mountedToId` → `mountedToRef`로 정렬하면 된다.

#### 요청 페이로드

```json
{
  "title": "재택 듀얼 모니터 셋업",
  "description": null,
  "visibility": "PRIVATE",
  "version": 7,
  "isWallLeftOn": true,
  "isWallFrontOn": true,
  "isWallRightOn": false,
  "isRoomLightOn": true,
  "budgetKrw": 1500000,
  "desk": {
    "specSource": "CUSTOM",
    "productId": null,
    "widthMm": 1400,
    "depthMm": 700,
    "heightMm": 720,
    "topThicknessMm": 25,
    "edgeThicknessMm": null,
    "deskTextureId": 3,
    "frameType": "T_FRAME"
  },
  "items": [
    {
      "ref": "p1",
      "id": 8821,
      "productId": 512,
      "positionXMm": -200,
      "positionYMm": 720,
      "positionZMm": -150,
      "rotationDeg": 0.0,
      "surfaceType": "TOP",
      "wallSide": null,
      "isVesaMounted": false,
      "mountedToRef": null,
      "jointValues": { "base-yaw": 12.5, "pole-lift": 80 },
      "emitterColor": null
    },
    {
      "ref": "p2",
      "id": null,
      "productId": 733,
      "positionXMm": -200,
      "positionYMm": 1180,
      "positionZMm": -180,
      "rotationDeg": -4.25,
      "surfaceType": "TOP",
      "wallSide": null,
      "isVesaMounted": true,
      "mountedToRef": "p1",
      "jointValues": null,
      "emitterColor": null
    }
  ]
}
```

`p1`은 기존 암(`id: 8821`), `p2`는 이번에 추가된 모니터(`id: null`)이고 `p1`에 VESA 결합됐다. 신규 아이템이 신규 아이템을 참조하는 경우도 같은 모양으로 표현된다 — 이것이 `id` 단독으로는 불가능한 지점이다.

#### 버린 참조 표현 둘

- **필드 2개** (`mountedToId` + `mountedToRef`): 항상 "둘 중 정확히 하나"를 검증해야 하고, 둘 다 오거나 둘 다 안 오는 경우가 열린다.
- **한 필드 혼합** (`mountedTo: 42 | "p3"`): 타입이 `number | string` 유니온이 되어 OpenAPI 생성 타입이 오염되고, 프론트가 쓸 때마다 분기한다.

#### 중첩 구조 대안 (거의 무승부였다)

`{ "item": 암, "mounted": { "item": 모니터 } }`처럼 참조를 구조로 표현하는 안이 있었다. **사이클이 구조적으로 불가능**해 결정 7의 검증 하나가 통째로 사라지고, ERD에도 중립이다. 갈린 지점은 둘:

1. 프론트 스토어가 **평면 배열**이라 직렬화에 그룹핑 1패스가 붙는다.
2. REQ-SIM-24 거치(Phase 2)가 같은 컬럼(`mounted_to_placed_item_id`)을 재사용하면 중첩 깊이가 늘어 페이로드 모양을 다시 짜야 할 수 있다 — **미확인**. 거치 에셋이 아직 0개라 확정할 수 없었다.

### 4. 낙관적 락은 `@Version`, `placement`에만 건다

스냅샷이라 덮어쓰기 손실이 실재한다.

```
탭1: 배치 로드(아이템 5개)      탭2: 같은 배치 로드(5개)
탭1: 모니터 추가 → 저장(6개)
탭2: 조명 추가 → 저장(오래된 5개 + 조명)
     → 탭1이 추가한 모니터가 "안 온 id"라 DELETE 된다
```

- **`placement`에만 `version BIGINT NOT NULL DEFAULT 0`을 둔다.** `placement_desk`·`placed_item`엔 두지 않는다 — ADR-0007이 쓰기를 루트로 모았으니 락 단위도 루트 하나가 맞다. 다른 애그리거트 루트(`User`·`CartItem`·`GeneratedImage`·`Product`)에도 지금은 넣지 않는다. 동시 편집이 실재하는 곳이 배치뿐이다.
- **함정**: 아이템만 바뀌고 `placement` 행 자체는 그대로일 때 Hibernate가 루트 version을 올리는지는 컬렉션의 inverse 여부에 달린다. **이 세션에서 문서로 확인하지 못했다**(확인 못 함). 프레임워크 동작에 걸지 않고 **명시적으로 올린다**:

```java
public interface PlacementRepository extends JpaRepository<Placement, Long> {

    @Lock(LockModeType.OPTIMISTIC_FORCE_INCREMENT)
    Optional<Placement> findForUpdateById(Long id);
}
```

- 충돌 시 **409 `PLACEMENT_STALE`**. 프론트는 **재로드를 강제한다** — "다른 곳에서 수정됐습니다. 새로고침 후 다시 저장". **"그래도 저장" 버튼은 버렸다**: 결국 마지막-저장-승리와 같은 결과를 사용자 손으로 만들게 하는 건데, 4주에 그 병합 UI를 만들 값이 없고 실시간 협업은 범위 밖이다(`docs/REQUIREMENTS.md` §5 범위 외 — "공동 편집").
- **`updated_at` 토큰 손수 비교 대안을 버린 이유**: 스키마를 안 건드리는 게 장점이었으나, `placement` 행이 dirty하지 않으면 `updated_at`이 안 올라가 토큰이 전진하지 않는다. 명시적 터치를 넣어야 하는데, 그럴 바엔 표준 `@Version`이 낫다.
- **스키마 개정은 이 ADR이 아니라 별도 티켓이다.** `docs/context/erd.md`가 동결이라 언락 절차가 필요하다(`docs/HARNESS-RULES.md` §4). 티켓은 파급 절에 적었다.

### 5. 저장 게이트를 공개 게이트로 옮긴다

**기획 변경이다.** 현행 REQ-SIM-14는 "충돌·경계 위반 상태에서는 저장을 차단"이다. 문제 둘: 겹쳐 보고 싶은 사용자가 배치를 **저장조차 못 하고**, 경고 문구가 실제 위험도에 비해 과하게 강하다.

게이트를 3단으로 나눈다.

| 단계 | 위반 시 | 근거 |
|---|---|---|
| 드래그 중(벽 켜짐) | **하드 클램프 유지** | 벽 관통에는 정당한 배치가 없다(`docs/CONTEXT.md` D22 "벽 경계는 하이브리드다") |
| 결합 판정 불가 | **자석 미발동 유지** | 이미 게이트 밖이다 — D22가 "불가 결합은 성립 자체가 불가하니 저장 게이트에 규칙을 더할 필요도 없다"고 적었다 |
| **저장** | **허용** + 경고(사실 진술 톤) | 내 실험은 내 자유다 |
| **공개(`PUBLIC`)·템플릿 등록** | **차단** | 남에게 보이는 배치는 "실제로 됨"을 함의한다. 커뮤니티 템플릿이 물리적으로 불가능하면 서비스 신뢰가 깨진다 |

**스키마를 안 건드린다.** `placement.visibility`가 이미 `PRIVATE`/`PUBLIC` 2값이라, PUBLIC 전환 시점에 재판정하면 된다.
*(2026-07-31 개정 — 그 컬럼은 이제 `publish_status` 4값이다. ADR-0015 결정 1. 게이트 판단 자체는 그대로다.)*

**별도 레버 하나 더 — 판정의 과검출을 줄인다.** 거슬림의 원인이 게이트가 아니라 과검출일 수 있다. ① **허용 오차 도입**(소량 침투 무시) ② **적층 케이스 예외**(키보드를 마우스패드 위에 올리는 것은 AABB로는 겹침이지만 정상 배치다).

**대가를 정직하게 적는다.** 위반 상태 배치가 DB에 들어온다. 스키마는 "DB에 있는 배치 = 판정 통과"를 암묵 전제로 삼고 있었고(`erd.md` `placed_item` 절 — "저장하지 않으면 재로드 시 위반으로 뒤집힌다"), 판정 통과 배치를 구분해 조회할 컬럼이 없다. **`PUBLIC`만 통과가 보장되므로 커뮤니티 조회는 안전하다** — 이 구조가 성립하는 이유다.

**이 결정의 문서 착지는 이 ADR이 아니다.** REQ-SIM-13/14 개정 + `docs/CONTEXT.md` D 시리즈 + `docs/context/compatibility.md`(허용 오차·적층 예외)이고 별도 티켓이다(파급 절). **이 ADR은 저장 API가 그 정책을 어떻게 표현하는지만 확정한다.**

### 6. 엔드포인트와 응답

| 동작 | 엔드포인트 | 성공 |
|---|---|---|
| 신규 배치 저장 | `POST /api/v1/placements` | **201 + `Location`** |
| 기존 배치 저장 | `PUT /api/v1/placements/{id}` | 200 |

`PATCH`가 아니라 `PUT`인 이유: 스냅샷은 리소스 표현 **전체**를 보내는 것이다.

~~**공개 전환 전용 엔드포인트를 만들지 않는다.** `visibility`가 스냅샷 안에 들어 있으니 서버가 그 값으로 게이트를 건다.~~

> **개정 (2026-07-31, [ADR-0015](0015-placement-upload-async-pipeline.md) 결정 10) — 이 문단만 뒤집힌다.**
> 배치 공개가 **비동기 파이프라인**이 되면서(업로드 → AI 상상도 3장 → 노출) 스냅샷에 상태를 실어 보낼 수 없게 됐다.
> `PENDING`·`FAILED`는 **서버만 정하는 값**이라 클라이언트가 보낼 수 있는 값의 부분집합만 유효해지고, 그러면
> `PUT`의 계약이 스스로 모순된다. 전용 엔드포인트 `PUT`/`DELETE /placements/{id}/feed-entry`(202/204)로 옮겼고,
> `visibility` 컬럼도 `publish_status` 4값으로 개명·확장됐다.
> **결정 5의 나머지(게이트 3단·"저장은 허용, 공개는 차단"·이미 공개된 배치에 위반 스냅샷을 보내면 422)는 전부 유효하다** —
> 게이트가 쏘이는 자리만 스냅샷 저장에서 업로드 호출로 옮겼다.

| 들어온 `visibility` | 위반 | 결과 |
|---|---|---|
| `PRIVATE` | 있음 | 200/201 저장 + 응답에 위반 목록 |
| `PRIVATE` | 없음 | 저장 |
| `PUBLIC` | 있음 | **422 `PLACEMENT_JUDGMENT_FAILED`** + `errors`에 위반 목록 |
| `PUBLIC` | 없음 | 저장 |

이미 공개된 배치에 위반 스냅샷을 보내도 422다 — 공개 배치가 위반 상태로 굴러떨어지는 걸 막는다.

#### 응답 바디

```json
{
  "id": 4102,
  "updatedAt": "2026-07-27T14:31:09+09:00",
  "version": 8,
  "items": [
    { "ref": "p1", "id": 8821 },
    { "ref": "p2", "id": 9034 }
  ],
  "violations": [
    {
      "code": "BOUNDARY_OUT_OF_TOP",
      "itemId": 9034,
      "message": "모니터 받침이 상판 밖으로 42mm 나갔습니다"
    }
  ]
}
```

- `items`의 **`ref` → `id` 매핑**으로 클라이언트가 신규 아이템의 서버 id를 받는다. 다음 저장에서 그 id가 UPDATE 대상이 된다.
- `version`·`updatedAt`은 다음 저장 요청에 그대로 실어 보낸다.
- **`violations`는 서버 정본 판정이다. 프론트 미러와 다르면 서버가 이긴다** — 이 지점이 ADR-0004 결정 3이 말한 미러 드리프트의 **감지점**이 된다. fixture 계약 테스트가 놓친 드리프트는 여기서 눈에 띈다.

### 7. 서버 검증 목록

ADR-0008의 도메인별 `ErrorCode` enum(`PlacementErrorCode`)에 들어갈 상수다. 상태 코드는 ADR-0008 결정 3의 배정 규칙표를 따른다.

| 검사 | 실패 시 |
|---|---|
| `ref` 유일성 | 400 `PLACEMENT_DUPLICATE_ITEM_REF` |
| `mountedToRef`가 실재하는 `ref`인가 | 400 `PLACEMENT_UNKNOWN_ITEM_REF` |
| 자기 자신 참조 · 사이클 | 400 `PLACEMENT_INVALID_MOUNT` |
| **`id`가 이 배치 소속인가** | 403 `PLACEMENT_ITEM_NOT_OWNED` |
| 낙관적 락 충돌 | 409 `PLACEMENT_STALE` |
| 공개 전환 시 판정 위반 | 422 `PLACEMENT_JUDGMENT_FAILED` |

`PLACEMENT_ITEM_NOT_OWNED`가 403인 이유: 남의 배치 아이템 id를 끼워 넣은 요청은 형식 오류가 아니라 권한 침범이다. 존재 여부를 되돌려 주지 않기 위해 `errors`에 어느 id인지 적지 않는다.

### 8. 구현 규칙 — 어기면 터지는 것들

- **INSERT는 "마운트 대상 없는 것"을 먼저 넣는다.** PostgreSQL FK는 기본 `NOT DEFERRABLE`이라 자식 행이 부모보다 먼저 들어가면 그 자리에서 위반이다. Hibernate가 자기참조 INSERT 순서를 보장하는지는 **문서로 확인하지 못했다**(확인 못 함) — 프레임워크 내부 동작에 걸지 말고 애플리케이션이 명시적으로 정렬한다.
- **자기참조 id는 2차 UPDATE가 필요 없다.** SEQUENCE 전략(ADR-0006 결정 8)은 `persist()` 시점에 id가 선할당되므로 FK가 **첫 INSERT의 컬럼 값**으로 들어간다. 2차 UPDATE는 진짜 순환 참조에서만 필요한데, 마운트 그래프는 **깊이 1의 1:1 짝**이다 — `frontend/src/three/scene/scene.ts:1500`이 "암 하나에 모니터 하나"를 강제한다.
- **DELETE 순서를 통합테스트 1건으로 못 박는다.** 암을 지우고 모니터를 남기는 경우 `모니터.mountedTo = null` UPDATE가 `암 DELETE`보다 먼저 나가야 한다. `fk_placed_item_mounted_to_placed_item_id`가 `NO ACTION`이라 순서가 어긋나면 FK 위반이다.
- **`EntityManager`를 서비스에 주입하지 않는다.** `PlacementRepository` 하나로 끝난다 — `getReferenceById`·`saveAndFlush`·`@Lock`이 각각 대응한다. ADR-0007대로 `PlacedItemRepository`를 만들지 않고, 아이템 쓰기는 `Placement` 엔티티의 컬렉션을 통해 간다.
- **목록 조회에 컬렉션 페치와 `Pageable`을 같이 쓰지 않는다** — ADR-0006 결정 11의 `HHH90003004`. 내 배치 목록(REQ-USR-02)은 `placed_item`을 안 물고 가는 별도 조회다.

```java
// Placement (애그리거트 루트) — 병합은 엔티티가 한다
public void applySnapshot(PlacementSnapshot snap, Map<String, Product> products) {
    updateAttributes(snap);              // 제목·벽 3면·방 조명·예산·visibility
    this.desk.apply(snap.desk());        // placement_desk 1행

    Set<Long> owned = items.stream().map(PlacedItem::getId).collect(toSet());
    snap.assertAllIdsIn(owned);          // 403 PLACEMENT_ITEM_NOT_OWNED

    Map<String, PlacedItem> byRef = new HashMap<>();
    items.removeIf(it -> !snap.keepsId(it.getId()));            // 안 온 id는 DELETE

    for (ItemSnapshot s : snap.itemsParentFirst()) {            // 마운트 대상 없는 것 먼저
        PlacedItem item;
        if (s.id() == null) {
            item = PlacedItem.of(this, products.get(s.productId()), s);   // INSERT
            items.add(item);
        } else {
            item = findItem(s.id());
            item.update(products.get(s.productId()), s);                  // UPDATE
        }
        item.mountTo(byRef.get(s.mountedToRef()));              // 객체 참조로 연결, null 허용
        byRef.put(s.ref(), item);
    }
}

// PlacementService
@Transactional
public PlacementSaveResult save(Long placementId, PlacementSnapshot snap) {
    Placement placement = placements.findForUpdateById(placementId)  // @Lock FORCE_INCREMENT
            .orElseThrow(() -> new BusinessException(PLACEMENT_NOT_FOUND));

    snap.validateRefs();                                     // 400 DUPLICATE/UNKNOWN/INVALID_MOUNT
    placement.applySnapshot(snap, catalog.loadProducts(snap.productIds()));

    List<Violation> violations = judge.judge(placement);     // ADR-0004 서버 정본 재판정
    if (snap.visibility() == PUBLIC && !violations.isEmpty()) {
        throw new BusinessException(PLACEMENT_JUDGMENT_FAILED, violations);  // 422
    }
    placements.saveAndFlush(placement);                      // 충돌 시 409 PLACEMENT_STALE
    return PlacementSaveResult.of(placement, violations);
}
```

## 대안과 버린 이유

**① 델타 페이로드 (변경분만 전송)**
페이로드 크기가 준다. 그러나 서버가 판정하려면 어차피 전체 씬이 필요해 *로드 → 델타 적용 → 판정* 3단이 되어 코드가 늘고, "3번을 지웠다"를 믿으려면 결국 현재 상태와 대조해야 해 **클라이언트 상태를 신뢰하게 된다**. 프론트가 델타를 틀리는 경로(되돌리기·다중 탭)에서 DB가 조용히 어긋난다.

**② 통째 교체 (전량 delete-insert)**
코드가 제일 적고, 클라이언트 id를 아예 안 받으므로 소유 검증 구멍이 원천적으로 없다. 그러나 저장마다 `placed_item.id`가 전부 바뀌어 **아이템 단위 외부 참조 기능(아이템별 댓글·핀·태그)과 양립 불가**하고, `created_at`이 매 저장 리셋되어 감사 컬럼이 거짓말을 한다.

**③ 중첩 구조 페이로드**
`ref` 없이 구조로 참조를 표현한다. **사이클이 구조적으로 불가능**해 결정 7의 검증 하나가 사라지고 ERD에도 중립이라 거의 무승부였다. 프론트 스토어가 평면 배열이라 직렬화에 그룹핑 1패스가 붙는 점과, REQ-SIM-24 거치(Phase 2)가 같은 컬럼을 재사용하면 중첩 깊이가 늘어 페이로드 모양을 다시 짜야 할 수 있다는 점(**미확인** — 거치 에셋이 0개라 확정 불가)으로 갈렸다.

**④ 즉시 저장 (드롭·클램프마다 단건 API 호출)**
클라이언트가 항상 서버 id를 들고 있어 `ref`가 아예 필요 없어지고, 브라우저가 죽어도 작업물이 남는다. 그래도 버렸다:

1. **ADR-0007 "대안과 버린 이유 ①"이 같은 논거로 이미 기각했다.** `PlacedItem`을 독립 루트로 열면 저장 시점 판정이 배치 전체를 봐야 해서(ADR-0004) 불변식이 서비스로 샌다 — ADR-0001이 깊은 엔티티로 산 것을 도로 잃는다.
2. **`placement.title`이 NOT NULL**이고 저장 시점에 이름을 받는다(`docs/USER-FLOWS.md` G7 — "저장 (로그인 상태, 이름 지정)"). 첫 드롭에 제목 없는 배치를 만들어야 한다.
3. **초안을 구분할 컬럼이 없다.** 제목 없는 빈 배치가 REQ-USR-02 내 배치 목록에 그대로 뜬다.
4. **요청 수**: 제스처 단위로 세면 세션당 **~130 요청** 대 스냅샷 **1회**.
5. **낙관적 UI로 도망가도 안 된다.** "아직 서버 id 없는 아이템"이 pending 큐 형태로 되살아나 `ref`보다 무거워지고, 재시도 지점이 1곳에서 ~130곳이 된다.
6. **세션 만료 시 반쯤 저장된 배치가 남는다.** `docs/USER-FLOWS.md` 엣지 케이스 표가 "편집 중 세션 만료 → 작업 보존 후 재로그인 유도 → 편집 복귀"를 Must로 걸었는데, 반쯤 저장된 상태는 그 복귀 지점을 모호하게 만든다.

**⑤ `updated_at` 토큰 손수 비교 (낙관적 락 대신)**
스키마를 전혀 안 건드린다 — 동결된 `erd.md` 언락이 필요 없다. 그러나 아이템만 바뀌고 `placement` 행이 dirty하지 않으면 `updated_at`이 안 올라가 **토큰이 전진하지 않는다**. 명시적 터치 코드를 넣어야 하는데, 그럴 바엔 표준 `@Version`이 낫다.

**⑥ 저장 게이트 유지 (위반 시 422로 저장 거부)**
"DB에 있는 배치 = 판정 통과"라는 불변식이 그대로 지켜지고, `erd.md`의 암묵 전제와도 어긋나지 않는다. 그러나 겹쳐 보려는 **정당한 탐색**을 막고, 판정 과검출(적층·소량 침투)이 그대로 사용자 차단으로 이어진다. 공개 게이트가 "남에게 보이는 배치는 실제로 되는 배치"라는 **진짜 목적**을 더 정확히 지킨다.

## 파급

**`placement` 도메인 패키지에 생기는 것**

| 것 | 내용 |
|---|---|
| 저장 DTO | 스냅샷 요청(`PlacementSnapshot`·`DeskSnapshot`·`ItemSnapshot`) + 응답(`ref`→`id` 매핑·`violations`) |
| `PlacementErrorCode` | 결정 7의 상수 6개 |
| `PlacementRepository` | 애그리거트 루트 전용. `@Lock(OPTIMISTIC_FORCE_INCREMENT)` 조회 포함. **`PlacedItemRepository`는 만들지 않는다** |

**후속 티켓**

| 티켓 | 내용 |
|---|---|
| DERO-189 | **스키마 개정** — `placement.version BIGINT NOT NULL DEFAULT 0`. `erd.md` 동결 언락 필요(`docs/HARNESS-RULES.md` §4) |
| DERO-190 | **기획 개정** — REQ-SIM-13/14 개정, `docs/CONTEXT.md` D 시리즈, `docs/context/compatibility.md`에 허용 오차·적층 예외 |
| DERO-191 | **프론트** — `frontend/src/three/scene/scene.ts:1417`의 `setDesk()`가 `clearPlaced()`를 부른다. **책상 규격을 바꾸면 놓은 아이템이 전부 파괴된다.** 좌표를 유지하고 재판정 후 소프트 플래그로 처리하도록 바꾼다 — REQ-SIM-25(벽을 껐다 켜서 밖에 남은 아이템)와 같은 패턴이다 |

**통합테스트 2건 (필수)**

1. **DELETE 순서** — 암을 지우고 모니터를 남기면 `mountedTo = null` UPDATE가 `암 DELETE`보다 먼저 나가는가. 자기참조 FK가 `NO ACTION`이라 순서가 어긋나면 FK 위반이다.
2. **낙관적 락 충돌** — 오래된 `version`으로 저장하면 409 `PLACEMENT_STALE`이 나오고 다른 탭이 추가한 아이템이 살아남는가.

**프론트 작업**

- `mountedToId` → `mountedToRef` 필드명 정렬(`scene.ts:77`·`simulatorStore.ts:801`).
- 409 수신 시 **재로드 강제** UI. "그래도 저장" 버튼은 두지 않는다.
- 응답 `violations` 표시. 프론트 미러 판정과 다르면 **서버 값으로 덮는다**.
- 응답 `items`의 `ref`→`id` 매핑을 스토어에 반영해 다음 저장이 UPDATE가 되게 한다.

**남는 것 — 크래시·탭 종료 시 작업물 보호**

디바운스 자동 스냅샷은 요구사항에 없어 넣지 않았다. 넣으려면 REQ-SIM-14 개정 결과(DERO-190)와 어떻게 공존하는지 **기획 결정이 먼저**다 — 편집 중간 상태는 대개 위반 상태라, 게이트를 되살리면 자동 저장이 계속 거부된다.
