# Security test plan —19 required cases, fixtures only, NOT RUN

Authoritative candidate: TRUSTED-ADAPTER-v2.md / NEW-ADAPTER-v2.diff. Older adapter draft is superseded. No executable tests were created or run in this preview. Historical428, security28 and Stage2=31 results are from A.1 only.

Fixtures must explicitly construct an already-connected fake connection with readyState=1 and models registry holding fake GratisUser/GratisEstore models, matching modelName and .db identity. Query chain supports read(primary)/find/select/sort/limit/maxTimeMS/lean/exec and records all calls; any write, connect, listen, bootstrap import or unrelated model lookup fails the test. No production Mongo/Redis; no monkeypatching/require-cache mutation. Inject through existing createRouter({getSessionSources}) or public provider/repository constructors.

Use synthetic ObjectIds, exact email, synthetic plaintext password/MD5 fixture hash (never showPass), current User/Estore/reseller records and a separate fake authoritative identity-status function. The status function returns proposed DTO {userId,state,observedAt} from fixture-owned authority, not assumed Mongo columns; clock is explicit provider argument for deterministic freshness. Identity provider unavailable must503, never a default active result. Generated fixture keys exist only in later isolated test processes, not deployed env. Body and optional scanner Bearer follow existing Batch A contract; no new claim/tenant headers trusted.

Expected SUCCESS is exactly existing Batch A token/tokenType/expiresAt/scope/requestId DTO,900-second HS256 scanner JWT with configured issuer/audience/sub/email/store/package. Errors are existing fixed message/code plus UUID, no secret/document/stack. All route-local results no-store. Test exact status/code variants below rather than assuming every negative is403.

## 01. Valid active user

- Setup: Unique scoped credential row; active store and reseller parent; identity fixture returns active,current observedAt,matching userId.
- Input: Correct plaintext credentials and canonical storeId.
- Expected: HTTP 200, Scanner SUCCESS DTO; variants: Identity source and current DB membership both required.
- Property: deny unless verified credential, current authority and scoped permission all agree; no production data used.

## 02. Disabled user

- Setup: Authoritative identity fixture returns disabled with fresh observation.
- Input: Correct credentials for that row.
- Expected: HTTP 401, INVALID_CREDENTIALS; variants: Known disabled identity excluded without guessing User.disabled; if disabled on later read,403/DENIED.
- Property: deny unless verified credential, current authority and scoped permission all agree; no production data used.

## 03. Revoked user

- Setup: Status fixture revoked or row deleteAccount.request=true; also revoke between proof and current read.
- Input: Correct credentials.
- Expected: HTTP 401, INVALID_CREDENTIALS; variants: Initial denial; later changed status403/DENIED. Existing token alone never overrides revocation.
- Property: deny unless verified credential, current authority and scoped permission all agree; no production data used.

## 04. Unknown user

- Setup: Scoped User query returns zero rows.
- Input: Well-shaped fixture credentials.
- Expected: HTTP 401, INVALID_CREDENTIALS; variants: No guessed account or identity fallback.
- Property: deny unless verified credential, current authority and scoped permission all agree; no production data used.

## 05. Authorized cashier

- Setup: Current role cashier; primary/secondary membership; matching resellid; accessibility.cashier contains orders.
- Input: Correct credentials.
- Expected: HTTP 200, SUCCESS with cashier role; variants: Permission comes from current DB, not browser or token role.
- Property: deny unless verified credential, current authority and scoped permission all agree; no production data used.

## 06. Unauthorized cashier

- Setup: Same fixture but missing orders permission.
- Input: Correct credentials.
- Expected: HTTP 403, DENIED; variants: No role-only bypass.
- Property: deny unless verified credential, current authority and scoped permission all agree; no production data used.

## 07. Authorized administrator

- Setup: Current DB admin; verified membership and active reseller; identity policy active.
- Input: Correct credentials.
- Expected: HTTP 200, SUCCESS with admin role; variants: Admin still needs membership/tenant/status; extra body role field400/INVALID_PAYLOAD.
- Property: deny unless verified credential, current authority and scoped permission all agree; no production data used.

## 08. Foreign-store access

- Setup: User belongs to A only; B separate store.
- Input: A credentials with body storeId B.
- Expected: HTTP 401, INVALID_CREDENTIALS; variants: Scoped lookup denies foreign selector; valid signed A token with B selector401/INVALID_TOKEN.
- Property: deny unless verified credential, current authority and scoped permission all agree; no production data used.

## 09. Cross-package access

- Setup: User.resellid differs from selected store.resellid, or signed package claim differs.
- Input: Correct proof but mismatched current namespace.
- Expected: HTTP 403, DENIED; variants: Reseller namespace must match; billing Package id/paid billing record cannot substitute.
- Property: deny unless verified credential, current authority and scoped permission all agree; no production data used.

## 10. Missing membership

- Setup: No primary/secondary membership, or remove membership after credential proof.
- Input: Selected store lacks current membership.
- Expected: HTTP 401, INVALID_CREDENTIALS; variants: Absent initial scoped row401; later disappearance403/DENIED.
- Property: deny unless verified credential, current authority and scoped permission all agree; no production data used.

## 11. Missing role data

- Setup: Credential row lacks role or has customer/unsupported role.
- Input: Correct proof.
- Expected: HTTP 403, DENIED; variants: No default staff/admin role.
- Property: deny unless verified credential, current authority and scoped permission all agree; no production data used.

## 12. Inactive store

- Setup: Repeat schema statuses pause,stop,pending,missing; user proof otherwise valid.
- Input: Correct proof.
- Expected: HTTP 403, DENIED; variants: Only exact active accepted; inactive reseller parent also403.
- Property: deny unless verified credential, current authority and scoped permission all agree; no production data used.

## 13. Missing database record

- Setup: User missing; separately store/parent missing; separately absent model/connection/status provider.
- Input: Correct-shaped request.
- Expected: HTTP 401, INVALID_CREDENTIALS; variants: Missing user401; missing store/parent403/DENIED; missing source/model/connection503/UNAVAILABLE.
- Property: deny unless verified credential, current authority and scoped permission all agree; no production data used.

## 14. Database failure

- Setup: Fake exec throws URI/key/stack-bearing error; disconnect before/after read.
- Input: Valid request.
- Expected: HTTP 503, UNAVAILABLE; variants: Sanitized fixed message and server UUID; no raw error or fallback connection.
- Property: deny unless verified credential, current authority and scoped permission all agree; no production data used.

## 15. Stale authorization

- Setup: Fresh active on proof then revoked/role/membership changed on current read; separately identity observedAt older than notBefore.
- Input: Correct credentials; changed current state.
- Expected: HTTP 403, DENIED; variants: Revocation/role mismatch denies; stale/wrong-user/malformed/future policy decision503/UNAVAILABLE; no cached decision relabel.
- Property: deny unless verified credential, current authority and scoped permission all agree; no production data used.

## 16. Forged token

- Setup: Valid credentials but optional bearer tampered/unsigned/unsupported algorithm.
- Input: Malformed-signature bearer.
- Expected: HTTP 401, INVALID_TOKEN; variants: Strict signature/algorithm before password proof; no legacy decode upgrade.
- Property: deny unless verified credential, current authority and scoped permission all agree; no production data used.

## 17. Expired token

- Setup: Optional scanner token exp at/past clock or missing iat/exp.
- Input: Correct credentials plus invalid bearer.
- Expected: HTTP 401, INVALID_TOKEN; variants: Expiry/lifetime checks unchanged even with good password.
- Property: deny unless verified credential, current authority and scoped permission all agree; no production data used.

## 18. Incorrect signing key

- Setup: Correct issuer/audience/identity/scope but sign with separate test key.
- Input: Correct credentials plus bearer.
- Expected: HTTP 401, INVALID_TOKEN; variants: No fallback key or AI-service credential reuse.
- Property: deny unless verified credential, current authority and scoped permission all agree; no production data used.

## 19. Conflicting store identifiers

- Setup: Body store A plus legacy estoreid/resellid header B; separately signed store B and body A.
- Input: Conflicting header/body/token.
- Expected: HTTP 400, INVALID_PAYLOAD; variants: Existing issuance rejects legacy tenant headers; signed/body conflict401/INVALID_TOKEN.
- Property: deny unless verified credential, current authority and scoped permission all agree; no production data used.

## Additional regression/security invariants

Duplicate user rows, including one active plus one disabled/deletion-requested identity, must never be filtered into an apparently unique account: v2 passes ambiguous rows unchanged to existing rejection (credential401; tenant resolver403). Test this explicitly; this is why the draft was superseded. Unknown/wrong model names, mismatched connection, disconnected state, absent .read support and oversized DB result fail503. Queries remain primary, <=2 rows, projected and <=5000ms; no password/showPass/raw decision leakage.

GetSources must not run when either flag is absent/false/malformed. Missing callbacks return503 with enabled synthetic configuration; no production model import at module load or disabled route access. Role field in token/body cannot grant admin. Revoke between first and final user reads; check same subject/package/store and unchanged role/wholesale at issuance. Final expiry still checked after awaits.

Status callbacks must prove real source ownership/current reads before live use; mock success alone cannot establish that source. No test may use a constant-true production callback. Pending query/status promise at10-second deadline retains existing factory lease until actual settlement; cancellation/driver timeout contracts require additional fixture and separately scoped staging evidence. No early release, late200 or new DB fallback.

Unsafe legacy identity-write paths need separate fixture-only tests after their own reviewed patch: verified authenticated writer, server-side tenant boundary and field allowlists for staff role/membership changes, unauthenticated creation denied, normal self-service updates cannot modify authority. These are unmet source-integrity gates, not tests that this adapter proposal can claim to fix.
