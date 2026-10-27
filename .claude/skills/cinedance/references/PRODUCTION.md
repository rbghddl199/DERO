# Hell Grind 제작 시스템 — 증류본

출처: https://higgsfield.ai/@higgsfield.studio/projects/hell-grind 프로젝트 브리프 (2026-08-09 추출).
95분 장편 AI 영화(15명, $500K 미만, 생성 14일, 칸 2026 Marché du Film 상영)의 검증된 제작 공식.
CINEDANCE.md(프롬프트 골격)·ACTING.md(연기)·LIRA.md(이미지)가 다루지 않는 **프로덕션 시스템**만 담는다.

## 모델 분담 (Hell Grind 기준 — 우리는 영상만 Seedance 2.5로 교체)

| 역할 | 모델 |
|---|---|
| 영상 + 음성(립싱크 대사 포함) | Seedance (우리: `seedance_2_5`) |
| 얼굴·장소 원본 생성 | Soul Cinema / Soul 2.0 |
| 이미지 점 수정 | Nano Banana Pro → Seedream 4.5(텍스처만) → GPT Image 2(최후) |
| 프레임 내 텍스트·소품·역앵글 | GPT Image 2 |

## 1. 에셋 시스템 (프리프로덕션)

**에셋 = 텍스트(디스크립터) + 이미지(레퍼런스) 쌍.** 디스크립터는 모든 프롬프트에 토씨 하나 안 바꾸고 반복. 모델은 기억이 없다 — 축약하는 순간 다른 인물이 나온다.

- **캐릭터 시트 3장**: 얼굴 클로즈업 + 전신 앞 + 전신 뒤. **전신 앞모습은 머리를 제거**한다 — 와이드 샷에서 모델이 시트의 작고 흐린 전신 얼굴을 가져가는 문제를 원천 차단(얼굴을 가져올 곳이 클로즈업 하나만 남는다). 큰 초상은 3/4 각도가 가장 잘 먹힌다.
- **시트는 일부러 밋밋하게**: 중성 회색 배경, 플랫 조명, 무보정 실제 피부. 시네마 룩(그레인·렌즈)은 시트에 굽지 말 것 — 로케이션과 영상 프롬프트에 산다. 시트에 구우면 새 조명에 반응을 멈춘다.
- **얼굴 선택 기준**: 예쁜 얼굴 말고 **믿기는 얼굴**. 가짜 티는 영상 단계에서 터진다. 눈동자에 캐치라이트(반사광) 필수 — 없으면 죽은 얼굴이고 어떤 영상 모델도 연기시킬 수 없다.
- **점 수정 워크플로우**: 의상·흉터·피는 NBP/Seedream으로 수정본을 만들고, **마스크 편집기로 바뀐 부분만 원본 위에 얹는다**. 원칙: **이미지가 모델을 전체로 두 번 통과하지 않는다** — 통과마다 텍스처가 죽고 색이 드리프트하며, 두 번이면 얼굴이 대칭·플라스틱이 된다.
- **스트레스 테스트**: 락 전 다른 포즈·다른 조명으로 10회 생성, **10/10 인식**돼야 통과. 혼자 말고 다른 에셋 옆에서, 실제 씬 조명으로도 테스트. 실패하면 모델 탓이 아니라 디스크립터 탓 — 문장을 고쳐 재시험.
- **상태 = 별도 에셋**: 젖음·부상·옷 갈아입음은 `@roco`, `@roco_wet`, `@roco_blood` 각각. 장소도 낮/밤/비 3개. 소품도 동일(클로즈업용·손바닥용·주먹 속 은닉용). 한 텍스트에 상태를 섞으면 샷 사이에서 섞여 나온다. **상태 분리가 모델과 싸우는 것보다 싸다.**
- **태그 사전 통일**: `@roco`, `@loc_cave_front` — 문서·프롬프트·인터페이스 전부 같은 태그. 프로젝트 전체에 이름 사전 하나.

### 로케이션 규칙

- **미래 카메라 앵글을 위해 생성**: 시트는 정면 말고 **3/4**로. 정면 "예쁜 그림"은 와이드에서 벽지가 되고 가장자리 밖을 매번 새로 지어낸다. 3/4은 깊이를 읽혀 거의 전방위 앵글을 커버.
- **앵커 하나 남기기**: 기둥·램프·소파. "램프 옆에 문을 보고" = 성공, "방 안에" = 복권.
- **조명 논리 하나**: 광원 하나, 그림자 방향 하나, 태양 둘 금지 — 아니면 앵글마다 조명을 재발명한다.
- **역앵글 두 가지**: ① 같은 방의 코너를 GPT Image 2/NBP로 원본 소프트포커스에 맞춰 생성. ② (후반에 발견한 방법) **빈 로케이션을 카메라가 천천히 걷는 영상을 생성** — Seedance가 시트와 일관되게 반대편을 그려준다. 필요한 앵글을 스크린샷 → Seedream/NBP로 텍스처·조명 보강. 이미지 한 장으로 풀 로케이션 시트 완성.

### 레퍼런스 역할 명시

레퍼런스는 에셋(캐릭터·장소)만. **프롬프트 안에서 각 레퍼런스의 역할을 직접 명명** — 안 하면 모델이 멋대로 정한다(얼굴 대신 구도를 복사하는 식).

```
@roco for character reference
@loc_cave_front for location reference — do not use as a starting frame,
do not inherit the composition, the angle or the color — take only the
space and the texture.
```

### 목소리·행동 프로파일 (프리프로덕션에서 락)

- **목소리는 에셋이 아니라 락이다**: 대사 전에 음역·템포·억양·매너를 확정. 목소리 프롬프트는 매번 오디오 필드에 **그대로** 붙이고 절대 안 바꾼다. 외모처럼 생성 간 드리프트를 스트레스 테스트.
- **행동 프로파일 1문단**: 움직임·손버릇·신경성 습관·시선·압박에 무너지는 방식. 씬마다 각색하되 핵심 불변. 물리적으로 불가능한 행동은 삭제 말고 **변환**(서성이는 인물이 소파에 앉으면 같은 에너지가 흔들림·손가락 두드림으로). → 상세는 ACTING.md.

## 2. GEO SPATIAL LAYOUT (공간 지도)

초기 최대 비용 문제: 인물 텔레포트·자리바꿈·카메라 월경. 원인: 모델은 이전 샷을 기억 못 한다.
해법: **장소의 평면도를 몇 줄로 쓰고, 그 씬의 모든 샷에 무변경 삽입.** 인물·액션 없이 장소만.

```
GEO SPATIAL LAYOUT (locked across every shot — pure spatial map):
— PLATFORM = raised circular ritual stone disc at the edge of a cliff.
— ALTAR-MONOLITH: at the cliff edge, MID-RIGHT position relative to the platform.
— RITUAL CENTER: CENTER-LEFT, ~3 m from the altar.
— 180° AXIS: camera ALWAYS stays on the corpse-field side — it NEVER crosses the line.
— BACK-LIGHTING: crimson horizon glow comes from BEHIND the platform, rim-lighting
  silhouettes from camera's perspective.
```

읽는 법:
- 좌우는 **카메라 기준만** 존재: frame-left / frame-right. "주인공의 왼쪽"은 모델이 못 알아듣는다.
- 위치는 랜드마크 기준 + 미터 단위: "at the altar", "three meters away".
- 카메라가 어느 쪽에 서고 어떤 선을 절대 안 넘는지 직접 쓴다(180° 축).
- 컷마다 누가 어디 서서 어딜 보는지 **다시** 쓴다.
- 정적 대화는 방 전체 말고 **방구석 하나**를 준다 — 공간이 좁을수록 모델의 선택지가 준다.
- GEO는 지도일 뿐 — 장소의 룩은 여전히 로케이션 에셋(디스크립터+레퍼런스)이 담당.

## 3. 첫 1초 와이드 (배치 고정 샷)

씬 첫 샷의 **처음 1초는 대사·액션 없는 와이드**: 모델이 배치(누가 어디, 뭐가 어디, 빛이 어디서)를 "촬영"해서 이후 샷에 유지한다. 이 1초를 빼면 인물들이 자리를 바꾸기 시작한다.

- 핵: 그 1초에 누군가 짧은 한마디("hm")를 하게 하면 Seedance가 와이드를 별도 샷으로 다루기 쉬워진다.
- 이음새 접합: 이전 클립 대사의 꼬리를 이 1초에 흘려 넣으면 배우가 맞는 톤으로 답하고 두 클립이 이음새에서 붙는다. 새 생성은 이전 생성을 닫은 대사로 연다 — 감정이 텍스트와 함께 이음새를 건넌다.
- 비용 1초, 절약은 재촬영 몇 시간.

## 4. 프롬프트 어법 규칙

- **현재형, 짧은 문장.** 비트당 최대 3문장 — 비트를 과적하면 모델이 뭉갠다. 프롬프트 전체는 3,000~4,000단어도 됨. 길이가 적이 아니라 과적된 비트가 적.
- **긍정문만**: "does NOT fall on his back"은 무시되거나 반대로 실행 — "falls on his stomach"로.
- **인물 수 헤더**: `EXACT N CHARACTERS — NO DUPLICATES`. 모델은 사람을 추가하고 가구를 복제한다. 가구도 직접 금지: "exactly ONE mannequin, NEVER render a second one."
- **나이를 어떤 언어로도 쓰지 않는다** — 미성년을 읽는 순간 콘텐츠 필터가 급격히 엄격해진다. 나이 대신 역할·의상·행동. (CINEDANCE.md의 age 포함 공식보다 이 규칙이 우선.)
- **금칙어 사전 유지**: 모델이 벌주는 단어를 치환 — "dark"→"low key", "jolting"→"rapid motion". 프로젝트마다 발견 즉시 사전에 추가.
- **인물은 첫 프레임부터 프레임 안에**, 요청 없이는 카메라를 보지 않는다.
- **복잡한 액션은 타이밍 중간에 두지 않는다**: 문이 안 부서지면 — "he is ALREADY mid-swing, the door ALREADY cracking"으로 프롬프트를 열고, 문까지 걸어가는 건 별도 샷.
- **군중 = 캐릭터 에셋 1개**(키·옷 범위 기술) + 클로즈업용 리드 엑스트라 1~2명만 개별 에셋. 미디엄 샷엔 수를 직접 명시("20+").
- **거인은 스케일 앵커**: 매 프롬프트에 크기 비교 + 측정용 인물. 없으면 조용히 인간 크기로 줄어든다. "silhouette at least FIVE TIMES the height of the human figure, the frame cannot hold both his feet and his head at once."
- **공간 전환은 문지방**: 두 로케이션 에셋을 한 프롬프트에, 이음새는 조명 대비가 있는 출입구 — "a warm amber room, a cold blue corridor beyond the arch." 대비가 팔레트 변화를 설명하고 기하 실수를 용서한다.

## 5. Style Prefix (스타일 고정)

모든 프롬프트 끝에 **토씨 하나 안 바꾸고** 붙이는 스타일 블록. 프로젝트당 하나, 상수로 관리(수정 1회 = 전 샷 갱신). Hell Grind 원문(실사용 — 우리 프로젝트는 룩에 맞게 별도 작성하되 구조를 따른다):

```
Style: 8K IMAX. Photorealistic — no 3D render, no game engine, no game-cutscene aesthetic.
Cinematography: floating immersive camera that lives with the actors; natural motivated
light; painterly composed frames, strong silhouettes against the light.
Lighting: Natural light only — contre-jour backlight, camera on shadow side, atmospheric
haze throughout. Key light from sky and windows only.
Color: 60:30:10 — dominant / secondary / accent.
Camera: Physical cine lens. 180° shutter motion blur.
Skin: Pore-level realism — vellus hair, asymmetric moles, capillary flush, pore-shadow
matching on-set light.
Acting: Hollywood — micro-pauses before reactions, precise eye-line, wet living eyes with
catch-lights, visible breath and chest rise.
Physics: Gravity and inertia respected — mass has real weight, correct contact shadows.
No floating props.
Composition: Rule of thirds + golden ratio. Every person moving from frame one.
Continuity: Characters, props, environment identical across every cut. No identity drift.
Technical: 24fps smooth motion. 8K detail. No jitter.
Audio: Environmental SFX only. No music. No subtitles.
```

- **"SFX only. No music." 필수** — 음악은 포스트 몫, 생성 사운드트랙은 편집만 방해한다.
- 마감 태그: `Photoreal. NON-IP. [aspect ratio]. [duration]s. SFX only. NO CGI. Cinematic.` (룩이 다르면 Photoreal 대신 해당 룩 태그.)

## 6. 대사 블록 조립

대사는 **오디오 섹션에만** 산다 — 액션 블록에 말 한마디도 넣지 않는다. Seedance는 제멋대로 "uhm"·웃음·문장을 추가하므로 하드 블록:

- 구조: 목소리+감정 → 따옴표 대사 → 물리 액션 → 표정 반응.
- "everyone speaks ONLY the line in quotes; whoever has no line stays completely silent."
- 액션에 쓴 "half-laugh"는 소리 없는 표정이다 — 명시할 것.
- 믹스도 쓴다: 목소리는 깨끗하고 마이크에 가깝게, 앰비언스는 아래로, 대사 때 덕킹.
- 희귀 이름은 발음 전사 병기 — 아니면 모델이 부순다.

## 7. 반복 규율 (생성 단계)

- **배치 생성, 씬 단위.** 반복은 외과적: **한 줄만 바꾸고 나머지는 토씨 유지.** 전면 재작성 = 작동하던 부분까지 잃는다.
- **전부 로그**: 프롬프트 버전·바꾼 것·판정. 로그 없으면 좋은 샷을 재현할 수 없다.
- **10~15회 규칙**: 그 안에 샷이 안 나오면 문장 문제가 아니다. **샷을 단순화**: 둘로 쪼개고, 액션을 빼고, 앵글을 바꾼다.
- 모델에게 자유를 덜 준다: 방 대신 구석, 열린 공간 대신 앵커, 추측 대신 지도, 샷당 액션 하나.

## 8. 포스트프로덕션

- **편집은 생성과 병렬** — 편집자가 도착한 씬을 조립하며 부족분을 주문("손 컷어웨이 필요", "더 와이드로"). 재촬영이 몇 분이므로 편집이 프로덕션을 능동적으로 조형.
- 생성물은 거의 항상 템포가 느리다 — **느낌보다 공격적으로 자르고, 모든 클립의 처음·끝 0.5초는 잘라낼 계획**(가장자리가 드리프트한다).
- 픽처 락 후 클린업 패스: 손가락 수·"끓는" 텍스처·가짜 간판 텍스트. 작은 결함은 프레임 리터치, 완파 샷은 저장된 최종 프롬프트에서 한 줄 바꿔 재생성. 1순위: 얼굴·손 클로즈업. **전부 컬러 전에.**
- 컬러는 통일부터: 생성마다 자체 그레이드를 갖고 나온다 — 이웃 샷을 한 룩으로. 룩 자체는 프리프로덕션에서 로케이션 에셋에 구워뒀으므로 컬러리스트는 다듬기만.
- 목소리는 재녹음 없이 생성물에서 클린업(노이즈 제거·클립 간 음색 평활·공간 배치). 사운드·음악은 **연속 앰비언스 위에** 포스트에서 — 하나의 공유 대기가 생성 샷들을 한 공간으로 접합.

## 9. 5대 압축 규칙 (전체 요약)

1. **에셋 먼저.** 캐릭터·장소·소품이 락되고 스트레스 테스트되기 전엔 샷 하나도 생성하지 않는다. 이 규칙 하나가 나머지 전부보다 돈을 아낀다.
2. **매번, 전부 기술.** 모델은 기억이 없다. 디스크립터는 매 프롬프트에 전문, 축약 금지.
3. **한 번에 하나만 바꾼다.** 프롬프트는 작동 기계다 — 전면 재작성하면 작동하던 부품을 잃는다. 반복당 한 줄, 전부 로그.
4. **모델에게 자유를 덜 준다.** 방 대신 구석, 열린 공간 대신 앵커, 추측 대신 지도, 샷당 액션 하나.
5. **샷이 안 나오면 문장 말고 샷을 단순화한다.** 둘로 쪼개고, 액션을 빼고, 앵글을 바꾼다.
