# Self-consistency — mock — 2026-09-18

3 identical re-runs per fixture; full answer objects hashed (sha256 over key-sorted JSON).

| fixture | runs | unique hashes | dominant hash | deterministic? |
|---|---|---|---|---|
| bad-test | 3 | 1 | 3/3 | yes |
| error-contract-regression | 3 | 1 | 3/3 | yes |
| known-flake | 3 | 1 | 3/3 | yes |

No per-question drift: every question returned identical values on every run.

## Cost of the probe

- bad-test: 3 call(s), 1839+399 tok, p50 64ms
- error-contract-regression: 3 call(s), 1737+405 tok, p50 87ms
- known-flake: 3 call(s), 1839+399 tok, p50 89ms

Interpretation: unique hashes = 1 on every fixture means the provider is deterministic (Jev claim). Multiple hashes mean run-to-run drift; the per-question tables show where. The llm stand-in is expected to drift — its confidence comes from in-call N=5 agreement.
