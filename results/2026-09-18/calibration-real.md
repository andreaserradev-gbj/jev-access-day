# Calibration probe — real — 2026-09-18

Constructed truth at three bins; 3 synthetic states per bin.

| bin | states | mean stated P(yes) | empirical P(yes) | gap |
|---|---|---|---|---|
| p≈0.2 | 3 | 0.337 | 0.33 | +0.003 |
| p≈0.5 | 3 | 0.357 | 0.33 | +0.023 |
| p≈0.8 | 3 | 0.633 | 0.67 | -0.033 |

- Brier: 0.0064
- ECE (10 bins): 0.0778

Interpretation: a calibrated engine tracks the empirical column with its stated column (small |gap|). For the mock provider the noul values are canned fiction — a large gap is the expected, instructive result. The claim under test for Jev (real provider): stated confidence ≈ empirical frequency.
