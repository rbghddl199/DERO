"""아키텍처 SVG 씬. 규칙을 코드로 강제(R1 직각·R2 무그림자·R3 투명존·R5 로고·R8 검정)."""
import palette
import layout
from logos import logo_svg
from xmlutil import esc

_MARKER = (
    f'<defs><marker id="arw" viewBox="0 0 10 10" refX="8.5" refY="5" '
    f'markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
    f'<path d="M0 0 L10 5 L0 10 z" fill="{palette.LINE}"/></marker></defs>'
)


def _node(n):
    cx, cy = layout.place(n)
    top = cy - layout.NODE_H / 2
    out = [logo_svg(n["logo"], cx, top + 12)]
    out.append(f'<text x="{cx:.1f}" y="{top+63:.1f}" text-anchor="middle" '
               f'font-family="ui-sans-serif,system-ui,sans-serif" font-weight="700" '
               f'font-size="13" fill="{palette.INK}">{esc(n["label"])}</text>')
    if n.get("sub"):
        out.append(f'<text x="{cx:.1f}" y="{top+77:.1f}" text-anchor="middle" '
                   f'font-family="ui-monospace,Menlo,monospace" font-size="10" '
                   f'fill="{palette.MUTED}">{esc(n["sub"])}</text>')
    return "".join(out)


def _group(g, nodes):
    members = [layout.place(n) for n in nodes.values() if n.get("group") == g["id"]]
    if not members:
        raise ValueError(f"group '{g['id']}' has no member nodes")
    x, y, w, h = layout.group_bbox(members)
    dash = ' stroke-dasharray="7 5"' if g.get("dashed") else ""
    return (f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" '
            f'fill="none" stroke="{palette.ZONE}" stroke-width="{g["emphasis"]}"{dash}/>'
            f'<text x="{x+15:.1f}" y="{y+20:.1f}" font-family="ui-sans-serif,system-ui,sans-serif" '
            f'font-weight="700" font-size="10.5" letter-spacing="1.4" '
            f'fill="{palette.INK}">{esc(g["label"])}</text>')


def _auto_path(a, b):
    ax, ay = layout.place(a)
    bx, by = layout.place(b)
    if ax == bx:
        # 같은 컬럼: 위/아래 가장자리끼리 수직 한 획으로 연결(FIX2)
        if by >= ay:
            return f"M{ax:.0f} {ay + layout.NODE_H/2:.0f} V{by - layout.NODE_H/2:.0f}"
        return f"M{ax:.0f} {ay - layout.NODE_H/2:.0f} V{by + layout.NODE_H/2:.0f}"
    sx = ax + layout.NODE_W / 2 if bx >= ax else ax - layout.NODE_W / 2
    ex = bx - layout.NODE_W / 2 if bx >= ax else bx + layout.NODE_W / 2
    if ay == by:
        return f"M{sx:.0f} {ay:.0f} H{ex:.0f}"
    mx = (sx + ex) / 2
    return f"M{sx:.0f} {ay:.0f} H{mx:.0f} V{by:.0f} H{ex:.0f}"


def _connector(c, nodes):
    d = c.get("path") or _auto_path(nodes[c["from"]], nodes[c["to"]])
    dash = ' stroke-dasharray="5 4"' if c.get("dashed") else ""
    return (f'<path d="{d}" fill="none" stroke="{palette.LINE}" stroke-width="1.6"'
            f'{dash} marker-end="url(#arw)"/>')


def _edge_label(el, nodes):
    a, b = el["on"]
    ax, ay = layout.place(nodes[a])
    bx, by = layout.place(nodes[b])
    x, y = (ax + bx) / 2, (ay + by) / 2 - 9
    return (f'<text x="{x:.1f}" y="{y:.1f}" text-anchor="middle" '
            f'font-family="ui-monospace,Menlo,monospace" font-weight="600" font-size="10.5" '
            f'fill="{palette.INK}" paint-order="stroke" stroke="{palette.WHITE}" '
            f'stroke-width="3.4" stroke-linejoin="round">{esc(el["text"])}</text>')


def render_architecture(spec):
    nodes = spec["nodes"]
    if not nodes:
        raise ValueError("architecture spec has no nodes")
    if layout.has_overlap(nodes):
        raise ValueError("nodes overlap — two nodes share a grid cell")
    w, h = layout.canvas_size(nodes)
    parts = [f'<svg viewBox="0 0 {w:.0f} {h:.0f}" width="100%" role="img" '
             f'aria-label="architecture" xmlns="http://www.w3.org/2000/svg">', _MARKER]
    for g in spec.get("groups", []):
        parts.append(_group(g, nodes))
    for c in spec.get("connectors", []):
        parts.append(_connector(c, nodes))
    for n in nodes.values():
        parts.append(_node(n))
    for el in spec.get("edge_labels", []):
        parts.append(_edge_label(el, nodes))
    parts.append("</svg>")
    return "".join(parts)
