# Worked examples

One input → output pair for each of the three modes. **Copy the shape, not the content** — rubric axes are
derived fresh for every task.

---

## Example A — Generate (no steps is the right answer)

**Input**: "고객 문의 이메일에 답장 초안 써주는 프롬프트 만들어줘. 우리는 B2B SaaS야."

**Produced prompt**:

````markdown
당신은 B2B SaaS 기업의 시니어 고객성공 매니저다. 계정 담당자로서 고객 문의에 답장한다.

<customer_email>
{{CUSTOMER_EMAIL}}
</customer_email>

<account_context>
{{ACCOUNT_CONTEXT}}
</account_context>

위 문의에 대한 답장 초안을 작성하라.

# Success Criteria

작성한 답장은 아래를 모두 만족해야 한다. 방법은 자유다.

| # | 기준 | 판정 | 가중치 |
|---|---|---|---|
| 1 | 고객이 물은 질문 전부에 답이 있다 (질문 n개 → 답 n개) | binary | 0.30 |
| 2 | 답장에 담긴 사실이 `<account_context>`에서 확인 가능하다. 확인 불가한 내용은 단정하지 않고 "확인 후 회신"으로 처리했다 | binary | 0.30 |
| 3 | 고객이 다음에 할 행동이 하나로 명확하다 (다음 단계가 0개거나 2개 이상이면 실패) | binary | 0.15 |
| 4 | 사과·공감 표현이 실제 귀책이 있을 때만 등장한다 | binary | 0.10 |
| 5 | 본문 길이 900자 이내 | numeric | 0.05 |
| 6 | 톤: 격식과 친근함의 균형 (1: 사무적/차가움, 5: 과하게 캐주얼, 3이 목표) | 1-5 ordinal | 0.10 |

# 자기검증

답장을 끝내기 전에, 위 Success Criteria 각 항목에 대해 **근거를 먼저 쓰고 그 다음 판정**을 적어라.
실패한 항목이 있으면 답장을 고친 뒤 다시 판정하라.

# Examples

<good_reply>
{{EXAMPLE_GOOD_REPLY}}
</good_reply>

(실제 사내 답장 1~3건을 넣어라. 톤·길이·마무리 방식은 기준 6번 문장 열 줄보다
좋은 답장 한 통이 더 잘 전달한다.)

# Output Format

```
## 답장 초안
(본문)

## 판정
1. 근거: … → 통과/실패
...
```
````

**Design decisions**: writing a reply is not a task where order is part of correctness, so no `# Steps` — an
instruction like "first classify the inquiry, then pick a tone…" only narrows the solution space. Criterion 2 is
this prompt's core safety device (blocks hallucination). Criterion 3 pins its failure condition to "zero or two
or more", removing the unmeasurable word "clear".

**Division-of-labor check**: criterion 6 (tone) is a weak axis — examples do that job better. Once real reply
samples exist, 6 can be dropped. Criteria 1, 2 and 3, by contrast, are conditional rules that a few examples
cannot convey, so they stay in the rubric. That is where a rubric earns its keep.

---

## Example B — Generate (steps are justified)

**Input**: "프로덕션 DB 마이그레이션 실행 프롬프트."

Here `# Steps` **is included** — exception 1 (order is part of correctness) plus 2 (an omission is a wrong
answer) apply. But each step states only *the outcome to achieve*, never the technique.

````markdown
# Steps

순서를 지켜라. 각 단계는 이전 단계의 결과가 확인된 뒤에만 시작한다.

1. 되돌릴 수 있는 상태가 존재한다 — 복원 가능성이 실제로 검증된 백업.
2. 스키마 변경이 기존 읽기 경로를 깨지 않는다는 근거가 있다.
3. 변경이 적용되었고, 적용 후 상태가 의도한 스키마와 일치한다.
4. 롤백 절차가 문서화되어 있고 지금 실행 가능하다.

(각 단계를 **어떤 도구·명령으로** 달성할지는 지정하지 않는다 — 환경에 맞게 선택하라.)

# Success Criteria

| # | 기준 | 판정 |
|---|---|---|
| 1 | 마이그레이션 전 백업이 존재하고 복원 테스트가 통과했다 | binary |
| 2 | 적용 후 스키마가 목표 정의와 정확히 일치한다 (diff 0건) | binary |
| 3 | 기존 쿼리 회귀 테스트 전부 통과 | binary |
| 4 | 롤백 절차가 문서화되었고 실행 가능함이 확인됐다 | binary |
| 5 | 다운타임 30초 이내 | numeric |
````

**Design decisions**: the order is dictated, but every step body is written as "what must be true" — not "run
pg_dump" but "a backup whose restorability has been verified exists". Weights are omitted because every safety
item is pass-required, which makes a weighted sum meaningless.

---

## Example C — Critique (catching over-constraint)

**Input prompt**:
> "너는 전문 카피라이터야. 먼저 타겟 오디언스를 브레인스토밍하고, 그 다음 3가지 앵글을 뽑고,
> 각 앵글마다 헤드라인을 5개씩 만든 뒤, 최종적으로 가장 좋은 걸 골라. 좋은 카피를 써줘."

**Findings**:

1. **Over-constraint (severe)** — "brainstorm → 3 angles → 5 headlines each → pick" is a procedure. Writing copy
   is not a task where order is part of correctness, nor where an omission is a wrong answer → none of the four
   exception conditions applies. **Fix**: delete all four procedural steps and replace them with outcome criteria.
   If the byproducts (3 angles, 15 headlines) are genuinely wanted, they are not a procedure but an
   **output format** — move them to `# Output Format`.
2. **Rubric deficiency (severe)** — "good copy" is the only criterion. Entirely unmeasurable.
   **Fix**: decompose into at least four axes —
   - the concrete product benefit appears in the headline (binary)
   - if swapping in a competitor's name still reads fine, it fails (binary — differentiation test)
   - headline within 12 words (numeric)
   - exaggerated claims are backed by fact (binary)
3. **Missing context** — product, audience, channel and banned claims are all absent. Variabilize them:
   `{{PRODUCT}}`, `{{AUDIENCE}}`, `{{CHANNEL}}`, `{{BANNED_CLAIMS}}`.
4. **No self-verification** — once criteria exist, attach a verification instruction that targets them.

No full rewrite was done (none was requested). Applying these four is enough.

---

## Example D — Expand (templatizing a rubric)

**Input**: "코드 리뷰 프롬프트 재사용 가능하게."

**Output**: **the axes stay fixed**, only the thresholds become variables.

````markdown
# Success Criteria

| # | 기준 | 판정 |
|---|---|---|
| 1 | {{SEVERITY_FLOOR}} 이상 심각도 이슈에 각각 재현 시나리오(입력→잘못된 출력)가 붙어 있다 | binary |
| 2 | 지적마다 파일:줄 위치가 있다 | binary |
| 3 | 요청 diff 밖의 코드를 지적하지 않았다 | binary |
| 4 | 스타일 지적이 전체의 {{STYLE_RATIO_MAX}} 이하 | numeric |
````

**Usage guide**:
- `{{SEVERITY_FLOOR}}` — the reporting floor. e.g. `MEDIUM`. Raise it to `HIGH` right before a release.
- `{{STYLE_RATIO_MAX}}` — cap on the share of style comments. e.g. `20%`. Can be relaxed on a new codebase.

Do not delete the axes (reproducibility, location, scope, signal-to-noise). Delete them and the rubric collapses
back into "review it well".
