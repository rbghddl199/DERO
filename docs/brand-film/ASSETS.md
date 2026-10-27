# Asset Lock (Stage 0) — extracted from the original prompt dump

## Image grading rule (locked 2026-08-09)

Per-cut images we hold are rough **concepts**, not precise stills. Feeding a
concept as `start_image` makes Seedance inherit its defects as frame one
(this actually happened). Three grades only:

| Grade | Use | Seedance input |
|---|---|---|
| Concept image (as delivered) | Mood/layout reference | `image_references` + role-limiting phrase, or not used |
| Locked asset sheet | Fix character/location/prop identity | `image_references` (role naming mandatory) |
| Verified first frame | Fix composition | `start_image` (merged shots also get `end_image`) |

- Role-limiting phrase for concepts is mandatory: "for mood and spatial layout
  reference — do not use as a starting frame, do not inherit the composition,
  the angle, or the color."
- If a shot needs the composition too: concept → generate a proper first frame
  with an image model → fix defects at the image stage → only then promote to
  start_image. Iterate in images, never in video.

Status: **character LOCKED** (see below). Video generation before a full lock
is forbidden (PRODUCTION.md §9-1).

## Tag dictionary

| Tag | Asset | State variants |
|---|---|---|
| `@bruni` | Protagonist (top bun, cream hoodie, dark gray pants, slip-ons) | Expressions via acting directions; outfit invariant |
| `@loc_house` | House exterior (beige walls, orange roof, wooden fence, arched windows) | `_day` / `_sunset` / `_night` |
| `@loc_room` | Attic bedroom + desk (bed, desk, arched window) | `_day` / `_night` / `_morning` / `_boxes` / `_messy` / `_final` (white theme) |
| `@loc_entrance` | Front door (wooden door, plants, mailbox) | — |
| `@prop_box` | Delivery box (with packing paper) | closed / opened |
| `@prop_monitor` | Monitor + monitor arm (black) | separate / mounted |
| `@prop_lamp_blue` | Failed lamp (cold blue-white) | — |
| `@prop_lamp_white` | Replacement lamp (white LED bar) | off / on |
| `@prop_laptop` | Laptop | off / DERO screen |
| `@ui_dero` | DERO simulator screen (project "Brunchies", right quote panel) | logo / editor |

## Character descriptor (`@bruni`) — LOCKED v2 (2026-08-09, proportion revision approved by Dongkyu)

Sheet: `concepts/asset-character-turnaround-v2.png` (FRONT/3-4/SIDE/BACK,
job 5d7940ab, nano banana pro 2K). v1 3-head chibi sheet
(`asset-character-turnaround.png`) **retired** — renders came out squat and
plump. New canon: ~4.5-head stylized proportion matching Dongkyu's reference
still. `asset-character-expressions.png` stays valid for acting/expression
NAMES only — never as a proportion reference (old 3-head body).

Locked descriptor (verbatim in every prompt):

```
a cute stylized 3D character with approximately 4.5-head-tall proportion — a
charmingly large head on a clearly longer slim body, slender arms and legs,
small hands, narrow shoulders — smooth polished 3D animation render, soft
matte skin, brown hair in a braided top bun with loose side strands, large
dark brown eyes with catch-lights, rosy cheeks, wearing an oatmeal cream
hoodie with drawstrings, dark charcoal-gray baggy pants, and beige slip-on
shoes
```

- **Proportion-drift triple lock** (2026-08-09, v2):
  ① Repeat the descriptor above verbatim in every image and video prompt.
  ② Sheet reference role phrase names the proportion: "@bruni turnaround for
  character identity — copy the face, hair, outfit AND the exact 4.5-head
  slim body proportion from this sheet."
  ③ Higgsfield element registration — auxiliary only, never used without ①②.
- Banned both directions (proportion contamination): **chibi, 3-head,
  stubby, head as large as the torso** (squat drift) AND **realistic adult
  proportions, 6-head or taller, young woman / girl standalone** (tall
  drift). "Pixar-like" allowed only for render texture wording.
- **Full-body shot reading as 3-head-squat or 6-head-realistic = NO
  inpainting, regenerate immediately.** Proportions cannot be spot-fixed.
- Never write age in any language — roles/costume/behavior instead.
- Expressions come from the 10-expression sheet (anticipation, surprise,
  joy 1–3, pondering, disappointment, frustration, discovery, satisfaction),
  specified in the CHARACTER ACTING block.
- Note: PRODUCTION §1 recommends a headless full-body front sheet — ours keeps
  the head. If wide-shot face drift appears, generate a headless variant.

## Style Prefix — LOCKED

Every prompt, verbatim, at the end:

```
Style: cute high-quality 3D animated film render, smooth polished surfaces,
polished family-animation look. The character has soft matte skin and
stylized 4.5-head proportions. Furniture, products and rooms have realistic
materials — natural
wood grain, matte plastic, brushed metal, woven fabric — rendered in the same
warm cinematic lighting. Warm painterly color grading.
Lighting: soft motivated light, single light source per scene, clean shadows.
Camera: smooth and stable.
Physics: gravity respected, correct contact shadows, no floating props.
Continuity: characters, props, environment identical across every cut.
Audio: environmental SFX only. No music. No subtitles.
```

- Screen/packaging defaults: laptops and monitors are "plain unbranded, dark
  blank screen" (unless content is specified); delivery boxes are "plain
  unbranded cardboard box with no printing" — stress test #2 produced a fake
  logo (#2) and a coding screen (#8). Element `bruni`'s description still says
  "clay-toy texture" — prompts win so far, but if clay leaks again, recreate
  the element.
- (2026-08-09) **"clay" vocabulary fully banned** — clay/claymation/plasticine
  anywhere in a prompt turns characters AND furniture into plasticine dolls
  (reason stress test #1 was discarded entirely). Target look is the smooth
  polished 3D animation render of the original concepts.
- Night scenes / laptop-glow scenes specify light in the LIGHTING block per
  shot (the Prefix itself never changes).
- All "1920x1080 (720p)" / "60fps" / duration notes from the original dump are
  deleted — set via parameters (skill rule).
