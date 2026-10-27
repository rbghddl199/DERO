#!/bin/bash
# prettier-format.sh 자체 검사. 실행: .claude/hooks/prettier-format.test.sh
set -u

HOOK="$(cd "$(dirname "$0")" && pwd)/prettier-format.sh"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

pass=0
fail=0

q() { python3 -c "import json,sys;print(json.dumps({'tool_name':'Edit','tool_input':{'file_path':sys.argv[1]}}))" "$1"; }

t() { # t <라벨> <파일> <expected: formatted|untouched>
  local label="$1" file="$2" want="$3"
  local before after
  before=$(cat "$file")
  printf '%s' "$(q "$file")" | "$HOOK" >/dev/null 2>&1
  after=$(cat "$file")
  local got="untouched"
  [ "$before" != "$after" ] && got="formatted"
  if [ "$got" = "$want" ]; then
    pass=$((pass + 1)); printf 'ok   %s\n' "$label"
  else
    fail=$((fail + 1)); printf 'FAIL %s (want %s, got %s)\n' "$label" "$want" "$got"
  fi
}

# prettier가 있는 체크아웃을 흉내낸 트리
mkdir -p "$TMP/proj/node_modules/.bin" "$TMP/proj/src"
printf '{"printWidth":100,"singleQuote":true,"semi":true}\n' > "$TMP/proj/.prettierrc.json"
REAL=$(cd "$(dirname "$0")/../.." && pwd)/frontend/node_modules/.bin/prettier
if [ ! -x "$REAL" ]; then
  echo "skip: frontend/node_modules/.bin/prettier 없음 (pnpm install 먼저)"
  exit 0
fi
ln -s "$REAL" "$TMP/proj/node_modules/.bin/prettier"

# 위반 파일: 100자에 들어가는데 여러 줄로 접혀 있다 → 한 줄로 정규화돼야 한다
printf 'const x = foo(\n  bar,\n);\n' > "$TMP/proj/src/a.ts"
t "위반 ts는 포맷된다" "$TMP/proj/src/a.ts" formatted

# 이미 규칙에 맞는 파일은 건드리지 않는다
printf 'const y = 1;\n' > "$TMP/proj/src/b.ts"
t "정상 ts는 그대로" "$TMP/proj/src/b.ts" untouched

# 생성물 선언 파일은 제외
printf 'declare const z: (\n  string\n);\n' > "$TMP/proj/src/gen.d.ts"
t "*.d.ts 제외" "$TMP/proj/src/gen.d.ts" untouched

# 대상 확장자 아님
printf 'a  =  1\n' > "$TMP/proj/src/x.py"
t "대상 외 확장자 제외" "$TMP/proj/src/x.py" untouched

# prettier 없는 트리 → 아무 일도 없어야 한다
mkdir -p "$TMP/bare"
printf 'const x = foo(\n  bar,\n);\n' > "$TMP/bare/c.ts"
t "prettier 없으면 통과" "$TMP/bare/c.ts" untouched

# 깨진 입력·없는 파일은 조용히 통과 (종료코드만 확인)
printf 'not json' | "$HOOK" >/dev/null 2>&1
[ $? -eq 0 ] && { pass=$((pass + 1)); echo "ok   깨진 JSON도 exit 0"; } || { fail=$((fail + 1)); echo "FAIL 깨진 JSON"; }
printf '%s' "$(q "$TMP/없는파일.ts")" | "$HOOK" >/dev/null 2>&1
[ $? -eq 0 ] && { pass=$((pass + 1)); echo "ok   없는 파일도 exit 0"; } || { fail=$((fail + 1)); echo "FAIL 없는 파일"; }

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
