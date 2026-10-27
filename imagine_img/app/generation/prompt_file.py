"""파일에서 읽어 **그대로** 쓰는 프롬프트 (임시 실험 경로, 2026-08-04).

## 왜 있는가

`prompt_builder` 는 **데스크 셋업 실사화** 전용이다 — 구조 보존·조명 상태·무드·제품
목록을 우선순위로 조합해 문장을 만든다. 그런데 같은 모델·같은 파이프라인으로 **다른
종류의 이미지**를 뽑아 봐야 할 때가 있다. 이 파일이 생긴 계기는 크롤링해 온 제품
사진을 저작권에 걸리지 않는 자체 이미지로 바꾸는 작업이었다.

그 프롬프트를 `prompt_builder` 안에 넣으면 실사화 규칙과 임시 실험이 한 함수에서
섞인다 — 무드 표를 고칠 때 저작권 문장을 함께 읽어야 하고, 그 반대도 마찬가지다.
그래서 **프롬프트만 파일에서 갈아끼우는 우회로**를 따로 뒀다.

`PROMPT_FILE` 이 비어 있으면(기본) 이 모듈은 호출되지 않는다 — 기존 동작이 한 줄도
바뀌지 않는다. 지금 작업하는 동안만 `--prompt-file` 로 켜고, 끝나면 아무것도
되돌릴 것이 없다.

## 파일 형식

```text
# 여는 # 는 주석이다. 줄 전체를 버린다.
studio photo of a {products} ...      ← 헤더 없는 맨 위 = 모든 제품에 적용되는 positive

[when MONITOR]
the screen shows a plain gradient wallpaper ...   ← MONITOR 일 때만 붙는 positive

[when MONITOR negative]
desktop icons, taskbar, ...                       ← MONITOR 일 때만 붙는 negative

[negative]
logo, brand text, ...                             ← 모든 제품에 적용되는 negative
```

- 한 섹션 안의 여러 줄은 **공백 하나로 이어붙인다**. CLIP 은 줄바꿈을 개념으로 읽지
  않으므로, 줄을 나누는 것은 사람이 읽기 위한 것일 뿐이다.
- `[negative]` 는 생략할 수 있다. 없으면 negative 는 빈 문자열이 되고, 그때는
  `NEGATIVE_PROMPT_PROFILE` 이 아니라 **빈 값**이 쓰인다 — 파일이 프롬프트의
  유일한 출처라는 뜻이다. 두 출처가 섞이면 어느 쪽이 결과를 만들었는지 알 수 없다.
- `{products}` 는 제품 이름으로 치환된다. 파일이 이 자리표를 쓰는데 이름이 없으면
  **즉시 실패**한다 — "a  photo of a ." 같은 프롬프트로 GPU 를 40초 돌리고 나서
  알아차리는 것보다 낫다.

### `[when CODE]` — 카테고리에만 붙는 문장

제품 종류마다 따로 지켜야 할 것이 있다. 모니터는 **화면에 원래 깔려 있던 배경화면**이
그대로 남으면 안 된다(그 배경화면도 남의 저작물이다). 키보드는 키캡의 글자가 원본 각인을
베낀다. 공통 프롬프트에 다 적으면 마우스를 만들 때도 "화면" 이야기가 실려서, CLIP 이
없는 화면을 만들어 붙이려 한다.

`[when MONITOR]` 블록은 카테고리 코드가 `MONITOR` 일 때만 프롬프트에 들어간다.
`[when MONITOR, TV]` 처럼 쉼표로 여러 코드를 적을 수 있고, `[when MONITOR negative]` 로
그 카테고리에만 붙는 네거티브도 쓸 수 있다. 코드는 배치 폴더 이름이나
`--category` 로 정해진다 (app/product_batch.py).

붙는 순서는 **공통 → 카테고리**다. 카테고리 문장이 뒤에 와야 같은 대상을 두 번 말할 때
나중 말이 남는다.

## 여기서 하지 않는 것

토큰 예산에 맞춰 문장을 버리지 않는다. 사람이 쓴 파일을 조용히 잘라내면 무엇이
실렸는지 알 수 없기 때문이다. 청킹(`long_prompt.py`)이 기본 ON 이라 길이 제약은
사실상 없고, 청킹을 끈 경로에서는 diffusers 가 자르면서 경고를 남긴다.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

from app.core.errors import ConfigurationError

#: 이 줄 아래가 negative prompt 다. 대소문자·앞뒤 공백은 무시한다.
NEGATIVE_HEADER = "[negative]"

#: 배경 생성(2단계 inpaint)에만 쓰이는 프롬프트. `[background]` / `[background negative]`.
#:
#: 1단계(제품을 새로 그리는 img2img)와 **다른 프롬프트가 필요하다.** 1단계 프롬프트는
#: "제품이 화면을 크게 채우고 배경과 분리되어 보이게" 라고 말하는데, 그 문장이 배경 생성에
#: 실리면 방을 그리지 말라는 지시로 읽힌다. 배경 단계는 반대로 방을 주인공처럼 말해야 한다.
BACKGROUND_HEADER = "[background]"
BACKGROUND_NEGATIVE_HEADER = "[background negative]"

#: 조화(3단계 전체 img2img)에만 쓰이는 프롬프트. `[harmonize]` / `[harmonize negative]`.
#:
#: 2단계까지는 제품 픽셀이 마스크로 얼어 있어서 조명이 방과 맞지 않는다. 이 단계는 마스크를
#: 풀고 약하게 다시 그려 한 장의 사진으로 맞춘다 — 그래서 "제품" 도 "방" 도 아니라
#: **한 장면의 일관성**을 말하는 프롬프트가 필요하다.
HARMONIZE_HEADER = "[harmonize]"
HARMONIZE_NEGATIVE_HEADER = "[harmonize negative]"

#: `[when MONITOR]` / `[when MONITOR, TV negative]` / `[when CHAIR background]`.
#:
#: 단계 이름을 붙일 수 있다. 제품이 **놓이는 면이 카테고리마다 다르기** 때문이다 — 의자·책상은
#: 바닥에 서고 키보드는 책상 위에 놓이고 벽시계는 벽에 걸린다. 공통 배경 프롬프트에 "책상 위"
#: 라고 적으면 의자가 탁자 위 미니어처로 나온다 (2026-08-04 실측).
WHEN_HEADER = re.compile(
    r"^\[when\s+([^\]]+?)(?:\s+(background|harmonize))?(\s+negative)?\]$", re.IGNORECASE
)

#: 제품 이름 자리표. 카테고리 단어 또는 `--products` 값이 쉼표로 이어져 들어간다.
PRODUCTS_PLACEHOLDER = "{products}"

COMMENT_PREFIX = "#"


@dataclass(frozen=True)
class FilePrompt:
    """파일에서 읽은 프롬프트 한 벌."""

    prompt: str
    negative_prompt: str
    #: 어느 파일이 이 결과를 만들었는지. metadata 에 남긴다 — 파일은 언제든 고쳐지므로
    #: 경로가 없으면 나중에 출력만 보고 프롬프트를 되짚을 수 없다.
    path: Path
    #: 이번에 실린 `[when ...]` 코드. 어느 카테고리 문장이 붙었는지 metadata 에 남긴다.
    applied_categories: tuple[str, ...] = ()
    #: 파일에 블록이 있는데 이번 요청의 카테고리와 맞지 않아 안 실린 코드.
    #: 배치에서 폴더 이름을 잘못 적었을 때(예: `moniter/`) 이 목록으로 알아차린다.
    available_categories: tuple[str, ...] = field(default=())
    #: 배경 생성(2단계 inpaint) 전용 프롬프트. 없으면 빈 문자열이고, 그때 배경 단계는 돌지 않는다.
    background_prompt: str = ""
    background_negative: str = ""
    #: 조화(3단계 전체 img2img) 전용 프롬프트. 없으면 그 단계도 돌지 않는다.
    harmonize_prompt: str = ""
    harmonize_negative: str = ""


@dataclass
class _Section:
    """헤더 하나가 모으는 줄들."""

    lines: list[str]
    negative: bool
    #: 빈 튜플이면 모든 요청에 적용된다.
    codes: tuple[str, ...]
    #: 어느 단계의 섹션인가. `""`(1단계) / `"background"` / `"harmonize"`.
    stage: str = ""


def _join(lines: list[str]) -> str:
    return " ".join(line for line in (raw.strip() for raw in lines) if line)


#: 고정 헤더 → `(단계, negative 인가)`. `[when ...]` 만 정규식으로 따로 읽는다.
_FIXED_HEADERS: dict[str, tuple[str, bool]] = {
    NEGATIVE_HEADER: ("", True),
    BACKGROUND_HEADER: ("background", False),
    BACKGROUND_NEGATIVE_HEADER: ("background", True),
    HARMONIZE_HEADER: ("harmonize", False),
    HARMONIZE_NEGATIVE_HEADER: ("harmonize", True),
}


def _parse_sections(raw: str, source: Path) -> list[_Section]:
    sections: list[_Section] = [_Section(lines=[], negative=False, codes=())]
    for number, line in enumerate(raw.splitlines(), start=1):
        stripped = line.strip()
        if stripped.startswith(COMMENT_PREFIX):
            continue
        fixed = _FIXED_HEADERS.get(stripped.lower())
        if fixed is not None:
            stage, negative = fixed
            sections.append(_Section(lines=[], negative=negative, codes=(), stage=stage))
            continue
        match = WHEN_HEADER.match(stripped)
        if match:
            codes = tuple(
                code.strip().upper().replace(" ", "_")
                for code in match.group(1).split(",")
                if code.strip()
            )
            if not codes:
                raise ConfigurationError(
                    f"PROMPT_FILE '{source}' line {number}: [when ...] needs at least one "
                    f"category code, e.g. [when MONITOR]."
                )
            sections.append(
                _Section(
                    lines=[],
                    negative=bool(match.group(3)),
                    codes=codes,
                    stage=(match.group(2) or "").lower(),
                )
            )
            continue
        if stripped.startswith("[") and stripped.endswith("]"):
            # 오타를 조용히 프롬프트 본문으로 흘려보내면 `[negativ]` 한 글자 때문에
            # 네거티브 전체가 positive 에 실린다. 그건 결과를 보고도 알아채기 어렵다.
            raise ConfigurationError(
                f"PROMPT_FILE '{source}' line {number}: unknown section header {stripped!r}. "
                f"Use '{NEGATIVE_HEADER}', '{BACKGROUND_HEADER}', "
                f"'{BACKGROUND_NEGATIVE_HEADER}', '{HARMONIZE_HEADER}', "
                f"'{HARMONIZE_NEGATIVE_HEADER}', '[when CODE]', or '[when CODE negative]'."
            )
        sections[-1].lines.append(stripped)
    return sections


def load_prompt_file(
    path: Path,
    products: list[str] | tuple[str, ...] = (),
    categories: list[str] | tuple[str, ...] = (),
) -> FilePrompt:
    """프롬프트 파일을 읽어 positive/negative 로 나눈다.

    `categories` 에 있는 코드의 `[when ...]` 블록만 실린다. 순서는 공통 문장 먼저,
    카테고리 문장 나중이다.
    """
    resolved = Path(path).expanduser()
    try:
        raw = resolved.read_text(encoding="utf-8")
    except FileNotFoundError as exc:
        raise ConfigurationError(f"PROMPT_FILE '{resolved}' does not exist.") from exc
    except OSError as exc:
        raise ConfigurationError(f"PROMPT_FILE '{resolved}' could not be read: {exc}") from exc

    wanted = {code.strip().upper() for code in categories if code and code.strip()}
    sections = _parse_sections(raw, resolved)

    common_positive: list[str] = []
    common_negative: list[str] = []
    scoped_positive: list[str] = []
    scoped_negative: list[str] = []
    staged: dict[tuple[str, bool], list[str]] = {
        ("background", False): [],
        ("background", True): [],
        ("harmonize", False): [],
        ("harmonize", True): [],
    }
    applied: list[str] = []
    available: list[str] = []

    for section in sections:
        if section.stage and section.codes:
            # 카테고리 전용 배경/조화 문장. 맞을 때만, 공통 문장 뒤에 붙인다.
            available.extend(section.codes)
            if wanted.intersection(section.codes):
                applied.extend(code for code in section.codes if code in wanted)
                staged[(section.stage, section.negative)].extend(section.lines)
            continue
        if section.stage:
            staged[(section.stage, section.negative)].extend(section.lines)
            continue
        if not section.codes:
            (common_negative if section.negative else common_positive).extend(section.lines)
            continue
        available.extend(section.codes)
        if not wanted.intersection(section.codes):
            continue
        applied.extend(code for code in section.codes if code in wanted)
        (scoped_negative if section.negative else scoped_positive).extend(section.lines)

    prompt = _join(common_positive + scoped_positive)
    if not prompt:
        raise ConfigurationError(
            f"PROMPT_FILE '{resolved}' has no positive prompt "
            f"(everything outside the '{NEGATIVE_HEADER}' sections is comments or blank)."
        )
    negative = _join(common_negative + scoped_negative)

    background = _join(staged[("background", False)])
    background_neg = _join(staged[("background", True)])
    harmonize = _join(staged[("harmonize", False)])
    harmonize_neg = _join(staged[("harmonize", True)])

    words = [word.strip() for word in products if word and word.strip()]
    if PRODUCTS_PLACEHOLDER in f"{prompt} {negative} {background} {background_neg} {harmonize} {harmonize_neg}":
        if not words:
            raise ConfigurationError(
                f"PROMPT_FILE '{resolved}' uses {PRODUCTS_PLACEHOLDER} but no product name was "
                "given. Pass --products or --category (CLI), or productSummary/"
                "productCategories (API)."
            )
        joined = ", ".join(words)
        prompt = prompt.replace(PRODUCTS_PLACEHOLDER, joined)
        negative = negative.replace(PRODUCTS_PLACEHOLDER, joined)
        background = background.replace(PRODUCTS_PLACEHOLDER, joined)
        background_neg = background_neg.replace(PRODUCTS_PLACEHOLDER, joined)
        harmonize = harmonize.replace(PRODUCTS_PLACEHOLDER, joined)
        harmonize_neg = harmonize_neg.replace(PRODUCTS_PLACEHOLDER, joined)

    return FilePrompt(
        prompt=prompt,
        negative_prompt=negative,
        path=resolved,
        applied_categories=tuple(dict.fromkeys(applied)),
        available_categories=tuple(dict.fromkeys(available)),
        background_prompt=background,
        background_negative=background_neg,
        harmonize_prompt=harmonize,
        harmonize_negative=harmonize_neg,
    )
