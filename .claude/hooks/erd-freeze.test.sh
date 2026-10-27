#!/bin/bash
# erd-freeze.sh 판정 매트릭스 회귀 테스트. 실행: .claude/hooks/erd-freeze.test.sh
ROOT=$(cd "$(dirname "$0")/../.." && pwd) || exit 1
cd "$ROOT" || exit 1
HOOK=.claude/hooks/erd-freeze.sh
pass=0; fail=0

q() { python3 -c "import json,sys;print(json.dumps({'tool_name':sys.argv[1],'tool_input':{sys.argv[2]:sys.argv[3]}}))" "$1" "$2" "$3"; }

# expect: DENY 또는 allow
t() {
  local expect="$1" label="$2" payload="$3" out
  out=$(printf '%s' "$payload" | "$HOOK" 2>/dev/null)
  local got="allow"
  [ -n "$out" ] && got="DENY"
  if [ "$got" = "$expect" ]; then
    printf '  OK   %-28s %s\n' "$label" "$got"; pass=$((pass+1))
  else
    printf '  FAIL %-28s 기대=%s 실제=%s\n' "$label" "$expect" "$got"; fail=$((fail+1))
  fi
}

echo "── 차단해야 하는 것 ──"
t DENY "Edit 상대경로"       "$(q Edit file_path docs/context/erd.md)"
t DENY "Write 절대경로"      "$(q Write file_path "$ROOT/docs/context/erd.md")"
t DENY "MultiEdit ./경로"    "$(q MultiEdit file_path ./docs/context/erd.md)"
t DENY "리다이렉트"          "$(q Bash command 'cat x > docs/context/erd.md')"
t DENY "append 리다이렉트"   "$(q Bash command 'echo x >> docs/context/erd.md')"
t DENY "tee"                 "$(q Bash command 'echo x | tee docs/context/erd.md')"
t DENY "sed -i"              "$(q Bash command "sed -i '' s/a/b/ docs/context/erd.md")"
t DENY "python open w"       "$(q Bash command 'python3 -c open("docs/context/erd.md","w")')"
t DENY "git restore"         "$(q Bash command 'git restore docs/context/erd.md')"
t DENY "git checkout"        "$(q Bash command 'git checkout HEAD -- docs/context/erd.md')"
t DENY "rm"                  "$(q Bash command 'rm docs/context/erd.md')"
t DENY "mv"                  "$(q Bash command 'mv /tmp/x docs/context/erd.md')"
t DENY "언락파일 Write"      "$(q Write file_path .claude/.erd-unlock)"
t DENY "기준선 Write"        "$(q Write file_path .claude/erd-baseline.sha256)"
UNL="--un""lock"
t DENY "Bash 자가 언락"      "$(q Bash command ".claude/hooks/erd-freeze.sh $UNL 사유")"
t DENY "기준선 cp"           "$(q Bash command 'cp /tmp/x .claude/erd-baseline.sha256')"
t DENY "깨진 JSON fail-closed" 'erd.md 를 언급하는 비-JSON 입력'
# codex apply_patch (2026-08-10 실측 페이로드 형식)
t DENY "apply_patch Update"  "$(q apply_patch command $'*** Begin Patch\n*** Update File: docs/context/erd.md\n+x\n*** End Patch\n')"
t DENY "apply_patch 절대경로" "$(q apply_patch command $'*** Begin Patch\n*** Update File: '"$ROOT"$'/docs/context/erd.md\n+x\n*** End Patch\n')"
t DENY "apply_patch Delete"  "$(q apply_patch command $'*** Begin Patch\n*** Delete File: docs/context/erd.md\n*** End Patch\n')"
t DENY "apply_patch Move to" "$(q apply_patch command $'*** Begin Patch\n*** Update File: docs/x.md\n*** Move to: docs/context/erd.md\n+x\n*** End Patch\n')"
t DENY "apply_patch 언락파일" "$(q apply_patch command $'*** Begin Patch\n*** Add File: .claude/.erd-unlock\n+사유\n*** End Patch\n')"
t DENY "apply_patch 기준선"   "$(q apply_patch command $'*** Begin Patch\n*** Update File: .claude/erd-baseline.sha256\n+x\n*** End Patch\n')"

echo "── 통과해야 하는 것 ──"
t allow "grep 읽기"          "$(q Bash command 'grep -n rig_manifest docs/context/erd.md | head')"
t allow "wc 읽기"            "$(q Bash command 'wc -l docs/context/erd.md')"
t allow "awk 읽기"           "$(q Bash command 'awk /rig/{print} docs/context/erd.md')"
t allow "조회 파이프+python"  "$(q Bash command 'grep -c erd.md docs/SPEC.md | python3 -c import sys;print(sys.stdin.read())')"
t allow "다른 문서 Edit"     "$(q Edit file_path docs/GLOSSARY.md)"
t allow "무관한 Bash"        "$(q Bash command 'git status --porcelain')"
t allow "status 조회"        "$(q Bash command '.claude/hooks/erd-freeze.sh --status')"
t allow "verify 조회"        "$(q Bash command '.claude/hooks/erd-freeze.sh --verify')"
t allow "Read 도구"          "$(q Read file_path docs/context/erd.md)"
t allow "apply_patch 딴 파일" "$(q apply_patch command $'*** Begin Patch\n*** Update File: docs/GLOSSARY.md\n+erd.md 언급만\n*** End Patch\n')"

echo "── 줄바꿈 정규화 (--verify) ──"
# 가짜 레포를 만들어 CLAUDE_PROJECT_DIR로 훅을 그쪽에 겨눈다.
# LF 내용으로 기준선을 잡고, 같은 내용을 CRLF로 저장해도 --verify가 통과해야 한다.
eol_case() {
  local label="$1" body="$2" expect="$3" tmp out rc
  tmp=$(mktemp -d) || return
  mkdir -p "$tmp/docs/context" "$tmp/.claude"
  printf '%s' "$body" > "$tmp/docs/context/erd.md"
  { echo "# test"; echo "$(printf 'a\nb\n' | sha256sum | awk '{print $1}')  2026-07-27"; } \
    > "$tmp/.claude/erd-baseline.sha256"
  out=$(CLAUDE_PROJECT_DIR="$tmp" "$ROOT/$HOOK" --verify 2>&1); rc=$?
  rm -rf "$tmp"
  local got="일치"; [ "$rc" -ne 0 ] && got="불일치"
  if [ "$got" = "$expect" ]; then
    printf '  OK   %-28s %s\n' "$label" "$got"; pass=$((pass+1))
  else
    printf '  FAIL %-28s 기대=%s 실제=%s (%s)\n' "$label" "$expect" "$got" "$out"; fail=$((fail+1))
  fi
}
eol_case "LF 원본"           "$(printf 'a\nb\n')"$'\n'     일치
eol_case "CRLF 체크아웃"      "$(printf 'a\r\nb\r\n')"$'\n' 일치
eol_case "내용이 실제로 다름"  "$(printf 'a\nC\n')"$'\n'     불일치

echo
echo "합계: pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
