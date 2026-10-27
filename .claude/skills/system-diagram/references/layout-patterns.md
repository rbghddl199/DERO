# Layout patterns

Canon: `de_pjt/docs/superpowers/specs/2026-07-16-diagram-skill-design.md` §6

**No automatic optimal placement.** Quality is only stable inside the three supported patterns
(lane + fan-out architecture, standard sequence, user-flow grid). Topologies outside them use
the fallback in the "Scope" section of SKILL.md (hand-authored SVG with the same PALETTE and
the R1–R8 helpers).

## Architecture: lanes + fan-out (`layout.py`)

- Left-to-right **lanes** (e.g. collect / index-store / serve / observe) laid out as columns.
  `node["col"]` and `node["row"]` are the logical grid position; `layout.place(node)` converts
  them to real coordinates:
  - `cx = MARGIN_X + col * PITCH_X`, `cy = MARGIN_Y + row * PITCH_Y`
  - `PITCH_X = 170`, `PITCH_Y = 96`, `MARGIN_X = 100`, `MARGIN_Y = 120`
  - Fixed node size: `NODE_W = 112`, `NODE_H = 84`
- Zone bboxes are **derived automatically** from member node coordinates plus padding
  (`group_bbox`, `PAD_SIDE=20 / PAD_TOP=30 / PAD_BOTTOM=16`) — never measure coordinates by hand.
- Connectors: adjacent nodes get an automatic straight line (`_auto_path` — horizontal when on
  the same row, otherwise an H-V-H orthogonal fan-out). When the automatic path looks wrong for
  a fan-out, give an explicit SVG path (`d=`) via the `"path"` key in the spec.
- Keep the column pitch and row spacing wider than the label width to prevent overlap (R6).
  `layout.has_overlap(nodes)` guards against two nodes landing in the same grid cell.

## Sequence: standard lanes (`sequence.py`)

- Actors are placed at even intervals starting at `_X0=110` with pitch `_XPITCH=225`.
- Message y stacks from `_Y0=104` in steps of `_STEP=52` — the canvas height (`bottom`) grows
  with the message count so they never overlap.
- Notes attach as a tick + box beside the owning actor's lifeline (`NOTE_FILL/STROKE`; fill is
  pale gray only — never an accent color).
- Fixing the step interval *is* the overlap-prevention mechanism (no automatic collision
  detection, YAGNI — more messages just grow the canvas, the layout does not break).

## User flow: vertical within a column, right-side exit on branches (`flow.py`)

- Reuses the same logical grid as architecture (`node["col"]`, `node["row"]` → `layout.place`) —
  coordinate math is unified in one place (`layout.py`).
- Node width and height are **fixed per type**: `step` is `STEP_W=148 / STEP_H=56`, `start`/`end`
  (terminators) are `TERM_W=132 / TERM_H=48`, `decision` (diamond) is `DEC_W=158 / DEC_H=84`.
- Connector routing (`_route`): same column (same `col`) → a **vertical straight line** (bottom of
  the upper node → top of the lower node, `V` command). Different column → orthogonal from the
  upper node's **right-side exit** down to the lower node's top (`H` then `V`). When the automatic
  path looks wrong, give an explicit SVG path (`d=`) via the `"path"` key in the spec.
- Branch labels (예/아니오) sit on the line with a white halo (text over a thick `stroke:white`),
  not on a box background (R7 — emphasis carries meaning only).
- The overlap guard is the same as architecture: call `layout.has_overlap(nodes)` on grid entry.
