# Preview validation and post-approval plan

## Executed safely in this preview

- 9/9 source-bound isolated checks in preview-security.cjs; PREVIEW-SECURITY.tap records zero failures/skips/cancellations. Checks cover exact proposed substitution/current-source unchanged, generic503, no request reads, zero original-controller/token calls, no account disclosure, all other order bindings/bytes unchanged, original synthetic cache-hit and database-result issuance, and proposed callback on an owned Express router at a fixture prefix/trailing slash.
- 28/28 existing scanner security tests, zero failures/skips/cancellations; scanner-security/SECURITY.tap. Seven child-process absent/false/malformed session-flag probes returned503 DISABLED. Enabled scanner session values exist only in the runner's synthetic fixture process; no application configuration or runtime feature was enabled.
- 31/31 Stage2 tests, zero failures/skips/cancellations; STAGE2.tap. These exercise unchanged current source, not an applied production order-router patch.
- Clean `git apply --check` for ONE-ROUTE.diff; proposed postimage syntax parsed from stdin, current order-router and preview fixture syntax checked; PATCH-MANIFEST.json and SYNTAX.json.

The proposed order router was not required/evaluated as an application module. Its complete registration arguments are checked by a constrained source reader, and only the exact terminal callback is evaluated in an owned VM and mounted on a fresh Express router with in-memory HTTP streams. The original controller was likewise source-extracted and evaluated only with explicitly owned fake Redis/Order/ObjectId/jwt dependencies, to validate both issuance branches; no import of legacy models/controllers/auth/bootstrap, global export/cache monkeypatch, listener or network/DB/provider/cart operation. This is isolated proposed-handler validation plus binding/byte checks, not full deployed integration.

## Required assertions after explicit implementation approval

1. Revalidate current order-router original hash, patch extraction identity, clean apply and preserve fresh rollback bytes before the single change.
2. Assert the actual GET binding has only the terminal503 callback, excluding userAppOrder and any old chain. Test no/malformed/expired/forged credentials and known/missing synthetic order/store selectors; all reached matched routes return exact generic body, no token/order/account fields.
3. Spy original controller, jwt.sign, Redis GET/SET, Order/User model calls and issuance/side effects: all zero for the disabled route. Request-read tripwire must remain untouched.
4. Verify every other order registration and all unaffected source bytes identical. Check mounted prefix/trailing slash and Express HEAD behavior (HEAD implicitly uses GET status with no body); do not claim a prefix-wide firewall or unchanged responses for global CORS/parser rejection.
5. Rerun these9 preview checks adapted to actual applied-source binding (current preview check01 deliberately requires current==original, so it must be deliberately adapted in a new approved test file, not suppressed), all28 scanner security tests and Stage2's31. Run the full428 historical suite and twelve existing recovery scenarios after implementation; preserve outputs, no skips/suppression. Full428 was not rerun in this preview.
6. Verify normal/app/digest login, existing recovery503, scanner gate/config and all other sources unchanged. Re-run full three-project integrity/symlink audit with only routes/order.js allowed as an existing-file delta.

Do not test a live order or payment flow. A separately approved frontend change could handle503 clearly; it is outside this one-route approval. Secure restoration needs independent owner-bound proof/scoped purpose, safe projection and migration; returning public data or a login token as a compatibility fallback is not proposed.

Reproduction (main backend root):

```
node docs/multi-scan/stage11-b/public-order-token-preview/preview-security.cjs
python3 tests/multi-scan/stage11/run-auth-session.py <new-unique-output-directory>
NODE_ENV=test MULTI_SCAN_ENABLED=false MULTI_SCAN_SESSION_ENABLED=false node tests/multi-scan/stage2.test.js
git apply --check docs/multi-scan/stage11-b/public-order-token-preview/ONE-ROUTE.diff
```
