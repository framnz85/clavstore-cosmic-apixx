# Compatibility and remaining authentication risks

This batch modifies development source only. No deployment occurred; production runtime/ingress/mobile client state was not inspected or changed. A separate deployment decision must account for the following source-verified outage.

## AppPayment impact

Frontend src/functions/order.js:12–17 sends an unauthenticated GET to /gratis/user-order-app/<orderid>, using estoreid header. src/pages/user/AppPayment.js:33 calls it from /apppayment/:estoreid/:orderid (src/App.js:1269). Its success path loads res.data.order, computes payment total, stores res.data.token in localStorage userToken, sets token state and dispatches login state. That token is supplied to changePaidOrder. Order-dependent UI includes PayPal controls or a paid-status action for forprocess=1.

The route now returns503 in development source. On a future separately approved deployment, Axios default behavior rejects that response; AppPayment has a .then without .catch for this request. Its res.data.err toast branch will not handle503. A fresh mount cannot load order/payment details or acquire a new token through this flow. The page's order._id-dependent payment UI is absent. Existing browser state/tokens are not automatically cleared. This does not disable all payment APIs or all previously authenticated actions.

No frontend payment source was changed. Ordinary signed-in OrderDetails uses the distinct /gratis/user-order/:orderid endpoint; its source and binding are unchanged, without a claim that all payment workflows are end-to-end certified. No native android/ios client source for this flow exists in the supplied frontend workspace; external mobile/deep-link consumers remain unverified and will also lose this endpoint's response if they depend on it. No replacement unauthenticated acquisition, fallback endpoint or authentication bypass was created.

## Remaining risks — unchanged, not resolved by this containment

- Previously issued legacy JWTs and cached/client account data are not revoked or erased. Existing JWT consumers often decode without signature/expiration verification; current middleware is not repaired here.
- Public user registration still issues a legacy email-only token and accepts requested privileged roles/selected namespaces. Normal/app/digest login issuers remain, including MD5 storage/digest-as-credential and missing explicit expiry/immutable subject/tenant binding.
- Generic main/customer/app/import handlers still permit credential and privileged-field mass assignment. Weak staff guards admit cashier and rely on decoded identity; broader store/warehouse authority writers and implicit membership repair remain.
- Client-generated verification, account confirmation/store activation coupling, shared-password customer provisioning and provider-configuration credential writes remain separate reviewed risks.
- Trusted current ownership, membership/status, credential/authorization epochs, safe token issuance and atomic adapter/migration contracts remain unresolved. Existing mutable database rows cannot simply be promoted into trusted owner grants.

The retained userAppOrder controller still contains token issuance but is no longer registered on this route; no alternate registration was added. Its existing imports/startup side effects remain outside request-handler containment. Global parsing/CORS/ingress may reject before matched handlers;503 is the reached-route contract, not a universal prefix firewall. None of the other five credential-security candidates or the remainder of Patch02 was implemented.

Full prior evidence remains in public-order-token-preview and batch-b1-credential-security. No additional security changes, key rotation, live credential operation, database/cache cleanup or scanner activation was performed.
