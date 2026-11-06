# Verified issuance and caller impact

## Actual application path

Main routes/order.js:32 registers GET /gratis/user-order-app/:orderid with userAppOrder only: no authCheck, ownership or permission middleware. server.js:50–51 autoloads it under /<API_ROUTES>; no global JWT guard exists in the shown application. CORS is not identity proof. Production ingress/deployed prefix and external service policy are unverified; no network request was made.

controllers/order.js:80–139 userAppOrder reads header estoreid and path orderid. Cache hit: Redis GET order:<store>:<order>, JSON parse, then signing. Cache miss: ObjectId order-id check, Order.findOne({_id,estoreid}), populate store/products/orderedBy/paymentOption, lean/exec, Redis SET24h, then signing. Missing/invalid order returns its existing error; no token in that branch. Both successful branches converge on the single jwt.sign at124 with {email:order.orderedBy.email} and process.env.JWT_PRIVATE_KEY. No options set exp, sub, tenant, purpose or issuer; the library can add iat. No other token-issuing helper is called by this controller: its reachable dependencies are ObjectId, Redis, Order/query-chain, jwt.sign, environment key and response. Its imports of other helpers are not invocations in this function.

A caller possessing valid store/order selectors can therefore receive a server-signed legacy login credential for the order account without password or independent account ownership proof. The database-result and cache-hit behaviors were demonstrated only using source-extracted functions and explicit fake models/cache/signing keys. No real account, signing key, database or Redis was accessed. Signed email-only credentials are accepted as identity by legacy authCheck (decode only, middlewares/auth.js:5–16); a cryptographic signature check alone would not undo this unsafe issuance. Account privileges still depend on the selected current row/route, so do not claim every order account is an administrator or all tenants are automatically accessible.

The response also returns the populated order. populate("orderedBy") has no select excluding password/showPass; those schema fields can be exposed if present. paymentOption is populated without a field projection too. The preview removes all of that response from this matched route. It neither revokes already issued legacy tokens nor removes cached data, fixes global auth, repairs profile/import writers, or resolves prior possible credential disclosure.

## Other issuers and route aliases

Search of main/AI route/controller/service source found no second active registration of userAppOrder and no AI counterpart of this endpoint. The same legacy JWT_PRIVATE_KEY signs credentials at:

| Route | Controller / proof | Residual behavior |
| --- | --- | --- |
| POST /gratis/auth-login | controllers/auth.js:89, sign104; email + MD5(password) | Legitimate normal login unchanged; global email lookup, no explicit expiry/subject/tenant |
| POST /gratis/auth-login-md5 | controllers/auth.js:114, sign129; supplied digest directly matched | Unchanged digest-as-credential login, not repaired here |
| POST /app/auth-login | controllers/app/user.js:100, sign115; MD5 password equality | Unchanged app login |
| POST /gratis/user-create/:resellid | controllers/user.js:707, sign793 after public registration | Still issues email-only token; caller role/namespace problems remain separate reviewed risks |
| GET /gratis/user-order-app/:orderid | controllers/order.js:80, sign124 | Sole target of this preview |

The scanner session service signs separately scoped/configured short-lived credentials after its own proof/resolution; the feature is disabled and it is not an alias for this handler. Fixture token generation is not a production route. Normal GET /gratis/user-order/:orderid invokes userOrder with legacy authCheck and does not sign a token; its security is not newly certified by this containment. All other order bindings remain byte-identical in the proposed source.

## Known frontend/mobile contract

Frontend src/functions/order.js:12–17 exports getAppUserOrder: GET selected API + /gratis/user-order-app/<orderid>, estoreid header only; no auth header. src/pages/user/AppPayment.js:33 calls it from /apppayment/:estoreid/:orderid (src/App.js:1269–1270). On success it loads res.data.order, calculates totals, writes res.data.token into localStorage userToken, dispatches loginUser with token and sets local token state. The existing spread uses res.data.orderedBy even though the controller nests orderedBy inside order; this separate mismatch is not changed here. The token is then supplied to changePaidOrder. UI can show a PayPal payment component or the forprocess=1 paid-status action.

A503 rejects the Axios promise under its default status handling. AppPayment has only .then and no .catch for this call: its res.data.err toast branch will not handle the503, order stays unloaded in a fresh mount, no new token is stored by this success path, and order/payment UI dependent on order._id is absent. Thus this payment-link/app return flow is intentionally unavailable after an authorized deployment; the containment does not disable every payment endpoint or guarantee that pre-existing browser tokens/state are cleared. No frontend change is included. Source-inspected ordinary signed-in OrderDetails uses getUserOrder and the other endpoint; its binding/source remain unchanged, not an end-to-end payment guarantee.

Searches of supplied frontend src/public and both backends found this one wrapper/page caller. No android/ios source directories or Capacitor/Cordova/Ionic config/native source were found in the supplied frontend. react-device-detect/isMobile in AppPayment is UI adaptation, not evidence of a separate native caller. External/mobile binaries, deep links, clients in other repositories and deployed versions are unavailable; their use remains unverified. Any consumer of this endpoint will lose order/token response until secure replacement. No analytics, production logs or payment/customer records were queried.
