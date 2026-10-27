"""요청에 실린 제품 → `inputs/references/` 의 실제 제품 사진 (2026-08-06).

## 무엇을 잇는가

`gate-references` 가 만들어 둔 것이 여기서 처음으로 쓰인다:

```text
deskterior 크롤링 1,199장
  -> gate-references (흰 배경 판정 + U2Net 누끼 + 제품 박스 crop)
  -> inputs/references/<카테고리>/<제품명>.png     783장
  -> [이 파일] 요청의 카테고리로 골라서
  -> IP-Adapter 이미지 임베딩으로 생성에 조건을 건다
```

**폴더 이름이 열쇠다.** `sort-products --by-name` 이 `product_sort.KEYWORD_CATEGORIES` 의
코드로 폴더를 나누고, `gate-references --out` 이 그 이름을 그대로 물려받는다. 그래서
요청의 카테고리 코드를 소문자로 바꾸면 곧 폴더 이름이다 — 표를 하나 더 만들지 않는다.

## 왜 seed 로 고르는가

한 카테고리에 사진이 여러 장 있다(의자 4장, 키보드 2장 …). 늘 첫 장만 쓰면
**783장 중 15장만 일하고**, 그 한 장이 나쁘면 그 카테고리는 영영 나쁘다.

그래서 `sorted(files)[seed % len(files)]` 로 고른다. 두 성질을 같이 얻는다:

```text
같은 seed  -> 같은 레퍼런스   (이 저장소의 "seed 고정 시 재현" 약속이 유지된다)
다른 seed  -> 다른 레퍼런스   (큐가 seed 42/43/44 로 3장을 만들 때 서로 다른 실물을 참조한다)
```

두 번째가 특히 중요하다: 캡처가 한 장뿐이라 3장이 노이즈로만 갈리는 상태인데
(`queue/runner.py` 머리말), 이제 참조하는 실물도 갈린다. 나쁜 레퍼런스 하나가 3장을
전부 망치지도 않는다.

## 무엇을 하지 않는가

**어느 레퍼런스가 화면의 어느 자리에 대응하는지 정하지 않는다.** diffusers 에
`ip_adapter_masks` 가 있어서 영역별로 묶을 수 있지만, 그러려면 제품별 **바운딩 박스**가
필요하다. 요청에는 `screenAreaPercent`(면적 비율)만 있고 좌표가 없다
(`schemas.ProductCategory`). 그래서 지금 레퍼런스는 화면 전체에 거는 조건이다 —
"이 의자를 저 자리에" 가 아니라 "이런 재질의 의자가 있는 방" 이다.

좌표가 들어오면 이 파일이 아니라 호출부가 바뀐다. 여기서는 고른 것을 **순서대로**
돌려주므로(면적이 큰 것부터) 마스크가 생겼을 때 짝을 맞추기 쉽다.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from app.core.config import Settings
from app.core.errors import ErrorCode, WorkerError
from app.core.logging import get_logger

log = get_logger(__name__)

#: 레퍼런스로 읽을 확장자. `product_batch.IMAGE_SUFFIXES` 와 같은 집합을 쓴다.
IMAGE_SUFFIXES = frozenset({".png", ".jpg", ".jpeg", ".webp", ".bmp"})


@dataclass(frozen=True)
class Reference:
    """고른 사진 한 장."""

    path: Path
    #: 어느 카테고리에서 왔는지 (폴더 이름). 요청 경로로 들어온 것은 빈 문자열.
    key: str
    #: `request` = 요청이 경로를 직접 줬다 · `category` = 카테고리로 우리가 골랐다.
    source: str

    def describe(self) -> dict:
        return {"path": str(self.path), "category": self.key, "source": self.source}


@dataclass(frozen=True)
class ReferencePick:
    """고른 것과, 못 고른 것의 사유."""

    references: tuple[Reference, ...] = ()
    #: `(요청에 있던 이름, 사유)`. 조용히 빠지면 "왜 저 제품은 반영이 안 됐나" 가 남는다.
    missing: tuple[tuple[str, str], ...] = ()
    #: 상한(`IP_ADAPTER_MAX_REFERENCES`)에 밀려 빠진 카테고리.
    dropped: tuple[str, ...] = ()

    def __bool__(self) -> bool:
        return bool(self.references)


def _resolve_requested(path_value: str, settings: Settings) -> Path:
    """`productReferencePaths` 항목 하나 → 실제 경로.

    `INPUT_DIR` 하위로만 허용한다 — `load_simulator_view` 와 같은 규칙이다. 이 값은
    HTTP 로 들어오므로 제한이 없으면 임의 파일 읽기가 된다.
    """
    root = settings.input_dir.resolve()
    candidate = Path(path_value)
    if not candidate.is_absolute():
        candidate = root / candidate
    candidate = candidate.resolve()
    if not candidate.is_relative_to(root):
        raise WorkerError(
            ErrorCode.INVALID_REQUEST,
            f"productReferencePaths must stay inside {root}; got {candidate}.",
        )
    return candidate


def category_key(name: str) -> str | None:
    """제품 이름/카테고리 → 레퍼런스 폴더 이름. 못 정하면 None.

    두 단계다 — `localize.localize_product` 와 같은 순서이되 **코드**를 찾는다:

    ```text
    ① 이미 카테고리 코드다      "CHAIR"                      -> chair
    ② 제품명 낱말 표            "시디즈 T50 ... 의자 HDA"    -> chair   (product_sort)
    ```

    ①에서 코드인지 아닌지를 사전 조회로 가르지 않는다. 폴더가 실제로 있는지는 호출부가
    확인하므로, 여기서는 **모양만** 정규화하면 된다. 표에 없는 코드는 폴더가 없어서
    자연히 걸러진다.
    """
    cleaned = name.strip()
    if not cleaned:
        return None
    # 카테고리 코드 모양(ASCII + 밑줄)이면 그대로 폴더 이름으로 쓴다.
    if cleaned.replace("_", "").replace(" ", "").isascii() and cleaned.replace("_", "").replace(" ", "").isalpha():
        return cleaned.strip().lower().replace(" ", "_").replace("-", "_")

    from app.product_sort import classify_by_name

    matched = classify_by_name(cleaned)
    return matched[0].lower() if matched else None


def pick_from_folder(folder: Path, seed: int) -> Path | None:
    """폴더에서 한 장. 파일이 없으면 None. 고르는 규칙은 머리말 참고."""
    files = sorted(p for p in folder.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_SUFFIXES)
    if not files:
        return None
    return files[seed % len(files)]


def select(request, settings: Settings, seed: int) -> ReferencePick:
    """이 요청에 쓸 레퍼런스들. 우선순위는 **화면을 많이 차지하는 제품부터**.

    면적으로 정렬하는 이유는 프롬프트 쪽과 같다(`product_categories.MIN_SCREEN_AREA_PERCENT`):
    상한에 걸려 잘릴 때 **작아서 어차피 잘 안 보이는 것**이 먼저 잘려야 한다.

    `productReferencePaths` 가 오면 그것만 쓴다 — 요청이 명시한 것을 우리가 고른 것과
    섞으면 어느 쪽이 결과에 기여했는지 사후에 가를 수 없다.
    """
    limit = max(0, settings.ip_adapter_max_references)
    if limit == 0:
        return ReferencePick()

    # --- 요청이 경로를 직접 준 경우 ---
    if request.product_reference_paths:
        chosen: list[Reference] = []
        missing: list[tuple[str, str]] = []
        for value in request.product_reference_paths[:limit]:
            path = _resolve_requested(value, settings)
            if not path.is_file():
                missing.append((value, "파일이 없다"))
                continue
            if path.suffix.lower() not in IMAGE_SUFFIXES:
                missing.append((value, f"이미지 확장자가 아니다 ({path.suffix})"))
                continue
            chosen.append(Reference(path, "", "request"))
        dropped = tuple(request.product_reference_paths[limit:])
        return ReferencePick(tuple(chosen), tuple(missing), dropped)

    # --- 카테고리로 우리가 고르는 경우 ---
    root = settings.references_dir
    if not root.is_dir():
        return ReferencePick(missing=((str(root), "레퍼런스 폴더가 없다 (gate-references 를 먼저 돌린다)"),))

    # (이름, 정렬 키). 카테고리가 이름보다 앞선다 — 사람이 정한 유한한 집합이라 확실하다
    # (`queue/runner._to_request` 가 프롬프트에서 쓰는 것과 같은 근거).
    candidates: list[tuple[str, float]] = [
        (item.code, item.screen_area_percent) for item in request.product_categories
    ]
    candidates.sort(key=lambda pair: -pair[1])
    candidates += [(name, -1.0) for name in request.product_summary]

    chosen = []
    missing = []
    dropped_keys: list[str] = []
    seen: set[str] = set()
    for name, _area in candidates:
        key = category_key(name)
        if key is None:
            missing.append((name, "카테고리를 정할 수 없다 (product_sort 낱말 표에 없다)"))
            continue
        if key in seen:
            continue
        folder = root / key
        if not folder.is_dir():
            missing.append((name, f"{root.name}/{key}/ 폴더가 없다"))
            continue
        picked = pick_from_folder(folder, seed)
        if picked is None:
            missing.append((name, f"{root.name}/{key}/ 가 비어 있다"))
            continue
        seen.add(key)
        if len(chosen) >= limit:
            dropped_keys.append(key)
            continue
        chosen.append(Reference(picked, key, "category"))

    return ReferencePick(tuple(chosen), tuple(missing), tuple(dropped_keys))
