# Emergency public order-token containment — patch preview

**Prepared and isolated-preview validated only. No patch applied, existing file edited or deployment performed.**

## Verified vulnerability and outage

GET /gratis/user-order-app/:orderid is publicly bound to userAppOrder in routes/order.js:32. controllers/order.js:80–139 reads Redis or queries an order using caller store/order selectors, then signs the order account email using the legacy login key and returns {order,token}. Both successful branches converge on the single jwt.sign at124. No caller password/ownership proof exists.9 synthetic source-bound checks include both old issuance branches with fake dependencies and the proposed denial behavior. No real account/key/DB/cache/provider was accessed.

This is confirmed unsafe login-credential issuance when valid selectors resolve an order, rather than merely a missing signature check. The unprojected populated order account can also expose credential/account fields if present. Existing tokens/cache/client copies are not revoked or erased by this containment. Other legacy issuers and weak authentication/profile/import risks remain; see [FINDINGS-AND-COMPATIBILITY.md](FINDINGS-AND-COMPATIBILITY.md).

The known caller is frontend getAppUserOrder -> AppPayment at /apppayment/:estoreid/:orderid. It currently stores the returned token and loads order/payment details.503 will reject its Axios promise; its then-only error-toast branch does not catch that rejection. Fresh-page order/payment content will not load and no new token is stored through that success path. This is an intentional temporary outage of that flow, not a shutdown of all payment endpoints. Ordinary signed-in OrderDetails uses a different unchanged endpoint. Native/external mobile clients and deployed usage are unverified; supplied workspaces contain no native mobile source/config for this flow. No frontend fix is included.

## Exact extracted one-route patch

Only the following old/new registration line is extracted from the previously reviewed Patch02; its other eleven route changes are excluded. Controller function/imports remain untouched. All21 other order bindings and every other source byte reconstruct exactly.

```diff
--- a/routes/order.js
+++ b/routes/order.js
@@ -29,7 +29,7 @@
 const { authCheck, adminGratisCheck } = require("../middlewares/auth");
 
 router.get("/gratis/user-order/:orderid", authCheck, userOrder);
-router.get("/gratis/user-order-app/:orderid", userAppOrder);
+router.get("/gratis/user-order-app/:orderid", (_req, res) => res.status(503).json({ err: "Account authority operations are temporarily unavailable." }));
 router.get(
   "/gratis/admin-order/:orderid",
   authCheck,
```

Canonical byte-preserving artifact: [ONE-ROUTE.diff](ONE-ROUTE.diff). PATCH-MANIFEST.json pins the extraction, clean check, proposed syntax and inspected source. Original and proposed full routers are documentation artifacts only.

| routes/order.js state | SHA-256 |
| --- | --- |
| Current original | `cab1f734e9b34b2585d3f8777b42325ba934412a7d6a639925dad61b796664bd` |
| Proposed, unapplied | `2a448f501d35157b9c4a11ac3c0a2a21ed476aeb6f8d4d7dceb8064457223bdf` |

## Validation and security test plan

| Executed check | Result |
| --- | --- |
| Source-bound preview checks |9 passed; no failures/skips/cancellations |
| Existing scanner Batch A security |28 passed; no failures/skips/cancellations |
| Stage2 regressions |31 passed; no failures/skips/cancellations |
| Scanner flag probes |7 absent/false/malformed variants returned503 DISABLED |
| Diff check / proposed syntax |Clean git apply --check; proposed source parses |
| Current router / fixture syntax |Both passed |

[TEST-PLAN-AND-RESULTS.md](TEST-PLAN-AND-RESULTS.md) describes all cases, test reproduction and post-approval regression requirements. Preview callback checks verify generic503, no token or account/order response, zero original-controller/signing calls, no request read, unchanged other bindings, and owned in-memory Express mounted/trailing-slash routing. This is not applied production-router integration: legacy modules/bootstrap are never imported, no listening port opened and no live request made. The existing scanner tests run unchanged current source with synthetic child-process configuration. Full428 historical and prior12 recovery tests were not rerun in this preview and are specified for implementation validation.

The503 contract concerns matched reached requests. Existing global parsing/CORS/ingress may respond before this callback. Express can use GET for HEAD status without a response body. No wildcard/prefix firewall is claimed. Authentication header contents do not provide an exception to denial. Existing startup imports may still initialize legacy services in a real app; this patch does not alter startup.

## Rollback and recommended approval scope

[ROLLBACK.md](ROLLBACK.md) contains the guarded reversal procedure and security implications. ORDER-ROUTES-ORIGINAL.txt preserves the exact current bytes/CRLF before any source implementation. Before a later authorized application, require the original hash, fresh uniquely named backup and clean patch check; stop on mismatch. Afterward require the proposed hash, unchanged controller/other routes and full integrity audit. Reversal would reopen the unsafe issuer and needs a separate decision; it is not performed here.

Recommended implementation approval is limited to **/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/routes/order.js**, exactly ONE-ROUTE.diff, plus new isolated tests/documentation/rollback artifacts and the specified fixture/regression validation. Explicitly accept temporary AppPayment/mobile-consumer unavailability. No other existing source, controller, global auth, frontend, AI module, feature flag or remaining Patch02 change is included. Normal/app/digest login and public registration are unchanged; their residual issuance/security issues require separate review, not silent expansion. No production deployment, key rotation, DB/cache operation or scanner activation.

The final [INTEGRITY-REPORT.md](INTEGRITY-REPORT.md) records unchanged existing files, protected hashes and88 symlink targets. FEATURE-DISABLED.json records only safe flag presence/enabled booleans; flags remain absent/not enabled and scanner stays disabled by default.

**Stop: awaiting explicit approval to implement this exact one-route containment.**
