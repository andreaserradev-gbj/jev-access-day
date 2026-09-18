# Provider comparison — results/2026-09-18-access-day2

Offline from persisted run-*.json (mock column = anchor: mock answers are engineered to pass every expectation).

## dunning — decisions

| scenario | expected | mock | real | llm | llm-local |
|---|---|---|---|---|---|
| account-closed | switch_method_then_retry | switch_method_then_retry (0d) | switch_method_then_retry (0d) | switch_method_then_retry (0d) | switch_method_then_retry (0d) |
| mandate-revoked-no-alt | needs_human | needs_human (0d) | needs_human (0d) | needs_human (0d) | needs_human (0d) |
| mandate-revoked | switch_method_then_retry | switch_method_then_retry (0d) | switch_method_then_retry (0d) | switch_method_then_retry (0d) | switch_method_then_retry (0d) |
| nsf-repeat | pause_spending | pause_spending (0d) | pause_spending (0d) | pause_spending (0d) | **switch_method_then_retry (0d)** |
| nsf-transient | retry_in_3d | retry_in_3d (3d) | retry_in_3d (3d) | retry_in_3d (3d) | retry_in_3d (3d) |
| processor-outage | retry_next_schedule | retry_next_schedule (2d) | retry_next_schedule (2d) | retry_next_schedule (2d) | retry_next_schedule (2d) |

Agreement vs expected — mock 6/6, real 6/6, llm 6/6, llm-local 5/6

## dunning — question-level answers

| scenario | question | mock | real | llm | llm-local |
|---|---|---|---|---|---|
| account-closed | bounce_cause | account_closed 0.82 | account_closed 1.00 | account_closed 0.83 | account_closed 0.74 |
| account-closed | customer_standing | good 0.67 | good 1.00 | good 0.58 | good 0.68 |
| account-closed | retry_worthwhile | 0.02 | 0.08 | 0.05 | 0.02 |
| account-closed | schedule_cascade_risk | low 0.60 | low 0.46 | low 0.20 (2/3) | low 0.09 (2/3) |
| mandate-revoked-no-alt | bounce_cause | mandate_revoked 0.87 | mandate_revoked 1.00 | mandate_revoked 0.83 | mandate_revoked 0.76 |
| mandate-revoked-no-alt | customer_standing | unknown 0.53 | strained 0.32 (2/3) | strained 0.13 | good 0.25 |
| mandate-revoked-no-alt | retry_worthwhile | 0.03 | 0.02 | 0.04 | 0.05 |
| mandate-revoked-no-alt | schedule_cascade_risk | moderate 0.50 | moderate 0.30 | moderate 0.06 | moderate 0.05 (2/3) |
| mandate-revoked | bounce_cause | mandate_revoked 0.90 | mandate_revoked 1.00 | mandate_revoked 0.86 | mandate_revoked 0.89 |
| mandate-revoked | customer_standing | good 0.84 | good 1.00 | good 0.60 | good 0.86 |
| mandate-revoked | retry_worthwhile | 0.04 | 0.03 | 0.05 | 0.02 |
| mandate-revoked | schedule_cascade_risk | low 0.58 | low 0.90 | moderate 0.08 | low 0.37 |
| nsf-repeat | bounce_cause | transient_funds 0.55 | transient_funds 1.00 | transient_funds 0.63 | transient_funds 0.58 |
| nsf-repeat | customer_standing | strained 0.54 | strained 0.97 | strained 0.11 | good 0.29 |
| nsf-repeat | retry_worthwhile | 0.55 | 0.77 | 0.82 | 0.80 |
| nsf-repeat | schedule_cascade_risk | moderate 0.52 | moderate 0.49 | moderate 0.16 | low 0.19 (2/3) |
| nsf-transient | bounce_cause | transient_funds 0.71 | transient_funds 1.00 | transient_funds 0.69 | transient_funds 0.58 |
| nsf-transient | customer_standing | good 0.76 | good 1.00 | good 0.61 | good 0.66 |
| nsf-transient | retry_worthwhile | 0.88 | 0.88 | 0.89 | 0.86 |
| nsf-transient | schedule_cascade_risk | low 0.63 | low 0.54 | low 0.29 | low 0.31 |
| processor-outage | bounce_cause | technical 0.85 | technical 1.00 | technical 0.78 | technical 0.65 |
| processor-outage | customer_standing | good 0.70 | good 1.00 | good 0.62 | good 0.71 |
| processor-outage | retry_worthwhile | 0.90 | 0.93 | 0.93 | 0.90 |
| processor-outage | schedule_cascade_risk | moderate 0.51 | moderate 0.51 | moderate 0.13 (2/3) | low 0.38 |

## prreview — decisions

| scenario | expected | mock | real | llm | llm-local |
|---|---|---|---|---|---|
| direct-ssrf-untrusted | reject | reject | reject | reject (2/3) | reject |
| gray-zone-reachable-admin | approve | approve [needs_llm_review ⇡approve@0.71] | approve [needs_llm_review ⇡approve@0.71] | approve [needs_llm_review ⇡approve@0.71] | approve [needs_llm_review ⇡approve@0.71] |
| major-runtime-breaking | needs_human | needs_human [needs_llm_review ⇡reject@0.55] | **reject** | **reject (2/3)** | needs_human |
| minor-transitive-safe | approve | approve | approve | approve | approve |
| patch-lockfile-only | approve | approve | approve | approve | approve |
| unsound-lockfile-drift | reject | reject | reject | reject (2/3) | **needs_human** |

Agreement vs expected — mock 6/6, real 5/6, llm 5/6, llm-local 5/6

## prreview — question-level answers

| scenario | question | mock | real | llm | llm-local |
|---|---|---|---|---|---|
| direct-ssrf-untrusted | attack_path_exposure | direct 0.87 | direct 1.00 | direct 0.78 | direct 0.81 |
| direct-ssrf-untrusted | semver_triviality | trivial 0.76 | trivial 1.00 | trivial 0.82 | trivial 0.91 |
| direct-ssrf-untrusted | runtime_code_touched | 0.12 | 0.06 | 0.02 | 0.00 |
| direct-ssrf-untrusted | change_soundness | sound 0.80 | sound 1.00 | sound 0.79 | sound 0.90 |
| gray-zone-reachable-admin | attack_path_exposure | indirect 0.56 | indirect 0.97 | indirect 0.58 | none 0.73 |
| gray-zone-reachable-admin | semver_triviality | breaking 0.72 | breaking 0.99 | breaking 0.60 | breaking 0.65 |
| gray-zone-reachable-admin | runtime_code_touched | 0.71 | 0.91 | 0.95 | 0.83 |
| gray-zone-reachable-admin | change_soundness | sound 0.74 | sound 1.00 | sound 0.69 | sound 0.85 |
| major-runtime-breaking | attack_path_exposure | indirect 0.54 | none 0.59 | none 0.57 | direct 0.34 |
| major-runtime-breaking | semver_triviality | breaking 0.81 | breaking 1.00 | breaking 0.78 | breaking 0.90 |
| major-runtime-breaking | runtime_code_touched | 0.88 | 0.98 | 0.97 | 0.98 |
| major-runtime-breaking | change_soundness | sound 0.52 | sloppy 0.99 | sloppy 0.08 | sloppy 0.06 |
| minor-transitive-safe | attack_path_exposure | none 0.71 | none 1.00 | none 0.73 | none 0.80 |
| minor-transitive-safe | semver_triviality | trivial 0.79 | trivial 1.00 | trivial 0.83 | trivial 0.89 |
| minor-transitive-safe | runtime_code_touched | 0.03 | 0.03 | 0.02 | 0.00 |
| minor-transitive-safe | change_soundness | sound 0.82 | sound 1.00 | sound 0.80 | sound 0.81 |
| patch-lockfile-only | attack_path_exposure | none 0.86 | none 0.96 | none 0.68 | none 0.73 |
| patch-lockfile-only | semver_triviality | trivial 0.84 | trivial 1.00 | trivial 0.78 | trivial 0.90 |
| patch-lockfile-only | runtime_code_touched | 0.02 | 0.03 | 0.02 | 0.00 |
| patch-lockfile-only | change_soundness | sound 0.88 | sound 1.00 | sound 0.76 | sound 0.88 |
| unsound-lockfile-drift | attack_path_exposure | none 0.74 | none 0.52 | none 0.51 | direct 0.29 (2/3) |
| unsound-lockfile-drift | semver_triviality | trivial 0.70 | trivial 0.94 | trivial 0.55 | trivial 0.26 (2/3) |
| unsound-lockfile-drift | runtime_code_touched | 0.05 | 0.05 | 0.03 | 0.00 |
| unsound-lockfile-drift | change_soundness | sloppy 0.83 | sloppy 1.00 | sloppy 0.77 | sloppy 0.57 |

