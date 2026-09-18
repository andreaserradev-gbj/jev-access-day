# Eval report — 2026-09-18

- Providers: llm, llm-local, mock, real
- Runs per fixture: 3
- Domains: checkout, triage
- Records: 114 (schema v1)

## Results

| provider | domain | scored | pass | fail | pass rate | Brier | ECE | p50 ms | p95 ms | tok in | tok out | calls | cost USD | violations |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
llm-local | triage | 6 | 2 | 4 | 33.3% | 0.169 | 0.259 | 36513 | 50134 | 24180 | 4572 | 30 | n/a | 0
llm | checkout | 18 | 11 | 7 | 61.1% | 0.286 | 0.335 | 120819 | 283282 | 117145 | 270331 | 145 | n/a | 0
llm | triage | 18 | 5 | 13 | 27.8% | 0.146 | 0.240 | 60773 | 133861 | 67901 | 237228 | 89 | n/a | 0
mock | checkout | 18 | 18 | 0 | 100.0% | 0.239 | 0.423 | 580 | 959 | 15135 | 3318 | 30 | $0.000000 | 0
mock | triage | 18 | 18 | 0 | 100.0% | 0.166 | 0.360 | 88 | 99 | 9888 | 2409 | 18 | $0.000000 | 0
real | checkout | 18 | 15 | 3 | 83.3% | 0.093 | 0.246 | 1024 | 1515 | 28629 | 2805 | 30 | $0.001202 | 0
real | triage | 18 | 9 | 9 | 50.0% | 0.143 | 0.289 | 277 | 784 | 15639 | 2325 | 18 | $0.000657 | 0

## Disagreements vs expectations.json

### llm-local/triage

- bad-test (action needs_human ≠ fix_test)
- environment-drift (action needs_human ≠ requeue_environment)
- error-contract-regression (action needs_human ≠ file_regression_p1)
- known-flake (action needs_human ≠ auto_retry)

### llm/checkout

- bopis-edge (action review ≠ approve)
- thin-file-new-customer (action review ≠ step_up)
- bopis-edge (action review ≠ approve)
- thin-file-new-customer (action review ≠ step_up)
- bopis-edge (action review ≠ approve)
- stolen-card-pattern (route bureau_call ≠ decline_fast_path; action review ≠ decline)
- thin-file-new-customer (action review ≠ step_up)

### llm/triage

- bad-test (action needs_human ≠ fix_test)
- environment-drift (action needs_human ≠ requeue_environment)
- error-contract-regression (action needs_human ≠ file_regression_p1)
- infra-outage (action auto_retry ≠ restart_infra)
- known-flake (action needs_human ≠ auto_retry)
- bad-test (action needs_human ≠ fix_test)
- environment-drift (action needs_human ≠ requeue_environment)
- error-contract-regression (action needs_human ≠ file_regression_p1)
- known-flake (action needs_human ≠ auto_retry)
- bad-test (action needs_human ≠ fix_test)
- environment-drift (action needs_human ≠ requeue_environment)
- error-contract-regression (action needs_human ≠ file_regression_p1)
- known-flake (action needs_human ≠ auto_retry)

### real/checkout

- bopis-edge (action review ≠ approve)
- bopis-edge (action review ≠ approve)
- bopis-edge (action review ≠ approve)

### real/triage

- bad-test (action needs_human ≠ fix_test)
- error-contract-regression (action file_regression_p2 ≠ file_regression_p1)
- known-flake (action needs_human ≠ auto_retry)
- bad-test (action needs_human ≠ fix_test)
- error-contract-regression (action file_regression_p2 ≠ file_regression_p1)
- known-flake (action needs_human ≠ auto_retry)
- bad-test (action needs_human ≠ fix_test)
- error-contract-regression (action file_regression_p2 ≠ file_regression_p1)
- known-flake (action needs_human ≠ auto_retry)

## Notes

- Cost for `jev-latest` priced at $0.042/Mtok input, output free (docs.typesafe.ai/models, verified 2026-09-18).
- Calibration columns (Brier/ECE) score stated confidence against fixture outcomes; interpret per the plan: fixture scoring is agreement, the synthetic probe battery carries the calibration claim.
