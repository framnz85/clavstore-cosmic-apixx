# Security tests —13 required scenarios and fixture gates (planned only)

No new executable tests or production data. These expectations target the proposed protected-writer/status/version architecture, not claims that current unsafe legacy routes already pass. Authority schema/cutover/interfaces require approval before test implementation. Existing428 historical,28 security and31 Stage2 results are retained historical evidence, not rerun here.

Fixtures: synthetic User._id/email/password hash; active/pause/stop/pending store; canonical reseller parent; primary/secondary memberships; real declared fake model/query interfaces on one explicitly owned connection; separate mutable server-owned principal-policy records with state/version/grants; fake verified-identity service; independent fake protected writer with scoped CAS and audit sink. Never use live DB/Redis, model bootstrap, listening server or monkeypatch global exports/require cache. Keys are synthetic test-only values; token claims/scopes/expiry are checked cryptographically in later isolated test processes. Mock policy enrolment is explicit and attested within fixture state, not production constant-active code.

For future scanner tests, use exact existing fixed error DTO + UUID/no-store. Proposed new version claim and writer409 contract require their own approved API spec; statuses below are explicit desired behavior, not changes applied by this review. No secret, hash, raw policy, URI or foreign product/user row in response/logs.

## 01. Disabled users

- Setup: Independent record state=disabled; valid current User/store and correct password; optional correctly signed JWT.
- Input: Issue fresh session; separately scan with an unexpired scanner token.
- Expected: 403 DENIED for known disabled state; no token/result; no default active.
- Fixture assertion: deny unauthorized state transition/access and record zero unrelated writes; verify scoped current identity/policy before any positive result.

## 02. Revoked cashiers

- Setup: Active cashier v1 becomes revoked v2 via protected CAS; current legacy role still cashier.
- Input: Reuse old valid-signature token on scan.
- Expected: 403 DENIED for known revoked state; current role cannot override policy; no inference/output grant.
- Fixture assertion: deny unauthorized state transition/access and record zero unrelated writes; verify scoped current identity/policy before any positive result.

## 03. Changed roles

- Setup: Protected role change advances policy to v2; old token v1; separately User role drifts without matching grant.
- Input: Request with v1; issue after mismatched role/grant.
- Expected: 401 INVALID_TOKEN for old epoch;403 DENIED for current-role mismatch; no role claim/body override.
- Fixture assertion: deny unauthorized state transition/access and record zero unrelated writes; verify scoped current identity/policy before any positive result.

## 04. Removed store membership

- Setup: Remove approved store grant and increment version before legacy cleanup; separately legacy membership absent.
- Input: Old token or new issuance selected removed store.
- Expected: Old epoch401; new scope403 (or401 INVALID_CREDENTIALS when scoped User row absent); no automatic repair/regrant.
- Fixture assertion: deny unauthorized state transition/access and record zero unrelated writes; verify scoped current identity/policy before any positive result.

## 05. Cross-store access

- Setup: Token signed for A, policy only A; selected B with no grant.
- Input: Scan token A against B; profile tries new membership.
- Expected: Token/scope mismatch401; valid identity without requested grant403; no foreign row output/write.
- Fixture assertion: deny unauthorized state transition/access and record zero unrelated writes; verify scoped current identity/policy before any positive result.

## 06. Cross-package access

- Setup: User/policy reseller A, selected store reseller B; billing plan record exists but conveys no scope.
- Input: Request B with A proof/token.
- Expected: 403 DENIED for current namespace mismatch; billing Package id/paid status cannot grant tenant ownership.
- Fixture assertion: deny unauthorized state transition/access and record zero unrelated writes; verify scoped current identity/policy before any positive result.

## 07. Missing status records

- Setup: Valid credential row but no principal policy or wrong schema; later policy disappears before final check.
- Input: Fresh issuance or scan.
- Expected: 503 UNAVAILABLE, sanitized; no absent-is-active, legacy-role fallback or best-effort cached grant.
- Fixture assertion: deny unauthorized state transition/access and record zero unrelated writes; verify scoped current identity/policy before any positive result.

## 08. Database unavailability

- Setup: GetHandles absent/disconnected/wrong connection; fake read throws; status operation delayed.
- Input: Valid fixture request.
- Expected: 503 UNAVAILABLE for source failure;504 TIMEOUT for outer deadline; lease held until true settlement; no fallback connect/leaked URI.
- Fixture assertion: deny unauthorized state transition/access and record zero unrelated writes; verify scoped current identity/policy before any positive result.

## 09. Concurrent authorization changes

- Setup: Barrier after initial grant read; revoke/increment before final publication authority read; separate CAS writer conflict.
- Input: Finish in-flight scan and issue concurrent status mutation.
- Expected: Deny/discard old epoch401 or inactive403; writer conflict409 and no lost update. If revocation commits after final decision, document permitted already-linearized result rather than assert impossible zero-window behavior.
- Fixture assertion: deny unauthorized state transition/access and record zero unrelated writes; verify scoped current identity/policy before any positive result.

## 10. Credential reuse after revocation

- Setup: v1 token; revoke v2 then independently reenable v3; underlying key/password unchanged.
- Input: Replay v1; separately fresh password issuance at v3.
- Expected: v1 remains401 INVALID_TOKEN despite active again; fresh current proof and grant may200 with new epoch.
- Fixture assertion: deny unauthorized state transition/access and record zero unrelated writes; verify scoped current identity/policy before any positive result.

## 11. Unauthorized role modification

- Setup: No valid signature then verified low-privilege subject; fresh policy only allows profile edit.
- Input: Attempt role/superAdmin/changeStore update via profile/create/import/app path.
- Expected: Unauthenticated401; authenticated unauthorized403 (malformed/unknown profile fields400); zero authority writes, no version reset or staff enrollment.
- Fixture assertion: deny unauthorized state transition/access and record zero unrelated writes; verify scoped current identity/policy before any positive result.

## 12. Unauthorized membership modification

- Setup: Verified actor granted store A only; target B or user outside tenant; main/app/import/copy/delete targets.
- Input: Attempt estoreid/estoreids/resellid update or cross-target store copy/delete.
- Expected: 403 DENIED or invalid shape400; no foreign mutation; membership read cannot repair denied grant.
- Fixture assertion: deny unauthorized state transition/access and record zero unrelated writes; verify scoped current identity/policy before any positive result.

## 13. Privilege escalation attempts

- Setup: Forged token/role header/body; arbitrary status/version; duplicate users; public store visibility/settings payload.
- Input: Try authority changes through every inventoried generic writer.
- Expected: Forged proof401; forbidden authority403; unknown operator/dotted body fields400; ambiguous identity401/403; no granting from supplied ids/flags.
- Fixture assertion: deny unauthorized state transition/access and record zero unrelated writes; verify scoped current identity/policy before any positive result.

## Additional mandatory positive and negative cases

- Legitimate active cashier/admin with explicit store/action grant and current matching User role can issue and scan200; admin gets no implicit foreign-store or index-rebuild grant. Legitimate verified profile edits to approved non-authority fields still succeed. Public signup is customer-only and creates no active scanner authority.
- Last-privileged-operator/owner transitions need an explicitly approved recovery/attestation policy; no self-declared bootstrap owner or customer/superAdmin flag. Enrollment/update/removal tests must use approved operator authority, scoped target, CAS, monotonic version and audit entries.
- Password change/reset temporarily disables and advances epoch before credential update; failure remains disabled; final reenable increments again. No policy version reuse or unreviewed repair to active.
- Stale cached User/Redis/policy data cannot override current primary authority. Duplicate users (one revoked, one active) must not be filtered down to a grant. Invalid/future status timestamps alone do not establish a current scoped policy.
- Scanner expirations checked after asynchronous work; signatures, HS256, issuer/audience/sub/store/package/mandatory version all verified. Old no-exp/unsigned/legacy-purpose tokens remain rejected; no credential fallback to client digest.
- S01 new isolated containment fixture: all forgot-password requests503, controller/DB calls zero, exact legacy err response; recovery UX intentionally unavailable pending approved secure flow. S02 fixture log sink: sentinel URI/error absent and connection creation/export behavior unchanged, with no live import.
- Initialization never starts a second connection; disabled route does not obtain sources/models; wrong connection with same modelName denies; disconnect closes admission; timeout/cancel retains lease until actual settlement.

All13 cases require explicit await barriers and assertions, not sleep-based race guesses. Full native/HTTP/ingress and production-reachability questions are separate authorized staging work. No skip/suppression of failing security tests when later implemented; report any source/caller compatibility changes rather than broaden the approved file allowlist.
