# 음료 광고 15초 CF (16:9) — 원테이크 실측 통과본

- 모델: seedance_2_0 / 15초 / 16:9 / 720p
- 레퍼런스: 모델 캐스팅 시트 + 제품 파우치 사진
- 골격: 실사 CF 톤 락 → 인물/제품 앵커 선언 → 타임스탬프 구간 + 배경 점프 연출 + 제품 히어로 마무리
- 브랜드: 실제 브랜드는 저작권 문제로 사용 금지. 가상 브랜드(ORNJ)를 만들어 파우치 디자인까지 생성한 뒤, 그 생성본을 실물처럼 모든 컷에 고정한다.

```bash
higgsfield generate create seedance_2_0 --prompt "<아래 프롬프트 전문>" \
  --image casting-sheet.png --image product-pouch.png \
  --duration 15 --aspect_ratio 16:9 --resolution 720p --wait
```

## 프롬프트 전문

```
Bright K-beauty commercial, photorealistic, crisp and clean, sparkling
fresh youthful energy, golden summer light. One continuous 15-second
commercial featuring the same Korean model from the reference casting
sheet throughout — same face, same ash-brown hair, same white summer
dress in every scene — and the ORNJ orange juice pouch exactly as in the
reference product photo: orange-to-yellow gradient pouch with big white
'ORNJ' letters, label always sharp and unchanged.
(0-4s) She sprints joyfully across a sunlit university lawn, ORNJ
pouch in hand, hair and dress flying in the wind, laughing, the camera
tracking alongside her at speed, sunlight flaring through the trees,
grass blades kicking up behind her.
(4-8s) She leaps and flops backward into the deep soft grass, rolling
over laughing out loud, petals and grass blades floating up around her,
carefree and radiant; the camera swings overhead to look straight down
at her lying in the grass.
(8-11s) Still lying in the grass, she stabs the straw into the ORNJ
pouch with a crisp pop and takes a long refreshing sip — at that instant
the sky above her washes into a flat pastel MINT backdrop and tiny
orange juice droplets pop outward around her like miniature fireworks.
(11-15s) Final product hero: the pouch stands alone in the center of a
flat lemon-yellow backdrop as a dynamic orange juice splash swirls once
around it and settles, droplets sparkling; the pouch lands front-facing,
label perfectly sharp, identical to the reference photo. No hands in the
hero shot, no text except the pouch label. no watermark
```

## 실측 메모 — 가짜 워터마크 주의

시댄스 2.0이 광고 스타일을 흉내 내면서 화면 구석에 가짜 방송 로고를 스스로 넣을 때가 있다. `no watermark`만으로는 못 막는다. 프롬프트 앞에 다음을 넣으면 잡힌다:

```
NO channel logo, NO broadcast bug, NO text in any corner — the ONLY text is the label printed on the pouch
```

이미 생성된 영상이라면 재생성 대신 ffmpeg으로 해당 모서리를 크롭하는 쪽이 크레딧을 아낀다.

---

출처: https://successwiki.io/guides/claude-higgsfield-video-skills-guide (성공지식백과, 2026-07-22)
