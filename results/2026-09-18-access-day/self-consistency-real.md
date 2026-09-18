# Self-consistency — real — 2026-09-18

5 identical re-runs per fixture; full answer objects hashed (sha256 over key-sorted JSON).

| fixture | runs | unique hashes | dominant hash | deterministic? |
|---|---|---|---|---|
| bad-test | 5 | 5 | 1/5 | no |
| error-contract-regression | 5 | 5 | 1/5 | no |
| known-flake | 5 | 5 | 1/5 | no |

## Per-question drift (fixtures with any disagreement)

### bad-test

| question | distinct values across runs |
|---|---|
| plausibly_from_commit | 0.910, 0.920, 0.910, 0.910, 0.900 |
| failure_category | environment@0.81, environment@0.82, environment@0.81, environment@0.82, environment@0.79 |
| regression_severity | 0.39, 0.40, 0.42, 0.40, 0.37 |

### error-contract-regression

| question | distinct values across runs |
|---|---|
| plausibly_from_commit | 0.660, 0.670, 0.680, 0.660, 0.670 |
| failure_category | real_regression@0.70, real_regression@0.73, real_regression@0.73, real_regression@0.74, real_regression@0.67 |
| regression_severity | 1.06, 1.05, 1.05, 1.04, 1.04 |

### known-flake

| question | distinct values across runs |
|---|---|
| is_known_flake_pattern | 0.890, 0.890, 0.900, 0.900, 0.890 |
| asserts_error_contract | 0.830, 0.810, 0.810, 0.830, 0.810 |
| plausibly_from_commit | 0.160, 0.140, 0.150, 0.150, 0.160 |
| failure_category | bad_test@0.87, bad_test@0.86, bad_test@0.81, bad_test@0.89, bad_test@0.85 |
| regression_severity | 1.84, 1.69, 1.76, 1.69, 1.76 |

## Cost of the probe

- bad-test: 5 call(s), 4660+640 tok, p50 309ms
- error-contract-regression: 5 call(s), 4570+655 tok, p50 305ms
- known-flake: 5 call(s), 4960+645 tok, p50 403ms

Interpretation: unique hashes = 1 on every fixture means the provider is deterministic (Jev claim). Multiple hashes mean run-to-run drift; the per-question tables show where. The llm stand-in is expected to drift — its confidence comes from in-call N=5 agreement.
