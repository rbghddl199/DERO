import checks


def test_clean_svg_passes():
    svg = '<svg><rect fill="none" stroke="#9a9a9a"/><text fill="#141414">x</text></svg>'
    assert checks.scan(svg) == []


def test_flags_rounded_corner():
    assert any("rx" in v for v in checks.scan('<rect rx="8"/>'))


def test_flags_border_radius():
    assert any("border-radius" in v for v in checks.scan("a{border-radius:6px}"))


def test_flags_drop_shadow():
    assert any("shadow" in v.lower() for v in checks.scan('<rect filter="drop-shadow(0 2px 2px)"/>'))


def test_flags_blue_biased_text_fill():
    assert any("blue" in v.lower() or "남색" in v for v in checks.scan('<text fill="#1a212c">x</text>'))
