# Exact minimal remediation candidates — NOT APPLIED

These are independent proposed approval batches, not silent additions to Batch B.1. Neither fixes all authorization prerequisites or permits scanner activation. No existing source was edited. PATCH-MANIFEST.json supplies absolute paths, exact current/result SHA256 and clean-apply/syntax evidence. Original CRLF line endings are preserved byte-for-byte outside the changed lines. Full approved router/test hashes remain unchanged.

## S01 — recovery containment, smallest urgent source batch

Target: main routes/user.js. Exact diff:01-RECOVERY-CONTAINMENT.diff (one route-registration line).

Source evidence: public PUT /gratis/forgot-password directly reaches controllers/user.js forgotPassword, which writes a caller-supplied password from email/store selectors without a recovery proof, including global admin fallback. Candidate replaces only that route's controller entry with a fixed503 `{err:"Password recovery is temporarily unavailable."}` response. It does not execute or remove the old controller; other routes/imports remain unchanged. Public route reachability behind actual deployment controls is not tested; missing application-level proof is confirmed in source.

Security impact: stop this specific credential-replacement entry. Explicit product tradeoff: existing password-recovery callers will fail503 until a separately approved authenticated, expiring, single-use, hashed recovery challenge with tenant/account binding, rate limits and replay protection is implemented. This is containment, not a working recovery feature or complete takeover fix; broad user/import/app writes and other reset paths remain dangerous. Do not claim the site is secure after only S01. No blanket global login verifier migration or frontend edits are hidden here.

Required tests after approval: synthetic recovery requests with and without headers/body must503 with exact fixed error; no password/update/controller execution or user enumeration; route method/path and all other registrations unchanged; affected frontend recovery UX explicitly reports unavailable; no unrelated login/registration/POS/cart success change; existing31 Stage2,28 security and428 historical suites plus new fixture containment test. No production requests or services. Existing tests may not cover this legacy route, so add isolated fixture coverage rather than rely only on scanner suites.

Rollback: before authorized edit exclusively archive original routes/user.js bytes and original SHA in manifest. Restore only those bytes after checking current candidate hash/context; preserve unrelated changes. Recheck original SHA and route/fixture tests. Restoring this route reinstates the confirmed unsafe recovery behavior; require explicit security acceptance or keep admission blocked elsewhere under its own authorization. Do not automatically undo containment just to make an old recovery UX succeed. No rollback now.

## S02 — connection-log redaction, separate optional source batch

Target: main dbconnect/gratis.js. Exact diff:02-CONNECTION-LOG-REDACTION.diff (two log lines).

Source evidence: bootstrap interpolates the configured database URI in its startup log and raw caught exception in error log. Proposed strings contain no URI/credentials/exception and accurately say initialization requested rather than falsely claiming an awaited connection. No createConnection/options/export/connection-count change. Existing asynchronous connection failure/event handling is not fixed by this logging-only patch; other database bootstraps/log sinks remain separate review scope. No live URI was read to prepare this patch.

Required tests: syntax; a later isolated bootstrap harness with declared fake connector captures log arguments for both synchronous success/failure without loading a production model/database; ensure no sentinel URI/error details, exactly one initialization request and same exported connection identity/undefined-on-caught-failure behavior. Disabled scanner/provider imports must not initialize DB; existing regressions remain green. Avoid monkeypatch/module-cache injection; a future pure bootstrap extraction would need its own exact reviewed code if the fixture harness cannot exercise this legacy singleton safely. Current preview did only syntax construction, not bootstrap execution.

Rollback: exclusive byte archive of dbconnect/gratis.js at the pinned original SHA before any authorized edit; restore this file alone and verify exact original hash, model/connection identity behavior and redaction implications. Restoring would reintroduce URI-bearing logging; do not restore silently. Do not stop/close/recreate shared DB connections or overwrite other batches' backups.

## Deliberately withheld broader diffs

Write-path remediation needs verified identity, tenant ownership and a server-owned field allowlist, not merely authCheck/adminGratisCheck or a new disabled column in a mass-assignable User schema. Proposed independent policy schema and migration are specified in STATUS-REVOCATION.md, not represented as existing fields. Full protected-writer/status/epoch/composition hunks require policy and caller compatibility decisions before an exact safe implementation patch can be finalized. No speculative new auth middleware, login refresh flow, global route shutdown, automatic backfill or production-connection wiring is supplied. Do not apply the earlier B.1 adapter v2 as though it resolves scoped grants/version checks; see AUTHORIZATION-LIFECYCLE.md.
