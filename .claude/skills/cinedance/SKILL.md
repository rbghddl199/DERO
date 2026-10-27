---
name: cinedance
description: 힉스필드 Seedance 2.5(720p)로 내러티브·브랜드 필름을 만드는 전체 시스템 — 에셋 락, GEO 공간 지도, CINEDANCE 프롬프트 골격, 연기 작법, 반복 규율. Hell Grind(칸 상영 95분 AI 장편)의 공개 제작 공식을 이식. 트리거: "브랜드 필름", "시네마틱 영상", "seedance 프롬프트", "영상 프롬프트 써줘", "/cinedance". 짧은 제품 광고 컷은 shot-sheet, 광고용 에셋 확정은 casting-sheet.
---

# CINEDANCE — Seedance 2.5 필름 제작 시스템

목표: 컷이 수십 개여도 인물·장소·소품·목소리·스타일이 흔들리지 않는 영상. 출처는 Hell Grind
공개 브리프(95분 장편을 15명·14일 생성으로 완성한 검증 공식) — "팀 1명으로도 스케일다운 된다."

## 우리 생성 환경 (2026-08-09 힉스필드 MCP 실측)

- 모델: **`seedance_2_5`** — `generate_video`로 호출.
- mode: `t2v`(텍스트만) / **`omni_reference`**(이미지·영상·오디오 레퍼런스 — 에셋 기반 제작은 항상 이것) / `video_edit` / `video_extension`(forward·backward).
- duration **4~30초**, resolution **480p/720p**(기본 720p — 1080p·4k 필요 시 `seedance_2_0` std 또는 생성 후 `upscale_video` 2K/4K).
- media roles: `start_image` / `end_image` / `image_references` / `video_references` / `audio_references`.
- aspect: auto·21:9·16:9·4:3·1:1·3:4·9:16. `generate_audio`로 립싱크 음성 포함(무음은 false).
- 웹 UI에서는 레퍼런스가 `@태그`로 붙는다. MCP에서는 media id를 role에 매핑 — 프롬프트 본문의
  `@태그` 표기는 그대로 쓰되 어떤 media가 그 태그인지 role 순서로 일치시킨다.
- duration·aspect·resolution은 **파라미터로 지정**하고 프롬프트 본문에는 쓰지 않는다(스토리상
  필요할 때만 예외).

## 레퍼런스 문서 로딩 맵 (같은 폴더 `references/`)

| 단계 | 읽을 파일 | 내용 |
|---|---|---|
| 제작 시스템 전체(에셋·GEO·첫1초·어법·반복·포스트) | `PRODUCTION.md` | Hell Grind 브리프 증류본 — **항상 먼저** |
| 영상 프롬프트 1건 작성·수리 | `CINEDANCE.md` | 4-D 방법론, 15블록 골격, 렌즈·조명·물리 락 (원문) |
| 인물 연기 문단 작성 | `ACTING.md` | 5기둥, 마스터 프로파일, 눈 생명, 배드액팅 아틀라스 (원문) |
| 이미지 에셋 생성·수정 프롬프트 | `LIRA.md` | Soul/NBP/Seedream/GPT Image 2 라우팅, 수술적 편집 (원문) |

원문 3종은 영어 그대로 두었다(프롬프트는 어차피 영어로 쓴다). 원문과 PRODUCTION.md가
충돌하면 PRODUCTION.md가 우선(예: 나이 표기 금지).

## 작업 순서

### 0단계 — 에셋 락 (생성 금지 구간)

캐릭터·장소·소품·목소리·행동 프로파일·Style Prefix가 전부 락되기 전에는 **영상 샷을 하나도
생성하지 않는다.** `PRODUCTION.md` §1 절차: 시트 3장(전신 앞은 머리 제거) → 스트레스 테스트
10/10 → 상태별 별도 에셋 → 태그 사전. 이미지 프롬프트는 `LIRA.md` 규칙으로.

### 1단계 — 씬 준비 (씬당 1회)

- GEO SPATIAL LAYOUT 작성(§2) — 그 씬 모든 샷에 무변경 삽입.
- 씬을 샷으로 분해: 샷당 액션 하나, 4~12초 위주(30초는 원테이크가 정말 필요할 때만).
- 첫 샷 첫 1초는 배치 고정 와이드(§3).

### 2단계 — 샷 프롬프트 작성 (샷당 1건)

`CINEDANCE.md`의 골격을 따른다:

```
SCENE CONTEXT            ← EXACT N CHARACTERS — NO DUPLICATES 헤더 포함
ACTIVE REFERENCES        ← 이 샷에 보이는 @태그만, 각각 역할 명명
LOCATION MAP             ← GEO SPATIAL LAYOUT 붙여넣기
FIRST FRAME AND SPATIAL BLOCKING
FORMAT MODE              ← single take / controlled multi-shot, 실시간 여부
OPTICS                   ← 도수(°) FOV + 카메라 거리, mm·조리개 금지
CAMERA
ACTION TIMING            ← 초 단위 비트, 비트당 최대 3문장
PHYSICS
LIGHTING                 ← 광원 하나, 방향, 카메라는 그림자 쪽
AUDIO                    ← 목소리 프롬프트 verbatim + 따옴표 대사, SFX only
CHARACTER ACTING         ← ACTING.md로 작성한 씬 각색 문단
STYLE                    ← Style Prefix 토씨 그대로
QUALITY / POSITIVE CONSTRAINTS ← 개수·금지를 긍정문으로
```

어법: 현재형·짧은 문장·긍정문만·나이 금지·금칙어 치환(`PRODUCTION.md` §4).

### 3단계 — 생성·반복

- `generate_video` (model `seedance_2_5`, mode `omni_reference`, 720p) 또는 배치는
  `generate_video_batch` + `jobs_wait`.
- 반복은 한 줄만 수정, 프롬프트 버전·변경·판정을 로그로. 10~15회 안 되면 샷을 단순화.
- 시각 판정은 박동규 확인이 최종(기계 게이트만 자율).

### 4단계 — 포스트

클립 앞뒤 0.5초 트림 전제, 공격적 컷, 클린업 → 컬러(통일부터) → 연속 앰비언스 + 음악.
상세는 `PRODUCTION.md` §8.

## 이 스킬 vs 기존 스킬

- **shot-sheet**: 짧은 제품 광고(스토리보드 표 → 프롬프트 변환, 웹 UI 채팅 기반). 광고는 그대로 쓴다.
- **casting-sheet / storyboard**: 광고 파이프라인의 에셋 확정·타임라인. 필름 제작에서도 재사용
  가능하되, 에셋 품질 기준은 이 스킬의 0단계(스트레스 테스트 10/10)가 우선.
- **cinedance(이 스킬)**: 컷 수가 많고 인물 연기·공간 연속성이 필요한 내러티브·브랜드 필름.

## 지속 이슈

- (2026-08-09) Seedance 2.5는 1080p/4k 없음 — 고해상 납품은 720p 생성 후 `upscale_video`.
