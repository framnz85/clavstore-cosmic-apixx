# Authentication and target authorization analysis

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
