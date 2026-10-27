"""유저 플로우 / 플로우차트 SVG 씬. 규칙 R1–R8 동일.
step=직각 사각형(흰 배경), decision=다이아몬드, start/end=직각 사각형(연회색).
accent 노드(목표 종단)는 하나만 — 테두리·글자 rose(R7). 스타디움(둥근) 종단 없음(R1).

박스는 라벨·sub 텍스트에 맞춰 자동 크기가 된다: 라벨 폭을 추정(한글 등 전각 ≈ font-size×1.0/자,
영숫자 반각 ≈ 0.6/자)해 박스를 늘리고, 최대 폭 초과 시 구분자(`·`,`—`,공백) 기준으로 자동
줄바꿈해 여러 줄 + 박스 높이 증가(다이아몬드 동일). sub 키(리스트 또는 \\n 구분)로 1차 라벨
아래에 작은 보조 설명(MUTED·mono)을 붙인다. 각 텍스트가 박스 내부(패딩 포함)를 벗어나면
ValueError(R6 확장). 그리드는 행별 최대 높이·열별 최대 폭 기준으로 배치(가변 박스 겹침 방지)."""
import re

import palette
from xmlutil import esc

# 타입별 최소 박스 크기(라벨이 짧아도 이 이하로 줄지 않음)
STEP_MIN_W, STEP_MIN_H = 148, 56
TERM_MIN_W, TERM_MIN_H = 132, 48
DEC_MIN_W, DEC_MIN_H = 158, 84

LABEL_FS = 12.5      # 1차 라벨 폰트 크기
SUB_FS = 10.0        # 보조(sub) 라벨 폰트 크기
LABEL_LH = 16.0      # 라벨 줄 높이
SUB_LH = 13.0        # sub 줄 높이
SUB_GAP = 4.0        # 라벨 블록과 sub 블록 사이 간격
PAD_X = 16.0         # 박스 내부 좌우 패딩
PAD_Y = 12.0         # 박스 내부 상하 패딩
MAX_CONTENT_W = 200.0  # 이 폭을 넘으면 자동 줄바꿈

GAP_X = 44.0         # 열 사이 최소 간격
GAP_Y = 46.0         # 행 사이 최소 간격
MARGIN_X = 90.0
MARGIN_Y = 80.0

# 자동 줄바꿈 구분자: 공백 · 가운뎃점류 · 대시류
_WRAP_RE = re.compile(r"(\s+|[·‧・•—–])")

_MARK = (
    f'<defs><marker id="fl-arw" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" '
    f'markerHeight="7" orient="auto-start-reverse">'
    f'<path d="M0 0 L10 5 L0 10 z" fill="{palette.LINE}"/></marker></defs>'
)


def _is_wide(ch):
    """전각(한글·CJK·가나·전각기호)이면 True — 폭 추정에 font-size×1.0/자로 잡는다."""
    o = ord(ch)
    return (
        0x1100 <= o <= 0x11FF        # Hangul Jamo
        or 0x3000 <= o <= 0x9FFF     # CJK 기호·구두점, 가나, CJK 통합 한자
        or 0xAC00 <= o <= 0xD7A3     # Hangul 음절
        or 0xF900 <= o <= 0xFAFF     # CJK 호환 한자
        or 0xFF00 <= o <= 0xFFEF     # 전각 형태
    )


def _text_width(s, fs):
    """텍스트 렌더 폭 근사: 전각 ≈ fs×1.0/자, 반각(영숫자·기호) ≈ fs×0.6/자."""
    return sum(fs * (1.0 if _is_wide(c) else 0.6) for c in s)


def _wrap(text, fs, max_w):
    """max_w를 넘으면 구분자(공백···—) 기준으로 여러 줄로 나눈다. 단일 토큰이 max_w를
    넘으면 쪼개지 않고 그 줄로 둔다(박스가 대신 늘어난다). 최소 한 줄은 반환."""
    tokens = [t for t in _WRAP_RE.split(text) if t]
    lines, cur = [], ""
    for tok in tokens:
        cand = cur + tok
        if cur.strip() and _text_width(cand.strip(), fs) > max_w:
            lines.append(cur.strip())
            cur = "" if tok.isspace() else tok
        else:
            cur = cand
    if cur.strip():
        lines.append(cur.strip())
    return lines or [text.strip() or text]


def _sub_lines(sub):
    """sub(리스트 또는 \\n 구분 문자열)를 줄 리스트로 편다(각 줄도 자동 줄바꿈)."""
    if not sub:
        return []
    raw = sub if isinstance(sub, (list, tuple)) else str(sub).split("\n")
    out = []
    for entry in raw:
        for piece in str(entry).split("\n"):
            piece = piece.strip()
            if piece:
                out += _wrap(piece, SUB_FS, MAX_CONTENT_W)
    return out


def _measure(n):
    """노드의 라벨/ sub 줄과 박스 크기를 계산한다."""
    t = n["type"]
    label_lines = _wrap(n["label"], LABEL_FS, MAX_CONTENT_W)
    sub_lines = _sub_lines(n.get("sub"))
    cw = max(
        [_text_width(l, LABEL_FS) for l in label_lines]
        + [_text_width(l, SUB_FS) for l in sub_lines]
        + [0.0]
    )
    chh = len(label_lines) * LABEL_LH
    if sub_lines:
        chh += SUB_GAP + len(sub_lines) * SUB_LH
    if t == "decision":
        # 다이아몬드: 중심에 놓인 텍스트 박스가 마름모 안에 들어오려면 폭·높이를 두 배로.
        w = max(DEC_MIN_W, 2.0 * (cw + PAD_X))
        h = max(DEC_MIN_H, 2.0 * (chh + PAD_Y))
    elif t in ("start", "end"):
        w = max(TERM_MIN_W, cw + 2.0 * PAD_X)
        h = max(TERM_MIN_H, chh + 2.0 * PAD_Y)
    else:
        w = max(STEP_MIN_W, cw + 2.0 * PAD_X)
        h = max(STEP_MIN_H, chh + 2.0 * PAD_Y)
    return {"label_lines": label_lines, "sub_lines": sub_lines,
            "w": w, "h": h, "cw": cw, "chh": chh, "type": t}


def _assert_fits(nid, d):
    """R6 확장: 추정 텍스트 폭·높이가 박스 내부(패딩 포함)를 벗어나면 ValueError."""
    cw, chh, w, h = d["cw"], d["chh"], d["w"], d["h"]
    eps = 0.5
    if d["type"] == "decision":
        # 중심 정렬 사각형이 마름모에 내접: cw/W + chh/H <= 1
        if cw / w + chh / h > 1.0 + 1e-6:
            raise ValueError(
                f"node '{nid}': 텍스트가 다이아몬드 박스 밖으로 이탈 "
                f"(cw/W+chh/H={cw / w + chh / h:.3f} > 1) (R6)")
        return
    if cw > w - 2.0 * PAD_X + eps:
        raise ValueError(
            f"node '{nid}': 텍스트 폭 {cw:.1f} > 박스 내부 폭 {w - 2.0 * PAD_X:.1f} "
            f"(박스 밖 이탈, R6)")
    if chh > h - 2.0 * PAD_Y + eps:
        raise ValueError(
            f"node '{nid}': 텍스트 높이 {chh:.1f} > 박스 내부 높이 {h - 2.0 * PAD_Y:.1f} "
            f"(박스 밖 이탈, R6)")


def _layout(nodes):
    """행별 최대 높이·열별 최대 폭 기준으로 좌표를 정한다(가변 박스 겹침 방지)."""
    m = {k: _measure(n) for k, n in nodes.items()}
    for k in m:
        _assert_fits(k, m[k])
    cols = sorted({n["col"] for n in nodes.values()})
    rows = sorted({n["row"] for n in nodes.values()})
    col_w = {c: max(m[k]["w"] for k, n in nodes.items() if n["col"] == c) for c in cols}
    row_h = {r: max(m[k]["h"] for k, n in nodes.items() if n["row"] == r) for r in rows}
    col_cx, x = {}, MARGIN_X
    for c in cols:
        col_cx[c] = x + col_w[c] / 2.0
        x += col_w[c] + GAP_X
    row_cy, y = {}, MARGIN_Y
    for r in rows:
        row_cy[r] = y + row_h[r] / 2.0
        y += row_h[r] + GAP_Y
    pos = {k: (col_cx[n["col"]], row_cy[n["row"]]) for k, n in nodes.items()}
    return m, pos


def _baseline(top, i, lh, fs):
    """줄 i의 baseline y — 줄 슬롯 중앙 정렬 근사."""
    return top + i * lh + lh * 0.5 + fs * 0.32


def _bottom(nid, pos, m):
    cx, cy = pos[nid]
    return cx, cy + m[nid]["h"] / 2.0


def _top(nid, pos, m):
    cx, cy = pos[nid]
    return cx, cy - m[nid]["h"] / 2.0


def _right(nid, pos, m):
    cx, cy = pos[nid]
    return cx + m[nid]["w"] / 2.0, cy


def _route(a, b, path, pos, m):
    if path:
        return path
    if pos[a][0] == pos[b][0]:
        sx, sy = _bottom(a, pos, m)
        _, ey = _top(b, pos, m)
        return f"M{sx:.0f} {sy:.0f} V{ey:.0f}"
    sx, sy = _right(a, pos, m)
    ex, ey = _top(b, pos, m)
    return f"M{sx:.0f} {sy:.0f} H{ex:.0f} V{ey:.0f}"


def _label_pos(a, b, pos, m):
    if pos[a][0] == pos[b][0]:
        sx, sy = _bottom(a, pos, m)
        _, ey = _top(b, pos, m)
        return sx, (sy + ey) / 2.0
    sx, sy = _right(a, pos, m)
    ex = pos[b][0]
    return (sx + ex) / 2.0, sy - 8.0


def _node(nid, n, pos, m):
    cx, cy = pos[nid]
    d = m[nid]
    t = n["type"]
    w, h = d["w"], d["h"]
    accent = bool(n.get("accent"))
    border = palette.ACCENT if accent else palette.MARK
    text_c = palette.ACCENT if accent else palette.INK
    sw = 2 if accent else 1.4
    out = []
    if t == "decision":
        pts = (f"{cx:.1f},{cy - h / 2:.1f} {cx + w / 2:.1f},{cy:.1f} "
               f"{cx:.1f},{cy + h / 2:.1f} {cx - w / 2:.1f},{cy:.1f}")
        out.append(f'<polygon points="{pts}" fill="{palette.WHITE}" '
                   f'stroke="{border}" stroke-width="{sw}"/>')
    else:
        fill = palette.HDR_FILL if (t in ("start", "end") and not accent) else palette.WHITE
        out.append(f'<rect x="{cx - w / 2:.1f}" y="{cy - h / 2:.1f}" width="{w:.1f}" '
                   f'height="{h:.1f}" fill="{fill}" stroke="{border}" stroke-width="{sw}"/>')
    # 라벨·sub 블록을 세로 중앙 정렬
    block_top = cy - d["chh"] / 2.0
    label_lines = d["label_lines"]
    for i, line in enumerate(label_lines):
        by = _baseline(block_top, i, LABEL_LH, LABEL_FS)
        out.append(f'<text x="{cx:.1f}" y="{by:.1f}" text-anchor="middle" '
                   f'font-family="ui-sans-serif,system-ui,sans-serif" font-weight="600" '
                   f'font-size="{LABEL_FS}" fill="{text_c}">{esc(line)}</text>')
    if d["sub_lines"]:
        sub_top = block_top + len(label_lines) * LABEL_LH + SUB_GAP
        for j, line in enumerate(d["sub_lines"]):
            by = _baseline(sub_top, j, SUB_LH, SUB_FS)
            out.append(f'<text x="{cx:.1f}" y="{by:.1f}" text-anchor="middle" '
                       f'font-family="ui-monospace,Menlo,monospace" '
                       f'font-size="{SUB_FS}" fill="{palette.MUTED}">{esc(line)}</text>')
    return "<g>" + "".join(out) + "</g>"


def render_flow(spec):
    nodes = spec["nodes"]
    if not nodes:
        raise ValueError("flow spec has no nodes")
    if sum(1 for n in nodes.values() if n.get("accent")) > 1:
        raise ValueError("flow may have at most one accent node (R7)")
    seen = {}
    for k, n in nodes.items():
        cell = (n["col"], n["row"])
        if cell in seen:
            raise ValueError("nodes overlap — two nodes share a grid cell")
        seen[cell] = k
    m, pos = _layout(nodes)
    xs, ys = [], []
    for k in nodes:
        cx, cy = pos[k]
        w, h = m[k]["w"], m[k]["h"]
        xs += [cx - w / 2, cx + w / 2]
        ys += [cy - h / 2, cy + h / 2]
    cw, ch = max(xs) + 40, max(ys) + 40
    p = [f'<svg viewBox="0 0 {cw:.0f} {ch:.0f}" width="100%" role="img" '
         f'aria-label="user flow" xmlns="http://www.w3.org/2000/svg">', _MARK]
    for c in spec.get("connectors", []):
        d = _route(c["from"], c["to"], c.get("path"), pos, m)
        p.append(f'<path d="{d}" fill="none" stroke="{palette.LINE}" stroke-width="1.6" '
                 f'marker-end="url(#fl-arw)"/>')
        if c.get("label"):
            lx, ly = _label_pos(c["from"], c["to"], pos, m)
            p.append(f'<text x="{lx:.1f}" y="{ly:.1f}" text-anchor="middle" '
                     f'font-family="ui-monospace,Menlo,monospace" font-weight="600" '
                     f'font-size="10.5" fill="{palette.INK}" paint-order="stroke" '
                     f'stroke="{palette.WHITE}" stroke-width="3.4" stroke-linejoin="round">'
                     f'{esc(c["label"])}</text>')
    for k, n in nodes.items():
        p.append(_node(k, n, pos, m))
    p.append("</svg>")
    return "".join(p)
