# User status and revocation — verified facts and proposed minimum design

## Current source findings

Canonical models/user.js has role (admin/moderator/cashier/customer), primary estoreid, secondary estoreids, reseller resellid, deleteAccount.request, emailConfirm, superAdmin/changeStore and password. It has **no dedicated enabled/disabled/suspended state, authorization epoch, revokedAt or token/session-version record**. models/app/user.js is an alternate schema for the same model name, not an independent authoritative status provider. Its account-status semantics do not fill this gap. customerRoutes' mocked active field is unrelated and not persisted Gratis account authority.

Store status exists (pending/pause/stop/active); reseller.status is a separate boolean. These describe store/reseller availability, not individual cashier activation. emailConfirm verifies an email; controller verification may reactivate a store, but it is not trustworthy staff-account approval. upStatus/package/billing fields also are not per-user activation or verified ownership. User.deleteAccount.request=true is a deletion request and should deny as an additional condition, not an authoritative positive enabled-state rule. Its writer is currently unauthenticated/email-only, so request absence or clearing cannot prove active status.

Physical deletion denies fresh lookups but cannot distinguish never-existing from deleted without a tombstone/history record. Deleted and suspended individuals are not distinguishable by a complete existing account-state enum. Roles/membership can be changed or removed, and non-staff role/missing membership/inactive store would deny Stage7 current-data resolution. This can implement narrow current-access denial without new fields **if protected writers and every consumer are fixed**, but it is not a durable independent enabled/revoked lifecycle. The dedicated-store getUserDetails fallback can reassign missing primary membership on a read; broad updates can restore fields. No source-verified administrative revoke/reenable protocol or immutable ownership history found.

Legacy JWTs are not cryptographically invalidated by password/role/membership changes: issuers omit mandatory expiry and version, authCheck only decodes, and callers differ in which current rows they query. Removing a row may deny a particular controller but does not make the JWT signature invalid. Existing Stage7 service contracts perform current resolution, but all subsequent scanner consumers are not yet wired. Short lifetime alone is not revocation.

## Minimum secure design — NEW proposal, not existing fields

Do not add a supposedly trusted active/version flag to User while existing broad update/import/app handlers can mass-assign that same document. Recommended separate, scanner-specific authority collection, logical name **ScannerPrincipalAuthorization** (proposed, not currently registered or present). Use one authoritative record per canonical User._id; no email-only keys and no reuse of billing Package ids. No persistent scanner session/refresh collection is required.

Proposed schema/validation (all NEW; exact collection/model registration and index migration require approval):

| New field | Required meaning / constraints |
|---|---|
| _id | Canonical existing User ObjectId; unique record per identity; never chosen by HTTP client |
| schemaVersion | Exact1; missing/unknown schema denies |
| state | active / disabled / revoked / deleted; default revoked; active only by attested privileged enrollment |
| version | Positive safe integer, strictly monotonic via CAS/$inc, never reset/reused; overflow denies and requires explicit recovery |
| resellerId | Canonical approved reseller Estore id; must match current user/store resellid; not a billing plan |
| grants | Bounded <=1001 unique approved store entries; storeId, expected current User.role and explicit scanner operation allowlist; no inferred grant from raw User.role or superAdmin |
| updatedAt | Server-managed timestamp for audit, not a substitute for monotonic version |

Expected role in a grant must match the actual current global User.role; this does not invent existing per-store user-role support. Operation names are proposed policy labels, e.g. session.issue / scan.review; they are not current database columns/routes. No implicit index-rebuild/admin mutation grant. Effective permission is intersection of this protected grant and current valid store/user membership/status/reseller plus non-admin store orders permission. A new/broader role, store or reseller supplied by an unsafe legacy write cannot elevate this approved cap; mismatches deny. Existing credential writers still must be secured, because an attacker-controlled password for an already enrolled identity defeats fresh-password proof.

This collection needs its own protected writer, independent of public registration/profile/import/update APIs. Never expose it through generic body updates or infer active from a missing policy. Initial privileged operator and owner attestation must be explicitly established under a separate enrollment/access approval, not bootstrapped from a legacy decoded email, self-declared superAdmin or current unreviewed role alone. All writers and DB credentials must be inventoried before live trust is claimed.

## Mutation/revocation protocol

Single-record atomic CAS: match _id and expected version; update state/grants and increment version. Nonmatching CAS409 conflicts; retry only by rereading/re-authorizing, never last-write-wins. Revoking or removing a grant takes effect in the independent record first; later legacy-row cleanup cannot restore authority. Reenable always increments again, so old signed credentials remain unusable. Keep revoked/deleted tombstones; no reuse of old user ids or policy versions.

For credential, role, owner or membership changes spanning legacy User and independent policy: first atomically disable the policy and increment version; perform the explicitly authorized scoped profile/credential changes; attest/reconcile and reactivate with another version increment only after all checks succeed. Failure remains disabled for manual recovery. This conservative two-phase denial does not assume replica-set transaction support or silently restore an older version. A verified transactional implementation may later replace it after topology/driver review. Destructive deletion revokes/tombstones first and never reassigns admin authority from a supplied reseller header.

Every legitimate status/grant writer must be cryptographically authenticated and authorized against current independent policy, target tenant and operation. Self-service cannot alter roles, memberships, reseller, superAdmin, changeStore, state, version or trusted grants. Staff imports cannot bypass the protected writer. Store-wide permission/owner/status workflows must deny affected access immediately via current store checks and update impacted policy grants/versions under an explicit conservative transition; do not claim an unimplemented cross-record cascade is atomic. Store-wide version/fence records are a possible later requirement if strict global invalidation cannot be achieved with this principal protocol.

## Migration and rollback implications

No current schema guarantees authoritative account-status semantics without a new status source; a new collection/index/validator and explicit enrollment are a real migration. Do not implement or connect now. Later authorized steps: pin/review schema and indexes, capture immutable fixture/staging data/rollback manifests, create records default-revoked, validate canonical identity/tenant/store relations, independently attest allowed staff grants, enable only reviewed records with audited CAS. **Never backfill active for every existing admin/cashier or infer approval from untrusted fields.** Missing rows fail503 for unavailable authority (or generic credential denial before identity proof), not active. Known disabled/revoked/deleted denies401/403 without leaking other identities.

Cutover adds a separately approved signed authorization-version claim and current-policy checks to issuance/consumers. Tokens lacking that claim must be rejected after cutover; fresh password proof required. Legacy tokens retain their old POS flow until its separate remediation, but never upgrade to scanner authority. No key or config change here. A source rollback must close scanner admission, preserve revocation records/tombstones/monotonic versions, and never drop authority data or bulk reenroll active. Migration reversal/deletion needs its own access approval; exact data backfill scripts cannot be justified without approved schema/topology/operator policy.
