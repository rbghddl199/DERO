"""한국어 제품/카테고리 이름 → CLIP 이 읽는 영어 명사 (2026-08-05).

## 왜

큐 메시지는 한국어 이름을 준다(`queue/schemas.py`). SDXL 의 CLIP 은 영어로 학습돼서
한국어가 바이트 조각으로 부서진다 — 실측:

```text
모니터   6 tok  ['ëª','¨','ëĭĪ','í','Ħ','°']   뜻이 없다
monitor  1 tok  ['monitor']
```

**뜻은 안 실리고 토큰만 5~6배를 먹는다.** 그래서 운영 큐로 오는 제품 이름은 지금
프롬프트에서 일하지 않으면서 예산만 잡아먹고 있다.

## 두 단계로 찾는다

```text
① DERO 카테고리 표      "모니터" → "monitor"        (dero_categories.py)
② 제품명 낱말 표        "카멜마운트 ... 모니터암 CA-2" → MONITOR_ARM  (product_sort.py)
③ 이미 영어면 그대로 둔다  "white mesh office chair"
④ 아무것도 안 되면 버린다  + 보고
```

②가 필요한 이유: 큐가 주는 것이 **카테고리 이름이 아니라 실제 제품명**일 수 있다.
낱말 표는 실제 크롤링 제품명으로 만든 것이라 부분 일치가 듣는다.

## 왜 버리는가

한국어를 그대로 두면 6토큰짜리 무의미한 조각이 예산을 먹는다. 그 자리에 뜻이 실리는
이름 하나가 더 들어가는 편이 낫다 — `product_categories.py` 가 "목록에서 빠진 물건이 다른
카테고리의 물건이 된다" 고 경계하는 그 손해와, 무의미한 토큰이 자리를 먹어 **다른 이름이
밀려나는** 손해를 견준 것이다. 버린 것은 반드시 보고한다.
"""

from __future__ import annotations

from app.generation.dero_categories import resolve as resolve_category

#: 코드 → 영어 명사. `product_sort.KEYWORD_CATEGORIES` 가 내는 코드를 받는다.
#: `dero_categories` 의 단어를 그대로 쓴다 — 두 곳에 다른 단어를 두면 같은 물건이
#: 경로에 따라 다르게 그려진다.
_CODE_WORDS: dict[str, str] = {
    "MONITOR": "monitor",
    "MONITOR_ARM": "monitor arm",
    "MONITOR_STAND": "monitor riser",
    "KEYBOARD": "mechanical keyboard",
    "MOUSE": "computer mouse",
    "MOUSE_PAD": "mouse pad",
    "WRIST_REST": "padded wrist rest",
    "DESK_MAT": "desk mat",
    "SPEAKER": "desktop speaker",
    "HEADPHONES": "headphones",
    "HEADPHONE_STAND": "headphone stand",
    "MICROPHONE": "condenser microphone",
    "TURNTABLE": "record player",
    "DESK_LAMP": "desk lamp",
    "MONITOR_LIGHT": "monitor light bar",
    "MOOD_LIGHT": "small mood light",
    "POTTED_PLANT": "potted plant",
    "ARTIFICIAL_PLANT": "artificial potted plant",
    "CLOCK": "desk clock",
    "WALL_CLOCK": "wall clock",
    "CHAIR": "office chair",
    "FOOTREST": "footrest",
    "RUG": "area rug",
    "DESK_ORGANIZER": "desk organiser",
    "STORAGE_BOX": "storage box",
    "PEGBOARD": "perforated pegboard",
    "PARTITION": "desk privacy panel",
    "WIRELESS_CHARGER": "wireless charging pad",
    "WEBCAM": "webcam",
    "LAPTOP": "laptop",
    "TABLET": "tablet on a stand",
    "USB_HUB": "USB hub",
    "PICTURE_FRAME": "framed print",
    "BOOK_STAND": "book stand",
    "BOOKEND": "bookend",
}


def _is_ascii(text: str) -> bool:
    return all(ord(character) < 128 for character in text)


def localize_product(name: str) -> str | None:
    """한 이름 → 영어 명사. 옮기지 못하면 None."""
    entry = resolve_category(name)
    if entry is not None:
        # 표에 있지만 비워 둔 것(`거치대`·`장식`)도 여기서 None 이 된다 — 사람이 "옮길 수
        # 없다" 고 판단한 것이므로 억지로 다음 단계를 시도하지 않는다.
        return entry.word

    from app.product_sort import classify_by_name

    matched = classify_by_name(name)
    if matched is not None:
        word = _CODE_WORDS.get(matched[0])
        if word:
            return word

    return name if _is_ascii(name) else None


def localize_products(
    names: list[str] | tuple[str, ...],
) -> tuple[tuple[str, ...], tuple[tuple[str, str], ...]]:
    """`(옮긴 이름들, 못 옮긴 것들)`.

    못 옮긴 것은 `(원본, 사유)` 로 돌려준다 — 호출부가 경고로 내보낸다. 조용히 버리면
    "왜 저 물건이 안 나왔지" 가 나중에 돌아온다.
    """
    translated: list[str] = []
    dropped: list[tuple[str, str]] = []
    for name in names:
        word = localize_product(name)
        if word is None:
            dropped.append((name, "CLIP 이 읽을 영어 명사로 옮기지 못했다"))
            continue
        # 같은 카테고리가 둘 이상 오면 한 번만 넣는다 — `monitor, monitor` 는 모델에게
        # 두 대를 요구하는 것이 아니라 그냥 낭비다.
        if word not in translated:
            translated.append(word)
    return tuple(translated), tuple(dropped)
