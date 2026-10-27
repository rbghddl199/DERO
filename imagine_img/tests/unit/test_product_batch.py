"""제품 이미지 폴더 규약 (app/product_batch.py, 2026-08-04)."""

from __future__ import annotations

from pathlib import Path

from PIL import Image

from app.product_batch import CATEGORY_CONTROLNET_SCALE, collect, make_job_id, scale_for


def _image(path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (8, 8), (30, 40, 50)).save(path)
    return path


def test_folder_name_becomes_the_category(tmp_path):
    _image(tmp_path / "monitor" / "563.jpg")
    _image(tmp_path / "Keyboard" / "528.png")
    _image(tmp_path / "desk lamp" / "1.webp")

    items, loose = collect(tmp_path)

    assert [category for category, _ in items] == ["DESK_LAMP", "KEYBOARD", "MONITOR"]
    assert loose == []


def test_files_outside_a_category_folder_are_reported_not_processed(tmp_path):
    """공통 프롬프트로 조용히 돌려버리면 카테고리 지시가 빠진 것을 결과 보고 알게 된다."""
    _image(tmp_path / "monitor" / "1.jpg")
    loose = _image(tmp_path / "stray.jpg")

    items, reported = collect(tmp_path)

    assert [path for _, path in items] == [tmp_path / "monitor" / "1.jpg"]
    assert reported == [loose]


def test_the_output_folder_is_not_collected_as_input(tmp_path):
    """`--root x --out x/out` 로 두면 방금 만든 결과를 입력으로 다시 집는다 (실측: OUT-result)."""
    _image(tmp_path / "monitor" / "1.jpg")
    _image(tmp_path / "out" / "MONITOR-1" / "result.png")

    items, loose = collect(tmp_path, skip=tmp_path / "out")

    assert [category for category, _ in items] == ["MONITOR"]


def test_the_input_pile_folder_is_not_a_category(tmp_path):
    """`sort-products` 는 원본을 복사하므로 `origin/` 이 남는다.

    그것까지 카테고리로 보면 같은 이미지를 두 번 처리하고, 두 번째는 `ORIGIN` 카테고리라
    `[when ...]` 블록도 카테고리별 canny 강도도 안 붙는다 (2026-08-04 실측: 60장이
    120장이 되고 절반이 "photo of a origin" 프롬프트로 나갔다).
    """
    _image(tmp_path / "origin" / "삼성 모니터.png")
    _image(tmp_path / "monitor" / "삼성 모니터.png")
    _image(tmp_path / "_보관" / "x.png")
    _image(tmp_path / ".hidden" / "x.png")

    items, loose = collect(tmp_path)

    assert [category for category, _ in items] == ["MONITOR"]
    assert loose == []


def test_non_images_are_ignored(tmp_path):
    _image(tmp_path / "monitor" / "1.jpg")
    (tmp_path / "monitor" / "notes.txt").write_text("x", encoding="utf-8")
    (tmp_path / "README.md").write_text("x", encoding="utf-8")

    items, loose = collect(tmp_path)

    assert len(items) == 1
    assert loose == []


def test_job_id_comes_from_category_and_file_name(tmp_path):
    assert make_job_id("MONITOR", Path("monitor/563.jpg"), 1) == "MONITOR-563"


def test_unusable_file_names_fall_back_to_an_index(tmp_path):
    """크롤링 파일명에는 한글·괄호·공백이 섞여 있다. 이름을 잃어도 배치는 계속돼야 한다.

    못 쓰는 문자를 지워 억지로 살리지 않는다 — `삼성 27인치.jpg` 에서 남는 `27` 은
    파일 이름이 아니라 파편이고, 다른 파일과 겹치기도 쉽다. 원본 경로는 metadata 에
    남으므로 어느 파일에서 나왔는지는 사후에도 알 수 있다.
    """
    assert make_job_id("MONITOR", Path("모니터 (1).jpg"), 7) == "MONITOR-7"
    assert make_job_id("MONITOR", Path("삼성 27인치.jpg"), 3) == "MONITOR-3"


def test_job_ids_never_collide(tmp_path):
    """겹친 jobId 는 같은 출력 폴더를 덮어쓴다 — 결과가 조용히 사라지는 실패다."""
    taken: set[str] = set()
    ids = [
        make_job_id("MONITOR", Path("2.jpg"), 1, taken),
        make_job_id("MONITOR", Path("한글.jpg"), 2, taken),  # -> MONITOR-2 로 겹칠 자리
        make_job_id("MONITOR", Path("2.jpg"), 3, taken),  # 다른 폴더의 같은 파일 이름
    ]
    assert len(set(ids)) == 3, ids
    assert ids[0] == "MONITOR-2"


def test_collision_suffix_is_still_a_valid_job_id(tmp_path):
    taken = {"MONITOR-563"}
    assert make_job_id("MONITOR", Path("563.jpg"), 1, taken) == "MONITOR-563-2"


def test_monitor_gets_a_looser_controlnet_than_the_default():
    """모니터는 화면 사진과 로고가 canny 윤곽에 들어와서 낮춰야 지워진다 (2026-08-04 실측).

    프롬프트로는 이길 수 없는 값이다. 이 숫자를 기본값으로 되돌리면 "SAMSUNG" 로고가
    선명하게 남은 이미지가 조용히 다시 나온다.
    """
    assert scale_for("MONITOR", 0.45) < 0.45
    assert scale_for("monitor", 0.45) == CATEGORY_CONTROLNET_SCALE["MONITOR"]


def test_unlisted_categories_use_the_given_default():
    assert scale_for("MOUSE", 0.45) == 0.45
    assert scale_for("KEYBOARD", 0.45) == 0.45


def test_missing_root_is_empty_not_an_error(tmp_path):
    items, loose = collect(tmp_path / "nope")
    assert items == []
    assert loose == []


def test_progress_is_recorded_per_image(tmp_path):
    """한 장이 끝날 때마다 기록해야 한다 — 끝에 한 번 쓰면 중간에 멈췄을 때 아무것도 없다."""
    from app.product_batch import GALLERY_DIR, PROGRESS_FILE, BatchItem, record_progress

    out = tmp_path / "outputs"
    final = _image(out / "MONITOR-1" / "final.png")
    item = BatchItem(
        "MONITOR",
        Path("inputs/products/monitor/삼성 모니터.png"),
        "MONITOR-1",
        output_path=str(out / "MONITOR-1" / "result.png"),
        scene_path=str(out / "MONITOR-1" / "scene.png"),
        final_path=str(final),
    )

    copied = record_progress(out, item, 1, 60)

    assert copied == out / GALLERY_DIR / "MONITOR-1-final.png"
    assert copied.exists(), "완성본이 한 폴더에 모여야 진행을 훑어볼 수 있다"
    lines = (out / PROGRESS_FILE).read_text(encoding="utf-8").splitlines()
    assert lines[0].startswith("time\t")
    assert "MONITOR-1" in lines[1] and "\tok\t" in lines[1]
    assert "삼성 모니터.png" in lines[1], "jobId 가 순번이면 원본 이름이 유일한 단서다"


def test_a_failure_is_recorded_too(tmp_path):
    """실패도 한 줄로 남아야 한다 — 60줄 중 빠진 줄을 찾는 것보다 사유가 보이는 편이 낫다."""
    from app.product_batch import PROGRESS_FILE, BatchItem, record_progress

    out = tmp_path / "outputs"
    item = BatchItem("MOUSE", Path("a/b/small.png"), "MOUSE-2", error="INVALID_IMAGE: too small")

    record_progress(out, item, 2, 60)

    line = (out / PROGRESS_FILE).read_text(encoding="utf-8").splitlines()[1]
    assert "FAILED" in line and "INVALID_IMAGE" in line


def test_recording_failure_does_not_lose_the_image(tmp_path, monkeypatch):
    """기록에 실패해도 예외를 올리지 않는다 — 이미 만든 이미지를 버릴 이유가 없다."""
    import shutil as shutil_module

    from app.product_batch import BatchItem, record_progress

    out = tmp_path / "outputs"
    final = _image(out / "CLOCK-1" / "final.png")
    item = BatchItem("CLOCK", Path("a/1.png"), "CLOCK-1", output_path=str(final), final_path=str(final))
    monkeypatch.setattr(
        shutil_module, "copy2", lambda *a, **k: (_ for _ in ()).throw(OSError("disk full"))
    )

    assert record_progress(out, item, 1, 1) is None
