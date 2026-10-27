#!/usr/bin/env node
// context-status.js — UserPromptSubmit hook.
// Injects the measured context size (from the last assistant message's usage)
// into every turn so the model's smart-zone announcements are measured facts,
// not guesses. Pairs with next-step-guard.js (Stop), which enforces that the
// announcement actually appears in the closing "다음 스텝" block.
// Never blocks; silent on any error (fail-open).

const fs = require('fs');

const SMART_ZONE = 150000;

let raw = '';
process.stdin.on('data', (d) => (raw += d));
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }
  const tp = input.transcript_path;
  if (!tp || !fs.existsSync(tp)) process.exit(0);

  let lines;
  try {
    lines = fs.readFileSync(tp, 'utf8').trim().split('\n');
  } catch {
    process.exit(0);
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    let entry;
    try {
      entry = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    const msg = entry && entry.message;
    if (entry.type === 'assistant' && msg && msg.usage) {
      const u = msg.usage;
      const n =
        (u.input_tokens || 0) +
        (u.cache_read_input_tokens || 0) +
        (u.cache_creation_input_tokens || 0);
      const state =
        n > SMART_ZONE
          ? 'EXCEEDED — recommend closing at the next phase boundary (new session; /compact only if disk artifacts are missing)'
          : 'OK';
      console.log(
        `[context-status] context ≈ ${Math.round(n / 1000)}k tokens, smart zone(150k): ${state}. ` +
          `End the turn with the '다음 스텝' block (next skill command / session verdict / this measurement) — enforced by next-step-guard.`
      );
      process.exit(0);
    }
  }
  process.exit(0);
});
