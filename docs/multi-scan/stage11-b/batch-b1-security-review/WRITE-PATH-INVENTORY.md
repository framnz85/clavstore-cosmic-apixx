# Role, membership, ownership and credential write-path inventory

All paths below are relative to the existing main mount `/<API_ROUTES>`; no deployed prefix is guessed. Source hashes are in SOURCE-EVIDENCE.json. The JSON companion supplies absolute router/controller paths, line anchors, middleware, identity/authorization, scoping, escalation risk and remediation for each entry. No network/DB requests, attacks or model imports were performed.

**Legacy guard semantics:** authCheck uses jwt-decode, not signature verification. adminGratisCheck queries email plus header-selected primary store and accepts admin, moderator OR cashier. Neither guard establishes a cryptographically verified owner/admin identity. UI guards, valid ObjectId syntax and row existence do not repair this. Reported missing/mass-assignment checks are source-confirmed vulnerabilities at the application boundary; actual exploitability behind live infrastructure is untested. Higher-level ingress restrictions must not be assumed.

## W01 — GET `/gratis/user-details/:resellid`

- Source: `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/controllers/user.js:114` — `getUserDetails`; router `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/routes/user.js`.
- Writes: Membership repair on read.
- Authentication: authCheck. None cryptographically verified in shown legacy chain; authCheck decodes headers.authtoken.
- Authorization: No verified privileged-grant middleware; function-specific checks described.
- Tenant boundary / escalation: email-only dedicated-store fallback can restore removed membership.
- Required remediation: Remove implicit grant repair; missing membership denies; promoStart bookkeeping is not authority.
- Evidence: Source-confirmed behavior; deployment reachability/exploit not tested.

## W02 — POST `/gratis/user-create/:resellid`

- Source: `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/controllers/user.js:707` — `createNewUser`; router `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/routes/user.js`.
- Writes: Role / primary membership / reseller / credentials.
- Authentication: none. No authenticated identity on this route.
- Authorization: No verified privileged-grant middleware; function-specific checks described.
- Tenant boundary / escalation: Public creation copies requested role; issues legacy token and returns user.
- Required remediation: Server-force public customer role; staff onboarding separate verified tenant-admin workflow with field allowlist and independent approved grants.
- Evidence: Source-confirmed behavior; deployment reachability/exploit not tested.

## W03 — PUT `/gratis/user-update`

- Source: `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/controllers/user.js:963` — `updateUser`; router `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/routes/user.js`.
- Writes: Role / membership / reseller / elevated flags / password via broad body.
- Authentication: authCheck. None cryptographically verified in shown legacy chain; authCheck decodes headers.authtoken.
- Authorization: No verified privileged-grant middleware; function-specific checks described.
- Tenant boundary / escalation: Decode identity; broad body update; selected-store equality does not constrain new authority fields.
- Required remediation: Verified identity; explicit self-profile allowlist; dedicated protected staff-change endpoint; tenant-scoped CAS and policy version update.
- Evidence: Source-confirmed behavior; deployment reachability/exploit not tested.

## W04 — PUT `/gratis/update-customer/:userid`

- Source: `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/controllers/user.js:1024` — `updateCustomer`; router `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/routes/user.js`.
- Writes: Any schema authority fields via broad body.
- Authentication: authCheck. None cryptographically verified in shown legacy chain; authCheck decodes headers.authtoken.
- Authorization: No verified privileged-grant middleware; function-specific checks described.
- Tenant boundary / escalation: Decoded caller; superAdmin branch omits target store; otherwise target chosen by id/store without required admin check.
- Required remediation: Verified privileged actor/current grant; constrain target user+tenant; deny self-granted elevated flags; profile/authority APIs separate.
- Evidence: Source-confirmed behavior; deployment reachability/exploit not tested.

## W05 — PUT `/gratis/user-verify`

- Source: `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/controllers/user.js:1056` — `verifyUserEmail`; router `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/routes/user.js`.
- Writes: Email confirmation and store reactivation for admin.
- Authentication: authCheck. None cryptographically verified in shown legacy chain; authCheck decodes headers.authtoken.
- Authorization: No verified privileged-grant middleware; function-specific checks described.
- Tenant boundary / escalation: Weak identity guard; code equality without visible single-use expiry policy; can set store active.
- Required remediation: Bind expiring single-use challenge to user+tenant; email confirmation must not automatically reenable independently disabled store/account.
- Evidence: Source-confirmed behavior; deployment reachability/exploit not tested.

## W06 — PUT `/gratis/change-password`

- Source: `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/controllers/user.js:1099` — `changePassword`; router `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/routes/user.js`.
- Writes: Credential replacement.
- Authentication: authCheck. None cryptographically verified in shown legacy chain; authCheck decodes headers.authtoken.
- Authorization: No verified privileged-grant middleware; function-specific checks described.
- Tenant boundary / escalation: Old password proof exists, but legacy identity/tenant handling and raw user response remain risks.
- Required remediation: Preserve old-secret proof plus verified identity; no raw credential fields; advance authorization epoch after credential reset/change.
- Evidence: Source-confirmed behavior; deployment reachability/exploit not tested.

## W07 — PUT `/gratis/reset-password/:userid`

- Source: `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/controllers/user.js:1129` — `resetPassword`; router `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/routes/user.js`.
- Writes: Staff password reset.
- Authentication: authCheck, adminGratisCheck. None cryptographically verified in shown legacy chain; authCheck decodes headers.authtoken.
- Authorization: adminGratisCheck: current primary-store row role admin/moderator/cashier; signature absent, not owner-only.
- Tenant boundary / escalation: adminGratisCheck permits cashier/moderator; reset uses fixed shared password.
- Required remediation: Explicit privileged reset with fresh proof; random single-use recovery, no shared default; tenant/current grant check and epoch advance.
- Evidence: Source-confirmed behavior; deployment reachability/exploit not tested.

## W08 — PUT `/gratis/forgot-password`

- Source: `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/controllers/user.js:1152` — `forgotPassword`; router `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/routes/user.js`.
- Writes: Credential replacement incl admin fallback.
- Authentication: none. No authenticated identity on this route.
- Authorization: No verified privileged-grant middleware; function-specific checks described.
- Tenant boundary / escalation: Public route writes new password from email/selectors without recovery proof.
- Required remediation: S01 containment candidate; then verified single-use account/tenant-bound recovery; no email-only admin fallback.
- Evidence: Source-confirmed behavior; deployment reachability/exploit not tested.

## W09 — PUT `/gratis/delete-account-request`

- Source: `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/controllers/user.js:1209` — `deleteAccountRequest`; router `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/routes/user.js`.
- Writes: Deletion-request denial marker.
- Authentication: none. No authenticated identity on this route.
- Authorization: No verified privileged-grant middleware; function-specific checks described.
- Tenant boundary / escalation: Public email-only update with no tenant; can target another identity.
- Required remediation: Verified subject/fresh proof; scoped subject id; independent revocation writer with audit, no public authority toggle.
- Evidence: Source-confirmed behavior; deployment reachability/exploit not tested.

## W10 — PUT `/gratis/import-users`

- Source: `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/controllers/user.js:1232` — `importUsers`; router `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/routes/user.js`.
- Writes: Bulk roles / memberships / elevated flags / credentials.
- Authentication: authCheck, adminGratisCheck. None cryptographically verified in shown legacy chain; authCheck decodes headers.authtoken.
- Authorization: adminGratisCheck: current primary-store row role admin/moderator/cashier; signature absent, not owner-only.
- Tenant boundary / escalation: Weak staff guard plus arbitrary row bodies; insert spread accepts authority fields.
- Required remediation: Separate profile import vs privileged staff-grant import; bounded strict schema, verified admin, tenant targets, CAS/audit/epoch.
- Evidence: Source-confirmed behavior; deployment reachability/exploit not tested.

## W11 — DELETE `/gratis/user-delete/:userid`

- Source: `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/controllers/user.js:1278` — `deleteUser`; router `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/routes/user.js`.
- Writes: Physical removal / access revocation.
- Authentication: authCheck, adminGratisCheck. None cryptographically verified in shown legacy chain; authCheck decodes headers.authtoken.
- Authorization: adminGratisCheck: current primary-store row role admin/moderator/cashier; signature absent, not owner-only.
- Tenant boundary / escalation: Weak guard permits any listed staff role; target id+header store, no last-admin policy.
- Required remediation: Verified privileged writer; target scope and last-owner safeguards; revoke/tombstone authoritative policy before deleting.
- Evidence: Source-confirmed behavior; deployment reachability/exploit not tested.

## W12 — PUT `/app/update-user`

- Source: `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/controllers/app/user.js:151` — `updateUser`; router `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/routes/appuser.js`.
- Writes: Role / membership / reseller / credentials via body.
- Authentication: authCheck. None cryptographically verified in shown legacy chain; authCheck decodes headers.authtoken.
- Authorization: No verified privileged-grant middleware; function-specific checks described.
- Tenant boundary / escalation: Decode guard; email+header reseller filter but broad body including estoreid.
- Required remediation: Same verified self-profile allowlist and dedicated scoped grant writer; never trust header reseller as authority.
- Evidence: Source-confirmed behavior; deployment reachability/exploit not tested.

## W13 — POST `/gratis/estore-update`

- Source: `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/controllers/estore.js:298` — `updateEstore`; router `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/routes/estore.js`.
- Writes: Cashier permissions / status / reseller / package-like settings.
- Authentication: authCheck, adminGratisCheck. None cryptographically verified in shown legacy chain; authCheck decodes headers.authtoken.
- Authorization: adminGratisCheck: current primary-store row role admin/moderator/cashier; signature absent, not owner-only.
- Tenant boundary / escalation: Weak staff guard; broad body; second warehouse target not constrained to actor tenant.
- Required remediation: Protected per-field setting vs authority APIs; verify both target stores; permission/status/owner changes versioned and audited.
- Evidence: Source-confirmed behavior; deployment reachability/exploit not tested.

## W14 — POST `/gratis/estore-create/:resellid`

- Source: `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/controllers/estore.js:338` — `createEstore`; router `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/routes/estore.js`.
- Writes: Store/reseller namespace / reseller flags / plan request.
- Authentication: none. No authenticated identity on this route.
- Authorization: No verified privileged-grant middleware; function-specific checks described.
- Tenant boundary / escalation: Public creation accepts reseller object and parent id; default store status active.
- Required remediation: Separate untrusted enrollment request from verified ownership/reseller activation; force pending request; independent owner attestation.
- Evidence: Source-confirmed behavior; deployment reachability/exploit not tested.

## W15 — POST `/gratis/add-new-estore/:resellid`

- Source: `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/controllers/estore.js:454` — `addNewEstore`; router `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/routes/estore.js`.
- Writes: New store parent / ownership namespace.
- Authentication: authCheck, adminGratisCheck. None cryptographically verified in shown legacy chain; authCheck decodes headers.authtoken.
- Authorization: adminGratisCheck: current primary-store row role admin/moderator/cashier; signature absent, not owner-only.
- Tenant boundary / escalation: Weak guard scoped to header store, creation parent comes from path; global email actor lookup.
- Required remediation: Verify actor grants allow store creation under exact parent; scope lookup by actor id/tenant; no namespace reassignment.
- Evidence: Source-confirmed behavior; deployment reachability/exploit not tested.

## W16 — POST `/gratis/copying-estore/:resellid`

- Source: `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/controllers/estore.js:493` — `copyingEstore`; router `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/routes/estore.js`.
- Writes: Store parent and cross-store source data copy.
- Authentication: authCheck, adminGratisCheck. None cryptographically verified in shown legacy chain; authCheck decodes headers.authtoken.
- Authorization: adminGratisCheck: current primary-store row role admin/moderator/cashier; signature absent, not owner-only.
- Tenant boundary / escalation: Weak guard; path parent and source fromid independently selected.
- Required remediation: Verify source read and destination create grants same approved namespace; explicit cross-tenant transfer protocol if ever supported.
- Evidence: Source-confirmed behavior; deployment reachability/exploit not tested.

## W17 — PUT `/gratis/update-estore-counters`

- Source: `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/controllers/estore.js:632` — `updateEstoreCounters`; router `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/routes/estore.js`.
- Writes: Non-authority change markers.
- Authentication: none. No authenticated identity on this route.
- Authorization: No verified privileged-grant middleware; function-specific checks described.
- Tenant boundary / escalation: Public selected store counters; no role/membership/status fields in explicit update.
- Required remediation: Restrict internal counter mutation; do not treat counters/cache timestamps as authority.
- Evidence: Source-confirmed behavior; deployment reachability/exploit not tested.

## W18 — PUT `/gratis/update-estores-default`

- Source: `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/controllers/estore.js:662` — `updateEstoresDefault`; router `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/routes/estore.js`.
- Writes: Default-store selection.
- Authentication: none. No authenticated identity on this route.
- Authorization: No verified privileged-grant middleware; function-specific checks described.
- Tenant boundary / escalation: Public updateMany with empty filter affects all tenants.
- Required remediation: Verified admin and reseller-scoped selection; no cross-tenant global reset.
- Evidence: Source-confirmed behavior; deployment reachability/exploit not tested.

## W19 — PUT `/gratis/update-estores-visible`

- Source: `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/controllers/estore.js:682` — `updateEstoresVissible`; router `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/routes/estore.js`.
- Writes: All supplied store fields, not just visibility.
- Authentication: none. No authenticated identity on this route.
- Authorization: No verified privileged-grant middleware; function-specific checks described.
- Tenant boundary / escalation: Public route forwards req.body to store update; status/resellid/accessibility are writable schema fields.
- Required remediation: Verified actor plus explicit visibility-only allowlist; status/owner/permissions separate protected writer.
- Evidence: Source-confirmed behavior; deployment reachability/exploit not tested.

## W20 — DELETE `/gratis/delete-estore/:deleteid`

- Source: `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/controllers/estore.js:695` — `deletingEstore`; router `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/routes/estore.js`.
- Writes: Deletes store/staff; reassigns admin primary store.
- Authentication: authCheck, adminGratisCheck. None cryptographically verified in shown legacy chain; authCheck decodes headers.authtoken.
- Authorization: adminGratisCheck: current primary-store row role admin/moderator/cashier; signature absent, not owner-only.
- Tenant boundary / escalation: Weak guard based on header store; deleteid query lacks target tenant match; supplied reseller determines reassignment.
- Required remediation: Verified owner operation; constrain every target/query/reassignment to approved tenant; policy revocation first; destructive cascade separately reviewed.
- Evidence: Source-confirmed behavior; deployment reachability/exploit not tested.

## W21 — GET `/gratis/get-hosting-billing`

- Source: `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/controllers/billing.js:37` — `getHostingBill`; router `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/routes/billing.js`.
- Writes: Creates plan billing on GET.
- Authentication: authCheck, adminGratisCheck. None cryptographically verified in shown legacy chain; authCheck decodes headers.authtoken.
- Authorization: adminGratisCheck: current primary-store row role admin/moderator/cashier; signature absent, not owner-only.
- Tenant boundary / escalation: Weak guard; header store/package and email lookup; creates Unpaid record.
- Required remediation: Verified billing actor and store+plan; move creation to explicit mutation; do not infer scanner permission from billing record.
- Evidence: Source-confirmed behavior; deployment reachability/exploit not tested.

## W22 — POST `/gratis/add-billing`

- Source: `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/controllers/billing.js:131` — `addBilling`; router `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/routes/billing.js`.
- Writes: Creates plan-associated billing rows.
- Authentication: authCheck, adminGratisCheck. None cryptographically verified in shown legacy chain; authCheck decodes headers.authtoken.
- Authorization: adminGratisCheck: current primary-store row role admin/moderator/cashier; signature absent, not owner-only.
- Tenant boundary / escalation: Weak guard; body-selected stores/packages; no independent ownership proof in shown function.
- Required remediation: Verified actor and allowed target scopes; explicit field allowlist; billing plan distinct from scanner reseller namespace.
- Evidence: Source-confirmed behavior; deployment reachability/exploit not tested.

## W23 — PUT `/gratis/update-billing`

- Source: `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/controllers/billing.js:167` — `updateBilling`; router `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/routes/billing.js`.
- Writes: Updates plan/status/billing fields.
- Authentication: authCheck, adminGratisCheck. None cryptographically verified in shown legacy chain; authCheck decodes headers.authtoken.
- Authorization: adminGratisCheck: current primary-store row role admin/moderator/cashier; signature absent, not owner-only.
- Tenant boundary / escalation: Weak guard; header-scoped lookup and broad update; Paid preserved but no independent entitlement authority.
- Required remediation: Verified tenant billing writer and protected payment status transition; explicit trusted entitlement source if required.
- Evidence: Source-confirmed behavior; deployment reachability/exploit not tested.

## W24 — GET `/gratis/get-hosting-super-billing`

- Source: `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/controllers/superBilling.js:38` — `getHostingSuperBill`; router `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/routes/billing.js`.
- Writes: Creates super-database billing on GET.
- Authentication: authCheck. None cryptographically verified in shown legacy chain; authCheck decodes headers.authtoken.
- Authorization: No verified privileged-grant middleware; function-specific checks described.
- Tenant boundary / escalation: Decode-only guard; separate DB models with names similar to Gratis models.
- Required remediation: Keep separate connection and grant domain; no scanner fallback to super DB; explicit verified billing scope.
- Evidence: Source-confirmed behavior; deployment reachability/exploit not tested.

## W25 — POST `/gratis/save-cart-order`

- Source: `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/controllers/order.js:1154` — `saveCartOrder`; router `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/routes/order.js`.
- Writes: Creates customer identity at checkout.
- Authentication: authCheck. None cryptographically verified in shown legacy chain; authCheck decodes headers.authtoken.
- Authorization: No verified privileged-grant middleware; function-specific checks described.
- Tenant boundary / escalation: Sets role customer explicitly; selected-store/scoped input; weak auth remains broader concern.
- Required remediation: Keep hardcoded least-privilege customer role; no staff enrollment or automatic scanner policy migration.
- Evidence: Source-confirmed behavior; deployment reachability/exploit not tested.

## W26 — POST `/gratis/save-cart-purchase`

- Source: `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/controllers/order.js:1331` — `saveCartPurchase`; router `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/routes/order.js`.
- Writes: Creates customer identity at purchase.
- Authentication: authCheck, adminGratisCheck. None cryptographically verified in shown legacy chain; authCheck decodes headers.authtoken.
- Authorization: adminGratisCheck: current primary-store row role admin/moderator/cashier; signature absent, not owner-only.
- Tenant boundary / escalation: Explicit customer role; weak staff guard; not a direct arbitrary staff-role writer.
- Required remediation: Same: no automatic staff promotion/grant; credential default modernization separate.
- Evidence: Source-confirmed behavior; deployment reachability/exploit not tested.

## W27 — POST `/app/save-pos-orders`

- Source: `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/controllers/app/order.js:237` — `saveOrder`; router `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/routes/apporder.js`.
- Writes: Creates customer and updates store counters.
- Authentication: authCheck, adminGratisCheck. None cryptographically verified in shown legacy chain; authCheck decodes headers.authtoken.
- Authorization: adminGratisCheck: current primary-store row role admin/moderator/cashier; signature absent, not owner-only.
- Tenant boundary / escalation: Explicit customer role, fixed order/product change fields; weak staff guard.
- Required remediation: Keep non-authority fields constrained; never migrate customers into staff policy.
- Evidence: Source-confirmed behavior; deployment reachability/exploit not tested.

## W28 — POST `/app/send-pos-orders`

- Source: `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/controllers/app/order.js:432` — `sendOrder`; router `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/routes/apporder.js`.
- Writes: Creates customer and updates store counters.
- Authentication: authCheck, adminGratisCheck. None cryptographically verified in shown legacy chain; authCheck decodes headers.authtoken.
- Authorization: adminGratisCheck: current primary-store row role admin/moderator/cashier; signature absent, not owner-only.
- Tenant boundary / escalation: Explicit customer role; weak staff guard.
- Required remediation: Same least-privilege separation; not trusted authority enrollment.
- Evidence: Source-confirmed behavior; deployment reachability/exploit not tested.

## W29 — GET `/gratis/user-to-affiliate/:email`

- Source: `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/controllers/withdraw.js:38` — `getUserToAffiliate`; router `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/routes/withdraw.js`.
- Writes: Referral association refid on GET.
- Authentication: authCheck, adminGratisCheck. None cryptographically verified in shown legacy chain; authCheck decodes headers.authtoken.
- Authorization: adminGratisCheck: current primary-store row role admin/moderator/cashier; signature absent, not owner-only.
- Tenant boundary / escalation: Weak guard, global email/referral lookup; refid is not Stage7 reseller/store ownership.
- Required remediation: Scope affiliate operation and separate from tenant authority; no grant derived from refid.
- Evidence: Source-confirmed behavior; deployment reachability/exploit not tested.

## Coverage and exclusions

Inventory includes dedicated fallback membership assignment on GET, app profile updates, bulk imports, physical deletion and store deletion/reassignment, broad store visibility/settings writes, credentials/recovery, activation-by-email-verification, creation/copy parent assignment, and indirect checkout customer creation. Billing writes are included because plan authorization must not be confused with Stage7 reseller packageId; they are not proof of paid authorization. Referral refid is included as adjacent identity association and explicitly not store ownership.

Other inspected User mutations: wishlist add uses explicit wishlist update; promoStart is bookkeeping; workflow-register/send-verification-code send external requests/messages and do not establish a stored account-status grant in the inspected functions. Store counter updates in joborder and app order edit/status/delete handlers write explicit jobsChange/orderChange/productChange fields, not roles/membership/status. Their general authentication/data-integrity risks remain separate; no claim every business endpoint is secured. CustomerRoutes has mock `active:true` and commented persistence; it is not an authoritative GratisUser active-status source. SuperEstore/SuperBilling use a different DB, even when model names resemble Gratis names; never merge authority by modelName alone.

Canonical app controllers import models/user and models/estore. models/app/user and models/app/estore define duplicate model names on the Gratis connection but were not found imported by these controllers; potential alternate-load/OverwriteModelError/schema divergence is a source risk, not reproduced. No missing primary/secondary membership or role was filled from these alternates. Frontend ManageUser export includes role/changeStore/wholesale and function wrappers call the audited APIs; UI access restrictions do not protect direct HTTP callers.

Scope is checked-in main backend routes/controllers/model imports and relevant frontend wrappers. Direct operational scripts, external administrators, triggers, deployed middleware/proxies and live database edits are not verified. Do not infer no additional writers exist outside that boundary. Before activation require deployment-wide writer and DB-credential privilege inventory.
