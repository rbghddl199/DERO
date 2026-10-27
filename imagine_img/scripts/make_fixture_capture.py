"""회귀 테스트용 고정 입력 이미지를 만든다 (설계서 §18.4).

DERO 시뮬레이터가 이 저장소에 없어서 실제 캡처를 쓸 수 없다.
그래서 "책상 + 모니터 + 키보드 + 램프" 배치를 가진 1152x1024 도형 이미지를 결정적으로 그린다.
Img2Img 가 보존해야 하는 것이 무엇인지 눈으로 확인할 수 있는 최소한의 장면이다.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "desk_capture.png"
SIZE = (1152, 1024)

# 새 지시문 §8: "시뮬레이터에서 조명 상태가 먼저 적용된 캡처 이미지를 입력으로 사용해야 한다."
# 그래서 조명이 구워진 fixture 4장을 만들 수 있게 했다. 이것이 없으면 §18 의 평가 항목
# 6·7(낮/밤 차이, 조명 ON/OFF 차이)을 측정할 대상 자체가 없다.
LIGHTING = {
    ("DAY", True): {"wall": (231, 228, 222), "floor": (196, 176, 152), "window": (176, 206, 224), "lamp": (240, 228, 150), "gain": 1.00},
    ("DAY", False): {"wall": (206, 203, 198), "floor": (172, 155, 134), "window": (176, 206, 224), "lamp": (150, 146, 120), "gain": 0.88},
    ("NIGHT", True): {"wall": (150, 138, 122), "floor": (120, 104, 86), "window": (26, 30, 44), "lamp": (255, 226, 150), "gain": 0.62},
    ("NIGHT", False): {"wall": (60, 58, 60), "floor": (44, 40, 38), "window": (18, 20, 32), "lamp": (70, 68, 62), "gain": 0.28},
}


def draw_capture(time_of_day: str = "DAY", room_light_on: bool = True) -> Image.Image:
    tone = LIGHTING[(time_of_day, room_light_on)]
    image = Image.new("RGB", SIZE, tone["wall"])  # 벽
    draw = ImageDraw.Draw(image)

    # 바닥
    draw.rectangle((0, 760, 1152, 1024), fill=tone["floor"])
    # 창문 (낮/밤이 실제로 구워지는 곳)
    draw.rectangle((60, 120, 360, 460), fill=tone["window"], outline=(120, 120, 120), width=6)
    draw.line((210, 120, 210, 460), fill=(120, 120, 120), width=6)

    # 책상 상판과 다리
    draw.rectangle((150, 700, 1010, 740), fill=(146, 108, 70))
    draw.rectangle((180, 740, 205, 940), fill=(120, 88, 56))
    draw.rectangle((960, 740, 985, 940), fill=(120, 88, 56))

    # 모니터 1대 (개수 보존이 평가 항목이다)
    draw.rectangle((470, 380, 800, 600), fill=(28, 30, 34), outline=(90, 92, 96), width=5)
    draw.rectangle((490, 400, 780, 580), fill=(58, 74, 96))
    draw.rectangle((620, 600, 650, 680), fill=(70, 72, 76))
    draw.rectangle((570, 680, 700, 700), fill=(70, 72, 76))

    # 컴팩트 키보드
    draw.rectangle((520, 706, 760, 736), fill=(238, 238, 236), outline=(180, 180, 178), width=3)
    for x in range(530, 755, 16):
        draw.rectangle((x, 712, x + 11, 730), fill=(214, 214, 212))

    # 마우스
    draw.ellipse((790, 708, 830, 734), fill=(238, 238, 236), outline=(180, 180, 178))

    # 데스크 램프 (조명 상태가 갓 색에 반영된다)
    draw.rectangle((260, 690, 320, 702), fill=(58, 58, 58))
    draw.line((290, 690, 300, 560), fill=(58, 58, 58), width=8)
    draw.polygon([(255, 560), (345, 560), (320, 512), (280, 512)], fill=tone["lamp"])

    # 머그컵
    mug = int(226 * tone["gain"])
    draw.rectangle((880, 668, 920, 704), fill=(mug, mug, mug), outline=(170, 170, 170))

    return image


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--all", action="store_true", help="조명 4조합 fixture 를 모두 만든다")
    args = parser.parse_args()

    OUT.parent.mkdir(parents=True, exist_ok=True)

    if not args.all:
        image = draw_capture()
        assert image.size == SIZE
        image.save(OUT, format="PNG")
        print(f"wrote {OUT} ({image.size[0]}x{image.size[1]})")
        return 0

    for (time_of_day, room_light_on) in LIGHTING:
        image = draw_capture(time_of_day, room_light_on)
        assert image.size == SIZE
        name = f"desk_capture_{time_of_day.lower()}_{'on' if room_light_on else 'off'}.png"
        image.save(OUT.parent / name, format="PNG")
        print(f"wrote {OUT.parent / name}")
    # 기본 fixture 는 DAY/ON 과 동일하게 유지한다 (기존 테스트가 이 파일을 쓴다).
    draw_capture("DAY", True).save(OUT, format="PNG")
    print(f"wrote {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
