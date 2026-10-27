#!/usr/bin/env node
// Regression tests for next-step-guard.js (Stop) and context-status.js (UserPromptSubmit).
// Run: node .claude/hooks/next-step-guard.test.js

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOOKS = path.dirname(__filename);
const GUARD = path.join(HOOKS, 'next-step-guard.js');
const STATUS = path.join(HOOKS, 'context-status.js');

let pass = 0;
let fail = 0;

function run(script, stdinObj) {
  return execFileSync('node', [script], { input: JSON.stringify(stdinObj), encoding: 'utf8' });
}

function transcript(entries) {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nsg-')), 't.jsonl');
  fs.writeFileSync(f, entries.map((e) => JSON.stringify(e)).join('\n'));
  return f;
}

function assistant(text, usage) {
  return {
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'text', text }], usage },
  };
}

function check(name, cond) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.error(`FAIL: ${name}`);
  }
}

const USAGE = { input_tokens: 1000, cache_read_input_tokens: 200000, cache_creation_input_tokens: 5000 };

// 1. Missing block → decision: block, with measured tokens in reason
{
  const tp = transcript([assistant('그냥 답변만 하고 끝.', USAGE)]);
  const out = run(GUARD, { transcript_path: tp });
  const j = JSON.parse(out);
  check('blocks when 다음 스텝 block missing', j.decision === 'block');
  check('reason carries measured tokens', /206k/.test(j.reason));
  check('reason says smart zone exceeded', /초과/.test(j.reason));
}

// 2. Block present → silent pass
{
  const tp = transcript([assistant('## 다음 스텝\n```\n/mattpocock-skills:to-spec\n```\n세션 판정: 새 세션. 컨텍스트 ~206k, 스마트존 초과.', USAGE)]);
  const out = run(GUARD, { transcript_path: tp });
  check('passes when block present', out.trim() === '');
}

// 3. stop_hook_active → silent pass (no loop)
{
  const tp = transcript([assistant('블록 없음.', USAGE)]);
  const out = run(GUARD, { transcript_path: tp, stop_hook_active: true });
  check('no re-block when stop_hook_active', out.trim() === '');
}

// 4. Missing transcript → silent pass
{
  const out = run(GUARD, { transcript_path: '/nonexistent/t.jsonl' });
  check('fail-open on missing transcript', out.trim() === '');
}

// 5. Tool-only turn (no assistant text) → silent pass
{
  const tp = transcript([{ type: 'user', message: { role: 'user', content: 'hi' } }]);
  const out = run(GUARD, { transcript_path: tp });
  check('passes on tool-only/empty turn', out.trim() === '');
}

// 6. Aggregates the whole turn: split final message + mid-turn status entries
{
  const toolResult = {
    type: 'user',
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x', content: 'ok' }] },
  };
  const tp = transcript([
    { type: 'user', message: { role: 'user', content: '진행해줘' } },
    assistant('중간 상태 텍스트 (마커 없음)', USAGE),
    toolResult,
    assistant('## 다음 스텝', USAGE),
    assistant('컨텍스트 ~200k, 스마트존 초과.', USAGE),
  ]);
  const out = run(GUARD, { transcript_path: tp });
  check('aggregates split entries across the turn', out.trim() === '');
}

// 6b. Real user message is a hard boundary — earlier turn's block does not leak in
{
  const tp = transcript([
    assistant('## 다음 스텝 스마트존 이내 (이전 턴)', USAGE),
    { type: 'user', message: { role: 'user', content: '다음 질문' } },
    assistant('마커 없는 이번 턴 답변', USAGE),
  ]);
  const out = run(GUARD, { transcript_path: tp });
  check('previous turn does not satisfy current turn', JSON.parse(out).decision === 'block');
}

// 6c. Skips non-JSON lines
{
  const tp = transcript([assistant('마커 없음', USAGE)]);
  fs.appendFileSync(tp, '\nnot-json');
  const out = run(GUARD, { transcript_path: tp });
  check('tolerates non-JSON lines', JSON.parse(out).decision === 'block');
}

// 6d. last_assistant_message input field short-circuits when it carries the block
{
  const tp = transcript([assistant('마커 없음 (아직 flush 안 된 상황 가정)', USAGE)]);
  const out = run(GUARD, {
    transcript_path: tp,
    last_assistant_message: '## 다음 스텝\n스마트존 초과',
  });
  check('honors last_assistant_message field', out.trim() === '');
}

// 7. context-status emits measurement with EXCEEDED
{
  const tp = transcript([assistant('아무 텍스트', USAGE)]);
  const out = run(STATUS, { transcript_path: tp });
  check('status emits measured context', /206k/.test(out));
  check('status flags exceeded', /EXCEEDED/.test(out));
}

// 8. context-status OK under threshold
{
  const tp = transcript([assistant('아무 텍스트', { input_tokens: 40000 })]);
  const out = run(STATUS, { transcript_path: tp });
  check('status OK under smart zone', /smart zone\(150k\): OK/.test(out));
}

// 9. context-status silent without usage data
{
  const tp = transcript([{ type: 'user', message: { role: 'user', content: 'hi' } }]);
  const out = run(STATUS, { transcript_path: tp });
  check('status silent without assistant usage', out.trim() === '');
}

console.log(`pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
