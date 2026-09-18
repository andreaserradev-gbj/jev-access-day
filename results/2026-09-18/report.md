# Eval report — 2026-09-18

- Providers: mock
- Runs per fixture: 1
- Domains: triage
- Records: 6 (schema v1)

## Results

| provider | domain | scored | pass | fail | pass rate | Brier | ECE | p50 ms | p95 ms | tok in | tok out | calls | cost USD | violations |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
mock | triage | 6 | 6 | 0 | 100.0% | 0.166 | 0.360 | 67 | 95 | 3296 | 803 | 6 | $0.000000 | 0

## Disagreements vs expectations.json

None. Every scored record matched the expectation.
## Notes

- Cost for `jev-latest` priced at $0.042/Mtok input, output free (docs.typesafe.ai/models, verified 2026-09-18).
- Calibration columns (Brier/ECE) score stated confidence against fixture outcomes; interpret per the plan: fixture scoring is agreement, the synthetic probe battery carries the calibration claim.
