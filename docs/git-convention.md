# Git 컨벤션

**[Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/)을 권장한다.** 기계 강제는 없다 — 형식을 기계로 막던 훅은 삭제됐다(2026-08-13, ADR-0041 D-i). 권장을 지키는 이유는 히스토리를 `type`으로 훑을 수 있다는 것 하나이고, 어긴 커밋을 반려하지는 않는다. **subject 본문은 한국어로 쓴다** — 스펙은 언어를 규정하지 않고, `type`·`scope`·푸터 토큰만 스펙 어휘를 지킨다.

## 커밋 메시지 구조

```
<type>[(scope)][!]: <subject>

<body>

<footer>
```

- `type`은 아래 10종에서 고른다.
- `scope`는 선택. 변경이 닿은 코드 영역을 소문자 명사로 괄호에 넣는다 — `feat(three): ...`, `fix(erd): ...`. 무엇을 넣을지 애매하면 넣지 않는다.
- `subject`는 필수, 50자 이내, 마침표 없이.
- `body`, `footer`는 필요할 때만. `body`는 무엇을·왜 (어떻게는 코드로 알 수 있음).
- `footer`는 `<토큰>: <값>` 형태다. 외부 트래커가 없으므로 참조 대상은 로컬 티켓 파일이다.
  - 티켓 완료: `Resolves: .scratch/matt-realign/issues/05`
  - 단순 참조: `Refs: .scratch/matt-realign/issues/05`

**호환성을 깨는 변경(BREAKING CHANGE)** — 둘 중 하나로 표시한다(둘 다 써도 된다).

- `type` 뒤에 `!`: `feat!: 배치 저장 응답 형식 변경` — 이때 subject가 그 파괴적 변경을 설명한다.
- 푸터: `BREAKING CHANGE: <설명>` (`BREAKING-CHANGE`도 같은 뜻)

## Type 종류

스펙이 예시로 드는 10종을 그대로 쓴다. **이 목록이 정본이고, 브랜치 접두사도 여기서 나온다.**

| Type | 설명 | SemVer |
|------|------|--------|
| `feat` | 새로운 기능 추가 | MINOR |
| `fix` | 버그 수정 | PATCH |
| `docs` | 문서만 변경 | — |
| `style` | 포맷팅·세미콜론 등 동작에 영향 없는 변경 | — |
| `refactor` | 기능 변경 없는 구조 개선 | — |
| `perf` | 성능 개선 | — |
| `test` | 테스트 코드 추가·수정 | — |
| `build` | 빌드 시스템·의존성 변경 | — |
| `ci` | CI 설정·스크립트 변경 | — |
| `chore` | 그 외 잡무 (프로덕션 코드·테스트 변경 없음) | — |

파괴적 변경은 타입과 무관하게 MAJOR다.

## 예시

```
feat: 로그인 화면 소셜 로그인 버튼 추가

카카오, 구글 소셜 로그인 버튼을 로그인 화면에 추가한다.
버튼 클릭 시 각 OAuth 인증 페이지로 이동한다.

Resolves: .scratch/login-social/issues/03
```

```
feat(three)!: 관절 각도 저장 형식을 JSONB로 전환

BREAKING CHANGE: placed_item_joint 테이블이 사라져 기존 배치 데이터를 마이그레이션해야 한다
```

## 브랜치

**이름은 자유다.** 이름 형식·기준 브랜치·보호 브랜치를 기계로 막던 훅은 삭제됐다(2026-08-13, ADR-0041 D-i) — 만료된 이슈 키를 이름에 요구할 근거가 사라졌고, 강제할 대상도 나 하나다.

권장 형태만 남긴다.

| 용도 | 권장 이름 | 예 |
|---|---|---|
| 기능·수정 작업 | `<type>/<slug>` — 접두사는 그 변경을 커밋할 때 쓸 `type` | `feat/desk-feed-mention` · `fix/height-limit` |
| 버릴 프로토타입 | `prototype/<name>` | `prototype/portal-window` |
| 문서·도구 | `docs/<slug>` · `chore/<slug>` | `docs/matt-realign` |

- `.scratch/<feature-slug>/` 폴더 이름을 브랜치 슬러그로 그대로 쓰면 티켓과 브랜치가 눈으로 붙는다. 강제는 아니다.
- 기준 브랜치는 `develop`, 배포본은 `main`. **`develop` 직접 커밋 금지 조항은 삭제했다** — 리뷰어가 없어 MR을 경유할 이유가 사라졌다. 되돌리기 쉬운 작업은 `develop`에 바로 커밋해도 된다. 파괴적·되돌리기 어려운 변경(마이그레이션·배포 설정)은 여전히 브랜치를 딴다.
- `release/`는 두지 않는다 — 릴리스 프로세스가 없어서다. 생기면 그때 `release/vX.Y.Z`를 추가한다.
- `ai/`·`claude/` 같은 에이전트 접두사는 쓰지 않는다 — 커밋에 AI 저자 트레일러를 넣지 않는 방침과 같은 방향이다.

## 기타 규칙

- 커밋 하나에는 하나의 논리적 변경만 담는다.
- `subject`는 명령형으로 작성한다. (예: "수정함" X, "수정" O)
- 티켓 파일이 있는 작업이면 `footer`에 그 경로를 적는다.
- AI 도구(Claude Code 등)로 커밋할 때 `Co-Authored-By` 등 AI 트레일러는 넣지 않는다.
