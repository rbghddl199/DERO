"""레퍼런스 고르기 (`app/generation/references.py`). GPU 도 가중치도 필요 없다."""

from __future__ import annotations

from pathlib import Path

import pytest
from PIL import Image

from app.core.errors import WorkerError
from app.generation import references
from app.generation.schemas import GenerationRequest


def _reference_tree(root: Path, layout: dict[str, list[str]]) -> None:
    for folder, names in layout.items():
        directory = root / folder
        directory.mkdir(parents=True, exist_ok=True)
        for name in names:
            Image.new("RGB", (64, 64), (200, 200, 200)).save(directory / name)


@pytest.fixture
def settings_with_references(settings, tmp_path):
    root = tmp_path / "references"
    _reference_tree(
        root,
        {
            "chair": ["a-chair.png", "b-chair.png", "c-chair.png"],
            "keyboard": ["kb.png"],
            "clock": ["clock.png"],
        },
    )
    return settings.model_copy(update={"references_dir": root, "input_dir": tmp_path})


def _request(**overrides) -> GenerationRequest:
    return GenerationRequest.model_validate({"jobId": "ref-test", **overrides})


def test_category_code_becomes_the_folder_name(settings_with_references):
    picked = references.select(
        _request(productCategories=[{"code": "CHAIR", "screenAreaPercent": 20}]),
        settings_with_references,
        seed=0,
    )
    assert [item.key for item in picked.references] == ["chair"]
    assert picked.references[0].source == "category"


def test_a_korean_product_name_resolves_through_the_word_table(settings_with_references):
    """큐가 주는 것은 카테고리 코드가 아니라 실제 제품명일 수 있다 (queue/schemas.py)."""
    picked = references.select(
        _request(productSummary=["시디즈 T50 컴퓨터 책상 의자 HDA 방문설치"]),
        settings_with_references,
        seed=0,
    )
    assert [item.key for item in picked.references] == ["chair"]


def test_the_same_seed_picks_the_same_file_and_another_seed_moves(settings_with_references):
    """seed 고정 시 재현된다는 약속은 레퍼런스에도 걸린다 (references.py 머리말)."""
    request = _request(productCategories=[{"code": "CHAIR", "screenAreaPercent": 20}])

    first = references.select(request, settings_with_references, seed=0).references[0].path
    again = references.select(request, settings_with_references, seed=0).references[0].path
    other = references.select(request, settings_with_references, seed=1).references[0].path

    assert first == again
    assert first != other, "seed 가 달라도 같은 장을 쓰면 783장 중 15장만 일한다"


def test_bigger_products_come_first_and_the_rest_are_reported(settings_with_references):
    """상한에 걸려 잘릴 때 **작아서 어차피 안 보이는 것**이 먼저 잘려야 한다."""
    capped = settings_with_references.model_copy(update={"ip_adapter_max_references": 2})
    picked = references.select(
        _request(
            productCategories=[
                {"code": "CLOCK", "screenAreaPercent": 1.0},
                {"code": "CHAIR", "screenAreaPercent": 30.0},
                {"code": "KEYBOARD", "screenAreaPercent": 12.0},
            ]
        ),
        capped,
        seed=0,
    )
    assert [item.key for item in picked.references] == ["chair", "keyboard"]
    assert picked.dropped == ("clock",)


def test_a_category_without_a_folder_is_reported_not_silently_skipped(settings_with_references):
    picked = references.select(
        _request(productCategories=[{"code": "MONITOR", "screenAreaPercent": 40}]),
        settings_with_references,
        seed=0,
    )
    assert picked.references == ()
    assert picked.missing and "monitor" in picked.missing[0][1]


def test_an_unknown_name_is_reported(settings_with_references):
    picked = references.select(
        _request(productSummary=["디붐 타임즈게이트 2세대 픽셀아트 디스플레이보드"]),
        settings_with_references,
        seed=0,
    )
    assert picked.references == ()
    assert picked.missing[0][0].startswith("디붐")


def test_requested_paths_win_and_stay_inside_the_input_dir(settings_with_references, tmp_path):
    inside = tmp_path / "own.png"
    Image.new("RGB", (64, 64), (10, 10, 10)).save(inside)

    picked = references.select(
        _request(productReferencePaths=["own.png"]), settings_with_references, seed=0
    )
    assert [item.path for item in picked.references] == [inside]
    assert picked.references[0].source == "request"


@pytest.mark.parametrize("bad", ["../outside.png", "..\\outside.png"])
def test_a_requested_path_cannot_escape_the_input_dir(settings_with_references, bad):
    """HTTP 로 오는 값이다. 제한이 없으면 임의 파일 읽기가 된다."""
    with pytest.raises(WorkerError) as caught:
        references.select(
            _request(productReferencePaths=[bad]), settings_with_references, seed=0
        )
    assert "must stay inside" in caught.value.message


def test_zero_max_references_turns_selection_off(settings_with_references):
    off = settings_with_references.model_copy(update={"ip_adapter_max_references": 0})
    picked = references.select(
        _request(productCategories=[{"code": "CHAIR", "screenAreaPercent": 20}]), off, seed=0
    )
    assert not picked
