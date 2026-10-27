"""로고 카탈로그: SVG 자산 → base64 data URI 인라인. 없으면 텍스트 칩 폴백.
base64 <image>로 넣어 로고 간 ID 충돌 차단·CSP 안전(정본 스펙 §7)."""
import base64
import os

import palette

_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "logos")


def logo_data_uri(key):
    path = os.path.join(_DIR, key + ".svg")
    if not os.path.exists(path):
        return None
    with open(path, "rb") as f:
        return "data:image/svg+xml;base64," + base64.b64encode(f.read()).decode()


def logo_svg(key, cx, top, size=46):
    uri = logo_data_uri(key)
    if uri:
        return (f'<image href="{uri}" x="{cx-size/2:.1f}" y="{top:.1f}" '
                f'width="{size}" height="{size}" preserveAspectRatio="xMidYMid meet"/>')
    # 폴백: 직각 텍스트 칩(R1)
    w = size + 10
    return (f'<rect x="{cx-w/2:.1f}" y="{top:.1f}" width="{w}" height="{size}" '
            f'fill="none" stroke="{palette.ZONE}"/>'
            f'<text x="{cx:.1f}" y="{top+size/2+3:.1f}" text-anchor="middle" '
            f'font-family="ui-sans-serif,system-ui,sans-serif" font-size="9" '
            f'fill="{palette.INK}">{key}</text>')
