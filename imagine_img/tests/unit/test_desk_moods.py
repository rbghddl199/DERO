"""책상 재질 → 장면 분위기 (2026-08-02).

## 왜 필요한가

사용자가 시뮬레이터에서 고른 책상 재질이 **상상도에 반영된 적이 없다.** 백엔드는
`deskTexture` 를 큐 메시지에 실어 보내고 `WorkerRequest` 도 그것을 파싱하는데,
`runner._to_request` 가 프롬프트로 넘기지 않아 그대로 버려졌다.

재질은 방 전체의 분위기를 정하는 가장 강한 단서다 — 화이트 책상이면 화이트 톤,
우드면 웜 우드, 블랙이면 다크. 배경 연출도 그 톤을 따라야 한 장면으로 읽힌다.

## 표에 없는 재질을 조용히 버리지 않는다

`product_categories.py` 와 같은 판단이다. 카탈로그의 재질 이름은 늘어나는데 표가
뒤처지면 **정보가 사라지는 것이 가장 나쁘다.** 모르는 이름은 중립 분위기로 떨어뜨리되
`unverified` 로 보고해서 표를 채울 근거를 남긴다.
"""

from __future__ import annotations

import pytest

from app.generation.desk_moods import DESK_MOODS, resolve_desk_mood


def test_known_textures_carry_palette_decor_and_lighting():
    """분위기 하나는 세 가지를 다 말해야 한다 — 팔레트만 바꾸면 배경이 따로 논다."""
    mood = resolve_desk_mood("oak").mood
    assert mood is not None
    assert mood.palette and mood.decor and mood.lighting


@pytest.mark.parametrize(
    ("texture", "expected_word"),
    [
        ("oak", "warm"),
        ("walnut", "walnut"),
        ("white", "white"),
        ("black", "dark"),
    ],
)
def test_texture_drives_the_tone(texture, expected_word):
    """화이트면 화이트, 우드면 우드, 블랙이면 블랙 — 사용자 선택이 톤을 정한다."""
    resolved = resolve_desk_mood(texture)
    joined = f"{resolved.mood.palette} {resolved.mood.decor} {resolved.mood.lighting}".lower()
    assert expected_word in joined


@pytest.mark.parametrize("korean, english", [("오크", "oak"), ("월넛", "walnut"),
                                             ("화이트", "white"), ("블랙", "black")])
def test_korean_texture_names_resolve(korean, english):
    """운영 DB 의 `desk_texture.name` 은 한국어다 — 로컬 시드만 영어다."""
    assert resolve_desk_mood(korean).mood is resolve_desk_mood(english).mood


def test_unknown_texture_falls_back_and_is_reported():
    """모르는 재질도 그림은 나와야 한다. 다만 조용히 넘어가지 않는다."""
    resolved = resolve_desk_mood("테라조 대리석")
    assert resolved.mood is not None, "모르는 재질이라고 분위기가 없으면 배경이 비어버린다"
    assert resolved.unverified == "테라조 대리석"


def test_missing_texture_is_not_an_error():
    """책상 재질이 안 온 옛 요청도 처리돼야 한다."""
    resolved = resolve_desk_mood(None)
    assert resolved.mood is not None
    assert resolved.unverified is None


def test_every_mood_names_background_objects():
    """분위기마다 배경에 놓을 물건을 구체적으로 말해야 한다.

    "cozy" 같은 형용사만으로는 CLIP 이 물건을 만들지 않는다. 명사가 있어야 한다.
    """
    for name, mood in DESK_MOODS.items():
        assert len(mood.decor.split(",")) >= 3, f"{name} 의 decor 가 너무 성기다"
