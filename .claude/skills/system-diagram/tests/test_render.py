import os

import palette
import render

ARCH = {
    "kind": "architecture",
    "title": "t",
    "nodes": {"a": {"logo": "postgres", "label": "PostgreSQL", "sub": "정본", "col": 0, "row": 0, "group": "g"}},
    "groups": [{"id": "g", "label": "STORE", "emphasis": 1.6, "dashed": False}],
    "connectors": [],
    "edge_labels": [],
}


def test_page_is_self_contained_without_html_tag():
    html = render.page("t", "<svg></svg>")
    assert "<style>" in html and "<!doctype" not in html.lower() and "<html" not in html.lower()


def test_page_css_sources_chrome_colors_from_palette():  # FIX5
    html = render.page("t", "<svg></svg>")
    assert f"background:{palette.PAGE_BG}" in html
    assert f"background:{palette.PAGE_CARD}" in html
    assert f"1px solid {palette.PAGE_BORDER}" in html


def test_render_architecture_dispatch():
    out = render.render(ARCH)
    assert out.startswith("<svg")


def test_write_emits_html_and_svg_and_passes_checks(tmp_path):
    stem = str(tmp_path / "diagram")
    html_path, svg_path = render.write(ARCH, stem)
    assert os.path.exists(html_path) and os.path.exists(svg_path)
    import checks
    assert checks.scan(open(html_path, encoding="utf-8").read()) == []
