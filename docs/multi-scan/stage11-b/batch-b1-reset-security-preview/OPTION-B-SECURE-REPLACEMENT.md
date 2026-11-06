# Option B — secure replacement design, NOT IMPLEMENTED

This is a separate future source/schema/issuer/consumer/UI approval, not a variant to silently add to Option A. Existing legacy guards, MD5/hash-login, raw credential writers and absent epoch/challenge fields cannot be called a secure recovery system. All new records/fields below are proposals, not asserted existing schema.

## Distinct proofs and operations

Self-service recovery starts with an untrusted email/store selector and returns a generic receipt (proposed202) regardless of account existence. It must not accept a new password or alter credentials at initiation. Account ownership is established later by redeeming a cryptographically random, server-validated single-use recovery capability delivered only through a separately verified channel. An existing legacy JWT or request-supplied email is not that proof. Locked-out users need not already possess an application JWT; the recovery capability itself is the cryptographic proof bound to the server-selected immutable account and tenant.

Administrator initiation requires a cryptographically verified bounded token with mandatory sub/iat/exp, explicit algorithm/purpose/issuer/audience, current trusted active status and explicit reset-initiation permission for the exact target tenant/account. Cashier/moderator role alone is insufficient. Legacy decoded claims and self-declared superAdmin flags cannot grant this. An administrator should initiate verified recovery delivery rather than set a shared password or see the user's new secret; high-privilege/owner recovery needs additional independently approved attestation and audit. No arbitrary store selector chooses a DB or establishes ownership.

## Recovery capability and server-side proof

Propose a server-owned RecoveryChallenge record containing opaque id, token hash, immutable userId/tenant binding, purpose, expiresAt, expected credential/authorization epoch and consumed state. Use at least256-bit cryptographically random capability material with a short bounded lifetime (proposed <=10 minutes, policy approval required). Store only its secure hash (or purpose-keyed digest if separately provisioned), never the raw token. Do not use a client-created code, client timestamp, emailConfirm flag alone, predictable password, client password hash or stateless JWT without server one-time-consumption state.

Only the service chooses account/channel from verified current records; caller-supplied email/phone/delivery endpoint cannot redirect the secret. Current emailConfirm and profile metadata are mass-assignable/weakly guarded, so trustworthy channel verification and enrollment must be established, not assumed. Issue/redeem limits apply per selector even if no account exists. New challenges invalidate prior same-purpose challenges under explicit policy; TTL deletion is cleanup only, while redemption enforces expiry in the atomic predicate.

Raw credentials must not enter URLs/access logs/analytics/browser storage. If a future recovery link carries a secret, use an approved frontend flow to transfer it to a protected redemption request and remove it from navigation history; approve token/referrer/log handling separately. No frontend change or secret delivery occurred now.

## Atomic redemption and reset

Verify proof hash, unused state, correct purpose, server expiry, immutable account+tenant and expected current epoch. Perform single-use challenge consumption, password-hash write and epoch advancement atomically under a proven supported DB transaction, or an explicitly reviewed single-document CAS design. Mongo topology/transaction support is NOT verified in this review. If the chosen atomicity guarantee is unavailable, keep recovery unavailable; do not race two redeems or silently split the write into unsafe best-effort operations. Concurrent redemption has at most one winner. A partially failed approved transition remains deny/consumed for audited recovery rather than reopening a used proof.

Use a modern adaptive password hash with unique random salt and encoded algorithm/cost/version; select a reviewed Argon2id or scrypt implementation and measured resource policy under separate approval. No hardcoded universal password, MD5-only new credential, showPass storage or plaintext response/log. Existing password:String can represent encoded hashes, but every verifier/login/reset/change/registration/import path must be migrated before cutover. Existing loginUserByMd5 compares stored-password-equivalent input directly; it must not accept a modern encoded hash as a bearer credential. Blindly changing one writer would break legitimate legacy logins or leave hash-as-password bypasses.

A controlled legacy login verification/rehash transition requires fresh plaintext proof, protected writers and explicit format detection; do not bulk assume old records are valid or read production data here. Removing existing showPass values is a separately authorized data migration, not an automatic source edit. No new dependency installed or hashing parameters benchmarked during this review.

## Revocation and current authorization

Reset must advance an independently protected credential/authorization epoch and revoke relevant refresh/server sessions if those are introduced/verified. Every protected consumer must cryptographically verify tokens and compare subject/tenant/current active status and epoch. Reenable/version changes cannot make old credentials usable again. Audit privileged resets and sensitive role/membership transitions under the protected writer policy from the prior security-foundation review.

This **cannot guarantee global session revocation while legacy authCheck only decodes JWTs**. Expiry or key rotation alone does not fix such consumers. Full issuer/guard/consumer migration and opaque/server-session lifecycle, if adopted, require separate exact patches and cutover approval. Scanner JWTs stay dedicated; no internal AI credential exposure or legacy-token upgrade. Fresh proof and final current-state checks after awaits are required for scan/review consumers; short lifetime alone is not a revocation mechanism.

## Abuse and delivery controls

Bounded per-peer/per-account-selector/global attempt and issuance budgets, concurrency admission, request/read/body limits, strict token/secret lengths, bounded hash-worker resources, no account-existence timing/status discrepancy by design, rate limits independent of record existence, replay invalidation and redacted audits. Return generic receipt/error and consistent invalid-proof response, not raw User documents or channel lookup results. Trusted proxy configuration must be reviewed (current server trusts proxy headers broadly); do not let spoofed forwarded IP bypass quotas. Use CSRF protections if cookie credentials are used; CORS is not authorization.

## Future file and migration scope

Likely reviewed areas: routes/user.js and controllers/user.js; fresh verified recovery/admin guard (rather than altering global legacy middleware inside Option A); canonical credential/challenge/status schemas and trusted connection composition; controllers/auth.js and controllers/app/user.js verifiers; registration/import/profile/app and admin credential writers; legacy auth-login-md5 deprecation; every session consumer for epoch checks; frontend recovery/reset/password-change wrappers and verified delivery/audit/rate infrastructure. Current main User broad writes must not be able to set challenge/state/epoch directly. Exact hunks are withheld until those policies/schema/atomicity/caller contracts are approved. New schema/index/data changes require explicit migration/backup/access scope and default-deny enrollment; no existing proof/keys/DB fields are invented.

Option B is not implemented, provisioned, tested against live data or activated. Option A is a temporary two-route denial and does not remove these prerequisites or other generic credential-write bypasses.
