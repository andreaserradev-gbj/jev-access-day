# Eval report — 2026-09-18

- Providers: llm, llm-local, mock, real
- Runs per fixture: 3
- Domains: checkout, triage
- Records: 144 (schema v1)

## Results

| provider | domain | scored | pass | fail | pass rate | Brier | ECE | p50 ms | p95 ms | tok in | tok out | calls | cost USD | violations |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
llm-local | checkout | 18 | 8 | 10 | 44.4% | 0.343 | 0.346 | 77062 | 115465 | 151925 | 25886 | 170 | n/a | 0
llm-local | triage | 18 | 5 | 13 | 27.8% | 0.234 | 0.334 | 37023 | 46466 | 75510 | 13904 | 90 | n/a | 0
llm | checkout | 18 | 9 | 9 | 50.0% | 0.274 | 0.337 | 91401 | 243045 | 134973 | 284561 | 164 | n/a | 0
llm | triage | 18 | 3 | 15 | 16.7% | 0.128 | 0.216 | 81217 | 135024 | 70470 | 251145 | 90 | n/a | 0
mock | checkout | 18 | 18 | 0 | 100.0% | 0.239 | 0.423 | 620 | 968 | 15135 | 3318 | 30 | $0.000000 | 0
mock | triage | 18 | 18 | 0 | 100.0% | 0.166 | 0.360 | 76 | 99 | 10305 | 2409 | 18 | $0.000000 | 0
real | checkout | 18 | 14 | 4 | 77.8% | 0.117 | 0.118 | 1001 | 2059 | 28639 | 2805 | 30 | $0.001203 | 0
real | triage | 18 | 9 | 9 | 50.0% | 0.333 | 0.385 | 306 | 824 | 16245 | 2325 | 18 | $0.000682 | 0

## Disagreements vs expectations.json

### llm-local/checkout

- bopis-edge (action review ≠ approve)
- clean-repeat-buyer (route bureau_call ≠ approve_fast_path; action step_up ≠ approve)
- stolen-card-pattern (route bureau_call ≠ decline_fast_path; action review ≠ decline)
- thin-file-new-customer (action review ≠ step_up)
- bopis-edge (action review ≠ approve)
- clean-repeat-buyer (route bureau_call ≠ approve_fast_path; action review ≠ approve)
- thin-file-new-customer (action review ≠ step_up)
- bopis-edge (action review ≠ approve)
- clean-repeat-buyer (route bureau_call ≠ approve_fast_path; action step_up ≠ approve)
- thin-file-new-customer (action review ≠ step_up)

### llm-local/triage

- bad-test (action needs_human ≠ fix_test)
- environment-drift (action needs_human ≠ requeue_environment)
- error-contract-regression (action needs_human ≠ file_regression_p1)
- infra-outage (action auto_retry ≠ restart_infra)
- known-flake (action fix_test ≠ auto_retry)
- bad-test (action requeue_environment ≠ fix_test)
- environment-drift (action needs_human ≠ requeue_environment)
- error-contract-regression (action needs_human ≠ file_regression_p1)
- known-flake (action fix_test ≠ auto_retry)
- bad-test (action requeue_environment ≠ fix_test)
- environment-drift (action needs_human ≠ requeue_environment)
- error-contract-regression (action needs_human ≠ file_regression_p1)
- known-flake (action fix_test ≠ auto_retry)

### llm/checkout

- bopis-edge (action review ≠ approve)
- stolen-card-pattern (route bureau_call ≠ decline_fast_path; action review ≠ decline)
- thin-file-new-customer (action review ≠ step_up)
- bopis-edge (action review ≠ approve)
- stolen-card-pattern (route bureau_call ≠ decline_fast_path; action review ≠ decline)
- thin-file-new-customer (action review ≠ step_up)
- bopis-edge (action review ≠ approve)
- stolen-card-pattern (route bureau_call ≠ decline_fast_path; action review ≠ decline)
- thin-file-new-customer (action review ≠ step_up)

### llm/triage

- bad-test (action needs_human ≠ fix_test)
- environment-drift (action needs_human ≠ requeue_environment)
- error-contract-regression (action needs_human ≠ file_regression_p1)
- infra-outage (action needs_human ≠ restart_infra)
- known-flake (action needs_human ≠ auto_retry)
- bad-test (action needs_human ≠ fix_test)
- environment-drift (action needs_human ≠ requeue_environment)
- error-contract-regression (action needs_human ≠ file_regression_p1)
- infra-outage (action needs_human ≠ restart_infra)
- known-flake (action needs_human ≠ auto_retry)
- bad-test (action needs_human ≠ fix_test)
- environment-drift (action needs_human ≠ requeue_environment)
- error-contract-regression (action needs_human ≠ file_regression_p1)
- infra-outage (action needs_human ≠ restart_infra)
- known-flake (action needs_human ≠ auto_retry)

### real/checkout

- bopis-edge (action review ≠ approve)
- bopis-edge (action review ≠ approve)
- thin-file-new-customer (action review ≠ step_up)
- bopis-edge (action review ≠ approve)

### real/triage

- bad-test (action requeue_environment ≠ fix_test)
- error-contract-regression (action file_regression_p2 ≠ file_regression_p1)
- known-flake (action fix_test ≠ auto_retry)
- bad-test (action requeue_environment ≠ fix_test)
- error-contract-regression (action file_regression_p2 ≠ file_regression_p1)
- known-flake (action fix_test ≠ auto_retry)
- bad-test (action requeue_environment ≠ fix_test)
- error-contract-regression (action file_regression_p2 ≠ file_regression_p1)
- known-flake (action fix_test ≠ auto_retry)

## Notes

- Cost for `jev-latest` priced at $0.042/Mtok input, output free (docs.typesafe.ai/models, verified 2026-09-18).
- Calibration columns (Brier/ECE) score stated confidence against fixture outcomes; interpret per the plan: fixture scoring is agreement, the synthetic probe battery carries the calibration claim.
