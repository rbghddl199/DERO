#!/bin/bash
# docs/context/erd.md(DB 스키마 정본) 동결 장치. 2026-07-23 박동규 지시.
#
# 목적: 스키마가 "조용히" 바뀌는 것을 막는다. 승인된 변경을 막는 게 아니다.
# 2층 구조 — ① PreToolUse 차단(예방): 에이전트 편집을 거부해 대화로 끌어올린다
#            ② 기준선 해시(탐지): 우회·직접 편집으로 바뀐 경우 Stop 훅이 적발한다
# 한계: 훅은 사람 동의를 증명할 수 없다. ①이 주 장치, ②가 사후 감사다.
#
# 모드
#   (인자 없음, stdin=JSON)  PreToolUse 훅
#   --verify                 기준선 해시 대조. 일치 0 / 불일치 1 (Stop 훅이 호출)
#   --unlock "<사유>"        30분 편집 창을 연다. **박동규가 직접 실행** (`!` 접두)
#   --rebaseline             기준선을 현재 내용으로 갱신 (언락 창 안에서만)
#   --status                 현재 동결·언락 상태 출력
#
# 규칙 정본: docs/HARNESS-RULES.md §4 · 대상 문서: docs/context/erd.md

set -u

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
TARGET="$ROOT/docs/context/erd.md"
BASELINE="$ROOT/.claude/erd-baseline.sha256"
UNLOCK="$ROOT/.claude/.erd-unlock"
TTL=1800

# CR을 지우고 해싱한다 — 줄바꿈 정규화. Windows 체크아웃은 작업 트리가 CRLF라
# (git ls-files --eol → w/crlf) 디스크 바이트가 LF 기준선과 영원히 어긋난다.
# git status는 깨끗한데 --verify만 계속 실패했다 (2026-07-27, 박성은 제보).
# 부작용: 줄바꿈만 바뀐 변경은 탐지하지 않는다 — 스키마 문서에선 무의미한 차이다.
hash_target() {
  [ -f "$TARGET" ] || return 1
  if command -v sha256sum >/dev/null 2>&1; then
    tr -d '\r' < "$TARGET" | sha256sum | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    tr -d '\r' < "$TARGET" | shasum -a 256 | awk '{print $1}'
  else
    return 1
  fi
}

baseline_hash() {
  [ -f "$BASELINE" ] || return 1
  grep -v '^#' "$BASELINE" | awk 'NF {print $1; exit}'
}

# 언락 유효성: 파일 존재 + TTL 이내 + 사유 비어있지 않음
unlock_reason() {
  [ -f "$UNLOCK" ] || return 1
  local mtime now reason
  mtime=$(date -r "$UNLOCK" +%s 2>/dev/null) || return 1
  now=$(date +%s)
  [ $((now - mtime)) -le "$TTL" ] || return 1
  reason=$(grep -v '^#' "$UNLOCK" | grep -v '^[[:space:]]*$' | head -1)
  [ -n "$reason" ] || return 1
  printf '%s' "$reason"
}

# 판정기가 죽었을 때 쓰는 최소 차단 메시지 (fail-closed)
deny_fallback() {
  printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"[ERD 동결] 판정기 오류로 보호 판정을 완료할 수 없어 차단했습니다. docs/context/erd.md은 동결 대상입니다. .claude/hooks/erd-freeze.sh --status 로 상태를 확인하고, 훅 자체가 깨졌으면 박동규에게 보고하세요. 규칙 정본: docs/HARNESS-RULES.md 4절"}}'
}

case "${1:-}" in
  --verify)
    cur=$(hash_target) || { echo "erd.md 또는 sha256 도구를 찾을 수 없습니다"; exit 0; }
    base=$(baseline_hash) || { echo "기준선 파일이 없습니다: .claude/erd-baseline.sha256"; exit 1; }
    [ "$cur" = "$base" ] && exit 0
    echo "drift: erd.md=$cur baseline=$base"
    exit 1
    ;;

  --unlock)
    reason="${2:-}"
    if [ -z "$reason" ]; then
      echo "사유가 필요합니다: $0 --unlock \"<왜 스키마를 바꾸는가>\"" >&2
      exit 2
    fi
    {
      echo "# erd.md 편집 언락 — ${TTL}초(30분) 유효. 승인: 박동규"
      echo "# 생성: $(date '+%Y-%m-%d %H:%M:%S')"
      echo "$reason"
    } > "$UNLOCK"
    echo "ERD 언락 완료 (30분). 사유: $reason"
    echo "수정 후: erd.md '확정 후 개정' 표에 한 줄 추가 + $0 --rebaseline"
    ;;

  --rebaseline)
    if ! unlock_reason >/dev/null; then
      echo "언락이 없거나 만료됐습니다. 기준선은 승인 창 안에서만 갱신할 수 있습니다." >&2
      echo "박동규가 실행: $0 --unlock \"<사유>\"" >&2
      exit 1
    fi
    cur=$(hash_target) || { echo "해시 계산 실패" >&2; exit 1; }
    {
      echo "# docs/context/erd.md 동결 기준선. 갱신은 --rebaseline(언락 창 안에서만)."
      echo "# 사유: $(unlock_reason)"
      echo "$cur  $(date '+%Y-%m-%d')"
    } > "$BASELINE"
    echo "기준선 갱신: $cur"
    ;;

  --status)
    cur=$(hash_target) || cur="(계산 실패)"
    base=$(baseline_hash) || base="(기준선 없음)"
    echo "erd.md   : $cur"
    echo "기준선   : $base"
    if [ "$cur" = "$base" ]; then echo "정합     : 일치"; else echo "정합     : ★불일치 — 승인된 변경이면 --rebaseline, 아니면 되돌릴 것"; fi
    if r=$(unlock_reason); then echo "언락     : 유효 — $r"; else echo "언락     : 없음/만료 (동결 상태)"; fi
    ;;

  "")
    # ── PreToolUse 훅 모드 ────────────────────────────────────────────────
    input=$(cat)

    # 1차 선별: 보호 대상 이름이 아예 없으면 우리 일이 아니다 (대부분의 호출이 여기서 끝난다)
    case "$input" in
      *erd.md*|*.erd-unlock*|*erd-baseline*|*erd-freeze*|*--unlock*) ;;
      *) exit 0 ;;
    esac

    # 여기부터는 보호 대상이 언급된 호출이다 — 판정 실패 시 통과가 아니라 차단한다.
    command -v python3 >/dev/null 2>&1 || { deny_fallback; exit 0; }

    if unlock_reason >/dev/null; then ERD_UNLOCK_OK=1; else ERD_UNLOCK_OK=0; fi
    export ERD_UNLOCK_OK

    guard=$(cat <<'PYEOF'
import sys, json, os, re

EDIT_TOOLS = ("Edit", "Write", "MultiEdit", "NotebookEdit")
TARGET_SUFFIX = os.path.join("docs", "context", "erd.md")
UNLOCK_SUFFIX = os.path.join(".claude", ".erd-unlock")
unlocked = os.environ.get("ERD_UNLOCK_OK") == "1"

ASK = (
    "[ERD 동결] docs/context/erd.md은 DB 스키마 정본이라 동결돼 있습니다"
    "(2026-07-23, 박동규 지시). 직접 수정할 수 없습니다. 순서를 지키세요. "
    "1) 편집을 멈추고 박동규에게 4항목을 제시한다 — "
    "(1) 무엇을 바꾸는가(테이블·컬럼 단위) "
    "(2) 왜 지금 필요한가(어느 요구사항·판정·코드가 막히는가) "
    "(3) 바꾸지 않으면 무슨 일이 생기는가 "
    "(4) 파급 범위(GLOSSARY 2부·CONTEXT D시리즈·compatibility.md·JPA 엔티티·Flyway). "
    "2) 박동규가 동의하면 박동규가 직접 실행한다: "
    "!.claude/hooks/erd-freeze.sh --unlock \"<사유>\" "
    "3) 언락은 30분 유효. 그 안에 수정하고 erd.md '확정 후 개정' 표에 한 줄 남긴 뒤 --rebaseline. "
    "동의 없이 우회하지 마세요. 규칙 정본: docs/HARNESS-RULES.md 4절"
)

NO_SELF_UNLOCK = (
    "[ERD 동결] 언락 파일·기준선은 에이전트가 만들 수 없습니다 — 그게 동의의 증거이기 때문입니다. "
    "박동규에게 변경 사유를 설명하고 동의를 받은 뒤, 박동규가 직접 "
    "!.claude/hooks/erd-freeze.sh --unlock \"<사유>\" 를 실행해야 합니다."
)

# 쓰기 신호: 인터프리터 한 줄 실행은 이 신호가 같이 있을 때만 막는다.
# (erd.md 언급만으로 막으면 정상 조회 명령까지 걸린다 — 2026-07-23 오탐 1건으로 좁혔다)
WRITE_SIGNAL = re.compile(
    r"(\s-i\b|open\s*\(|[\x22\x27]w[+btx]*[\x22\x27]|writeFile|\.write\b|>)"
)
INTERPRETER = re.compile(r"\b(sed|awk|perl|ruby|python3?|node|deno|bun)\b")


def deny(reason):
    out = {"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": reason,
    }}
    sys.stdout.write(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n")
    sys.exit(3)


payload = json.load(sys.stdin)          # 실패하면 비정상 종료 → 셸이 fail-closed 처리
if not isinstance(payload, dict):
    sys.exit(0)

tool = payload.get("tool_name")
ti = payload.get("tool_input")
if not isinstance(ti, dict):
    sys.exit(0)

if tool in EDIT_TOOLS:
    path = ti.get("file_path") or ti.get("notebook_path") or ""
    if not isinstance(path, str):
        sys.exit(0)
    norm = os.path.normpath(path)
    if norm.endswith(UNLOCK_SUFFIX) or norm.endswith("erd-baseline.sha256"):
        deny(NO_SELF_UNLOCK)
    if norm.endswith(TARGET_SUFFIX):
        if unlocked:
            sys.exit(0)
        deny(ASK)
    sys.exit(0)

# codex CLI 편집 도구: 패치 텍스트의 파일 헤더에서 경로를 읽는다 (2026-08-10 실측 페이로드)
if tool == "apply_patch":
    cmd = ti.get("command")
    if not isinstance(cmd, str):
        sys.exit(0)
    paths = re.findall(r"^\*\*\* (?:Add|Update|Delete) File: (.+)$", cmd, re.M)
    paths += re.findall(r"^\*\*\* Move to: (.+)$", cmd, re.M)
    for p in paths:
        norm = os.path.normpath(p.strip())
        if norm.endswith(UNLOCK_SUFFIX) or norm.endswith("erd-baseline.sha256"):
            deny(NO_SELF_UNLOCK)
        if norm.endswith(TARGET_SUFFIX) and not unlocked:
            deny(ASK)
    sys.exit(0)

if tool == "Bash":
    cmd = ti.get("command")
    if not isinstance(cmd, str):
        sys.exit(0)

    # 동의 위조 차단: 언락·기준선 생성은 언제나 사람 손이다 (언락 창 안에서도 막는다)
    if "--unlock" in cmd:
        deny(NO_SELF_UNLOCK)
    if re.search(r"(\.erd-unlock|erd-baseline\.sha256)", cmd) and re.search(
            r"(>>?\s*[^\s|;&]*(\.erd-unlock|erd-baseline\.sha256)"
            r"|\b(tee|cp|mv|touch|install)\b)", cmd):
        deny(NO_SELF_UNLOCK)

    if "erd.md" not in cmd or unlocked:
        sys.exit(0)

    # 읽기는 통과, 쓰기만 차단 (best-effort 패턴 매칭)
    mutating = (
        re.search(r">>?\s*[^\s|;&]*erd\.md", cmd)
        or re.search(r"\btee\b[^|;&]*erd\.md", cmd)
        or re.search(r"\b(cp|mv|rm|truncate|install|patch)\b[^|;&]*erd\.md", cmd)
        or (INTERPRETER.search(cmd) and WRITE_SIGNAL.search(cmd))
        or re.search(r"\bgit\s+(checkout|restore|apply|stash|revert|reset|clean)\b", cmd)
    )
    if mutating:
        deny(ASK)

sys.exit(0)
PYEOF
)

    out=$(printf '%s' "$input" | python3 -c "$guard" 2>/dev/null)
    rc=$?
    case "$rc" in
      0) exit 0 ;;                       # 판정: 통과
      3) printf '%s\n' "$out"; exit 0 ;; # 판정: 차단
      *) deny_fallback; exit 0 ;;        # 판정기 오류 → fail-closed
    esac
    ;;

  *)
    echo "사용법: $0 [--verify|--unlock \"<사유>\"|--rebaseline|--status]" >&2
    exit 2
    ;;
esac
