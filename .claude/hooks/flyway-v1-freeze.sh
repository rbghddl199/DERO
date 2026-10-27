#!/bin/bash
# Flyway `V1__baseline.sql` 동결 장치. 2026-07-31 박동규 지시를 훅으로 강제한다 (matt-realign 12).
#
# 목적: 이미 적용된 마이그레이션이 조용히 바뀌는 것을 막는다.
# 위반은 CI에 안 잡히고 다음 사람 로컬 부팅에서 터진다 —
# `flyway_schema_history`가 옛 체크섬을 쥔 채 `Migration checksum mismatch for migration version 1`.
#
# erd-freeze.sh와 다른 점 (의도적)
#   - 언락 창이 없다. 훅은 에이전트 도구 호출만 가로채므로, 사람이 에디터로 여는 길이 곧 예외다.
#   - 기준선 해시가 없다. V1은 git이 추적하고 변경은 diff에 그대로 보인다.
#   - `git checkout|restore`는 막지 않는다 — 동결본으로 되돌리는 복구 경로다.
#
# 규칙 정본: docs/HARNESS-RULES.md §4 · 복구 절차: docs/context/backend-runtime.md §1-8

set -u

deny_fallback() {
  printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"[V1 동결] 판정기 오류로 보호 판정을 완료할 수 없어 차단했습니다. V1__baseline.sql은 동결 대상입니다. 훅이 깨졌으면 박동규에게 보고하세요. 규칙 정본: docs/HARNESS-RULES.md 4절"}}'
}

input=$(cat)

# 1차 선별: 보호 대상 이름이 없으면 우리 일이 아니다 (호출 대부분이 여기서 끝난다)
case "$input" in
  *V1__baseline*) ;;
  *) exit 0 ;;
esac

command -v python3 >/dev/null 2>&1 || { deny_fallback; exit 0; }

guard=$(cat <<'PYEOF'
import sys, json, os, re

EDIT_TOOLS = ("Edit", "Write", "MultiEdit", "NotebookEdit")
TARGET = "V1__baseline.sql"

ASK = (
    "[V1 동결] V1__baseline.sql은 2026-07-31 동결됐습니다(박동규 지시). 고치지 말고 "
    "새 버전 파일(V16__<변경>.sql)을 만드세요. 이미 적용된 마이그레이션을 고치면 "
    "돌고 있는 로컬 Postgres의 flyway_schema_history가 옛 체크섬을 쥔 채 남아 다음 local 부팅이 "
    "'Migration checksum mismatch for migration version 1'로 막힙니다. "
    "./gradlew test 초록은 안전 신호가 아닙니다 — Testcontainers는 마이그레이션을 처음부터 재생하므로 "
    "실패가 부팅에서만 납니다. 정말 V1 자체를 고쳐야 한다면 박동규에게 사유를 제시하고 사람이 직접 편집합니다. "
    "규칙 정본: docs/HARNESS-RULES.md 4절 · 복구: docs/context/backend-runtime.md 1-8절"
)

# 쓰기 신호가 같이 있을 때만 인터프리터 한 줄 실행을 막는다 (조회는 통과).
WRITE_SIGNAL = re.compile(r"(\s-i\b|open\s*\(|[\x22\x27]w[+btx]*[\x22\x27]|writeFile|\.write\b|>)")
INTERPRETER = re.compile(r"\b(sed|awk|perl|ruby|python3?|node|deno|bun)\b")


def deny():
    out = {"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": ASK,
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
    if isinstance(path, str) and os.path.basename(os.path.normpath(path)) == TARGET:
        deny()
    sys.exit(0)

# codex CLI 편집 도구: 패치 텍스트의 파일 헤더에서 경로를 읽는다
if tool == "apply_patch":
    cmd = ti.get("command")
    if not isinstance(cmd, str):
        sys.exit(0)
    paths = re.findall(r"^\*\*\* (?:Add|Update|Delete) File: (.+)$", cmd, re.M)
    paths += re.findall(r"^\*\*\* Move to: (.+)$", cmd, re.M)
    for p in paths:
        if os.path.basename(os.path.normpath(p.strip())) == TARGET:
            deny()
    sys.exit(0)

if tool == "Bash":
    cmd = ti.get("command")
    if not isinstance(cmd, str) or TARGET not in cmd:
        sys.exit(0)
    mutating = (
        re.search(r">>?\s*[^\s|;&]*V1__baseline\.sql", cmd)
        or re.search(r"\btee\b[^|;&]*V1__baseline\.sql", cmd)
        or re.search(r"\b(cp|mv|rm|truncate|install|patch)\b[^|;&]*V1__baseline\.sql", cmd)
        or (INTERPRETER.search(cmd) and WRITE_SIGNAL.search(cmd))
    )
    if mutating:
        deny()

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
