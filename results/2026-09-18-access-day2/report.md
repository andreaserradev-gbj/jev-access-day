# Eval report — 2026-09-18

- Providers: llm-local
- Runs per fixture: 3
- Domains: dunning, prreview
- Records: 36 (schema v1)

## Results

| provider | domain | scored | pass | fail | pass rate | Brier | ECE | p50 ms | p95 ms | tok in | tok out | calls | cost USD | violations |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
llm-local | dunning | 18 | 15 | 3 | 83.3% | 0.131 | 0.228 | 28701 | 39146 | 87120 | 16257 | 90 | n/a | 0
llm-local | prreview | 18 | 15 | 3 | 83.3% | 0.119 | 0.260 | 36578 | 57928 | 84885 | 14500 | 90 | n/a | 0

## Disagreements vs expectations.json

### llm-local/dunning

- nsf-repeat (action switch_method_then_retry ≠ pause_spending)
- nsf-repeat (action switch_method_then_retry ≠ pause_spending)
- nsf-repeat (action switch_method_then_retry ≠ pause_spending)

### llm-local/prreview

- unsound-lockfile-drift (resolved needs_human ≠ reject)
- unsound-lockfile-drift (resolved needs_human ≠ reject)
- unsound-lockfile-drift (resolved needs_human ≠ reject)

## Notes

- Cost for `jev-latest` priced at $0.042/Mtok input, output free (docs.typesafe.ai/models, verified 2026-09-18).
- Calibration columns (Brier/ECE) score stated confidence against fixture outcomes; interpret per the plan: fixture scoring is agreement, the synthetic probe battery carries the calibration claim.
