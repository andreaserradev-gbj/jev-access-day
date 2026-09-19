# Provider comparison — results/2026-09-19-evidence-v2

Offline from persisted run-*.json (mock column = anchor: mock answers are engineered to pass every expectation).

## checkout — decisions

| scenario | expected | mock | real |
|---|---|---|---|
| ambiguous-checkout | review [bureau_call] | review | review |
| bopis-edge-v2 | approve [bureau_call] | approve | **review** |
| bopis-edge | approve [bureau_call] | approve | **review** |
| bureau-contradiction | review [bureau_call] | review | review |
| clean-repeat-buyer | approve [approve_fast_path] | approve [approve_fast_path] | approve [approve_fast_path] |
| stolen-card-pattern | decline [decline_fast_path] | decline [decline_fast_path] | decline [decline_fast_path] |
| thin-file-new-customer | step_up [bureau_call] | step_up | step_up (2/3) |

Agreement vs expected — mock 7/7, real 5/7

## checkout — question-level answers

| scenario | question | mock | real |
|---|---|---|---|
| ambiguous-checkout | fraud_signal_strength | 1.36 c0.58 | 2.41 c0.58 |
| ambiguous-checkout | profile_consistency | 0.64 | 0.73 |
| ambiguous-checkout | basket_anomaly | 0.51 | 0.77 |
| ambiguous-checkout | risk_band | ambiguous 0.44 | ambiguous 0.36 |
| ambiguous-checkout | bureau_consistent_with_history | 0.57 | 0.60 |
| ambiguous-checkout | affordability_signal | 1.48 c0.42 | 2.90 c0.90 |
| ambiguous-checkout | final_action | step_up 0.18 | review 0.63 |
| bopis-edge-v2 | fraud_signal_strength | 1.05 c0.60 | 2.02 c0.66 |
| bopis-edge-v2 | profile_consistency | 0.79 | 0.82 |
| bopis-edge-v2 | basket_anomaly | 0.27 | 0.81 |
| bopis-edge-v2 | risk_band | clear 0.32 | ambiguous 0.22 |
| bopis-edge-v2 | bureau_consistent_with_history | 0.77 | 0.55 |
| bopis-edge-v2 | affordability_signal | 1.18 c0.66 | 2.77 c0.77 |
| bopis-edge-v2 | final_action | approve 0.72 | review 0.46 |
| bopis-edge | fraud_signal_strength | 1.05 c0.60 | 2.02 c0.64 |
| bopis-edge | profile_consistency | 0.79 | 0.81 |
| bopis-edge | basket_anomaly | 0.27 | 0.81 |
| bopis-edge | risk_band | clear 0.32 | ambiguous 0.21 |
| bopis-edge | bureau_consistent_with_history | 0.77 | 0.56 |
| bopis-edge | affordability_signal | 1.18 c0.66 | 2.77 c0.77 |
| bopis-edge | final_action | approve 0.72 | review 0.42 |
| bureau-contradiction | fraud_signal_strength | 0.44 c0.74 | 0.99 c0.38 |
| bureau-contradiction | profile_consistency | 0.88 | 0.87 |
| bureau-contradiction | basket_anomaly | 0.62 | 0.54 |
| bureau-contradiction | risk_band | ambiguous 0.38 | ambiguous 0.21 |
| bureau-contradiction | bureau_consistent_with_history | 0.14 | 0.50 |
| bureau-contradiction | affordability_signal | 2.52 c0.56 | 2.98 c0.98 |
| bureau-contradiction | final_action | review 0.35 | review 0.73 |
| clean-repeat-buyer | fraud_signal_strength | 0.18 c0.84 | 0.02 c0.99 |
| clean-repeat-buyer | profile_consistency | 0.97 | 0.90 |
| clean-repeat-buyer | basket_anomaly | 0.09 | 0.06 |
| clean-repeat-buyer | risk_band | clear 0.87 | clear 1.00 |
| clean-repeat-buyer | bureau_consistent_with_history | — | — |
| clean-repeat-buyer | affordability_signal | — | — |
| clean-repeat-buyer | final_action | — | — |
| stolen-card-pattern | fraud_signal_strength | 3.31 c0.72 | 3.92 c0.93 |
| stolen-card-pattern | profile_consistency | 0.11 | 0.16 |
| stolen-card-pattern | basket_anomaly | 0.92 | 0.91 |
| stolen-card-pattern | risk_band | suspicious 0.79 | suspicious 1.00 |
| stolen-card-pattern | bureau_consistent_with_history | — | — |
| stolen-card-pattern | affordability_signal | — | — |
| stolen-card-pattern | final_action | — | — |
| thin-file-new-customer | fraud_signal_strength | 1.24 c0.55 | 1.92 c0.74 |
| thin-file-new-customer | profile_consistency | 0.71 | 0.65 |
| thin-file-new-customer | basket_anomaly | 0.38 | 0.42 |
| thin-file-new-customer | risk_band | ambiguous 0.41 | suspicious 0.41 |
| thin-file-new-customer | bureau_consistent_with_history | 0.68 | 0.85 |
| thin-file-new-customer | affordability_signal | 1.61 c0.52 | 2.13 c0.58 |
| thin-file-new-customer | final_action | step_up 0.55 | step_up 0.58 |

## prreview — decisions

| scenario | expected | mock | real |
|---|---|---|---|
| direct-ssrf-untrusted | reject | reject | reject |
| gray-zone-reachable-admin | approve | approve [needs_llm_review ⇡approve@0.71] | approve [needs_llm_review ⇡approve@0.71] |
| major-runtime-breaking-v2 | approve | approve [needs_llm_review ⇡approve@0.72] | **reject** |
| major-runtime-breaking | needs_human | needs_human [needs_llm_review ⇡reject@0.55] | **reject** |
| minor-transitive-safe | approve | approve | approve |
| patch-lockfile-only | approve | approve | approve |
| unsound-lockfile-drift | reject | reject | reject (2/3) |

Agreement vs expected — mock 7/7, real 5/7

## prreview — question-level answers

| scenario | question | mock | real |
|---|---|---|---|
| direct-ssrf-untrusted | attack_path_exposure | direct 0.87 | direct 1.00 |
| direct-ssrf-untrusted | semver_triviality | trivial 0.76 | trivial 1.00 |
| direct-ssrf-untrusted | runtime_code_touched | 0.12 | 0.06 |
| direct-ssrf-untrusted | change_soundness | sound 0.80 | sound 1.00 |
| gray-zone-reachable-admin | attack_path_exposure | indirect 0.56 | indirect 0.97 |
| gray-zone-reachable-admin | semver_triviality | breaking 0.72 | breaking 0.99 |
| gray-zone-reachable-admin | runtime_code_touched | 0.71 | 0.90 |
| gray-zone-reachable-admin | change_soundness | sound 0.74 | sound 1.00 |
| major-runtime-breaking-v2 | attack_path_exposure | indirect 0.54 | none 0.75 |
| major-runtime-breaking-v2 | semver_triviality | breaking 0.81 | breaking 1.00 |
| major-runtime-breaking-v2 | runtime_code_touched | 0.88 | 0.97 |
| major-runtime-breaking-v2 | change_soundness | sound 0.52 | sloppy 0.79 |
| major-runtime-breaking | attack_path_exposure | indirect 0.54 | none 0.61 |
| major-runtime-breaking | semver_triviality | breaking 0.81 | breaking 1.00 |
| major-runtime-breaking | runtime_code_touched | 0.88 | 0.98 |
| major-runtime-breaking | change_soundness | sound 0.52 | sloppy 0.99 |
| minor-transitive-safe | attack_path_exposure | none 0.71 | none 1.00 |
| minor-transitive-safe | semver_triviality | trivial 0.79 | trivial 1.00 |
| minor-transitive-safe | runtime_code_touched | 0.03 | 0.03 |
| minor-transitive-safe | change_soundness | sound 0.82 | sound 1.00 |
| patch-lockfile-only | attack_path_exposure | none 0.86 | none 0.96 |
| patch-lockfile-only | semver_triviality | trivial 0.84 | trivial 1.00 |
| patch-lockfile-only | runtime_code_touched | 0.02 | 0.03 |
| patch-lockfile-only | change_soundness | sound 0.88 | sound 1.00 |
| unsound-lockfile-drift | attack_path_exposure | none 0.74 | none 0.51 |
| unsound-lockfile-drift | semver_triviality | trivial 0.70 | trivial 0.94 |
| unsound-lockfile-drift | runtime_code_touched | 0.05 | 0.05 |
| unsound-lockfile-drift | change_soundness | sloppy 0.83 | sloppy 1.00 |

## triage — decisions

| scenario | expected | mock | real |
|---|---|---|---|
| ambiguous-failure | needs_human | needs_human | needs_human |
| bad-test-v2 | fix_test | fix_test | **requeue_environment** |
| bad-test | fix_test | fix_test | **requeue_environment** |
| environment-drift | requeue_environment | requeue_environment | requeue_environment |
| error-contract-regression-v2 | file_regression_p1 | file_regression_p1 | **file_regression_p2** |
| error-contract-regression | file_regression_p1 | file_regression_p1 | **file_regression_p2** |
| infra-outage | restart_infra | restart_infra | restart_infra |
| known-flake-v2 | auto_retry | auto_retry | **fix_test** |
| known-flake | auto_retry | auto_retry | **fix_test** |

Agreement vs expected — mock 9/9, real 3/9

## triage — question-level answers

| scenario | question | mock | real |
|---|---|---|---|
| ambiguous-failure | is_known_flake_pattern | 0.52 | 0.12 |
| ambiguous-failure | asserts_error_contract | 0.61 | 0.84 |
| ambiguous-failure | plausibly_from_commit | 0.44 | 0.80 |
| ambiguous-failure | failure_category | real_regression 0.24 | real_regression 0.87 |
| ambiguous-failure | regression_severity | 0.98 c0.11 | 1.42 c0.37 |
| bad-test-v2 | is_known_flake_pattern | 0.18 | 0.05 |
| bad-test-v2 | asserts_error_contract | 0.31 | 0.02 |
| bad-test-v2 | plausibly_from_commit | 0.05 | 0.90 |
| bad-test-v2 | failure_category | bad_test 0.66 | environment 0.86 |
| bad-test-v2 | regression_severity | 0.44 c0.58 | 0.42 c0.37 |
| bad-test | is_known_flake_pattern | 0.18 | 0.05 |
| bad-test | asserts_error_contract | 0.31 | 0.02 |
| bad-test | plausibly_from_commit | 0.05 | 0.90 |
| bad-test | failure_category | bad_test 0.66 | environment 0.80 |
| bad-test | regression_severity | 0.44 c0.58 | 0.36 c0.46 |
| environment-drift | is_known_flake_pattern | 0.41 | 0.06 |
| environment-drift | asserts_error_contract | 0.22 | 0.36 |
| environment-drift | plausibly_from_commit | 0.11 | 0.06 |
| environment-drift | failure_category | environment 0.73 | environment 0.90 |
| environment-drift | regression_severity | 0.28 c0.70 | 1.66 c0.49 |
| error-contract-regression-v2 | is_known_flake_pattern | 0.06 | 0.04 |
| error-contract-regression-v2 | asserts_error_contract | 0.94 | 0.97 |
| error-contract-regression-v2 | plausibly_from_commit | 0.87 | 0.65 |
| error-contract-regression-v2 | failure_category | real_regression 0.78 | real_regression 0.72 |
| error-contract-regression-v2 | regression_severity | 1.62 c0.71 | 1.05 c0.91 |
| error-contract-regression | is_known_flake_pattern | 0.06 | 0.04 |
| error-contract-regression | asserts_error_contract | 0.94 | 0.97 |
| error-contract-regression | plausibly_from_commit | 0.87 | 0.67 |
| error-contract-regression | failure_category | real_regression 0.78 | real_regression 0.74 |
| error-contract-regression | regression_severity | 1.62 c0.71 | 1.05 c0.91 |
| infra-outage | is_known_flake_pattern | 0.55 | 0.55 |
| infra-outage | asserts_error_contract | 0.09 | 0.05 |
| infra-outage | plausibly_from_commit | 0.04 | 0.40 |
| infra-outage | failure_category | infra 0.81 | infra 0.99 |
| infra-outage | regression_severity | 0.35 c0.69 | 1.83 c0.74 |
| known-flake-v2 | is_known_flake_pattern | 0.93 | 0.88 |
| known-flake-v2 | asserts_error_contract | 0.12 | 0.84 |
| known-flake-v2 | plausibly_from_commit | 0.08 | 0.14 |
| known-flake-v2 | failure_category | infra 0.62 | bad_test 0.85 |
| known-flake-v2 | regression_severity | 0.21 c0.77 | 1.81 c0.71 |
| known-flake | is_known_flake_pattern | 0.93 | 0.90 |
| known-flake | asserts_error_contract | 0.12 | 0.82 |
| known-flake | plausibly_from_commit | 0.08 | 0.15 |
| known-flake | failure_category | infra 0.62 | bad_test 0.89 |
| known-flake | regression_severity | 0.21 c0.77 | 1.71 c0.57 |

