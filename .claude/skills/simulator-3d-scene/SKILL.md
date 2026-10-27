---
name: simulator-3d-scene
description: three.js·R3F 씬 축 라우터 — 성능·프레임 드롭, 배치·스냅·카메라, 조명·발광, GLB 렌더의 정본은 스킬이 아니라 이 프로젝트 문서다. "시뮬레이터 씬 프레임 떨어진다", "배치가 튄다", "카메라·스냅 이상하다", "조명이 어둡다", "GLB 렌더가 다르다" 같은 요청에 쓴다.
---

# three.js · R3F 라우팅

three.js/R3F 내용을 담은 스킬은 설치 표면 어디에도 없다(실측 2026-08-13; 이 스킬은 내용 없는 라우터다). 이 축의 답은 아래 문서 정본에서 온다 — 일반 React·웹 성능 스킬을 여기에 끌어오면 일반 React 조언이 오답으로 들어온다(`docs/context/skill-routing.md` §6).

| 문제 | 정본 |
|---|---|
| 프레임 드롭·로드 성능 | `docs/context/3d-scene.md` + 계측은 `scripts/perf-trace-report.mjs` (`frontend/CLAUDE.md` 성능 행) |
| 배치·스냅·카메라·벽 토글 | `docs/context/3d-scene.md` |
| 조명·발광 | `docs/context/lighting-map.md` |
| GLB 저작·렌더 룩·에셋 온보딩 | `docs/context/glb-rendering-guide.md` |
| 엔진 코드 (씬·충돌·머티리얼) | `frontend/src/three/` + `frontend/src/three/CLAUDE.md` |

해당 행의 문서를 읽은 뒤 작업을 시작한다.
