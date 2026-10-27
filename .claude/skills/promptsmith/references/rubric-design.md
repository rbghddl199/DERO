# Rubric authoring evidence — primary-source cross-check

Separates where each rule in `SKILL.md` came from, and **where proof ends and recommendation begins**.
Checked against live documents as of 2026-07-23. Vendor prompting docs are rewritten often — re-verify citations.

## Evidence grade tags

- **[문서]** — the wording exists in a primary source. Quotable.
- **[권고]** — the vendor recommends it but there is **no measurement**. Never restate as "proven".
- **[조립]** — the individual pieces have sources but the combination is an engineering judgment. No document says the whole thing.
- **[기각]** — a claim that died in verification. Do not let it back in from memory.

---

## 1. Constrain the outcome / free the method

**[권고]** Anthropic prompting best-practices, "Thinking and reasoning" section:

> "Prefer general instructions over prescriptive steps. A prompt like 'think thoroughly' often
> produces better reasoning than a hand-written step-by-step plan. Claude's reasoning frequently
> exceeds what a human would prescribe."

> "Ask Claude to self-check. Append something like 'Before you finish, verify your answer against
> [test criteria].' This catches errors reliably, especially for coding and math."

Three limits, to be remembered alongside it:
- Anthropic **never uses the word rubric** here — their term is `[test criteria]`.
- "catches errors reliably" has **no measurement**.
- This item sits **inside the extended thinking section**. The document does not say whether it holds
  with thinking off — and the same document treats manual CoT as the fallback when thinking is off. **Unresolved.**

**[문서] The opposite condition** — same document:

> "Provide instructions as sequential steps using numbered lists or bullet points when the order
> or completeness of steps matters."

**[문서] Vendor self-contradiction** — the Anthropic Console prompt improver injects procedure itself.
Straight from its documented improvement example: *"Follow these steps: 1. List the key concepts … 4. Select the most
appropriate article title"*. Stage 3 of its four-stage pipeline (example identification → XML draft →
chain-of-thought refinement → example enhancement) makes this **by design**.
But the document only says the effect will *"typically improve its performance"*, with no numbers, and it states
the cost: *"The prompt improver creates templates that produce longer, more thorough, but slower responses."*

→ **Conclusion**: "outcome criteria beat procedural instructions" has **never been measured.** Method freedom is
the default but must be conditional. The four exception conditions in SKILL.md came out of this cross-check.

**[문서] The self-correction trap** — Huang et al., *"LLMs Cannot Self-Correct Reasoning Yet"*,
ICLR 2024 (arXiv 2310.01798): under intrinsic self-correction with no external signal, GPT-4 on GSM8K
**dropped** 95.5% → 91.5% → 89.0%. GPT-3.5 fixed 7.6% of wrong answers while breaking 8.8% of correct ones.
The paper **scopes itself to the case with no external standard** → it does not refute the Anthropic pattern
(supplying explicit test criteria); it **adds a condition**. Hence SKILL.md forces self-verification to target
the rubric explicitly.

## 2. The shape of success criteria

**[문서]** Anthropic `test-and-evaluate/define-success`. It lists the four properties of good criteria in bold,
in the order **Specific, Measurable, Achievable, Relevant**. The document **does not use the acronym SMART and has
no Time-bound property** — calling it SMART is misattribution.

The original Bad/Good pairs:
- ✗ "The model should classify sentiments well"
  ✓ F1 ≥ 0.85 · 99.5% non-toxic · 90% of errors merely inconvenient · 95% under 200 ms · 10,000 held-out items
- ✗ "Safe outputs"
  ✓ "Less than 0.1% of outputs out of 10,000 trials flagged for toxicity by our content filter."

Three cautions:
- The document's register is descriptive, not prescriptive ("Good success criteria are:"). Not a MUST.
- It does not demand quantitative only — *"well-defined qualitative scales … valuable if consistently applied
  along with quantitative measures"*.
- The **200 ms budget in that example is itself an indirect method constraint** (it forecloses long CoT). "Zero
  method constraint" is not actually achievable — the goal is **removing unnecessary constraint**, not purity.

**[문서] Multidimensional** — same page: *"Most use cases need multidimensional evaluation along several
success criteria."* The eight example axes: task fidelity, consistency, relevance and coherence, tone and style,
privacy preservation, context utilization, latency, price.
→ These are **eight example axes, not eight standard axes**. The sibling document `develop-tests` lists only a
shorter subset — it is not a closed taxonomy.

## 3. Judgment form — binary vs continuous

**[문서]** Anthropic presents three LLM judgment forms each with a use case: 1–5 Likert (tone/style),
binary yes/no (privacy/PHI), ordinal 1–5 (context utilization). Anchors describe **only the endpoints**
("1: Not at all {target_tone}" / "5: Perfectly {target_tone}"), and binary is *"Output only 'yes' or 'no'."*

**[문서] The opposite direction** — OpenAI Graders design tips:
> "Produce a smooth score, not a pass/fail stamp. A score that shifts gradually as answers improve
> helps the optimizer see which changes matter."

**[문서] The academic side** — CheckEval (Lee et al., arXiv 2403.18771v3, EMNLP 2025): converting a single
Likert item into a decomposed binary checklist raises Krippendorff α **between judge models** by an average of
**+0.45** (12 judge models × SummEval and Topical-Chat, mean of 12 cells 0.4517; the large-model group goes
0.05 → 0.67, approaching the human inter-rater κ ≈ 0.7).
**Format confound excluded** — Appendix C.3 binarized G-Eval's Likert output alone and α only reached
0.0929 → 0.106 (CheckEval: 0.4803). So the gain comes from **criterion decomposition**, not from the binary
output format.

**Three things not to overclaim**:
- This is **inter-rater reliability**, **not agreement with humans (validity)**.
- Measured with Fleiss κ, the same cells average only **+0.23**.
- The human-correlation gain is far smaller (Llama3.1-70B SummEval ρ 0.40 → 0.46, Mistral-Large 0.52 → 0.55).
  In some Qwen2.5 / Mistral-Small cells CheckEval **loses** to G-Eval. The reference human-human κ is itself only
  0.53 on relevance (n=3).

Autorubric says binary has *"the highest inter-rater reliability … but may lose signal for nuanced
assessments"*.

→ **Not a conflict — different purposes.** Binary when you need rater agreement, continuous when you need an
optimization signal. Why SKILL.md defaults to binary: the rubric of a one-shot authoring tool is mostly read and
judged by a human, and there is no optimization loop (that belongs to `loop-*`).
Note also that OpenAI's "optimizer" means an RFT/eval optimization loop, so carrying it over to prompt-authoring
rubrics is **one step of context extension** — use it knowingly.

## 4. Weighted decomposition

**[문서]** The OpenAI Graders API — a machine-readable schema for rubric decomposition.
Five grader types (`string_check`, `text_similarity`, `score_model`, `label_model`, `python`) plus
`multigrader`, which composes named sub-scores through the arithmetic expression `calculate_output`. Supports
`+ − × ÷ ^` and `min, max, abs, floor, ceil, exp, sqrt, log`.

> "A multigrader object combines the output of multiple graders to produce a single score."
> Example: `"calculate_output": "0.5 * text_similarity_score + 0.5 * string_check_score"`
> Motivation: *"useful when a correct answer depends on multiple things being true"*

Graders return 0–1 and `pass_threshold` is **optional** — i.e. binarization is opt-in post-processing on top of a
continuous score.

Caution: OpenAI **never uses the word rubric** for multigrader. "Rubric decomposition" is our framing laid over a
mechanism that does exist.

## 5. Judge failure modes

**[문서] grader hacking** — a dedicated section of OpenAI Graders:
> "Models being trained sometimes learn to exploit weaknesses in model graders, also known as
> 'grader hacking' or 'reward hacking.'"
The detection method offered is **comparing the model-grader eval against an expert human eval** (a hacked model
scores high on the former, low on the latter). The document says "can be detected by" and offers no alternative.
**Scope limit**: this section presumes a model **being trained** against the grader. Generalizing it to all
rubric grading of prompt output is analogy, not a documented fact.

**[문서] Grader ≠ generator** — Anthropic: *"Generally best practice to use a different model to
evaluate than the model used to generate the evaluated output"*, repeated across three examples.
**But this is an inline comment in example implementations**, not a document-level directive. Do not promote it.

**[기각]** That Anthropic documents this as *mitigating self-enhancement bias* — **rejected 0-3.**
The bias framing comes from the literature (arXiv 2412.05579, the LLMs-as-Judges survey; arXiv 2508.06709), not
from Anthropic's text.

**Uninvestigated**: position bias, verbosity bias, and pairwise vs pointwise all failed verification against every
source. Which biases actually bite in **pointwise** rubric grading is an open question.

## 6. Metaprompt structure (reference)

**[문서]** Anthropic claude-cookbooks `misc/metaprompt.ipynb` — the only Anthropic metaprompt whose source text is
public. A fixed three-block output schema:
`<Inputs>` (minimal, non-redundant variable names) → `<Instructions Structure>` (a plan for where each variable goes) →
`<Instructions>` (the final prompt template).

The two ordering rules, verbatim:
> "When instructing the AI to provide an output (e.g. a score) and a justification or reasoning
> for it, always ask for the justification before the score."
> "input variables expected to take on lengthy values should come BEFORE directions on what to
> do with them."

The first is **conditional** (it fires only when both a score and a rationale are requested). The general
principle name "reasoning first, conclusion second" comes from the OpenAI GPT-4.1 guide lineage, not this text.
The second is still alive in the current best-practices: *"Put longform data at the top … This improves
performance across all models"* (scoped there to 20k+ token inputs).

**[문서] Variable notation** — the Console generator/improver uses `{{double brackets}}`, recommends wrapping in
XML tags, and the improver **preserves existing variables verbatim**. The **cookbook metaprompt, by contrast, uses
single-brace `{$VARIABLE}`** — they are different artifacts. The Console improver's internal prompt text is
**not public**.

**[기각]** That the cookbook metaprompt *mandates* XML tag delimitation for variables — **rejected 0-3.**
`<Task>`, `<FAQ>`, `<thinking>` and `<scratchpad>` appear only inside generated examples; they are not a required schema.

## 7. Rejected list (to prevent re-entry)

| Claim | Vote |
|---|---|
| The metaprompt mandates XML delimitation of variables and output tag names | 0-3 |
| Anthropic states eval **quantity** > per-item grading **quality** | 0-3 |
| Anthropic documents grader separation as mitigating self-enhancement bias | 0-3 |
| Anthropic's judgment template is documented as "endpoint anchors + XML wrapping + numeric-only output" | 1-2 |
| Anthropic documents a draft→review→refine self-correction chain as the most common chaining pattern | 1-2 |
| The OpenAI Prompt Optimizer is a 5-agent pipeline of 3 checkers + 2 rewriters | 1-2 |

## 8. Academic cross-check (secondary sweep, arXiv only, 2026-07-23)

24 sources · 25 claims verified · 17 confirmed, 8 rejected. Restricted to peer-reviewed/arXiv so as not to overlap
with the vendor axis of the first pass.

### 8-1. **[문서]** Nobody has measured the core question — a negative result

**Zero** ablations isolate **outcome/rubric specification vs procedural specification** on the same model and task.
Verified against the full PDFs of the major papers:

| Paper | What was actually ablated |
|---|---|
| MIPROv2 (Opsahl-Ong et al., EMNLP 2024) | grounding components (dataset summary 0.29 / program 0.18 / tip 0.15), the proposer tips dictionary |
| PromptAgent (Wang et al., ICLR 2024) | search strategy only (MC 0.635 / Beam 0.697 / Greedy 0.698 / MCTS 0.754) |
| OPRO (Yang et al., ICLR 2024) | metaprompt ordering, score buckets, number of examples, instructions per step, temperature |

All of it is search algorithms and metaprompt hyperparameters. **No paper treats the style of the candidate
instruction as a variable.** The accurate state is not "there is no evidence" but **"it has never been measured"**.

### 8-2. **[문서]** Demonstrations beat instructions — except it flips on conditional rules

MIPROv2, EMNLP 2024 (pp. 9340–9366). Task model Llama-3-8B, proposer GPT-3.5, 5 repetitions,
Wilcoxon signed-rank p<.05. Bootstrap-RS (demos only) vs best instruction only, TEST:

| Task | Demos only | Instructions only |
|---|---|---|
| Iris | **94.1** | 36.4 |
| Heart Disease | **79.2** | 25.8 |
| HotPotQA | **45.8** | 39.3 |
| HoVer | **37.2** | 33.1 |
| Iris-Typo | **58.7** | 56.7 |
| ScoNe | 75.4 | **76.1** |
| **HotPotQA-Conditional** | 10.4 | **14.6** (both = 23.3) |

The authors' Lesson 3, verbatim: *"Instruction optimization is most important for tasks with conditional
rules that are (i) not immediately obvious to the LM and (ii) not expressible via a limited
number of few-shot examples."*

→ **This skill's division-of-labor rule came from here.** What can be shown by demonstration goes in `# Examples`;
the rubric takes conditional rules, thresholds and exhaustive coverage that examples cannot express.

**Limits**: the ScoNe/HoVer demos were bootstrapped with a GPT-4o **teacher model** → the "demos" arm contains
distillation from a stronger model. The authors themselves flag Heart Disease's 25.8 as a weak baseline —
*"a simple seed instruction that does not convey any classification criteria"*. The HotPotQA-Conditional baseline
**already states the rules**, so +8.6 is an optimization delta, not "criteria stated vs not stated".

### 8-3. **[문서]** Optimized prompts converge on criteria form, not procedural form (observation)

All six Best Proposed Instructions in MIPROv2 Appendix H — **no numbered steps, no "first X then Y".**
The HotPotQA-Conditional winner is a pure statement of acceptance criteria.
PromptAgent on NCBI disease NER: Human 0.521 F1 → APE 0.576 → PromptAgent 0.645, and what was added is negative
criteria and edge-case definitions (*"the term 'locus' should be recognized as a genomic location and
not a disease name"*) plus an output format specification.

**[조립] Warning**: this is an **observation of the distribution of optimizer outputs**, not an experimental
result. PromptAgent's baseline is a single ~12-word line, so the 0.521 → 0.645 delta confounds criteria content
with plain specificity and length.

### 8-4. **[문서]** One measured case where procedure wins

PromptAgent Table 1 (base gpt-3.5-turbo, temp 0.0): of 6 BBH tasks, **only on Object Counting** does hand-written
few-shot CoT beat it, 0.960 > PromptAgent 0.860. PromptAgent wins the other five (average 0.802 vs 0.707).
The authors' explanation (**[권고]**, unmeasured): *"strictly formatted solutions that can be readily induced by
the step-by-step CoT reasoning"*.
**Confounds**: the CoT here is few-shot while PromptAgent is a zero-shot single instruction — examples and
procedural scaffolding are mixed together with no separating ablation. Single run, no error bars, GPT-3.5 only.

→ It supports the "four exception conditions" design in SKILL.md **weakly**. Do not cite it as strong evidence.

### 8-5. **[문서]** Surface form swamps the construct

OPRO §5.2.3, pretrained PaLM 2-L, full GSM8K n=1,319:

| Instruction | Accuracy |
|---|---|
| "Let's think step by step." | 71.8 |
| "Let's solve the problem together." | 60.5 |
| "Let's work together to solve this problem step by step." | **49.4** |

Semantically a combination of the two, yet **22.4 points apart**. At n=1,319 the SE of the difference ≈ 1.9 pp →
about 11σ. Not noise.

→ **A single-phrasing comparison with no paraphrase control is uninterpretable.** No "outcome vs procedure" claim
can be attributed at the construct level without several paraphrases per condition. This is why the skill always
ships its output as a **"first draft, to be finalized after testing against real input"**.

### 8-6. **[문서]** Partial answer to Q4 — procedural scaffolding gives reasoning models little or negative benefit

Meincke, Mollick, Mollick & Shapiro, *"Prompting Science Report 2"*, arXiv 2506.07142 (2025),
Wharton. GPQA Diamond, 198 questions × 25 trials × 3 conditions = **4,950 runs per prompt per model**, temp 0,
paired bootstrap-permutation with 5,000 replicates.

Reasoning models (RD vs Direct):
- o3-mini +0.029 [0.003, 0.053] p=.024
- o4-mini +0.031 [0.010, 0.052] p=.003
- **Gemini Flash 2.5 −0.033 [−0.056, −0.010] p=.005**, 100%-consistency **−0.131**

Non-reasoning models, against the **natural default** (no suffix, no format constraint):
- Sonnet 3.5 −0.019 (p=.189, n.s.) · GPT-4o-mini +0.004 (n.s.)
- Against Direct, the same models give +0.117 / +0.044 — **the choice of baseline decides the answer**

Consistency trade-off: Gemini 2.0 Flash averages +0.135 yet is **−0.131** on 100%-correct. Gemini Pro 1.5 averages
+0.071 and is **−0.172** at 100%. So procedural scaffolding buys mean accuracy and **sells per-question reliability**.

The authors' conclusion (**[문서]**): *"the common practice of prompting a model to reply with only the answer
and nothing else is likely to harm the performance of non-reasoning models."*
→ the basis for SKILL.md banning "answer only, no explanation" instructions.
Mechanism (**[권고]**, qualitative observation only): *"the model would often perform CoT by default even without
explicitly prompting it to think step by step."*

**Limits**: not peer-reviewed (working paper). n=3 reasoning models, one benchmark, and a **generic trigger** rather
than a task-tailored procedural plan — the authors themselves make the unmeasured claim that *"highly customized CoT
prompts... may yield larger benefits"*. The checkpoints are Jan–May 2025 builds, already a generation old. The
adverse result is 1 of 3.

### 8-7. **[기각 위험] The misattribution never to make** — PRM vs ORM

Lightman et al., *"Let's Verify Step by Step"* (arXiv 2305.20050, ICLR 2024):
on MATH500 best-of-1860, **PRM 78.2 vs ORM 72.4 vs majority vote 69.6**. §4 even has a clean controlled ablation
(the same dataset labeled three ways, *"The choice of supervision is the only difference"*).

**Do not carry this over as "process supervision beats outcome supervision → therefore procedure is better in
prompts."** That work is about **training a reward model** with 800K step-level human labels, and the generator's
prompt is fixed. The authors explicitly decline to generalize: *"It is unknown how broadly these results will generalize
beyond the domain of math."* Follow-up work (arXiv 2504.16828, 2502.11250) also keeps it a verifier finding.
**Nobody in the literature makes this leap.**

### 8-8. Rejected in this sweep (do not let back in)

| Claim | Vote |
|---|---|
| Self-Discover: model-authored reasoning structures beat human-written procedural plans (Plan-and-Solve) (BBH 81 vs 73) | 0-3 |
| Self-Discover beats OPRO on 3 of 4 tasks | 0-3 |
| GEPA's optimization mechanism is execution-trace-based diagnosis and rule extraction | 0-3 |
| OPRO-discovered prompts split cleanly into procedural vs criteria form by task | 0-3 |
| Multi-step procedures (multi-agent debate, Reflexion) get worse as compute increases | 0-3 |
| At matched compute, plain CoT self-consistency often beats elaborate multi-step procedures | 1-2 |

FLASK, Prometheus 1/2, HealthBench, Rubrics-as-Rewards, AutoRubric, EvoPrompt, TextGrad,
least-to-most and Plan-and-Solve ablations produced **zero claims that passed verification** — either not reached
or rejected. Do not use them as supporting evidence.

## 9. Still-open questions

1. **The cleanest experiment nobody has run**: does giving the generator the grading rubric improve output quality
   relative to a length-matched procedural prompt — controlled with several paraphrases per condition? **No paper
   in this corpus measures it.**
2. Does MIPROv2's "demos > instructions" hold on 2026 frontier and thinking models, or was it an artifact of
   Llama-3-8B plus a weak seed instruction plus a GPT-4o teacher?
3. Does the Wharton GPQA result reproduce on current reasoning models, on open-ended/agentic tasks, and with
   **task-tailored procedural plans** (rather than a generic trigger)?
4. The measured magnitude of verbosity, position and self-preference bias in **pointwise** rubric grading, and
   verified mitigations. CheckEval only shows inter-judge instability; zero bias-decomposition claims passed verification.
5. The saturation point for the **number** of rubric criteria. And whether CheckEval's α gain holds up under
   Fleiss κ and under **human agreement (validity)** — right now it is large only on inter-judge reliability metrics.

## 9. URL cautions

- `docs.anthropic.com` redirects to `platform.claude.com`.
- The `/prompt-generator` slug hosts generator + improver together → **the improver examples live at the
  generator URL.** The number-one misattribution trap.
- `platform.openai.com/docs/guides/graders` redirects to `developers.openai.com`.
- The cookbook metaprompt ≠ the Console generator. Even the notation differs (`{$VAR}` vs `{{VAR}}`).

## Sources

- https://platform.claude.com/docs/en/docs/build-with-claude/prompt-engineering/claude-prompting-best-practices
- https://platform.claude.com/docs/en/docs/build-with-claude/prompt-engineering/prompt-generator
- https://platform.claude.com/docs/en/docs/test-and-evaluate/define-success
- https://platform.claude.com/docs/en/docs/test-and-evaluate/develop-tests
- https://github.com/anthropics/claude-cookbooks/blob/main/misc/metaprompt.ipynb
- https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
- https://developers.openai.com/api/docs/guides/graders
- https://developers.openai.com/cookbook/examples/optimize_prompts
- https://arxiv.org/abs/2310.01798 (Huang et al., *LLMs Cannot Self-Correct Reasoning Yet*, ICLR 2024)
- https://arxiv.org/abs/2403.18771 (Lee et al., *CheckEval*, EMNLP 2025)
- https://arxiv.org/abs/2406.11695 (Opsahl-Ong et al., *Optimizing Instructions and Demonstrations for Multi-Stage LM Programs*, EMNLP 2024)
- https://arxiv.org/abs/2310.16427 (Wang et al., *PromptAgent*, ICLR 2024)
- https://arxiv.org/pdf/2309.03409 (Yang et al., *Large Language Models as Optimizers* / OPRO, ICLR 2024)
- https://arxiv.org/abs/2305.20050 (Lightman et al., *Let's Verify Step by Step*, ICLR 2024)
- https://arxiv.org/abs/2506.07142 (Meincke et al., *Prompting Science Report 2*, Wharton 2025 — not peer-reviewed)
