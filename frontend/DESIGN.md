# 데스크테리어 시뮬레이터 — Style Reference

> 구현 레벨 스타일 문서. 정책·근거는 `docs/DESIGN-SYSTEM.md`(정본)를 따른다 — 이 문서는 그 값을 실무 토큰·컴포넌트 스펙으로 옮긴 것.

**Theme:** light

오늘의집처럼 따뜻하고 친근하지만, 실측 규격 검증 도구라는 신뢰감은 잃지 않는다. 웜오프화이트 캔버스 위에 온화한 허니옐로우 한 가지만 액센트로 쓰고, 나머지는 뉴트럴 그레이·브라운 스케일로 채운다. 유리질 HUD 패널과 실사 미니어처 3D 아이콘이 "공간 위에 떠 있는 도구" 감각을 만든다. 옐로우는 절제된 스카시티(scarcity)로 쓴다 — 화면 전체를 노랗게 칠하지 않는다.

## Colors

| Name                 | Value     | Role                                                                                     |
| -------------------- | --------- | ---------------------------------------------------------------------------------------- |
| Neutral 50 (Canvas)  | `#fcfbf7` | 페이지 배경 — 웜 오프화이트                                                              |
| Neutral 200          | `#eae4d7` | 하드라인 보더, 카드 구분선                                                               |
| Neutral 600          | `#73624d` | 보조 텍스트                                                                              |
| Neutral 800 (Ink)    | `#3f3528` | 본문 텍스트, 헤딩                                                                        |
| Primary 400          | `#f0bb4c` | 호버·보조 강조                                                                           |
| Primary 500 (Honey)  | `#e8a93a` | 주요 버튼, 링크, 포커스 링, 선택 상태 — 액센트 전용, 대면적 채우기 금지                  |
| Primary 600          | `#c98a24` | 버튼 액티브/프레스                                                                       |
| Decor Peach          | `#f5b98a` | 장식 그라디언트 중간 톤                                                                  |
| Decor Yellow         | `#f0bb4c` | 장식 그라디언트 시작 톤                                                                  |
| Decor Ivory          | `#fff8ec` | 장식 그라디언트 종착 톤, 글래스 하이라이트                                               |
| Primary 50           | `#fffbeb` | 다크 CTA 배너 위 버튼 텍스트                                                             |
| Primary 100          | `#fef3d2` | 배지 배경, Primary CTA 버튼 hover                                                        |
| Primary 200          | `#fce4a6` | Primary CTA 버튼 기본 필                                                                 |
| Primary 300          | `#f8d172` | Primary CTA 버튼 active, 스크롤 인디케이터 thumb                                        |
| Primary 700          | `#a16b1a` | 배지 텍스트                                                                              |
| Neutral 900          | `#2d251b` | 본문 최고 대비 텍스트, 다크 CTA 배너 버튼 배경                                          |
| Success 500          | `#22c55e` | 호환성 판정 — 적합                                                                       |
| Warning 500 (Orange) | `#e8722c` | 호환성 판정 — 조건부. Primary와 혼동 방지를 위해 붉은 쪽으로 분리, 항상 아이콘·라벨 병기 |
| Danger 500           | `#ef4444` | 호환성 판정 — 불가                                                                       |

## Typography

**Pretendard** 단일 패밀리(변수 폰트, weight 45~920). 두 번째 서체 도입 금지.

- **Weights:** 400(본문), 500(라벨·강조), 600(헤딩)
- **Sizes:** Caption 13 / Body 15 / H2 20 / H1 24 / Display 32
- **Line height:** 1.2(헤딩), 1.5(본문)
- **Letter spacing:** 기본 0, 32px 이상 대형 헤딩만 `-0.02em`
- **수치 표기:** mm·원·kg 등은 `font-variant-numeric: tabular-nums`로 고정폭

## Spacing & Layout

**Base unit:** 4px

- **Page max-width:** 1200px
- **Section gap:** 96px (모바일 48px)
- **Card padding:** 24px
- **Element gap:** 12px

### Border Radius

- **buttons / inputs:** 12px
- **cards:** 20px
- **glass panel:** 16px
- **pill(태그·배지):** 999px

## Components

### Hero

**Role:** 랜딩 최상단, 서비스 정체성 전달 + 시뮬레이터 진입

웜옐로우 → 살구 → 아이보리 그라디언트 블롭(강한 blur)을 배경 장식으로 깔고, 그 위에 캔버스는 그대로 웜 오프화이트. 최상단 pill 배지(서비스 정체성 태그) + 좌측 정렬 헤딩(Display 32~40, weight 600) + 서브카피(Body, Neutral 600) + Primary CTA + Ghost 링크. 우측 또는 하단에 글래스 미리보기 카드 1장.

### 히어로 배지 (Pill Badge)

**Role:** 서비스 정체성 태그, 히어로 최상단

Primary 100 배경, Primary 700 텍스트, pill 라운드(999px), Caption(13) 크기.

### Primary CTA Button

**Role:** 화면당 하나의 최고 강조 액션

Primary 200 필, 보더 없음, 12px 라운드, 12px 수직 / 20px 수평 패딩. 텍스트는 Neutral 900(진한 잉크)로 — 옐로우 위에 흰 글자는 대비 부족. hover는 Primary 100, active는 Primary 300.

### Ghost Text Button

**Role:** 보조 액션, CTA 옆 저강조

채움 없음, Neutral 800 텍스트, hover 시 밑줄.

### 3D 아이콘 피처 카드

**Role:** 차별점(조작감·소품 중심·카메라 프리셋·호환성 판정) 소개

글래스 카드(배경 `rgba(255,255,255,0.7)`, blur 14px, 1px 밝은 보더) 안에 실사 미니어처 3D 아이콘(현재 에셋 없음 — 라인아이콘/이모지로 임시 대체, 자리만 확보) + 헤딩(H2) + 설명(Body, Neutral 600). 아이콘에 idle 마이크로 모션(부드러운 플로팅) 예정.

### 글래스 HUD 미리보기 카드

**Role:** 시뮬레이터 HUD 감각을 랜딩에서 미리 보여주는 장식용 카드

`docs/DESIGN-SYSTEM.md` §2 글래스 토큰 그대로: 배경 불투명도 0.6~~0.75, blur 12~~16px, 소프트 섀도, 텍스트 영역 불투명도 하한 0.7. 한 화면에 글래스 패널 3장 이상 겹치지 않는다.

현재 인스턴스: 히어로의 "커뮤니티 인기 데스크테리어" 미리보기 카드(`DeskteriorPhotoGrid`) — 실제 게시물 사진 2장을 framer-motion stagger(0.15s 간격)로 순차 페이드업 등장.

### Organic Blob

**Role:** 랜딩·온보딩 배경 장식 전용

저채도 웜옐로우/살구 그라디언트 + 강한 blur, 정보 UI 뒤에는 배치하지 않는다(가독성 저해).

### 다크 CTA 배너 (클로징)

**Role:** 페이지 최하단 최종 전환 유도

Primary 200 → Primary 100 → Decor Ivory 그라디언트 배너(`rounded-[24px]`) 위에 Neutral 900 배경 / Primary 50 텍스트 버튼(hover Neutral 800). Primary CTA Button과 톤이 반전된 별도 변형 — 옐로우 배너 위에서 시각적 종결감을 주기 위해 어두운 버튼을 쓴다.

## Do's and Don'ts

### Do

- Primary 옐로우는 버튼·링크·선택 상태 등 "액션"에만 — 배경 워시나 대면적 섹션 컬러로 쓰지 않는다.
- 3D 캔버스(시뮬레이터)는 항상 뉴트럴 라이트 그레이 유지 — 이 문서의 웜옐로우 톤은 캔버스 밖(HUD·랜딩)에만 적용한다.
- 조건부(오렌지)와 Primary(옐로우)는 hue를 분리하고, 색만으로 구분하지 말고 아이콘·라벨을 함께 쓴다.
- 글래스 패널은 WebGL 위 동시 노출 3장 이하, blur 16px 상한을 지킨다.
- 수치(mm·원·kg)는 tabular-nums로 자릿수를 맞춘다.

### Don't

- 옐로우를 페이지 전체 배경이나 큰 섹션 채움색으로 쓰지 않는다 — 스카시티가 힘이다.
- 두 번째 액센트 컬러를 추가하지 않는다 — 판정 시맨틱(그린/오렌지/레드)은 별도 축이지 액센트가 아니다.
- 3D 아이콘을 과장된 만화체로 그리지 않는다 — 실제 제품 비율을 유지한 실사 미니어처.
- 글래스 위에 글래스를 중첩하지 않는다. 글자 자체를 반투명 처리하지 않는다.

## Elevation

플랫 + 글래스 두 트랙만 쓴다. 일반 카드는 그림자 없이 Neutral 보더로 구분(랜딩·정보 UI), HUD·오버레이는 글래스 블러 + 소프트 섀도로 "떠 있는" 감각을 낸다. 두 트랙을 한 컴포넌트에 섞지 않는다.

## Surfaces

- **Canvas** (`#fcfbf7`) — 페이지 기본 배경
- **Glass Panel** (`rgba(255,255,255,0.6~0.75)` + blur) — HUD·오버레이·미리보기 카드
- **Blob Wash** (옐로우→살구→아이보리 그라디언트) — 랜딩 배경 장식 전용

## Imagery

실사 미니어처 3D 아이콘(소프트 스튜디오 라이팅, 형태 과장 최소)을 기능 소개·온보딩·빈 화면에 쓴다. 본문 UI 아이콘(내비게이션·액션)은 별도의 라인아이콘 세트 — 3D 아이콘과 역할을 섞지 않는다. 커뮤니티 갤러리는 사용자 업로드 사진이 주 콘텐츠.

## Motion

`docs/DESIGN-SYSTEM.md` §6 정책(절제, 200~300ms ease-out) 하의 현재 구현 인스턴스:

- **ScrollProgress**: 브라우저 기본 스크롤바를 숨기고 우측에 커스텀 트랙/썸(Primary 300)으로 스크롤 위치를 표시.
- **DeskteriorPhotoGrid**: 사진 카드가 staggerChildren 0.15s 간격으로 순차 페이드업 등장(`prefers-reduced-motion` 대응 포함).

## Layout

센터 정렬 max-width 1200px. 랜딩은 Hero → 피처 카드(비대칭 bento, 균일 3열 그리드 지양) → 글래스 미리보기 → CTA 반복 순. 섹션 간격은 96px(모바일 48px)로 넉넉하게 띄운다.
