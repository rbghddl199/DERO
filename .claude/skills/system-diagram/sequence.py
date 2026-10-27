"""시퀀스 SVG 씬(이미지 8 결). 라이트·번호 마커·강조색 하나(R7/R8)."""
import palette
from xmlutil import esc

_Y0, _STEP = 104, 52
_X0, _XPITCH = 110, 225
# kind -> (line, label, circle, dashed)
_STYLE = {
    "call": (palette.LINE, palette.INK, palette.MARK, False),
    "return": (palette.LINE_SOFT, palette.INK, palette.MARK, True),
    "highlight": (palette.ACCENT, palette.ACCENT, palette.ACCENT, False),
}


def _marker(mid, color):
    return (f'<marker id="{mid}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" '
            f'markerHeight="7" orient="auto-start-reverse">'
            f'<path d="M0 0 L10 5 L0 10 z" fill="{color}"/></marker>')


def render_sequence(spec):
    actors = spec["actors"]
    highlights = sum(1 for _, _, _, kind in spec["messages"] if kind == "highlight")
    if highlights > 1:
        raise ValueError("sequence must have at most one highlight message (R7)")
    xs = {aid: _X0 + i * _XPITCH for i, (aid, _) in enumerate(actors)}
    n = len(spec["messages"])
    bottom = _Y0 + n * _STEP + 24
    width = _X0 + (len(actors) - 1) * _XPITCH + 110
    p = [f'<svg viewBox="0 0 {width} {bottom+30}" width="100%" role="img" '
         f'aria-label="sequence" xmlns="http://www.w3.org/2000/svg">',
         '<defs>' + _marker("sq-call", palette.LINE) + _marker("sq-ret", palette.LINE_SOFT)
         + _marker("sq-hi", palette.ACCENT) + '</defs>']
    for aid, label in actors:
        cx = xs[aid]
        p.append(f'<line x1="{cx}" y1="56" x2="{cx}" y2="{bottom}" '
                 f'stroke="{palette.LIFELINE}" stroke-width="1"/>')
        p.append(f'<rect x="{cx-64}" y="20" width="128" height="34" '
                 f'fill="{palette.HDR_FILL}" stroke="{palette.HDR_STROKE}"/>')
        p.append(f'<text x="{cx}" y="41.5" text-anchor="middle" '
                 f'font-family="ui-sans-serif,system-ui,sans-serif" font-weight="700" '
                 f'font-size="12.5" fill="{palette.INK}">{esc(label)}</text>')
    marker_of = {"call": "sq-call", "return": "sq-ret", "highlight": "sq-hi"}
    for i, (a, b, label, kind) in enumerate(spec["messages"], start=1):
        line_c, lbl_c, circ_c, dashed = _STYLE[kind]
        xa, xb, y = xs[a], xs[b], _Y0 + (i - 1) * _STEP
        dash = ' stroke-dasharray="6 4"' if dashed else ""
        sw = 2 if kind == "highlight" else 1.4
        p.append(f'<line x1="{xa}" y1="{y}" x2="{xb}" y2="{y}" stroke="{line_c}" '
                 f'stroke-width="{sw}"{dash} marker-end="url(#{marker_of[kind]})"/>')
        p.append(f'<text x="{(xa+xb)/2:.1f}" y="{y-9}" text-anchor="middle" '
                 f'font-family="ui-sans-serif,system-ui,sans-serif" font-weight="600" '
                 f'font-size="12" fill="{lbl_c}">{esc(label)}</text>')
        p.append(f'<circle cx="{xa}" cy="{y}" r="9" fill="{circ_c}"/>')
        p.append(f'<text x="{xa}" y="{y+3.6:.1f}" text-anchor="middle" '
                 f'font-family="ui-sans-serif,system-ui,sans-serif" font-weight="700" '
                 f'font-size="10.5" fill="{palette.WHITE}">{i}</text>')
    if spec.get("note"):
        naid, ntext = spec["note"]
        nx, ny = xs[naid], _Y0 + n * _STEP - 12
        p.append(f'<line x1="{nx}" y1="{ny}" x2="{nx+16}" y2="{ny}" '
                 f'stroke="{palette.NOTE_TICK}" stroke-width="1"/>')
        p.append(f'<rect x="{nx+16}" y="{ny-15}" width="200" height="30" '
                 f'fill="{palette.NOTE_FILL}" stroke="{palette.NOTE_STROKE}"/>')
        p.append(f'<text x="{nx+28}" y="{ny+4}" '
                 f'font-family="ui-monospace,Menlo,monospace" font-size="11" '
                 f'fill="{palette.MUTED}">{esc(ntext)}</text>')
    p.append("</svg>")
    return "".join(p)
