import re
import xml.dom.minidom as minidom

import pytest

import layout
import scene

SPEC = {
    "nodes": {
        "a": {"logo": "postgres", "label": "PostgreSQL", "sub": "정본", "col": 0, "row": 0, "group": "g1"},
        "b": {"logo": "qdrant", "label": "Qdrant", "sub": "의미", "col": 1, "row": 0, "group": "g1"},
    },
    "groups": [{"id": "g1", "label": "저장 · STORE", "emphasis": 2.6, "dashed": False}],
    "connectors": [{"from": "a", "to": "b"}],
    "edge_labels": [{"on": ("a", "b"), "text": "임베딩"}],
}


def test_returns_svg_root():
    out = scene.render_architecture(SPEC)
    assert out.startswith("<svg") and out.endswith("</svg>")


def test_no_rounded_corners_anywhere():          # R1
    assert "rx=" not in scene.render_architecture(SPEC)


def test_groups_have_transparent_fill():         # R3
    out = scene.render_architecture(SPEC)
    group_rects = re.findall(r"<rect[^>]*stroke=\"#9a9a9a\"[^>]*>", out)
    assert group_rects and all('fill="none"' in r for r in group_rects)


def test_one_logo_image_per_node():              # R5
    out = scene.render_architecture(SPEC)
    assert out.count("<image") == 2


def test_emphasis_maps_to_stroke_width():        # R7
    out = scene.render_architecture(SPEC)
    assert 'stroke-width="2.6"' in out


def test_edge_label_uses_halo_not_box():         # R7/R8 헤일로
    out = scene.render_architecture(SPEC)
    assert 'paint-order="stroke"' in out and "임베딩" in out


def test_user_strings_are_xml_escaped_and_output_is_valid_xml():  # FIX1
    spec = {
        "nodes": {
            "a": {"logo": "postgres", "label": "A & B <x>", "sub": "S & T <y>",
                  "col": 0, "row": 0, "group": "g1"},
            "b": {"logo": "qdrant", "label": "Qdrant", "sub": "의미", "col": 1, "row": 0, "group": "g1"},
        },
        "groups": [{"id": "g1", "label": "색인 · 저장 · INDEX & STORE", "emphasis": 2.6, "dashed": False}],
        "connectors": [{"from": "a", "to": "b"}],
        "edge_labels": [{"on": ("a", "b"), "text": "E & F <z>"}],
    }
    out = scene.render_architecture(spec)
    assert "&amp;" in out
    assert "&lt;x&gt;" in out
    assert "A & B <x>" not in out
    assert "INDEX & STORE" not in out
    minidom.parseString(out)  # raises if not well-formed XML


def _same_col_spec(top_row, bottom_row):
    return {
        "nodes": {
            "top": {"logo": "airflow", "label": "Top", "sub": None, "col": 0, "row": top_row, "group": None},
            "bottom": {"logo": "crawler", "label": "Bottom", "sub": None, "col": 0, "row": bottom_row, "group": None},
        },
        "groups": [],
        "connectors": [{"from": "top", "to": "bottom"}],
        "edge_labels": [],
    }


def test_same_column_connector_routes_vertically_target_below():  # FIX2
    spec = _same_col_spec(top_row=0, bottom_row=2)
    out = scene.render_architecture(spec)
    m = re.search(r'<path d="([^"]+)" fill="none" stroke="#8a8a8a"', out)
    assert m, "connector path not found"
    d = m.group(1)
    tx, ty = layout.place(spec["nodes"]["top"])
    bx, by = layout.place(spec["nodes"]["bottom"])
    assert d == f"M{tx:.0f} {ty + layout.NODE_H/2:.0f} V{by - layout.NODE_H/2:.0f}"
    assert "H" not in d   # pure vertical segment, no left/right elbow doubling


def test_same_column_connector_routes_vertically_target_above():  # FIX2 symmetry
    spec = _same_col_spec(top_row=2, bottom_row=0)  # "top" node is visually below "bottom"
    out = scene.render_architecture(spec)
    m = re.search(r'<path d="([^"]+)" fill="none" stroke="#8a8a8a"', out)
    assert m, "connector path not found"
    d = m.group(1)
    tx, ty = layout.place(spec["nodes"]["top"])
    bx, by = layout.place(spec["nodes"]["bottom"])
    assert d == f"M{tx:.0f} {ty - layout.NODE_H/2:.0f} V{by + layout.NODE_H/2:.0f}"
    assert "H" not in d


def test_render_architecture_raises_clear_error_on_no_nodes():  # FIX3
    spec = {"nodes": {}, "groups": [], "connectors": [], "edge_labels": []}
    with pytest.raises(ValueError, match="architecture spec has no nodes"):
        scene.render_architecture(spec)


def test_group_with_no_member_nodes_raises_clear_error():  # FIX3
    spec = {
        "nodes": {"a": {"logo": "postgres", "label": "A", "sub": None,
                         "col": 0, "row": 0, "group": "real"}},
        "groups": [{"id": "ghost", "label": "Ghost", "emphasis": 1.0, "dashed": False}],
        "connectors": [],
        "edge_labels": [],
    }
    with pytest.raises(ValueError, match="group 'ghost' has no member nodes"):
        scene.render_architecture(spec)


def test_render_architecture_raises_on_overlapping_nodes():  # FIX6
    spec = {
        "nodes": {
            "a": {"logo": "postgres", "label": "A", "sub": None, "col": 0, "row": 0, "group": None},
            "b": {"logo": "qdrant", "label": "B", "sub": None, "col": 0, "row": 0, "group": None},
        },
        "groups": [],
        "connectors": [],
        "edge_labels": [],
    }
    with pytest.raises(ValueError, match="nodes overlap"):
        scene.render_architecture(spec)
