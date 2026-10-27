"""DB 로 제품 이미지를 카테고리 폴더에 나누는 규칙 (app/product_sort.py, 2026-08-04)."""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest
from PIL import Image

from app.core.errors import ConfigurationError
from app.product_sort import (
    CATEGORY_BY_KOREAN,
    apply_plan,
    build_plan,
    classify,
    normalize,
)


def _db(tmp_path: Path, rows: list[tuple[int, str | None, str | None, str | None]]) -> Path:
    path = tmp_path / "deskterior.sqlite3"
    with sqlite3.connect(path) as con:
        con.execute(
            "create table products (id integer, category1 text, category2 text, category3 text)"
        )
        con.executemany("insert into products values (?,?,?,?)", rows)
    return path


def _image(path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (8, 8), (10, 20, 30)).save(path)
    return path


def test_monitor_arm_is_not_a_monitor():
    """모니터암이 MONITOR 폴더로 가면 canny 0.15 와 화면 교체 지시를 받아 뭉개진다.

    실제 DB 의 모양이 이 함정을 만든다: 모니터암은 `category3='모니터암'` +
    `category2='모니터주변기기'` 고, 실제 모니터는 `category3` 이 비어 있고
    `category2='모니터'` 다. 한글에 '모니터' 가 들어 있는지로 판단하면 둘이 같이 간다.
    """
    assert classify("디지털/가전", "모니터주변기기", "모니터암") == ("MONITOR_ARM", "모니터암")
    assert classify("디지털/가전", "모니터", None) == ("MONITOR", "모니터")
    assert classify("디지털/가전", "모니터주변기기", "모니터받침대")[0] == "MONITOR_STAND"


def test_the_narrowest_column_wins():
    """category3 이 있으면 그것을 쓴다 — category1 은 사람이 넣은 검색어라 덜 믿는다."""
    assert classify("모니터", None, "키보드") == ("KEYBOARD", "키보드")


def test_category1_is_used_only_as_a_last_resort():
    assert classify("가습기", None, None) == ("HUMIDIFIER", "가습기")
    # 표에 없는 검색어는 나누지 않는다. '함박 스테이크' 같은 값이 실제로 들어 있다.
    assert classify("함박 스테이크", None, None) is None


def test_spacing_differences_do_not_split_a_category():
    """크롤링 소스마다 공백이 다르게 들어와 있다 — 같은 카테고리로 모여야 한다."""
    assert normalize("손목 받침대 (팜레스트)") == normalize("손목받침대(팜레스트)")
    assert classify("모니터 암", None, None)[0] == "MONITOR_ARM"
    assert classify("모니터암", None, None)[0] == "MONITOR_ARM"


def test_every_code_reads_as_an_english_noun():
    """코드는 프롬프트의 {products} 자리에 그대로 들어간다 (prompt_file.py).

    `DESK_LAMP` → "desk lamp" 처럼 읽혀야 한다. 대문자·밑줄만 허용하면 그게 보장된다 —
    한글이나 슬래시가 섞인 코드가 들어오면 "photo of a 데스크용품" 이 조용히 나간다.
    """
    for korean, code in CATEGORY_BY_KOREAN.items():
        assert code.replace("_", "").isalnum(), f"{korean} -> {code}"
        assert code.upper() == code, f"{korean} -> {code}"
        assert code.isascii(), f"{korean} -> {code}"


def test_plan_sends_each_image_to_its_category_folder(tmp_path):
    db = _db(tmp_path, [(563, "디지털/가전", "모니터", None), (528, None, None, "키보드")])
    source = tmp_path / "in"
    _image(source / "563.jpg")
    _image(source / "528.png")
    root = tmp_path / "products"

    plans, unsorted = build_plan(source, root, db)

    assert {plan.destination for plan in plans} == {
        root / "monitor" / "563.jpg",
        root / "keyboard" / "528.png",
    }
    assert unsorted == []


def test_names_that_are_not_product_ids_are_reported(tmp_path):
    """직접 찍은 사진은 id 가 없어서 나눌 수 없다 — 조용히 넘기지 않는다."""
    db = _db(tmp_path, [(563, None, "모니터", None)])
    source = tmp_path / "in"
    _image(source / "my-desk.jpg")
    _image(source / "9999.jpg")

    plans, unsorted = build_plan(source, tmp_path / "products", db)

    assert plans == []
    reasons = {item.source.name: item.reason for item in unsorted}
    assert "제품 id 가 아니다" in reasons["my-desk.jpg"]
    assert "DB 에 그 id" in reasons["9999.jpg"]


def test_unmapped_category_is_reported_with_its_korean_name(tmp_path):
    """무엇을 표에 추가하면 몇 장이 풀리는지 보여야 다음 행동이 정해진다."""
    db = _db(tmp_path, [(1, None, None, "데스크용품")])
    source = tmp_path / "in"
    _image(source / "1.jpg")

    plans, unsorted = build_plan(source, tmp_path / "products", db)

    assert plans == []
    assert unsorted[0].korean == "데스크용품"


def test_already_sorted_images_are_not_picked_up_again(tmp_path):
    """카테고리 폴더 안을 다시 훑으면 손으로 고쳐 둔 폴더가 표 값으로 되돌아간다."""
    db = _db(tmp_path, [(563, None, "모니터", None)])
    root = tmp_path / "products"
    _image(root / "keyboard" / "563.jpg")  # 사람이 일부러 keyboard 에 넣어 둔 것

    plans, unsorted = build_plan(root, root, db)

    assert plans == []
    assert unsorted == []


def test_existing_destination_is_never_overwritten(tmp_path):
    db = _db(tmp_path, [(563, None, "모니터", None)])
    source = tmp_path / "in"
    _image(source / "563.jpg")
    root = tmp_path / "products"
    kept = _image(root / "monitor" / "563.jpg")
    kept.write_bytes(b"keep me")

    plans, _ = build_plan(source, root, db)
    done, skipped = apply_plan(plans, move=False)

    assert (done, skipped) == (0, 1)
    assert kept.read_bytes() == b"keep me"


def test_dry_run_touches_nothing(tmp_path):
    db = _db(tmp_path, [(563, None, "모니터", None)])
    source = tmp_path / "in"
    image = _image(source / "563.jpg")
    root = tmp_path / "products"

    plans, _ = build_plan(source, root, db)
    done, _ = apply_plan(plans, move=True, dry_run=True)

    assert done == 1
    assert image.exists()
    assert not (root / "monitor").exists()


def test_move_leaves_nothing_behind(tmp_path):
    db = _db(tmp_path, [(563, None, "모니터", None)])
    root = tmp_path / "products"
    image = _image(root / "563.jpg")

    plans, _ = build_plan(root, root, db)
    apply_plan(plans, move=True)

    assert not image.exists()
    assert (root / "monitor" / "563.jpg").exists()


def test_missing_db_is_a_clear_configuration_error(tmp_path):
    with pytest.raises(ConfigurationError, match="does not exist"):
        build_plan(tmp_path, tmp_path, tmp_path / "nope.sqlite3")
