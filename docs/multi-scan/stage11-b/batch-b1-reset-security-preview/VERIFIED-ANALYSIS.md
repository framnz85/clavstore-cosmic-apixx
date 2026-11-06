# Verified vulnerability analysis and route/middleware inventory

All findings below are static source findings, not executed attacks or claims that production has been compromised. Required three hashes match; SOURCE-EVIDENCE.json pins every cited file and records exact current/proposed route bindings. Paths are router-relative; actual server mount is /<API_ROUTES>, not assumed.

| Entry | Current middleware and operation | Source evidence / consequence |
|---|---|---|
| PUT /gratis/forgot-password | No route authentication; forgotPassword writes body newpassword as MD5 and showPass | routes/user.js:57; controllers/user.js:1152–1207. Email/store selectors are not recovery proof. With no store, or after failed scoped lookup, admin-email fallback omits store restriction |
| PUT /gratis/reset-password/:userid | authCheck → adminGratisCheck → resetPassword | routes/user.js:51–56; middlewares/auth.js:5–41. First only decodes JWT, second queries claimed email plus selected primary store and allows admin/moderator/cashier. Controller1129–1150 assigns a shared fixed password hash to target id+same selected store |
| PUT /gratis/change-password | authCheck → changePassword | routes/user.js:50; controllers/user.js:1099–1127. Requires matching MD5(oldpassword) for selected email/store, a real old-secret condition, but identity JWT still unverified; raw User response/MD5/no epoch remain concerns |
| POST /gratis/auth-login and /gratis/auth-login-md5 | Respective loginUser/loginUserByMd5 | routes/auth.js; controllers/auth.js:89–139. Credential lookup; legacy email-based token without required exp/version. The digest-login path accepts stored-password-equivalent input. No route/code change proposed |
| POST /app/auth-login | loginUser | routes/appuser.js; controllers/app/user.js:99–121. Legacy MD5/login issuance; no change proposed |

## Additional/global conditions inspected

server.js before route autoload applies dev request logging, JSON2MiB parser and CORS (including accepting absent Origin). No cryptographic global auth/session/trusted principal middleware appears in the inspected chain. routes/user.js has no additional router.use authentication. Models/user.js has indexed but not unique email, a password String and showPass, role enum/admin flags and store memberships; no recovery credential model or token/session epoch. Repeated app/model names are not a trusted session mechanism. Current models import live connection bootstraps and were read as text only.

CORS/body parsing, ObjectId casting and current staff-row existence can affect whether a particular request reaches the write, but none supplies verified identity/recovery proof. Unknown ingress/proxy/firewall behavior, live records, email reuse and actual deployed configuration remain unverified. Frontend reset/forgot wrappers call these same routes; UI access controls cannot authenticate direct callers. No production request, forged token request, DB query or model import was performed in this review.

## Forged and expired credentials

jwt-decode does not verify signature, algorithm, issuer, audience or expiry. Syntactically decodable forged/expired claims can pass authCheck; downstream reset admission still requires a current staff row for claimed email plus selected store and valid identifiers. This is a conditional source-confirmed identity bypass, not a promise every arbitrary token/user/store succeeds. adminGratisCheck does not enforce admin-only reset or active/revoked status; its name is stronger than its allowed-role list.

## Cashier and cross-store limits — precise finding

A cashier matching the selected primary store satisfies the reset guard. The reset controller applies no target-role restriction, last-admin safeguard, independent admin grant, recovery proof or fresh privilege proof, so it can reset another matching-store account, including a privileged account if present.

A genuine cashier-only-A identity selecting target B with header A is constrained by the controller's target id+store predicate; selecting header B with the cashier's own email generally fails the staff lookup if no matching B row exists. **Do not overstate this as unconditional arbitrary cross-store reset.** The guard nevertheless does not cryptographically bind claimed email to the caller; impersonated B staff claims, or ambiguous same-email identities, undermine that boundary. The public forgot route's admin fallback is directly unscoped by store. Other broad update routes also have weak target ownership controls as described below. No active exploitation was tested.

## Fixed password, sessions and account existence

resetPassword uses one hard-coded shared password (value intentionally not reproduced), no per-request secret/challenge. forgotPassword writes caller input without proof. Neither advances a credential/session epoch, clears refresh/session state, or guarantees old tokens rejected. Existing schema/issuance has no mandatory exp/version; decode-only guards ignore even signature/key changes. A later current-row check may deny deleted accounts but is not global session invalidation. Some credential handlers return full User documents and reflect errors/lookup success, so existing responses can differ by account outcome.

## Equivalent password-write surfaces and residual bypasses

There are no additional named forgotPassword/resetPassword route registrations in the searched routes/controllers tree. **That does not mean no equivalent credential mutation exists.**

- PUT /gratis/user-update → controllers/user.js:963–1023 forwards broad req.body through findOneAndUpdate after decoded identity; password is a writable schema path, even though output excludes password/showPass.
- PUT /gratis/update-customer/:userid → controllers/user.js:1024–1053 forwards body; a superAdmin branch selects target by id without store, otherwise id+header store. It has authCheck only, no verified admin reset check.
- PUT /app/update-user → controllers/app/user.js:151–175 forwards body to email+header-reseller-selected user.
- PUT /gratis/import-users → controllers/user.js:1232–1275 forwards/spreads rows including writable credential/authority paths; weak staff guard, not protected credential workflow.

These are generic mass-assignment credential-write capabilities, not routes named password-reset; they remain risks after Option A. Public user creation can also choose role; existing staff-reset safeguards and MD5/showPass/default credentials need wider remediation. Do not represent the two-route patch as complete credential-write containment or proof the account system is safe.

## Authenticated password-change preservation decision

The old-password predicate is independently verified from source; the entire change-password flow is **not independently certified secure** because of unverified identity, weak hashing, raw output and no revocation protocol. Option A leaves this registration/controller unchanged as a narrowly scoped source-compatibility choice, not an endorsement of genuinely verified-session authentication. No safe login/change migration is silently invented. If approval requires every remaining credential writer to be safe first, Option A remains blocked pending a separately approved expanded containment/hardening scope.
