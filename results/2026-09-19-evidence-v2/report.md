# Eval report — 2026-09-19

- Providers: mock, real
- Runs per fixture: 3
- Domains: triage, checkout, prreview
- Records: 138 (schema v1)

## Results

| provider | domain | scored | pass | fail | pass rate | Brier | ECE | p50 ms | p95 ms | tok in | tok out | calls | cost USD | violations |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
mock | checkout | 21 | 21 | 0 | 100.0% | 0.216 | 0.403 | 527 | 939 | 18120 | 3972 | 36 | $0.000000 | 0
mock | prreview | 21 | 21 | 0 | 100.0% | 0.115 | 0.311 | 81 | 87 | 12687 | 2340 | 21 | $0.000000 | 0
mock | triage | 27 | 27 | 0 | 100.0% | 0.145 | 0.344 | 79 | 96 | 15723 | 3612 | 27 | $0.000000 | 0
real | checkout | 21 | 14 | 7 | 66.7% | 0.114 | 0.240 | 947 | 1273 | 34449 | 3360 | 36 | $0.001447 | 0
real | prreview | 21 | 14 | 7 | 66.7% | 0.168 | 0.221 | 287 | 337 | 22251 | 2883 | 21 | $0.000935 | 0
real | triage | 27 | 9 | 18 | 33.3% | 0.444 | 0.513 | 307 | 736 | 24777 | 3489 | 27 | $0.001041 | 0

## Disagreements vs expectations.json

### real/checkout

- bopis-edge-v2 (action review ≠ approve)
- bopis-edge (action review ≠ approve)
- thin-file-new-customer (action review ≠ step_up)
- bopis-edge-v2 (action review ≠ approve)
- bopis-edge (action review ≠ approve)
- bopis-edge-v2 (action review ≠ approve)
- bopis-edge (action review ≠ approve)

### real/prreview

- major-runtime-breaking-v2 (resolved reject ≠ approve)
- major-runtime-breaking (resolved reject ≠ needs_human)
- major-runtime-breaking-v2 (resolved reject ≠ approve)
- major-runtime-breaking (resolved reject ≠ needs_human)
- unsound-lockfile-drift (resolved needs_human ≠ reject)
- major-runtime-breaking-v2 (resolved reject ≠ approve)
- major-runtime-breaking (resolved reject ≠ needs_human)

### real/triage

- bad-test-v2 (action requeue_environment ≠ fix_test)
- bad-test (action requeue_environment ≠ fix_test)
- error-contract-regression-v2 (action file_regression_p2 ≠ file_regression_p1)
- error-contract-regression (action file_regression_p2 ≠ file_regression_p1)
- known-flake-v2 (action fix_test ≠ auto_retry)
- known-flake (action fix_test ≠ auto_retry)
- bad-test-v2 (action requeue_environment ≠ fix_test)
- bad-test (action requeue_environment ≠ fix_test)
- error-contract-regression-v2 (action file_regression_p2 ≠ file_regression_p1)
- error-contract-regression (action file_regression_p2 ≠ file_regression_p1)
- known-flake-v2 (action fix_test ≠ auto_retry)
- known-flake (action fix_test ≠ auto_retry)
- bad-test-v2 (action requeue_environment ≠ fix_test)
- bad-test (action requeue_environment ≠ fix_test)
- error-contract-regression-v2 (action file_regression_p2 ≠ file_regression_p1)
- error-contract-regression (action file_regression_p2 ≠ file_regression_p1)
- known-flake-v2 (action fix_test ≠ auto_retry)
- known-flake (action fix_test ≠ auto_retry)

## Notes

- Cost for `jev-latest` priced at $0.042/Mtok input, output free (docs.typesafe.ai/models, verified 2026-09-18).
- Calibration columns (Brier/ECE) score stated confidence against fixture outcomes; interpret per the plan: fixture scoring is agreement, the synthetic probe battery carries the calibration claim.
