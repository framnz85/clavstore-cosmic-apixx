from pathlib import Path
out=Path('docs/multi-scan/stage11-b/batch-b1-credential-security')
def doc(name,text):
 with (out/name).open('x') as f:f.write(text)
doc('SECURITY-FINDINGS.md','''# Source-verified findings and classification

Application-boundary source review only: no production reachability assumption, production attack, account lookup, Mongo/Redis connection or live user mutation. CREDENTIAL-WRITE-INVENTORY.md/.json contain 40 operations and full authentication/scope matrix. SOURCE-EVIDENCE.json pins 507 inspected files; MUTATION-SCAN.json cross-checks 60 source mutation/issuance anchors. Findings are distinct from proposed fixes; none of the new fixes is applied.

## F01 — Critical: generic credential and authority mass assignment

Classification: **Confirmed unauthorized credential write; confirmed privilege escalation.**

C01–C04: routes/user.js:47–54 and routes/appuser.js:16 bind decode-only authCheck, plus the weak staff guard on import. controllers/user.js:963 updateUser uses req.body/objValues in findOneAndUpdate at1000; the output select excluding password/showPass is not a write restriction. updateCustomer:1024 updates req.body by supplied target id and store, or target id alone for a decoded actor whose current row has superAdmin. controllers/app/user.js:151 updates broad objValues by claimed email/header reseller. importUsers:1232 updates complete rows by id/store or email/store and spreads inserts. models/user.js:43 defines writable password String; role, email, superAdmin, estoreid(s), resellid, emailConfirm, verifyCode and changeStore also exist.

Impact: choose a password representation/login email or privileged fields for a selected account, elevate cashier authority, reassign membership/ownership, or overwrite credentials through import without independent proof. Known account/store selectors plus forged decoded identity satisfy the visible application chain; no live exploit was attempted. Store predicates are real constraints on old-row selection, not permission to write new tenant fields. Ordinary same-store cashier plus arbitrary store-B id does not universally pass every query; cross-store paths include the superAdmin branch, independently selected warehouse target, owner namespace mutations and forged identity claims.

## F02 — Critical: unsafe signed credential issuance

Classification: **Confirmed unauthorized credential write (authentication credential issuance)** for C26; **confirmed privilege escalation** for C05.

routes/order.js:37 publicly binds GET /gratis/user-order-app/:orderid. controllers/order.js:80 loads an order by id+header store/cache, populates orderedBy without a credential exclusion, then at124 signs {email: order.orderedBy.email} and returns the token. There is no password or ownership proof. Possession of order selectors is required; an ObjectId is not an authentication capability. The populated user may also expose stored hash/plaintext showPass depending on record contents. This is a token issuance path, not a password database update.

routes/user.js:42 publicly binds createNewUser. controllers/user.js:740–769 copies requested role, selected store/reseller and password into new User, saves it, then at793 signs email-only token. An unauthenticated caller can request an allowed admin/staff role under a selected existing namespace. Duplicate-email checks are only scoped prechecks, not a unique ownership/last-owner constraint. These issuers mean simply verifying existing JWT signatures does not establish trustworthy account ownership or privilege. Existing normal login has real password proof and is treated separately.

## F03 — Critical: store authority fields are writable without verified owner authorization

Classification: **Confirmed privilege escalation.**

C13–C18: controllers/estore.js:298 updateEstore passes broad values into store updates, including a second arbitrary warehouse id; :682 updateEstoresVissible is public and passes req.body to findByIdAndUpdate. models/estore.js contains status, resellid, reseller and accessibility authority fields. createEstore:338 accepts reseller/namespace data publicly; addNewEstore:454 and copyingEstore:493 choose parent/source independently from the guarded header store. deletingEstore:695 can delete another selected store/users and reassign primary admin membership using caller-provided parent. Normal staff guard permits cashier and establishes no cryptographically verified actor. Store predicates or UI menu hiding are not independent owner authorization.

## F04 — High: membership/verification/revocation side effects

C06: **confirmed privilege escalation**, conditional on the dedicated-store repair branch: controllers/user.js:269 updates User by email only to restore primary store membership from a GET. Removed membership is not proof of a new grant. C07: **confirmed privilege escalation** through coupled account confirmation and admin-store reactivation once the weak identity/code predicate is satisfied; **potential vulnerability requiring further verification** for missing/null/empty-code behavior and individual challenge consumption races. C01 allows verifyCode assignment; frontend VerifyEmail.js:142 generates/stores its own code through generic update. The challenge therefore is not independent proof in the existing combined flow.

C11: **potential vulnerability requiring further verification** for credential-authority impact, with confirmed unauthenticated account denial-marker writes by email only. C12/C18: **confirmed unauthorized credential write** in the form of account deletion/removal and membership reassignment through weak guards. No destructive operation was executed.

## F05 — High: shared-password account provisioning

Classification: **Confirmed unauthorized credential write (unproved account provisioning)**, C19–C22. Main order.js:1201/1384 and app/order.js:278/480 create a new customer with a known fixed MD5 credential/plaintext showPass if the supplied identity is not found. Role is fixed customer and this branch does not overwrite an existing account password. The vulnerability is usable credential provisioning for a claimed customer identity without verified enrollment, not unconditional reset of existing users. Four order paths must be considered; no cart/order operation was performed.

## F06 — Critical/high: payment provider credentials share the weak writer boundary

Classification: **Confirmed unauthorized credential write**, C28–C30, conditional on configured provider-secret usage. controllers/payment.js:78 creates broad Payment data; :90 updates broad body; :110 deletes by selected id/store. payXendit:46 passes paymentOption.accNumber as secretKey. These operations can replace/remove provider authentication material with only legacy guards. This is separate from user-password containment and needs explicit payment workflow review. No provider connection or secret value was read/tested.

## F07 — Legacy authentication and login migration

Classification: **Potential vulnerability requiring further verification** for C08/C23–C25 as standalone arbitrary credential writes. authCheck (middlewares/auth.js:5) only decodes; it verifies no signature or exp despite its error message. adminGratisCheck:19 queries by decoded email/header store and admits admin/moderator/cashier. Main and app login use password MD5 equality; digest-login accepts the stored representation directly. Their jwt.sign calls set no explicit exp or signed subject/store claims. changePassword:1099 additionally matches old-password MD5, so this route alone is not a confirmed no-proof reset; raw user response, MD5 and missing epoch revocation remain risks.

## F08 — Adequately protected local boundary

C09/C10: both recovery PUT routes are currently terminal HTTP503 and exclude the original auth/DB/password handlers. Their current user-router hash is a8c092ffc22484b7d5cfd0b876ac160a04a2343d12bedea0d39a56a198216ddd. This is **adequately protected** for those two reached-route credential writes only. Scanner is disabled by default; its source/local security checks are unchanged. None of these facts certifies the rest of the application.

## F09 — Missing trusted data blocks safe reopening

Classification: **Unresolved due to missing trusted data.** Current schema has no authoritative, immutable subject-to-tenant grant ledger, user active/deleted policy separate from client-writable markers, credential epoch, authorization epoch or protected profile version. Existing roles/ownership/status may have been written through vulnerable routes; a fresh DB read alone cannot certify them. No production integrity audit or ownership attestation was performed. New token issuer, authoritative grant migration/backfill, atomic adapter and revocation consumers require separate review. The proposed pure profile core fails closed without those dependencies and is not a deployable replacement.

## F10 — Adjacent findings, scope limits

C27 referral refid mutation is financial attribution, not shown to be login ownership. C32 global default selection, C33 timestamps, C34 wishlist, C35–C38 billing metadata and C39/C40 AI filesystem writes remain integrity/authorization concerns; indirect credential entitlement impact is potential/unresolved. Mock license routes generate keys but have no implemented authoritative persistence/validation. No extra active AI password/profile database writer was found; AI still has weak decode-only authorization. Frontend guards/localStorage never count as trusted identity. No finding is marked safe merely because it is outside the first proposed patch.
''')
doc('AUTHENTICATION-ANALYSIS.md','''# Authentication and target authorization analysis

The per-operation matrix is CREDENTIAL-WRITE-INVENTORY.json.authentication and query_scope/independent_proof_or_permission. All middleware chains are sourced from actual router declarations. Main and AI server.js autoload every route file under /<API_ROUTES>; neither has an additional application JWT gate. CORS/body parsing/logger are not authenticated identity proof; external ingress behavior is unknown. No server/bootstrap was executed.

| Operation family | Signature / expiry | Identity and current role | Tenant and target permission |
| --- | --- | --- | --- |
| Generic self/app profiles | Neither | Unverified decoded email; no independent role proof | Existing query uses caller header store/reseller; broad update may alter authority; no signed immutable subject |
| Customer target update | Neither | Unverified actor; superAdmin read from mutable row | Target id+header store, or unscoped id for superAdmin; no administrator requirement |
| Import/user delete/store admin | Neither | Row queried by unverified email + selected store; cashier accepted | Some predicates scoped, but selected target/new ownership or warehouse parent may be independent; no explicit protected grant |
| Public registration/store creation/order-token issuer | No actor token verified | No owner/target proof; selected identifiers suffice for shown branches | Client-selected namespaces or order id/store; credential/role issuance not authenticated |
| Password change | Neither JWT check | Decoded identity plus independent old-password equality | Email+store+old digest; not a demonstrated no-proof reset |
| Email verify | Neither | Decoded email plus equality to mutable/client-chosen code | Account query scoped; admin status coupling can reenable store; no server challenge expiry shown |
| Existing disabled recovery | No auth needed for denial | Never reads identity | Terminal503 excludes original guards/controllers; no target query |
| Proposed future profile core | Explicit HS256 verification, issuer/audience/purpose, exp/iat/max lifetime | Signed immutable subject + fresh trusted current state/epochs required | Signed store/package, header consistency, atomic scoped commit; no privileged/import write |

Do not retrofit jwt.verify into the global legacy middleware here. Legitimate legacy tokens lack required exp/sub/tenant/purpose and two public sources issue signed tokens without safe ownership proof. A global change could lock out clients while still accepting unsafe signed credentials if relaxed for compatibility. No decoding fallback, missing-exp grace, role-from-claim grant, header-as-authority, email-only mapping or scanner-token reuse is proposed.

Installed jsonwebtoken 8.5.1 verify.js was inspected locally for explicit algorithms, signature, expiry, issuer, audience and clock behavior. No dependency upgrade or claim about the current external advisories was made. Candidate core explicitly restricts algorithms to HS256 and requires bounded numeric exp/iat; existing library defaults are not relied upon. Dependency upgrade needs separate lockfile/compatibility review before production integration.

Trust U01: imported/user/store rows can be client-controlled under current source. Before privilege changes/import reopening, establish independently attested ownership and membership, protected lifecycle fields, transaction/CAS semantics, uniqueness and credential/session revocation policy. No invented current schema field is treated as present. Future core field names describe a proposed adapter contract only.
''')
doc('REMEDIATION-PLAN.md','''# Risk-ranked plan and recommended implementation order

All patches are review-only. Review primary containment independently of the wider outage decisions; no implementation follows from this document. Existing two-route recovery containment stays intact in every candidate.

| Order | Candidate / risk | Concrete behavior | Coverage and compatibility limit |
| --- | --- | --- | --- |
| 1 | 01-GENERIC-WRITER-CONTAINMENT.diff; F01 critical | Four profile/customer/app/import PUT routes return generic503 before legacy guards/controllers | Smallest safe immediate containment without trusting legacy tokens/data. Legitimate profile updates, staff edits and imports also stop. It does not close the other authority writers. |
| 2 | 02-RELATED-AUTHORITY-CONTAINMENT.diff; F02/F03/F04 critical | Twelve named authority/issuer routes return503 | Includes public user/store enrollment, store/warehouse editing/copy/delete, email verify/delete request/user delete, public order-token issuer and affiliate assignment. Broad compatibility impact requires explicit per-route review. |
| 3 | 03-REMOVE-IMPLICIT-MEMBERSHIP-WRITE.diff; F04 | Removes only dedicated-store implicit primary-membership repair block | Keeps user-details route and promo timestamp behavior, but no longer restores lost primary membership on GET. Existing data access weakness not repaired by this deletion. |
| 4 | 04-STOP-SHARED-PASSWORD-PROVISIONING.diff; F05 | Four new-customer branches return409 before creating a shared-password User | Existing-customer order branches remain; new identity enrollment via those branches fails. Prior reads occur; never describe this as whole order operation suppression. |
| 5 | 05-PAYMENT-CREDENTIAL-CONTAINMENT.diff; F06 | Add/update/delete payment configuration routes return503 | Existing read/pay routes unchanged; provider configuration maintenance unavailable. No payment operation is tested/run. |
| 6 | Trusted-data/credential migration; F09 blocker | Design, audit/backfill and separately approve protected identity/grant/epoch state, issuer, atomic adapter, key provisioning and client transition | No exact migration patch is justified without the data-owner/topology/uniqueness contract. Do not enable writes from current rows by assuming role/status trustworthy. |
| 7 | 06-FUTURE-SELF-PROFILE-CORE.diff, design candidate | Adds a dependency-injected verified-token/strict-allowlist core and thirteen synthetic test drafts | No production binding, default key, DB adapter or token issuer. Without dependencies it returns503. Not sufficient for production integration and not a standalone reopening patch. |
| 8 | Privileged/import replacement and secure enrollment/recovery | Separate reviewed account-admin/profile-import/enrollment/challenge writers with protected authority and revocation | No permissive existing-handler fallback. Secure reset replacement/global legacy migration remain separate. |

01–05 form a conservative containment series, not a complete authentication repair. The public issuer and broad store/enrollment paths are critical companions: approving only01 must explicitly retain those residual risks. File overlap is tracked by PATCH-MANIFEST.json with exact preimage/postimage hashes; the numerical order is the prepared application order. It is not permission to apply all companions automatically.

## Smallest profile behavior that can be safely reopened

Future core supports only name and phone for the verified current subject. Any password/hash/showPass, recovery code, email/login identifier, role, superAdmin, wholesale, membership, estoreid(s), reseller, refid, status, verification or arbitrary/unexpected key is rejected with400 and zero writes. Mongo operators, dotted keys, prototype keys, arrays and whole-user objects are rejected. Initial allowlist deliberately excludes nested Object/Mixed addresses/images and tracking/limits fields until individually specified. A profile field filter on top of decode-only auth would still let forged identities change someone else's profile; it is not proposed as sufficient remediation.

Future auth uses a separately provisioned key and distinct issuer/audience/purpose, mandatory <=900-second lifetime, immutable subject/store/package and credential/authorization epochs. No role assertion from the token grants authority. Resolver checks fresh authoritative user/tenant active state and current membership; commit must atomically compare versions/state/expiry and use only scoped $set for the approved fields, validators enabled, no upsert. Missing trusted data denies. Response is {ok:true}; clients must reload an approved safe profile projection. Generic endpoints never become password/role/admin writers again.

## Restricted import design (not implemented)

Keep old import503 until a verified current tenant owner/admin permission from a protected grant source is available; cashier and moderator fail403 unless a separately approved explicit permission exists. Define a separate profile-only, update-existing-customer endpoint: bounded batch/row schema, mandatory immutable target id, tenant from signed current grant, name/phone only, no email-match upsert, credential/hash/recovery/role/member/owner fields rejected, duplicate target ids rejected, all rows validated/authorized before writes, transaction or explicit reviewed no-partial-write semantics, optimistic versions and audit. New customer credentials/enrollment and staff-role imports are separate operations. Do not hash and accept imported passwords as a shortcut: that still permits unauthorized credential replacement.

## Privileged and identity changes

Email/login ownership requires fresh independent proof of current account, verified new-address delivery, collision/uniqueness constraints and atomic identity+revocation transition; generic profile update must reject email. Role/membership/owner changes require a protected current grant, same-tenant target predicate, last-owner/self-elevation safeguards, transaction and version/epoch advancement. Email confirmation cannot reactivate an independently disabled store. New enrollment must never let a public caller select admin or a parent namespace without independently verified invitation/ownership. These require separately reviewed schema/data and frontend changes, not a small misleading global middleware substitution.
''')
doc('COMPATIBILITY.md','''# Compatibility and migration assessment

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
''')
print('Wrote findings, auth analysis, ranked plan, compatibility assessment')
