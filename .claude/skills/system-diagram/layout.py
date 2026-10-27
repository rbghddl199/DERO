"""논리 위치(col,row) → 좌표. 존 bbox·겹침 가드(정본 스펙 §6, R6)."""

NODE_W = 112
NODE_H = 84
PITCH_X = 170
PITCH_Y = 96
MARGIN_X = 100
MARGIN_Y = 120
PAD_SIDE = 20
PAD_TOP = 30
PAD_BOTTOM = 16


def place(node):
    return (MARGIN_X + node["col"] * PITCH_X, MARGIN_Y + node["row"] * PITCH_Y)


def node_rect(cx, cy):
    return (cx - NODE_W / 2, cy - NODE_H / 2, cx + NODE_W / 2, cy + NODE_H / 2)


def group_bbox(member_centers):
    rects = [node_rect(cx, cy) for cx, cy in member_centers]
    left = min(r[0] for r in rects) - PAD_SIDE
    top = min(r[1] for r in rects) - PAD_TOP
    right = max(r[2] for r in rects) + PAD_SIDE
    bottom = max(r[3] for r in rects) + PAD_BOTTOM
    return (left, top, right - left, bottom - top)


def canvas_size(nodes):
    centers = [place(n) for n in nodes.values()]
    w = max(cx for cx, _ in centers) + NODE_W / 2 + 40
    h = max(cy for _, cy in centers) + NODE_H / 2 + 40
    return (w, h)


def _overlaps(r1, r2):
    return not (r1[2] <= r2[0] or r2[2] <= r1[0] or r1[3] <= r2[1] or r2[3] <= r1[1])


def has_overlap(nodes):
    rects = [node_rect(*place(n)) for n in nodes.values()]
    for i in range(len(rects)):
        for j in range(i + 1, len(rects)):
            if _overlaps(rects[i], rects[j]):
                return True
    return False
