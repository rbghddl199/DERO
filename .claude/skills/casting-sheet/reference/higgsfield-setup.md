# 힉스필드 연결 · 크레딧 · 공통 규칙

세 스킬(`casting-sheet` → `storyboard` → `shot-sheet`)의 공통 전제. 출처: https://successwiki.io/guides/claude-higgsfield-video-skills-guide

## 연결

클로드가 기획·프롬프트 작성·생성 호출을 맡고, 힉스필드가 Seedance 2.0 / GPT Image 2 같은 모델로 실제 이미지·영상을 만든다. 연결 경로는 둘 중 하나.

### 클로드 앱 — MCP 커넥터

1. Settings → Connectors
2. `+` 로 새 커넥터 추가
3. 이름 `Higgsfield`, URL `https://mcp.higgsfield.ai/mcp`
4. Add

### 클로드 코드 — CLI + MCP

```bash
curl -fsSL https://raw.githubusercontent.com/higgsfield-ai/cli/main/install.sh | sh
higgsfield auth login
```

같은 엔드포인트를 MCP 서버로 등록:

```bash
claude mcp add --transport http higgsfield https://mcp.higgsfield.ai/mcp
```

## 스킬 3종 역할

| 스킬 | 역할 | 산출물 |
| --- | --- | --- |
| casting-sheet | 인물·제품·배경을 레퍼런스 이미지로 확정하고 엘레멘트 락으로 고정 | 인물·제품·배경 시트 3장 |
| storyboard | 15초를 3~5컷 타임라인으로 설계하고 콘티 한 장으로 확인 | 컷 타임라인 표 + 콘티 이미지 |
| shot-sheet | 콘티를 시댄스 2.0이 알아듣는 영상 프롬프트로 변환 | 15초 원테이크 프롬프트 |

세 스킬은 **반드시 하나의 채팅방에서 이어서** 쓴다. 캐스팅 시트에서 건 엘레멘트 락이 그 채팅에 살아 있어야 스토리보드·영상 컷에 같은 인물·제품이 나온다. 새 채팅을 열면 락이 풀려 첫 컷부터 다른 사람이 된다.

## 실측으로 확인한 규칙 5가지

1. **정확해야 하는 오브젝트는 실물 레퍼런스로.** 국기·로고·라벨·꽃을 글로 지시하면 틀어진다. 이미지를 주면 한 번에 잡힌다.
2. **15초 이내는 쪼개지 말고 원테이크로.** `(0-4s) (4-8s)`처럼 타임스탬프 구간을 프롬프트 안에 적고 생성은 한 번에.
3. **공간 영상은 설계도부터.** 동선 번호를 그린 평면도를 레퍼런스로 넘기면 카메라가 벽을 뚫지 않는다.
4. **심의 거부는 단어를 바꿔 넘는다.** `slashes` 같은 직접 표현 대신 `swings like a calligraphy stroke`.
5. **결함 컷은 재생성보다 편집 먼저.** 재생성은 크레딧이 들고 리롤은 복불복이다. 컷 편집·크롭은 무료.

## 15초 초과 — 라스트 프레임 체이닝

시댄스 2.0은 한 클립 최대 15초. 더 긴 영상은 앞 클립 마지막 프레임을 뽑아 다음 클립 `--start-image`로 넘긴다.

```bash
ffmpeg -sseof -0.1 -i clip1.mp4 -frames:v 1 -q:v 2 clip1-last.png
```

## 크레딧

- 시댄스 2.0 / 15초 / 720p 원테이크 1편 = **67.5크레딧**. 리롤 1~2회 포함해도 광고 1편 200크레딧 안쪽.
- 생성 전에 `higgsfield generate cost`로 견적 확인.
- 울트라 플랜은 월 3,000크레딧 = 15초 기준 월 40편 이상.

## 대사

시댄스 2.0은 한국어 발음이 어색하다. 대사는 영상에서 말하게 하지 말고 자막 또는 별도 녹음 더빙으로 처리한다.
