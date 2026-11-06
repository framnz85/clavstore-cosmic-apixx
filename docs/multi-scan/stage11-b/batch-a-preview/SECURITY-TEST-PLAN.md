# Exact security test specifications — planned, NOT EXECUTED

Run only after separately approved implementation, using explicit fake User/Estore handles and synthetic local JWTs/credentials. No production DB, Redis, model bootstrap, network, module-cache patches or runtime injection. Construct handlers using their declared public constructor inputs. Each test gets an independent router/rate map; deterministic time tests use SessionService clock argument and isolated test time control approved with the future test implementation. Keys are future isolated fixtures, never actual server secrets. No key values or live tokens are present here.

Baseline fixture: unique synthetic current user with a canonical ObjectId, exact email and MD5 of a known plaintext fixture password; primary or bounded secondary membership; active store whose resellid equals the current user's resellid; parent Estore active and reseller.status true. Non-admin requires accessibility[role] containing orders. These mirror Stage 7, not assumed production data. Config uses both literal true flags plus dedicated isolated key and the proposed issuer/audience. `getSources` returns fake handles; fake chain implements find/select/sort/limit/maxTimeMS/lean/exec and rejects any write. Prove query projection excludes showPass. Optional valid bearer is a scanner-purpose HS256 JWT with sub/email/iat/exp/iss/aud/storeId/packageId matching the fixture.

Expected error E(code) is exactly `{error:{code,message},requestId:<server UUID>}` with messages from AUTH-MODULE-SPEC session-config. No additional fields, reflected input, stack or details. Every route-local result has Cache-Control:no-store and Pragma:no-cache. SUCCESS is exactly `{token:<verified scanner JWT>,tokenType:"Bearer",expiresAt:<integer exp>,scope:{storeId,packageId,userId,role},requestId:<server UUID>}`. Verify signature/HS256/issuer/audience/sub/email/store/package/900-second lifetime and scope against current fixture records, not string snapshots. No secret except the intended new browser token may appear. Disabled/config failures precede rate/parser/password/DB work. Global main-server parser failures happen earlier and are explicitly blocked for uniform route-local errors.

## 01. Flag undefined

- Setup: Main flag true; session flag absent; provider call counter zero.
- Input: Valid JSON credentials; no Authorization.
- Expected status: 503 (variants specified below).
- Expected response: E(DISABLED).
- Security property and variant expectations: No credential/provider evaluation.

## 02. Flag disabled

- Setup: Session flag false; main flag true.
- Input: Valid JSON credentials.
- Expected status: 503 (variants specified below).
- Expected response: E(DISABLED).
- Security property and variant expectations: Explicit disable fails closed.

## 03. Flag malformed

- Setup: Repeat session values empty, TRUE, 1, true-space, yes; main true.
- Input: Valid JSON credentials.
- Expected status: 503 (variants specified below).
- Expected response: E(DISABLED).
- Security property and variant expectations: Only literal true opts in.

## 04. Flag explicitly enabled

- Setup: Both flags true; dedicated fixture config and trusted fixture handles valid.
- Input: Valid JSON credentials.
- Expected status: 200 (variants specified below).
- Expected response: SUCCESS as defined above.
- Security property and variant expectations: Configured fresh credential flow; separately main false still503/DISABLED.

## 05. Missing Authorization

- Setup: Enabled valid fixtures; Authorization absent.
- Input: Valid fresh email/password/storeId.
- Expected status: 200 (variants specified below).
- Expected response: SUCCESS as defined above.
- Security property and variant expectations: First issuance requires password, not an already issued scanner token; repeat missing password ->400/INVALID_PAYLOAD.

## 06. Malformed Bearer

- Setup: Enabled valid fixture config.
- Input: Authorization: Basic abc; then Bearer empty; duplicate/comma header; oversized header.
- Expected status: 401 (variants specified below).
- Expected response: E(INVALID_TOKEN).
- Security property and variant expectations: Reject malformed header without fallback.

## 07. Bad JWT signature

- Setup: Scanner claims structurally valid; sign with a distinct isolated test key.
- Input: Valid credentials plus altered-signature Bearer.
- Expected status: 401 (variants specified below).
- Expected response: E(INVALID_TOKEN).
- Security property and variant expectations: Signature verification mandatory.

## 08. Unsupported algorithm

- Setup: Mint isolated HS384 token and unsigned alg=none token.
- Input: Valid credentials plus each Bearer.
- Expected status: 401 (variants specified below).
- Expected response: E(INVALID_TOKEN).
- Security property and variant expectations: Only HS256 allowed.

## 09. Expired JWT

- Setup: Fixture clock at or after exp; repeat valid signature with no exp, no iat, future iat, lifetime>900.
- Input: Valid credentials plus Bearer.
- Expected status: 401 (variants specified below).
- Expected response: E(INVALID_TOKEN).
- Security property and variant expectations: Expiry/age mandatory; legacy no-exp cannot bypass.

## 10. Missing token identity

- Setup: Validly sign fixture token separately omitting email and sub; include missing storeId/packageId variants.
- Input: Valid credentials plus Bearer.
- Expected status: 401 (variants specified below).
- Expected response: E(INVALID_TOKEN).
- Security property and variant expectations: Authenticated identity and signed scope required.

## 11. Wrong issuer

- Setup: Sign with correct fixture key but different iss.
- Input: Valid credentials plus Bearer.
- Expected status: 401 (variants specified below).
- Expected response: E(INVALID_TOKEN).
- Security property and variant expectations: Purpose issuer bound.

## 12. Wrong audience

- Setup: Sign with correct fixture key but aud=clavmall-estore or other audience.
- Input: Valid credentials plus Bearer.
- Expected status: 401 (variants specified below).
- Expected response: E(INVALID_TOKEN).
- Security property and variant expectations: Scanner audience isolated.

## 13. Unauthorized store

- Setup: Password proof row exists in first read; current resolver then reports inactive store or revoked membership.
- Input: Selected fixture storeId and correct credentials.
- Expected status: 403 (variants specified below).
- Expected response: E(DENIED).
- Security property and variant expectations: Current records override stale credential membership.

## 14. Cross-tenant store selector

- Setup: Fixture identity has membership only in store A/package A; fixture store B belongs to B.
- Input: Correct A password with body storeId=B.
- Expected status: 401 (variants specified below).
- Expected response: E(INVALID_CREDENTIALS).
- Security property and variant expectations: Scoped credential lookup returns no unique user; no browser tenant trust. Also valid A Bearer + B selector ->401/INVALID_TOKEN.

## 15. Cashier permitted

- Setup: Current cashier primary or secondary store membership; active store and active reseller; orders permission.
- Input: Correct fixture credentials, selected authorized store.
- Expected status: 200 (variants specified below).
- Expected response: SUCCESS as defined above.
- Security property and variant expectations: Actual current cashier permission authorizes session only; response role cashier.

## 16. Cashier outside permission

- Setup: Valid credential proof and membership, but accessibility.cashier lacks orders.
- Input: Correct fixture credentials.
- Expected status: 403 (variants specified below).
- Expected response: E(DENIED).
- Security property and variant expectations: Role alone does not grant orders permission.

## 17. Administrator permitted

- Setup: Current admin, correct membership/reseller/store; no orders list needed for admin.
- Input: Correct fixture credentials.
- Expected status: 200 (variants specified below).
- Expected response: SUCCESS as defined above.
- Security property and variant expectations: Trusted admin role; browser-supplied role extra field ->400/INVALID_PAYLOAD.

## 18. Unknown or revoked user

- Setup: Unknown row -> no lookup result; separately matching row with deleteAccount.request=true.
- Input: Correctly shaped fixture credentials.
- Expected status: 401 (variants specified below).
- Expected response: E(INVALID_CREDENTIALS).
- Security property and variant expectations: Unknown user generic401; revoked present user variant ->403/DENIED, never grants.

## 19. Missing authorization data

- Setup: Repeat no getSources, missing model handle, model query exception; then missing store/reseller records.
- Input: Valid credentials and enabled config.
- Expected status: 503 (variants specified below).
- Expected response: E(UNAVAILABLE).
- Security property and variant expectations: Missing provider/handles/query error503; absent or inactive actual membership/store/reseller403/DENIED; never accepts fallback.

## 20. Internal credential leakage

- Setup: Fixtures include sentinel password hash, showPass, internal AI HMAC secret and key-bearing thrown error; capture response and log spies.
- Input: Successful request, then source exception request.
- Expected status: 200 (variants specified below).
- Expected response: SUCCESS as defined above.
- Security property and variant expectations: Success exact allowlist; neither response nor logs contains any sentinel/internal config. Exception variant503/UNAVAILABLE generic message.

## 21. Duplicate requests

- Setup: Hold first fixture DB promise pending; same router instance; first request owns sole lease.
- Input: Two identical simultaneous valid credential requests.
- Expected status: 429 (variants specified below).
- Expected response: E(BUSY).
- Security property and variant expectations: Second request no new work; first settles200/SUCCESS. Sequential duplicates may both200 after fresh proof; no writes/session collection. Sixth attempt/window429/RATE_LIMITED.

## 22. Invalid payload

- Setup: Enabled config, no queries expected.
- Input: Unknown fields; arrays; wrong content type; empty/wrong-type password; invalid store/email; conflicting legacy headers.
- Expected status: 400 (variants specified below).
- Expected response: E(INVALID_PAYLOAD).
- Security property and variant expectations: Strict allowlist/selector shape. Serialized payload>8192 variant413/TOO_LARGE. Raw malformed JSON must additionally be tested at full-server boundary: exact response BLOCKED by existing upstream parser.

## 23. Unexpected middleware exception

- Setup: getSources rejects with error containing URI/key/stack; separately hold query beyond deadline.
- Input: Valid request.
- Expected status: 503 (variants specified below).
- Expected response: E(UNAVAILABLE).
- Security property and variant expectations: Sanitized code/message/UUID only. Deadline variant504/TIMEOUT; admission stays occupied until actual settlement, no late success.

## 24. Existing scanner regression

- Setup: Original and proposed route graphs in isolated fixtures; session flag absent; no production imports or network.
- Input: Existing single-product/POS/auth requests; existing multi-scan paths; new session request.
- Expected status: 200 (variants specified below).
- Expected response: Original fixture contract as defined below.
- Security property and variant expectations: Original fixture success/status/body unchanged, with their existing fixture error statuses unchanged; new session503/DISABLED; no cart/auth/scanner source changes or writes.

## Additional required assertions in the same isolated suite

Verify 32-byte minimum key and absent/wrong issuer/audience config503; same-valued legacy/service key config503; flags never provision secrets. Verify no credential/hash accepted as a shortcut, duplicate user rows rejected401, malformed credential hashes rejected401, no browser prices/roles/tenant headers, ambiguous identity never picked arbitrarily. Test store/package/sub mismatch and membership revocation between first and final current lookup; non-admin cannot acquire an admin role by token/header claims. No JWT role claim is trusted.

Test per-peer map cap128/window reset, peer derived from socket rather than forwarded headers, sole lease after timeout/disconnect, no unhandled promise rejection, maxTimeMS on each query, no persistent session writes and no late response. Full-server integration must confirm the effective environment mount prefix `/<API_ROUTES>`; proposed router-relative method/path is POST /ai/multi-scan/session. Do not assume API_ROUTES has a particular deployed value.

The old Stage 2 downstream routes are unchanged and do not automatically consume the new dedicated JWT. Test that fact rather than claiming Batch A establishes an authenticated end-to-end scanner. Consumer tests requiring the new scope-aware Batch B boundary remain blocked until its separate review.

These are 24 named security/regression cases with specified variants, not 24 passing tests. No executable test file or test runner was created or run during this preview. Historical 428-test evidence is unchanged and not rerun.
