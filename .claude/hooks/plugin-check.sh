#!/bin/bash
# 공식 플러그인 미설치 리마인드. SessionStart 훅 (claude·codex 공용), $1 = claude|codex
# 미설치면 세션마다 컨텍스트로 알림을 주입한다. 차단하지 않는다 (advisory, exit 0).
# 공식 세트 변경은 아래 두 변수만 고친다. 설치 절차 정본: docs/HARNESS.md
set -u
CLI="${1:-claude}"

# CLI별 공식 세트 — "<플러그인>@<마켓플레이스>"
CLAUDE_REQUIRED="claude-mem@thedotmack serena@claude-plugins-official exa@claude-plugins-official firecrawl@claude-plugins-official ponytail@ponytail mattpocock-skills@mattpocock"
CODEX_REQUIRED="ponytail@ponytail mattpocock-skills@mattpocock"

missing=""
if [ "$CLI" = "codex" ]; then
  cfg="$HOME/.codex/config.toml"
  for pm in $CODEX_REQUIRED; do
    grep -q "^\[plugins\.\"$pm\"\]" "$cfg" 2>/dev/null || missing="$missing $pm"
  done
else
  for pm in $CLAUDE_REQUIRED; do
    p="${pm%@*}" m="${pm#*@}"
    [ -d "$HOME/.claude/plugins/cache/$m/$p" ] || missing="$missing $pm"
  done
fi

[ -z "$missing" ] && exit 0
echo "⚠ [하네스] 팀 공식 플러그인 미설치:$missing"
echo "  설치 절차: docs/HARNESS.md 플러그인 절(${CLI}). 설치 전까지 세션마다 이 알림이 뜹니다."
exit 0
