# Authentication compatibility assessment

Evidence is repository code and the installed jsonwebtoken 8.5.1 source, plus offline tests using fixture-only keys. No environment secret, production JWT, account, MongoDB or Redis was accessed. Deployment issuer/audience/key configuration remains NOT VERIFIED.

## Actual issuance and verification

| Issuer source | Claims/options visible in code | Expiration | Algorithm |
|---|---|---|---|
| controllers/auth.js:104 and :129 | email; confirmed-admin branch adds aud=clavmall-estore and email_verified=true; JWT_PRIVATE_KEY; no sign options | No exp/expiresIn | Installed sign.js:94 defaults to HS256 |
| controllers/user.js:793 | Registration email, JWT_PRIVATE_KEY, no sign options | No exp | HS256 default |
| controllers/app/user.js:115 | App login email with same optional confirmed-admin audience | No exp | HS256 default |
| controllers/order.js:124 | Order customer's email, JWT_PRIVATE_KEY, no sign options | No exp | HS256 default |

The installed signer adds iat by default. No issuer is configured at these sign sites. Source search found no refresh-token endpoint, refresh rotation, revocation family or persisted refresh-session mechanism. This is a source finding, not proof that an external identity service does not exist. Do not infer expiry from browser storage retention or Redis cache TTLs. Frontend userToken remains a bearer token, not a verified scanner session.

Legacy middlewares/auth.js uses jwt-decode to assign req.user without cryptographic verification or expiry enforcement. adminGratisCheck subsequently queries user/store role, but that does not prove the bearer signature. **Do not compose the scanner through that legacy authCheck.** It remains untouched; broader remediation requires a separately scoped authorization review. The order-token mint is another reason not to turn arbitrary legacy email tokens into scanner credentials.

Stage 2 multi-scan middleware verifies HS256 signatures but Stage 7 additionally requires bounded integer iat/exp, valid email, exp in the future, issuance age and lifetime <=3600 seconds by default, no materially future issuance, expected issuer/audience policy and matching optional sub. It uses a strong explicit verifier key (>=32 bytes). With no configured issuer it rejects any iss; with no configured audience it accepts absent aud or clavmall-estore only. Configured issuer/audience are verified by jsonwebtoken. All old issuer tokens without exp fail TOKEN_LIFETIME_REQUIRED. Expired/forged/wrong-algorithm tokens are rejected; no expiry bypass or algorithm broadening is proposed.

Tenant grants are minted after current database membership resolution, not token role claims. Resolve email to exactly one user in the selected store; verify primary/secondary membership, current admin/moderator/cashier role, order permission for non-admins, current wholesale permission, active store, matching reseller IDs and an active parent reseller. packageId is the reseller namespace, not the billing Package._id. Revalidate opaque grants and current membership before current catalog and return. No super-admin bypass. Real reseller/secondary membership conventions and snapshot-capable Mongo topology still require staging validation.

## Minimum secure resolution — choose and approve one path

**Recommended narrow path:** add a dedicated scanner credential endpoint in new modules, explicitly register it in an approved router edit, and issue a short-lived, scanner-purpose HS256 token only after independently verifying the real login credentials/session through a cryptographically trusted identity boundary. It must never exchange an unsigned/decoded legacy email token into a scanner token. Require existing store/reseller membership and role resolution before issuance. Use a dedicated scanner JWT key distinct from the private AI HMAC key, an explicit subject, bounded TTL (proposed 15 minutes), explicit issuer `cosmic-clavstore-scanner` and audience `clavstore-multiscan-review`. Configure those exact issuer/audience values in Stage 7 Security at trusted startup. Do not issue these claims without updating verifier configuration, because the default policy intentionally rejects them.

This path avoids changing every legacy sign site but requires a new frontend credential acquisition/session boundary: MultiScanPosPanel currently passes user.token directly. An approved panel/new wrapper integration must acquire scanner credentials without replacing the legacy customer's token, hold them in memory, and clear them on tenant/logout changes. Reauthenticate when expired; no silent refresh from an unverified legacy token. A new refresh system is not necessary for initial staging. If refresh is later authorized, design rotating, revocable, hashed refresh families with server-side reuse detection separately.

**Alternative smallest common-token change:** explicitly sign HS256 with expiresIn <=3600 and bounded iat at every relevant login/registration/app sign site, preserve the actual optional audience until issuer/audience migration is coordinated, and validate key strength. This changes global session behavior and requires re-login/migration/backward-compatibility testing. The order-derived token must not become a general scanner login credential merely by adding expiry; use purpose separation or exclude that flow with an issuer/audience/key boundary. Do not blindly change all five sign calls and call the identity problem solved.

Neither option is implemented. Exact approval candidates: main routes/multi-scan.js or an explicitly approved main server.js registration for the dedicated issuer; a new credential controller/service; frontend MultiScanPosPanel.jsx or an approved new wrapper passed scanner credentials; trusted composition configuration. Only if the alternative common-token path is chosen do controllers/auth.js, controllers/user.js and controllers/app/user.js need issuance edits. controllers/order.js requires a purpose-isolation decision, not automatic scanner access. The legacy auth middleware must not be weakened or reused.

Offline tests prove the installed default algorithm/iat/no-exp behavior, old-token incompatibility, bounded compatible claims, wrong audience/issuer/subject, HS512/none, expiry, excessive lifetime and forged signatures. They do not verify a real deployment key or credential store.
