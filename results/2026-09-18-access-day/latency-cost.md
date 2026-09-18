# Latency — measured from persisted run records — 2026-09-18

Source: `results/2026-09-18-postfix/run-*.json` (144 records, 3 runs × 4 providers × 2 domains × 6 fixtures).
Per-call latency = record `usage.elapsedMs / usage.calls` (llm records fold N=5 samples into one usage blob; checkout folds stage1+stage3+bureau).

## Per-call latency (the 70-500ms claim)

| provider | domain | n | p50 | p95 | min | max |
|---|---|---|---|---|---|---|
| real | triage | 18 | 306ms | 824ms | 270ms | 824ms |
| real | checkout | 18 | 501ms | 1030ms | 270ms | 1030ms |
| llm (cloud) | triage | 18 | 16243ms | 27005ms | 9599ms | 27005ms |
| llm (cloud) | checkout | 18 | 10026ms | 24305ms | 4308ms | 24305ms |
| llm-local | triage | 18 | 7405ms | 9293ms | 5259ms | 9293ms |
| llm-local | checkout | 18 | 7721ms | 11740ms | 4845ms | 11740ms |
| mock | triage | 18 | 76ms | 99ms | 60ms | 99ms |
| mock | checkout | 18 | 310ms | 484ms | 62ms | 484ms |

(For mock/real the "per-call" figure equals the whole fixture call — they make 1 call per ask, so these are true per-call latencies.)

## Verdict on the claim

- **Real Jev triage: p50 306ms — inside the claimed 70-500ms band.** Checkout p50 501ms sits exactly at the band's top edge; p95 (824ms/1030ms) exceeds 500ms. The claim holds for the *typical* call, not the tail.
- **The llm stand-in is ~30-53x slower per ask** (16.2s vs 306ms triage; 10.0s vs 501ms checkout) — and ~2 orders of magnitude slower than the claim band.
- llm-local is faster than llm cloud (7.4s vs 16.2s triage p50) because of think:false, but still ~24x real Jev.
- The gap is architectural, not incidental: N=5 self-consistency multiplies calls, and cloud glm burns ~15.6k output tokens/ask on server-default thinking (~19x the local model's 814).

## Token volumes feeding the cost claim (same wave)

| provider | domain | calls | in-tok/ask | out-tok/ask | out-tok/call |
|---|---|---|---|---|---|
| real | triage | 18 | 903 | 129 | 129 |
| real | checkout | 30 | 1591 | 156 | 94 |
| llm (cloud) | triage | 90 | 3915 | 13953 | 2791 |
| llm (cloud) | checkout | 164 | 7499 | 15809 | 1735 |
| llm-local | triage | 90 | 4195 | 772 | 154 |
| llm-local | checkout | 170 | 8440 | 1438 | 152 |
| mock | triage | 18 | 573 | 134 | 134 |
| mock | checkout | 30 | 841 | 184 | 111 |

- **Real Jev output tokens are tiny (129-156/ask)** — consistent with the "output ~free" pricing ($0.042/Mtok input, output free per docs). At 0.042 USD/Mtok input: a triage ask ≈ $0.00004, a checkout cascade ≈ $0.00007. Effectively free per decision.
- The llm stand-in emits **~100x more output tokens** (cloud: 13.9k-15.8k/ask) — output is where N=5 + thinking-mode costs concentrate. Even at "output free" pricing for Jev, the stand-in's *wall-clock* cost (16-27s/ask) dwarfs any per-token cost.