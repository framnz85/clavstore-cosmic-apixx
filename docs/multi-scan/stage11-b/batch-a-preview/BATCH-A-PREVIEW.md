# Stage 11-B / Batch A — exact patch preview only

**Prepared, unapplied, disabled by default. No implementation or activation authorized or performed.** Only new documentation is created in this directory. Stage 11-A's required router SHA matches the actual source: `f4948acc53c4e6d6b2029e8896bd8ef21b5e33516a47c31bff44ab7736440c08`.

## Proposed scope requiring explicit approval

One existing file: `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/routes/multi-scan.js`. [ROUTE-PATCH.diff](ROUTE-PATCH.diff) adds exactly two lines: a pure session-factory import and POST session registration before the existing prefix bearer middleware. No existing line removed or reformatted. Recheck exact original hash/context immediately before a future application. Proposed resulting SHA is `469c88c14c7472b59aa145e74c785d8ec85adbd1540a8be3fcffd0f98cd99836`.

Five necessary NEW main API modules are fully specified in [AUTH-MODULE-SPEC.md](AUTH-MODULE-SPEC.md): `services/multi-scan/stage11/session-config.js`, `credential-repository.js`, `session-service.js`, `session-handler.js`, `session-factory.js`. They implement strict flags/configuration, bounded existing credential/current-record reads, cryptographic session authorization/issuance, exact HTTP validation/errors and pure gated composition/admission respectively. These are Markdown source blocks only; no executable module or test file has been created. Future isolated tests need their actual implementation reviewed separately; this preview only supplies [24 exact test cases and variants](SECURITY-TEST-PLAN.md).

## Exact proposed HTTP contract

- Method/path: POST `/ai/multi-scan/session`, relative to the existing main router mount `/<API_ROUTES>`; the deployed prefix is not guessed.
- Registered but disabled: main cfg.enabled must be boolean true (existing MULTI_SCAN_ENABLED literal true parser) AND new MULTI_SCAN_SESSION_ENABLED must equal the literal string true. Missing, empty, false, malformed or unexpected values return503/DISABLED. Authentication and source acquisition occur after the gate. New session flag/configuration values are proposals; no environment changed.
- Enabled configuration additionally requires a distinct strong dedicated key in proposed MULTI_SCAN_SESSION_JWT_KEY, explicitly configured MULTI_SCAN_SESSION_ISSUER and MULTI_SCAN_SESSION_AUDIENCE matching the Stage 11-A proposal. Missing/unacceptable configuration returns503/UNAVAILABLE. No default/development/legacy key fallback.
- Request: JSON object with exactly email, plaintext password and canonical lowercase 24-hex storeId; password1–1024 UTF-8 bytes, email valid-shaped and <=254 characters, serialized body<=8192 bytes. Never log or store plaintext. Selected storeId is an untrusted selector, not authorization. Legacy authtoken/estoreid/resellid headers and extra body fields are rejected400.
- Authentication: fresh password proof against the existing unique scoped user row every time. Authorization is optional for first issuance; when supplied it must be exact Bearer plus valid scanner-purpose JWT and matching identity/store/package. Password remains mandatory. Legacy no-exp tokens never upgrade. This explicit optional-header/password contract is proposed for approval, not a claim about existing login behavior.
- Authorization: reuse Stage 7 current user primary/secondary store membership, matching resellid, active store and active reseller parent, non-revoked admin/moderator/cashier role. Non-admin also requires current store orders permission. No client role/package is trusted. Missing/ambiguous authority fails closed. Administrator access is only from current records.
- Success200: exactly token, tokenType=Bearer, expiresAt (integer epoch seconds), scope={storeId,packageId,userId,role}, server requestId. Dedicated HS256 token lifetime900 seconds; standard sub/email/iat/exp/iss/aud plus the expressly proposed storeId/packageId scope claims. No internal AI keys/URLs/configuration/raw rows.
- Route-local errors:400 INVALID_PAYLOAD;401 INVALID_TOKEN or INVALID_CREDENTIALS;403 DENIED;413 TOO_LARGE;429 RATE_LIMITED or BUSY with Retry-After60;503 DISABLED or UNAVAILABLE;504 TIMEOUT. Exact body `{error:{code,message},requestId}`; fixed messages in the module spec, no reflected secrets/stack. All route-local results no-store/no-cache. Earlier global JSON parser errors remain a documented blocker for uniform errors.
- Expiry/revocation: no refresh collection or persistent scanner session. Require fresh password again when expired. Revalidate current records before issuance; future protected consumers must verify signed scope/expiry and current authorization on each operation. Batch A does not alter or integrate Stage 2 scanner consumers.
- Rate/admission: five attempts/socket peer/60 seconds, bounded128-peer map, one in-flight operation/router, no queue,10-second response deadline,5-second bounded DB queries, lease held until actual settlement. Trusted public ingress and multi-worker rate policy remain blocked. No application logging beyond possible future allowlisted status/code/UUID; never log secrets, credentials or bodies.

## Blockers and exact limits

**BLOCKED for activation:** no trusted production `getSessionSources` exists in default route composition, so even explicitly enabled correctly keyed default route returns503/UNAVAILABLE; no production model import is invented. Future source composition and actual reseller/credential semantics must be approved/verified. Existing models/user imports DB bootstrap; it must not be imported as a shortcut here.

**BLOCKED:** legacy issued tokens omit required bounded expiration and cannot provide fresh credential proof. Dedicated purpose/claim/configuration/optional-header contract requires approval and secure provisioning later; existing cashier login/cart remains unchanged. See [JWT-COMPATIBILITY.md](JWT-COMPATIBILITY.md).

**BLOCKED:** the existing global2MiB JSON parser precedes this router. An8KiB local parser cannot prevent prior allocation or standardize earlier parse errors. Strict ingress/parser limits and logging/redaction, trusted peer policy and distributed rate enforcement need additional reviewed scope. The one-file diff does not claim to fix them.

**BLOCKED for usable scanning:** Batch B scope-aware consumers and Batch C frontend memory-session wrapper are excluded. No scan activation, endpoint forwarding, cart/POS/auth issuer changes, AI service, environment, dependency, schema, key provisioning, production network access or deployment is part of this proposal. Default-disabled code approval would not authorize any of those actions.

## Validation and integrity evidence

[VALIDATION.json](VALIDATION.json): five module blocks and reconstructed proposed router passed syntax-only parsing; two unified-diff hunks match exact current lines and reconstruct the pinned proposed hash entirely in memory. None of these sources was executed or written as JavaScript. Security tests and historical428-test suite were not run; passing syntax is not passing authentication behavior. [PREVIEW-MANIFEST.json](PREVIEW-MANIFEST.json) pins proposed source-block hashes.

[INTEGRITY-REPORT.md](INTEGRITY-REPORT.md) and full before/after manifests record Git status, all existing-file SHA-256 values,88 symlink targets and exact added-doc inventory. [ROLLBACK-PLAN.md](ROLLBACK-PLAN.md) requires original-byte archival in the later approved application stage and exact-hash restoration; no rollback executed.

**Approval boundary:** review the two added router lines and these five exact source blocks as a disabled-only implementation candidate, together with the proposed credential/JWT contract. Test implementation, trusted production source wiring, key/configuration provisioning, activation and later batches each remain outside this preview and need explicit approval of concrete scope. Stop here; do not apply this patch automatically.
