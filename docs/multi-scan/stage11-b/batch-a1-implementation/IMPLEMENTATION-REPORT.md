# Stage 11-B Batch A.1 — authorized historical test correction

**Exact approved one-line correction applied; all required tests pass with no skips. Scanner remains disabled by default. Batch B not started; no activation or deployment.**

## Change and hashes

Target: `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/tests/multi-scan/stage2.test.js`, line206.

Original SHA256: `62d3bf92d27c5f8b84edf89985760f1720cc296d84154920fa74967d6eb75ec3`.

Result SHA256: `a7ff4edd000f7882b9d27e4b3c7e709904a5063f0ddf7dbdadd1ff56465ebe4a`.

Applied exactly batch-a1-preview/TEST-PATCH.diff after verifying the pinned original hash and clean applicability. The only change adds `'/ai/multi-scan/session'` to the explicit expected main route array. Strict deep equality, sorted comparison and all other assertions remain intact. Unknown/missing/duplicate routes still fail; auto-discovery, private AI prefix and inactive-import checks are not skipped or weakened and now pass. No route implementation, middleware, authorization, feature flag, controller, frontend or cart code changed.

Approved Batch A router SHA remains `469c88c14c7472b59aa145e74c785d8ec85adbd1540a8be3fcffd0f98cd99836`.

## Validation results

| Required check | Passed | Failed | Skipped |
|---|---:|---:|---:|
| Separate Stage2 suite, including route inventory |31|0|0|
| Batch A security suite |28|0|0|
| Full historical suite, including Stage2 |428|0|0|
| Relevant syntax checks |8|0|0|

The separate31-test Stage2 run is also included in the full428 historical suite; it is not an additional set of historical cases. No failure suppression, filtering, cancellation or test edits beyond the approved expectation. All suites used their existing runners and isolated fixtures. Raw Stage2 output: STAGE2.tap. Security: security-run/SECURITY.tap. Full historical summary: historical-regressions/summary.json and nested TAP/log outputs. TEST-RESULTS.json consolidates all counts and individual historical suite paths. APPLICATION.json lists the eight syntax checks (corrected test, router, five existing auth modules, existing security test).

Executed commands:

```text
node --check <each of the eight paths listed in APPLICATION.json>
node tests/multi-scan/stage2.test.js
python3 tests/multi-scan/stage11/run-auth-session.py docs/multi-scan/stage11-b/batch-a1-implementation/security-run
python3 scripts/multi-scan/stage10/run-tests.py docs/multi-scan/stage11-b/batch-a1-implementation/historical-regressions
```

Historical and separate Stage2 child processes used disabled flags; security fixtures test enabled behavior only with synthetic configuration in isolated child processes. No application env file or live feature configuration was changed. Real Express/HTTP streams are exercised without opening ports; historical native checks use local pinned model artifacts and generated fixtures, not production data or servers. /tmp artifacts are separately documented.

## Feature-disabled verification

Seven independent flag probes (undefined, false, empty and malformed/unexpected values) all returned503/DISABLED with no-store headers before trusted-source acquisition. Security test24 verified the default router rejects with the main flag false. The main/session strict opt-in gates and missing-provider fail-closed behavior remain unchanged; no keys provisioned or live flag enabled. Existing session registration alone does not activate scanning. Test assertions now correctly include that registered disabled route.

## Integrity and rollback artifact

[INTEGRITY-REPORT.md](INTEGRITY-REPORT.md) confirms106,879 pre-existing files checked: only the approved test changed,106,878 others unchanged, all88 symlink targets unchanged, zero unrelated changes. All32 new files are documentation/evidence/rollback artifacts in this directory, enumerated in INVENTORY.json; no new source/test/module file or protected cache created. Previous docs and all other existing files were preserved.

Before applying the patch, original bytes were exclusively saved as [STAGE2-ORIGINAL.txt](STAGE2-ORIGINAL.txt), matching original SHA `62d3bf92d27c5f8b84edf89985760f1720cc296d84154920fa74967d6eb75ec3`. No prior backup overwritten. No rollback necessary or executed. Any future rollback must restore only this test's exact original bytes from this artifact after verifying current/result SHA and preserving unrelated work. Original SHA must be rechecked afterward; do not reset/clean repositories, remove session implementation, change router or flags, or restore unrelated files. Restoring the old expectation intentionally reinstates its old inventory mismatch against the still-approved Batch A router.

## Remaining integration blockers and stop boundary

This test-only correction resolves the historical inventory mismatch, not scanner integration readiness. Trusted production authorization/model-handle wiring and deployed membership/reseller semantics remain unverified; dedicated scanner key/issuer/audience provisioning is absent; upstream parser/body/error limits, trusted ingress, logging/redaction and distributed rate safeguards still need approval; legacy no-exp JWTs cannot be upgraded; scope-aware Batch B consumers and later frontend memory-session wrapper remain unimplemented. None was bypassed or changed.

Stop after Batch A.1. Do not start Batch B, provision keys, activate flags/scanner, deploy, access production DB/Redis or perform cart operations. Further existing-file modifications require explicit authorization.
