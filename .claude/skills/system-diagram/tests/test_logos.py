import logos


def test_known_logo_returns_data_uri():
    uri = logos.logo_data_uri("postgres")
    assert uri.startswith("data:image/svg+xml;base64,")


def test_missing_logo_returns_none():
    assert logos.logo_data_uri("no_such_logo_xyz") is None


def test_logo_svg_known_emits_image():
    frag = logos.logo_svg("postgres", cx=100, top=50)
    assert "<image" in frag and "data:image/svg+xml;base64," in frag


def test_logo_svg_missing_emits_sharp_chip_fallback():
    frag = logos.logo_svg("no_such_logo_xyz", cx=100, top=50)
    assert "<image" not in frag
    assert "<rect" in frag and "rx=" not in frag   # R1: 폴백도 직각
    assert "no_such_logo_xyz" in frag
