import xml.dom.minidom

import flow
import palette

SPEC = {
    "kind": "flow", "title": "t",
    "nodes": {
        "s": {"type": "start", "label": "시작", "col": 0, "row": 0},
        "d": {"type": "decision", "label": "OK?", "col": 0, "row": 1},
        "a": {"type": "end", "label": "성공", "col": 0, "row": 2, "accent": True},
        "b": {"type": "end", "label": "실패 & 재시도", "col": 1, "row": 2},
    },
    "connectors": [
        {"from": "s", "to": "d"},
        {"from": "d", "to": "a", "label": "예"},
        {"from": "d", "to": "b", "label": "아니오"},
    ],
}


def test_returns_svg_root():
    out = flow.render_flow(SPEC)
    assert out.startswith("<svg") and out.endswith("</svg>")


def test_no_rounded_corners():
    assert "rx=" not in flow.render_flow(SPEC)


def test_decision_is_diamond_polygon():
    assert "<polygon" in flow.render_flow(SPEC)


def test_accent_node_uses_accent_color():
    assert palette.ACCENT in flow.render_flow(SPEC)


def test_two_accents_raises():
    bad = {**SPEC, "nodes": {**SPEC["nodes"],
           "b": {"type": "end", "label": "x", "col": 1, "row": 2, "accent": True}}}
    try:
        flow.render_flow(bad)
        assert False
    except ValueError as e:
        assert "accent" in str(e)


def test_empty_raises():
    try:
        flow.render_flow({"nodes": {}, "connectors": []})
        assert False
    except ValueError as e:
        assert "no nodes" in str(e)


def test_overlap_raises():
    bad = {"nodes": {"x": {"type": "step", "label": "x", "col": 0, "row": 0},
                     "y": {"type": "step", "label": "y", "col": 0, "row": 0}},
           "connectors": []}
    try:
        flow.render_flow(bad)
        assert False
    except ValueError as e:
        assert "overlap" in str(e)


def test_labels_escaped_and_valid_xml():
    out = flow.render_flow(SPEC)
    assert "&amp;" in out and "실패 & 재시도" not in out
    xml.dom.minidom.parseString(out)
