# Eval report — 2026-09-18

- Providers: llm-local
- Runs per fixture: 1
- Domains: triage
- Records: 6 (schema v1)

## Results

| provider | domain | scored | pass | fail | pass rate | Brier | ECE | p50 ms | p95 ms | tok in | tok out | calls | cost USD | violations |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
llm-local | triage | 6 | 2 | 4 | 33.3% | 0.169 | 0.259 | 36513 | 50134 | 24180 | 4572 | 30 | n/a | 0

## Disagreements vs expectations.json

### llm-local/triage

- bad-test (action needs_human ≠ fix_test)
- environment-drift (action needs_human ≠ requeue_environment)
- error-contract-regression (action needs_human ≠ file_regression_p1)
- known-flake (action needs_human ≠ auto_retry)

## Notes

- Cost for `jev-latest` uses placeholder pricing (0/0) until verified from docs.typesafe.ai (Phase 3).
- Calibration columns (Brier/ECE) score stated confidence against fixture outcomes; interpret per the plan: fixture scoring is agreement, the synthetic probe battery carries the calibration claim.
