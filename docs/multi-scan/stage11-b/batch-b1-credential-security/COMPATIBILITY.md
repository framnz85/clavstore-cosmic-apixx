# Compatibility and migration assessment

Nothing in this review changes runtime behavior. This document describes the impact if the proposed candidates are subsequently approved/applied/deployed.

## Immediate containment costs

01 changes four named PUT operations from legacy success/error behavior to unconditional503 for valid parsed matched requests, including legitimate requests. JSON is {err:"Account updates are temporarily unavailable."}. No original guard/controller/DB lookup is called on those bindings. Normal login, old-secret change-password, the existing two recovery denials, scanner flags and unrelated routes are unchanged. Existing imports remain in source, so legacy startup side effects are not removed. Malformed JSON/global CORS can reject before the handler; this is not a prefix-wide firewall.

02 has twelve additional outages (the exact route list is in its diff): public user registration/staff onboarding, email verification, deletion request/user deletion, store setup/settings/warehouse copy/delete, public order view/token flow, and affiliate reassignment. Do not silently bundle this with only four-route approval. It prevents these reachable writers/issuers but does not redesign registration or billing. 03 removes dedicated GET membership repair; users missing primary membership need a protected migration/enrollment decision. 04 stops only implicit new-account branches in four order flows with409; existing account lookup/order branches stay and retain legacy behavior. 05 stops payment configuration mutations, not ordinary provider payment execution.

## Verified current frontend dependencies

| Source | Current payload/behavior | Consequence / migration needed |
| --- | --- | --- |
| src/functions/user.js:100/113/163 | authToken header, selected store; generic payloads / users array | 01 returns503. Handle status visibly; do not optimistically claim success. Future transport can keep lowercase authtoken but needs a new independently issued profile credential. |
| src/pages/user/UserAccount.js:264 | profile includes email; client may obtain password proof but server generic route does not require it | Email edit cannot remain generic. Split profile vs verified login-identifier workflow; client password-only UI is not server proof. |
| src/App.js:518/541/562 | spreads full res.data; address clearing and primary estoreid reassignment | Strict allowlist rejects. Replace whole-record posts with approved field-only commands; store switching becomes a protected membership operation, not profile mutation. |
| src/components/modal/VerifyEmail.js:142 | client generates code, writes verifyCode through generic profile, calls public send proxy | Must retire this proof path. Dedicated server challenge issuance/expiry/atomic consume needed; confirmation cannot activate store. |
| src/components/modal/AddEditUser.js:214/273 | public create role, shared password, edit role/resellid via customer update | 01/02 disable these flows. Replace with verified admin enrollment/authority endpoints; no public-role parameter. |
| src/components/modal/ImportUsers.js:87–134 | spreadsheet email/role/phone rows, batches; success path does not robustly establish each row write | Imports disabled. New contract rejects email/role/credential changes and needs clear atomic batch/error semantics. |
| src/pages/admin/billing/PayInstructions.js:114 | generic customer update sets emailConfirm true after UI payment flow | This is an authority write; do not preserve it in profile allowlist. Verified server payment/challenge state required. |
| src/pages/Welcome1.js:57 (and Welcome2–4/ThankYouPaid) | spreads user into endPoint/tracking updates | Whole-user posts fail strict core. Define separate non-authority telemetry flow or approved narrow fields. |
| CheckoutDetails, Location*, UserPhoto, UserProdCard, Limits, PreSteps, ServerBusy | profile updates address/image/wishlist/limits/tracking/preferences | 01 outages; future name/phone-only core does not restore these. Specify each allowed shape and authority boundary before adding it. |
| auth/Login.js, functions/auth.js | normal and digest login return/store legacy JWT | Existing login files untouched; legacy credentials do not meet future exp/sub/tenant/purpose contract. New self-profile session acquisition/client update is a prerequisite, not a decode fallback. |

SOURCE-EVIDENCE.json pins all inspected frontend JS, not just the listed examples. No frontend source patch is prepared to silently absorb an unapproved outage. External/mobile app clients are not present in this workspace: their payloads, token storage, versions and rollout behavior remain unverified.

## Global legacy middleware migration (explicitly not proposed here)

Inventory every issuer: main normal/digest login, app login, public registration, public order view and separate disabled scanner-session issuer. Close unsafe issuance/authority grants first. Establish unique immutable identities, scoped membership/status, credential and authorization versions, trusted revocation consumers and key ownership. Fresh proof must bind the selected tenant to the exact account; never map email-only legacy claims automatically into owner grants. Duplicate emails are currently allowed in active main schema, and existing global email/password login is ambiguous across tenant records.

A future separate profile credential must have distinct key/issuer/audience/purpose and bounded exp/sub/store/package/epochs. Do not reuse a scanner token/key or an old signed order token. Issue it only after independent proof and trusted-state resolution; no issuer implementation is included in06. Plan explicit reauthentication, client version rollout, expiry/revocation cutover, verified server-side owner/admin onboarding and rollback. Do not add missing-exp grace or unverified legacy fallback. Existing normal login success/error contracts can stay during the new endpoint rollout; privileged writes stay closed until their consumers migrate.

No exact schema/backfill/transaction migration is invented: Mongo topology, historical data integrity, authoritative tenant ownership, duplicate policy, account-disable definition and operational key custody have not been verified. The requested review can prepare safe containment and an isolated core; it cannot honestly call a real adapter or privileged import reopening safe yet.
