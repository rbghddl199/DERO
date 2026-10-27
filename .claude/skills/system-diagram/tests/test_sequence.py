import re
import xml.dom.minidom as minidom

import pytest

import palette
import sequence

SPEC = {
    "actors": [("U", "사용자"), ("D", "Django API"), ("Q", "Qdrant")],
    "messages": [
        ("U", "D", "질문", "call"),
        ("Q", "D", "top-k", "return"),
        ("D", "U", "근거 인용 답변", "highlight"),
    ],
    "note": ("D", "스코프 가드"),
}


def test_returns_svg_root():
    out = sequence.render_sequence(SPEC)
    assert out.startswith("<svg") and out.endswith("</svg>")


def test_no_rounded_corners():                    # R1
    assert "rx=" not in sequence.render_sequence(SPEC)


def test_actor_headers_present():
    out = sequence.render_sequence(SPEC)
    for _, label in SPEC["actors"]:
        assert label in out
    # one lifeline per actor
    assert out.count(f'stroke="{sequence.palette.LIFELINE}"') == len(SPEC["actors"])


def test_number_marker_per_message():
    out = sequence.render_sequence(SPEC)
    assert out.count("<circle") == 3


def test_only_highlight_uses_accent():            # R7/R8 — exclusivity, not just presence
    out = sequence.render_sequence(SPEC)
    accent = palette.ACCENT

    # call message (U->D, "질문") uses LINE, never ACCENT
    call_line = re.search(r'<line[^>]*marker-end="url\(#sq-call\)"[^>]*/>', out)
    assert call_line, "call message line not found"
    assert f'stroke="{palette.LINE}"' in call_line.group(0)
    assert accent not in call_line.group(0)

    # return message (Q->D, "top-k") uses LINE_SOFT, never ACCENT
    return_line = re.search(r'<line[^>]*marker-end="url\(#sq-ret\)"[^>]*/>', out)
    assert return_line, "return message line not found"
    assert f'stroke="{palette.LINE_SOFT}"' in return_line.group(0)
    assert accent not in return_line.group(0)

    # call/return 라벨은 검정
    assert 'fill="#141414"' in out

    # ACCENT appears ONLY in the highlight message's own elements (line + label + circle)
    # plus the sq-hi marker def — nowhere else in the document.
    hi_line = re.search(r'<line[^>]*marker-end="url\(#sq-hi\)"[^>]*/>', out)
    assert hi_line and f'stroke="{accent}"' in hi_line.group(0)
    assert out.count(accent) == 4  # sq-hi marker def + highlight line + label + circle


def test_user_strings_are_xml_escaped_and_output_is_valid_xml():  # FIX1
    spec = {
        "actors": [("U", "사용자 & 관리자"), ("D", "Django API <core>")],
        "messages": [("U", "D", "질문 & 답변 <req>", "call")],
        "note": ("D", "노트 & 텍스트 <n>"),
    }
    out = sequence.render_sequence(spec)
    assert "&amp;" in out
    assert "&lt;" in out
    assert "사용자 & 관리자" not in out
    assert "질문 & 답변 <req>" not in out
    assert "노트 & 텍스트 <n>" not in out
    minidom.parseString(out)  # raises if not well-formed XML


def test_multiple_highlight_messages_raises():  # FIX4, R7
    spec = {
        "actors": [("U", "사용자"), ("D", "Django API")],
        "messages": [
            ("U", "D", "질문", "highlight"),
            ("D", "U", "답변", "highlight"),
        ],
        "note": None,
    }
    with pytest.raises(ValueError, match="at most one highlight message"):
        sequence.render_sequence(spec)
