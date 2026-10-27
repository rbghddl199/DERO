"""산출물 자기검사(R1·R2·R8). 위반 메시지 리스트 반환(빈 = 통과)."""
import re

import palette


def scan(text):
    violations = []
    if "rx=" in text:
        violations.append("R1 위반: rounded corner(rx=) 발견")
    if "border-radius" in text:
        violations.append("R1 위반: border-radius 발견")
    if "drop-shadow" in text.lower() or "box-shadow" in text.lower():
        violations.append("R2 위반: shadow 발견")
    for m in re.finditer(r'<text[^>]*fill="(#[0-9a-fA-F]{6})"', text):
        color = m.group(1).lower()
        if color not in {c.lower() for c in palette.ALLOWED_TEXT}:
            if palette.is_blue_biased(color):
                violations.append(f"R8 위반: blue-biased 텍스트 색 {color}(남색 금지)")
            else:
                violations.append(f"R8 위반: 허용 밖 텍스트 색 {color}")
    return violations
