"""IP-Adapter 레퍼런스 게이트 (app/reference_gate.py, 2026-08-04).

합성 이미지로 검증한다. 실제 사진 1,199장에 대한 분포는
`python -m app.cli gate-references --report` 로 재고, 이 파일은 **판정 규칙**만 고정한다.
"""

from __future__ import annotations

from PIL import Image, ImageDraw

from app.reference_gate import (
    BAND_COLOR_DISTANCE,
    Kind,
    judge,
    summarize,
)


def _edge_to_edge(size: int = 512) -> Image.Image:
    """흰 배경 · 제품이 **테두리에 닿는** 사진 (859.jpg · 803.jpg 형).

    테두리 편차로 거부하던 판정이 이것들을 버렸다 (859.jpg 는 편차 50.9 인데 흰 배경에
    마이크 하나만 있는 이상적인 레퍼런스다). 그래서 편차를 밝기로 바꿨다.

    **실측값에 맞춰 만든다.** 처음엔 제품을 좌우 끝까지 늘렸는데 테두리 평균이 202 로
    떨어져서, 판정이 아니라 픽스처가 틀렸다 — 실제 859.jpg 는 평균 241.9 다. 그 값이
    나오려면 테두리 면적의 **약 5%**만 제품이어야 한다(253 - 0.05x225 = 242).
    """
    image = Image.new("RGB", (size, size), (253, 253, 253))
    draw = ImageDraw.Draw(image)
    draw.ellipse((70, 90, size - 70, size - 110), fill=(28, 28, 32))
    # 왼쪽 테두리를 100px 만큼 물고 나간다 — 테두리(두께 20) 면적의 약 5%.
    draw.rectangle((0, 210, 120, 310), fill=(28, 28, 32))
    return image


def _studio(size: int = 512, *, product: tuple[int, int, int] = (40, 44, 52)) -> Image.Image:
    """흰 배경 가운데 제품 하나. 게이트가 통과시켜야 하는 유일한 형태다."""
    image = Image.new("RGB", (size, size), (252, 252, 252))
    draw = ImageDraw.Draw(image)
    draw.rectangle((150, 170, size - 150, size - 190), fill=product)
    # 받침대 — 제품 아래로 이어지는 얇은 기둥. 실제 사진에 늘 있다.
    draw.rectangle((size // 2 - 14, size - 190, size // 2 + 14, size - 150), fill=product)
    return image


def _with_logo_band(image: Image.Image, *, height: int = 120) -> Image.Image:
    """아래에 브랜드 로고 띠를 붙인다 (803.jpg 의 LG 검은 띠)."""
    banded = Image.new("RGB", (image.width, image.height + height), (10, 10, 10))
    banded.paste(image, (0, 0))
    draw = ImageDraw.Draw(banded)
    draw.ellipse(
        (image.width // 2 - 60, image.height + 20, image.width // 2 + 60, image.height + height - 20),
        fill=(190, 20, 40),
    )
    return banded


def _room_scene(size: int = 512) -> Image.Image:
    """방 안에서 찍은 연출 컷. 테두리까지 물건과 무늬가 차 있다."""
    image = Image.new("RGB", (size, size), (208, 186, 152))
    draw = ImageDraw.Draw(image)
    for y in range(0, size, 24):
        shade = 150 + (y // 24 * 7) % 80
        draw.line((0, y, size, y + 18), fill=(shade, shade - 30, shade - 70), width=9)
    draw.rectangle((0, size - 130, size, size), fill=(120, 86, 54))
    draw.rectangle((size - 110, 40, size - 20, 200), fill=(236, 232, 220))
    draw.rectangle((170, 150, size - 170, size - 180), fill=(248, 248, 246))
    return image


# --- 통과시키는 것 ------------------------------------------------------------


def test_a_studio_shot_is_usable_and_cropped_to_the_product():
    verdict = judge(_studio())

    assert verdict.usable
    assert verdict.kind is Kind.PLAIN
    assert verdict.crop is not None
    left, top, right, bottom = verdict.crop
    # 여백을 남기되 제품을 다 담아야 한다. 제품은 x 150~362, y 170~362 다.
    assert left < 150 and top < 170
    assert right > 362 and bottom > 362
    # 흰 여백의 대부분은 잘려야 한다 — 안 자르면 게이트가 한 일이 없다.
    assert (right - left) < 480


def test_the_crop_is_in_original_coordinates_so_the_caller_can_apply_it():
    image = _studio()
    verdict = judge(image)

    assert verdict.crop is not None
    cropped = image.crop(verdict.crop)
    assert cropped.width < image.width
    assert cropped.size == (verdict.crop[2] - verdict.crop[0], verdict.crop[3] - verdict.crop[1])


# --- 로고 띠 -----------------------------------------------------------------


def test_a_brand_logo_band_is_trimmed_before_judging():
    """803.jpg: 흰 배경 제품 사진 아래에 검은 LG 띠. 띠를 안 자르면 배경이 '번잡' 으로 읽힌다."""
    verdict = judge(_with_logo_band(_studio()))

    assert verdict.usable, verdict.reason
    assert verdict.kind is Kind.BANDED
    assert verdict.crop is not None
    # 띠(y 512~632)는 crop 밖이어야 한다.
    assert verdict.crop[3] <= 512


def test_a_plain_white_margin_is_not_mistaken_for_a_band():
    """흰 여백은 띠가 아니다 — 배경이므로 마스크가 처리한다. 여기서 자르면 근거가 두 곳으로 갈린다."""
    verdict = judge(_studio())

    assert verdict.kind is Kind.PLAIN, "띠가 없으면 BANDED 가 되어서는 안 된다"


def test_a_band_must_differ_from_the_background_by_more_than_the_threshold():
    """임계값보다 가까운 색의 띠는 자르지 않는다. 경계를 상수 하나로 고정해 둔다.

    거리는 RGB **유클리드** 거리다. 채널당 델타로 계산하면 3배 가까이 어긋나므로
    (처음에 그렇게 써서 이 테스트가 잘못 빨개졌다) 여기서 명시적으로 나눈다.
    """
    near = round(252 - (BAND_COLOR_DISTANCE - 20) / 3**0.5)
    image = Image.new("RGB", (256, 300), (252, 252, 252))
    ImageDraw.Draw(image).rectangle((80, 90, 176, 190), fill=(40, 44, 52))
    ImageDraw.Draw(image).rectangle((0, 256, 256, 300), fill=(near, near, near))

    assert judge(image).kind is Kind.PLAIN


# --- 거부하는 것 -------------------------------------------------------------


def test_a_product_touching_the_border_is_still_usable():
    """859.jpg 회귀. 테두리 편차 50.9 는 배경이 번잡한 것이 아니라 제품이 닿은 것이다."""
    verdict = judge(_edge_to_edge())

    assert verdict.usable, verdict.reason
    assert verdict.kind is Kind.PLAIN


def test_an_og_image_aspect_is_rejected_even_on_a_white_background():
    """114.png: 1200x628 흰 배경 배너. 밝기로는 안 걸리므로 비율로 거른다."""
    banner = Image.new("RGB", (1200, 628), (248, 248, 249))
    ImageDraw.Draw(banner).ellipse((200, 200, 420, 430), fill=(30, 30, 30))

    verdict = judge(banner)

    assert not verdict.usable
    assert "og:image" in verdict.reason


def test_a_wide_product_photo_outside_the_og_band_is_not_rejected_for_aspect():
    """1920x1080(1.78:1)은 대역 밖이다 — 울트라와이드 제품 사진이 여기 걸리면 안 된다."""
    image = Image.new("RGB", (960, 540), (252, 252, 252))
    ImageDraw.Draw(image).rectangle((200, 130, 760, 410), fill=(36, 38, 44))

    assert "og:image" not in judge(image).reason


def test_a_room_scene_is_rejected_rather_than_cropped_by_guesswork():
    """방 배경은 **거부**한다.

    실제 사진(1466.jpg)이 이유다: 조화 여러 다발이 걸린 연출 컷에서 '제품' 이 어느
    다발인지 픽셀만 보고는 정할 수 없다. 가운데를 잘라 통과시키면 조용히 엉뚱한 레퍼런스가
    되므로, 세그멘테이션이 붙기 전까지는 사람에게 넘긴다.
    """
    verdict = judge(_room_scene())

    assert not verdict.usable
    assert verdict.kind is Kind.SCENE
    assert verdict.crop is None, "추측한 crop 을 돌려주면 호출부가 그것을 쓴다"


def test_an_image_with_no_product_is_rejected():
    """117.png: 1200x630 브랜드 배너. 제품이 한 개도 없다."""
    banner = Image.new("RGB", (600, 315), (12, 14, 40))
    draw = ImageDraw.Draw(banner)
    for x in range(0, 600, 12):
        draw.line((x, 0, x + 300, 315), fill=(40 + x % 90, 60, 200 - x % 90), width=7)

    assert not judge(banner).usable


def test_an_empty_image_is_rejected_without_raising():
    assert not judge(Image.new("RGB", (256, 256), (255, 255, 255))).usable


# --- 모니터: 화면이 켜져 있으면 안 된다 ---------------------------------------


def test_a_monitor_with_a_lit_screen_is_rejected():
    """시뮬레이터 모니터를 꺼진 검은 화면으로 확정했다(FINDINGS §1.8).

    화면에 사진이 깔린 레퍼런스를 IP-Adapter 로 물리면 그 결정과 정면으로 싸운다.
    """
    image = Image.new("RGB", (512, 512), (252, 252, 252))
    draw = ImageDraw.Draw(image)
    draw.rectangle((80, 100, 432, 330), fill=(20, 20, 20))  # 베젤
    draw.rectangle((92, 112, 420, 318), fill=(30, 120, 210))  # 켜진 화면
    draw.rectangle((240, 330, 272, 380), fill=(30, 30, 30))

    verdict = judge(image, category="MONITOR")

    assert not verdict.usable
    assert verdict.kind is Kind.SCREEN_ON


def test_a_monitor_with_a_dark_screen_is_usable():
    image = Image.new("RGB", (512, 512), (252, 252, 252))
    draw = ImageDraw.Draw(image)
    draw.rectangle((80, 100, 432, 330), fill=(24, 24, 26))
    draw.rectangle((92, 112, 420, 318), fill=(13, 14, 17))
    draw.rectangle((240, 330, 272, 380), fill=(30, 30, 30))

    verdict = judge(image, category="MONITOR")

    assert verdict.usable, verdict.reason
    assert verdict.kind is Kind.PLAIN


def test_the_lit_screen_rule_applies_only_to_screen_categories():
    """파란 마우스패드가 '켜진 화면' 으로 거부되면 안 된다."""
    image = Image.new("RGB", (512, 512), (252, 252, 252))
    ImageDraw.Draw(image).rectangle((92, 112, 420, 318), fill=(30, 120, 210))

    assert judge(image, category="MOUSE_PAD").usable


# --- 집계 --------------------------------------------------------------------


def test_summarize_counts_every_verdict_exactly_once():
    verdicts = [
        judge(_studio()),
        judge(_studio()),
        judge(_room_scene()),
        judge(_with_logo_band(_studio())),
    ]

    report = summarize(verdicts)

    assert report.total == 4
    assert report.usable == 3
    assert sum(report.by_kind.values()) == 4
    assert report.by_kind[Kind.SCENE] == 1


def test_reasons_are_grouped_by_code_not_by_the_measured_text():
    """측정값이 든 문구로 묶으면 한 부류가 여러 줄로 갈라진다 (실측에서 열 줄로 갈렸다)."""
    # 밝기 234·236 — 마스크(밝기 232 이상을 배경으로 본다)는 성공하고 스튜디오 기준(238)
    # 에는 못 미치는 좁은 구간이다. 더 어둡게 하면 마스크가 먼저 실패해 다른 사유가 된다.
    darker = Image.new("RGB", (256, 256), (234, 234, 234))
    ImageDraw.Draw(darker).rectangle((80, 80, 176, 176), fill=(40, 40, 40))
    lighter = Image.new("RGB", (256, 256), (236, 236, 236))
    ImageDraw.Draw(lighter).rectangle((80, 80, 176, 176), fill=(40, 40, 40))

    verdicts = [judge(darker), judge(lighter)]

    assert [v.code for v in verdicts] == ["not-studio", "not-studio"]
    assert verdicts[0].reason != verdicts[1].reason, "사유 문구에는 측정값이 남아 있어야 한다"
    assert summarize(verdicts).reasons == {"not-studio": 2}
