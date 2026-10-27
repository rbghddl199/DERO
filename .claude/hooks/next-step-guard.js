#!/usr/bin/env node
// next-step-guard.js — Stop hook.
// Blocks turn end when the turn's assistant text lacks the mandatory
// "다음 스텝" closing block: ① next Matt Pocock skill command (or an explicit
// "스킬 불필요") ② session verdict (continue / new session / clear / compact)
// ③ context status vs the smart zone (150k tokens).
// Rationale: memory-based reminders failed twice (2026-08-13/14 feedback);
// HARNESS-RULES §6 ladder — repeated omission incident → hook.
//
// Measured traps this version encodes (2026-08-14 first-fire false positive):
// - The final assistant message may not be flushed to the transcript when the
//   Stop hook runs → on a miss, wait 500ms and re-read once before blocking.
// - A turn's text can span multiple transcript entries, and mid-turn status
//   lines are separate entries → aggregate ALL assistant text back to the last
//   real user message (tool_result "user" entries are mid-turn, not a boundary).
// Loop safety: exits silently when stop_hook_active is set. Fail-open on errors.
// Block reason is Korean (user-facing). Debug: last stdin is dumped to
// $TMPDIR/next-step-guard-last-input.json (schema discovery, e.g. whether the
// harness provides last_assistant_message directly).

const fs = require('fs');
const os = require('os');
const path = require('path');

const SMART_ZONE = 150000;
const MARKER_HEADING = /다음\s*스텝|다음\s*단계|next\s*steps/i;
const MARKER_SMARTZONE = /스마트존|smart\s*zone/i;

function contextTokens(usage) {
  if (!usage) return null;
  return (
    (usage.input_tokens || 0) +
    (usage.cache_read_input_tokens || 0) +
    (usage.cache_creation_input_tokens || 0)
  );
}

// Aggregate assistant text of the current turn: walk backward, collect text
// from assistant entries, stop at the first REAL user message (a "user" entry
// whose content is not tool_result blocks). Returns { text, usage } — usage is
// the newest one seen.
function turnAssistantText(transcriptPath) {
  const lines = fs.readFileSync(transcriptPath, 'utf8').trim().split('\n');
  const texts = [];
  let usage = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    let entry;
    try {
      entry = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    const msg = entry && entry.message;
    if (entry.type === 'assistant' && msg && Array.isArray(msg.content)) {
      const t = msg.content
        .filter((c) => c && c.type === 'text' && typeof c.text === 'string')
        .map((c) => c.text)
        .join('\n');
      if (t.trim()) texts.push(t);
      if (!usage && msg.usage) usage = msg.usage;
    } else if (entry.type === 'user' && msg) {
      const c = msg.content;
      const isToolResult =
        Array.isArray(c) && c.length > 0 && c.every((b) => b && b.type === 'tool_result');
      if (!isToolResult) break; // real user message — turn boundary
    }
    // attachment / system / meta entries: skip
  }
  return { text: texts.join('\n'), usage };
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

let raw = '';
process.stdin.on('data', (d) => (raw += d));
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0); // fail-open: never trap the session on our own parse error
  }
  try {
    fs.writeFileSync(path.join(os.tmpdir(), 'next-step-guard-last-input.json'), raw);
  } catch {}
  if (input.stop_hook_active) process.exit(0); // already continued once — do not loop

  // Prefer a direct field if the harness provides one (schema varies by version).
  if (typeof input.last_assistant_message === 'string' && input.last_assistant_message.trim()) {
    const t = input.last_assistant_message;
    if (MARKER_HEADING.test(t) && MARKER_SMARTZONE.test(t)) process.exit(0);
  }

  const tp = input.transcript_path;
  if (!tp || !fs.existsSync(tp)) process.exit(0);

  let last;
  try {
    last = turnAssistantText(tp);
    if (!(MARKER_HEADING.test(last.text) && MARKER_SMARTZONE.test(last.text))) {
      // The final message may not be flushed yet — one retry after 500ms.
      sleepMs(500);
      last = turnAssistantText(tp);
    }
  } catch {
    process.exit(0);
  }
  if (!last.text.trim()) process.exit(0); // tool-only / interrupted turn

  if (MARKER_HEADING.test(last.text) && MARKER_SMARTZONE.test(last.text)) process.exit(0);

  const n = contextTokens(last.usage);
  const measured =
    n === null
      ? ''
      : ` 실측 컨텍스트 ≈ ${Math.round(n / 1000)}k tokens (스마트존 150k ${n > SMART_ZONE ? '초과' : '이내'}).`;
  console.log(
    JSON.stringify({
      decision: 'block',
      reason:
        `[next-step-guard] 턴 마무리 필수 블록 누락.${measured} 응답 끝에 '## 다음 스텝' 섹션을 추가한 뒤 종료하라: ` +
        `① 다음 Matt Pocock 스킬 호출 명령을 코드 블록으로 (해당 없으면 '스킬 불필요'라고 명시) ` +
        `② 세션 판정 — 계속/새 세션/clear/compact 중 하나 + 근거 1줄 ` +
        `③ 컨텍스트 상태 — 실측 토큰과 스마트존(150k) 이내/초과 여부.`,
    })
  );
  process.exit(0);
});
