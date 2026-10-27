#!/bin/bash
# plugin-check.sh 회귀 테스트. 실행: .claude/hooks/plugin-check.test.sh
# 가짜 HOME을 만들어 설치 상태를 시뮬레이션한다.
ROOT=$(cd "$(dirname "$0")/../.." && pwd) || exit 1
HOOK="$ROOT/.claude/hooks/plugin-check.sh"
pass=0; fail=0

t() {
  local label="$1" cli="$2" expect="$3" out got
  out=$(HOME="$FAKE" "$HOOK" "$cli" 2>/dev/null)
  got="조용"; [ -n "$out" ] && got="알림"
  if [ "$got" = "$expect" ] ; then
    printf '  OK   %-30s %s\n' "$label" "$got"; pass=$((pass+1))
  else
    printf '  FAIL %-30s 기대=%s 실제=%s\n' "$label" "$expect" "$got"; fail=$((fail+1))
  fi
}

FAKE=$(mktemp -d) || exit 1

echo "── claude ──"
t "전부 미설치 → 알림" claude 알림
for pm in claude-mem@thedotmack serena@claude-plugins-official exa@claude-plugins-official \
          firecrawl@claude-plugins-official ponytail@ponytail mattpocock-skills@mattpocock; do
  mkdir -p "$FAKE/.claude/plugins/cache/${pm#*@}/${pm%@*}"
done
t "전부 설치 → 조용" claude 조용
rm -rf "$FAKE/.claude/plugins/cache/ponytail"
t "ponytail만 빠짐 → 알림" claude 알림

echo "── codex ──"
t "config 없음 → 알림" codex 알림
mkdir -p "$FAKE/.codex"
printf '[plugins."ponytail@ponytail"]\nenabled = true\n[plugins."mattpocock-skills@mattpocock"]\nenabled = true\n' \
  > "$FAKE/.codex/config.toml"
t "2종 설치 → 조용" codex 조용
printf '[plugins."ponytail@ponytail"]\nenabled = true\n' > "$FAKE/.codex/config.toml"
t "mattpocock 빠짐 → 알림" codex 알림

# 알림이 빠진 플러그인 이름을 실제로 담는지
out=$(HOME="$FAKE" "$HOOK" codex)
if printf '%s' "$out" | grep -q 'mattpocock-skills@mattpocock'; then
  printf '  OK   %-30s\n' "알림에 누락 이름 포함"; pass=$((pass+1))
else
  printf '  FAIL %-30s (%s)\n' "알림에 누락 이름 포함" "$out"; fail=$((fail+1))
fi

rm -rf "$FAKE"
echo
echo "합계: pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
