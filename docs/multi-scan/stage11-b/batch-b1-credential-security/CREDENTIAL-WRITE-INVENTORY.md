# Credential and account-authority write inventory

Source review of all three development projects. Paths are relative to the existing /<API_ROUTES> mount; no production prefix or reachability is assumed. Database connections were not opened. JSON companion records exact routes, complete middleware argument lists, controller anchors, queries, independent proof, classifications and authentication matrix.

C means source-confirmed unauthorized credential mutation/issuance/deletion at the application boundary, including explicit provider secrets. E means source-confirmed unprotected authority grant. Neither label claims a live exploit. P marks missing proof, indirect effects or uncertainty; it does not erase a source-confirmed non-credential integrity issue. A is scoped to the existing terminal recovery denial, not global security. U (unresolved trusted data) applies to reopening privileged writes generally: existing mutable roles/membership/status are not an independently trusted grant source. These labels are not mutually exclusive.

Every legacy authCheck below uses decode only (no signature or expiration verification). adminGratisCheck adds a current row lookup by unverified email + caller-selected primary store and admits cashier/moderator/admin. No such route therefore has a verified actor just because it has two middleware names. Explicit target predicates and independent old-password/code predicates are retained in the evidence rather than treated as nonexistent.

## C01 — updateUser (P0)

Routes: `PUT /gratis/user-update`.

Source: `main/routes/user.js`; `controllers/user.js:963`.

- Bound chain: [{'method': 'PUT', 'path': '/gratis/user-update', 'line': 47, 'middleware_and_handler': 'authCheck, updateUser'}].
- Database/issuance: User.findOneAndUpdate(filter,objValues), broad body including credentials/roles/ownership.
- Scope: email + header estoreid; replacement authority fields unconstrained.
- Independent permission/proof: none.
- Classification: Confirmed unauthorized credential write; Confirmed privilege escalation.
- Impact/limit: Known selected account can receive a chosen credential digest, login email or elevated authority fields.

## C02 — updateCustomer (P0)

Routes: `PUT /gratis/update-customer/:userid`.

Source: `main/routes/user.js`; `controllers/user.js:1024`.

- Bound chain: [{'method': 'PUT', 'path': '/gratis/update-customer/:userid', 'line': 48, 'middleware_and_handler': 'authCheck, updateCustomer'}].
- Database/issuance: User.findOneAndUpdate(target,req.body).
- Scope: target id+header store; superAdmin branch id only.
- Independent permission/proof: none.
- Classification: Confirmed unauthorized credential write; Confirmed privilege escalation.
- Impact/limit: Caller may select another account; no required administrator permission; cross-tenant target in superAdmin branch.

## C03 — updateUser (P0)

Routes: `PUT /app/update-user`.

Source: `main/routes/appuser.js`; `controllers/app/user.js:151`.

- Bound chain: [{'method': 'PUT', 'path': '/app/update-user', 'line': 16, 'middleware_and_handler': 'authCheck, updateUser'}].
- Database/issuance: User.findOneAndUpdate(filter,objValues), broad body.
- Scope: email + header resellid; body may replace estoreid, email/password/role.
- Independent permission/proof: none.
- Classification: Confirmed unauthorized credential write; Confirmed privilege escalation.
- Impact/limit: Reseller predicate does not prevent changing credentials or authority fields of the selected identity.

## C04 — importUsers (P0)

Routes: `PUT /gratis/import-users`.

Source: `main/routes/user.js`; `controllers/user.js:1232`.

- Bound chain: [{'method': 'PUT', 'path': '/gratis/import-users', 'line': 54, 'middleware_and_handler': 'authCheck, adminGratisCheck, importUsers'}].
- Database/issuance: existing rows updated with users[i]; new User({...users[i],estoreid}) saved.
- Scope: id+header store or email+header store; insert forces store but accepts other authority.
- Independent permission/proof: weak staff guard only; no credential proof.
- Classification: Confirmed unauthorized credential write; Confirmed privilege escalation.
- Impact/limit: Cashier accepted; imported password/email/role/superAdmin/resellid/membership writes and inserts.

## C05 — createNewUser (P0)

Routes: `POST /gratis/user-create/:resellid`.

Source: `main/routes/user.js`; `controllers/user.js:707`.

- Bound chain: [{'method': 'POST', 'path': '/gratis/user-create/:resellid', 'line': 42, 'middleware_and_handler': 'createNewUser'}].
- Database/issuance: new User with MD5 password, plaintext showPass and caller role; save; jwt.sign email.
- Scope: header store + path reseller chosen publicly; precheck same email/store/reseller.
- Independent permission/proof: no authenticated owner or tenant grant.
- Classification: Confirmed unauthorized credential write; Confirmed privilege escalation.
- Impact/limit: Public arbitrary staff/admin role enrollment; signed email-only credential issued. Duplicate-email race/global-login ambiguity also needs verification.

## C06 — getUserDetails (P0)

Routes: `GET /gratis/user-details/:resellid`.

Source: `main/routes/user.js`; `controllers/user.js:114`.

- Bound chain: [{'method': 'GET', 'path': '/gratis/user-details/:resellid', 'line': 27, 'middleware_and_handler': 'authCheck, getUserDetails'}].
- Database/issuance: User.updateOne({email},{$set:{estoreid:oldEstore._id}}) plus promoStart update.
- Scope: reseller lookup first; actual membership update email-only.
- Independent permission/proof: missing primary membership triggers repair, not verified grant.
- Classification: Confirmed privilege escalation.
- Impact/limit: Read request can restore primary membership; email-only update can select a different duplicate row; dedicated deployment conditional.

## C07 — verifyUserEmail (P0)

Routes: `PUT /gratis/user-verify`.

Source: `main/routes/user.js`; `controllers/user.js:1056`.

- Bound chain: [{'method': 'PUT', 'path': '/gratis/user-verify', 'line': 49, 'middleware_and_handler': 'authCheck, verifyUserEmail'}].
- Database/issuance: sets verifyCode empty/emailConfirm true; for admin sets selected store status active.
- Scope: email + header store + caller code.
- Independent permission/proof: code equality, no visible expiry/one-use challenge issuance policy.
- Classification: Confirmed privilege escalation; Potential vulnerability requiring further verification.
- Impact/limit: A writable/client-chosen code plus weak identity can confirm accounts and reactivate admin store; code-missing behavior requires isolated verification.

## C08 — changePassword (P1)

Routes: `PUT /gratis/change-password`.

Source: `main/routes/user.js`; `controllers/user.js:1099`.

- Bound chain: [{'method': 'PUT', 'path': '/gratis/change-password', 'line': 50, 'middleware_and_handler': 'authCheck, changePassword'}].
- Database/issuance: User.findOneAndUpdate old MD5 predicate -> new MD5; raw user response.
- Scope: email + header store + old-password digest.
- Independent permission/proof: old-password proof exists.
- Classification: Potential vulnerability requiring further verification.
- Impact/limit: No source proof of arbitrary reset without old secret on this path alone. Weak JWT, raw credential response, MD5 and missing epoch invalidation remain.

## C09 — resetPassword (Protected)

Routes: `PUT /gratis/reset-password/:userid`.

Source: `main/routes/user.js`; `controllers/user.js:1129`.

- Bound chain: [{'method': 'PUT', 'path': '/gratis/reset-password/:userid', 'binding': 'terminal inline 503; original function unbound'}].
- Database/issuance: retained fixed-password controller; NOT bound on recovery route.
- Scope: old target id+store query unreachable here.
- Independent permission/proof: terminal 503 replaces old middleware chain.
- Classification: Adequately protected.
- Impact/limit: Recovery containment is adequate for this matched route only; function remains dangerous if reattached.

## C10 — forgotPassword (Protected)

Routes: `PUT /gratis/forgot-password`.

Source: `main/routes/user.js`; `controllers/user.js:1152`.

- Bound chain: [{'method': 'PUT', 'path': '/gratis/forgot-password', 'binding': 'terminal inline 503; original function unbound'}].
- Database/issuance: retained public replacement controller; NOT bound on recovery route.
- Scope: old store/email then unscoped admin fallback unreachable here.
- Independent permission/proof: terminal 503.
- Classification: Adequately protected.
- Impact/limit: No active credential write via this matched route.

## C11 — deleteAccountRequest (P1)

Routes: `PUT /gratis/delete-account-request`.

Source: `main/routes/user.js`; `controllers/user.js:1209`.

- Bound chain: [{'method': 'PUT', 'path': '/gratis/delete-account-request', 'line': 53, 'middleware_and_handler': 'deleteAccountRequest'}].
- Database/issuance: sets deleteAccount.request true/reasons via User.findOneAndUpdate.
- Scope: email only, no tenant.
- Independent permission/proof: none.
- Classification: Potential vulnerability requiring further verification.
- Impact/limit: Confirmed unauthenticated account denial-marker write. Availability/revocation abuse; not evidence of password replacement.

## C12 — deleteUser (P1)

Routes: `DELETE /gratis/user-delete/:userid`.

Source: `main/routes/user.js`; `controllers/user.js:1278`.

- Bound chain: [{'method': 'DELETE', 'path': '/gratis/user-delete/:userid', 'line': 55, 'middleware_and_handler': 'authCheck, adminGratisCheck, deleteUser'}].
- Database/issuance: User.findOneAndDelete.
- Scope: target id + header store.
- Independent permission/proof: weak staff guard including cashier.
- Classification: Confirmed unauthorized credential write.
- Impact/limit: Unauthorized account/credential deletion; no last-owner/current privileged permission safeguard.

## C13 — updateEstore (P0)

Routes: `POST /gratis/estore-update`.

Source: `main/routes/estore.js`; `controllers/estore.js:298`.

- Bound chain: [{'method': 'POST', 'path': '/gratis/estore-update', 'line': 41, 'middleware_and_handler': 'authCheck, adminGratisCheck, updateEstore'}].
- Database/issuance: Estore.findByIdAndUpdate with broad values; second warehouse update.
- Scope: header store for first; typeEstoreid arbitrary id for second.
- Independent permission/proof: weak staff guard only.
- Classification: Confirmed privilege escalation.
- Impact/limit: Can change ownership/resellid/status/reseller/accessibility; warehouse target may cross tenant.

## C14 — updateEstoresVissible (P0)

Routes: `PUT /gratis/update-estores-visible`.

Source: `main/routes/estore.js`; `controllers/estore.js:682`.

- Bound chain: [{'method': 'PUT', 'path': '/gratis/update-estores-visible', 'line': 57, 'middleware_and_handler': 'updateEstoresVissible'}].
- Database/issuance: Estore.findByIdAndUpdate(estoreid,req.body).
- Scope: header store only.
- Independent permission/proof: none.
- Classification: Confirmed privilege escalation.
- Impact/limit: Public broad store authority update; endpoint is not visibility-only despite name.

## C15 — createEstore (P0)

Routes: `POST /gratis/estore-create/:resellid`.

Source: `main/routes/estore.js`; `controllers/estore.js:338`.

- Bound chain: [{'method': 'POST', 'path': '/gratis/estore-create/:resellid', 'line': 42, 'middleware_and_handler': 'createEstore'}].
- Database/issuance: new Estore includes supplied reseller; existing store reseller rewrite; referral-limit increment.
- Scope: public path reseller; global email/slug lookups.
- Independent permission/proof: none.
- Classification: Confirmed privilege escalation; Potential vulnerability requiring further verification.
- Impact/limit: Namespace/reseller authority accepted from unauthenticated enrollment; primary store status defaults active. Live ownership semantics unverified.

## C16 — addNewEstore (P0)

Routes: `POST /gratis/add-new-estore/:resellid`.

Source: `main/routes/estore.js`; `controllers/estore.js:454`.

- Bound chain: [{'method': 'POST', 'path': '/gratis/add-new-estore/:resellid', 'line': 43, 'middleware_and_handler': 'authCheck, adminGratisCheck, addNewEstore'}].
- Database/issuance: new Estore with path parent reseller and active upgrade statuses.
- Scope: actor email lookup global; parent selected independently from guarded header store.
- Independent permission/proof: weak staff guard.
- Classification: Confirmed privilege escalation.
- Impact/limit: No permission tying caller to requested parent namespace.

## C17 — copyingEstore (P0)

Routes: `POST /gratis/copying-estore/:resellid`.

Source: `main/routes/estore.js`; `controllers/estore.js:493`.

- Bound chain: [{'method': 'POST', 'path': '/gratis/copying-estore/:resellid', 'line': 49, 'middleware_and_handler': 'authCheck, adminGratisCheck, copyingEstore'}].
- Database/issuance: new Estore and cross-store data copy.
- Scope: global actor email; path parent + body source store independently chosen.
- Independent permission/proof: weak staff guard.
- Classification: Confirmed privilege escalation.
- Impact/limit: Unverified destination authority and source read authorization; not executed.

## C18 — deletingEstore (P0)

Routes: `DELETE /gratis/delete-estore/:deleteid`.

Source: `main/routes/estore.js`; `controllers/estore.js:695`.

- Bound chain: [{'method': 'DELETE', 'path': '/gratis/delete-estore/:deleteid', 'line': 58, 'middleware_and_handler': 'authCheck, adminGratisCheck, deletingEstore'}].
- Database/issuance: deletes store/users; User.updateMany admin primary estoreid reassignment.
- Scope: delete target id unscoped; replacement store from header resellid.
- Independent permission/proof: weak staff guard.
- Classification: Confirmed unauthorized credential write; Confirmed privilege escalation.
- Impact/limit: Destructive cross-tenant account removal/reassignment risk; no destructive test performed.

## C19 — saveCartOrder (P1)

Routes: `POST /gratis/save-cart-order`.

Source: `main/routes/order.js`; `controllers/order.js:1154`.

- Bound chain: [{'method': 'POST', 'path': '/gratis/save-cart-order', 'line': 60, 'middleware_and_handler': 'authCheck, saveCartOrder'}].
- Database/issuance: new customer with shared fixed MD5 password and plaintext showPass.
- Scope: selected store; identity precheck by phone/email/id.
- Independent permission/proof: decoded actor; no customer enrollment proof.
- Classification: Confirmed unauthorized credential write.
- Impact/limit: Creates usable authentication credentials for supplied new identity. Existing-user password overwrite is not shown.

## C20 — saveCartPurchase (P1)

Routes: `POST /gratis/save-cart-purchase`.

Source: `main/routes/order.js`; `controllers/order.js:1331`.

- Bound chain: [{'method': 'POST', 'path': '/gratis/save-cart-purchase', 'line': 61, 'middleware_and_handler': 'authCheck, adminGratisCheck, saveCartPurchase'}].
- Database/issuance: same shared-password new-customer creation.
- Scope: selected store.
- Independent permission/proof: weak staff guard.
- Classification: Confirmed unauthorized credential write.
- Impact/limit: Same provisioning risk; no new role elevation because role fixed customer.

## C21 — saveOrder (P1)

Routes: `POST /app/save-pos-orders`.

Source: `main/routes/apporder.js`; `controllers/app/order.js:237`.

- Bound chain: [{'method': 'POST', 'path': '/app/save-pos-orders', 'line': 16, 'middleware_and_handler': 'authCheck, adminGratisCheck, saveOrder'}].
- Database/issuance: same shared-password new-customer creation.
- Scope: selected store; actor email lookup global.
- Independent permission/proof: weak staff guard.
- Classification: Confirmed unauthorized credential write.
- Impact/limit: Same provisioning risk; no existing credential overwrite on this branch.

## C22 — sendOrder (P1)

Routes: `POST /app/send-pos-orders`.

Source: `main/routes/apporder.js`; `controllers/app/order.js:432`.

- Bound chain: [{'method': 'POST', 'path': '/app/send-pos-orders', 'line': 17, 'middleware_and_handler': 'authCheck, adminGratisCheck, sendOrder'}].
- Database/issuance: same shared-password new-customer creation.
- Scope: selected store; actor email lookup global.
- Independent permission/proof: weak staff guard.
- Classification: Confirmed unauthorized credential write.
- Impact/limit: Same provisioning risk.

## C23 — loginUser (P1)

Routes: `POST /gratis/auth-login`.

Source: `main/routes/auth.js`; `controllers/auth.js:89`.

- Bound chain: [{'method': 'POST', 'path': '/gratis/auth-login', 'line': 10, 'middleware_and_handler': 'loginUser'}].
- Database/issuance: jwt.sign email token after MD5 password match; no explicit exp.
- Scope: global email + MD5 password.
- Independent permission/proof: password knowledge.
- Classification: Potential vulnerability requiring further verification.
- Impact/limit: Real credential proof, but no signed subject/tenant binding or expiry; duplicate-email ambiguity and MD5 migration remain.

## C24 — loginUserByMd5 (P1)

Routes: `POST /gratis/auth-login-md5`.

Source: `main/routes/auth.js`; `controllers/auth.js:114`.

- Bound chain: [{'method': 'POST', 'path': '/gratis/auth-login-md5', 'line': 11, 'middleware_and_handler': 'loginUserByMd5'}].
- Database/issuance: jwt.sign after matching supplied digest directly.
- Scope: global email + supplied stored representation.
- Independent permission/proof: stored digest functions as bearer-equivalent password.
- Classification: Potential vulnerability requiring further verification.
- Impact/limit: Digest exposure becomes login capability; not proof of arbitrary account write without digest.

## C25 — loginUser (P1)

Routes: `POST /app/auth-login`.

Source: `main/routes/appuser.js`; `controllers/app/user.js:100`.

- Bound chain: [{'method': 'POST', 'path': '/app/auth-login', 'line': 15, 'middleware_and_handler': 'loginUser'}].
- Database/issuance: jwt.sign after MD5 password proof.
- Scope: global email + MD5 password.
- Independent permission/proof: password knowledge.
- Classification: Potential vulnerability requiring further verification.
- Impact/limit: Same expiry/subject/tenant deficiencies as main login; unchanged compatibility baseline.

## C26 — userAppOrder (P0)

Routes: `GET /gratis/user-order-app/:orderid`.

Source: `main/routes/order.js`; `controllers/order.js:80`.

- Bound chain: [{'method': 'GET', 'path': '/gratis/user-order-app/:orderid', 'line': 32, 'middleware_and_handler': 'userAppOrder'}].
- Database/issuance: jwt.sign({email:order.orderedBy.email}); returns populated order and token.
- Scope: public order id + header store; cache/order lookup; no ownership proof.
- Independent permission/proof: none.
- Classification: Confirmed unauthorized credential write.
- Impact/limit: Anyone with valid order selectors can obtain that account’s signed legacy token. Also unprojected orderedBy may expose password digest/showPass.

## C27 — getUserToAffiliate (P2)

Routes: `GET /gratis/user-to-affiliate/:email`.

Source: `main/routes/withdraw.js`; `controllers/withdraw.js:38`.

- Bound chain: [{'method': 'GET', 'path': '/gratis/user-to-affiliate/:email', 'line': 14, 'middleware_and_handler': 'authCheck, adminGratisCheck, getUserToAffiliate'}].
- Database/issuance: User.findOneAndUpdate target refid.
- Scope: global actor/target emails, update by target id.
- Independent permission/proof: weak staff guard; no target consent.
- Classification: Potential vulnerability requiring further verification.
- Impact/limit: Confirmed financial/referral attribution reassignment. refid is not shown to be login ownership; do not call this password takeover.

## C28 — addPayment (P0)

Routes: `POST /gratis/add-payment`.

Source: `main/routes/payment.js`; `controllers/payment.js:75`.

- Bound chain: [{'method': 'POST', 'path': '/gratis/add-payment', 'line': 18, 'middleware_and_handler': 'authCheck, adminGratisCheck, addPayment'}].
- Database/issuance: new Payment({...req.body,estoreid}); accNumber can be provider secret.
- Scope: header store forced.
- Independent permission/proof: weak staff guard.
- Classification: Confirmed unauthorized credential write.
- Impact/limit: Payment authentication credential/configuration injection where accNumber is used as Xendit secretKey; broader than user password.

## C29 — updatePayment (P0)

Routes: `PUT /gratis/update-payment/:payid`.

Source: `main/routes/payment.js`; `controllers/payment.js:86`.

- Bound chain: [{'method': 'PUT', 'path': '/gratis/update-payment/:payid', 'line': 19, 'middleware_and_handler': 'authCheck, adminGratisCheck, updatePayment'}].
- Database/issuance: Payment.findOneAndUpdate(...,req.body).
- Scope: id + header store; new store may be assigned in body.
- Independent permission/proof: weak staff guard.
- Classification: Confirmed unauthorized credential write.
- Impact/limit: Can overwrite provider credential or routing under unverified actor identity.

## C30 — removePayment (P1)

Routes: `DELETE /gratis/remove-payment/:payid`.

Source: `main/routes/payment.js`; `controllers/payment.js:106`.

- Bound chain: [{'method': 'DELETE', 'path': '/gratis/remove-payment/:payid', 'line': 25, 'middleware_and_handler': 'authCheck, adminGratisCheck, removePayment'}].
- Database/issuance: Payment.findOneAndDelete.
- Scope: id+header store.
- Independent permission/proof: weak staff guard.
- Classification: Confirmed unauthorized credential write.
- Impact/limit: Credential/configuration removal without verified privileged actor.

## C31 — sendVerificationCode (P1)

Routes: `POST /gratis/send-verification-code`.

Source: `main/routes/user.js`; `controllers/user.js:911`.

- Bound chain: [{'method': 'POST', 'path': '/gratis/send-verification-code', 'line': 46, 'middleware_and_handler': 'sendVerificationCode'}].
- Database/issuance: outbound provider email using caller-supplied verificationCode, not DB write.
- Scope: caller recipient/name/code.
- Independent permission/proof: none.
- Classification: Potential vulnerability requiring further verification.
- Impact/limit: Delivery proxy does not create independent server-held proof; UI chooses and stores code via C01.

## C32 — updateEstoresDefault (P2)

Routes: `PUT /gratis/update-estores-default`.

Source: `main/routes/estore.js`; `controllers/estore.js:662`.

- Bound chain: [{'method': 'PUT', 'path': '/gratis/update-estores-default', 'line': 56, 'middleware_and_handler': 'updateEstoresDefault'}].
- Database/issuance: global updateMany default=false then selected id=true.
- Scope: empty filter across all tenants.
- Independent permission/proof: none.
- Classification: Potential vulnerability requiring further verification.
- Impact/limit: Confirmed global default-selection mutation; no direct credential/role grant shown.

## C33 — updateEstoreCounters (P2)

Routes: `PUT /gratis/update-estore-counters`.

Source: `main/routes/estore.js`; `controllers/estore.js:632`.

- Bound chain: [{'method': 'PUT', 'path': '/gratis/update-estore-counters', 'line': 55, 'middleware_and_handler': 'updateEstoreCounters'}].
- Database/issuance: explicit store change timestamps only.
- Scope: header store.
- Independent permission/proof: none.
- Classification: Potential vulnerability requiring further verification.
- Impact/limit: Unprotected cache counters; no direct credential/authority field update in explicit object.

## C34 — addToWishlist (P2)

Routes: `POST /gratis/add-wishlist`.

Source: `main/routes/user.js`; `controllers/user.js:861`.

- Bound chain: [{'method': 'POST', 'path': '/gratis/add-wishlist', 'line': 44, 'middleware_and_handler': 'authCheck, addToWishlist'}].
- Database/issuance: User.findOneAndUpdate $addToSet wishlist only.
- Scope: email+header store.
- Independent permission/proof: decoded identity.
- Classification: Potential vulnerability requiring further verification.
- Impact/limit: No generic password/role write through this literal update. Wishlist integrity remains unauthenticated.

## C35 — getHostingBill (P2)

Routes: `GET /gratis/get-hosting-billing`.

Source: `main/routes/billing.js`; `controllers/billing.js:37`.

- Bound chain: [{'method': 'GET', 'path': '/gratis/get-hosting-billing', 'line': 24, 'middleware_and_handler': 'authCheck, adminGratisCheck, getHostingBill'}].
- Database/issuance: new Unpaid Billing on GET.
- Scope: header store/package plus global actor lookup.
- Independent permission/proof: weak staff guard.
- Classification: Potential vulnerability requiring further verification.
- Impact/limit: Billing record creation is not itself a verified authority grant; downstream trusted entitlement use unresolved.

## C36 — addBilling (P1)

Routes: `POST /gratis/add-billing`.

Source: `main/routes/billing.js`; `controllers/billing.js:131`.

- Bound chain: [{'method': 'POST', 'path': '/gratis/add-billing', 'line': 33, 'middleware_and_handler': 'authCheck, adminGratisCheck, addBilling'}].
- Database/issuance: new Billing broad per-row data.
- Scope: row store/package selected in body; actor email global.
- Independent permission/proof: weak staff guard.
- Classification: Potential vulnerability requiring further verification.
- Impact/limit: Plan/status/owner billing injection; credential-authority impact depends on downstream consumer.

## C37 — updateBilling (P1)

Routes: `PUT /gratis/update-billing`.

Source: `main/routes/billing.js`; `controllers/billing.js:167`.

- Bound chain: [{'method': 'PUT', 'path': '/gratis/update-billing', 'line': 34, 'middleware_and_handler': 'authCheck, adminGratisCheck, updateBilling'}].
- Database/issuance: Billing.findOneAndUpdate broad body, preserves already-Paid status.
- Scope: bill id+header store.
- Independent permission/proof: weak staff guard.
- Classification: Potential vulnerability requiring further verification.
- Impact/limit: Billing authority/plan fields may be changed; no direct User credential update.

## C38 — getHostingSuperBill (P2)

Routes: `GET /gratis/get-hosting-super-billing`.

Source: `main/routes/billing.js`; `controllers/superBilling.js:38`.

- Bound chain: [{'method': 'GET', 'path': '/gratis/get-hosting-super-billing', 'line': 30, 'middleware_and_handler': 'authCheck, getHostingSuperBill'}].
- Database/issuance: new Unpaid super Billing on GET.
- Scope: header store/parent/package; actor email lookup.
- Independent permission/proof: decoded identity.
- Classification: Potential vulnerability requiring further verification.
- Impact/limit: Indirect entitlement metadata creation; no direct User role/password update.

## C39 — addImage (P2)

Routes: `POST /gratis/user/add-image`.

Source: `ai/routes/user.js`; `controllers/user.js:99`.

- Bound chain: [{'method': 'POST', 'path': '/gratis/user/add-image', 'line': 7, 'middleware_and_handler': 'authCheck, adminGratisCheck, addImage'}].
- Database/issuance: filesystem JPEG creation only; no User DB mutation.
- Scope: header store/reseller filesystem namespace.
- Independent permission/proof: weak AI staff guard.
- Classification: Potential vulnerability requiring further verification.
- Impact/limit: No direct account credential writer found in AI image controller. Separate file/namespace authorization risks remain.

## C40 — removeImage (P2)

Routes: `DELETE /gratis/user/remove-image/:public_id`.

Source: `ai/routes/user.js`; `controllers/user.js:112`.

- Bound chain: [{'method': 'DELETE', 'path': '/gratis/user/remove-image/:public_id', 'line': 8, 'middleware_and_handler': 'authCheck, adminGratisCheck, removeImage'}].
- Database/issuance: filesystem unlink only; no User DB mutation.
- Scope: header store/reseller and path public id.
- Independent permission/proof: weak AI staff guard.
- Classification: Potential vulnerability requiring further verification.
- Impact/limit: No direct credential write; file isolation is a separate unresolved issue.

## Other inspected surfaces and exclusions

Main controllers/user.js sendEmail and handleWorkflow1 relay outbound mail/subscriber requests; no local credential write. Neither is a trusted recovery issuer. Main customerRoutes.js returns mock customer/license/access objects: database operations are commented out, license keys are generated/returned but no authoritative verifier/storage is implemented; authentication/entitlement use is unresolved, not a confirmed User password writer. AI migrate.js imports User but its User operations are commented read-only image migration, not credential mutation; migration endpoints are not run. Main models/app/user.js is a shadow schema with the same GratisUser model name; active app controller imports `../../models/user`, not this shadow model. AI user model/guard similarly does not imply a credential write in image handlers.

Store counter writes in main app/order.js and joborder.js are explicit cart/order/jobs marker updates; they do not directly change store identity, reseller ownership, role or password. Other controller models (products, orders, addresses, points, cashflow, jobs, categories, brands, events, payments) were searched for User aliases, raw collection writes, password assignments and authority updates. Payment credentials and billing metadata are included above. No other active User mutation was found in application source. Generated/runtime/test/doc/vendor files are not application endpoints; full integrity manifests cover their unchanged bytes. MUTATION-SCAN.json is the discovery/evidence cross-check, not an AST proof of every possible dynamic dataflow.

Frontend has no authoritative database credential writer: functions/user.js and auth.js submit requests and persist returned tokens/user data in browser state/storage. Their callers matter for migration and are in COMPATIBILITY.md. No client guard is counted as server authorization. Scanner session endpoint uses cryptographic checks and fresh proof in its isolated design, but is disabled and is not a credential-change endpoint; current authority data remains vulnerable to the other writers. Its local checks do not make mutable legacy roles trustworthy.
