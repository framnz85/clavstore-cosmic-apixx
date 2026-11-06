# Inline routes and missing trusted authority

All paths below are under the existing API_ROUTES mount. These routes have no authentication middleware and inline handlers in main routes/customerRoutes.js; no separate controller exists.

| Source / route | Credential/authority behavior | Classification |
| --- | --- | --- |
| :21 POST /customers | Builds customer accessType/paymentStatus/active object; database insert commented out | Potential vulnerability requiring further verification if a consumer trusts returned fields; no persisted User mutation shown |
| :91 POST /license-keys | Generates and returns random license key with client customer/type/expiry; database insert commented out | Unresolved due to missing trusted data/consumer: real key generation, no authoritative persisted license or ownership check |
| :139 POST /verify-license | Returns valid/activated mock result for supplied key; actual DB lookup commented out | Potential vulnerability requiring further verification: consumer/entitlement impact unresolved; do not assume verification is authoritative |
| :197 GET /customers/email/:email | Returns mock customer access state | Potential/unresolved consumer trust; no credential mutation |
| :237 PUT /customers/:customerId/access | Builds accessType/features/expiry update; database update commented out | Potential privilege/entitlement issue if trusted by client; no confirmed persisted account write |
| :276 POST /send-welcome-email | Mail implementation commented; returns success/logs recipient | No credential proof issuance or DB write; not trusted delivery |
| :323 POST /transactions and :369 POST /refunds | Mock transaction/refund objects; actual provider/DB writes commented | No local credential write; operational/payment effects unresolved |
| :408 GET /stats/customers and :443 GET /customers/export | Mock stats/export only | No credential writer; do not infer authentication adequacy |

Main routes/paymentRoutes.js (:34 create-payment-intent, :146 payment-status, :178 verify-payment, :230 webhook/paymongo) handles provider payment intents/results, not User password/grant DB updates. Provider payment tokens/client secrets are payment capabilities, separate from user authentication; provider/webhook authorization and entitlement consumer correctness need their own review. No provider call was made.

U01 — **Unresolved due to missing trusted data**: authoritative current subject/account activity, protected role/membership/owner grants, reviewed unique login-to-immutable-subject mapping, credentialEpoch, authorizationEpoch, profileVersion and atomic transaction topology are absent/unverified. Mongo _id already supplies an immutable row identifier; what is missing is its reviewed login/tenant/grant binding. Existing active main models/user.js and models/estore.js provide mutable legacy authority data, not the proposed versioned grant contract. No production row audit was authorized or performed. Existing deleteAccount.request cannot be silently mapped to a complete account-disable lifecycle; store status/reseller state can also have been written through vulnerable routes. Reopening privileged/import or self-profile writes from those rows without a protected migration/attestation is not justified.

All60 discovered mutation/issuance anchors are mapped to the40-operation index or explicitly reviewed in MUTATION-SCAN-EXCLUSIONS.json (timestamp-only updates and isolated scanner/fixture issuers). This is a bounded application-source inventory; external services, deployed code differences, database triggers, proxies and mobile client source are unavailable and not silently declared safe.
