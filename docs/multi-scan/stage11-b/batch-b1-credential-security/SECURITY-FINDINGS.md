# Source-verified findings and classification

Application-boundary source review only: no production reachability assumption, production attack, account lookup, Mongo/Redis connection or live user mutation. CREDENTIAL-WRITE-INVENTORY.md/.json contain 40 operations and full authentication/scope matrix. SOURCE-EVIDENCE.json pins 507 inspected files; MUTATION-SCAN.json cross-checks 60 source mutation/issuance anchors. Findings are distinct from proposed fixes; none of the new fixes is applied.

## F01 — Critical: generic credential and authority mass assignment

Classification: **Confirmed unauthorized credential write; confirmed privilege escalation.**

C01–C04: routes/user.js:47–54 and routes/appuser.js:16 bind decode-only authCheck, plus the weak staff guard on import. controllers/user.js:963 updateUser uses req.body/objValues in findOneAndUpdate at1000; the output select excluding password/showPass is not a write restriction. updateCustomer:1024 updates req.body by supplied target id and store, or target id alone for a decoded actor whose current row has superAdmin. controllers/app/user.js:151 updates broad objValues by claimed email/header reseller. importUsers:1232 updates complete rows by id/store or email/store and spreads inserts. models/user.js:43 defines writable password String; role, email, superAdmin, estoreid(s), resellid, emailConfirm, verifyCode and changeStore also exist.

Impact: choose a password representation/login email or privileged fields for a selected account, elevate cashier authority, reassign membership/ownership, or overwrite credentials through import without independent proof. Known account/store selectors plus forged decoded identity satisfy the visible application chain; no live exploit was attempted. Store predicates are real constraints on old-row selection, not permission to write new tenant fields. Ordinary same-store cashier plus arbitrary store-B id does not universally pass every query; cross-store paths include the superAdmin branch, independently selected warehouse target, owner namespace mutations and forged identity claims.

## F02 — Critical: unsafe signed credential issuance

Classification: **Confirmed unauthorized credential write (authentication credential issuance)** for C26; **confirmed privilege escalation** for C05.

routes/order.js:32 publicly binds GET /gratis/user-order-app/:orderid. controllers/order.js:80 loads an order by id+header store/cache, populates orderedBy without a credential exclusion, then at124 signs {email: order.orderedBy.email} and returns the token. There is no password or ownership proof. Possession of order selectors is required; an ObjectId is not an authentication capability. The populated user may also expose stored hash/plaintext showPass depending on record contents. This is a token issuance path, not a password database update.

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
