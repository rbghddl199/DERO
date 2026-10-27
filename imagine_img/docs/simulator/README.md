# 시뮬레이터 연동 코드

`captureForAI.ts` 하나만 있으면 된다. three.js 프로젝트에 복사해서 쓴다.

[SIMULATOR_CAPTURE_SPEC.md](../SIMULATOR_CAPTURE_SPEC.md) 가 "무엇을 보내야 하는가"라면
여기는 "어떻게 만드는가"다.

---

## 1. 씬에 붙일 것 (두 줄)

### 조명에 역할 표시

```ts
sunLight.userData.deroRole = 'sun'        // 창밖 자연광 (DAY 에만 켜짐)
hemiLight.userData.deroRole = 'sky'       // 하늘/환경 채움광
ceilingLight.userData.deroRole = 'room'   // 천장 조명 (roomLightOn)
deskLamp.userData.deroRole = 'product'    // 제품 조명 — 방 조명에 묶인다
```

역할이 없는 조명은 상태 전환에서 빠지고 콘솔 경고가 남는다.
**세기는 건드리지 않는다** — 원래 `intensity` 에 배수를 곱하는 방식이라
씬 디자이너가 잡은 밸런스가 유지된다.

### 아웃라인 메시 표시

인버티드 헐 방식이라면:

```ts
outlineMesh.userData.deroOutline = true
```

`EffectComposer` + `OutlinePass` 방식이면 아무것도 안 해도 된다 — 캡처는
`renderer.render()` 를 직접 부르므로 composer 를 타지 않는다.

---

## 2. 캡처

생성 페이지에서 사용자가 고른 조건 **한 가지**로 한 장만 만든다.

```ts
import { captureForAI, auditScene } from './captureForAI'

// 개발 중 한 번 확인
console.warn(auditScene(scene))

async function onGenerateClick(layoutId: number, state: LightingState) {
  // state 는 생성 페이지의 라디오 버튼 값이다. 예: { timeOfDay: 'NIGHT', roomLightOn: true }
  const capture = await captureForAI(renderer, scene, camera, state)

  const form = new FormData()
  form.append('image', capture.blob, 'capture.webp')
  form.append('timeOfDay', capture.timeOfDay)
  form.append('roomLightOn', String(capture.roomLightOn))
  await fetch(`/api/layouts/${layoutId}/renders`, { method: 'POST', body: form })
}
```

백엔드가 이 한 장을 큐에 넣고, 워커에 보내고, 프론트는 폴링한다.
(결정: 큐 + 폴링, 결과는 백엔드에 영구 보관, 온프렘 GPU.)

사용자가 조건을 바꿔 다시 누르면 그때 다시 부른다. **미리 네 장을 만들어 두지 않는다** —
렌더는 0.3초지만 생성은 한 장에 18초라, 안 볼 세 장을 만드는 값이 54초다.

`CAPTURE_STATES` 는 고를 수 있는 네 가지 조건 목록이다. 버튼을 만들 때 쓴다.

---

## 3. 이 코드가 해결하는 것

| 문제 | 어떻게 |
|---|---|
| DOM 오버레이(WEB VITALS 등)가 캡처에 찍힌다 | WebGL 씬만 직접 렌더한다. DOM 은 원천적으로 안 들어간다 |
| 툰 아웃라인이 ControlNet 조건을 선화로 만든다 | `userData.deroOutline` 메시를 숨긴다 |
| 단색 재질에 음영이 없다 | `MeshBasicMaterial`/`MeshToonMaterial` → `MeshStandardMaterial` 로 임시 교체 |
| 그늘진 면이 까맣게 죽는다 | `RoomEnvironment` PMREM 을 `scene.environment` 로 (HDR 파일 불필요) |
| 그림자가 하드하다 | `PCFSoftShadowMap` + `normalBias` 로 shadow acne 제거 |
| 조명 상태가 안 갈린다 | 역할별 배수 + `scene.environmentIntensity` 를 NIGHT 에 0.08 로 |
| 사용자 화면의 룩을 바꿔야 한다 | 안 바꾼다. 전부 캡처 중에만 적용하고 `finally` 로 복원 |

---

## 4. 알아둘 것

**`WebGLRenderTarget` 을 안 쓴다.** three.js 는 렌더 타깃에 그릴 때 톤 매핑을 적용하지
않는다 (`_currentRenderTarget === null ? toneMapping : NoToneMapping`). 화면과 다른 색이
나와서 조명 상태 비교가 어긋난다. 대신 기본 프레임버퍼에 그리고 **같은 태스크 안에서
동기적으로** `toDataURL()` 을 호출한다 — 브라우저가 아직 합성하지 않았으므로
`preserveDrawingBuffer` 없이 픽셀이 살아 있고, 중간 크기가 화면에 그려지지도 않는다.

그래서 **렌더와 `toDataURL` 사이에 `await` 을 넣으면 안 된다.** 검은 이미지가 나온다.

**버전 차이 두 곳**

```text
scene.environmentIntensity   r163+.  없으면 NIGHT 가 덜 어둡다 (콘솔 경고가 나온다)
new RoomEnvironment()        r155+.  이전 버전은 new RoomEnvironment(renderer)
```

**`longSide` 기본 1200.** 워커의 생성 픽셀 예산이 1.18M 이라 더 크게 줘도 디테일이
늘지 않고 확대 배율만 커진다. 1.6배를 넘으면 워커 응답에 경고가 남는다.

**비율은 화면과 같게 유지된다.** `camera.aspect` 를 건드리지 않으므로 사용자가 본
프레이밍이 그대로 나온다. 출력도 입력과 같은 크기다 (`SIZE_MODE=follow_input`).

---

## 5. 확인

서비스는 한 장씩 만들지만, **처음 붙일 때는 네 장을 다 뽑아서 확인한다.**
조명이 렌더에 구워지지 않은 게 1순위 실패 모드이고, 한 장만 봐서는 알 수 없다.

```ts
import { captureAllStatesForCheck } from './captureForAI'
// 개발용. 받은 blob 을 inputs/captures/ 에 저장한다
```

```bash
.\.venv\Scripts\python.exe scripts\check_capture.py inputs\captures\*.webp
```

GPU 없이 1초에 끝난다. 봐야 할 두 가지:

- **음영량 ≥ 1.2** — 미만이면 IBL/그림자가 안 걸린 것이다. 이 상태로는 실사화가 안 된다
- **밝기 비교표** — 4장이 뚜렷이 갈려야 한다. 비슷하면 조명 상태가 렌더에 반영되지 않았다

이 확인이 한 번 통과하면 이후로는 `captureForAI()` 한 장만 쓰면 된다.
