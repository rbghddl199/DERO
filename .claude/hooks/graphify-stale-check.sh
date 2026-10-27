#!/bin/bash
# SessionStart 훅: graphify 지식 그래프가 소스보다 낡았으면 경고한다.
# 강제 아님 — 그래프를 쓰지 않는 것은 막지 못하지만, 낡은 그래프를 모르고 쓰는 것은 막는다.
# 근거: 2026-08-04 검토 — 구축(8/3) 이후 133개 소스/문서 파일이 변경됐는데 갱신 이력이 없었다.
# 갱신 방법: 코드만이면 `graphify update .` (LLM 불필요, 약 12초), 문서/이미지 포함이면 `/graphify . --update`.

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

graph=graphify-out/graph.json
[ -f "$graph" ] || exit 0

# 임계값: 이보다 많은 파일이 그래프보다 새로우면 경고 (자잘한 변경으로 매 세션 떠드는 것 방지)
threshold=20

stale=$(find backend frontend docs .claude/rules -type f \
  \( -name '*.ts' -o -name '*.tsx' -o -name '*.java' -o -name '*.md' \) \
  -newer "$graph" \
  -not -path '*/node_modules/*' -not -path '*/.next/*' \
  -not -path '*/build/*' -not -path '*/target/*' \
  2>/dev/null | wc -l | tr -d ' ')

if [ "${stale:-0}" -gt "$threshold" ]; then
  echo "[graphify] 지식 그래프가 낡았습니다 — 그래프 빌드 이후 변경된 소스/문서 파일 ${stale}개. 구조 질문에 쓰기 전에 \`graphify update .\` (코드만, LLM 불필요) 또는 \`/graphify . --update\` (문서 포함)로 갱신하세요."
fi

exit 0
