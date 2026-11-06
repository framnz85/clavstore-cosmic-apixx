# Stage 11-B Batch A.1 — historical route-inventory patch preview

**Justified minimal correction prepared; NOT APPLIED. Existing test remains unchanged and its historical failure is not declared resolved. Scanner remains disabled by default; no feature was activated. Batch B not started.**

## Exact target and failure

Main API test: `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/tests/multi-scan/stage2.test.js`. Current SHA-256: `62d3bf92d27c5f8b84edf89985760f1720cc296d84154920fa74967d6eb75ec3`. Test begins at line199: `route auto-discovery and inactive imports preserve existing registrations`; failing assertion is line206. [TEST-PATCH.diff](TEST-PATCH.diff) is the exact standard unified diff, with one deleted and one added assertion line only. Proposed resulting test SHA-256: `a7ff4edd000f7882b9d27e4b3c7e709904a5063f0ddf7dbdadd1ff56465ebe4a`. Recheck current hash/context and clean diff before any future authorized application; stop on mismatch.

Original assertion:

```javascript
assert.deepEqual(mainPaths.sort(),['/ai/multi-scan/status','/ai/multi-scan/index/status','/ai/multi-scan/scan','/ai/multi-scan/confirm','/ai/multi-scan/index/rebuild'].sort());
```

It compares the sorted `main.stack.filter(l=>l.route).map(l=>l.route.path)` array to an exact sorted five-path list. Actual sorted paths:

```text
/ai/multi-scan/confirm
/ai/multi-scan/index/rebuild
/ai/multi-scan/index/status
/ai/multi-scan/scan
/ai/multi-scan/session
/ai/multi-scan/status
```

The sole addition is `/ai/multi-scan/session`, registered as POST. No expected path is missing, no duplicate path exists, and each original method matches the original router source. Observed inventory is from a fresh read-only router import with both flags absent in an isolated child process; no production server/model/DB imported or started. [EVIDENCE.json](EVIDENCE.json) records actual methods, absence of production imports and the disabled HTTP response.

Reviewed historical evidence: Batch A IMPLEMENTATION-REPORT.md and its historical-regressions/stages2-9/stages2-6/stage2.tap. TAP subtest25 records exactly the added session path, ERR_ASSERTION at line206, and no other path mismatch. Historical totals were427/428 passing; no historical suite was rerun in this preview.

## Approval provenance and original intent

The current router SHA is `469c88c14c7472b59aa145e74c785d8ec85adbd1540a8be3fcffd0f98cd99836`, matching the approved Batch A result. Removing exactly its approved import and session-registration additions reconstructs the byte-identical archived original router (SHA f4948acc53c4e6d6b2029e8896bd8ef21b5e33516a47c31bff44ab7736440c08). The pre-Batch-A route registrations correspond to the old five-path expectation. The added POST is explicitly present in approved batch-a-preview/ROUTE-PATCH.diff. This is verified provenance, not an assumption that a failing test became obsolete.

The test guards more than a route count. It asserts main and AI server route auto-discovery code remains present, their route files exist, main path inventory is exact, all AI route paths retain the private prefix, and imports do not load legacy ai-image/index-builder/embed_helper controllers or dbconnect modules. Those other assertions remain untouched. Since line206 fails first, later assertions in that historical subtest were not reached; require them to pass when the corrected full test runs after authorization. The current non-mutating diagnostic additionally confirms no models/dbconnect imports, but does not claim to execute every historical assertion.

The main inventory assertion is a path/multiplicity compatibility guard; it does not itself prove HTTP methods, middleware order, flags or authorization. Its existing sort ignores registration order. Batch A's dedicated security suite separately covers these boundaries; do not silently broaden or weaken this patch. Updating the explicit inventory to include the approved route preserves exact equality, so unknown, missing or duplicated paths still fail. It does not filter out session, switch to includes/subset matching, increase an allowed count blindly, skip/delete any test or change runtime routes/auth behavior. Three in-memory negative inventory comparisons confirm added-unexpected, missing and duplicated route lists still differ from the proposed expectation.

## Non-mutating validation this preview

- Target/router hashes and original archive provenance verified.
- Current actual six-route inventory inspected with no production imports.
- Proposed exact diff passes `git apply --check`; never applied.
- Proposed test parses via vm.Script syntax construction only; no proposed source execution or module patching.
- Proposed explicit inventory equals actual paths; unknown/missing/duplicate variants fail exact comparison.
- Existing flag-probe request, using real Express/in-memory HTTP streams and both flags absent in an independent diagnostic process, returns503/DISABLED with no-store headers. No port, app server or live configuration change; credentials/keys are not provisioned. Source still requires both main/session flags explicitly true. Registration alone is not activation. Existing trusted-provider/key/parser/ingress/deployment/legacy-token blockers are untouched.

These diagnostics do not count as newly passing historical/security suites. The correction remains unapplied. Full source/symlink/Git integrity results are in [INTEGRITY-REPORT.md](INTEGRITY-REPORT.md).

## Tests after explicit authorization

Before application, capture unique original test bytes plus current SHA/Git/all-file/symlink baseline; recheck the test/router pins, exact patch context and `git apply --check`. Only this test expectation may change under a later A.1 approval. Use independent test-process configuration with both flags absent/false as appropriate; never enable live flags.

1. `node --check tests/multi-scan/stage2.test.js`.
2. `node tests/multi-scan/stage2.test.js`: require31 passing,0 failed/skipped, including original auto-discovery/private-prefix/import assertions. This is a required future result, not a result obtained now.
3. `python3 tests/multi-scan/stage11/run-auth-session.py <new-unique-results-directory>`: require the28 isolated security checks pass, including flag rejection/default-disabled behavior and current authority/tenant boundaries. The launcher uses synthetic configuration only in child processes.
4. `python3 scripts/multi-scan/stage10/run-tests.py <new-unique-results-directory>`: require the complete historical428 pass without rewriting existing runners/tests, with results stored in a new approved documentation/evidence directory. Existing suites use isolated fixtures, /tmp artifacts and pinned local native models; no production data or listening application server.
5. Recheck all existing file hashes: only this approved test line may change relative to the new A.1 application baseline; router SHA above and all five auth modules must remain unchanged. Verify all88 symlink targets, old scanner/frontend/cart/auth/source files, Git status and new cache/evidence paths. Unexpected delta or failure: stop/report; do not repair another existing file.

## Rollback procedure — not executed

At future authorized application time, archive the exact original test bytes in a newly named exclusive rollback artifact, verify SHA `62d3bf92d27c5f8b84edf89985760f1720cc296d84154920fa74967d6eb75ec3`, and preserve all unrelated work. After a failed correction, restore only this test from that approved original-byte artifact (or reverse the exact single-line hunk only after verifying patched SHA `a7ff4edd000f7882b9d27e4b3c7e709904a5063f0ddf7dbdadd1ff56465ebe4a` and unchanged context). Recheck original hash/byte equality, route inventory and relevant tests; the original five-path historical mismatch will intentionally return on rollback while the approved router stays untouched. Do not remove session routes/modules, reset/clean repositories, use blind git restore on untracked files, overwrite prior backups or change flags. No rollback or backup overwrite now.

## Approval boundary

Only a one-line expected-array correction in this exact historical test is proposed. No test/source modification has occurred. Await explicit approval before applying TEST-PATCH.diff. No Batch B, production wiring, key provisioning, frontend, feature activation, deployment, DB/Redis or cart operation is included.
