#!/bin/bash
# 편집된 프론트 파일을 Prettier로 정규화한다. 2026-08-11 박동규 지시.
#
# 목적: 포맷을 기계에 되돌린다. 훅이 없던 동안 포맷 정리가 모델 몫이 되어,
#       "같은 코드 줄바꿈만 바꾸는 편집"에 토큰을 태우고 diff에 노이즈를 남겼다.
#       실측(2026-08-11): frontend/src 중 Prettier 위반 36개 파일 —
#       리뷰가 그 파일을 스칠 때마다 같은 소모가 반복된다.
#
# 판정 권한은 리포의 .prettierrc.json(printWidth 100 등)에 있다. 이 훅은 실행만 한다.
#
# 대상: 파일 경로 상위에 node_modules/.bin/prettier 가 있는 ts/tsx/js/jsx/mjs/cjs/css/scss.
#       상위 탐색이므로 워크트리(.claude/worktrees/*)에서도 그 체크아웃의 prettier를 쓴다.
# 제외: *.d.ts — 이 리포에서 선언 파일은 생성물(openapi-typescript)이고,
#       포맷하면 재생성 때마다 diff가 튄다.
#
# 실패는 전부 통과(exit 0)로 흘린다. 포맷은 편집을 막을 사유가 아니다.

set -u

command -v python3 >/dev/null 2>&1 || exit 0

input=$(cat)

file=$(printf '%s' "$input" | python3 -c '
import json, sys
try:
    print(json.load(sys.stdin).get("tool_input", {}).get("file_path", ""))
except Exception:
    print("")
' 2>/dev/null)

[ -n "$file" ] || exit 0
[ -f "$file" ] || exit 0

case "$file" in
  *.d.ts) exit 0 ;;
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.css|*.scss) ;;
  *) exit 0 ;;
esac

# 파일이 있는 곳에서 위로 올라가며 그 체크아웃의 prettier를 찾는다.
dir=$(cd "$(dirname "$file")" 2>/dev/null && pwd) || exit 0
bin=""
while [ -n "$dir" ] && [ "$dir" != "/" ]; do
  if [ -x "$dir/node_modules/.bin/prettier" ]; then
    bin="$dir/node_modules/.bin/prettier"
    break
  fi
  dir=$(dirname "$dir")
done
[ -n "$bin" ] || exit 0

"$bin" --write --log-level warn "$file" >/dev/null 2>&1

exit 0
