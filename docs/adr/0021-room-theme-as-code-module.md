# ADR-0021. 룸 테마는 데이터가 아니라 코드 모듈이다

## 상태

**확정** — 2026-08-03, 승인 박동규. · **결정 3·4·5는 [ADR-0030](0030-per-wall-finish-time-of-day-and-window.md)이 대체**하고, 결정 2의 벽 지오메트리 소유권 한 줄을 같은 ADR이 개정한다(창문 개구부는 마감이 아니라 씬이 뚫는다).

**결정 1(코드 모듈)·2의 금지 목록·6(통째 dispose)은 그대로 유효하다** — 룩의 정본이 데이터가 아니라 코드라는 이 문서의 제목은 뒤집히지 않았다. 아래에서 대체된 것은 **저장 모양과 축의 개수**다: `theme_key` 1컬럼 → `placement_wall` 3행, 축 하나(테마) → 벽면별 마감(프리셋은 저장되지 않는 프리필), v1 4종 → 계열 5종 + 프리셋 6개. 기획급 근거는 `docs/CONTEXT.md` **D31**.

## 맥락

시뮬레이터의 방 표면은 지금 **단색 4장**이다.

- `frontend/src/three/scene/scene.ts:497-506` `makeWall()` — `PlaneGeometry` + `MeshStandardNodeMaterial({color:0xededec, roughness:0.97})`, 벽 3면(left/front/right)
- `scene.ts:837-844` `setWallColor(hex)` / `scene.ts:846-852` `setFloorColor(hex)` — 재질 `color`만 갈아끼운다. 바닥은 `render/environment.ts:29`의 60×60 ground 메쉬
- UI는 `components/simulator/EditorSidebar.tsx:48-70, 290-330` — 프리셋 8색 + `<input type="color">` 자유 피커 2벌
- **어디에도 저장되지 않는다.** `types/placement.ts`·`api/placement.ts`·백엔드 전체에 `wallColor`가 없다

결과가 "백룸"이다 — 모서리·걸레받이·천장이 없고 표면이 완전 균질해서 깊이 단서가 사라진다. 색을 바꿔도 백룸의 색만 바뀐다.

레퍼런스(2026-08-03, 박동규 제시 4장)를 뜯으면 룩을 만드는 것은 벽 색이 아니다 — 4/4가 **우드 슬랫 부조·걸레받이·천장·러그·간접조명**에 의존한다. 그중 슬랫은 판재 반복 **지오메트리**라 색으로도 노멀맵으로도 흉내낼 수 없다(스침각에서 무너진다).

기존 제약 3개가 이 문제 위에 걸려 있다.

| 제약 | 근거 |
|---|---|
| 벽은 배경이 아니라 **기능 부품** | `scene.ts:773-800`이 벽 메쉬를 그대로 raycast해 벽걸이 배치점을 잡고, `scene.ts:720-722`는 벽 좌표를 충돌 클램프 평면으로 쓴다. 전면 벽 z는 책상 깊이를 추종한다(`scene.ts:534-536`) |
| 조명 리그는 **중립 고정** | `scene/roomRig.ts` — key 60 / fill 17 / rim 20 / hemi 6 / ambient 7, 전부 `0xffffff`. 주석이 못 박음: "색온도·밝기 모듈레이션 없음, 무드는 배치된 램프만". 세기를 올리면 흰 벽이 글레어 문턱 50을 넘는다(`scene/postfx.ts`). 관리자 발광 프리뷰가 같은 모듈을 공유한다(`scene/emitterPreview.ts`) |
| 색 중립이 제품 가치다 | `render/environment.ts:5-8`이 색 캐스트 0인 HDRI를 고른 이유. `e2e/lighting.spec.ts:63-64`가 기본 상태 벽 R/B를 0.9~1.12로 강제한다 |

## 결정

### 1. 테마는 리포에 커밋된 코드 모듈이다

테마는 데이터(텍스처 파일·GLB·DB 행)가 아니라 **TS 모듈**이다. 절차 지오메트리와 TSL 노드 머티리얼로 룩을 계산한다.

```
frontend/src/three/themes/
  types.ts          # Theme 인터페이스, ThemeKey 유니온, 돌출 캡 상수
  index.ts          # THEMES: Record<ThemeKey, Theme> — 정적 import 맵
  neutral/index.ts  # 기본값 = 현행 동작 그대로
  neutral/nodes.ts  # @ts-nocheck, TSL만
  oak-warm/…  white-clean/…  dark-studio/…
```

```ts
interface Theme {
  key: ThemeKey
  materials(ctx): { wall: NodeMaterial; floor: NodeMaterial }
  decor?(ctx): THREE.Group | null
  update?(dt: number): void
}
```

새 테마 = 폴더 하나 + `index.ts`에 한 줄. **동적 `import()`를 쓰지 않는다** — 테마 그리드는 클릭해가며 훑는 UI라 청크 fetch가 끼면 전환마다 깜빡인다. 절차 테마는 에셋 0바이트라 모듈이 수 KB다. rolldown-vite 청크 설정(`advancedChunks`)도 안 건드린다.

**런타임 원격 코드 로드·`eval` 금지.**

TSL 노드 체이닝은 반드시 `nodes.ts`에 `@ts-nocheck`로 격리한다 — 일반 파일에 쓰면 tsc 인퍼런스가 ~70GB OOM으로 머신을 죽인 전례가 있다(2026-07-17, `render/woodGrainNode.ts` 머리 주석).

### 2. 테마의 권한 경계 — 표면 룩만, 씬 구조는 못 만진다

허용:
- 벽 3면·ground의 **재질 교체**
- **연속 부조** 절차 지오메트리 — 우드 슬랫, 타일, 몰딩 격자, 걸레받이, 천장, 러그
- **emissive 메쉬**와 재질 노드 안의 **가짜 바운스 그라디언트**

금지:
- **광원 추가.** 광원 생성 창구는 `scene/lightSlots.ts` 하나이고 백엔드별 `EMITTER_LIGHT_CAP`이 걸려 있다(ADR-0014). 테마가 광원을 만들면 캡을 우회해 사용자가 배치한 램프 슬롯을 잡아먹는다
- **벽·바닥의 위치·크기·`visible` 변경.** 씬 단독 소유
- **이산 벽 장식**(선반·액자·벽등). 벽걸이 아이템은 y 0~2.6m 어디든 갈 수 있어(`core/snap.ts:263` `WALL_HEIGHT_M`, 기본 y는 상판 기준 `scene.ts:764`) 어떤 안전 밴드도 보장되지 않는다 — 관통은 "사기 전 검증"이라는 제품 목적을 직접 깎는다
- **자유 hex tint.** 우드 슬랫에 세이지 그린을 먹이면 나무가 초록이 된다

가드 2개:
- 연속 부조의 **방 안쪽 돌출 ≤ 20mm**(`themes/types.ts` 상수). 벽걸이가 그만큼 파고들지만 실제 시공이 슬랫 위로 뚫어 고정하는 방식이라 시각적으로 옳다
- decor 메쉬는 `raycast = () => {}`. 충돌·호환 판정에 **들어가지 않는다** — 판정 정본은 스펙 메타 DB(mm)뿐이라는 규칙 유지

### 3. 저장은 `placement.theme_key` 문자열 1컬럼, 마스터 테이블 없음

```sql
-- V5__placement_theme_key.sql
ALTER TABLE placement ADD COLUMN theme_key VARCHAR(30) NOT NULL DEFAULT 'neutral';
```

`placement`는 이미 방 상태를 저장한다(`erd.md` `is_wall_*_on`·`is_room_light_on`). 저장 근거도 등재돼 있다 — "없으면 저장한 무드와 재로드한 무드가 다르다". 조명 on/off 하나도 그렇게 저장했는데 방 전체 룩은 비교가 안 된다. 공유(`placement.visibility` + 임베드 토큰 ADR-0013)까지 걸려 있어 남의 화면에서 다른 방이 나오면 기능이 깨진다.

**Java enum으로 닫지 않는다.** 닫으면 테마 하나 늘릴 때마다 백엔드 배포가 붙어 결정 1(코드 갈아끼우기)이 무뎌진다. WAS는 이 값으로 아무 판정도 안 하므로 검증은 형식(`^[a-z0-9-]{1,30}$`)까지다. 선례 정합: 렌더 분기를 가르는 `asset.finish`는 닫힌 4종이지만, `desk_texture`는 자유 증가 마스터다 — `theme_key`는 후자다.

**알 수 없는 키는 에러가 아니라 `neutral` 폴백**이다. 테마 코드를 지웠다고 옛 배치가 안 열리면 안 된다.

### 4. 기존 벽지 색·바닥 색 피커를 제거한다. 축은 `theme_key` 하나

프리셋 8색은 사실상 "무채·웜 페인트 벽" 한 종류의 색 변형이라 테마 키로 이주하면 사용자가 잃는 게 없다. 축이 둘이면(`theme_key` + `wall_color` + `floor_color`) 재로드 때 누가 이기는지를 매번 정해야 하고 조합 폭발로 QA가 불가능하다.

### 5. v1 테마 4종. 기본값은 현행 무회귀

| 키 | 벽 | 바닥 | 장식 |
|---|---|---|---|
| `neutral` | 현행 `#ededec` | 현행 `#dcdbd9` | 없음 |
| `oak-warm` | 웜 그레이 페인트 + 코너 2면(전면·좌) 슬랫 액센트 | 오크 플랭크 | 걸레받이 + 슬랫 배킹 + 천장 |
| `white-clean` | 화이트 페인트 + 전면 벽 슬랫 액센트 | 라이트 오크 | 걸레받이 + 몰딩 + 천장 |
| `dark-studio` | 차콜 페인트 | 다크 월넛 | 걸레받이 + 러그 + 천장 |

**2026-08-04 개정 — `oak-warm`은 원래 "우드 슬랫 전면"(벽 3면 전부)이었다.** 1차 구현을 본 박동규의 시각 판정이 "찜질방 스킨"이었고, 원인은 네 겹이 겹친 것이다: ①판재가 방을 둘러싸는 것 자체가 사우나·한증막 시그니처, ②슬랫 갭 30mm(pitch 92 / 폭 62 = 폭의 48%)는 벽이 아니라 사우나 벤치 판재로 읽힘, ③슬랫 `0xb98a55`·바닥 `0xa87f4e`·트림 크림·천장 베이지로 웜톤 4중, ④벽 바탕이 배킹 겸용 진초콜릿 `0x2f251d`. 그래서 **코너 2면 액센트**(전면·좌)로 줄이고 갭 13mm(pitch 75), 채도를 낮춘 오크, 벽 바탕은 웜 그레이 페인트로 바꿨다. 배킹은 벽 재질이 아니라 슬랫 면에만 깔리는 4mm 판이다. **1면뿐인 `white-clean`과의 구별은 면 수(2 vs 1)·슬랫 두께(14 vs 12mm)·벽 톤(웜 그레이 vs 화이트)** 세 축이 진다 — 이 중 하나라도 같게 만들면 두 테마가 팔레트만 다른 쌍둥이가 된다.

`neutral`이 기본이어야 한다 — `e2e/lighting.spec.ts:63-64`의 중립 가드가 제품 색 판단을 지키는 물건이다. **`neutral`에는 천장도 넣지 않는다**(바운스가 늘어 샘플값이 움직인다). 천장은 아래를 보는 단면(`FrontSide`) 평면이라 위에서 내려보는 카메라에는 안 보인다 — 벽과 같은 수법.

나무결은 `render/woodGrainNode.ts`의 `woodGrainColor`를 재사용한다(`positionLocal` 기반이라 UV가 안 늘어난다). 슬랫 판재는 InstancedMesh 강제.

썸네일 이미지는 만들지 않는다 — 테마 칩은 CSS 2색 그라디언트 + 라벨.

### 6. 전환은 통째 dispose, 캐시하지 않는다

`applyTheme(key)`가 씬의 단일 창구다: 이전 decor 제거 + geometry/material dispose → 벽·ground 재질 교체 후 이전 재질 dispose → 새 decor 추가.

테마 4개를 상주시키면 NodeMaterial 셰이더 4벌이 VRAM에 남는다. 사용자는 한 번 고르고 끝이지 계속 바꾸지 않는다 — 캐시는 드문 경로를 위해 상시 비용을 낸다. 첫 전환 셰이더 컴파일 스톨은 **측정해서 300ms를 넘으면** 그때 프리워밍을 넣는다(미리 넣지 않는다).

## 대안과 버린 이유

| 대안 | 버린 이유 |
|---|---|
| **재질만 교체(장식 없음)** | 레퍼런스 4/4가 슬랫·걸레받이·천장·러그에 의존한다. 색만으로는 백룸이 백룸으로 남는다 |
| **테마가 GLB 소품을 끌어다 쓴다** | (a) 테마가 에셋 파이프라인(`review_status`·presign·admin 등록)에 물린다 (b) 배경 화분과 사용자가 실제로 배치한 제품이 화면에서 구분되지 않아 "사기 전 검증" 신뢰가 깨진다. D19가 소품을 GLB로 돌린 근거(D17 "텍스처가 룩의 70%")는 **유기적 소품**에 대한 판정이고, 슬랫·몰딩 같은 반복 직선 구조는 코드가 더 잘한다 |
| **테마에 전역 색온도 1개 허용** | e2e 중립 가드 수정 + `emitterPreview` 패리티 재정의가 딸려오고, 제품 색 판단이 왜곡된다. 온기는 재질 자체의 웜톤 + 가짜 바운스로 낸다. **v1 한정 보류** — 되짚을 여지는 남긴다 |
| **상단 밴드(y≥1.9m)에 선반 허용 + 겹치면 페이드아웃** | 클램프가 2.6m까지 허용해 어떤 밴드도 안전하지 않고, "장식이 갑자기 사라짐"이 관통보다 더 이상하다. 판정 코드도 는다 |
| **테마 + 색 오버라이드 병존(`tintable` 테마만 피커 노출)** | 축 2개 → 저장 3컬럼, 조합 폭발로 QA 불가 |
| **`theme` 마스터 테이블** | 룩 정본이 코드인데 DB에 또 두면 정본이 둘로 갈린다. `asset.finish`가 같은 이유로 테이블을 접었다(2026-07-23) |
| **동적 `import()` 코드 스플리팅** | 테마 그리드 전환마다 로딩 깜빡임. 테마가 20개를 넘으면 그때 전환한다 |
| **저장하지 않고 FE 로컬 상태로** | 재로드·공유 시 방이 달라진다. `is_room_light_on`을 저장한 논리와 정면 충돌 |

## 파급

- **DB**: `placement` 1컬럼(`V5__placement_theme_key.sql`). 다른 테이블 무영향. 기존 행은 `DEFAULT 'neutral'`이 즉시 백필(PG 11+, 테이블 재작성 없음). `docs/context/erd.md` frozen 해제 승인 2026-08-03(박동규), 범위는 이 1컬럼
- **API**: `PlacementSaveRequest`/`Response`에 `themeKey`. 요청에 없으면 `neutral`, 응답엔 항상 실어 보냄(ADR-0008)
- **프론트 삭제**: `EditorSidebar.tsx`의 `WALL_COLOR_PRESETS`·`FLOOR_COLOR_PRESETS`·색 피커 2개, 스토어 `setWallColor`/`setFloorColor`/`wallColor`/`floorColor`, `scene.ts`의 같은 이름 API. 참조 테스트 0건이라 안전. 투어 문구 1줄(`constants/simulatorTour.ts:53`) 수정 필요
- **e2e**: `lighting.spec.ts`는 기본 테마가 `neutral`인 한 그대로 통과해야 한다 — 이게 회귀 가드다
- **성능 DoD**: 전환 스톨·테마별 drawcall/삼각형 수를 측정해 기록. WebGL2 폴백에서 4종 전부 렌더 확인
- **시각 판정은 사람이 한다** — 4종 스크린샷은 박동규 확인
