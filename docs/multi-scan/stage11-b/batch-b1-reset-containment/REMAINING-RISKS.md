# Unresolved credential-write risks

This is static development-source evidence, not a live exploit or database test. Option A denies only the two named recovery PUT routes. These risks remain unchanged and must be reviewed separately before wider security integration.

| Entry point | Evidence | Remaining risk |
| --- | --- | --- |
| PUT /gratis/user-update | routes/user.js:47; controllers/user.js:963–1022 | authCheck then updateUser passes broad req.body/objValues into findOneAndUpdate selected by claimed email and header estoreid. Response projection removing password/showPass does not constrain writes. Password, role, verification and authority fields are schema-recognized. |
| PUT /gratis/update-customer/:userid | routes/user.js:48; controllers/user.js:1024–1060 | authCheck only; broad req.body update targets id+selected store, or id alone in superAdmin branch. No independent administrator permission or old-password/recovery proof. |
| PUT /app/update-user | routes/appuser.js:16; controllers/app/user.js:151–175 | authCheck then broad body update selected by claimed email and header resellid; credential/authority fields not explicitly excluded. |
| PUT /gratis/import-users | routes/user.js:54; controllers/user.js:1232–1285 | authCheck/adminGratisCheck permits cashier as well as moderator/admin; existing rows receive broad imported objects, new users spread imported fields. Credential and authority writes lack separate proof/field allowlist. |

models/user.js defines password as an ordinary String plus showPass, role, superAdmin, resellid, estoreid(s), verification and changeStore fields. No schema-level credential-write firewall was observed. Generic writes may accept caller-provided password representations rather than consistently hashing them; MD5 login means a known digest can become a usable credential. This report does not claim every malformed payload is accepted or every store can be targeted by any token.

middlewares/auth.js:5–16 decodes authtoken with jwt-decode without signature, expiry, issuer or audience verification. adminGratisCheck:19–41 queries claimed email + header store and permits admin/moderator/cashier. Store predicates constrain straightforward cross-store requests, but decoded identity and caller-selected scope are not trustworthy authorization proof. Generic writer risks therefore remain serious despite recovery denial.

Normal change-password still requires the old MD5 password in its query; its unchanged controller/binding and synthetic success/wrong-password fixtures are verified. This is not certification of legacy authentication. MD5 storage/digest-login, absent session epochs/revocation guarantees, broader response exposure and secure recovery replacement remain unresolved.

Future proposals should separately address verified current identity and tenant/role authorization, explicit profile/import field allowlists that reject credential/authority fields, dedicated password operations with independent proof, modern password hashing and digest-login migration, and atomic credential/session revocation. No such changes were applied here. Scanner integration also remains gated by trusted current authorization/status data, revocation/epoch semantics and the previously documented integration/operational prerequisites. No adapter or secure replacement was implemented.

Option A callbacks do no lookup/write/issuance. Startup imports remain unchanged and may initialize legacy connections in a real server; tests deliberately do not import that bootstrap. Global body parsing/CORS can reject before the route with their existing responses. The 503 contract applies to valid parsed requests reaching these matched PUT routes, not a global recovery-prefix firewall.
