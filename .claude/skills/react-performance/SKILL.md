---
name: react-performance
description: React·Next.js 성능 참조 — 워터폴 제거, 번들·첫 로드 JS, 리렌더, 하이드레이션·긴 목록, Web Vitals 매핑. "렌더 최적화", "번들 줄여줘", "첫 로드가 느리다", "리렌더 잡아줘", "LCP/INP가 나쁘다", "동적 import로 쪼개자" 같은 요청에 쓴다. 3D·R3F 성능은 소관 밖(§0).
---

# React·Next.js 성능

Vendored from ECC `react-performance` (2026-08-14, ADR-0042). 원본은 Vercel Labs `react-best-practices`(MIT, Vercel Engineering) 70+ 규칙 카탈로그이고, 이 판은 **이 스택에 유효한 것만** 남긴 체크리스트다.

**스택 전제 (2026-08-14 실측):** Next 16.2 App Router(Turbopack) · React 19.2 · zustand 5 · R3F 9 · framer-motion/gsap. **Route Handler·Server Action 없음**(백엔드는 Spring, `rules/nextjs/patterns.md`), **SWR·TanStack Query 미설치**, **React Compiler 미사용**(`next.config.ts`에 설정 없음) — 그래서 수동 메모이제이션 규칙이 아직 유효하다.

**Dedup (2026-08-14):** 아래는 삭제했다.

| 삭제한 절 | 근거 |
|---|---|
| Server Action 인증·`after()`·API route | 이 스택에 없음 — `rules/nextjs/patterns.md` §No Route Handlers, No Server Actions |
| `Promise.all` 기본형 · fetch 캐싱 명시 | `rules/nextjs/patterns.md` §Data Fetching이 정본 |
| `React.cache()` 요청 내 dedupe · 캐싱 4계층 카탈로그 | rules-diet(2026-08-14)에 rules 쪽도 삭제 — 모델 기본 지식, 이 리포의 서버 fetch는 `app/page.tsx`·`sitemap.ts` 2곳뿐 |
| `useEffect`로 파생 상태 만들기 · `useMemo`/`useCallback` 판단 기준 · 의존성 배열 규칙 | `rules/nextjs/hooks.md` 동명 절이 정본 |
| SWR/TanStack 요청 중복 제거 절 | 미설치 — 추천 표 자체가 오답을 유도해 rules에서도 삭제(rules-diet 2026-08-14) |

| zustand 셀렉터 파생값 무한 리렌더 | `rules/frontend/store-persistence.md`가 정본(더 정확) |

Suspense 배치는 rules에서 카탈로그와 함께 빠졌으므로 §4가 정본이다.

## 0. 소관 밖 — 3D·R3F 성능

**three.js/R3F 씬의 성능(드로우콜, 인스턴싱, GLB 압축, 조명·postfx 비용)은 이 스킬이 답하지 않는다.** 일반 React 조언을 씬에 적용하면 오답이 된다(`docs/context/skill-routing.md` §6 판정). 그 축의 정본:

- `frontend/CLAUDE.md` · `frontend/src/three/CLAUDE.md` — 엔진 지뢰
- `docs/context/3d-scene.md` · `lighting-map.md` · `glb-rendering-guide.md`

이 스킬이 씬에 걸치는 지점은 **번들(§2 동적 import)과 측정(§6)**뿐이다.

## 1. 워터폴 제거 (CRITICAL)

순차 `await` 하나가 왕복 지연 하나다. rules가 이미 "독립 fetch는 `Promise.all`"까지 말하므로, 여기 남긴 것은 그다음 수들이다.

- **싼 조건을 await보다 먼저.** props·env·플래그 검사로 단락시킬 수 있으면 원격 호출 전에 한다.
- **쓰는 분기까지 await를 미룬다.** `if (mode === 'guest') return ...` 뒤로 `await getUser()`를 내린다.
- **부분 의존이면 일찍 시작하고 늦게 await.**

```ts
const userP = getUser(id);          // 시작만
const profile = await getProfile(id);
if (profile.private) return null;
const user = await userP;            // 필요한 순간에 await
```

- **RSC는 컴포넌트 분리로 병렬화한다.** 한 컴포넌트 안의 형제 `await` 둘은 순차 실행이고, 자식 컴포넌트 둘로 쪼개면 React가 병렬로 돌린다.
- **클라이언트 컴포넌트에 넘기는 데이터는 최소로.** 직렬화 비용이 첫 로드 JS로 그대로 잡힌다 — 필드를 깎고 페이지네이션한다. 같은 데이터를 여러 클라이언트 컴포넌트에 내려주면 소비자 수만큼 직렬화된다(하나로 올리고 `children`으로 받는다).
- **서버 모듈 최상위에 가변 상태 금지.** 요청 간 공유라 사용자끼리 섞인다. 읽기 전용 상수·정적 I/O만 모듈 스코프에 올린다.

## 2. 번들·첫 로드 JS (CRITICAL)

- **배럴 import 금지** — `@/components`가 아니라 `@/components/Button`. 배럴은 트리셰이킹으로 지워질 모듈 그래프까지 번들러가 걷게 만든다. 리스트에 올린 패키지는 `next.config.ts`의 [`optimizePackageImports`](https://nextjs.org/docs/app/api-reference/config/next-config-js/optimizePackageImports)가 자동화한다 — **현재 이 리포는 미설정**이라 무거운 라이브러리를 쓰면 후보로 검토한다.
- **동적 import 경로는 정적 분석 가능해야 한다.** 템플릿 리터럴로 조립한 경로(`import('./x/' + name)`)는 번들러 추적을 무력화한다 — 분기마다 리터럴 경로를 쓴다.
- **무거운 컴포넌트는 `next/dynamic`.** 3D 캔버스·에디터(tiptap)·차트류가 대상. 클라이언트 전용이면 `ssr: false`, 자리 확보용 `loading` 스켈레톤을 같이 준다.
- **역할·조건부 모듈은 그 분기 안에서 `await import()`** (관리자 패널 등).
- **서드파티 스크립트는 하이드레이션 뒤로** — `next/script` `strategy="lazyOnload"`(분석·위젯류).
- **hover/focus에 프리로드** — 클릭 시점엔 이미 캐시에 있다.

## 3. 리렌더 (MEDIUM)

`rules/nextjs/hooks.md`의 "기본은 메모하지 않는다"가 상위 규칙이다. 아래는 그 예외를 판단할 때 보는 목록.

- **콜백에서만 쓰는 상태는 구독하지 않는다** — `useStore.getState().count`로 호출 시점에 읽는다.
- **원시값·파생 불리언을 구독한다** — `s.cart`가 아니라 `s.cart.length > 0`. 카트가 바뀔 때마다가 아니라 비었는지 뒤집힐 때만 리렌더된다.
- **비원시 기본값은 모듈 스코프로 끌어올린다** — `items ?? []`는 매 렌더 새 참조라 `memo`를 깬다. `const EMPTY: Item[] = []`.
- **effect 의존성은 원시값으로** — `[{ id, name }]`이 아니라 `[id, name]`.
- **비싼 초기값은 지연 초기화** — `useState(() => parseTree(input))`.
- **안정 콜백은 함수형 setState로** — `useCallback(() => setCount(c => c + 1), [])`.
- **컴포넌트를 컴포넌트 안에서 정의하지 않는다** — 매 렌더 새 타입이라 재조정이 깨지고 자식이 언마운트된다.
- **비싼 서브트리는 `memo` 컴포넌트로 추출**하고, 급하지 않은 갱신은 `startTransition`, 비싼 파생 렌더는 `useDeferredValue`.
- **리렌더가 필요 없는 잦은 값은 `useRef`** (타임스탬프·누적값·마지막 입력).
- **상호작용 로직은 이벤트 핸들러로.** effect는 deps가 바뀔 때마다 돌지만 핸들러는 사용자 행동에만 돈다.

## 4. 렌더링·하이드레이션 (MEDIUM)

- **긴 목록에 `content-visibility: auto`** + `contain-intrinsic-size` — 화면 밖 행의 렌더를 건너뛴다.
- **애니메이션은 SVG가 아니라 감싼 `div`에** — wrapper transform은 GPU, SVG 자체 transform은 페인트.
- **정적 JSX는 모듈 스코프로 끌어올린다.**
- **`&&` 대신 삼항** — `{count && <Badge/>}`는 `0`을 텍스트로 그린다.
- **하이드레이션 전 필요한 값(테마·로케일)은 인라인 `<script>`로** `documentElement.dataset`에 심는다. 어긋남을 아는 리프 노드에만 `suppressHydrationWarning` — 자식을 가진 트리에는 절대 쓰지 않는다.
- **탭·아코디언은 언마운트 대신 `<Activity mode="hidden">`** (React 19.2, 설치본에 있음) — 트리 상태와 effect를 유지한 채 감춘다.
- **Suspense 경계는 데이터가 필요한 곳 가까이** — 라우트 루트에 하나만 두면 감싸지 않은 느린 fetch 하나가 전체를 막는다. 세그먼트 단위 형태가 `loading.tsx`다. 페이지가 느리면 쿼리를 만지기 전에 빠진 경계부터 본다.
- **`react-dom`의 `preload`/`preconnect`**로 크리티컬 요청·오리진을 앞당긴다.
- **스크롤에 물린 쓰기 금지** — 프레임마다 state·style을 쓰면 끊긴다. sticky/CSS에 맡기거나 rAF+ref로 한 번에 쓴다 (실측 함정: `frontend/src/components/common/CLAUDE.md` 지속 이슈 · `rules/frontend/desk-feed-view-rails.md`).

## 5. JS 미시 최적화 (LOW-MEDIUM)

핫 루프·대형 배열에서만 값을 한다. 그 밖에서는 가독성이 이긴다.

- 반복 조회는 `Map`/`Set`(`O(1)`) — 배열 `includes`·선형 스캔 대신
- 루프 밖으로 `RegExp`·`arr.length`·프로퍼티 접근 호이스팅
- `filter().map()`은 `flatMap` 또는 한 번의 `for`로
- min/max는 `sort()`(`O(n log n)`) 말고 루프(`O(n)`)
- DOM/CSS 변경은 클래스 교체로 묶어서 (프로퍼티 하나씩 금지)
- `localStorage`는 동기 API — 읽기를 캐시하고 페이로드를 작게, `version` 필드 필수
- 스크롤 리스너는 `{ passive: true }`, 전역 리스너는 훅 하나로 공유
- 급하지 않은 작업은 `requestIdleCallback`

## 6. 측정

| 지표 | 먼저 볼 절 |
|---|---|
| LCP | §1 워터폴 · §2 번들 · 리소스 힌트 |
| INP | §3 리렌더 · §4 렌더링 · §5 JS |
| CLS | §4 (Suspense 자리 확보, 이미지 치수) |
| TBT | §2 번들 · 서드파티 지연 |

**숫자는 손으로 읽지 않는다.** 로드 성능 전후 비교는 리포 루트 `scripts/perf-trace-report.mjs <DevTools trace>`가 정본이고(`frontend/CLAUDE.md`), 자동화 브라우저로 잴 때의 함정은 `rules/frontend/qa-browser-measurement.md`에 있다. 체감과 실측이 갈리면 계측 파라미터(dpr·빌드 모드·브라우저)를 먼저 의심한다.
