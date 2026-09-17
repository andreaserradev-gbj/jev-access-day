# typesafe-lab

A learning scaffold for [TypeSafe AI](https://typesafe.ai/)'s **System One
models** — a new class of AI model that returns typed, calibrated decisions
instead of generated text. The first System One model is **Jev** (early access
via waitlist).

This project is the instrument, not the experiment: it teaches the paradigm
now, against a mock and an LLM stand-in, and becomes the eval harness that
judges the real Jev on day one of API access.

## The mental model

Jev is not a chatbot and not an agent. It is a **function call your code
invokes for semantic judgment**:

```
state (any JSON)  +  atomic questions (noul / choice / score)
        →  one POST /v1/systemone  →  typed answers with probabilities
        →  plain if-statements and confidence gates in YOUR code decide actions
```

- You never chat. There is no conversation, no prose, no explanations in the
  output — decisions and probability distributions only.
- Every question is a **gut-check** a knowledgeable person could make in
  seconds: "does this convey urgency?", not "analyze and decide".
- All questions in one call are evaluated **in parallel and independently**;
  adding questions barely changes latency. Batch aggressively.
- **Code owns the control flow**: thresholds, retries, side effects, and the
  question set are all yours. Change the model's behavior by editing
  questions, not by prompting.
- Confidence is the second decision axis: high → act, mid → step-up/verify,
  low → escalate to a human.

This lab implements that shape twice:

| Domain | Question fan-out | Composition in code |
|---|---|---|
| **CI test-failure triage** (`src/triage/`) | 5 atomic questions over a Jest failure | confidence-gated routing → auto-retry / restart infra / file P1/P2 / fix test / human |
| **Checkout risk cascade** (`src/checkout/`) | 4 pre-bureau + 3 post-bureau questions | skip-or-call bureau, expected-value thresholds with asymmetric fraud/false-decline costs, 3DS step-up, analyst review |

## The three providers

One interface (`src/typesafe/client.ts`), three interchangeable engines,
selected by `TYPESAFE_PROVIDER`:

| Provider | What it is | What it teaches |
|---|---|---|
| `mock` | Deterministic hand-written probabilities keyed by scenario | Pure wiring: how questions, answers, and decide() compose. Probabilities are **fiction**. |
| `llm` | A classic LLM (Ollama Cloud, `glm-5.3-flash:cloud`) forced into the same contract: JSON-schema-constrained output, N=5 self-consistency samples, agreement → confidence | The stand-in experiment: real model behavior under the same contract. This mirrors TypeSafe's own eval methodology (their `system-one-adapter` wrapper for frontier LLMs). |
| `real` | The actual TypeSafe API via `@typesafe-ai/sdk` (`jev-latest`) | Dormant until your waitlist access lands. Flip one env var; zero code changes. |

### What the comparison measures

`node dist/cli.js --compare` runs every fixture through every configured
provider with identical questions and identical decide() code:

- **Decision agreement** — same fixture, same action? Disagreements are the
  most instructive moments: inspect why.
- **Confidence behavior** — does the stand-in's agreement-derived confidence
  drop on the ambiguous fixtures? (Empirical calibration probing.)
- **Consistency** — re-run; the LLM stand-in varies, Jev claims
  self-consistency.
- **Latency and calls** — ~1 mocked 100ms call per stage vs N sampled
  generations; on access day you measure the "193x faster" claim yourself.
- **Tokens** — LLM output tokens × 5 samples vs Jev's near-free outputs; the
  "444x cheaper" claim, priced locally.
- **Bureau skip rate** — the checkout cascade's money metric: how many
  checkouts never paid for a bureau call.

## Quickstart

```bash
nvm use                      # Node 24
npm install
npm test                     # 22 unit tests on the pure decide() logic
npm start                    # run both domains against the mock provider
npm start -- --compare       # cross-provider comparison table
```

### Provider: llm (the stand-in)

```bash
cp .env.example .env         # then set OLLAMA_API_KEY (never commit it)
npm start -- --provider=llm
```

The stand-in calls Ollama Cloud's OpenAI-compatible chat endpoint with a JSON
schema (`format`), samples `OLLAMA_SAMPLES` times at temperature 0.7, averages
each question's distribution, and derives confidence from sample agreement
(clamped with normalized entropy). Schema violations throw loudly — the
type-error rate is *counted*, which is itself comparison data: Jev's is
mathematically zero.

### Provider: real (on access day)

1. Install the TypeSafe agent skill so coding agents batch questions correctly:

   ```bash
   npx skills add typesafe-ai/skills --skill typesafe-ai
   # add -g to install globally
   ```

2. Explore the [Playground](https://console.typesafe.ai/playground) — try the
   documented quickstart questions against your own text.
3. Set `TYPESAFE_API_KEY` in `.env`, flip `TYPESAFE_PROVIDER=real`, and run:

   ```bash
   npm start -- --provider=real
   npm start -- --compare      # mock vs llm vs Jev, side by side
   ```

The wrapper is `src/typesafe/real.ts` — deliberately thin, so any SDK drift is
a one-file fix.

## Project layout

```
src/
  typesafe/
    client.ts   # SystemOneClient interface, question/answer types, confidence math
    mock.ts     # provider 1: fixture-keyed canned answers
    llm.ts      # provider 2: Ollama Cloud stand-in, self-consistency sampling
    real.ts     # provider 3: @typesafe-ai/sdk wrapper (dormant)
    index.ts    # createClient(): provider selection
  triage/       # domain 1: state.ts, questions.ts, decide.ts
  checkout/     # domain 2: state.ts (+ mock bureau), questions.ts, decide.ts, cascade.ts
  cli.ts        # runners + comparison table
fixtures/
  failures/     # 6 Jest failure records (modeled on a real NestJS/MySQL/Kafka service)
  checkouts/    # 6 checkout records with per-fixture economics
test/           # vitest on the pure composition logic (provider-blind)
```

## Reading the code in the right order

1. `src/typesafe/client.ts` — the contract: noul/choice/score in, typed
   answers with probabilities and confidence out.
2. `src/checkout/questions.ts` — atomic question wording; note the
   speculative fan-out (stage-1 questions asked before knowing they matter).
3. `src/checkout/decide.ts` — the payoff: confidence gates and the
   expected-value boundary `margin / (margin + fraud_loss + ltv_at_risk)`,
   computed arithmetic instead of a magic number.
4. `src/checkout/cascade.ts` — code owning the control flow: Jev twice at
   most, bureau at most once, never when stage 1 is decisive.

## Honest limitations

- **Mock probabilities are fiction** — they exercise the gates, they prove
  nothing about any model.
- **The stand-in's confidence is a dispersion heuristic, not calibration.**
  LLMs are overconfident; sample agreement ≠ "0.8 happens 80% of the time".
  Only Jev's numbers can test TypeSafe's calibration claim.
- **The stand-in cannot replicate the parallel sampler's economics.** Adding
  questions multiplies generated tokens for the LLM; for Jev they are
  near-free and latency stays flat. The cost gap is structural.
- **Zero type errors ≠ correct answers.** Constrained decoding bounds the
  stand-in to schema-valid JSON, but a semantically wrong distribution is
  still possible; Jev's guarantee is about type-safety, not correctness.
- **Jev is decision support, not the regulated decider.** Every decline path
  here keeps a human-review-compatible audit record; real deployments keep a
  deterministic policy layer and a human path (GDPR Art. 22 territory).
- Pricing claims are unsubstantiated until measured; the mock's latency is
  simulated.

## Sources

- Home: https://typesafe.ai/ · Manifesto: https://typesafe.ai/manifesto
- Announcement: https://typesafe.ai/blog/introducing-system-one-models-and-jev
- Docs: https://docs.typesafe.ai/ (start: Introduction → Quick start →
  Primitives → Confidence → How to build → Patterns)
- Evals: https://evals.typesafe.ai/
- SDK: `@typesafe-ai/sdk` (npm), https://github.com/typesafe-ai/typesafe-sdk-js