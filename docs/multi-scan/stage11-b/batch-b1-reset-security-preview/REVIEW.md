# Emergency password reset security review — Batch B.1-S2

**Review and patch preview complete. No existing source file modified, no patch applied, no deployment/activation or live attack.** Three required baseline hashes match; SOURCE-EVIDENCE.json pins current routes/middleware/controllers/models/server and relevant frontend wrapper. Earlier forgot-only containment remains unapplied; the prior implementation stopped correctly at the reset-route blocker.

## Verified findings

[VERIFIED-ANALYSIS.md](VERIFIED-ANALYSIS.md) gives the complete route/middleware inventory and source evidence. The forgot handler has no authentication/recovery proof and can fall back to an unscoped admin-email update. Reset uses jwt-decode through authCheck, not signature/expiry verification; adminGratisCheck permits admin/moderator/cashier and checks a claimed email plus selected primary store. resetPassword writes a shared fixed password for target id plus that selected store. No independent privilege/recovery/session proof or automatic credential/session revocation was found.

The same-selected-store predicates constrain a naïve genuine cashier-A to target-B attempt; arbitrary cross-store success is not asserted. Unverified claimed staff identity undermines that check, and forgot's admin fallback is directly unscoped. Source weaknesses are confirmed, but no production reachability, records or exploitation tested. Server JSON/CORS middleware and current-row existence are not trusted authentication.

Other generic main/app profile, update-customer and import writers can modify writable credential fields under weak guards. Option A will not close these equivalent credential-write surfaces. Normal password change requires the old secret but the full identity/hash/response/revocation flow is not certified secure. No global login/auth fix is implied.

## Option A — exact two-route immediate containment

Only proposed existing target: `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/routes/user.js`.

Current SHA256: `0dd77b60b993926406bfdc2ebeee92dff90966e92a3c955785313df95460516e`.

Proposed SHA256: `a8c092ffc22484b7d5cfd0b876ac160a04a2343d12bedea0d39a56a198216ddd`.

Exact unapplied [OPTION-A.diff](OPTION-A.diff) replaces both recovery/reset registrations with terminal inline callbacks returning HTTP503 and exactly:

```json
{"err":"Password recovery is temporarily unavailable."}
```

Both original controller functions/imports remain in place; neither is registered on those two paths afterward. Reset's old authCheck/adminGratisCheck chain is replaced on THIS disabled route only, so a rejected/expired/forged/no-token/cashier request cannot trigger its DB guard/reset handler. This is unconditional route denial, not weakened successful authentication. No passwords or recovery credentials are read/written/issued by these callbacks and no account existence branch exists. Startup imports remain unchanged and may still initialize legacy model connections in a real app; preview/test harness must not import them.

Other18 user-route bindings and all remaining source bytes reconstruct exactly; normal login files and password-change registration/controller unchanged. Original CRLF preserved. git apply --check and syntax-only vm.Script parsing pass; proposed source not executed. PATCH-MANIFEST.json records hashes and diagnostics. No claim of newly passing runtime/security tests.

Legitimate forgotten-password recovery and staff reset actions become unavailable after a separately authorized deployment. Administrators do not retain a reset bypass; same503 applies to them. Current source and production behavior are not changed by this preview. If uniform503 must precede malformed JSON/CORS errors, an additional server/ingress proposal is required; this minimal patch only controls requests reaching the two matched PUT handlers.

## Option B — secure replacement

[OPTION-B-SECURE-REPLACEMENT.md](OPTION-B-SECURE-REPLACEMENT.md) specifies verified current identity/admin scope, account/tenant-bound short-lived cryptographically random single-use capabilities, server-side proof and atomic consumption/password+epoch update, verified delivery, modern adaptive salted hashing, digest-login migration, session revocation at every consumer, and bounded abuse controls. Existing schema does not provide those proofs/epochs and DB transaction topology is unverified. All new schema/claims/fields and migration/dependency/frontend/global-guard changes need separate approval; Option B is design only and not implemented.

## Tests, regression and rollback

[SECURITY-TEST-PLAN.md](SECURITY-TEST-PLAN.md) prepares all12 requested isolated cases with fixture setup/status/properties, including forged/expired/cashier/cross-store attempts, no calls/writes/issuance, unchanged login/routes and disabled scanner. Only static binding comparison, exact in-memory source restoration, clean-apply and syntax checks ran now. No runtime test file or proposed executable source created. Prior428/28/31 results remain historical, not rerun.

[REGRESSION-ROLLBACK.md](REGRESSION-ROLLBACK.md) requires new isolated tests plus existing31 Stage2/28 security/428 historical suites after authorization, a unique original-byte backup and exact-hash restore of routes/user.js only. Restoring reopens unsafe routes and requires explicit acceptance; no automatic rollback, unrelated-file restore, DB/index/cart/key or feature change.

[INTEGRITY-REPORT.md](INTEGRITY-REPORT.md) and full before/after manifests verify protected hashes, Git statuses and88 symlink targets. INVENTORY.json enumerates only newly created preview docs. Required main router/test pins stay unchanged; no adapter or log-redaction implementation.

## Recommended minimum approval and remaining risks

The smallest concrete next source approval is this exact **one-file, two-registration Option A** plus new isolated tests/docs/rollback artifact, with both workflows' temporary outage explicitly accepted. The older forgot-only approval does not cover this new candidate. No global middleware, model, controller, frontend, key, log redaction or scanner change belongs to that batch.

Residual generic credential writes and weak legacy authentication remain serious blockers. If a future authorization requires that *no equivalent unprotected credential writer remain before implementation*, this two-route candidate alone cannot meet that condition; explicitly decide on partial emergency containment or separately review expanded writer containment/hardening. Do not silently broaden the patch or falsely claim all reset bypasses fixed. Broader status/epoch/data-integrity/DB ownership/ingress/logging safeguards and secure replacement remain unresolved.

Stop after this review. Wait for explicit approval; do not apply, deploy, activate scanner, implement adapter/Option B or proceed to Batch B.2.
