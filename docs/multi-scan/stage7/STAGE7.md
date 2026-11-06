# Stage 7 — secure authoritative backend integration

Stage 7 implements a standalone, testable main-backend integration subsystem and an unregistered AI receiver adapter. It verifies expiring JWTs, proves store/reseller authorization, creates consistent bounded snapshots, signs private service requests, validates AI suggestions and reloads current product/pricing/stock records. All outputs remain review-only. No frontend, cart/order operation, public feature, production database, server, live index rebuild, deployment or push was activated. Stop after Stage 7 pending explicit Stage 8 approval.

## New files and composition

The complete authored-file list and final preservation audit are in [hash-summary.json](hash-summary.json).

Main API additions:

- `services/multi-scan/stage7/contracts.js`: typed errors, canonical identifiers, immutable DTO helpers.
- `repository.js`: bounded read-only Mongoose queries and consistent read sessions, with explicitly supplied existing model handles.
- `security.js`: JWT verification, trusted membership/role/package resolution, opaque verified grants and a frozen-Stage-2-compatible route-local auth guard.
- `catalog.js`: authoritative current lookup, resolved scoped brands, safe reference-image metadata, immutable paginated catalog snapshots and Stage 4–6 DTOs.
- `client.js`: fixed-operation, capability-authenticated private AI client, pinned addresses, deadlines, size limits and safe retry policy.
- `validation.js`: untrusted Stage 6 scan-result validation and whitelisting.
- `resolution.js`: fresh price/stock resolution with explicit SKU selection and review-only output.
- `integration.js`: authenticated standalone scan, admin snapshot preparation and admin status operations.
- `composition.js`: explicit inactive composition factory; no automatic registration or production-model imports.
- `tests/multi-scan/stage7/`: mock fixtures and three isolated test groups.
- `scripts/multi-scan/stage7/`: isolated smoke demonstration, frozen-regression runner and protected-file verifier.
- `docs/multi-scan/stage7/`: report, complete file inventory/hashes, inspected schema/contract hashes, TAP logs, smoke output and syntax/test summaries.

AI API addition: `services/multi-scan/stage7/receiver.js`, a pure request adapter using the frozen Stage 2 HMAC capability verifier and the Stage 6 pipeline interface. It registers no route and starts no service. No files were added to frontend or auto-discovered route directories.

Explicit future composition uses `createSubsystem({repository or models/connection, jwtConfig, aiConfig, imagePrefixes, snapshotLimits})`. Model handles must come from a separately authorized startup integration; importing this subsystem does not require existing models or database connections. JWT and internal-service keys must be distinct. Configuration is supplied by trusted server code, never browser request fields. The factory returns `featureActivated:false`.

## Authentication, roles and tenant authority

Use existing jsonwebtoken **8.5.1**, unchanged. Verify HS256 signatures with an explicit algorithm allowlist and a server-provided key of at least 32 bytes. Require a valid email, integer iat/exp, unexpired token, no materially future issuance, and bounded issuance age/lifetime (default one hour). Configured issuer/audience are verified. When none are configured, absent issuer is required and only absent audience or the actually issued `clavmall-estore` audience is accepted. Optional subject must match the current database user ID. Role claims are ignored.

User identity is resolved by email and scoped primary/secondary store membership. Multiple matching users fail closed. Read current User role, estoreid/estoreids, resellid, wholesale permission and account-deletion request; read current active Estore and require matching User/Store reseller IDs. Require an active parent Estore with reseller.status true for that namespace. Cashier/moderator roles need the store's orders permission; admin-only operations never accept a cashier token with an admin claim. No super-admin bypass was added. Browser estoreid selects only the store to be authorized; resellid is at most a matching hint.

This follows actual field conventions: **packageId in multi-scan DTOs represents the reseller tenant namespace, not the billing-plan Package._id/upPackage**. Product has estoreid, not a new persisted packageId. DTO packageId is attached only after trusted membership/parent verification. The inferred parent-reseller convention must still be checked against production configuration before activation; malformed or missing ownership fails closed. No production records were queried to assert it universally.

Opaque grants are minted only after verified JWT authentication and kept in a private WeakSet. Fabricated plain tenant objects cannot call the current-catalog or snapshot APIs. Expiration and live membership/role/wholesale permission are revalidated before sensitive operations and before returning resolved products. Authorization changes require reauthentication. JWT/service secrets are never included in browser-facing DTOs or diagnostics.

The new `routeAuth(cfg)` composes a stricter JWT precheck with the unchanged Stage 2 middleware and trusted resolveTenant callback. Subject and expiry are checked before forwarding next(). It does not patch middleware, routes, module caches, global state or adapter objects.

## Actual catalog schema and safe queries

Existing Product/User/Estore/Brand/Package schemas and order/auth/controller conventions were inspected **as text**, not imported. [inspected-contracts.json](inspected-contracts.json) records their hashes.

Product lookups use only actual fields: _id, estoreid, title, brand, variantName, description, images, barcode, quantity, waiting._id/newQuantity, segregate, activate, price, wholesale, wprice/wcount, packaging, unitOfMeasure, aiIndex and updatedAt. Existing timestamps supply updatedAt. No database field or schema was added. Supplier cost, passwords and unrelated account data are not projected or returned.

Every product and brand query is store-scoped and ID-scoped where applicable. Queries use projection, sorted IDs, explicit limits, lean results and maxTimeMS (default five seconds). Product image arrays are projected to at most 21 entries, wholesale arrays to 101 (overflow is flagged/unused), and membership arrays to 1,001. Current resolution accepts at most 200 distinct product IDs. User lookup is limited to two to detect ambiguous identities. Brand reads are batched to at most 200. Query adapters recheck returned ownership/IDs/duplicates even when an injected database adapter is faulty.

Brand is an ObjectId reference, resolved by a separate store-scoped Brand query. Missing/foreign brands are not guessed from IDs. Variants remain separate product records; no brand-based substitution or merging is performed. Numeric packaging values are retained without inventing net-weight/volume units. Existing aiIndex is reported as legacy metadata, not used as proof of membership in new visual indexes.

## Consistent catalog snapshot contract

Only verified admins create/export indexing snapshots. Default page size is 100 (configurable maximum 200), product budget 5,000 (hard maximum 10,000), registry capacity eight (maximum sixteen), TTL one hour (maximum one hour), snapshot encoded-size limit 16 MiB. ID-keyset pagination uses `_id > after`, sorted ascending; repeated/out-of-order/foreign rows, excessive counts and partial reads fail without publishing a snapshot.

A repository snapshot must run in a true read session: injected snapshotRunner for isolated tests, or a Mongo session transaction with snapshot readConcern/primary reads. If unavailable, fail with SNAPSHOT_ISOLATION_UNAVAILABLE; ordinary paginated reads are not represented as atomic. This requires supported deployment/session topology when eventually integrated. No session was opened against production.

Snapshots contain immutable tenant-scoped product metadata/status and references, with a deterministic SHA-256 revision. Reference IDs/image keys derive from tenant/product/approved URL identity, not transient array indexes; reference order is canonical. Prices/stock are deliberately excluded from AI snapshots and always reloaded separately. Deleted products disappear from subsequent snapshots/revisions; inactive products have no inference references. Missing/unsafe image entries remain explicit warnings. Old snapshots can supply version-matching recognition metadata until expiry, but deleted/inactive IDs are still rejected by current final resolution.

Registry contents are process-local and bounded, with no Redis or persistent schema changes. Restart or expiry loses these snapshots; durable versioned storage/retention is a future integration requirement, not silently assumed.

Contracts:

```js
// Admin preparation; returns metadata only, never queues or executes a rebuild.
const prepared = await integration.prepareRebuild({token, storeId, packageHint, signal});
// {state:'prepared_only', snapshot:{snapshotId, tenant, revision, ...},
//   executionRequested:false, liveIndexRebuilt:false}

const grant = await security.authenticate({token, storeId});
const page = await catalog.page(grant, {snapshotId, after, limit, signal});
// Summary + bounded products + nextAfter; authenticated admin, immutable snapshot.

const indexDto = await catalog.indexingSnapshot(grant, {snapshotId, signal});
// {tenant, revision, products:[{productId, packageId, storeId,
//    references:[{referenceId,imageKey}], status}]}

const metadata = await catalog.metadata(grant, {snapshotId, revision, productIds, signal});
// Stage 6 catalog DTO: {tenant, revision, products:[{_id, estoreid,
//    packageId, title, resolved brand, variantName, description,
//    packaging, unitOfMeasure}]}; no prices or database credentials.
```

Snapshot pages carry reference metadata with approved URL, public ID and `contentVerified:false`. Image URLs require explicitly configured HTTPS CDN directory prefixes; credentials, queries, fragments, IP literals, traversal, encoded traversal/slashes, unsafe protocols and other origins are rejected. No image fetch was performed. URL identity is not an immutable byte-content guarantee. A future image provider must enforce the same tenant/host policy, bounded authenticated fetching/decoding and content checks before supplying Buffers to an index builder. This module does not pretend that URLs alone are verified image bytes.

## Secure AI communication

The client accepts a trusted fixed base URL and explicit private/loopback IP pins (one to eight). DNS answers must all match those pins; the actual connection uses the selected pinned address. TLS certificate verification remains on. Plain HTTP is restricted to loopback unless explicitly authorized for a pinned private address. Credential URLs, query/fragment bases, arbitrary browser URLs and external IP pins are rejected. No redirect is followed.

Only these future operations exist:

- POST `/internal/ai/multi-scan/stage7/recognize`: encoded image plus schema version, tenant, scan UUID and topK. Never retried automatically.
- GET `/internal/ai/multi-scan/stage7/status`: admin-only read; at most one retry for transient transport failure/503.

Deployment base paths (for example `/ai-image-api`) are configured separately; capabilities bind the router path above. A distinct server-only service key signs the existing Stage 2 format `base64url(JSON).HMAC-SHA256`. Claims bind tenant/store/user/current role, method, fixed path, exact JSON body hash, fresh request UUID, signed correlation UUID, iat and exp (maximum sixty seconds). Every retry receives a new replay identity. The new receiver uses the **unchanged Stage 2 capability verifier** and its process-local replay cache. Distributed/restart replay durability is not claimed.

Default request deadline is thirty seconds (hard maximum 120); payload limit 14 MiB (maximum 15), response limit 1 MiB (maximum 2). Image bytes are limited to 10 MiB. Cancellation/deadline bounds DNS, transport and response processing. A timed-out uncooperative transport retains the single active client slot until it actually settles. Native transport streams responses under the byte cap. Errors are structured and sanitized; unavailable receiver/model/index returns AI_UNAVAILABLE. No internal credentials, raw backend errors or arbitrary service response messages are exposed to the frontend.

The unregistered receiver validates capability, signed correlation, scope, bounded canonical base64, scan identity/topK, and passes Buffers into the supplied Stage 6 ScanPipeline. It never imports production catalog models or starts a listener. Real HTTP/TLS connectivity was not exercised because no internal service was activated; tests use injected transport plus the real frozen HMAC verifier.

## Untrusted recognition validation

Require matching outer request/tenant identity, schema version, expected scan ID and review-only flags. At most ten distinct detections and twenty distinct candidates per detection (at most 200 unique IDs total). Detection IDs, XYWH image bounds, candidate IDs/ranks, per-model rank uniqueness, finite cosine/ranking scores, reference IDs and independent index generations are checked. Optional detection/candidate quantities must be integers 1–100; absent detection quantity defaults to one.

Validate expected SigLIP/DINO model IDs and dimensions (768/384), revision/checksum/preprocessor pins, OCR model/checksum/config pins, catalog/policy versions and generation UUIDs. OCR text/regions/coordinates/scores and review/conflict reason codes are bounded. Invalid results, forged confirmation, duplicate detections/SKUs, foreign tenants, stale/mismatched service correlations and malformed model/index metadata fail closed.

Only explicitly whitelisted recognition evidence survives. AI titles, prices and inventory are not catalog authority. Product IDs are reloaded with the current store scope; missing/deleted/foreign/inactive rows are unavailable and excluded. The returned inference revision is retained separately from the fresh resolution fingerprint; no claim is made that old vector data proves current stock or price.

## Current product verification and review-only response

Current price, active status, title, brand, variant, stock, segregate/waiting state and wholesale tiers come from fresh main-catalog reads. The response reports retail price and valid authorized wholesale tiers. Reference unit price follows the existing order convention: select the greatest applicable valid wholesale count only when the current user is admin or wholesale-enabled; otherwise retail. Duplicate/invalid tiers are flagged and do not silently determine price. Legacy wprice/wcount are reported as unapplied metadata, not assumed to replace the existing array-based order logic. Existing discounts, tax, final wholesale aggregation, manual overrides and actual cart checkout remain outside Stage 7; `requiresFinalReprice:true` is always set.

Invalid/negative/nonfinite stock/price is blocked from eligibility. Out-of-stock and insufficient stock remain explicit. Repeated candidate SKUs across detections get conservative potential-aggregate quantity/stock warnings, not a stock reservation. Waiting-stock links are flagged without dereferencing or substituting another product/batch. Current variants remain separate IDs.

No candidate is selected automatically: detection responses have `suggestedProductId:null`, `selectionRequired:true`, and retain alternatives. If a leading AI suggestion is removed, LEADING_SUGGESTION_UNAVAILABLE_NO_SUBSTITUTION is explicit; the next candidate retains its original recognition rank and is not promoted to a confirmed line.

Every scan/detection/product remains `reviewRequired:true`, `confirmed:false`; top-level `cartMutation:false`, `orderPersisted:false`. Responses include detection ID, current product ID/title/brand/variant, authoritative current price details, stock/availability, bounded suggested quantity, alternatives, OCR/model/index/policy evidence and review requirements. No Redux operation, `/gratis/update-cart` call or order persistence exists.

[Isolated smoke output](isolated-smoke.json) demonstrates a catalog price changed to **12.75 after inference** being returned as current authority, one authenticated mocked service call, immutable indexing/metadata DTOs and a prepared-only admin snapshot. It uses mock database/transport and a serialized frozen Stage 6 native fixture; it is not a live database, network or new OCR inference result. Its ~14.6 ms elapsed time is a fixture smoke duration, not a deployment benchmark.

## Tests and backward compatibility

| Stage | Passing tests |
|---|---:|
| Frozen Stage 2 | 31 |
| Frozen Stage 3 | 33 |
| Frozen Stage 4 | 39 |
| Frozen Stage 5 | 56 |
| Frozen Stage 6 | 87 |
| Stage 7 security/catalog | 24 |
| Stage 7 repository/session contracts | 8 |
| Stage 7 service/response/product integration | 30 |
| **Total** | **308** |

All pass. Existing 19 native ONNX tests (Stage 5 DINO + Stage 6 OCR) were rerun separately unchanged. Stage 7 uses isolated/mock database adapters, injected transport, real JWT signing/verification, real frozen HMAC verification and serialized Stage 6 response fixtures. No production model modules/database clients were imported by new code. [Test summary](test-summary.json), individual TAP logs and [syntax checks](syntax-checks.json) are retained.

Reproduction from main root:

```text
node tests/multi-scan/stage7/security-catalog.test.js
node tests/multi-scan/stage7/repository.test.js
node tests/multi-scan/stage7/service.test.js
node scripts/multi-scan/stage7/smoke.js /tmp/NEW-smoke.json
python3 scripts/multi-scan/stage7/regressions.py /tmp/NEW-regression-directory
```

The regression runner executes all existing Stage 2–6 test scripts from their original project roots. Output files/directories must not exist. No listening port is opened for tests.

Before development, full hashes and Git working-tree status were recorded for all three project roots: **106,628 pre-existing files and 88 symlinks**, no exclusions, including node_modules, Git metadata, all frozen routes/controllers, CLIP resources/indexes and image assets. [Before snapshot](protected-files.before.json.gz), [after snapshot](protected-files.final.json.gz) and [authoritative final comparison/new-file inventory](hash-summary.json) record the result. The audit inventory and subsequently written summary are explicitly listed outside their recursive enumeration boundary. No unexpected ONNX telemetry database file was created.

## Exact integration blockers under the frozen-file policy

1. **Existing JWT issuance lacks expiry.** Main `controllers/auth.js` login sign calls around lines 104/129 and `controllers/user.js` registration around line 793 issue email tokens without exp; app issuance also needs an explicit migration decision. The new secure layer intentionally rejects them. Adding bounded expiry and any chosen issuer/audience at those sign calls, or approving a dedicated new credential-validated token issuer, requires a separately authorized integration scope. Existing login files were not changed.
2. **Stage 2 controller DTOs lose required semantics.** Main `controllers/multi-scan.js` scanResponse path reduces candidates to productId/score and drops rich OCR/model/current availability information. Its confirm method hardcodes `confirmed:true`, incompatible with review-only Stage 7. It also exposes only a flattened tenant to adapters rather than this subsystem's verified grant. No scan/confirm adapter was installed into it and no global injection/patch was used. A separately approved controller/composition change must preserve Stage 7 review-only output and authenticated scope.
3. **Image upload and AI transport contracts differ.** Frozen Stage 2 upload emits decoded raw RGB, while Stage 3/7 expects encoded image Buffers. Approved wiring must retain or deliberately re-encode a bounded image; no unsupported sibling-runtime import was added to production main code. The new standalone API accepts encoded Buffers and only sniffs container bytes; full image decoding remains with the Stage 3 worker.
4. **AI receiver is not registered.** The existing AI `routes/multi-scan.js` applies 32 KiB JSON limits under `/internal/ai/multi-scan`; recognition images need the new bounded body contract. Future registration must deliberately resolve that limit/prefix collision and bind cancellation to disconnected requests, then connect the Stage 6 pipeline and scoped snapshot metadata. No existing router/controller/size limit was changed or bypassed.
5. **Production model/session and ownership wiring remains untested.** Model handles, consistent Mongo snapshot support, real reseller-parent mappings/permissions, trusted CDN prefixes, durable snapshot retention and authenticated image delivery must be configured and tested separately. No live DB, image fetch, index rebuild, private HTTP/TLS service or production catalog performance claim is made.

The authentication guard, DTO constructors and pure service/receiver adapters are compatible where their contracts permit. The standalone layer is complete and reviewable; public feature activation and production connectivity are deliberately absent.

## Stage 8 proposal — not implemented

After explicit approval: define the JWT issuance/migration scope and current-user/session policy; validate real tenant/reseller conventions and catalog normalization in an isolated staging dataset; provide durable scoped snapshots and secure image delivery; approve the precise startup/controller/router changes needed to compose the verified worker and review-only API with appropriate upload limits and cancellation; test actual private HTTP/TLS and full resource budgets on staging/VPS; then add an explicit cashier SKU/quantity review flow and a separately approved cart boundary that rechecks final price/stock. Existing cart/order code must remain authoritative and must never receive an uncertain AI suggestion as a confirmed line. No Stage 8 work has been performed.
