# DERO Brand Film

Production canon for the DERO brand film. Epic `DERO-523`.
**All docs in this folder are written in English** (Dongkyu's instruction,
2026-08-09).

| File | Content |
|---|---|
| `STORY.md` | 12-scene narrative structure, emotional beats, feature-failure mapping |
| `ASSETS.md` | Asset locks: tag dictionary, character descriptor, Style Prefix |
| `SHOTLIST.md` | 45 units → 30-shot merge plan, prompt conversion rules, UI-cut policy |
| `CONCEPTS.md` | 51-image concept catalog with per-cut verdicts |
| `PROMPTS.md` | Per-scene GEO + all 30 Seedance shot prompts + media mapping |

Production system: `.claude/skills/cinedance/` (Seedance 2.5, min 4s,
omni_reference).

## Media is not in the repo

`concepts/` (186MB) and `shots/` (60MB) are **gitignored** — the repo would
double in size. They live locally and on Higgsfield; every frame and shot in
this file carries its media id / job id, so a fresh checkout re-fetches them
via `show_medias` / `show_generation_by_ids` rather than cloning them.
The docs are the canon; the media is a build artifact of the prompts here.

## Remaining work (Jira)

| Ticket | Work |
|---|---|
| `DERO-525` | shots 31·32 render (blocked on a cut31/32 proportion check) |
| `DERO-526` | verdicts on the 13 shots still marked "verdict pending" below |
| `DERO-527` | shot 23 screen recording (human) |
| `DERO-528` | cut 36 logo motion graphics (human) |
| `DERO-529` | edit and assemble the final cut |

## Decision log

- ✅ **Style**: whole film in the 4.5-head stylized proportion of sheet v2 (`asset-character-turnaround-v2.png`, 2026-08-09 — v1 3-head chibi retired).
  All "Pixar-like" wording from the dump replaced (2026-08-09).
- ✅ **Outfit**: per sheet — oatmeal cream hoodie + dark charcoal-gray baggy
  pants + beige slip-ons.
- ✅ **UI/logo cuts — REVISED** (Dongkyu, 2026-08-09): 17/18/20 are now
  GENERATED (start frame = UI concept still + text-freeze constraint, camera
  locked, only glow/cursor moves). 23 + ending logo card remain screen
  recording / motion graphics (human task).
- ✅ **Merge plan**: Dongkyu's new cut numbering (01–35) matches the merge plan
  — new numbers are canonical. Exception: cut 15 unmerged (angles differ).
- ✅ **51 concept images** preserved in `concepts/`.
- ✅ **House number unified to 25** — inpainted (house-front, cut26 ×3).
- ✅ **cut21/24 regenerated** as night variants on the room asset.
- ✅ **Monitor black→white = simulator theme swap, confirmed intended.**
- ✅ **Character LOCKED** (2026-08-09, stress test #2 10/10 approved) — element
  `bruni` (1671536f) + new vocabulary (clay banned, polished render, realistic
  prop materials). Output in `concepts/stress2/`. Round 1 (clay look)
  discarded, kept in `concepts/stress/` for reference.
  Defaults: plain unbranded (laptop/box) / dark blank screen / no text on
  hoodie / no motion vocabulary.

## Image work queue — ✅ done (2026-08-09, output in `concepts/fixed/`)

1. ✅ Element `bruni` + stress tests (round 2 passed).
2. ✅ Inpaints: house-front-25 / cut26-a·b·c-25 / cut01-start (box removed) ·
   cut01-end (truck removed, number re-fixed once) / cut02-start (door + box).
3. ✅ Regenerations: cut07/08/09 (on-sheet character) / cut03 / cut21·24
   (night room unified layout) / room-night (night room asset).
4. ✅ **cut21/24 v3–v4 rework** (2026-08-09, Dongkyu's note): v2 had broken the
   blocking (laptop in lap). Restored original blocking — laptop ON the bed,
   protagonist at the bed foot with her back to camera, magic at the desk
   behind her. Room structure/materials kept from room-night.
   cut21 v3 = job 07dbd741. cut24 v4–v5 = surgical edits on top of cut21-v3
   (adds lit white lamp; boxes/parts/room match exactly), resolving the
   box-inconsistency note on v3. cut24 final = v5 (job 04f676fe).
   Known limit: the VESA plate still shows a small gap to the monitor rear —
   two edit passes failed to seat it (model resists); same gap exists in
   cut21 (mid-assembly there, so consistent). The video prompt states
   "already mounted"; fix in post only if it reads badly in motion.
5. ✅ **v2 rework round (2026-08-09, Dongkyu's verdicts)**: cut02-start-v2
   (job 3df7fb80 — box moved from doorstep to front gate, matching cut01-end
   continuity), cut03-new-v2 (job a8c8dcb5 — canonical room geometry: door on
   the door wall opposite the window, desk wall centered, window frame-right),
   room-night-v2 (job ce46da8c — single continuous ceiling, vertical-seam
   artifact removed). v1s of these three are discarded. PROMPTS.md updated:
   GEO_ENTRANCE box position, Shot 02 first frame/camera/action (walks to the
   gate now — 5s is tight, consider 6s), Shot 03 first-frame geometry, media
   mapping rows 02/03.
6. Notes: cut01's true frame one is house-front-25 (no truck, no box);
   cut01-start (truck only) is a mid keyframe. Tiny stray print on the
   cut01-end box — negligible at video scale.

## Shot renders

S1 (shots 01–03) **passed** (Dongkyu, 2026-08-09). Image verdicts same day:
sheet A group 12 + B group 7 + v2 rework 3 all passed.

Local copies in `shots/`. seedance_2_5 · omni_reference · 720p · 16:9.
Element note: character locked as element `bruni` (auxiliary); in MCP video
calls elements can't be attached — the actual lock is descriptor verbatim +
turnaround sheet as image reference, locations lock via asset-sheet references
+ GEO text (= web UI @tag equivalent).

| Shot | File | Job | Notes |
|---|---|---|---|
| 01 | shot01-v1.mp4 | 4c2649f0 | 6s, start cut01-start / end cut01-end |
| 02 | shot02-v1.mp4 | a2ce073d | 5s, start cut02-start-v2 + turnaround ref. First submit failed (no reason given), retry passed |
| 03 | shot03-v1.mp4 | 43732f94 | 5s, start cut03-new-v2 + turnaround ref |
| 04 | shot04-v1.mp4 | a43d9093 | 6s, start cut04-a / end cut04-b + turnaround ref. Passed |
| 05 | ~~shot05-v1.mp4~~ | 2292cc64 | retired — merged into 05+06 |
| 06 | ~~shot06-v1.mp4~~ | a28c95cc | retired — merged into 05+06 |
| 05+06 | ~~shot0506-v1.mp4~~ | 9753e26b | retired — after tape tear the box shell morphed into a different box (Dongkyu 2026-08-09). Keyframes cut0506-start (job cc2868e6) / cut0506-end (job 9958f94d) in fixed/ |
| 05+06 v3 | ~~shot0506-v3.mp4~~ | ea4cebdf | retired — flaps opened top/bottom against the vertical tape seam (Dongkyu 2026-08-09) |
| 05+06 v4 | shot0506-v4.mp4 | 5bfaf62f | 9s, start/end keyframes (media 24c80cf6 / a964c0e6) + turnaround ref. v4 prompt adds FLAP GEOMETRY block: vertical center seam → left flap opens LEFT, right flap opens RIGHT, never top/bottom; keeps v3's single-rigid-box + exactly-two-hands (bottom-edge entry) locks. Verdict pending |
| 07 | shot07-v1.mp4 | be99435b | 4s, start cut07-new + turnaround ref. Passed |
| 08 | ~~shot08-v1.mp4~~ | cee9a6f2 | 4s, start cut08-new + turnaround ref. superseded by v3 (character feel) |
| 08 v2 | ~~shot08-v2.mp4~~ | (unlogged) | retired — character feel wrong (Dongkyu 2026-08-09): smooth helmet hair, angry scowl vs desired look |
| 08 v3 | shot08-v3.mp4 | a4385079 | 4s, NO start image — 2 user-supplied reference frames (media 6e67bc17 / 10825f62, stop-motion-feel stills: curly loose strands, huge glossy eyes + lashes, fleece weave, sepia amber grade) as image_references with copy-face/hair/fabric/grading role phrase. Descriptor hair/eye lines + acting (focused, never scowl) + style line (handcrafted tactile detail) adjusted to match. Ref light-streak flares carried over. Verdict pending |
| 09 | shot09-v1.mp4 | a2cdaa73 | 4s, start cut09-new + turnaround ref. First submit failed silently, retry passed. Passed |
| 10 | shot10-v1.mp4 | 96e175ed | 4s, start cut10-a / end cut10-b + turnaround ref. Passed |
| 11 | shot11-v1.mp4 | d389b40f | 6s, start cut11-a / end cut11-b + turnaround ref. Passed |
| 11.5 | ~~shot115-v1.mp4~~ | ae97ed25 | retired (Dongkyu 2026-08-09): speed-streak lines followed the character's back — streaks were baked into start cut115-a + mood refs cut115-b/c, video model tracked them as scene elements |
| 11.5 v2 | shot115-v2.mp4 | 9a938652 | 8s, start cut115-a-v2 (NBP streak-removal edit, job 65475305) / end cut115-d (media 5c735605) + sheet v2 only (media ce2c9b69) — mood refs dropped. Dynamism via body speed + hair/drawstring whip + slipper skid; clean-air positive constraint. Verdict pending |
| 12 | ~~shot12-v1.mp4~~ | ae7ba3a2 | retired — 11→12 jump cut + prop mismatch (Dongkyu 2026-08-09): cut12-a/b had no monitor arm, cluttered desk vs sparse cut11 desk |
| 12 v2 | shot12-v2.mp4 | 669344c7 | 10s bridge one-take: start cut11-b → rises from chair, backs onto rug, sinks to knees → end cut12-b-v2 (job 3ab7befa, desk continuity-matched to cut11, image passed). **Passed** |
| 13 | shot13-v1.mp4 | debf2399 | 4s, start cut13 + turnaround ref (OTL spotlight gag). Passed |
| 14 | shot14-v1.mp4 | 92cf31fd | 4s, start cut14 + turnaround ref (glowing laptop wide). Passed |
| 15-a | shot15a-v1.mp4 | db1c95ff | 4s, start cut15-a + turnaround ref (noticing, wide). First submit failed on stale zero balance, resubmit after recharge passed. Passed |
| 15-b | shot15b-v1.mp4 | c1547217 | 4s, start cut15-b + turnaround ref (profile gaze). Passed |
| 16 | ~~shot16-v1.mp4~~ | 7ffbf536 | retired — she wasn't reading the laptop (Dongkyu 2026-08-09) |
| 16 v2 | shot16-v2.mp4 | a60a927e | 4s, start cut16 (re-uploaded as media 17ec4c7a) + turnaround ref — gaze locked DOWN on the laptop screen, never at camera. Verdict pending |
| 17 | shot17-v1.mp4 | c5c314b2 | 4s, start cut17 (media ecb8e19a), no sheet — DERO logo screen insert, sparkle orbit, text-freeze constraint. Generated per Dongkyu's revised decision (2026-08-09): 17/18/20 generated instead of screen recording; 23/ending still human. Verdict pending |
| 18 | shot18-v1.mp4 | def3a128 | 4s, start cut18 (media 155d72e0), no sheet — simulator UI alive (viewport light + cursor drift only), text-freeze constraint. Verdict pending |
| 20 | shot20-v1.mp4 | d04268ae | 4s, start cut20 (media 2171f146), no sheet — cursor drags selected monitor onto the arm, golden snap flash, text-freeze constraint. Verdict pending |
| 19 | shot19-v1.mp4 | 8f555fc5 | 4s, start cut19-a / end cut19-b + turnaround ref (surprise → operating). Passed |
| 21 | shot21-v1.mp4 | dcaaf387 | 4s, start cut21-new-v3 (re-uploaded as media c2de4bb8) + turnaround ref (night magic: arm self-assembly). Passed |
| 22 | shot22-v1.mp4 | c7e15bab | 4s, start cut22 + turnaround ref (peek → bright smile). Passed |
| 24 | shot24-v1.mp4 | 80e96190 | 4s, start cut24-new-v5 (re-uploaded as media b260366b) + turnaround ref (night magic: white lamp on). Passed |
| 25 | shot25-v1.mp4 | 9f627e42 | 4s, start cut25-a / end cut25-b + turnaround ref (joy burst → immersion). Verdict pending |
| 26-1 | ~~shot26-1-v1.mp4~~ | 548508fc | 4s, start cut26-a-25 / end cut26-b-25, no sheet (house timelapse day→sunset). retired — merged into 26 v2 |
| 26-2 | ~~shot26-2-v1.mp4~~ | e36ee578 | 4s, start cut26-b-25 / end cut26-c-25, no sheet (timelapse sunset→night). retired — merged into 26 v2 |
| 28 | shot28-v1.mp4 | 904bef37 | 4s, start cut28 + turnaround ref (sleep + Z). Verdict pending |
| 29 | shot29-v1.mp4 | 3cf597a8 | 4s, start cut29-a / end cut29-c + turnaround ref + cut29-b {REF_MOOD} (wake → startle → turn). Verdict pending |
| 30 | shot30-v1.mp4 | 38d402b4 | 4s, end cut30 only, no character refs (tilt-up desk reveal). Verdict pending |
| 26 v2 | shot26-v2.mp4 | (web, Dongkyu) | 8s merged one-take timelapse day→sunset→night, start cut26-a-25 / end cut26-c-25, cut26-b-25 mood ref. Replaces 26-1/26-2 (retired — awkward cut + camera mismatch). Passed (Dongkyu generated) |
| 33 | shot33-v1.mp4 | d879f290 | 4s, start cut33 (media 701afcf6, concepts/cut33.png — Dongkyu picked as base 2026-08-09) + turnaround ref. Blocking rewritten to the concept: behind-desk frontal, camera on desk-wall side, monitor rear to lens, proud gaze → clap + bounce. First submit 422 (mode omitted — omni_reference must be explicit in params). Verdict pending |
| 34 | shot34-v1.mp4 | 77f59bf1 | 4s, start cut34 (media bdd108e5) + turnaround ref (starry-eyed bokeh CU). First submit failed silently, retry passed. Verdict pending |
| 35 | ~~shot35-v1.mp4~~ | 2cf62647 | retired — old back-view zoom-out concept (6s, start crop 8fe84589 / end cut35-wide-v5 job a7e86412, keyframe iterations v2–v5 in fixed/). Superseded by Dongkyu's redefinition same day |
| 35 v2 | ~~shot35-v2.mp4~~ | c6abb642 | 8s REVISED concept (desk play → crane through ceiling → black): retired — rise too slow/linear, acting thin (Dongkyu) |
| 35 v3 | ~~shot35-v3.mp4~~ | 0addf6db | retired — accelerating rise OK but model pushed in, lost the cut35 wide framing (Dongkyu: 구도만 재작업) |
| 35 v4 | shot35-v4.mp4 | 56f15f80 | **Passed** (Dongkyu 2026-08-09). 8s: exact cut35 wide framing locked 0–3s (desk play: console tilt·keyboard rhythm·clap·bounce), accelerating vertical rise from 0:03 (slow→rapid), ceiling crosses lens ~6.7s, solid black hold to 8s. start cut35 (media 5b945963) / end black 1280x720 (media fe148e4a) + sheet ref |

Session-independent generation state (2026-08-09, so a fresh session skips
re-uploads — a job_id also works directly as a media value):
- Higgsfield media ids (8-char prefixes are NOT usable as media values — resolve
  the full UUID via show_medias first; turnaround full id:
  983f7e53-f228-4d5b-9854-97e2a60ed793): turnaround sheet 983f7e53 · room-9views fb445403 ·
  room-topview fa727800 · cut01-start faf4f2bc · cut01-end d44d93fd ·
  cut02-start(v1) 29fa8e91 · cut04-a a218c370 · cut04-b 1a9ef066 ·
  cut05 1512e872 · cut06-a d691ee68 · cut06-b 7ac89211 ·
  cut07-new 20708b08 · cut08-new 3ee14844 · cut09-new db40a36d ·
  cut10-a 8c2e13e4 · cut10-b 7fcc4da7 · cut11-a 0926b1c8 · cut11-b d39ce153 ·
  cut12-a 28d627b9 · cut12-b a7d8c708 · cut13 77e9fb04 · cut14 73f570cf ·
  cut15-a 5a2f274e · cut15-b b6c7df2f · cut16 9f952594
- Video submits: always pass declined_preset_id 24bae836-2c4a-48e0-89b6-49fcc0b21612
  (a preset recommendation otherwise intercepts the batch).
- Credits recharged 2026-08-09 (balance 537.5 after refill); 4s 720p video =
  26 credits (6.5/s), nano image edit = 2.
- Next up: ⚠pending 31·32 (need Dongkyu proportion check of cut31/32 first —
  fail → demote to {REF_MOOD}). 33 delivered (shot33-v1, cut33.png base picked
  by Dongkyu 2026-08-09, verdict pending). 34 done. 35 done+passed (v4,
  2026-08-09 — cut35 proportion approved as the target look in the process).
  That closes the generated set; 27 = edit fade, 23/ending(36) = human task.
- Media id: cut33 701afcf6-262b-4347-b7e5-fe9633260f7d.
- Media ids (cut35/36 round): cut35 5b945963-5229-47d3-950b-a4871b14e2cc ·
  black-720 fe148e4a-b94f-45b1-941a-75b3fa86cd4c ·
  cut35-start-crop (old zoom-out concept) 8fe84589-cfde-4706-a443-b8a852d41fb9.
- Media ids (17/18/20/16v2/34 round): cut17 ecb8e19a-3bf3-454d-8a95-c68eb76bf4ab ·
  cut18 155d72e0-aca3-471b-bc73-714834f1eef9 ·
  cut20 2171f146-7c25-40d7-b520-2695c07a11aa ·
  cut16 (re-up) 17ec4c7a-292f-47c2-8f50-4766f2d1fd47 ·
  cut34 bdd108e5-4a97-406e-9ad4-44f0b3315372.
- 8-char id prefixes in this README are NOT valid media/job values — resolve
  via show_medias or re-upload the local file (021/024 trap, 2026-08-09).
- Shots S1–16 and 19·21·22·24 all passed (Dongkyu 2026-08-09).
  25·26-1·26-2·28·29·30 delivered, verdict pending.
- Media ids added this round: cut19-a 0565c5db · cut19-b 880fbeec ·
  cut22 9aa02637 · cut21-new-v3 c2de4bb8 · cut24-new-v5 b260366b.
- Media ids (25–30 batch, full UUIDs): cut25-a 223f0729-a8fa-4db6-a97c-42ac6a7bad21 ·
  cut25-b 45086bed-8e30-4b01-bdb5-6a9e58b2cdc1 ·
  cut26-a-25 823b9880-162b-469d-882d-8b963d87984b ·
  cut26-b-25 6c3156a3-84ef-408b-9f94-84eb66f16b13 ·
  cut26-c-25 b9866f15-664f-4ed4-8100-94d7f4a613ef ·
  cut28 cf34c4c0-0e7c-4fe9-9c66-f4b819dea85f ·
  cut29-a 546c7d36-2705-4ea9-81b5-77429526dc04 ·
  cut29-b af5f7f2f-1238-410d-8f47-f30a97b07f0f ·
  cut29-c 75137e86-eae6-467e-a533-e4ec0ab8936e ·
  cut30 62d82dc0-9d6a-45ab-b8ea-307b2166dba9.
- Shot 04 verdict is implicit-pass only (never explicitly ruled) — confirm
  when convenient.

Known trap: seedance_2_5 submits fail silently (no error body) roughly 1 in 3
jobs — always retry once with identical params before touching the prompt.

## Next steps

0. ✅ cut21-v3 and cut24-v5 **passed** (Dongkyu, 2026-08-09). These two are
   final; earlier v2 night frames are discarded.
0.5. **Cut 35/36 redefined + DONE (Dongkyu, 2026-08-09)**: shot 35 **passed**
   as shot35-v4.mp4 (see table) — desk play → accelerating rise through the
   attic ceiling → solid black. Cut 36 = DERO logo card emerging FROM BLACK,
   **motion graphics (human task)**. MG handoff: shot 35 ends on pure black
   (last-frame lock = `black-720.png`, media fe148e4a) so cut 36 opens from
   the same black — logo fades/sparkles in, then slogan. Style ref:
   `fixed/cut36-card-v1.png` (logo look + slogan typography, glyphs verified).
   Slogan: 마음대로 원하는대로. Logo source look: cut17 (media ecb8e19a).
1. Dongkyu's remaining visual verdicts: the other fixed images +
   the 6 ⚠pending full-body cuts (12/13/31/32/33/35) proportion check.
2. Batch video generation scene by scene (from S1) → verdict → post.
3. UI/logo 5 cuts (17/18/20/23/ending): screen recording + motion graphics
   (human task).
