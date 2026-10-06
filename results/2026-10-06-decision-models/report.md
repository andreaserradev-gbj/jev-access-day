# Eval report — 2026-10-06

- Providers: nimble, tev1, clef-flash, real
- Runs per fixture: 3
- Domains: triage, checkout, prreview, dunning
- Records: 348 (schema v1)

## Results

| provider | domain | scored | pass | fail | pass rate | Brier | ECE | p50 ms | p95 ms | tok in | tok out | calls | cost USD | violations |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| clef-flash| checkout| 21| 12| 9| 57.1%| 0.271| 0.392| 4245| 4908| 32229| 0| 36| n/a| 0| 
| clef-flash| dunning| 18| 18| 0| 100.0%| 0.019| 0.126| 1919| 1965| 15684| 0| 18| n/a| 0| 
| clef-flash| prreview| 21| 9| 12| 42.9%| 0.202| 0.182| 1844| 2142| 17391| 0| 21| n/a| 0| 
| clef-flash| triage| 27| 6| 21| 22.2%| 0.242| 0.315| 1947| 2423| 24810| 0| 27| n/a| 0| 
| nimble| checkout| 21| 12| 9| 57.1%| 0.184| 0.143| 6733| 7136| 105735| 165| 36| n/a| 0| 
| nimble| dunning| 18| 18| 0| 100.0%| 0.014| 0.080| 3551| 5436| 58494| 90| 18| n/a| 0| 
| nimble| prreview| 21| 18| 3| 85.7%| 0.108| 0.208| 3500| 3712| 65796| 105| 21| n/a| 0| 
| nimble| triage| 27| 6| 21| 22.2%| 0.311| 0.402| 4201| 4342| 110535| 162| 27| n/a| 0| 
| real| checkout| 21| 13| 8| 61.9%| 0.168| 0.307| 856| 1216| 33096| 3181| 34| $0.001390| 0| 
| real| dunning| 18| 18| 0| 100.0%| 0.000| 0.000| 245| 331| 19326| 2802| 18| $0.000812| 0| 
| real| prreview| 21| 13| 8| 61.9%| 0.171| 0.227| 262| 313| 22251| 2883| 21| $0.000935| 0| 
| real| triage| 27| 14| 13| 51.9%| 0.342| 0.371| 254| 343| 26346| 3492| 27| $0.001107| 0| 
| tev1| checkout| 21| 9| 12| 42.9%| 0.347| 0.522| 6076| 6441| 109482| 177| 39| n/a| 0| 
| tev1| dunning| 18| 15| 3| 83.3%| 0.162| 0.145| 3064| 4360| 55758| 90| 18| n/a| 0| 
| tev1| prreview| 21| 18| 3| 85.7%| 0.130| 0.291| 3053| 3094| 62604| 105| 21| n/a| 0| 
| tev1| triage| 27| 6| 21| 22.2%| 0.306| 0.387| 3694| 3797| 105405| 162| 27| n/a| 0| 

## Disagreements vs expectations.json

### clef-flash/checkout

- bopis-edge-v2 (action step_up ≠ approve)
- bopis-edge (action review ≠ approve)
- thin-file-new-customer (action review ≠ step_up)
- bopis-edge-v2 (action step_up ≠ approve)
- bopis-edge (action review ≠ approve)
- thin-file-new-customer (action review ≠ step_up)
- bopis-edge-v2 (action step_up ≠ approve)
- bopis-edge (action review ≠ approve)
- thin-file-new-customer (action review ≠ step_up)

### clef-flash/prreview

- direct-ssrf-untrusted (resolved needs_human ≠ reject)
- gray-zone-reachable-admin (resolved needs_human ≠ approve)
- major-runtime-breaking-v2 (resolved needs_human ≠ approve)
- unsound-lockfile-drift (resolved needs_human ≠ reject)
- direct-ssrf-untrusted (resolved needs_human ≠ reject)
- gray-zone-reachable-admin (resolved needs_human ≠ approve)
- major-runtime-breaking-v2 (resolved needs_human ≠ approve)
- unsound-lockfile-drift (resolved needs_human ≠ reject)
- direct-ssrf-untrusted (resolved needs_human ≠ reject)
- gray-zone-reachable-admin (resolved needs_human ≠ approve)
- major-runtime-breaking-v2 (resolved needs_human ≠ approve)
- unsound-lockfile-drift (resolved needs_human ≠ reject)

### clef-flash/triage

- bad-test-v2 (action needs_human ≠ fix_test)
- bad-test (action needs_human ≠ fix_test)
- environment-drift (action needs_human ≠ requeue_environment)
- error-contract-regression-v2 (action needs_human ≠ file_regression_p1)
- error-contract-regression (action needs_human ≠ file_regression_p1)
- known-flake-v2 (action needs_human ≠ auto_retry)
- known-flake (action needs_human ≠ auto_retry)
- bad-test-v2 (action needs_human ≠ fix_test)
- bad-test (action needs_human ≠ fix_test)
- environment-drift (action needs_human ≠ requeue_environment)
- error-contract-regression-v2 (action needs_human ≠ file_regression_p1)
- error-contract-regression (action needs_human ≠ file_regression_p1)
- known-flake-v2 (action needs_human ≠ auto_retry)
- known-flake (action needs_human ≠ auto_retry)
- bad-test-v2 (action needs_human ≠ fix_test)
- bad-test (action needs_human ≠ fix_test)
- environment-drift (action needs_human ≠ requeue_environment)
- error-contract-regression-v2 (action needs_human ≠ file_regression_p1)
- error-contract-regression (action needs_human ≠ file_regression_p1)
- known-flake-v2 (action needs_human ≠ auto_retry)
- known-flake (action needs_human ≠ auto_retry)

### nimble/checkout

- bopis-edge-v2 (action review ≠ approve)
- bopis-edge (action review ≠ approve)
- thin-file-new-customer (action review ≠ step_up)
- bopis-edge-v2 (action review ≠ approve)
- bopis-edge (action review ≠ approve)
- thin-file-new-customer (action review ≠ step_up)
- bopis-edge-v2 (action review ≠ approve)
- bopis-edge (action review ≠ approve)
- thin-file-new-customer (action review ≠ step_up)

### nimble/prreview

- major-runtime-breaking-v2 (resolved needs_human ≠ approve)
- major-runtime-breaking-v2 (resolved needs_human ≠ approve)
- major-runtime-breaking-v2 (resolved needs_human ≠ approve)

### nimble/triage

- bad-test-v2 (action needs_human ≠ fix_test)
- bad-test (action requeue_environment ≠ fix_test)
- environment-drift (action needs_human ≠ requeue_environment)
- error-contract-regression-v2 (action needs_human ≠ file_regression_p1)
- error-contract-regression (action needs_human ≠ file_regression_p1)
- known-flake-v2 (action needs_human ≠ auto_retry)
- known-flake (action needs_human ≠ auto_retry)
- bad-test-v2 (action needs_human ≠ fix_test)
- bad-test (action requeue_environment ≠ fix_test)
- environment-drift (action needs_human ≠ requeue_environment)
- error-contract-regression-v2 (action needs_human ≠ file_regression_p1)
- error-contract-regression (action needs_human ≠ file_regression_p1)
- known-flake-v2 (action needs_human ≠ auto_retry)
- known-flake (action needs_human ≠ auto_retry)
- bad-test-v2 (action needs_human ≠ fix_test)
- bad-test (action requeue_environment ≠ fix_test)
- environment-drift (action needs_human ≠ requeue_environment)
- error-contract-regression-v2 (action needs_human ≠ file_regression_p1)
- error-contract-regression (action needs_human ≠ file_regression_p1)
- known-flake-v2 (action needs_human ≠ auto_retry)
- known-flake (action needs_human ≠ auto_retry)

### real/checkout

- bopis-edge-v2 (action step_up ≠ approve)
- bopis-edge (action review ≠ approve)
- bopis-edge-v2 (route approve_fast_path ≠ bureau_call)
- bopis-edge (action review ≠ approve)
- thin-file-new-customer (action review ≠ step_up)
- bopis-edge-v2 (route approve_fast_path ≠ bureau_call)
- bopis-edge (action review ≠ approve)
- thin-file-new-customer (action review ≠ step_up)

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

- bad-test (action requeue_environment ≠ fix_test)
- error-contract-regression (action file_regression_p2 ≠ file_regression_p1)
- known-flake-v2 (action fix_test ≠ auto_retry)
- known-flake (action fix_test ≠ auto_retry)
- bad-test (action requeue_environment ≠ fix_test)
- error-contract-regression (action file_regression_p2 ≠ file_regression_p1)
- known-flake-v2 (action fix_test ≠ auto_retry)
- known-flake (action fix_test ≠ auto_retry)
- bad-test-v2 (action needs_human ≠ fix_test)
- bad-test (action requeue_environment ≠ fix_test)
- error-contract-regression (action file_regression_p2 ≠ file_regression_p1)
- known-flake-v2 (action fix_test ≠ auto_retry)
- known-flake (action fix_test ≠ auto_retry)

### tev1/checkout

- bopis-edge-v2 (action review ≠ approve)
- bopis-edge (action review ≠ approve)
- clean-repeat-buyer (route bureau_call ≠ approve_fast_path)
- thin-file-new-customer (action review ≠ step_up)
- bopis-edge-v2 (action review ≠ approve)
- bopis-edge (action review ≠ approve)
- clean-repeat-buyer (route bureau_call ≠ approve_fast_path)
- thin-file-new-customer (action review ≠ step_up)
- bopis-edge-v2 (action review ≠ approve)
- bopis-edge (action review ≠ approve)
- clean-repeat-buyer (route bureau_call ≠ approve_fast_path)
- thin-file-new-customer (action review ≠ step_up)

### tev1/dunning

- nsf-transient (action retry_next_schedule ≠ retry_in_3d)
- nsf-transient (action retry_next_schedule ≠ retry_in_3d)
- nsf-transient (action retry_next_schedule ≠ retry_in_3d)

### tev1/prreview

- major-runtime-breaking-v2 (resolved needs_human ≠ approve)
- major-runtime-breaking-v2 (resolved needs_human ≠ approve)
- major-runtime-breaking-v2 (resolved needs_human ≠ approve)

### tev1/triage

- bad-test-v2 (action needs_human ≠ fix_test)
- bad-test (action needs_human ≠ fix_test)
- environment-drift (action needs_human ≠ requeue_environment)
- error-contract-regression-v2 (action needs_human ≠ file_regression_p1)
- error-contract-regression (action needs_human ≠ file_regression_p1)
- known-flake-v2 (action needs_human ≠ auto_retry)
- known-flake (action needs_human ≠ auto_retry)
- bad-test-v2 (action needs_human ≠ fix_test)
- bad-test (action needs_human ≠ fix_test)
- environment-drift (action needs_human ≠ requeue_environment)
- error-contract-regression-v2 (action needs_human ≠ file_regression_p1)
- error-contract-regression (action needs_human ≠ file_regression_p1)
- known-flake-v2 (action needs_human ≠ auto_retry)
- known-flake (action needs_human ≠ auto_retry)
- bad-test-v2 (action needs_human ≠ fix_test)
- bad-test (action needs_human ≠ fix_test)
- environment-drift (action needs_human ≠ requeue_environment)
- error-contract-regression-v2 (action needs_human ≠ file_regression_p1)
- error-contract-regression (action needs_human ≠ file_regression_p1)
- known-flake-v2 (action needs_human ≠ auto_retry)
- known-flake (action needs_human ≠ auto_retry)

## Notes

- Cost for `jev-latest` priced at $0.042/Mtok input, output free (docs.typesafe.ai/models, verified 2026-09-18).
- Calibration columns (Brier/ECE) score stated confidence against fixture outcomes; interpret per the plan: fixture scoring is agreement, the synthetic probe battery carries the calibration claim.
