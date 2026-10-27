# Shot List — 45 original generation units, organized + merge plan

Seedance 2.5 constraint: **minimum 4s**. The original 0.5–3s cuts cannot be
generated as-is. Two strategies: ① consecutive actions in one composition are
**merged** into one shot (expressed as beats) ② independent angles are
generated at 4s and **trimmed in edit**. Editing already assumes trimming
0.5s off both ends (§8) — trims are not waste.

## Cut inventory

| # | Original cut | Content | Original length | Handling | Gen |
|---|---|---|---|---|---|
| 1 | 01 | House exterior descent, truck delivery | 5–6s | as-is | 6s |
| 2 | 02 | Front door, protagonist picks up package | 4–5s | as-is | 5s |
| 3 | 03 | Room entry, box-pile reveal | — | as-is | 5s |
| 4 | 04+05 | Expectant close-up → bokeh → hand rubbing | 3–4s + 2–3s | **merge** (same background, continuous emotion) | 6s |
| 5 | 06-1 | Top-down: box placed | 3–4s | as-is | 4s |
| 6 | 06-2+06-3 | Top-down: tape tear → hands in | 2–3s ×2 | **merge** (same locked framing) | 5s |
| 7 | 07-1 | Monitor-arm parts spread | 1s | 4s gen → trim | 4s |
| 8 | 07-2 | Clamp tightening | 1s | 4s gen → trim | 4s |
| 9 | 07-3 | VESA plate | 1s | 4s gen → trim | 4s |
| 10 | 07-4 | Monitor slips (mount failure) | 4s | as-is. **08 duplicates 07-4 — deleted** | 4s |
| 11 | 09 (+10) | Lamp on → color-temp disappointment | 6s | as-is. **10 had no prompt — absorbed into 09** | 6s |
| 12 | 11+12 | Staring at mismatched desk → deep frustration | — + 6s | **merge** (same locked framing, one emotion curve) | 8s |
| 13 | 13 | OTL spotlight (chibi gag) | 3s | 4s gen → trim | 4s |
| 14 | 14-1 | Laptop screen lights up (wide) | 1.5s | 4s gen → trim | 4s |
| 15 | 14-2+15 | Notices → approaches, profile gaze | 1s + 1.5s | angles differ → separate 4s each | 4+4s |
| 16 | 16 | Peeking eyes close-up | 1.5s | 4s gen → trim | 4s |
| 17 | 17 | Laptop screen: DERO logo | 3s | **screen-record + motion graphics instead** | 0 |
| 18 | 18 | Laptop screen: simulator UI reveal | 1.5s | **same** | 0 |
| 19 | 19-1+19-2 | Surprise → starts operating (same profile framing) | 1s + 1s | **merge** | 4s |
| 20 | 20 | UI: monitor select/adjust | 1.5s | **screen recording instead** | 0 |
| 21 | 21 | Magic: monitor arm self-assembles (wide) | 2s | 4s gen → trim | 4s |
| 22 | 22 | Peek → bright smile | 1–1.5s | 4s gen → trim | 4s |
| 23 | 23 | UI: lamp cursor hover | 1.5s | **screen recording instead** | 0 |
| 24 | 24 | Magic: lamp turns on + golden rim (wide) | 2s | 4s gen → trim | 4s |
| 25 | 25-1+25-2 | Joy burst → immersion (same peek framing) | 1.5s + 1s | **merge** | 4s |
| 26 | 26-1~3 | House timelapse day→sunset→night | 4s | chained: day→sunset, sunset→night | 4+4s |
| 27 | 27 | Blackout | 2.5s | **no gen — edit fade** | 0 |
| 28 | 28-1 | Sleeping + Z | 4s | fade-in handled in edit | 4s |
| 29 | 28-2+28-3+28-4 | Slow wake → startled → turns around | 1+0.5+0.5s | **merge** (same framing) | 4s |
| 30 | 29 | Back of head → tilt-up desk reveal | 2.5s | 4s gen → trim | 4s |
| 31 | 30 | Monitor arm check + joy | 1.5s | 4s gen → trim | 4s |
| 32 | 31 | Lamp check + awe | 1.5s | 4s gen → trim | 4s |
| 33 | 32 | Front full view, joy | 1s | 4s gen → trim | 4s |
| 34 | 33 | Starry-eyed happy close-up | 1.5s | 4s gen → trim | 4s |
| 35 | 34 | REVISED (2026-08-09): desk play → accelerating rise through ceiling → black | 3s | 8s gen, black tail = bridge to 36 | 8s |
| 36 | End logo | DERO logo + slogan, emerging from black | 4s | **motion graphics instead** (style ref: fixed/cut36-card-v1.png) | 0 |

**45 units → 30 generated shots (~130s of source) + 6 edit/composite items.**

## Prompt conversion rules (applied when rewriting)

1. **Discard negative prompts** — Seedance ignores or inverts negation (§4).
   Convert critical bans to positives: "no multiple packages" → "exactly ONE
   package box", "no people" → "the street is empty, the house is the only
   subject". Fix counts in the QUALITY block.
2. **Delete duration/resolution/fps/aspect from prompt bodies** — parameters
   only. Also kills the original "1920x1080 (720p)" contradiction.
3. **Drop Korean/English duplication** — keep English only.
4. **Replace character/location wording with the locked descriptors** —
   per-cut variations (cream/beige etc.) were the drift cause.
5. **Insert GEO SPATIAL LAYOUT per scene** — especially room scenes
   (S2·S6·S8·S10·S11): bed side, desk position, window, locked camera axis.
6. **First 1 second of a scene's first shot is a locked placement wide** (§3)
   — critical in the S8 intercut scene.
7. The original per-second beat timings are **kept** — ported into ACTION
   TIMING blocks. That was the original dump's strength.

## UI/logo cuts (17, 18, 20, 23, ending)

Generative models cannot render Korean UI text/logo typography stably (it
smears every frame). Decision: **record the real DERO screen** and composite
onto the laptop screen in post (screen insert); the logo end card is motion
graphics. Honest advertising too — it is the real product screen. Cuts 21/24
(reality-reflection magic) stay generated.
