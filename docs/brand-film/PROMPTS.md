# Seedance Video Prompts — 30 Generated Shots (2026-08-09)

Common generation parameters: model `seedance_2_5`, mode `omni_reference`, **720p**, aspect 16:9.
Duration is per shot. Never write duration/resolution/fps in prompt bodies (skill rule).

## Substitution constants (inserted verbatim at generation time)

`{BRUNI}` — locked character descriptor from ASSETS.md (v2, 4.5-head, 2026-08-09):

```
a cute stylized 3D character with approximately 4.5-head-tall proportion — a
charmingly large head on a clearly longer slim body, slender arms and legs,
small hands, narrow shoulders — smooth polished 3D animation render, soft
matte skin, brown hair in a braided top bun with loose side strands, large
dark brown eyes with catch-lights, rosy cheeks, wearing an oatmeal cream
hoodie with drawstrings, dark charcoal-gray baggy pants, and beige slip-on
shoes
```

`{STYLE}` — locked Style Prefix from ASSETS.md (end of every prompt):

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

`{REF_BRUNI}` — character-sheet image_reference role phrase (sheet =
asset-character-turnaround-v2.png, job 5d7940ab):

```
@bruni turnaround sheet for character identity — copy the face, hair, outfit
AND the exact 4.5-head slim body proportion from this sheet.
```

`{REF_MOOD}` — when a concept image is used as mood reference only:

```
for mood and spatial layout reference — do not use as a starting frame, do not
inherit the composition, the angle, or the color.
```

## GEO SPATIAL LAYOUT (per scene, inserted unchanged)

`{GEO_HOUSE}` — S1·S9 (house exterior):

```
GEO SPATIAL LAYOUT (locked across every shot — pure spatial map):
— A two-story cottage with beige stucco walls, a terracotta tiled roof and
  arched windows. A house number plate reading "25" hangs beside the front door.
— A low wooden fence runs along the front of the house; a paved street runs
  left-to-right in front of the fence.
— The front door is at ground level, centered on the facade.
— Camera stays on the street side, facing the front of the house. It never
  crosses the fence line.
```

`{GEO_ENTRANCE}` — S1 cut 02 (entrance):

```
GEO SPATIAL LAYOUT (locked — pure spatial map):
— A wooden front door centered in a beige stucco wall, potted plants on both
  sides of the doorstep, a mailbox at camera-left of the door.
— The house number plate "25" hangs beside the door.
— A low wooden front gate stands open at the street end of the paved walkway
  that leads to the door.
— Exactly ONE cardboard box sits on the paved walkway directly in front of the
  open front gate — where shot 01 left it. It is NOT on the doorstep.
— Camera stays outside the door, facing it. It never enters the house.
```

`{GEO_ROOM_DAY}` — S2·S4–S7 (attic room, day):

```
GEO SPATIAL LAYOUT (locked across every shot — pure spatial map):
— ATTIC BEDROOM: rectangular room, slanted beige plaster ceiling, warm wood
  floor, a round terracotta rug at the room center.
— WINDOW WALL: one arched window with wooden shutters, centered on this wall;
  a rustic wooden console table stands directly under the window.
— BED WALL (camera-right when facing the window): a wooden bed with
  terracotta-orange bedding, headboard against this wall; a small wooden
  nightstand with a warm amber lamp stands between the bed and the window corner.
— DESK WALL (opposite the bed): one long rustic wooden work desk against this
  wall — exactly ONE desk on this wall.
— DOOR WALL (opposite the window): a wooden door.
— Daylight enters only through the arched window.
— 180° AXIS: camera stays inside the room on the door-wall side unless the shot
  states otherwise. It never crosses the window wall.
```

`{GEO_ROOM_NIGHT}` — S8 magic cuts 21·24 (night, original blocking restored per Dongkyu's note, 2026-08-09):

```
GEO SPATIAL LAYOUT (locked across every shot — pure spatial map):
— The same ATTIC BEDROOM at night: arched window showing a starry night sky.
— The wooden bed with terracotta-orange bedding fills frame-left; a warm amber
  lamp glows on the wooden shelf above the headboard.
— The character sits on the wooden floor at the foot of the bed, back fully to
  camera, using a glowing laptop that rests ON the bed mattress in front of her.
— The rustic wooden work desk stands in the midground center-right, BEHIND her
  back — this desk holds the new white setup as it assembles.
— The amber shelf lamp and the laptop screen are the only warm practical
  lights (plus the new white desk lamp once it turns on).
— Camera stays behind the character, looking past her toward the desk. It
  never crosses to the window side, and she never turns to face camera.
```

`{GEO_ROOM_MORNING}` — S10·S11 (morning, completed white desk):

```
GEO SPATIAL LAYOUT (locked across every shot — pure spatial map):
— The same ATTIC BEDROOM in the morning. Soft morning daylight enters only
  through the arched window.
— The completed WHITE DESK SETUP stands against the desk wall: a white desk,
  a white monitor held by a black monitor arm, a white LED bar lamp, a white
  ergonomic chair, a wooden dresser at camera-right of the desk, a cream
  armchair at camera-left.
— The bed with terracotta-orange bedding is on the opposite wall.
— Camera stays between the bed and the desk, facing the desk wall, unless the
  shot states otherwise.
```

Top-down unboxing (S3) and close-up cuts frame only the desk surface — GEO omitted, replaced by anchor sentences.

## Media mapping

| Shot | start_image | end_image | image_references |
|---|---|---|---|
| 01 | cut01-start | cut01-end | — |
| 02 | cut02-start-v2 (job 3df7fb80) | — | sheet {REF_BRUNI} |
| 03 | cut03-new-v2 (job a8c8dcb5) | — | sheet |
| 04 | cut04-a | cut04-b | sheet |
| 05+06 | cut0506-start (job cc2868e6) | cut0506-end (job 9958f94d) | merged 9s one-take (2026-08-09, Dongkyu): bigger box, monitor arm visible inside. cut05/cut06-a/b retired |
| 07 | cut07-new | — | sheet |
| 08 | cut08-v2 (job f81b1eca, first 4.5-head-era frame) | — | sheet v2 — video job 19c9034f (2026-08-09); cut08-new retired (3-head) |
| 09 | cut09-new | — | sheet |
| 10 | cut10-a | cut10-b | sheet |
| 11 | cut11-a | cut11-b | sheet |
| 11.5 | cut115-a-v2 (job 65475305, streak-free NBP edit) | cut115-d (media 5c735605) | sheet v2 only (media ce2c9b69) — v2 2026-08-09: cut115-b/c mood refs DROPPED (baked-in speed streaks tracked the character in v1); dynamism moved to body/hair/drawstring motion |
| 12 | cut11-b (d39ce153) | cut12-b-v2 (job 3ab7befa) | sheet — v2 bridge take 10s (2026-08-09): cut12-a/b retired for prop discontinuity (no monitor arm, cluttered desk); cut12-b-v2 = surgical edit matching cut11 desk, image passed |
| 13 | cut13 (77e9fb04) | — | sheet — proportion check passed 2026-08-09, promoted |
| 14 | cut14 | — | sheet |
| 15-a | cut15-a | — | sheet |
| 15-b | cut15-b | — | sheet |
| 16 | cut16 | — | sheet |
| 19 | cut19-a | cut19-b | sheet |
| 21 | cut21-new-v3 (job 07dbd741) | — | sheet |
| 22 | cut22 | — | sheet |
| 24 | cut24-new-v5 (job 04f676fe) | — | sheet |
| 25 | cut25-a | cut25-b | sheet |
| 26-1 | cut26-a-25 | cut26-b-25 | — |
| 26-2 | cut26-b-25 | cut26-c-25 | — |
| 28 | cut28 | — | sheet |
| 29 | cut29-a | cut29-c | sheet, cut29-b {REF_MOOD} |
| 30 | — | cut30 | not room-night — {GEO_ROOM_MORNING} only |
| 31 | ⚠pending cut31 | — | sheet |
| 32 | ⚠pending cut32 | — | sheet |
| 33 | cut33 (media 701afcf6) | — | sheet — Dongkyu picked cut33.png as the base (2026-08-09); blocking rewritten to match it (behind-desk frontal, camera on the desk-wall side) |
| 34 | cut34 | — | sheet |
| 35 | ⚠pending cut35 | — | sheet |

⚠pending = full-body original concept awaiting Dongkyu's proportion check
against the sheet. Pass → start_image; fail → demote to {REF_MOOD} and
generate without a start image (descriptor + sheet lock the character). A
bad-proportion start contaminates frame one — never feed it (ASSETS.md triple
lock).

Job IDs of the fixed/ renders: see README / conversation log — a job_id can be
used directly as a media value.

---

## Shot prompts

Insert `{STYLE}` at the end of every prompt. Shots featuring the character insert `{BRUNI}` right after SCENE CONTEXT.

### Shot 01 — House exterior, truck delivery (6s)

```
SCENE CONTEXT — EXACT 0 CHARACTERS VISIBLE, NO PEOPLE.
A small delivery truck drives along the street in front of a cottage, stops,
and leaves exactly ONE plain unbranded cardboard box with no printing at the
front gate, then drives away. The street is empty except for the truck; the
house is the only building subject.

{GEO_HOUSE}

FIRST FRAME AND SPATIAL BLOCKING
The first visible frame shows the full front of the cottage with the number
plate "25" readable, and the truck already entering from frame-left on the
street. No empty establishing frame.

FORMAT MODE: single continuous take, real-time motion.

OPTICS: 84° diagonal field of view, classic wide-angle lens character, camera
across the street from the house. Environment visible to the frame edges,
straight architectural lines stay rectilinear.

CAMERA: camera starts slightly high and glides down slowly to street level
while holding the whole house in frame. Smooth and stable.

ACTION TIMING
0:00–0:02 — the truck rolls in from frame-left and slows in front of the gate.
0:02–0:04 — the box is set down at the gate; the truck's mass settles on its
suspension.
0:04–0:06 — the truck pulls away toward frame-right, leaving exactly ONE box
at the gate.

PHYSICS: the truck has vehicle mass and inertia; the box lands with a soft
thump and correct contact shadow.

LIGHTING: bright morning sun from high camera-left, warm and clear.

AUDIO: engine hum, tire roll on pavement, one soft cardboard thump. SFX only.

POSITIVE CONSTRAINTS: exactly ONE cardboard box, exactly ONE truck, zero
people in frame, the number plate always reads "25".

{STYLE}
```

### Shot 02 — Entrance pickup (5s)

```
SCENE CONTEXT — EXACT 1 CHARACTER — NO DUPLICATES.
{BRUNI}
The character opens the front door, spots the box waiting at the front gate,
walks down the path to it, picks it up with both arms, and turns back toward
the house with a bright expectant smile.

ACTIVE REFERENCES
{REF_BRUNI}

{GEO_ENTRANCE}

FIRST FRAME AND SPATIAL BLOCKING
The first visible frame shows the closed front door, the open front gate, and
exactly ONE plain unbranded cardboard box with no printing sitting on the paved
walkway directly in front of the gate opening. The character is not yet
visible; the door opens within the first second.

FORMAT MODE: single continuous take, real-time motion.

OPTICS: 47° diagonal field of view, standard normal lens character, natural
proportions.

CAMERA: fixed at chest height of the character, outside the gate, facing the
front door straight on — the gate and the box in the near foreground, the door
beyond them.

ACTION TIMING
0:00–0:01 — the door opens inward; the character appears in the doorway.
0:01–0:03 — she spots the box at the gate, eyes widening with delight; she
comes down the steps and walks the path to the gate.
0:03–0:05 — she crouches and lifts the box with both arms, knees bending, body
counterweighting the load, and turns back toward the house.

PHYSICS: the box has visible weight; her posture leans back slightly to
balance it.

LIGHTING: soft morning daylight from camera-right, single source.

AUDIO: door creak, footsteps, cardboard shifting. SFX only.

POSITIVE CONSTRAINTS: exactly ONE character, exactly ONE box, the number
plate reads "25".

{STYLE}
```

### Shot 03 — Room entry, box-pile reveal (5s)

```
SCENE CONTEXT — EXACT 1 CHARACTER — NO DUPLICATES.
{BRUNI}
The character carries a cardboard box into her attic bedroom where a tall
stack of delivery boxes already waits, and looks up at the stack with sparkling
anticipation.

ACTIVE REFERENCES
{REF_BRUNI}

{GEO_ROOM_DAY}

FIRST FRAME AND SPATIAL BLOCKING
The first visible frame already contains the character stepping through the
open door at frame-left carrying ONE box — the door sits on the DOOR WALL
(opposite the window), never beside the window or the desk — the stack of
plain unbranded cardboard boxes beside the door at far frame-left, the long
rustic desk centered on the desk wall, and the arched window at frame-right
with the bed under it in the right foreground. The spatial relationship is
readable immediately in frame one.

FORMAT MODE: single continuous take, real-time motion.

OPTICS: 84° diagonal field of view, classic wide-angle lens character, deep
readable spatial context, straight lines stay rectilinear.

CAMERA: fixed wide from the bed-wall side of the room, holding door, window
and box stack in frame. First second is a locked wide with no camera move.

ACTION TIMING
0:00–0:01 — locked wide: the room layout reads clearly, the character mid-step
in the doorway.
0:01–0:03 — she walks two steps in and sets her box down gently at the base of
the stack, weight transferring heel to toe.
0:03–0:05 — she straightens up, looks up along the stack, clasps both hands
together, eyes shining with excitement.

PHYSICS: the stacked boxes stay perfectly still; the carried box settles with
a soft contact.

LIGHTING: warm daylight from the arched window, camera on the shadow side.

AUDIO: footsteps on wood, cardboard set-down. SFX only.

POSITIVE CONSTRAINTS: exactly ONE character, the box stack stays upright and
identical, no extra furniture appears.

{STYLE}
```

### Shot 04 — Anticipation close-up → hand rubbing (6s)

```
SCENE CONTEXT — EXACT 1 CHARACTER — NO DUPLICATES.
{BRUNI}
Close on the character's face glowing with anticipation in front of a soft
bokeh background of cardboard boxes; she rubs her palms together, ready to
start unboxing.

ACTIVE REFERENCES
{REF_BRUNI}

FIRST FRAME AND SPATIAL BLOCKING
The first visible frame is a chest-up close-up of the character centered in
frame, boxes dissolved into warm bokeh behind her. She faces camera, eyes
looking slightly past camera-left at the boxes.

FORMAT MODE: single continuous take, real-time motion.

OPTICS: 29° diagonal field of view, short telephoto portrait lens character.
Subject razor-sharp, background dissolves into creamy soft bokeh, the subject
pops clearly from the environment.

CAMERA: fixed at her eye level, no move. No part of this shot becomes
wide-angle coverage.

ACTION TIMING
0:00–0:02 — she gazes at the boxes, pupils bright with catch-lights, a smile
slowly spreading.
0:02–0:04 — she raises both hands into frame and rubs her palms together
briskly.
0:04–0:06 — she gives one determined nod, grin widening.

PHYSICS: hair strands and hoodie drawstrings sway naturally with her motion.

LIGHTING: warm window daylight from camera-right as the single source, soft
shadow on the opposite cheek.

AUDIO: soft palm-rubbing, a small eager breath. SFX only.

POSITIVE CONSTRAINTS: exactly ONE character, face stays identical to the
reference sheet, background stays bokeh.

{STYLE}
```

### Shot 05+06 — Top-down, big-box placement → tape tear → monitor-arm reveal (9s, merged 2026-08-09)

Merged one-take replacing the old shots 05 and 06 (Dongkyu: bigger box, monitor
arm visible inside). Keyframes cut0506-start / cut0506-end. Rendered
shot0506-v1.mp4 (job 9753e26b) — retired: after the tape tear the model peeled
the shell into a different box. v2 (below, 2026-08-09) adds a single-rigid-box
continuity lock; Dongkyu regenerates on web unlimited.

```
SCENE CONTEXT — EXACT 1 CHARACTER, EXACTLY TWO HANDS AND TWO ARMS — NO
DUPLICATES. ONLY HANDS AND ARMS VISIBLE.
One continuous top-down take: the SAME pair of small hands places one LARGE
plain unbranded cardboard box with no printing down onto a rustic wooden desk,
peels off only the thin packing-tape strip, folds the flaps of the SAME box
open, and pushes the packing paper aside to reveal the parts of a black
monitor arm nested inside.

THE BOX IS ONE SINGLE RIGID OBJECT. Its cardboard shell — color, texture,
corners, proportions — stays pixel-identical from the first frame to the last.
Nothing detaches from the box except the thin tape strip. There is no outer
sleeve, no lid, no wrapper, no second box.

BOTH ARMS ENTER FROM THE BOTTOM EDGE OF FRAME ONLY, in cream hoodie sleeves,
and stay anchored there for the entire shot. The area above and beside the box
stays empty of hands at all times. The two hands belong to one person seated
at the bottom of frame. (v3, 2026-08-09: v2 web regen produced four hands —
top pair + bottom pair.)

FIRST FRAME AND SPATIAL BLOCKING
The first visible frame is a top-down view of the wooden desk surface filling
the frame; the LARGE closed box — covering nearly half the desk surface — is
held by exactly two hands at its near sides, both arms reaching in from the
bottom edge of frame, the box already over the desk center.

FORMAT MODE: single continuous take, real-time motion.

OPTICS: 47° diagonal field of view, camera 1 meter directly above the desk,
looking straight down.

CAMERA: locked top-down, zero camera movement for the entire take.

ACTION TIMING
0:00–0:02 — the two hands lower the big box onto the desk center; it touches
down with a soft heavy settle and the hands let go, resting at the near edge.
0:02–0:04 — the same two hands pick at the tape end and pull ONLY the narrow
tape strip off along the center seam in one clean motion; the tape strip is
the only thing that comes away; the box walls do not move, bend or separate.
0:04–0:06 — the tape seam runs VERTICALLY down the frame center, so the two
main flaps hinge open SIDEWAYS: the left flap swings open to the LEFT and the
right flap swings open to the RIGHT, on fold lines parallel to the center
seam; the flaps never fold toward the top or bottom of frame; they stay
attached to the same box; crumpled kraft packing paper is visible inside.
(v4, 2026-08-09: v3 opened the flaps top/bottom against the seam geometry.)
0:06–0:09 — the same two hands push the packing paper aside to the ends of the box,
clearly revealing the black monitor arm parts lying inside: a matte black
articulated arm with visible joints, a black desk clamp bracket, and a black
rectangular VESA mounting plate. The hands come to rest gripping the near edge
of the box.

PHYSICS: the big box has real weight and lands flat with a correct contact
shadow; the box shell is rigid and keeps its exact shape; tape resists then
releases as one thin strip; flaps swing on their fold lines while staying
attached; paper crinkles and shifts; the black metal parts stay heavy and
still.

LIGHTING: warm daylight from the top edge of frame, single source.

AUDIO: one soft heavy cardboard thump on wood, tape rip, cardboard flap, paper
crinkle. SFX only.

POSITIVE CONSTRAINTS: exactly TWO hands and TWO arms in every single frame —
never three, never four; both arms enter only from the bottom edge of frame;
exactly ONE box that stays the same single box the entire shot; only the thin
tape strip detaches; the box surface looks identical in every frame; no face
in frame; the desk surface stays identical; the monitor arm parts are matte
black with no branding.

{STYLE}
```

### Shot 05 (retired — merged into 05+06)

```
SCENE CONTEXT — EXACT 1 CHARACTER, ONLY HANDS AND ARMS VISIBLE.
A pair of small hands places one plain unbranded cardboard box with no
printing down onto a rustic wooden desk surface, seen from directly above.

FIRST FRAME AND SPATIAL BLOCKING
The first visible frame is a top-down view of the wooden desk surface filling
the frame; the box already enters from the bottom edge held by two hands.

FORMAT MODE: single continuous take, real-time motion.

OPTICS: 47° diagonal field of view, camera 1 meter directly above the desk,
looking straight down.

CAMERA: locked top-down, zero camera movement.

ACTION TIMING
0:00–0:02 — the hands lower the box toward the desk center.
0:02–0:04 — the box touches down with a soft settle; the hands release and
slide out of frame at the bottom edge.

PHYSICS: the box has weight, lands flat, correct contact shadow spreads under
it.

LIGHTING: warm daylight from the top edge of frame, single source.

AUDIO: one soft cardboard thump on wood. SFX only.

POSITIVE CONSTRAINTS: exactly ONE box, only two hands visible, no face in
frame, the desk surface stays identical.

{STYLE}
```

### Shot 06 (retired — merged into 05+06)

```
SCENE CONTEXT — EXACT 1 CHARACTER, ONLY HANDS AND ARMS VISIBLE.
Top-down: two small hands peel the packing tape off the cardboard box, fold
the flaps open, and reach inside with excitement.

FIRST FRAME AND SPATIAL BLOCKING
The first visible frame is the same locked top-down view: the closed box
centered on the wooden desk, two hands already gripping the tape edge.

FORMAT MODE: single continuous take, real-time motion.

OPTICS: 47° diagonal field of view, camera 1 meter directly above, looking
straight down.

CAMERA: locked top-down, zero camera movement, identical framing to the
previous beat.

ACTION TIMING
0:00–0:02 — the hands rip the tape across the box seam in one clean pull.
0:02–0:03 — the flaps fold open outward; crumpled packing paper is visible
inside.
0:03–0:05 — both hands dive into the packing paper, pushing it aside.

PHYSICS: tape resists then releases; flaps swing on their fold lines; paper
crinkles and shifts.

LIGHTING: warm daylight from the top edge of frame, single source.

AUDIO: tape rip, cardboard flap, paper crinkle. SFX only.

POSITIVE CONSTRAINTS: exactly ONE box, only two hands visible, the desk and
box position identical to frame one.

{STYLE}
```

### Shot 07 — Monitor-arm parts spread (4s)

```
SCENE CONTEXT — EXACT 1 CHARACTER — NO DUPLICATES.
{BRUNI}
The character lays out black monitor-arm parts, screws and an instruction
sheet on the wooden desk, studying them with focused determination.

ACTIVE REFERENCES
{REF_BRUNI}

FIRST FRAME AND SPATIAL BLOCKING
The first visible frame already shows the character behind the desk, chest-up,
with the black metal arm segments, small screws and one folded paper manual
spread on the desk surface in front of her. She looks down at the parts.

FORMAT MODE: single continuous take, real-time motion.

OPTICS: 47° diagonal field of view, standard normal lens character, camera 1.5
meters from the desk front edge.

CAMERA: fixed just above desk height, facing her across the desk.

ACTION TIMING
0:00–0:02 — she places the last arm segment down, aligning the parts in a row.
0:02–0:04 — she picks up the manual, eyes scanning it, brow slightly furrowed
in concentration.

PHYSICS: metal parts have weight and clink when set down; the paper manual
flexes.

LIGHTING: warm window daylight from camera-left, single source.

AUDIO: metal parts clinking softly on wood, paper rustle. SFX only.

POSITIVE CONSTRAINTS: exactly ONE character, parts are matte black brushed
metal with realistic material, no brand logos anywhere.

{STYLE}
```

### Shot 08 — Clamp tightening (4s)

```
SCENE CONTEXT — EXACT 1 CHARACTER — NO DUPLICATES.
{BRUNI}
Close on the character tightening the black desk clamp of the monitor arm
onto the edge of the wooden desk, cheeks puffed with effort.

ACTIVE REFERENCES
{REF_BRUNI}

FIRST FRAME AND SPATIAL BLOCKING
The first visible frame shows her hands already on the clamp at the desk edge,
her face visible above, concentrated. The clamp grips the desk edge at frame
center.

FORMAT MODE: single continuous take, real-time motion.

OPTICS: 29° diagonal field of view, short telephoto portrait lens character,
background softly blurred.

CAMERA: fixed at desk height, slightly to the side of the clamp.

ACTION TIMING
0:00–0:02 — she twists the clamp knob with both hands, shoulders engaging,
cheeks puffing with effort.
0:02–0:04 — one final quarter-turn; the clamp seats firmly; she exhales and
gives it a little wiggle test.

PHYSICS: the knob resists rotation; the desk edge takes visible pressure; her
arm muscles carry the effort.

LIGHTING: warm window daylight from camera-left, single source.

AUDIO: knob squeak, small effort breath. SFX only.

POSITIVE CONSTRAINTS: exactly ONE character, exactly ONE clamp, matte black
metal with realistic material.

{STYLE}
```

### Shot 08 v3 — Clamp tightening, reference-frame character feel (4s, job a4385079)

v1/v2 retired (Dongkyu 2026-08-09): character feel wrong — smooth helmet hair,
angry scowl. v3 locks identity to two user-supplied reference frames instead of
the turnaround sheet (media 6e67bc17 / 10825f62, both as `image_references`,
NO start image). Verbatim deltas from v1:

- SCENE CONTEXT descriptor, hair/eye lines replaced: "brown hair in a loose
  braided top bun with many soft wavy flyaway strands falling around her face
  and neck, very large glossy dark brown eyes with bright catch-lights and fine
  dark eyelashes, thick expressive eyebrows, full rosy cheeks, wearing an
  oatmeal cream fleece hoodie with drawstrings and visible soft fabric weave";
  "cheeks puffed with effort" → "utterly absorbed in the work".
- ACTIVE REFERENCES replaced with: "both reference frames are the SAME
  character for character identity and render feel — copy the face, the very
  large glossy eyes with catch-lights and eyelashes, the thick eyebrows, the
  loose wavy hair strands around the face, the fleece fabric texture of the
  hoodie, and the warm amber cinematic grading from these frames. Do not copy
  their room or background."
- CHARACTER ACTING added: "focused determination — eyes wide open and intent
  on the clamp, small closed mouth, brows gently knit in concentration. She
  never looks at camera." (removes the v1 scowl/pout wording throughout)
- LIGHTING: appended "warm amber grading".
- {STYLE} line one modified for this shot only: "smooth polished surfaces," →
  "handcrafted tactile detail — visible fleece weave on fabric, fine individual
  hair strands —".
- Known side effect: the reference frames' white light-streak flares carry
  over into the render.

### Shot 09 — VESA plate alignment (4s)

```
SCENE CONTEXT — EXACT 1 CHARACTER — NO DUPLICATES.
{BRUNI}
The character holds a black VESA mounting plate against the back of a black
monitor, comparing screw holes with a puzzled tilt of her head.

ACTIVE REFERENCES
{REF_BRUNI}

FIRST FRAME AND SPATIAL BLOCKING
The first visible frame shows her holding the square black VESA plate in both
hands against the monitor's rear panel, which faces camera. Her face peeks
past the monitor edge, eyes on the screw holes.

FORMAT MODE: single continuous take, real-time motion.

OPTICS: 29° diagonal field of view, short telephoto portrait lens character,
background softly blurred.

CAMERA: fixed at monitor height, facing the monitor's rear panel.

ACTION TIMING
0:00–0:02 — she aligns the plate to the rear panel, sliding it slightly left
and right to match the holes.
0:02–0:04 — the holes do not line up; she tilts her head, lips pressing into a
puzzled pout, and lowers the plate a few centimeters to try again.

PHYSICS: the plate is rigid metal with weight; the monitor stays stable on the
desk.

LIGHTING: warm window daylight from camera-left, single source.

AUDIO: soft metal taps against plastic. SFX only.

POSITIVE CONSTRAINTS: exactly ONE character, exactly ONE monitor, exactly ONE
plate, dark blank screen, no brand logos.

{STYLE}
```

### Shot 10 — Mount attempt → monitor slip (4s)

```
SCENE CONTEXT — EXACT 1 CHARACTER — NO DUPLICATES.
{BRUNI}
The character tries to hang the black monitor onto the mounted arm; the mount
does not fit, and the monitor slips from the arm — she catches it against her
chest, staggering.

ACTIVE REFERENCES
{REF_BRUNI}

FIRST FRAME AND SPATIAL BLOCKING
The first visible frame shows her lifting the monitor with both arms toward
the black monitor arm that is clamped to the desk at frame-left. Her body
faces the arm; her eyes are locked on the mounting point.

FORMAT MODE: single continuous take, real-time motion.

OPTICS: 47° diagonal field of view, standard normal lens character, camera 2
meters from the desk.

CAMERA: fixed at chest height, holding both her and the arm in frame.

ACTION TIMING
0:00–0:02 — she is ALREADY mid-lift, guiding the monitor's rear toward the
arm's mounting plate, arms trembling slightly under the weight.
0:02–0:03 — the mount fails to engage; the monitor tips and slides off the
plate.
0:03–0:04 — she catches it against her chest, staggering half a step back,
eyes wide with alarm.

PHYSICS: the monitor has real mass and inertia; her body counterweights the
catch; nothing floats; the monitor never hits the floor.

LIGHTING: warm window daylight from camera-left, single source.

AUDIO: metal scrape, a fumbled catch thud, sharp intake of breath. SFX only.

POSITIVE CONSTRAINTS: exactly ONE character, exactly ONE monitor, dark blank
screen, the monitor stays in her arms at the end.

{STYLE}
```

### Shot 11 — Lamp on → color-temp disappointment (6s)

```
SCENE CONTEXT — EXACT 1 CHARACTER — NO DUPLICATES.
{BRUNI}
The character switches on a new desk lamp; harsh cold blue-white light floods
the warm room and clashes with it, and her hopeful face falls into
disappointment.

ACTIVE REFERENCES
{REF_BRUNI}

{GEO_ROOM_DAY}

FIRST FRAME AND SPATIAL BLOCKING
The first visible frame shows her at the desk against the desk wall, hand
already on the lamp switch, room lit only by warm window light. Her body faces
the lamp, eyes on it, hopeful.

FORMAT MODE: single continuous take, real-time motion.

OPTICS: 47° diagonal field of view, standard normal lens character, camera 2
meters from her, desk and part of the room readable.

CAMERA: fixed at her eye level from the room side of the desk.

ACTION TIMING
0:00–0:01 — she clicks the lamp switch, leaning in expectantly.
0:01–0:03 — cold blue-white light snaps on and washes over the desk and her
face, clashing against the warm room tones.
0:03–0:06 — her smile fades; shoulders drop; she looks from the lamp to the
room and back, disappointment settling in.

PHYSICS: light falls off naturally with distance; shadows shift when the lamp
turns on.

LIGHTING: two sources in contrast — the warm window daylight and the new cold
blue-white lamp glow; the cold lamp dominates her face after 0:01.

AUDIO: one switch click, faint electrical hum. SFX only.

POSITIVE CONSTRAINTS: exactly ONE character, exactly ONE lamp turns on, the
color clash stays visible until the end.

{STYLE}
```

### Shot 11.5 v2 — Frantic bustle → skid stop → defeat, streaks removed (8s, job 9a938652)

v1 (shot115-v1.mp4, ae97ed25) retired (Dongkyu 2026-08-09): white speed-streak
lines followed the character's back the whole take — 부자연스러움. Root cause:
streaks were BAKED INTO start image cut115-a and mood refs cut115-b/c, so the
video model tracked them as scene elements. v2 changes:

- Start image replaced with **cut115-a-v2** (NBP surgical edit, job 65475305:
  removed every streak, pose/room/grading preserved).
- Mood refs cut115-b/c DROPPED (both contain the streaks) — refs are now sheet
  v2 only (fresh media ce2c9b69).
- End image cut115-d unchanged (clean; fresh media 5c735605).
- Dynamism moved into physical motion: fast real-time beats, hair strands +
  hoodie drawstrings whipping on turns, slipper skid with squeak.
- PHYSICS + POSITIVE CONSTRAINTS lock it: "the air in the room stays
  completely clean and clear — motion energy is expressed only through her
  body speed, her whipping hair strands and swinging drawstrings", "clean
  clear air throughout the room, all surfaces and walls plain and unmarked".

Full prompt = CINEDANCE skeleton with beats: 0–4s frantic arranging (frame →
spin → box → books), 4–5s skid stop by the rug, 5–8s shoulders slump → sinks
to knees beside the bed. 62° FOV wide, fixed camera at chest height.

### Shot 12 — Rise from chair → back away → sink to knees (10s bridge one-take, v2 2026-08-09)

v1 (8s, fixed camera on rug) retired: jump cut from shot 11 + prop
discontinuity (cut12-a/b desk had no monitor arm and heavy clutter). v2
bridges directly from shot 11's end frame. Prompt is compressed to fit the
4000-char limit (GEO inlined, desk contents pinned to the cut11 state).

```
SCENE CONTEXT — EXACT 1 CHARACTER — NO DUPLICATES.
{BRUNI}
One continuous take: she rises from her chair at the desk, backs away onto
the rug, takes in the mismatched setup, and sinks to her knees in deep
frustration.

ACTIVE REFERENCES
{REF_BRUNI}

GEO SPATIAL LAYOUT (locked): attic bedroom, slanted beige plaster ceiling,
warm wood floor, round terracotta rug at center. Arched window with wooden
shutters on the window wall. Bed with terracotta-orange bedding camera-right.
One long rustic wooden desk on the desk wall; on it a dark blank monitor on a
simple stand, a black monitor arm with an empty VESA plate, and a teal desk
lamp glowing COLD BLUE-WHITE; loose screws on the desk, open cardboard boxes
and screws on the floor beneath. Daylight enters only through the arched
window. Camera never crosses the window wall.

FIRST FRAME AND SPATIAL BLOCKING
The first visible frame shows her sitting slumped on a wooden chair at the
desk, facing the desk, shoulders dropped, lit by the clash of cold blue-white
lamp glow and warm window daylight — the closing beat of the previous shot.
Arched window at frame-right, bed at far frame-right.

FORMAT MODE: single continuous take, real-time motion.

OPTICS: 47° diagonal field of view, camera starting 2 meters from her at the
desk.

CAMERA: starts at her eye level near the desk, then pulls back slowly and
smoothly as she retreats, settling at chest height with both her and the desk
readable — one continuous gentle pull-back, no cuts.

ACTION TIMING
0:00–0:02 — she pushes back the chair and stands up slowly, eyes on the desk.
0:02–0:04 — two small steps backward onto the rug; the camera pulls back with
her, revealing the whole setup.
0:04–0:07 — she stands still, scanning lamp, monitor arm, screws, face
falling step by step; arms hang; head tilts back with a silent sigh.
0:07–0:10 — she sinks onto her knees on the rug, shoulders slumping, staring
at the floor.

PHYSICS: her knees take her weight as she sinks; hoodie fabric folds
naturally.

LIGHTING: warm window daylight from frame-right, cold blue-white lamp glow
from the desk at frame-left — the color clash stays visible the entire take.

AUDIO: a soft chair scrape, slow footsteps, a long deflating sigh, soft knee
contact. SFX only.

POSITIVE CONSTRAINTS: exactly ONE character; the desk keeps exactly the same
objects the whole take — monitor, monitor arm, teal lamp, screws; no new
props appear; the lamp stays cold blue-white.

{STYLE}
```

### Shot 13 — OTL spotlight gag (4s)

```
SCENE CONTEXT — EXACT 1 CHARACTER — NO DUPLICATES.
{BRUNI}
Comedy insert: the character kneels on all fours in a defeated OTL pose inside
a single dramatic purple spotlight circle, the rest of the room falling into
stylized darkness.

ACTIVE REFERENCES
{REF_BRUNI}

FIRST FRAME AND SPATIAL BLOCKING
The first visible frame shows her already on all fours at frame center on the
wooden floor, head hanging down, inside one sharp-edged circular spotlight of
purple-blue stage light. Everything outside the circle is deep stylized
shadow.

FORMAT MODE: single continuous take, real-time motion.

OPTICS: 47° diagonal field of view, camera 2.5 meters away at floor height.

CAMERA: fixed low at floor level, slight side angle on her profile.

ACTION TIMING
0:00–0:02 — she holds the OTL pose, perfectly still except a slow defeated
head droop.
0:02–0:04 — one tiny gray cloud of gloom puffs above her head; her fingers
curl weakly against the floor.

PHYSICS: her weight rests on hands and knees; contact shadows inside the
spotlight circle.

LIGHTING: exactly ONE theatrical purple-blue spotlight from directly above;
outside the circle falls to near-black.

AUDIO: one small deflating "phoo" breath, room tone. SFX only.

POSITIVE CONSTRAINTS: exactly ONE character, exactly ONE spotlight circle,
comic-stylized gloom is allowed in this shot only.

{STYLE}
```

### Shot 14 — Glowing laptop wide (4s)

```
SCENE CONTEXT — EXACT 1 CHARACTER — NO DUPLICATES.
{BRUNI}
Wide: the character sits slumped on the floor of the dim room when the laptop
on the bed lights up by itself, casting a soft glowing beacon in the gloom.

ACTIVE REFERENCES
{REF_BRUNI}

{GEO_ROOM_DAY}

FIRST FRAME AND SPATIAL BLOCKING
The first visible frame shows the dim room in wide: the character sits on the
rug at frame center-left, back curled, facing away from the bed; the laptop
lies on the bed at frame-right, screen ALREADY glowing warm white — the only
bright point in the frame.

FORMAT MODE: single continuous take, real-time motion.

OPTICS: 84° diagonal field of view, classic wide-angle lens character, deep
readable spatial context.

CAMERA: fixed wide from the door-wall side, holding her and the bed in one
frame.

ACTION TIMING
0:00–0:02 — she sits motionless in the gloom; the laptop glow pulses gently
brighter.
0:02–0:04 — the glow strengthens enough to rim-light the edge of her shoulder
and hair; she does not turn yet.

PHYSICS: light falls naturally; no objects move.

LIGHTING: the glowing laptop screen is the single dominant source; dusk-dim
ambient everywhere else; camera on the shadow side of the character.

AUDIO: a soft rising chime hum from the laptop, quiet room tone. SFX only.

POSITIVE CONSTRAINTS: exactly ONE character, exactly ONE laptop, plain
unbranded laptop, the screen shows only soft white glow with no readable text.

{STYLE}
```

### Shot 15-a — Noticing, wide (4s)

```
SCENE CONTEXT — EXACT 1 CHARACTER — NO DUPLICATES.
{BRUNI}
The character notices the glowing laptop and slowly turns her head toward it.

ACTIVE REFERENCES
{REF_BRUNI}

{GEO_ROOM_DAY}

FIRST FRAME AND SPATIAL BLOCKING
Same wide geography as the previous beat: she sits on the rug at frame
center-left, the glowing laptop on the bed at frame-right. Frame one is
identical in layout.

FORMAT MODE: single continuous take, real-time motion.

OPTICS: 84° diagonal field of view, classic wide-angle lens character.

CAMERA: fixed wide from the door-wall side, no move.

ACTION TIMING
0:00–0:01 — stillness; only the laptop glow breathes.
0:01–0:03 — her head lifts and turns toward the glow, eyes catching the light.
0:03–0:04 — her upper body pivots toward the bed, one hand pressing the floor.

PHYSICS: her weight shifts onto the supporting hand as she pivots.

LIGHTING: identical to the previous beat — laptop glow dominant, dim ambient.

AUDIO: quiet room tone, fabric shifting. SFX only.

POSITIVE CONSTRAINTS: exactly ONE character, gaze line lands on the laptop,
layout identical to frame one.

{STYLE}
```

### Shot 15-b — Profile gaze (4s)

```
SCENE CONTEXT — EXACT 1 CHARACTER — NO DUPLICATES.
{BRUNI}
Profile close-up: the character has crawled to the bed edge and stares at the
glowing laptop screen, the light washing over her face.

ACTIVE REFERENCES
{REF_BRUNI}

FIRST FRAME AND SPATIAL BLOCKING
The first visible frame is her profile facing screen-left toward the laptop at
frame-left edge, her chin level with the mattress, the glow lighting her face.

FORMAT MODE: single continuous take, real-time motion.

OPTICS: 29° diagonal field of view, short telephoto portrait lens character,
background dissolved into dark bokeh.

CAMERA: fixed at mattress height, perpendicular to her gaze line.

ACTION TIMING
0:00–0:02 — she leans in a few centimeters, eyes widening, the screen glow
brightening on her cheeks.
0:02–0:04 — a small spark of hope crosses her face; her lips part slightly.

PHYSICS: hair strands catch the screen light; slight mattress dip under her
hands.

LIGHTING: the laptop screen is the single key light from frame-left; the rest
falls to soft darkness.

AUDIO: soft UI chime shimmer, her quiet breath. SFX only.

POSITIVE CONSTRAINTS: exactly ONE character, profile faces screen-left, eyes
stay locked on the screen.

{STYLE}
```

### Shot 16 — Peeking eyes close-up (4s)

```
SCENE CONTEXT — EXACT 1 CHARACTER — NO DUPLICATES.
{BRUNI}
Extreme close-up: only the character's eyes peek over the laptop lid,
reflecting the cool screen glow, gaze angled DOWN at the screen below,
blinking with growing curiosity. (v2, 2026-08-09 Dongkyu: she must be looking
AT the laptop screen, never at camera.)

ACTIVE REFERENCES
{REF_BRUNI}

FIRST FRAME AND SPATIAL BLOCKING
The first visible frame shows the top half of her face rising just above the
closed dark-blue laptop lid edge at frame bottom, both eyes visible and
angled downward toward the screen in front of her, cool screen glow lighting
her face from below, reflected as catch-lights.

FORMAT MODE: single continuous take, real-time motion.

OPTICS: 18° diagonal field of view, classic telephoto, razor-thin focus on the
eyes, everything else melts into soft bokeh.

CAMERA: fixed just behind the laptop, facing her straight on over the lid.

ACTION TIMING
0:00–0:02 — her downcast eyes track slowly left to right across the screen
below frame, reading something on it.
0:02–0:04 — one slow blink, then her eyes widen with a bright spark of
interest — still locked on the screen, never lifting to the camera.

PHYSICS: natural eyelid motion, catch-lights stay alive in the pupils.

LIGHTING: laptop glow from camera side as the single key, soft falloff.

AUDIO: quiet room tone. SFX only.

POSITIVE CONSTRAINTS: exactly ONE character, eyes 100% match the reference
sheet, catch-lights present in every frame.

{STYLE}
```

### Shot 19 — Surprise → starts operating (4s)

```
SCENE CONTEXT — EXACT 1 CHARACTER — NO DUPLICATES.
{BRUNI}
Profile: the character kneels at the bed using the laptop; surprise blooms
into eager focus as she starts clicking and typing.

ACTIVE REFERENCES
{REF_BRUNI}

FIRST FRAME AND SPATIAL BLOCKING
The first visible frame shows her in profile facing screen-left, kneeling at
the bed edge, hands on the laptop, the screen glow on her face. The laptop
screen itself faces away from camera.

FORMAT MODE: single continuous take, real-time motion.

OPTICS: 29° diagonal field of view, short telephoto portrait lens character,
background soft dark bokeh.

CAMERA: fixed at her eye level, perpendicular to her gaze.

ACTION TIMING
0:00–0:01 — her eyebrows shoot up; she leans back a few centimeters in
surprise.
0:01–0:04 — she leans back in, fingers starting to tap and swipe on the
trackpad, eyes darting across the screen with growing focus.

PHYSICS: finger taps have contact; the laptop stays planted on the mattress.

LIGHTING: laptop screen as single key from frame-left.

AUDIO: soft key taps, trackpad clicks. SFX only.

POSITIVE CONSTRAINTS: exactly ONE character, profile faces screen-left, lips
stay closed — no speaking.

{STYLE}
```

### Shot 21 — Magic: monitor arm self-assembly, night (4s)

```
SCENE CONTEXT — EXACT 1 CHARACTER — NO DUPLICATES.
{BRUNI}
Night wide: as the character works on the laptop on the floor, behind her the
white monitor and black monitor arm assemble themselves in mid-air over the
low table, joined by a trail of golden sparkles.

ACTIVE REFERENCES
{REF_BRUNI}

{GEO_ROOM_NIGHT}

FIRST FRAME AND SPATIAL BLOCKING
The first visible frame matches the locked layout: the character sits on the
floor at the foot of the bed at frame-left, back fully to camera, both hands
on the glowing laptop that rests ON the bed mattress; behind her back at
midground center-right the white monitor with bare VESA plate floats above
the wooden desk, the black arm rising to meet it, golden sparkle trail arcing
between them.

FORMAT MODE: single continuous take, real-time motion.

OPTICS: 84° diagonal field of view, classic wide-angle lens character, deep
readable spatial context.

CAMERA: fixed wide behind the character, no move.

ACTION TIMING
0:00–0:02 — the monitor glides gently toward the arm; sparkles stream along
the path; she keeps working, unaware.
0:02–0:03 — the VESA plate clicks onto the arm mount with a soft magical
chime; sparkles burst outward briefly.
0:03–0:04 — the monitor settles level on the arm; the sparkles fade to
embers; she still faces her laptop.

PHYSICS: the floating monitor moves slowly and deliberately like it is carried,
then has real weight once mounted; everything else obeys gravity.

LIGHTING: the amber nightstand lamp and the laptop glow are the only warm
sources; sparkles add tiny golden glints.

AUDIO: soft magical shimmer, one gentle click. SFX only.

POSITIVE CONSTRAINTS: exactly ONE character with her back to camera, exactly
ONE monitor and ONE arm, the character never turns around in this shot.

{STYLE}
```

### Shot 22 — Peek → bright smile (4s)

```
SCENE CONTEXT — EXACT 1 CHARACTER — NO DUPLICATES.
{BRUNI}
Close-up: the character peeks over her shoulder at the magic behind her, and
her face blooms into a bright delighted smile.

ACTIVE REFERENCES
{REF_BRUNI}

FIRST FRAME AND SPATIAL BLOCKING
The first visible frame shows her head and shoulder from behind at frame-left,
face just beginning to turn back toward camera-right, night room bokeh behind.

FORMAT MODE: single continuous take, real-time motion.

OPTICS: 29° diagonal field of view, short telephoto portrait lens character,
background soft dark bokeh with tiny golden sparkle glints.

CAMERA: fixed at her eye level, catching the turn in three-quarter view.

ACTION TIMING
0:00–0:02 — her head turns over her shoulder; eyes find the assembled monitor;
they widen.
0:02–0:04 — a huge bright smile spreads; her cheeks lift; she bounces once
with joy.

PHYSICS: hair bun and strands follow the head turn with slight delay.

LIGHTING: warm amber lamp glow as key from camera-right, golden sparkle
glints in the bokeh.

AUDIO: a tiny gasp, soft shimmer tail. SFX only.

POSITIVE CONSTRAINTS: exactly ONE character, face 100% matches the reference
sheet, smile lands by 0:03.

{STYLE}
```

### Shot 24 — Magic: white lamp lights up, night (4s)

```
SCENE CONTEXT — EXACT 1 CHARACTER — NO DUPLICATES.
{BRUNI}
Night wide: a white LED bar lamp on the low table switches itself on with a
trail of golden sparkles, washing the corner in clean warm-white light while
the character works on her laptop.

ACTIVE REFERENCES
{REF_BRUNI}

{GEO_ROOM_NIGHT}

FIRST FRAME AND SPATIAL BLOCKING
The first visible frame matches the locked layout: the character on the floor
at the foot of the bed at frame-left, back fully to camera, laptop glowing ON
the bed; behind her back the white monitor already mounted on its arm above
the wooden desk at midground center-right; a white LED bar lamp stands beside
it, unlit, with golden sparkles gathering around it.

FORMAT MODE: single continuous take, real-time motion.

OPTICS: 84° diagonal field of view, classic wide-angle lens character.

CAMERA: fixed wide behind the character, identical position to the previous
night shot, no move.

ACTION TIMING
0:00–0:02 — sparkles swirl once around the lamp head.
0:02–0:03 — the lamp blinks on: clean warm-white light blooms across the desk
corner, outlining the white monitor.
0:03–0:04 — the light settles steady; sparkles fade; the corner now glows
softly against the dark room.

PHYSICS: light blooms and falls off naturally; nothing else moves.

LIGHTING: before 0:02 — amber lamp and laptop only; after — the new
warm-white LED bar becomes the local key on the desk corner, harmonizing with
the room instead of clashing.

AUDIO: soft shimmer, one gentle switch-on hum. SFX only.

POSITIVE CONSTRAINTS: exactly ONE character with her back to camera, exactly
ONE LED bar lamp turns on, the new light is warm-white and harmonious — never
harsh blue.

{STYLE}
```

### Shot 25 — Joy burst → immersion (4s)

```
SCENE CONTEXT — EXACT 1 CHARACTER — NO DUPLICATES.
{BRUNI}
Close-up: the character's eyes turn to sparkling stars of joy, then she dives
back into the laptop with happy concentration.

ACTIVE REFERENCES
{REF_BRUNI}

FIRST FRAME AND SPATIAL BLOCKING
The first visible frame is a chest-up close-up, her face lit by the laptop
glow from below frame, night bokeh behind, eyes huge and shining.

FORMAT MODE: single continuous take, real-time motion.

OPTICS: 29° diagonal field of view, short telephoto portrait lens character,
creamy dark bokeh.

CAMERA: fixed at her eye level, no move.

ACTION TIMING
0:00–0:02 — pure delight: star-shaped catch-lights gleam in her eyes, hands
balled at her cheeks.
0:02–0:04 — she drops her hands to the keyboard and leans in, expression
shifting to happy laser focus, fingers tapping quickly.

PHYSICS: natural finger taps; hoodie sleeves shift at the wrists.

LIGHTING: laptop glow as the single key from below-front, warm amber rim from
frame-right.

AUDIO: rapid soft key taps, one happy exhale. SFX only.

POSITIVE CONSTRAINTS: exactly ONE character, face 100% matches the reference
sheet, no speech.

{STYLE}
```

### Shot 26-1 — House timelapse: day → sunset (4s)

```
SCENE CONTEXT — EXACT 0 CHARACTERS, NO PEOPLE.
Timelapse: the cottage exterior passes from bright afternoon into glowing
sunset; clouds streak across the sky, shadows sweep and lengthen.

{GEO_HOUSE}

FIRST FRAME AND SPATIAL BLOCKING
The first visible frame is the locked front view of the cottage in full
daylight, number plate "25" readable. The framing never changes.

FORMAT MODE: single continuous take, timelapse motion.

OPTICS: 84° diagonal field of view, classic wide-angle lens character.

CAMERA: locked tripod frame, zero movement for the entire shot.

ACTION TIMING
0:00–0:04 — continuous timelapse: sunlight angle sweeps, clouds streak
right-to-left, shadows stretch long, the sky grades from blue to orange-pink
sunset; windows begin to glow warm from inside.

PHYSICS: only light and clouds change; the house and street stay perfectly
static.

LIGHTING: sun sweeping from high to low frame-left, ending in warm sunset
backglow.

AUDIO: gentle wind, distant birds fading. SFX only.

POSITIVE CONSTRAINTS: zero people, zero vehicles, the house stays identical,
the number plate always reads "25".

{STYLE}
```

### Shot 26-2 — House timelapse: sunset → night (4s)

```
SCENE CONTEXT — EXACT 0 CHARACTERS, NO PEOPLE.
Timelapse continues: the sunset fades into deep night; stars appear, the house
windows glow warm against the dark.

{GEO_HOUSE}

FIRST FRAME AND SPATIAL BLOCKING
The first visible frame is the identical locked front view at full sunset. The
framing never changes.

FORMAT MODE: single continuous take, timelapse motion.

OPTICS: 84° diagonal field of view, classic wide-angle lens character.

CAMERA: locked tripod frame, zero movement.

ACTION TIMING
0:00–0:04 — the orange sky drains to deep blue then near-black; stars fade in;
the attic window's warm glow becomes the brightest point of the frame.

PHYSICS: only light changes; everything else static.

LIGHTING: fading sunset backglow replaced by cool moonlight plus warm window
glow.

AUDIO: crickets fading in, soft night wind. SFX only.

POSITIVE CONSTRAINTS: zero people, zero vehicles, the house stays identical,
the number plate always reads "25".

{STYLE}
```

### Shot 28 — Sleeping protagonist + Z (4s)

```
SCENE CONTEXT — EXACT 1 CHARACTER — NO DUPLICATES.
{BRUNI}
The character sleeps curled on the bed under the terracotta blanket, a small
"Z" of breath rising, the night room quiet around her.

ACTIVE REFERENCES
{REF_BRUNI}

FIRST FRAME AND SPATIAL BLOCKING
The first visible frame shows her asleep on the bed at frame center, cheek on
the pillow, blanket rising and falling; the amber nightstand lamp glows dim at
frame-right.

FORMAT MODE: single continuous take, real-time motion.

OPTICS: 47° diagonal field of view, camera 2 meters from the bed.

CAMERA: fixed at mattress height, gentle framing, no move.

ACTION TIMING
0:00–0:04 — slow steady breathing; the blanket rises and falls; one small
stylized "Z" puff drifts up from her lips and dissolves; her fingers twitch
once in sleep.

PHYSICS: blanket fabric moves only with her breath.

LIGHTING: dim warm amber lamp as the single source, deep soft shadows.

AUDIO: slow sleeping breath, quiet night room tone. SFX only.

POSITIVE CONSTRAINTS: exactly ONE character, she stays asleep the whole shot,
one stylized Z is allowed.

{STYLE}
```

### Shot 29 — Slow wake → startled → turn (4s)

```
SCENE CONTEXT — EXACT 1 CHARACTER — NO DUPLICATES.
{BRUNI}
Morning: the character stirs awake slowly, then snaps upright wide-eyed, and
whips around to look at something behind her.

ACTIVE REFERENCES
{REF_BRUNI}

FIRST FRAME AND SPATIAL BLOCKING
The first visible frame shows her lying in bed at frame center in soft morning
light, eyes closed, identical bedding to the sleep shot. The camera faces the
bed from the room side.

FORMAT MODE: single continuous take, real-time motion.

OPTICS: 47° diagonal field of view, camera 2 meters from the bed.

CAMERA: fixed at mattress height, no move.

ACTION TIMING
0:00–0:01.5 — her eyelids flutter open drowsily; she rubs one eye.
0:01.5–0:02.5 — her eyes snap fully open; she bolts upright, blanket falling
off her shoulders.
0:02.5–0:04 — she whips her head and torso around toward the desk side of the
room, mouth open in astonishment.

PHYSICS: blanket slides with real cloth weight; her hair bun bounces with the
sudden motions.

LIGHTING: soft morning daylight from the window side as the single source.

AUDIO: rustling blanket, a sharp little gasp. SFX only.

POSITIVE CONSTRAINTS: exactly ONE character, the turn direction is toward the
desk wall, astonishment lands by 0:03.

{STYLE}
```

### Shot 30 — Tilt-up desk reveal (4s)

```
SCENE CONTEXT — EXACT 0 CHARACTERS IN THE FINAL FRAME.
Morning reveal: the camera tilts up from the wooden floor to reveal the
completed white desk setup, glowing softly in morning light.

{GEO_ROOM_MORNING}

FIRST FRAME AND SPATIAL BLOCKING
The first visible frame shows the wooden floor and the white desk legs at the
bottom of the desk wall; the frame then travels up the setup.

FORMAT MODE: single continuous take, real-time motion.

OPTICS: 47° diagonal field of view, camera 2.5 meters from the desk.

CAMERA: one smooth continuous tilt-up from floor level to eye level, ending
composed on the full setup: white desk, white monitor on its black arm, white
LED bar lamp, white ergonomic chair, dresser at camera-right, armchair at
camera-left.

ACTION TIMING
0:00–0:03 — steady tilt-up along the desk legs, over the desktop edge, up the
monitor arm to the monitor.
0:03–0:04 — the frame settles on the final composition; tiny dust motes drift
in the morning sunbeam.

PHYSICS: static scene; only dust motes drift.

LIGHTING: warm morning daylight from the window as the single source, soft
highlights on the white surfaces.

AUDIO: calm room tone, one soft warm swell of morning ambience. SFX only.

POSITIVE CONSTRAINTS: dark blank monitor screen, no people in frame, no brand
logos, the setup matches the reference exactly.

{STYLE}
```

### Shot 31 — Monitor arm check + joy (4s) ⚠pending

```
SCENE CONTEXT — EXACT 1 CHARACTER — NO DUPLICATES.
{BRUNI}
The character rushes into frame and grips the mounted monitor arm, testing it
with both hands, then beams with joy at how solid it is.

ACTIVE REFERENCES
{REF_BRUNI}

{GEO_ROOM_MORNING}

FIRST FRAME AND SPATIAL BLOCKING
The first visible frame shows the white desk with the monitor on its black arm
at frame center; the character enters from frame-right within the first half
second.

FORMAT MODE: single continuous take, real-time motion.

OPTICS: 47° diagonal field of view, camera 2 meters from the desk.

CAMERA: fixed at desk height, facing the desk squarely.

ACTION TIMING
0:00–0:01 — she hops into frame from frame-right, hands reaching for the arm.
0:01–0:03 — she grips the arm and gives it two gentle test pushes; the monitor
glides smoothly and holds perfectly.
0:03–0:04 — she spins to face camera with a huge proud grin, fists clenched
in victory.

PHYSICS: the arm moves with damped smooth resistance and stays where placed;
her hops have real weight and landing.

LIGHTING: warm morning daylight from the window, single source.

AUDIO: two soft mechanical glides, one happy bounce step. SFX only.

POSITIVE CONSTRAINTS: exactly ONE character, exactly ONE monitor and arm,
dark blank screen, the arm never wobbles or fails.

{STYLE}
```

### Shot 32 — Lamp check + awe (4s) ⚠pending

```
SCENE CONTEXT — EXACT 1 CHARACTER — NO DUPLICATES.
{BRUNI}
The character clicks the white LED bar lamp on and off twice, then holds it on,
basking in the perfect warm-white glow with an awed smile.

ACTIVE REFERENCES
{REF_BRUNI}

{GEO_ROOM_MORNING}

FIRST FRAME AND SPATIAL BLOCKING
The first visible frame shows her already standing at the desk at frame
center, finger on the LED bar lamp's touch switch, face lit by morning light.

FORMAT MODE: single continuous take, real-time motion.

OPTICS: 47° diagonal field of view, camera 2 meters from the desk.

CAMERA: fixed at her eye level, three-quarter angle on her and the lamp.

ACTION TIMING
0:00–0:02 — click on, click off, click on — the clean warm-white light washes
the desk each time; her eyebrows rise higher with each click.
0:02–0:04 — she leaves it on, spreads her palms toward the glow like warming
her hands, and sighs with satisfaction.

PHYSICS: light blooms and cuts instantly with each click; natural falloff.

LIGHTING: morning daylight base plus the warm-white LED bar as local key when
on — harmonious, never harsh blue.

AUDIO: three soft touch clicks, one satisfied sigh. SFX only.

POSITIVE CONSTRAINTS: exactly ONE character, exactly ONE lamp, the light is
warm-white and matches the room.

{STYLE}
```

### Shot 33 — Front of desk, starry eyes (4s)

REVISED 2026-08-09: original "standing on the rug" blocking replaced — Dongkyu
picked concepts/cut33.png as the start frame (she is behind the desk facing
camera, monitor rear toward lens). GEO camera line overridden for this shot.

```
SCENE CONTEXT — EXACT 1 CHARACTER — NO DUPLICATES.
{BRUNI}
The character stands behind her completed white desk setup facing camera,
glowing with starry-eyed happiness at how perfect it all turned out.

ACTIVE REFERENCES
{REF_BRUNI}

{GEO_ROOM_MORNING}
— For this shot only, the camera is on the desk-wall side looking across the
  desk toward her and the room behind her.

FIRST FRAME AND SPATIAL BLOCKING
The first visible frame matches the start image exactly: she is centered
behind the white desk facing camera, her upper body visible above the
desktop; the white monitor's rear panel on its black arm at frame-right of
her, keyboard and glowing mouse on the black desk mat in front of her, the
white console and white LED bar lamp at frame-right, the arched window at
frame-left, the bed with terracotta-orange bedding behind her at frame-left,
the wooden dresser behind her at frame-right.

FORMAT MODE: single continuous take, real-time motion.

OPTICS: 47° diagonal field of view, camera 2 meters from the front edge of
the desk.

CAMERA: fixed at her eye level, frontal across the desk, no move.

ACTION TIMING
0:00–0:02 — she sweeps a proud gaze across her new setup — monitor, lamp,
keyboard — grin widening; star-shaped catch-lights shimmer around her eyes;
one satisfied nod.
0:02–0:04 — she claps her hands together under her chin and does a tiny
bounce of joy; the sparkles in her eyes bloom brighter; loose hair strands
bob once.

PHYSICS: her bounce has real weight; hoodie sleeves follow with slight delay;
every object on the desk stays exactly in place.

LIGHTING: warm morning daylight from the arched window at frame-left, single
source.

AUDIO: one soft clap, one happy bounce. SFX only.

POSITIVE CONSTRAINTS: exactly ONE character with the exact 4.5-head slim
proportion from the sheet, exactly ONE monitor on ONE black arm with its rear
panel toward camera, the desk setup identical to the start frame, the room
stays still.

{STYLE}
```

### Shot 34 — Starry-eyed bokeh close-up (4s)

```
SCENE CONTEXT — EXACT 1 CHARACTER — NO DUPLICATES.
{BRUNI}
Happy close-up: the character's face fills the frame with starry sparkling
eyes against a soft warm bokeh of her new desk setup.

ACTIVE REFERENCES
{REF_BRUNI}

FIRST FRAME AND SPATIAL BLOCKING
The first visible frame is a tight close-up of her face slightly off-center
frame-left, the white desk setup dissolved into warm bokeh behind her.

FORMAT MODE: single continuous take, real-time motion.

OPTICS: 18° diagonal field of view, classic telephoto, razor focus on her
eyes, creamy bokeh wash behind.

CAMERA: fixed at her eye level, no move.

ACTION TIMING
0:00–0:02 — star-shaped catch-lights shimmer in her eyes; her smile trembles
wider.
0:02–0:04 — she squeezes her eyes shut in a blissful full-face smile, cheeks
round and rosy, then opens them again still sparkling.

PHYSICS: natural facial motion only; loose hair strands sway faintly.

LIGHTING: warm morning key from camera-right, soft and flattering.

AUDIO: one small giggle breath. SFX only.

POSITIVE CONSTRAINTS: exactly ONE character, face 100% matches the reference
sheet, catch-lights in every frame.

{STYLE}
```

### Shot 35 — Desk play + crane up through ceiling to black (8s) — REVISED (Dongkyu, 2026-08-09)

Redefined: the old back-view zoom-out concept is replaced. She plays with her
desk items excitedly (start = `concepts/cut35.png`, proportion approved as
the target look); the camera rises vertically, passes through the attic
ceiling, and the shot ends on a solid black frame. The black frame is the
bridge into cut 36 (DERO logo end card, **motion graphics — human task**,
emerging from black). `fixed/cut36-card-v1.png` is kept only as a style
reference for the MG artist.

Media: start_image cut35 (media 5b945963) · end_image pure black 1280x720
(media fe148e4a) · sheet {REF_BRUNI}. Video job c6abb642 (v1).

Prompt (v1, submitted 2026-08-09): playful beats 0–5s (console tilt, key
taps, monitor pat, mouse/lamp fiddle), vertical crane rise 3–7s, ceiling
sweeps the lens, 7–8s solid black hold. Constraints: one character, never
looks at camera, one smooth vertical rise only, ends fully black.

Iteration log (2026-08-09):
- v1 (job c6abb642): **rework** — rise too slow and linear; acting thin.
- v2 (job 0addf6db): accelerating rise + densified acting beats (console
  tilt+set back, keyboard rhythm, clap+laugh, monitor pat, mouse spin) —
  **rework**: model pushed in, lost the cut35 wide framing.
- v3 = FINAL (job 56f15f80, shot35-v4.mp4): added wide-framing lock — FIRST
  FRAME "reproduces the start image EXACTLY at the same WIDE framing" +
  CAMERA "locked for the first three seconds … no push-in, no zoom" +
  constraint line. **Passed** (Dongkyu). Note: seedance prompt hard limit
  4000 chars — trim LOCATION MAP first when over.

### ~~Shot 35 (OLD) — Back-view survey + zoom out~~ (superseded, kept for log)

Generated once as shot35-v1.mp4 (job 2cf62647, 6s zoom-out,
start crop 8fe84589 / end cut35-wide-v5 job a7e86412) before the redefinition
— retired. Keyframe iterations: v2 squat → v3 too tall → v4 (proportion-ref)
squat+plush fail → v5 passed (fixed/cut35-wide-v2/3/4/5.png).

```
SCENE CONTEXT — EXACT 1 CHARACTER — NO DUPLICATES.
{BRUNI}
Final shot: seen from behind, the character stands taking in her finished
room; the camera pulls back slowly, widening to hold the whole warm scene.

ACTIVE REFERENCES
{REF_BRUNI}

{GEO_ROOM_MORNING}

FIRST FRAME AND SPATIAL BLOCKING
The first visible frame shows her from behind at frame center, standing on
the rug facing the white desk setup at the desk wall; the whole setup is
readable past her shoulders.

FORMAT MODE: single continuous take, real-time motion.

OPTICS: 84° diagonal field of view, classic wide-angle lens character, deep
readable spatial context.

CAMERA: starts 2 meters behind her at head height and pulls straight back
slowly and smoothly for the entire shot, revealing more of the room — rug,
bed edge, window light.

ACTION TIMING
0:00–0:02 — she slowly turns her head left then right, surveying the room,
hands relaxed at her sides.
0:02–0:04 — she plants her hands on her hips in quiet satisfaction as the
camera keeps drifting back; the room settles into a final wide composition.

PHYSICS: steady stance, natural head motion, no body drift.

LIGHTING: warm morning daylight from the window as the single source, the
white desk glowing softly as the focal point.

AUDIO: calm warm room tone, faint birdsong outside. SFX only.

POSITIVE CONSTRAINTS: exactly ONE character with the exact 4.5-head slim
proportion from the sheet, she never turns to face camera, camera motion is
one smooth pull-back only.

{STYLE}
```

---

## Pre-generation checklist

1. ⚠pending 6 cuts (12/13/31/32/33/35): start_image approval — Dongkyu.
2. All 4 substitution constants inserted verbatim.
3. No duration/resolution in prompt bodies — parameters only.
4. Iteration repairs change one line only + version log (PRODUCTION §7).
