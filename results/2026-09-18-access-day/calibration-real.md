# Calibration probe — real — 2026-09-18

Constructed truth at three bins; 5 synthetic states per bin.

| bin | states | mean stated P(yes) | empirical P(yes) | gap |
|---|---|---|---|---|
| p≈0.2 | 5 | 0.236 | 0.20 | +0.036 |
| p≈0.5 | 5 | 0.416 | 0.40 | +0.016 |
| p≈0.8 | 5 | 0.744 | 0.80 | -0.056 |

- Brier: 0.0066
- ECE (10 bins): 0.0800

Interpretation: a calibrated engine tracks the empirical column with its stated column (small |gap|). For the mock provider the noul values are canned fiction — a large gap is the expected, instructive result. The claim under test for Jev (real provider): stated confidence ≈ empirical frequency.
