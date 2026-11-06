# Isolated security test preparation

Status: **prepared, not executed**. Existing 12/28/428 results belong to the previous completed containment stage and are not claimed as new runs. This review performed source/patch/syntax/integrity checks only. PROFILE-WRITE.test.js.txt provides thirteen concrete synthetic node:test drafts in unapplied diff06. The specs below also cover the containment series, compatibility and missing production-adapter behavior. No scenario authorizes live DB/Redis, a real listener, provider call, customer credential change or cart operation.

## Harness and data

Use explicit owned dependency composition. Never require server.js, legacy router/controller modules or dbconnect normally: imports can initialize real connections. Use a reviewed AST reader or a constrained reader that verifies the entire actual registration and exact argument list, then extract only terminal callbacks into an empty VM context. For future core, compose only synthetic keys and in-memory resolveCurrent/commitProfile implementations. Do not mutate require caches or replace production exports. In-memory Express request/response streams may test prefix/method/trailing-slash handling without opening ports.

Synthetic A/B subject, tenant, parent, cashier/admin/customer and credential/version fixtures must record every read/write/issuance and every mutation of password, digest, showPass, verification, identity, role and membership. Requests never use real identifiers, passwords or keys. Before/after snapshots must demonstrate zero writes when denied. Positive cases assert exact target filters and $set fields, not just HTTP200. Source-binding checks are required because testing an unrelated callback fragment does not prove the real route uses it.

## Required scenarios and expected outcomes

| ID | Setup/input | Expected result and evidence |
| --- | --- | --- |
| T01 forged JWT | Bad-signature decodable token on each four generic/import routes; future core configured with distinct synthetic key | Containment503 before old guard/controller, zero reads/writes. Future core401 before current-state read/commit. No decode fallback. |
| T02 expired JWT | Correct test signature, exp in past; also missing exp, future iat, >900 lifetime, missing sub/store/package/epochs | Containment503; future core401, zero writes. Include HS384, unsigned, wrong issuer/audience/purpose, scanner and legacy email-only credentials. |
| T03 unauthorized password change | Generic self/customer/app payload includes password, passwordHash, showPass, newpassword or recovery token | Containment503 and no handler; future profile400 rejects entire request before write, even for correct verified owner/admin. No partial safe-field write. |
| T04 cross-tenant credential write | Actor A targeting B id/store/reseller, forged claimed B staff; include formerly unscoped superAdmin and warehouse variants | Containment503. Future signed A token with B selectors403; returned B current-state mismatch403; no target write. No email/header-only fallback. |
| T05 cashier escalation | Cashier submits role admin, superAdmin, wholesale, changeStore, accessibility or store status; import role changes | Containment503 on covered routes. Future profile400; future privileged/import replacement403 before any row mutation. A claim role cannot grant current permission. |
| T06 account ownership/login change | _id/email/estoreid/estoreids/resellid/refid or dotted variants; targeted other account | Containment503. Future profile400; signed mismatched subject403. Changing a header, token email or body owner never chooses target. |
| T07 field/operator injection | $set/$unset/$rename, dotted paths, __proto__/constructor/prototype, inherited keys, array/null body, unknown field, mixed safe+unsafe | Future strict profile400 with zero commit. Include nested objects under name/phone and excessive lengths. Error body must not echo payload/secrets. |
| T08 import overwrite | Existing victim row + imported known digest/new email/new role/membership; insert path; duplicate targets; later invalid row | Existing import containment503 before guard or loop, including otherwise legitimate admin. Future profile rejects users array400. Future admin import must validate every row before writes and reject credentials/identity/authority, no upsert or partial earlier-row changes. |
| T09 legitimate self profile | Fresh future credential for exact current active subject+tenant, matching epochs; body name/phone only | Under immediate containment503 is intentional. Future owned core fixture200 {ok:true}, exactly one scoped commit, only normalized name/phone patch. No role/password/email changes. Never describe 01 as preserving profile saves. |
| T10 existing login compatibility | Pin routes/auth.js, controllers/auth.js, app login, legacy middleware; evaluate unchanged login function with explicit fake User/md5/jwt dependencies | Original success token response and wrong-password error stay; no real signing key. Digest-login contract unchanged by containment, though security migration remains required. Old-password change success/wrong-secret predicates retained; no claim legacy login becomes secure. |
| T11 current-state/revocation | Correct signature but missing subject, deleted/inactive account, inactive store/package, missing membership, unknown role, changed credential/auth epoch | Future core403 with no commit; absent resolver/key/schema fields503 or deny. Stale cached/grant data must never become a fallback. |
| T12 atomic race/expiry | Resolve state, then change membership/epoch/store status/profile version or let credential expire before commit | Core rechecks expiry after resolver; adapter transaction/CAS denies expired/stale conditions and returns conflict409 or denied, zero persistent writes. No fake claim that a pre-read alone prevents races. |
| T13 fault sanitization | Resolver/commit throws private error; timeout/abort; unmatched target; wrong key configured or key reuse | Generic503 without stack/queries/secret; no issuance. Commit failure must not be reported success. Adapter bounds/abort and atomic failure handling require their own future tests. |
| T14 no account disclosure | Existing/missing/malformed selectors, absent headers/body, different role/store claims | Reached containment paths return identical503/body; no account query. Global JSON parse/CORS errors may precede handler and retain existing responses. |
| T15 route/source scope | Enumerate before/proposed bindings, old guards and original handlers; compare all untouched bytes | Only approved paths/source blocks differ. Existing recovery503 bindings remain. Global middleware/login/frontend/scanner unchanged. No auth/controller call reachable from terminal-denied chains. |
| T16 unsafe issuer/enrollment | Valid-shaped order selectors, public requested admin role, verification/reactivation/deletion requests | After optional02, all twelve bindings terminal503 with no token/user/store write/side effect. Original signed order token must never authenticate future profile core. |
| T17 membership repair | Synthetic missing primary membership in dedicated-mode GET fallback | After03 no User.updateOne membership assignment; no repaired grant in returned object. Existing promo bookkeeping is separate and pinned. |
| T18 shared-password provisioning | Extracted four original/proposed function branches with owned fake dependencies; new identity vs existing customer | After04 new-account branch409 before User construction/save; no fixed credential issued. Existing-customer branch contract preserved with explicit fixtures; no actual order/cart mutation. |
| T19 payment credential containment | Synthetic provider configuration add/update/delete payloads | After05 three routes503; no model call/provider request. Existing read/pay bindings unchanged, without executing provider calls. |
| T20 scanner/regression | Absent/false/malformed flags, pinned scanner/hash and Stage2 inventory | Scanner stays disabled; run existing isolated flag probes, all28 Batch A checks, twelve prior recovery scenarios and full428 historical tests after approved source changes, plus relevant syntax. No skips/suppression. |

## Prepared future core test mapping

The thirteen tests in PROFILE-WRITE.test.js.txt cover forged/expired JWT, forbidden credential fields, cross-tenant selectors/state, cashier elevation, ownership/login identifiers, operator/prototype injection, import-shaped body, legitimate self write, signed different-subject mismatch, current-state revocation, conflicts/sanitized failures and missing composition/key reuse. They use only explicit fake state and commits. They are drafts and have not been run or installed. They do not replace adapter/issuer/integration tests T10–T20 or prove real DB transaction semantics.

## Post-authorization commands

Run from the main backend with new uniquely named output locations:

```
node --check <each approved changed/new JS file>
python3 tests/multi-scan/stage11/run-auth-session.py <new-security-output-dir>
NODE_ENV=test MULTI_SCAN_ENABLED=false MULTI_SCAN_SESSION_ENABLED=false node tests/multi-scan/stage11/recovery-containment.test.js
NODE_ENV=test MULTI_SCAN_ENABLED=false MULTI_SCAN_SESSION_ENABLED=false ORT_DISABLE_TELEMETRY=1 python3 scripts/multi-scan/stage10/run-tests.py <new-historical-output-dir>
```

Full historical runner includes Stage2's31 tests. After a separately approved installation of06 plus the fake fixture module paths, run its direct node:test file; do not wire production routes or infer missing trusted data from test fixtures. Add approved source-bound containment scenarios before claiming the new candidate implemented/validated. Preserve full TAP/Jest output; no test is skipped to achieve expected counts.
