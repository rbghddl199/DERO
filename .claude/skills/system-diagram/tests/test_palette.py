import palette


def test_all_text_colors_are_not_blue_biased():
    for c in palette.ALLOWED_TEXT:
        assert not palette.is_blue_biased(c), c


def test_is_blue_biased_flags_navy_greys():
    assert palette.is_blue_biased("#1a212c")   # 옛 ink(남색기)
    assert palette.is_blue_biased("#2a3440")   # 옛 seqact
    assert palette.is_blue_biased("#63707f")   # 옛 muted


def test_is_blue_biased_passes_neutrals_and_accent():
    assert not palette.is_blue_biased("#141414")  # 검정
    assert not palette.is_blue_biased("#6b6b6b")  # 뉴트럴 그레이
    assert not palette.is_blue_biased("#c65e78")  # rose 강조
    assert not palette.is_blue_biased("#ffffff")


def test_accent_is_rose_and_ink_is_black():
    assert palette.ACCENT == "#c65e78"
    assert palette.INK == "#141414"


def test_page_chrome_colors_are_single_sourced_in_palette():  # FIX5
    assert palette.PAGE_BG == "#f6f7f9"
    assert palette.PAGE_CARD == "#ffffff"
    assert palette.PAGE_BORDER == "#e3e3e5"
    # chrome, not text — must not leak into the R8 allowed-text-color set
    assert palette.PAGE_BG not in palette.ALLOWED_TEXT
    assert palette.PAGE_BORDER not in palette.ALLOWED_TEXT
