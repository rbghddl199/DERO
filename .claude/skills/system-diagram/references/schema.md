# Diagram spec schema

Canon: `de_pjt/docs/superpowers/specs/2026-07-16-diagram-skill-design.md` §5

A spec is a plain Python dict (`SPEC`). It describes **logical position and relationships only** —
never touch coordinates (cx, cy), colors or styling. Those are decided by `layout.py` /
`palette.py` / `scene.py` / `sequence.py` (§3.2, the generator as a rule book).

## 5.1 Architecture (`kind: "architecture"`)

```python
SPEC = {
    "kind": "architecture",
    "title": "...",
    "nodes": {
        "id": {
            "logo": "kafka",       # assets/logos/<key>.svg filename (text-chip fallback if absent)
            "label": "Kafka",      # primary label
            "sub": "news.raw",     # optional: sub label (mono, MUTED)
            "col": 1, "row": 2,    # logical grid position (layout.place converts to coordinates)
            "group": "collect",    # zone membership, matched against groups[].id
        },
        ...
    },
    "groups": [
        # emphasis = line weight (px), dashed = hierarchy (R7 — no fill; weight/dash carry meaning)
        {"id": "collect", "label": "수집 · COLLECT", "emphasis": 1.6, "dashed": False},
    ],
    "connectors": [
        {"from": "airflow", "to": "crawler", "dashed": True},  # adjacent nodes = automatic straight line
        {"from": "postgres", "to": "qdrant"},                  # dashed omitted = solid
        # when the automatic path looks wrong (fan-outs), give an explicit SVG path via "path"
    ],
    "edge_labels": [
        {"on": ("postgres", "qdrant"), "text": "임베딩"},  # halo text at the midpoint of the two nodes
    ],
}
```

Note: the example in the canon spec document uses a `"lane"` key, but the actual implementation
(`layout.py` / `scene.py`) uses `"col"`/`"row"` (grid coordinates) plus `"group"` (zone id). The
code is the canon for the schema — copy `examples/depjt_architecture.py` directly.

## 5.2 Sequence (`kind: "sequence"`)

```python
SPEC = {
    "kind": "sequence",
    "title": "...",
    "actors": [("U", "사용자"), ("D", "Django API"), ...],  # (id, label), evenly spaced
    "messages": [
        # (from_id, to_id, label, kind)  — kind ∈ {"call", "return", "highlight"}
        ("U", "D", "질문", "call"),
        ("D", "U", "근거 인용 답변", "highlight"),
    ],
    "note": ("D", "스코프 가드 · 충실도 검사"),  # optional: note box attached beside one actor
}
```

- `call` = solid line + arrowhead (LINE), `return` = dashed + soft line (LINE_SOFT), `highlight` =
  the single ACCENT (line, label and number circle all). Use emphasis meaningfully, once per
  diagram (R7).
- Each message automatically gets a numbered circle marker on its originating lifeline (from 1).
- Message order = array order. Numbers are derived from the array index (never put numbers in the spec).

## 5.3 User flow (`kind: "flow"`)

A practitioner's **user flow / flowchart**, not a UML use-case diagram (academic/legacy).

```python
SPEC = {
    "kind": "flow",
    "title": "...",
    "nodes": {
        "id": {
            "type": "start",       # "start" | "step" | "decision" | "end"
            "label": "로그인",     # primary label — the box widens automatically to fit it
            "sub": ["OAuth 2.0", "세션 15분"],  # optional: detail (list, or a "\n"-separated string)
            "col": 0, "row": 0,    # logical grid position (placed by max height per row, max width per column)
            "accent": True,        # optional: on the single goal terminal only. Two or more → ValueError (R7)
        },
        ...
    },
    "connectors": [
        {"from": "login", "to": "ask"},                      # plain arrow, no label
        {"from": "has", "to": "answer", "label": "예"},       # branch label (white halo)
        # when the automatic path looks wrong, give an explicit SVG path (d=) via "path"
    ],
}
```

- Node shapes (all square-cornered, no rounding, R1): `step` = rectangle (white fill),
  `decision` = diamond, `start`/`end` = rectangle (pale gray fill when not `accent`). Stadium
  (rounded pill) terminators violate R1 and are not used.
- Emphasis (ACCENT) goes on **exactly one** `accent: True` node (the success/goal terminal) —
  rose border and text (R7). `render_flow` raises `ValueError` beyond one.
- Connectors: arrow + branch label (white halo). Same column (same `col`) = vertical straight
  line; different column = orthogonal (right-side exit → down).
- **Automatic box sizing + wrapping**: boxes are not fixed width. The label width is estimated
  (full-width/Hangul ≈ font-size × 1.0 per char, half-width alphanumerics ≈ 0.6 per char) and the
  box widens to fit. If the estimated width exceeds the maximum (`MAX_CONTENT_W`), the label
  **wraps automatically** on separators (space, `·`, `—`) into multiple lines and the box gets
  taller. Diamonds (`decision`) follow the same principle (width/height grow against the inscribed
  rectangle). A short label never shrinks below the per-type minimum size. So there is no need to
  truncate a label and drop information — a long one just grows or wraps the box.
- **The `sub` label**: detail in small type under the primary label (MUTED, mono, same tone as the
  architecture node sub). Either a list (one element per line) or a `"\n"`-separated string. Each
  `sub` line also wraps past the maximum width, and the box grows by the sub height.
- **R6 self-check extension**: if any text's estimated width/height escapes the inside of its box
  (padding included; for diamonds, the inscribed condition), `render_flow` raises `ValueError`. The
  existing cell-overlap check still applies.
