# Integrity audit — PASS within approved scope

Full baseline/after hashing covered107,062 preexisting regular files across all three projects without exclusions or read errors. The sole existing-file change is main routes/order.js, exactly the approved one-route postimage. No files missing. All other existing hashes are unchanged, including all controllers, token utilities, authentication, frontend/payment files, AI project, configuration and previous review/implementation documents.

- Frontend:85,533 protected files,0 changed;75 symlink targets unchanged.
- Main backend:7,237 protected files,1 authorized change;5 symlink targets unchanged.
- AI backend:14,292 protected files,0 changed;8 symlink targets unchanged.

All88 complete symlink target mappings match exactly. Git status delta is solely ` M routes/order.js`; preexisting routes/user.js modification from the recovery batch remains identical. No other existing Git status entry changed.

Generic verify-protected.py exits1/unchanged=false whenever any preexisting file changes. Its output was inspected: only the authorized router delta appears. A separate strict scope audit asserts that exact allowlist, no missing files, identical full symlink maps, expected Git delta and new paths limited to the new isolated test/implementation documentation directory. INTEGRITY-REPORT.json records those passing assertions; this expected audit exit is not a test failure.

Protected current SHA256 values:

- routes/order.js applied: `2a448f501d35157b9c4a11ac3c0a2a21ed476aeb6f8d4d7dceb8064457223bdf`
- routes/user.js unchanged recovery containment: `a8c092ffc22484b7d5cfd0b876ac160a04a2343d12bedea0d39a56a198216ddd`
- routes/multi-scan.js unchanged approved scanner: `469c88c14c7472b59aa145e74c785d8ec85adbd1540a8be3fcffd0f98cd99836`
- tests/multi-scan/stage2.test.js unchanged approved A.1: `a7ff4edd000f7882b9d27e4b3c7e709904a5063f0ddf7dbdadd1ff56465ebe4a`

All source pins rehashed after full scan. The fresh rollback artifact was itself included in the baseline and remained unchanged. Additional final report/audit/inventory files written after AFTER are new files in this same documentation directory; INVENTORY.json records final artifact hashes. No existing source was modified after testing/audit.

Scanner remains disabled by default; neither flag is enabled in inherited/main configuration. No deployment, live database/Redis/provider/cart access, live credential change or scanner activation occurred. Only the one reviewed route containment was implemented.
