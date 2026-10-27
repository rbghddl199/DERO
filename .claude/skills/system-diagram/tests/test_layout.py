import layout


def test_place_uses_grid():
    assert layout.place({"col": 0, "row": 0}) == (100, 120)
    assert layout.place({"col": 1, "row": 2}) == (100 + 170, 120 + 2 * 96)


def test_group_bbox_contains_members_with_padding():
    c1 = layout.place({"col": 0, "row": 0})
    c2 = layout.place({"col": 1, "row": 1})
    x, y, w, h = layout.group_bbox([c1, c2])
    l1, t1, r1, b1 = layout.node_rect(*c1)
    assert x <= l1 and y <= t1 and x + w >= r1 and y + h >= b1


def test_no_overlap_on_distinct_grid_cells():
    nodes = {"a": {"col": 0, "row": 0}, "b": {"col": 1, "row": 0}}
    assert layout.has_overlap(nodes) is False


def test_overlap_detected_on_same_cell():
    nodes = {"a": {"col": 0, "row": 0}, "b": {"col": 0, "row": 0}}
    assert layout.has_overlap(nodes) is True
