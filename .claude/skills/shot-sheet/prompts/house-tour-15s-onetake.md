# 집 소개 FPV 투어 (16:9) — 15초 원테이크 실측 통과본

- 모델: seedance_2_0 / 15초 / 16:9 / 720p
- 레퍼런스: 평면 설계도(빨간 번호 동선) + 외관 사진 — **딱 2장.** 내부 방 사진까지 넣으면 오히려 어색해짐(실측 v4 탈락).
- 골격: 레퍼런스 역할 선언 → 스케일 락 → 벽 통과 금지 → 타임스탬프 구간

설계도는 gpt_image_2로 먼저 그린다: 톱다운 평면도 + 방 라벨 + 빨간 점선 카메라 동선(번호 매김). 현관·창문은 전면 벽에, 동선은 문·복도로만.

```bash
higgsfield generate create seedance_2_0 --prompt "<아래 프롬프트 전문>" \
  --image floorplan.png --image exterior.png \
  --duration 15 --aspect_ratio 16:9 --resolution 720p --wait
```

## 프롬프트 전문

```
First-person FPV one-take, photorealistic, consistent golden hour light
throughout. The FIRST reference image is the floor plan of this exact
house: follow its room layout and its red numbered camera path EXACTLY —
enter from the street through the large front window into the living
room (1), one loop around the living room (2), through the back doorway
and across the short hallway into the bedroom on the right (3), back out
across the same hallway (4), and through the kitchen doorway on the left
to stop at the kitchen island (5). The SECOND reference image is the
real exterior of this single-story house — match it exactly. The
interior is a warm scandinavian home with light oak floors, cream walls
and soft golden light, furnished naturally to match the plan: a sofa and
TV in the living room, a cozy bed in the bedroom, an oak island in the
kitchen. This is a COMPACT home at normal residential scale: the hallway
is only three or four steps long, every transit covers just a few
meters, and the interior never stretches or extends beyond the rooms on
the plan. The camera NEVER cuts and NEVER passes through walls or
furniture — it always moves through real openings: the broken front
window, the doorways and the hallway.
(0-4s) Riding a kick scooter fast down the quiet street toward the
single-story house from the exterior reference, camera low and buzzing
with speed; the scooter hits a bump and launches — in the same unbroken
first-person view the camera itself crashes through the large front
window, glass shards flying past the lens, and carries straight on into
the living room without any cut.
(4-7s) The momentum melts into one smooth slow loop around the living
room, taking in the sofa and the warm light.
(7-10s) The camera glides through the doorway in the back wall of the
living room, crosses the short hallway — kitchen door passing on the
left — and eases through the bedroom door on the right, slowing to a
gentle glide inside the cozy bedroom.
(10-15s) The camera pulls back out of the bedroom, re-crosses the same
short hallway with the same doorframes passing in reverse, turns through
the kitchen door and decelerates into a final elegant glide that settles
at the kitchen island, ending on a calm steady wide frame. no watermark
```

## 실측 메모

- 필수 문장 3개를 빼면 각각 실패한다: 동선 준수("follow the red numbered camera path EXACTLY"), 스케일 락("COMPACT home at normal residential scale, the hallway is only three or four steps long" — 없으면 내부 무한 확장, v2 탈락), 벽 통과 금지("NEVER passes through walls — always moves through real openings", v1 탈락).
- 진입 스턴트는 "in the same unbroken first-person view ... without any cut"으로 컷 없이 잇는다.
- 내부는 프롬프트 문장으로 무드만 주고 모델이 채우게 하는 쪽이 자연스럽다. 실제 매물이 있으면 직접 찍은 외관 사진을 그대로 쓴다.
- 모더레이션이 같은 프롬프트를 랜덤 거부할 때가 있음 → 표현을 바꾸지 말고 1회 재시도부터.

---

출처: https://successwiki.io/guides/claude-higgsfield-video-skills-guide (성공지식백과, 2026-07-22)
