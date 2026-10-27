# 이순신 종이 공예 시네마틱 (4:3) — 15초 원테이크 실측 통과본

- 모델: seedance_2_0 / 15초 / 4:3 / 720p
- 레퍼런스: 태극기 실물 이미지 + 무궁화 사진
- 골격: 스타일 락(종이 공예) → 레퍼런스 역할 선언 → 타임스탬프 매치컷 체인

```bash
higgsfield generate create seedance_2_0 --prompt "<아래 프롬프트 전문>" \
  --image taegukgi.jpg --image mugunghwa.png \
  --duration 15 --aspect_ratio 4:3 --resolution 720p --wait
```

## 프롬프트 전문

```
Layered paper-craft diorama, everything cut from textured colored paper,
warm cream base with deep navy, bold red and soft pink accents, visible
cut edges, soft drop shadows between layers, handcrafted stop-motion
feel, no gloss, no 3D plastic render look. One continuous 15-second
cinematic shot with match-cut transitions flowing through paper elements,
never a hard cut. The first reference image is the South Korean flag:
reproduce its taegeuk emblem and its four black trigram symbols EXACTLY
as shown — same orientation, same bar patterns, red over blue, no dots,
no text. The second reference image is a mugunghwa (rose of Sharon)
flower: all petals and the blooming blossom in this video match its shape
and soft pink-white color with the deep red heart.
(0-2s) Wide establishing shot: a giant layered ridged paper disc bearing
the taegeuk emblem from the flag reference, glowing softly behind rolling
cream paper dunes, with the four black trigrams from the flag reference
floating at the four corners around the disc as paper cut-outs. In front
of the disc, a navy paper-cut Korean palace gate with curved giwa roof
tiles and red pillars. White paper pampas grass fields sway; a tiny
figure of Admiral Yi Sun-sin in deep navy Joseon armor with a red sash
and a pointed Joseon helmet stands small on the path. All clouds are deep
navy and jade dancheong-style paper clouds — no red clouds.
(2-3s) A sweeping gust of deep-navy and jade dancheong paper clouds and
mugunghwa petals rushes across the foreground like a wipe, and the camera
pushes through it.
(3-5s) Medium shot: the admiral stands before the glowing taegeuk disc,
mugunghwa petals swirling around him as he slowly draws his hwando sword
with one hand and raises it gracefully.
(5-6s) He swings the sword in a single clean diagonal arc like a
calligraphy stroke — the arc match-cuts into a giant paper mugunghwa
blossom from the flower reference blooming open in layered petals,
filling the frame.
(6-7s) The petals scatter; for a beat the frame is almost empty cream
paper with a single petal drifting down.
(7-10s) Top-down bird's-eye view: the admiral stands tiny at the center
of a vast cream paper floor as red and blue paper ribbon rings and pink
petal rings draw themselves outward around him, ring after ring,
expanding and slowly rotating.
(10-12s) The rings spin faster and twist into a swirling paper vortex of
navy, red, blue and cream; the camera dives straight into the spiral.
(12-15s) The vortex opens onto an extreme close-up hero shot of the
admiral's deep navy paper helmet and stern, dignified paper face; a
single mugunghwa petal drifts past. Slow final push-in, then hold.
no watermark
```

## 실측 메모

- 실물 레퍼런스 원칙: 태극기를 글로만 지시했다가 두 번 연속 실패(태극 기울어짐, 괘 개수 어긋남). 실물 이미지를 레퍼런스로 넣자 한 번에 통과. 국기·로고·제품 라벨·특정 꽃처럼 정확해야 하는 오브젝트는 AI가 그리게 하지 말고 실물 이미지를 준다.
- 모더레이션: "slashes"·"war" 같은 직접 표현은 nsfw로 거부될 수 있음 → "swings ... like a calligraphy stroke"로 치환.

---

출처: https://successwiki.io/guides/claude-higgsfield-video-skills-guide (성공지식백과, 2026-07-22)
