"""XML 이스케이프 유틸. 사용자 제공 문자열을 SVG에 안전하게 넣기 위함(FIX1)."""


def esc(s):
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
