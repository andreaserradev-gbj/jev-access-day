# Eval report — 2026-09-19

- Providers: mock, real
- Runs per fixture: 3
- Domains: triage, checkout, prreview
- Records: 138 (schema v1)

## Results

| provider | domain | scored | pass | fail | pass rate | Brier | ECE | p50 ms | p95 ms | tok in | tok out | calls | cost USD | violations |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
mock | checkout | 21 | 21 | 0 | 100.0% | 0.216 | 0.403 | 650 | 925 | 18888 | 3972 | 36 | $0.000000 | 0
mock | prreview | 21 | 21 | 0 | 100.0% | 0.115 | 0.311 | 77 | 94 | 12687 | 2340 | 21 | $0.000000 | 0
mock | triage | 27 | 27 | 0 | 100.0% | 0.145 | 0.344 | 78 | 98 | 17115 | 3612 | 27 | $0.000000 | 0
real | checkout | 21 | 14 | 7 | 66.7% | 0.167 | 0.185 | 1014 | 1474 | 31912 | 3094 | 33 | $0.001340 | 0
real | prreview | 21 | 13 | 8 | 61.9% | 0.159 | 0.220 | 307 | 401 | 22251 | 2883 | 21 | $0.000935 | 0
real | triage | 27 | 14 | 13 | 51.9% | 0.344 | 0.370 | 729 | 826 | 26346 | 3492 | 27 | $0.001107 | 0

## Disagreements vs expectations.json

### real/checkout

- bopis-edge-v2 (route approve_fast_path ≠ bureau_call)
- bopis-edge (action review ≠ approve)
- thin-file-new-customer (action review ≠ step_up)
- bopis-edge-v2 (route approve_fast_path ≠ bureau_call)
- bopis-edge (action review ≠ approve)
- bopis-edge-v2 (route approve_fast_path ≠ bureau_call)
- bopis-edge (action review ≠ approve)

### real/prreview

- major-runtime-breaking-v2 (resolved reject ≠ approve)
- major-runtime-breaking (resolved reject ≠ needs_human)
- unsound-lockfile-drift (resolved needs_human ≠ reject)
- major-runtime-breaking-v2 (resolved reject ≠ approve)
- major-runtime-breaking (resolved reject ≠ needs_human)
- unsound-lockfile-drift (resolved needs_human ≠ reject)
- major-runtime-breaking-v2 (resolved reject ≠ approve)
- major-runtime-breaking (resolved reject ≠ needs_human)

### real/triage

- bad-test-v2 (action needs_human ≠ fix_test)
- bad-test (action requeue_environment ≠ fix_test)
- error-contract-regression (action file_regression_p2 ≠ file_regression_p1)
- known-flake-v2 (action fix_test ≠ auto_retry)
- known-flake (action fix_test ≠ auto_retry)
- bad-test (action requeue_environment ≠ fix_test)
- error-contract-regression (action file_regression_p2 ≠ file_regression_p1)
- known-flake-v2 (action fix_test ≠ auto_retry)
- known-flake (action fix_test ≠ auto_retry)
- bad-test (action requeue_environment ≠ fix_test)
- error-contract-regression (action file_regression_p2 ≠ file_regression_p1)
- known-flake-v2 (action fix_test ≠ auto_retry)
- known-flake (action fix_test ≠ auto_retry)

## Notes

- Cost for `jev-latest` priced at $0.042/Mtok input, output free (docs.typesafe.ai/models, verified 2026-09-18).
- Calibration columns (Brier/ECE) score stated confidence against fixture outcomes; interpret per the plan: fixture scoring is agreement, the synthetic probe battery carries the calibration claim.
