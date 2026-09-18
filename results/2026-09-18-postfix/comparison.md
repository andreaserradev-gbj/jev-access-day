# Provider comparison — results/2026-09-18-postfix

Offline from persisted run-*.json (mock column = anchor: mock answers are engineered to pass every expectation).

## checkout — decisions

| scenario | expected | mock | real | llm | llm-local |
|---|---|---|---|---|---|
| ambiguous-checkout | review [bureau_call] | review | review | review | review |
| bopis-edge | approve [bureau_call] | approve | **review** | **review** | **review** |
| bureau-contradiction | review [bureau_call] | review | review | review | review |
| clean-repeat-buyer | approve [approve_fast_path] | approve [approve_fast_path] | approve [approve_fast_path] | approve [approve_fast_path] | **step_up (2/3)** |
| stolen-card-pattern | decline [decline_fast_path] | decline [decline_fast_path] | decline [decline_fast_path] | **review** | decline [decline_fast_path] (2/3) |
| thin-file-new-customer | step_up [bureau_call] | step_up | step_up (2/3) | **review** | **review** |

Agreement vs expected — mock 6/6, real 5/6, llm 3/6, llm-local 3/6

## checkout — question-level answers

| scenario | question | mock | real | llm | llm-local |
|---|---|---|---|---|---|
| ambiguous-checkout | fraud_signal_strength | 1.36 c0.58 | 2.48 c0.56 | 2.07 c0.26 | 2.05 c0.20 |
| ambiguous-checkout | profile_consistency | 0.64 | 0.73 | 0.79 | 0.54 |
| ambiguous-checkout | basket_anomaly | 0.51 | 0.78 | 0.88 | 0.44 |
| ambiguous-checkout | risk_band | ambiguous 0.44 | ambiguous 0.35 (2/3) | ambiguous 0.16 | ambiguous 0.18 |
| ambiguous-checkout | bureau_consistent_with_history | 0.57 | 0.59 | 0.70 | 0.54 |
| ambiguous-checkout | affordability_signal | 1.48 c0.42 | 2.90 c0.90 | 2.02 c0.20 | 1.71 c0.12 |
| ambiguous-checkout | final_action | step_up 0.18 | review 0.57 | step_up 0.16 | step_up 0.12 |
| bopis-edge | fraud_signal_strength | 1.05 c0.60 | 1.97 c0.64 | 1.84 c0.25 | 1.95 c0.18 |
| bopis-edge | profile_consistency | 0.79 | 0.82 | 0.88 | 0.75 |
| bopis-edge | basket_anomaly | 0.27 | 0.80 | 0.71 | 0.58 |
| bopis-edge | risk_band | clear 0.32 | ambiguous 0.18 | ambiguous 0.14 | ambiguous 0.12 |
| bopis-edge | bureau_consistent_with_history | 0.77 | 0.56 | 0.74 | 0.52 |
| bopis-edge | affordability_signal | 1.18 c0.66 | 2.74 c0.74 | 1.67 c0.18 | 1.74 c0.11 |
| bopis-edge | final_action | approve 0.72 | review 0.45 | step_up 0.13 | review 0.11 |
| bureau-contradiction | fraud_signal_strength | 0.44 c0.74 | 1.04 c0.45 | 1.65 c0.23 | 1.59 c0.17 |
| bureau-contradiction | profile_consistency | 0.88 | 0.87 | 0.91 | 0.90 |
| bureau-contradiction | basket_anomaly | 0.62 | 0.54 | 0.87 | 0.25 |
| bureau-contradiction | risk_band | ambiguous 0.38 | ambiguous 0.22 | ambiguous 0.11 | ambiguous 0.14 (2/3) |
| bureau-contradiction | bureau_consistent_with_history | 0.14 | 0.51 | 0.75 | 0.33 |
| bureau-contradiction | affordability_signal | 2.52 c0.56 | 2.99 c0.99 | 2.69 c0.49 | 1.86 c0.08 |
| bureau-contradiction | final_action | review 0.35 | review 0.71 | review 0.17 | review 0.08 (2/3) |
| clean-repeat-buyer | fraud_signal_strength | 0.18 c0.84 | 0.01 c0.99 | 0.09 c0.81 | 0.42 c0.49 |
| clean-repeat-buyer | profile_consistency | 0.97 | 0.90 | 0.96 | 0.95 |
| clean-repeat-buyer | basket_anomaly | 0.09 | 0.07 | 0.06 | 0.08 |
| clean-repeat-buyer | risk_band | clear 0.87 | clear 1.00 | clear 0.72 | clear 0.56 |
| clean-repeat-buyer | bureau_consistent_with_history | — | — | — | 0.95 |
| clean-repeat-buyer | affordability_signal | — | — | — | 0.21 c0.60 |
| clean-repeat-buyer | final_action | — | — | — | approve 0.57 |
| stolen-card-pattern | fraud_signal_strength | 3.31 c0.72 | 3.93 c0.94 | 3.75 c0.62 | 2.88 c0.24 |
| stolen-card-pattern | profile_consistency | 0.11 | 0.15 | 0.09 | 0.05 |
| stolen-card-pattern | basket_anomaly | 0.92 | 0.91 | 0.94 | 0.66 |
| stolen-card-pattern | risk_band | suspicious 0.79 | suspicious 1.00 | suspicious 0.62 | suspicious 0.67 |
| stolen-card-pattern | bureau_consistent_with_history | — | — | 0.78 | 0.25 |
| stolen-card-pattern | affordability_signal | — | — | 2.49 c0.33 | 2.60 c0.42 |
| stolen-card-pattern | final_action | — | — | decline 0.35 | decline 0.19 |
| thin-file-new-customer | fraud_signal_strength | 1.24 c0.55 | 1.95 c0.76 | 1.97 c0.27 | 1.98 c0.20 |
| thin-file-new-customer | profile_consistency | 0.71 | 0.65 | 0.70 | 0.35 |
| thin-file-new-customer | basket_anomaly | 0.38 | 0.41 | 0.24 | 0.38 |
| thin-file-new-customer | risk_band | ambiguous 0.41 | suspicious 0.43 | ambiguous 0.18 | ambiguous 0.13 |
| thin-file-new-customer | bureau_consistent_with_history | 0.68 | 0.84 | 0.78 | 0.54 |
| thin-file-new-customer | affordability_signal | 1.61 c0.52 | 2.12 c0.57 | 1.46 c0.17 | 1.70 c0.15 |
| thin-file-new-customer | final_action | step_up 0.55 | step_up 0.56 | step_up 0.15 | step_up 0.12 |

## triage — decisions

| scenario | expected | mock | real | llm | llm-local |
|---|---|---|---|---|---|
| ambiguous-failure | needs_human | needs_human | needs_human | needs_human | needs_human |
| bad-test | fix_test | fix_test | **requeue_environment** | **needs_human** | **requeue_environment (2/3)** |
| environment-drift | requeue_environment | requeue_environment | requeue_environment | **needs_human** | **needs_human** |
| error-contract-regression | file_regression_p1 | file_regression_p1 | **file_regression_p2** | **needs_human** | **needs_human** |
| infra-outage | restart_infra | restart_infra | restart_infra | **needs_human** | restart_infra (2/3) |
| known-flake | auto_retry | auto_retry | **fix_test** | **needs_human** | **fix_test** |

Agreement vs expected — mock 6/6, real 3/6, llm 1/6, llm-local 2/6

## triage — question-level answers

| scenario | question | mock | real | llm | llm-local |
|---|---|---|---|---|---|
| ambiguous-failure | is_known_flake_pattern | 0.52 | 0.12 | 0.06 | 0.11 |
| ambiguous-failure | asserts_error_contract | 0.61 | 0.83 | 0.94 | 0.94 |
| ambiguous-failure | plausibly_from_commit | 0.44 | 0.79 | 0.93 | 0.84 |
| ambiguous-failure | failure_category | real_regression 0.24 | real_regression 0.85 | real_regression 0.49 | real_regression 0.42 |
| ambiguous-failure | regression_severity | 0.98 c0.11 | 1.43 c0.35 | 1.10 c0.40 | 1.10 c0.24 |
| bad-test | is_known_flake_pattern | 0.18 | 0.05 | 0.06 | 0.05 |
| bad-test | asserts_error_contract | 0.31 | 0.02 | 0.02 | 0.00 |
| bad-test | plausibly_from_commit | 0.05 | 0.90 | 0.86 | 0.93 |
| bad-test | failure_category | bad_test 0.66 | environment 0.83 | bad_test 0.24 | environment 0.59 (2/3) |
| bad-test | regression_severity | 0.44 c0.58 | 0.41 c0.39 | 0.96 c0.29 | 0.11 c0.40 |
| environment-drift | is_known_flake_pattern | 0.41 | 0.06 | 0.04 | 0.08 |
| environment-drift | asserts_error_contract | 0.22 | 0.38 | 0.47 | 0.94 |
| environment-drift | plausibly_from_commit | 0.11 | 0.06 | 0.02 | 0.09 |
| environment-drift | failure_category | environment 0.73 | environment 0.91 | environment 0.28 | environment 0.17 (2/3) |
| environment-drift | regression_severity | 0.28 c0.70 | 1.67 c0.50 | 1.49 c0.20 | 0.72 c0.08 |
| error-contract-regression | is_known_flake_pattern | 0.06 | 0.04 | 0.04 | 0.07 |
| error-contract-regression | asserts_error_contract | 0.94 | 0.97 | 0.98 | 0.96 |
| error-contract-regression | plausibly_from_commit | 0.87 | 0.65 | 0.88 | 0.86 |
| error-contract-regression | failure_category | real_regression 0.78 | real_regression 0.72 | real_regression 0.34 | real_regression 0.50 |
| error-contract-regression | regression_severity | 1.62 c0.71 | 1.04 c0.92 | 1.07 c0.31 | 1.00 c0.48 |
| infra-outage | is_known_flake_pattern | 0.55 | 0.53 | 0.61 | 0.60 |
| infra-outage | asserts_error_contract | 0.09 | 0.05 | 0.05 | 0.01 |
| infra-outage | plausibly_from_commit | 0.04 | 0.40 | 0.66 | 0.17 |
| infra-outage | failure_category | infra 0.81 | infra 0.98 | infra 0.46 | infra 0.69 |
| infra-outage | regression_severity | 0.35 c0.69 | 1.84 c0.77 | 1.56 c0.24 | 1.09 c0.11 |
| known-flake | is_known_flake_pattern | 0.93 | 0.90 | 0.91 | 0.94 |
| known-flake | asserts_error_contract | 0.12 | 0.82 | 0.92 | 0.84 |
| known-flake | plausibly_from_commit | 0.08 | 0.15 | 0.19 | 0.10 |
| known-flake | failure_category | infra 0.62 | bad_test 0.88 | bad_test 0.17 | bad_test 0.55 |
| known-flake | regression_severity | 0.21 c0.77 | 1.71 c0.57 | 1.70 c0.38 | 0.81 c0.00 |

