# Claims — claimed vs measured — 2026-09-18 access day

Every TypeSafe marketing claim converted into a measured number, same batteries
for real Jev and the LLM stand-in. Sources: the three committed waves
(`results/2026-09-18/`, `results/2026-09-18-postfix/`, this dir) + dedicated
probe scripts. Playground cross-check (same-model-different-surface drift)
deferred to Phase 5 backlog.

| # | Claim | Claimed | Measured (real Jev) | Measured (llm stand-in) | Verdict |
|---|---|---|---|---|---|
| 1 | Calibration: "confidence 0.8 means ~80% correct" | stated ≈ empirical | Brier 0.0066, ECE 0.0800; per-bin gaps +0.036/+0.016/−0.056 (5 states/bin) | n/a this probe (llm conf is agreement-derived, not calibrated) | **Holds** — small systematic optimism at the high bin (−0.056) |
| 2 | Self-consistency: deterministic engine | ~deterministic | NOT hash-deterministic: 5/5 unique hashes; but category never flips, conf wobble ±0.03-0.08 (e.g. bad_test@0.81-0.89) | 5/5 unique hashes; conf 0.16-0.26 (bad_test rows), noul swings 0.168→0.286 (~70% rel.) | **Revised**: near-deterministic, not deterministic; drift is last-decimal + conf-level, never category |
| 3 | Latency: 70-500ms per call | 70-500ms | triage p50 306ms ✓ mid-band; checkout p50 501ms (top edge); p95 824-1030ms ✗ | per-ask 10-27s (cloud, N=5 + thinking); 30-53x Jev | **Holds for typical call**, fails the tail |
| 4 | Cost: output tokens ~free | $0.042/Mtok in, out free | 129-156 out-tok/ask → triage ask ≈ $0.00004, checkout ≈ $0.00007 | ~13.9-15.8k out-tok/ask (cloud thinking), ~100x Jev | **Holds** — and explains the stand-in's cost asymmetry |
| 5 | Type-safety: 0 throw rate | 0 | 258 records / 362 answer sets: 0 unknown types, 0 missing keys, 0 schema violations | 0 violations (same waves) | **Holds** — closed Answer union; wrong-but-typed answers still possible |

## The nuance the headline table needs

- **Calibration and self-consistency are different claims and both survived, but
  self-consistency needed revision**: the earlier "3/3 identical answers" note
  compared coarse decisions. Hashing full answer objects (sha256 over key-sorted
  JSON) exposed last-decimal wobble in noul/score and ±0.03-0.08 confidence
  wobble. Category answers never flipped in 30 runs — the *routing-relevant*
  signal is stable, the raw probabilities are not.
- **Why confidence wobble matters anyway**: the kernels gate actions on
  confidence (0.5 triage floor, 0.65 checkout fast-path). A 0.87→0.81 drift can
  flip an action parked exactly at a gate. Jev at conf ~0.8 sits safely above
  gates; the llm stand-in at 0.16-0.26 parks below the 0.5 floor — which is why
  it routes to needs_human everywhere and can never act (designed safety).
- **Latency split explained**: cloud glm burns ~15.6k out-tok/ask on
  server-default thinking (~19x local's 814); N=5 multiplies calls on both.
  The gap is architectural, not incidental.
- **Cost asymmetry**: Jev's output tokens are the cheap side of its pricing
  (and priced ~free); the stand-in's cost concentrates exactly in output tokens
  (thinking + N=5). Same architecture, opposite cost profile.

## Probe artifacts

- `calibration-real.md` — 3-bin battery, 5 states/bin
- `self-consistency-real.md`, `self-consistency-llm.md` — hash + per-question drift tables
- `latency-cost.md` — per-call percentiles + token volumes from the postfix wave
- `type-safety.md` — violation scan across all committed waves