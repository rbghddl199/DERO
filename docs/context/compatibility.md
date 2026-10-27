# 호환성 판정 컨텍스트

> 읽는 시점: REQ-CMP-* 구현·수정 시 (루트 CLAUDE.md 라우팅 표에서 진입).
> 관련 결정: `docs/CONTEXT.md` D7(메쉬-규격 분리)·D8(판정 스코프). 판정 입력 규격은 `docs/context/erd.md`가 정본 — ①은 `arm`·`desk`·`placement_desk` 절, ②는 `product_vesa`·`vesa_spec` 절(VESA. `monitor` 절에 인라인 컬럼으로 두지 않는다) + `monitor`·`arm` 절(무게·허용 하중), ③은 `prop`·`desk`·`placement_desk` 절. 책상 쪽 입력은 제품 모드면 `desk`, 직접 입력 모드면 `placement_desk`에서 읽는다. 수용 기준: requirements.md CMP 표.

## 확정 규칙
- 판정 3종: ① 암↔책상(클램프 물림 범위 vs **클램프 물림 두께**) ② 모니터↔암(VESA 일치 + 무게 vs 허용 하중) ③ 소품↔책상(면적·충돌)
- **판정 ①의 입력은 `클램프 물림 두께 = max(상판 두께, 엣지 마감 두께)`다** (2026-07-23 확정, 승인 박동규, D21. 종전의 "상판 두께 단독"을 대체). 제품 책상은 `max(desk.top_thickness_mm, desk.edge_thickness_mm)`, 직접 입력 책상은 `max(placement_desk.top_thickness_mm, COALESCE(placement_desk.edge_thickness_mm, placement_desk.top_thickness_mm))`. **저장 컬럼이 아니라 WAS 파생값**이다 — 두 원본 컬럼이 정본이고 파생값을 DB에 굳히면 원본을 고친 날 조용히 어긋난다.
  - 판정식: `clamp_min_mm ≤ 클램프 물림 두께 ≤ clamp_max_mm`. 사유 문구에는 파생값과 **어느 쪽에서 나왔는지**를 같이 낸다(예: "물림 두께 40mm(엣지 마감) > 클램프 최대 35mm") — 사용자가 상판 두께만 보고 "왜 불가냐"고 되묻는 경로를 막는다.
  - `max`인 이유는 양방향 오판이 실재하기 때문이다. 두꺼운 엣지 몰딩(상판 18/엣지 40)은 상판만 보면 거짓 "적합", 베벨 엣지(상판 25/엣지 15)는 엣지만 보면 거짓 "적합"이다. 어느 쪽이든 **거짓 "적합"** 이 나오고 그게 H2가 막으려던 반품이다. 근거 상세는 `docs/CONTEXT.md` D21.
  - 알려진 한계: 얇은 상판 + 두꺼운 엣지에서 조 패드가 안쪽 얇은 구간에 앉으면 `clamp_min_mm` 미달이 가능한데 `max`는 잡지 못한다. V1 미구현(D21).
- 판정 3단계: 적합(`FIT`) / 조건부(`CONDITIONAL`) / 불가(`INCOMPATIBLE`) — 항상 근거 수치와 함께 표시. 이 문서의 한글 라벨은 화면 표기이고 `judgment_result` 저장값은 괄호 안 코드값이다(`docs/GLOSSARY.md` 정본, 3값 고정)
- 판정 ①의 게이트는 `arm.is_clamp_mountable = true` — 이 값이 true인 암에만 적용한다. 다른 마운트 boolean(`is_grommet_mountable`·`is_wall_mountable`)이 동시에 true여도 **마운트별 결과를 OR로 합치지 않는다** — 합치면 클램프 물림 범위를 초과한 암이 "그로밋도 되니까"로 통과한다. 그로밋·벽이 V1 판정 입력이 아닌 이유는 책상 쪽에 대응 규격(홀 지름)이 없기 때문 (2026-07-23 확정, 승인 박동규)
- 이 게이트는 `arm_kind`와 **무관하다** — `arm_kind = MIC`인 마이크암도 `is_clamp_mountable = true`면 모니터암과 똑같이 판정 ①을 받는다. 클램프가 상판을 무는 물리는 팔 끝에 무엇이 달렸는지와 상관없다. `arm_kind`로 판정을 갈라 마이크암을 빼지 않는다 (2026-07-23 확정, 승인 박동규)
- `is_clamp_mountable = false`인 암(그로밋 전용·벽 전용·자립형)은 **판정 ①을 수행하지 않는다** — 상판 두께를 들이대지 않으므로 결과 목록에 판정 ① 행이 아예 없다(그 암에 대한 `judgment_result` 값이 만들어지지 않는다. "불가"도 아니다). 수행한 판정만 3단계로 표시한다(REQ-CMP-04 Must) — `judgment_result`는 `docs/GLOSSARY.md`가 못 박은 FIT/CONDITIONAL/INCOMPATIBLE 3값 그대로다. 화면에는 그 암이 클램프 판정 대상이 아님을 안내한다
- **노트북 거치대·휴대폰 거치대(`spec_type = PROP`)는 V1에서 판정 ①의 대상이 아니다** — 클램프로 상판을 무는 제품이 있어도 물림 범위 규격이 판정을 붙일 만큼 정리돼 있지 않다. 이 2종은 판정 ③(소품↔책상, 면적·충돌)만 받는다. 규격이 정리되면 그때 붙인다(YAGNI). 관절이 있다고 해서(D16 관절 제품군 4종) 판정 ①이 따라붙지는 않는다 — 판정 ①의 입력은 관절이 아니라 클램프 물림 규격이다 (2026-07-23 확정, 승인 박동규)
- 물림 규격 결측 방어: `is_clamp_mountable = true`인데 `clamp_min_mm`·`clamp_max_mm`가 NULL이면 **절대 "적합"으로 떨어뜨리지 않는다** — "조건부" + "클램프 물림 규격 미등록 — 제조사 사양 확인 필요"로 낸다. NULL을 0이나 무한대로 치환하지 않는다(각각 전량 불가·전량 적합으로 오판). 등록 시 WAS가 이미 막으므로 이건 유입·과거 데이터에 대한 2차 방어다
- 판정은 규격 메타데이터 DB(mm) 값으로만. 3D 메쉬 치수 참조 금지 (NFR-01)
- "불가" 시 같은 카테고리에서 조건 만족 대안 제시 (REQ-CMP-06)
- 에셋 간 공간 겹침(배치 충돌)은 호환성 판정이 아님 — 시뮬레이터 지오메트리 참조 OK, `collider.ts`(REQ-SIM-04) 소관. 호환성은 규격 DB로만 (D7/D8)

## 판정 위치 (2026-07-26 확정, 승인 박동규, ADR-0004)

**프론트는 미러, 서버가 정본.** 이 문서는 판정 **규칙**의 정본이고, 그 규칙을 누가 언제 실행하는지가 아래 표다. 근거·버린 대안은 `docs/adr/0004-judgment-frontend-mirror-server-authority.md`.

| 역할 | 누가 | 언제 |
|---|---|---|
| 즉답 판정 (드래그 근접·아이템 추가) | 프론트 TS (`collision.ts` 계열 순수 함수) | 실시간 0ms |
| **확정 판정 (정본)** | WAS — 저장 시점 배치 **전체 재판정**, 위반 시 **저장 거부** | 저장·공유·템플릿 복사 |
| 대안 제시 (REQ-CMP-06) | **서버 전용** (카탈로그 SQL) | "불가" 배너의 "대안 보기" 클릭 시 |
| 판정 결과 저장 | **안 함** — 매번 재계산 | — |

- 프론트 판정은 화면을 즉시 되받아치기 위한 한 벌이지 무엇을 확정하지 않는다. WAS는 저장 시 배치 **전체**를 규격 DB로 다시 판정하며, 클라이언트가 보낸 판정 결과는 읽지 않는다. 마지막에 만진 아이템만 보면 책상 규격을 나중에 바꿔 놓은 배치가 통과한다.
- 대안 제시에 미러를 두지 않는 이유: 카탈로그 전량을 훑는 질의라 클라이언트에 규격 DB를 통째로 내려야 성립한다.
- **판정 결과는 어느 테이블의 컬럼도 아니다** — ERD에 판정 결과 컬럼이 없는 현 상태를 그대로 유지한다. 위 클램프 물림 두께와 같은 이유로, 파생값을 굳히면 규격 원본을 고친 날 조용히 어긋난다.
- **드리프트 방어 = 공유 fixture 계약 테스트.** 입력 규격→기대 판정 JSON 한 벌을 TS(vitest)와 Java(JUnit) 양쪽이 소비한다 — 한쪽만 고치면 다른 쪽 테스트가 그날 깨진다. 정상 케이스뿐 아니라 **경계·결측 케이스**(물림 규격 NULL의 조건부 처리, `is_clamp_mountable = false`의 "판정 행 없음")를 함께 담는다. 규칙이 바뀌면 이 문서 → fixture → 양쪽 구현 순으로 내려간다. Java 쪽은 백엔드 착수 후에 붙으므로 그때까지 TS 단독으로 돌지만, fixture는 처음부터 언어 중립 JSON으로 둔다.

## 구현 세부 (2026-08-01 서버 판정 엔진 착수, DERO-338)

**판정 순수 함수는 `backend/dero-api/.../placement/judgment/CompatibilityJudge.java`** — `placement` 도메인 안이다(새 톱레벨 패키지 금지, ADR-0007). 경로가 `/compatibility`인 것과 코드가 사는 자리는 별개다.

| 축 | 어디 |
|---|---|
| 판정 3종 순수 함수 | `placement/judgment/CompatibilityJudge` — 입력은 규격 값 레코드(`ClampSpec`·`GripSpec`·`MonitorMountSpec`·`ArmMountSpec`·`FootprintSpec`)이고 엔티티가 아니다 |
| 엔티티 → 규격 값 변환 | `placement/judgment/ProductSpecs` — 판정 함수가 엔티티·DB·스프링을 모르게 하는 경계 |
| 배치 전체 재판정 | `placement/judgment/PlacementJudge.judge(Placement)` — 저장 병합 **뒤**에 돈다 |
| 즉답 판정 API | `POST /api/v1/compatibility/judgments` → `CompatibilityController`·`CompatibilityService`. **비로그인 200, 무저장** |
| 저장 경로 경고 | `PlacementService.violationsOf` → `PlacementSaveResponse.violations` |
| 계약 테스트 | `placement/judgment/JudgmentFixtureContractTest` — `frontend/tests/fixtures/judgment.json`을 상대 경로로 직접 읽는다(복사본 금지) |

- **판정 행이 없는 것과 "불가"는 타입으로 갈라 뒀다** — `judgeArmDesk`가 `Optional<Judgment>`를 낸다. `is_clamp_mountable = false`면 `Optional.empty()`이고 응답 `judgments` 배열에 그 행이 아예 없다.
- **`CONDITIONAL`은 저장 응답의 `violations`에 안 싣는다** — 그건 규격 미등록 안내이지 규격 위반이 아니고, 이 목록이 나중에 공개 게이트(422, ADR-0009 결정 5)의 입력이 되므로 카탈로그 데이터 결측이 사용자의 공개를 막게 된다. 조건부까지 보려면 즉답 판정 API가 전체 행을 준다.
- **사유 문구 전문은 TS 미러(`frontend/src/three/core/collision.ts`)와 Java 양쪽이 같이 진다.** fixture는 부분 문자열만 못 박는다 — `물림 두께 45mm(엣지 마감) > 클램프 최대 40mm` 같은 전문을 바꾸려면 두 구현과 각각의 문구 테스트를 같이 고쳐야 한다.
- **무게는 g 정수로 비교하고 kg로만 표시한다**(`7100 → "7.1kg"`, `5000 → "5kg"`). 그램을 그대로 찍으면 값은 맞고 읽히지 않는다.
- 판정 ③은 **면적 적합까지**다. 공간 겹침은 위 규칙대로 `collider.ts` 소관이라 서버가 판정하지 않는다 — 여기에 넣으면 같은 판정이 두 곳에 생기고 둘이 갈린다.
- 대안 제시(REQ-CMP-06)는 아직 없다 — `POST /compatibility/alternatives`는 미구현이다.
