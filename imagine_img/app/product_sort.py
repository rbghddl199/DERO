"""제품 이미지를 카테고리 폴더로 나눈다 (2026-08-04).

## 왜 이미지 분류 모델을 쓰지 않는가

크롤링 이미지의 **파일 이름이 제품 id** 다 (`563.jpg` → `products.id = 563`). 그리고 그 표에
카테고리가 이미 들어 있다. 이미지를 보고 맞히는 것은 추측이고, id 로 조회하는 것은 사실이다.
CLIP 제로샷 분류를 붙이면 모델을 하나 더 내려받고 "모니터암을 모니터로 봤다" 같은 오분류를
사람이 다시 걸러야 한다 — 답이 DB 에 있는데 그럴 이유가 없다.

이 방식의 한계는 분명하다: **파일 이름이 제품 id 가 아닌 이미지는 나눌 수 없다.** 직접 찍거나
받은 사진은 폴더를 보고 직접 넣어야 한다. 그건 조용히 넘기지 않고 "왜 못 나눴는지" 로 보고한다.

## 어느 칸을 믿는가

세 칸의 신뢰도가 다르다 (2026-08-04 실측, 이미지 있는 1199장 기준):

```text
category3   701행  다나와 카테고리. 깨끗하다               -> 가장 먼저 본다
category2    41행  '모니터'·'노트북'. 실제 모니터 34개가 여기 -> 다음
category1  1027행  검색어 그대로. '함박 스테이크'도 있다     -> 표에 있는 것만 쓴다
```

`category1` 은 사람이 넣은 검색 키워드라서 번역해서 쓸 수 없다. 그래서 세 칸 모두
**표에 있는 값만** 쓰고, 없으면 나누지 않고 보고한다.

## 왜 표를 다 채우지 않았는가

`데스크용품`(33장), `스탠드`(16장) 처럼 **영어 명사 하나로 옮길 수 없는 카테고리**는 비워 뒀다.
폴더 이름이 프롬프트의 `{products}` 자리에 그대로 들어가므로(prompt_file.py), 억지로 채우면
"photo of a desk supplies" 같은 프롬프트가 조용히 나간다. 못 나눈 것은 개수와 함께 보고하니
필요한 것부터 아래 표에 추가하면 된다.

## 모니터와 모니터암은 다르다

`MONITOR` 폴더는 canny 강도 0.15 와 화면 배경화면 교체 지시를 받는다
(product_batch.py). 모니터암·모니터받침대가 거기 섞이면 형태가 뭉개진 이미지가 나온다.
그래서 `category3` 을 먼저 본다 — 모니터암은 `category3='모니터암'`, 실제 모니터는
`category3` 이 비어 있고 `category2='모니터'` 다. 한글에 '모니터' 가 들어 있는지로
판단하면 둘이 같은 폴더로 간다.
"""

from __future__ import annotations

import shutil
import sqlite3
from dataclasses import dataclass
from pathlib import Path

from app.core.errors import ConfigurationError
from app.core.logging import get_logger
from app.product_batch import IMAGE_SUFFIXES

log = get_logger(__name__)

#: 기본 DB 위치. imagine_img 에서 상대 경로로 크롤러 저장소를 본다.
DEFAULT_DB = Path("../deskterior/data/deskterior.sqlite3")

#: 한글 카테고리(공백 제거) → 폴더 이름이 될 카테고리 코드.
#:
#: 코드는 `_word_from_code()` 를 거쳐 프롬프트의 `{products}` 에 들어간다
#: (`DESK_LAMP` → "desk lamp"). 그래서 **영어 일반명사로 읽히는 코드만** 넣는다.
#: 옮길 명사가 마땅치 않은 카테고리는 비워 두는 것이 맞다 — 위 모듈 주석 참고.
CATEGORY_BY_KOREAN: dict[str, str] = {
    # --- 모니터 계열. 서로 다른 폴더로 가야 한다 (모듈 주석) ---
    "모니터": "MONITOR",
    "스마트모니터": "MONITOR",
    "모니터암": "MONITOR_ARM",
    "모니터받침대": "MONITOR_STAND",
    "노트북": "LAPTOP",
    "태블릿PC": "TABLET",
    # --- 입력장치 ---
    "키보드": "KEYBOARD",
    "마우스": "MOUSE",
    "마우스패드": "MOUSE_PAD",
    "데스크패드": "DESK_MAT",
    "손목받침대": "WRIST_REST",
    "손목받침대(팜레스트)": "WRIST_REST",
    # --- 가구 ---
    "책상": "DESK",
    "컴퓨터책상": "DESK",
    "모션데스크": "DESK",
    "의자": "CHAIR",
    "컴퓨터,사무용의자": "CHAIR",
    "선반": "SHELF",
    "책꽂이": "BOOKEND",
    "책상책꽂이": "BOOKEND",
    "북엔드": "BOOKEND",
    "서랍장": "DRAWER_UNIT",
    "파티션": "PARTITION",
    # --- 조명·전자 ---
    "조명": "DESK_LAMP",
    "모니터조명": "MONITOR_LIGHT",
    "웹캠": "WEBCAM",
    "PC캠": "WEBCAM",
    "스피커": "SPEAKER",
    "북셸프스피커": "SPEAKER",
    "마이크": "MICROPHONE",
    "헤드폰/헤드셋": "HEADPHONES",
    "이어폰/이어셋": "EARPHONES",
    "가습기": "HUMIDIFIER",
    "선풍기": "FAN",
    "프린터": "PRINTER",
    "프로젝터": "PROJECTOR",
    "멀티탭": "POWER_STRIP",
    # --- 소품 ---
    "시계": "CLOCK",
    "탁상시계": "CLOCK",
    "벽시계": "WALL_CLOCK",
    "액자": "PICTURE_FRAME",
    "미니화분": "POTTED_PLANT",
    "관엽식물": "POTTED_PLANT",
    "다육식물": "POTTED_PLANT",
    "공기정화식물": "POTTED_PLANT",
    "조화": "ARTIFICIAL_PLANT",
    "러그": "RUG",
    "휴지통": "TRASH_CAN",
    "정리함": "STORAGE_BOX",
    "수납함": "STORAGE_BOX",
    "거치형독서대": "BOOK_STAND",
    "필기도구": "PEN",
    "노트/수첩": "PAPER_NOTEBOOK",
    "다이어리/플래너": "PLANNER",
    "소품걸이": "DESK_HOOK",
}


#: 파일 이름에 든 낱말 → 카테고리 코드. **순서가 규칙이다: 좁은 것이 위에 온다.**
#:
#: DB 조회가 불가능한 이미지(파일 이름이 제품 id 가 아닌 것)를 나눌 때 쓴다. 픽셀을 보고
#: 맞히는 것이 아니라 **사람이 붙인 이름을 읽는** 것이라 근거가 확인 가능하다.
#:
#: 순서가 왜 규칙인가 — 2026-08-04 에 사용자가 넣은 61장에서 실제로 겹친 이름들:
#:
#: ```text
#: '카멜마운트 클램프형 싱글 모니터암 CA-2'          모니터암 이 모니터 보다 위여야 한다
#: '제닉스 엑스팜 월넛 팜레스트 키보드 손목 받침대'    팜레스트 가 키보드 보다 위여야 한다
#: '그리디파머스 가죽 마우스 키보드 책상 장패드'       장패드 가 마우스·키보드 보다 위여야 한다
#: '르메이어 20W 스탠드 고속 무선충전기'             충전기 가 스탠드 보다 위여야 한다
#: ```
#:
#: 아래로 내려갈수록 일반적인 낱말이다. 새 항목은 **자기보다 일반적인 낱말 위에** 넣어야 한다.
KEYWORD_CATEGORIES: tuple[tuple[str, str], ...] = (
    # --- 모니터 주변 (모니터 보다 먼저) ---
    ("모니터암", "MONITOR_ARM"),
    ("모니터 암", "MONITOR_ARM"),
    ("모니터받침대", "MONITOR_STAND"),
    ("모니터 받침대", "MONITOR_STAND"),
    ("모니터", "MONITOR"),
    # --- 손목·패드 계열 (키보드·마우스 보다 먼저) ---
    ("팜레스트", "WRIST_REST"),
    ("손목 받침대", "WRIST_REST"),
    ("손목받침대", "WRIST_REST"),
    ("장패드", "DESK_MAT"),
    ("데스크매트", "DESK_MAT"),
    ("데스크 매트", "DESK_MAT"),
    ("데스크패드", "DESK_MAT"),
    ("데스크 패드", "DESK_MAT"),
    ("마우스패드", "MOUSE_PAD"),
    ("마우스 패드", "MOUSE_PAD"),
    # --- 충전기 (스탠드 보다 먼저 — '무선 충전 스탠드' 가 있다) ---
    ("충전기", "WIRELESS_CHARGER"),
    ("무선 충전", "WIRELESS_CHARGER"),
    # --- 조명 (스탠드·조명 순서 주의) ---
    ("무드등", "MOOD_LIGHT"),
    ("스탠드", "DESK_LAMP"),
    ("조명", "DESK_LAMP"),
    ("전구", "LIGHT_BULB"),
    # --- 시계 (벽시계 가 시계 보다 먼저) ---
    ("벽시계", "WALL_CLOCK"),
    ("탁상시계", "CLOCK"),
    ("온습도계", "CLOCK"),  # '시간표시 온습도계' — 시계 겸용 탁상 기기다
    ("시계", "CLOCK"),
    # --- 음향 ---
    ("사운드바", "SPEAKER"),
    ("스피커", "SPEAKER"),
    ("턴테이블", "TURNTABLE"),
    ("헤드폰걸이", "HEADPHONE_STAND"),
    ("헤드셋 거치대", "HEADPHONE_STAND"),
    # --- 수납·정리 ---
    ("오거나이저", "DESK_ORGANIZER"),
    ("연필꽂이", "DESK_ORGANIZER"),
    ("정리함", "STORAGE_BOX"),
    ("공간박스", "STORAGE_BOX"),
    ("타공판", "PEGBOARD"),
    ("타공 보드", "PEGBOARD"),
    ("선반", "SHELF"),
    ("책꽂이", "BOOKEND"),
    # --- 입력장치 ---
    ("키보드", "KEYBOARD"),
    ("마우스", "MOUSE"),
    ("USB허브", "USB_HUB"),
    ("USB 허브", "USB_HUB"),
    ("허브", "USB_HUB"),
    # --- 가구 ---
    ("발받침대", "FOOTREST"),
    ("의자", "CHAIR"),
    ("책상", "DESK"),
    # --- 소품 ---
    ("화분", "PLANT_POT"),
    ("캘린더", "DESK_CALENDAR"),
    ("달력", "DESK_CALENDAR"),
    ("디스플레이보드", "PIXEL_DISPLAY"),
    ("모빌", "DESK_ORNAMENT"),
    ("액자", "PICTURE_FRAME"),
    ("가습기", "HUMIDIFIER"),
    ("선풍기", "FAN"),
)


def classify_by_name(name: str) -> tuple[str, str] | None:
    """파일 이름으로 `(카테고리 코드, 걸린 낱말)`. 아무것도 안 걸리면 None.

    위에서부터 처음 걸리는 낱말을 쓴다 — 표의 순서가 곧 좁은 것 우선이다.
    """
    lowered = name.lower()
    for keyword, code in KEYWORD_CATEGORIES:
        if keyword.lower() in lowered:
            return code, keyword
    return None


@dataclass(frozen=True)
class SortPlan:
    """한 장을 어디로 보낼지."""

    source: Path
    category: str
    destination: Path
    #: 어느 칸에서 나온 값인지. 사람이 표를 고칠 때 필요하다.
    matched: str


@dataclass(frozen=True)
class Unsorted:
    """못 나눈 한 장과 그 이유."""

    source: Path
    reason: str
    #: DB 에서 읽은 한글 카테고리. 표에 추가할 후보다. 없으면 빈 문자열.
    korean: str = ""


def normalize(text: str | None) -> str:
    """표 조회용 정규화. 공백만 지운다.

    `모니터 암` 과 `모니터암`, `손목받침대( 팜 레스트 )` 와 `손목받침대(팜레스트)` 가
    같은 값이 되어야 한다 — 크롤링 소스마다 공백이 다르게 들어와 있다.
    """
    return "".join((text or "").split())


def classify(category1: str | None, category2: str | None, category3: str | None) -> tuple[str, str] | None:
    """`(카테고리 코드, 근거가 된 한글)`. 표에 없으면 None.

    **좁은 칸을 먼저 본다.** `category3='모니터암'` 인 행은 `category2='모니터주변기기'`
    이기도 한데, 넓은 칸을 먼저 보면 모니터암이 모니터가 된다.
    """
    for value in (category3, category2, category1):
        key = normalize(value)
        if key and key in CATEGORY_BY_KOREAN:
            return CATEGORY_BY_KOREAN[key], value or ""
    return None


def _load_rows(db: Path) -> dict[int, tuple[str | None, str | None, str | None]]:
    resolved = Path(db).expanduser()
    if not resolved.exists():
        raise ConfigurationError(
            f"product DB '{resolved}' does not exist. Pass --db with the path to "
            "deskterior/data/deskterior.sqlite3."
        )
    try:
        with sqlite3.connect(f"file:{resolved}?mode=ro", uri=True) as con:
            rows = con.execute("select id, category1, category2, category3 from products").fetchall()
    except sqlite3.Error as exc:
        raise ConfigurationError(f"product DB '{resolved}' could not be read: {exc}") from exc
    return {int(row[0]): (row[1], row[2], row[3]) for row in rows}


def build_plan(
    source: Path, root: Path, db: Path, *, by_name: bool = False
) -> tuple[list[SortPlan], list[Unsorted]]:
    """`source` 의 이미지들을 `root/<카테고리>/` 로 보내는 계획.

    `by_name=True` 면 DB 를 열지 않고 **파일 이름의 낱말**로 나눈다 (`KEYWORD_CATEGORIES`).
    파일 이름이 제품 id 가 아닌 이미지 — 사람이 제품명으로 저장해 둔 것 — 를 위한 길이다.

    `source` 를 뒤질 때 **카테고리 폴더 안은 보지 않는다** — 이미 나눠 놓은 것을 다시
    집으면 폴더 이름을 손으로 고쳐 둔 것이 표 값으로 되돌아간다.
    """
    catalog = {} if by_name else _load_rows(db)
    plans: list[SortPlan] = []
    unsorted: list[Unsorted] = []

    for path in sorted(p for p in source.iterdir() if p.is_file()) if source.exists() else []:
        if path.suffix.lower() not in IMAGE_SUFFIXES:
            continue
        if by_name:
            matched = classify_by_name(path.name)
            if matched is None:
                unsorted.append(
                    Unsorted(path, "파일 이름에 아는 낱말이 없다 (KEYWORD_CATEGORIES 에 추가)")
                )
                continue
            code, keyword = matched
            plans.append(SortPlan(path, code, root / code.lower() / path.name, keyword))
            continue
        if not path.stem.isdigit():
            unsorted.append(
                Unsorted(path, "파일 이름이 제품 id 가 아니다 (예: 563.jpg). --by-name 을 써라")
            )
            continue
        row = catalog.get(int(path.stem))
        if row is None:
            # 사유에 id 를 넣지 않는다 — 호출부가 사유별로 접어서 보고하는데, id 가 들어가면
            # 100개가 100종으로 갈라져 규모가 보이지 않는다. 어느 파일인지는 source 에 있다.
            unsorted.append(Unsorted(path, "DB 에 그 id 의 제품이 없다 (지난 크롤링 잔여물)"))
            continue
        matched = classify(*row)
        if matched is None:
            korean = next((value for value in (row[2], row[1], row[0]) if value), "")
            unsorted.append(
                Unsorted(path, "표에 없는 카테고리 (CATEGORY_BY_KOREAN 에 추가)", korean)
            )
            continue
        code, korean = matched
        plans.append(SortPlan(path, code, root / code.lower() / path.name, korean))
    return plans, unsorted


def apply_plan(plans: list[SortPlan], *, move: bool, dry_run: bool = False) -> tuple[int, int]:
    """`(처리한 장수, 이미 있어서 건너뛴 장수)`.

    **덮어쓰지 않는다.** 같은 이름이 이미 있으면 건너뛴다 — 두 번 돌렸을 때 이전 결과를
    지우면 손으로 골라 넣은 이미지가 사라진다.
    """
    done = 0
    skipped = 0
    for plan in plans:
        if plan.destination.exists():
            skipped += 1
            continue
        if dry_run:
            done += 1
            continue
        plan.destination.parent.mkdir(parents=True, exist_ok=True)
        if move:
            shutil.move(str(plan.source), str(plan.destination))
        else:
            shutil.copy2(plan.source, plan.destination)
        done += 1
    return done, skipped
