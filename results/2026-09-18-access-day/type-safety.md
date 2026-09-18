# Type-safety — measured throw/violation rate — 2026-09-18

**Claim under test**: type-safety violations = 0 — every provider response maps cleanly
through `mapAnswerFromSdk` into a typed `Answer` union, and every persisted record
passes schema checks (noul ∈ [0,1], probabilities sum to 1, choice ∈ probabilities,
confidence ∈ [0,1], finite scores).

## Measured

**Scope**: all 258 records across the 3 committed waves (2026-09-18 pre-fix: 114,
2026-09-18-postfix: 144, 2026-09-18-access-day: probe artifacts), spanning 4
providers (mock, real, llm cloud, llm-local) × 2 domains (triage, checkout;
checkout = stage1 + optional stage3 answer sets, 2 sets per record).

| check | records scanned | violations |
|---|---|---|
| unknown answer type (would throw in `mapAnswerFromSdk`) | 258 records / 362 answer sets | **0** |
| empty or non-string `choice` | 258 | **0** |
| non-number `confidence` | 258 | **0** |
| missing `probabilities` object | 258 | **0** |
| non-number `noul` / `score` | 258 | **0** |
| schema violations (prob-sum, ranges — the harness's own checker, committed reports) | 258 | **0** |

## How the throw path is defended

1. `mapAnswerFromSdk` (src/typesafe/real.ts:134) throws loudly on any unknown
   `answer.type` — the shape-drift tripwire. Across every live real-Jev call ever
   persisted, it never threw.
2. Unit test `test/providers.test.ts:132` pins the throw: `{ type: 'oracle' }` →
   `throw /unknown answer type/`. Defaults (`choice`/`score`/`noul` with missing
   fields) map to typed zero-values rather than throwing — the union stays closed.
3. `recordSchemaViolations` (src/eval/metrics.ts:263) re-validates every persisted
   record offline; the committed report tables show violations=0 for every
   provider/domain in both full waves.

## Verdict

The claimed throw rate of 0 holds — 0 violations across 258 records, 4 providers,
2 waves, live API included. Caveats for the article: the claim is about *mapping*
type-safety (the closed Answer union), not about answer *quality* — Jev can return
a perfectly typed wrong answer (that is what the fixture pass rates measure). The
harness's drift-shape handling (markdown fences, appended rationale keys) lives in
the llm stand-in's parser; real Jev never required a single repair.