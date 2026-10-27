# Concept Image Catalog — `concepts/` (received 2026-08-09, 51 images)

**Numbering**: the new cut numbers (01–35) delivered by Dongkyu are canonical.
Old CUT numbers (SHOTLIST original) mapped alongside. The new numbering itself
matches the merge plan (04=old 04+05, 10=old 07-4+08, 11=old 09+10,
15=old 14-2+15, 25=old 25-1+2, 29=old 28-2/3/4) — merge plan confirmed.

Grades: **S** = promotable to start/end_image after fixes ·
**M** = mood/layout ref only · **R** = regenerate (reason noted)

## Assets (6)

| File | Content | Verdict |
|---|---|---|
| asset-character-expressions | 10 expressions + turnaround + close-ups | Lock candidate → LOCKED |
| asset-character-turnaround | FRONT/SIDE/BACK | Lock candidate → LOCKED |
| asset-house-front | House front (**number 15**) | Fixed → house-front-25 |
| asset-house-entrance | Entrance close-up (**number 25**) | Lock candidate |
| asset-room-topview | Room top view (bed upper-right, desk left, sofa lower-left, window top) | **Source for GEO** |
| asset-room-9views | Room 9-view sheet | Standard location asset. Lock candidate |

## Per cut (45)

| Cut (old) | Content | Verdict / action |
|---|---|---|
| 01 (01) | House + truck + box | **R** — truck arriving but box already there (Dongkyu's note) + number conflict. Inpainted into 2 frames: box removed = start, truck removed = end |
| 02 (02) | Coming out the door holding box | **M** — action runs backward vs story; house consistency issue. First frame rebuilt from entrance asset (cut02-start) |
| 03 | No image | New first frame generated (cut03-new) |
| 04-a/b (04+05) | Bokeh anticipation → hand rubbing | **S** — same framing, a=start b=end |
| 05 (06-1) | Top-down box placement | **S** |
| 06-a/b (06-2/3) | Tape tear → hands in | **S** — a=start b=end |
| 07 (07-1) | Parts-spread close-up | **R** — **character drift** (curly bangs, lashes, different face). Regenerated (cut07-new) |
| 08 (07-2) | Clamp tightening | **R** — same drift. Regenerated |
| 09 (07-3) | VESA joining | **R** — same drift. Regenerated |
| 10-a/b (07-4+08) | Mount attempt → monitor slips | **S** — same framing, a=start b=end. Re-check against sheet |
| 11-a/b (09+10) | Lamp on → disappointment | **S** — a=start b=end |
| 12-a/b (11) | Standing at mismatched desk → knees, dejection | **S** — continuous emotion, a=start b=end. ⚠ full-body proportion check |
| 13 (13) | OTL purple spotlight | **S** — standalone gag insert. ⚠ proportion check |
| 14 (14-1) | Floor slump + glowing laptop wide | **S** — laptop already on; "turning on" via prompt |
| 15-a/b (14-2+15) | Notice wide → profile gaze | Angles differ → **merge cancelled, 4s each**. Each a start candidate |
| 16 (16) | Peeking eyes close-up | **S** |
| 17 (17) | DERO logo screen | Composite source (screen-record policy) — no gen |
| 18 (18) | DERO UI reveal | Same (real UI screenshot as insert source) |
| 19-a/b (19-1/2) | Profile surprise → operating | **S** — a=start b=end |
| 20 (20) | UI monitor selection | Screen recording |
| 21 (21) | Night wide, monitor+arm magic assembly | Regenerated ×3 — v3 restores original blocking (laptop ON bed, back to camera, desk behind) |
| 22 (22) | Peek smile | **S** |
| 23 (23) | UI lamp cursor | Screen recording |
| 24 (24) | Night wide, white lamp lights up | Regenerated — v4 is a surgical edit ON TOP of cut21-v3 for guaranteed consistency |
| 25-a/b (25-1/2) | Starry-eyed joy → focus | **S** — a=start b=end |
| 26-a/b/c (26) | House timelapse day/sunset/night | **S** — chained gen: day→sunset (start/end), sunset→night. Inpainted to number 25 + detail alignment |
| 28 (28-1) | Sleeping + Z | **S** |
| 29-a/b/c (28-2/3/4) | Slow wake → startled → turn | **S** — same framing ×3. a=start, c=end, b=mid-beat reference |
| 30 (29) | Completed white desk reveal | **S** — tilt-up arrival frame (end). Start frame (back of head, low angle) via end_image-only gen |
| 31 (30) | Monitor arm mounted + joy | **S** ⚠ — 0.5s empty-frame open handled in prompt |
| 32 (31) | White lamp + awe | **S** ⚠ |
| 33 (32) | Front of desk, starry eyes | **S** ⚠ proportion check |
| 34 (33) | Bokeh starry close-up | **S** |
| 35 (34) | Back-view survey wide | **S** ⚠ proportion check — zoom-out start frame |

## Consistency issues found (fix status)

1. **House number conflict**: front/cut26 = 15 vs entrance/cut01/cut02 = 25.
   → Unified to **25** (inpainted, done).
2. **cut07/08/09 character drift** → regenerated (done).
3. **cut21/24 room deviation** (different raftered room) → regenerated on the
   room-night asset; v3/v4 restore the original blocking (2026-08-09).
4. **cut26 detail drift across the 3 frames** (window/roof) → aligned to the
   day frame (done).
5. **Monitor color**: failure cuts use a black monitor+stand; magic (21) and
   completion (30+) use white — confirmed intended: the simulator swapped the
   theme to white.
6. **Head-count proportion drift (Dongkyu's note)**: full-body cuts oscillate
   3-head ↔ tall. Cause: inconsistent body wording per prompt. Fix: ASSETS.md
   triple lock. **Even S-graded full-body cuts get demoted to R if they fail
   the sheet comparison** — inpainting proportions is forbidden, regenerate.
