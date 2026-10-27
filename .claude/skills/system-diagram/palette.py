"""디자인 토큰 — 색 단일 원천. 남색 금지(R8)."""

INK = "#141414"        # 1차 텍스트(검정)
MUTED = "#6b6b6b"      # 2차 텍스트(뉴트럴 그레이)
LINE = "#8a8a8a"       # 커넥터 / 호출선
LINE_SOFT = "#a8a8a8"  # 응답선
LIFELINE = "#d4d4d4"   # 시퀀스 라이프라인
ZONE = "#9a9a9a"       # 존 테두리(단색; 위계는 두께/점선)
MARK = "#2b2b2b"       # 시퀀스 번호 원형
ACCENT = "#c65e78"     # 유일한 의미 강조(rose)
HDR_FILL = "#f0f0f0"
HDR_STROKE = "#d8d8d8"
NOTE_FILL = "#f2f2f2"
NOTE_STROKE = "#dadada"
NOTE_TICK = "#b0b0b0"
WHITE = "#ffffff"

# 페이지 크롬(HTML 배경/카드/테두리) — 텍스트 색이 아니므로 ALLOWED_TEXT에 넣지 않는다(FIX5)
PAGE_BG = "#f6f7f9"
PAGE_CARD = "#ffffff"
PAGE_BORDER = "#e3e3e5"

# 텍스트에 허용되는 색(R8)
ALLOWED_TEXT = {INK, MUTED, ACCENT, WHITE}


def _rgb(hex_color):
    h = hex_color.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def is_blue_biased(hex_color):
    """파랑 채널이 빨강·초록보다 뚜렷이 높으면 True(남색/청색기). 뉴트럴 그레이와
    rose 강조는 False."""
    r, g, b = _rgb(hex_color)
    return b > r and b > g and (b - min(r, g)) >= 10
