#!/bin/bash
# Stop 훅: ① backend/·frontend/ 변경 시 SPEC.md·폴더 노트 갱신 리마인드 ② CLAUDE.md↔AGENTS.md 동기화 검사.
# 강제 아님 — 갱신 불필요하면 그대로 종료 가능. 설계: docs/HARNESS-RULES.md §4
# 한계: git 작업 트리 기준이므로 "이번 세션" 변경이 아닌 기존 미커밋 변경도 잡힐 수 있다 (거짓 양성 허용).

input=$(cat)

# 무한 루프 방지: 이 훅이 이미 개입한 뒤의 재종료는 통과
case "$input" in
  *'"stop_hook_active":true'* | *'"stop_hook_active": true'*) exit 0 ;;
esac

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

reasons=""

# 검사 1: 코드 폴더 변경 vs 문서 갱신
changed=$(git status --porcelain 2>/dev/null | awk '{print $NF}')
if [ -n "$changed" ]; then
  code_changed=$(echo "$changed" | grep -E '^(backend|frontend)/' | grep -v 'CLAUDE\.md$')
  docs_changed=$(echo "$changed" | grep -E '^(docs/SPEC\.md|(backend|frontend)/(.*/)?CLAUDE\.md)$')
  if [ -n "$code_changed" ] && [ -z "$docs_changed" ]; then
    dirs=$(echo "$code_changed" | cut -d/ -f1 | sort -u | tr '\n' ' ' | sed 's/ *$//')
    reasons="코드 폴더($dirs)가 변경되었지만 docs/SPEC.md와 그 하위 CLAUDE.md는 하나도 갱신되지 않았습니다. 완료한 기능이 있으면 SPEC.md에 [x] 체크, 새로 발견한 함정이 있으면 원인 파일이 있는 폴더의 CLAUDE.md에 한 줄 추가하세요."
  fi
fi

# 검사 2: CLAUDE.md가 있는 모든 폴더(중첩 포함) — AGENTS.md 세트 존재 + '@CLAUDE.md' 한 줄 태그 검사
# 근거: HARNESS-RULES.md §3 (2026-07-18 복사본 → 태그 참조, 2026-07-23 중첩 CLAUDE.md 정상화 + 세트 필수)
missing=""
malformed=""
while IFS= read -r f; do
  d=${f%/CLAUDE.md}
  d=${d#./}
  if [ ! -f "$d/AGENTS.md" ]; then
    missing="$missing $d"
  else
    body=$(grep -v '^[[:space:]]*$' "$d/AGENTS.md")
    [ "$body" != "@CLAUDE.md" ] && malformed="$malformed $d"
  fi
done < <(find . \( -name node_modules -o -name .git -o -name build -o -name .gradle -o -name dist -o -name .next -o -name test-results \) -prune -o -name CLAUDE.md -print 2>/dev/null | sort)

if [ -n "$missing" ]; then
  [ -n "$reasons" ] && reasons="$reasons "
  reasons="${reasons}CLAUDE.md는 있는데 AGENTS.md가 없는 폴더:${missing}. 각 폴더에 '@CLAUDE.md' 한 줄 태그 파일을 세트로 만드세요."
fi
if [ -n "$malformed" ]; then
  [ -n "$reasons" ] && reasons="$reasons "
  reasons="${reasons}AGENTS.md 본문이 '@CLAUDE.md' 한 줄이 아닌 폴더:${malformed}. 내용 수정은 항상 CLAUDE.md에 하세요."
fi

# 검사 3: erd.md 동결 기준선 드리프트 (2026-07-23 추가, HARNESS-RULES §4)
# 차단형 PreToolUse 훅을 우회하거나 사람이 직접 고친 변경을 사후 적발한다.
if [ -x .claude/hooks/erd-freeze.sh ]; then
  if ! drift=$(.claude/hooks/erd-freeze.sh --verify 2>/dev/null); then
    [ -n "$reasons" ] && reasons="$reasons "
    reasons="${reasons}docs/context/erd.md이 동결 기준선과 다릅니다($drift). 박동규 승인을 받은 변경이면 erd.md '확정 후 개정' 표에 한 줄 남기고 .claude/hooks/erd-freeze.sh --rebaseline 을 실행하세요. 승인받지 않은 변경이면 되돌리세요."
  fi
fi

[ -z "$reasons" ] && exit 0

# JSON 한 줄 출력 보호: 경로에 섞일 수 있는 큰따옴표·역슬래시·개행 제거
reasons=$(printf '%s' "$reasons" | tr -d '"\\' | tr '\n' ' ')

printf '{"decision": "block", "reason": "[하네스 리마인드] %s 갱신할 것이 없으면 그대로 종료해도 됩니다."}\n' "$reasons"
exit 0
