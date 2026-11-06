# Public order-token containment — implementation report

Implemented only the reviewed one-route development change in routes/order.js. No deployment, production database/Redis access, live credential or provider/cart operation, feature activation or other credential-security patch was performed. Existing recovery containment remains intact. Scanner stays disabled.

## Exact change

GET /gratis/user-order-app/:orderid now binds only:

```js
(_req, res) => res.status(503).json({ err: "Account authority operations are temporarily unavailable." })
```

The original userAppOrder function is no longer registered on this route. Its import/controller and all token-generation utilities remain unchanged. The callback reads no request/account data, issues no token, invokes no original controller/model/cache function, and returns only the generic error. All21 other order registrations and all remaining router bytes reconstruct the exact original source. Only the one reviewed old/new line was applied; the other11 route changes from Patch02 were excluded.

Before modification, the current file matched the reviewed original SHA, the exact preview diff passed clean apply, fresh original bytes and existing Git status were preserved, and the recovery router hash/both terminal503 bindings were verified. The immediate pre-apply checks were repeated after the full integrity baseline finished. The resulting bytes exactly match the reviewed proposed router, preserving CRLF.

| State / protected file | SHA-256 |
| --- | --- |
| routes/order.js original | `cab1f734e9b34b2585d3f8777b42325ba934412a7d6a639925dad61b796664bd` |
| routes/order.js applied | `2a448f501d35157b9c4a11ac3c0a2a21ed476aeb6f8d4d7dceb8064457223bdf` |
| routes/user.js existing recovery containment, unchanged | `a8c092ffc22484b7d5cfd0b876ac160a04a2343d12bedea0d39a56a198216ddd` |
| routes/multi-scan.js approved scanner router, unchanged | `469c88c14c7472b59aa145e74c785d8ec85adbd1540a8be3fcffd0f98cd99836` |
| tests/multi-scan/stage2.test.js approved A.1, unchanged | `a7ff4edd000f7882b9d27e4b3c7e709904a5063f0ddf7dbdadd1ff56465ebe4a` |

[APPLIED.diff](APPLIED.diff) records the exact applied change; [SOURCE-PINS.json](SOURCE-PINS.json) records current protected pins.

## Validation

| Suite/check | Passed | Failures | Skips |
| --- | --- | --- | --- |
| New source-bound order containment checks |9 |0 |0 |
| Existing recovery containment scenarios |12 |0 |0 |
| Existing scanner Batch A security tests |28 |0 |0 |
| Full historical suite |428 |0 |0 |
| Stage2 (included in historical428) |31 |0 |0 |
| Relevant syntax |9 |0 |Not applicable |

Total distinct functional tests:477 (9+12+28+428). No cancellations. Failures:0. Skips:0. Raw output is CONTAINMENT.tap, RECOVERY.tap, scanner-security/SECURITY.tap and the historical TAP/Jest tree; [TEST-RESULTS.json](TEST-RESULTS.json) audits each output. Historical summary contains39 Stage10 +389 stages2–9 tests. Seven scanner absent/false/malformed session-flag probes returned503 DISABLED. Main/session gate checks, protected pins and both recovery503 handlers passed. FEATURE-DISABLED.json records only safe flag presence/enabled booleans: neither flag is enabled in inherited/configured main environment; no config changed.

The new nine tests verify actual complete source binding/hash and byte restoration,503 across selectors/credentials, zero original-controller/signing/model/cache calls, no account disclosure/request reads, all other routes unchanged, owned in-memory Express GET/trailing slash/implicit HEAD behavior, recovery denial, scanner defaults/pins, and unchanged login/token-generation/frontend sources.

Testing uses extracted actual-source terminal callbacks and exact registration checks in owned VM/Express fixtures, not a normal import of legacy router/controllers/models/bootstrap. No listening port/live account/network/provider/DB/Redis used. Synthetic enabled flags/keys in existing scanner child fixtures do not activate application functionality. This proves the change's binding/isolated behavior and regression scope, not all production startup/ingress/mobile behavior or unchanged legacy authentication security. Global parsing/CORS may reject before a route;503 is the reached matched-handler contract. HEAD has503 with no body through Express GET fallback.

## Integrity and rollback

[INTEGRITY-REPORT.md](INTEGRITY-REPORT.md) and full baseline/after manifests provide the three-project audit. The only authorized existing-file delta is routes/order.js; new files are the isolated test tests/multi-scan/stage11/public-order-containment.test.js and this report/results/rollback directory. Existing routes/user.js Git modification from the earlier batch remains byte-identical to the baseline; new intended Git delta is only ` M routes/order.js`.

Fresh rollback artifact: [ORDER-ROUTES-ORIGINAL.txt](ORDER-ROUTES-ORIGINAL.txt), saved before modification. [ROLLBACK.md](ROLLBACK.md) provides current/backup hash guards and exact byte restoration/reverse-diff procedure. Rollback was not performed; it would reopen unsafe public token issuance. Do not overwrite later changes or roll back the unrelated recovery containment.

## Production compatibility and remaining risks

[COMPATIBILITY-AND-RISKS.md](COMPATIBILITY-AND-RISKS.md) documents the temporary outage on a separately approved deployment: /apppayment/:estoreid/:orderid depends on this public response to load an order and obtain/store a token.503 rejects its then-only Axios chain, so the fresh-page order/payment UI will not load and its current error-toast branch will not handle that rejection. External/mobile consumers are unverified. Frontend code is unchanged; no alternate unauthenticated token acquisition or bypass was created. Ordinary authenticated order endpoint binding is unchanged, without claiming an end-to-end payment certification. Production was not deployed or inspected in this batch.

Already issued legacy tokens/client/cache data are not revoked/cleared. Decode-only JWT middleware, MD5/digest login, unsafe public registration, generic credential/authority/import writers, store authority mutations and missing trusted lifecycle/epoch data remain unresolved. The retained controller could still be dangerous if rebound later. These risks require separately reviewed work; this batch does not certify whole-application security.

Stopped after this implementation and validation. No deployment, scanner activation, frontend patch, further authentication implementation or remaining credential-security patch applied.
