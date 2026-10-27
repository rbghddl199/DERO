#!/bin/bash
# flyway-v1-freeze.sh 판정 매트릭스 회귀 테스트. 실행: .claude/hooks/flyway-v1-freeze.test.sh
ROOT=$(cd "$(dirname "$0")/../.." && pwd) || exit 1
cd "$ROOT" || exit 1
HOOK=.claude/hooks/flyway-v1-freeze.sh
V1=backend/dero-api/src/main/resources/db/migration/V1__baseline.sql
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
t DENY "Edit 상대경로"        "$(q Edit file_path "$V1")"
t DENY "Write 절대경로"       "$(q Write file_path "$ROOT/$V1")"
t DENY "MultiEdit ./경로"     "$(q MultiEdit file_path "./$V1")"
t DENY "빌드 산출물 사본"      "$(q Edit file_path backend/dero-api/bin/main/db/migration/V1__baseline.sql)"
t DENY "리다이렉트"           "$(q Bash command "cat x > $V1")"
t DENY "append 리다이렉트"    "$(q Bash command "echo x >> $V1")"
t DENY "tee"                  "$(q Bash command "echo x | tee $V1")"
t DENY "sed -i"               "$(q Bash command "sed -i '' s/a/b/ $V1")"
t DENY "python open w"        "$(q Bash command "python3 -c open(\"$V1\",\"w\")")"
t DENY "rm"                   "$(q Bash command "rm $V1")"
t DENY "mv 덮어쓰기"          "$(q Bash command "mv /tmp/x $V1")"
t DENY "깨진 JSON fail-closed" 'V1__baseline 을 언급하는 비-JSON 입력'
t DENY "apply_patch Update"   "$(q apply_patch command $'*** Begin Patch\n*** Update File: '"$V1"$'\n+x\n*** End Patch\n')"
t DENY "apply_patch Delete"   "$(q apply_patch command $'*** Begin Patch\n*** Delete File: '"$V1"$'\n*** End Patch\n')"
t DENY "apply_patch Move to"  "$(q apply_patch command $'*** Begin Patch\n*** Update File: docs/x.md\n*** Move to: '"$V1"$'\n+x\n*** End Patch\n')"

echo "── 통과해야 하는 것 ──"
t allow "새 버전 Write"       "$(q Write file_path backend/dero-api/src/main/resources/db/migration/V16__x.sql)"
t allow "다른 마이그레이션"    "$(q Edit file_path backend/dero-api/src/main/resources/db/migration/V15__desk_feed_image_product.sql)"
t allow "Read 도구"           "$(q Read file_path "$V1")"
# 이 규칙 자체를 서술하는 문서 편집이 막히면 안 된다 (block-no-verify가 2026-08-14에 밟은 오탐)
t allow "문서에 이름만 언급"   "$(q Write file_path docs/HARNESS-RULES.md)"
t allow "grep 읽기"           "$(q Bash command "grep -n 'create table' $V1")"
t allow "wc 읽기"             "$(q Bash command "wc -l $V1")"
t allow "git restore 복구"    "$(q Bash command "git restore $V1")"
t allow "git checkout 복구"   "$(q Bash command "git checkout HEAD -- $V1")"
t allow "무관한 Bash"         "$(q Bash command 'git status --porcelain')"
t allow "apply_patch 딴 파일"  "$(q apply_patch command $'*** Begin Patch\n*** Update File: docs/GLOSSARY.md\n+V1__baseline 언급만\n*** End Patch\n')"

echo
echo "합계: pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
