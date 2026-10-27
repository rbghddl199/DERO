---
name: promptsmith
description: "One-shot prompt authoring — make an LLM write, fix, or templatize a prompt. Every prompt it produces carries a measurable outcome rubric, while leaving the method of reaching that outcome unconstrained. Triggers: 프롬프트 써줘, 프롬프트 만들어줘, 이 프롬프트 개선해줘/비평해줘, 프롬프트 템플릿화, 루브릭 만들어줘, meta-prompt, write a prompt. Does not enter the loop system (one-shot execution — no DoD, no judge, no schedule)."
---

# promptsmith — one-shot prompt authoring driven by outcome rubrics

Takes a task description, an existing prompt, or a one-line idea and **authors a ready-to-use prompt**.
A one-shot executor for metaprompting Mode 1 (= having an LLM write a prompt). It does not enter a loop —
no DoD, no judge, no schedule, no state file; input → prompt, produced **exactly once**.

**Output language: Korean** for your own messages; the authored prompt follows the language of the task
(Korean by default here).

## The single most important rule of this skill

**Constrain the outcome. Leave the method free.**

Every prompt it produces **must** carry a `# Success Criteria` rubric block — an observable, measurable
definition of done. At the same time it **does not specify the procedure, technique or way of thinking**
used to get there.

> Basis (Anthropic official): *"Prefer general instructions over prescriptive steps. A prompt like
> 'think thoroughly' often produces better reasoning than a hand-written step-by-step plan.
> Claude's reasoning frequently exceeds what a human would prescribe."*
> — a vendor recommendation, **not a measured comparison**. Evidence grades in `references/rubric-design.md`.

### Conditional exception to method freedom — procedure only in four cases

The same Anthropic document states the opposite condition too: *"Provide instructions as sequential steps …
when the order or completeness of steps matters."* Include `# Steps` only when one of the following holds,
and **omit it otherwise.**

1. **Order is part of correctness** (safety protocols, migrations, rollback procedures)
2. **An omission is itself a wrong answer** (regulatory checklists, exhaustive audit items)
3. **An external system contract forces the order** (API sequencing, transaction boundaries)
4. The user **explicitly asked for a procedure**

Even with steps, each step states *the outcome to achieve* and never specifies **which technique** to use.

## Reference files

- `references/examples.md` — four worked examples: Generate (without and with steps), Critique, Expand. **Read before authoring.**
- `references/rubric-design.md` — primary sources for the rules above and their evidence grades ([문서]/[권고]/[조립]/[기각]).

## Router — decide the mode first (default = Generate)

| Shape of the request | Mode |
|---|---|
| "write/make me a prompt for this task" (task description only) | **Generate** |
| "improve/critique this prompt" (an existing prompt is pasted in) | **Critique** |
| "turn this one line into a reusable template" (short idea → reusable) | **Expand** |

When unclear, Generate. But if an existing prompt is pasted in, Critique wins.

### 1. Generate — task description → detailed prompt

The produced prompt must include all of:

- **Role** (who is answering) and **context** (audience, platform, level, constraints)
- **The `# Success Criteria` rubric** — mandatory. How to write it: "Rubric authoring rules" below.
- **A self-verification instruction** — placed after the rubric:
  `"작업을 끝내기 전에 위 Success Criteria 각 항목에 대해 근거를 먼저 쓰고 그 다음 판정을 적어라."`
  (Self-correction with no external standard **degrades** performance — Huang et al. ICLR 2024, GPT-4 GSM8K
  95.5% → 91.5% → 89.0%. So self-verification must **target the stated rubric**.)
- **Constraints that block common failures** (prohibitions at the outcome level; never ban techniques)
- **`# Examples` — included by default.** Not "if you can". Put in 1–3 demonstrations of good output.
  Measured basis: demonstration optimization beats instruction optimization on 6 of 7 tasks (MIPROv2, EMNLP 2024 —
  Iris 94.1 vs 36.4, Heart Disease 79.2 vs 25.8). Omit only when demonstrations cannot be produced.
- **`# Output Format`** — but **never** write thought-suppressing instructions like "answer only, no explanation".
  Measured basis: such instructions degrade non-reasoning model performance (Wharton arXiv 2506.07142, GPQA
  Diamond, 4,950 runs). Specify the format without blocking the model's path to the answer.
- Wrap long variables (documents, code, data) in **XML tags**, and write substitution variables as **`{{VARIABLE}}`**.
  Place a variable holding a long value **before the instructions that operate on it**.

**Division of labor between rubric and examples** — they are not competitors. What can be shown by
demonstration belongs to `# Examples`; **the rubric takes what a handful of examples cannot express**:
conditional rules, thresholds, exhaustive coverage, rare edge cases. The one task MIPROv2 lost to
demonstrations was exactly a conditional-rule task (instructions 14.6 vs demos 10.4). That is where a rubric
earns its keep — listing criteria that examples could have carried is waste.

### 2. Critique — existing prompt → weaknesses + fixes

- Point out ambiguity, missing role/context/output format, and expected failure modes.
- **Always run both rubric audits**:
  - **Deficiency**: no measurable outcome criteria, or unmeasurable words like "well / naturally / appropriately" — flag it and propose a replacement.
  - **Over-constraint**: a procedure is dictated without meeting any of the four exception conditions — flag it and propose **replacing it with outcome criteria**.
- Attach a **concrete fix** to every point raised.
- **No full rewrite unless asked** — points plus minimal fixes only.

### 3. Expand — one line → reusable template

- A `{{placeholder}}` reusable template plus a **short usage guide** (what goes into each placeholder).
- Templatize the rubric too — pull the per-task thresholds out as `{{THRESHOLD}}`, but
  **keep the criterion axes fixed** (so the user fills in values rather than deleting axes).

## Rubric authoring rules

Detailed rationale and citations live in `references/rubric-design.md`. Only what to obey while authoring is here.

1. **Multidimensional** — no single score. Split into 3–7 criteria. Anthropic: *"Most use cases need
   multidimensional evaluation along several success criteria."*
2. **Four properties** — every criterion is Specific, Measurable, Achievable, Relevant.
   ✗ "does sentiment classification well" → ✓ "F1 ≥ 0.85 on 10,000 held-out items"
   ✗ "safe output" → ✓ "harmful judgments under 0.1% across 10,000 runs"
3. **Observable in the output** — only criteria judgeable from the artifact alone. Criteria that grade the
   model's internal thinking or approach constrain method and are banned.
4. **State the judgment form** — pick one of three per criterion:
   - `binary` (yes/no) — the default. **Decomposing** a single Likert item into a binary checklist raises
     inter-rater agreement (CheckEval, EMNLP 2025: Krippendorff α +0.45). But that is **inter-rater
     reliability**, not agreement with humans (validity) — by Fleiss κ it is +0.23, and the human-correlation
     gain is far smaller (ρ 0.40 → 0.46). Do not overclaim.
   - `1-5 ordinal` — when degree matters. Anchor **only the endpoints** (1: …, 5: …).
   - `numeric` — when there is a threshold (latency, ratio, score).
5. **Weights** — state them when importance differs. A weighted sum totalling 1.0.
   OpenAI `multigrader` shape: `0.5 * accuracy + 0.3 * tone + 0.2 * format`
6. **Rationale first, judgment second** — when asking for a score with a reason, **the reason always comes first**
   (a rule from the original Anthropic metaprompt).
7. **Grader ≠ generator** — when designing a separate judgment stage, write it to be graded by a different model.
8. **Check for hackability** — after producing a rubric, ask once: "is there a shortcut that satisfies this
   criterion without the underlying quality?" If yes, tighten it. (OpenAI names this `grader hacking`.)

## Pre-output self-verification gate (applies to promptsmith itself)

Pass this immediately before output. Fix anything that fails, then ship.

- [ ] Is there a `# Success Criteria` block?
- [ ] At least 3 criteria, each judgeable from the artifact alone?
- [ ] No unmeasurable words ("well / appropriately / naturally / sufficiently") left in the criteria?
- [ ] Does every criterion carry a judgment form (binary / 1-5 / numeric)?
- [ ] Is `# Examples` present (and if not, can you state why demonstrations cannot be produced)?
- [ ] Are any rubric criteria **replaceable by a few examples**? If so, move them to the examples.
- [ ] No thought-suppressing instructions ("answer only", "no elaboration")?
- [ ] If `# Steps` is present, can you name in one line which of the four exception conditions applies?
- [ ] No sentences dictating technique or thinking style ("brainstorm first", "solve with CoT")?
- [ ] Does the self-verification instruction explicitly target the rubric?

## Output rules

1. **Print the finished prompt in the chat**, verbatim.
2. Also **save it to `~/.claude/prompts/<slug>.md`** (create the folder if absent). Derive the slug from the
   task (e.g. "회의록 요약" → `meeting-summary`). **If the name already exists, do not overwrite** — read the
   existing file, show it, and ask the user whether to overwrite or use a new slug.
3. Append **2–3 lines of design decisions** after the prompt: why these criterion axes, why steps were
   included or left out. No black boxes.
4. State that the result is a **first draft** — recommend testing it against real input before finalizing.

## Non-entry guarantee

This skill is **purely input → prompt**. It never does any of the following:

- No DoD, no judge subagent, no schedule, no loop state file.
- Never calls `loop-compile`, `loop-run` or `loop-judge`.
- If iterative optimization, automatic grading or held-out evaluation is needed, stop here and **only point at**
  the loop system (`loop-compile` → `loop-run` → `loop-judge`).
