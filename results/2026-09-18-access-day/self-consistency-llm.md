# Self-consistency — llm — 2026-09-18

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
| is_known_flake_pattern | 0.054, 0.044, 0.048, 0.058, 0.046 |
| asserts_error_contract | 0.020, 0.022, 0.022, 0.022, 0.018 |
| plausibly_from_commit | 0.850, 0.860, 0.852, 0.860, 0.858 |
| failure_category | bad_test@0.21, bad_test@0.26, bad_test@0.22, bad_test@0.22, bad_test@0.23 |
| regression_severity | 0.94, 0.95, 0.94, 0.90, 0.90 |

### error-contract-regression

| question | distinct values across runs |
|---|---|
| is_known_flake_pattern | 0.026, 0.038, 0.034, 0.044, 0.038 |
| asserts_error_contract | 0.976, 0.974, 0.974, 0.974, 0.972 |
| plausibly_from_commit | 0.880, 0.872, 0.874, 0.894, 0.880 |
| failure_category | real_regression@0.39, real_regression@0.37, real_regression@0.35, real_regression@0.36, real_regression@0.42 |
| regression_severity | 1.04, 1.05, 1.01, 1.05, 1.04 |

### known-flake

| question | distinct values across runs |
|---|---|
| is_known_flake_pattern | 0.900, 0.924, 0.898, 0.924, 0.900 |
| asserts_error_contract | 0.948, 0.932, 0.902, 0.936, 0.904 |
| plausibly_from_commit | 0.168, 0.286, 0.260, 0.190, 0.276 |
| failure_category | bad_test@0.20, bad_test@0.16, bad_test@0.26, bad_test@0.20, bad_test@0.16 |
| regression_severity | 1.67, 1.68, 1.67, 1.76, 1.68 |

## Cost of the probe

- bad-test: 25 call(s), 20475+73947 tok, p50 82060ms
- error-contract-regression: 25 call(s), 19725+43712 tok, p50 50137ms
- known-flake: 25 call(s), 21625+83629 tok, p50 78088ms

Interpretation: unique hashes = 1 on every fixture means the provider is deterministic (Jev claim). Multiple hashes mean run-to-run drift; the per-question tables show where. The llm stand-in is expected to drift — its confidence comes from in-call N=5 agreement.
