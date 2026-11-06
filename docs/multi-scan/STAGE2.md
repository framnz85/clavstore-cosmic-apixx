# Multi-product scanner — Stage 2

Status: disabled route skeleton. No AI models, catalog adapter, database connection, live index rebuild, or cart mutation is implemented. Do not enable this as a working scanner. Stage 3 requires separate approval.

## New routes

The existing servers auto-discover every file under `routes/` and mount it beneath `API_ROUTES`. The added CommonJS routers preserve that mechanism; neither server nor any legacy route was edited.

Main API (current prefix `/cosmic-api`):

- `POST /ai/multi-scan/scan`
- `POST /ai/multi-scan/confirm`
- `GET /ai/multi-scan/status`
- `POST /ai/multi-scan/index/rebuild` (admin)
- `GET /ai/multi-scan/index/status` (admin)

Image API (current prefix `/ai-image-api`):

- `POST /internal/ai/multi-scan/scan`
- `GET /internal/ai/multi-scan/status`
- `POST /internal/ai/multi-scan/index/rebuild` (admin)
- `GET /internal/ai/multi-scan/index/status` (admin)

Disabled requests return HTTP 503 with `FEATURE_DISABLED`, including readiness. Unrelated paths pass through normally. Existing single-scan request/response formats are untouched. An invalid optional multi-scan configuration falls back to disabled registration rather than preventing legacy startup. Default router imports never load Sharp/Multer, AI models, legacy controllers, or database modules.

## Security and integration interfaces

`createRouter({ config, adapters, loadRuntime })` is exported alongside the default disabled Express router for isolated integration and tests. It does not read an arbitrary adapter path from an environment variable.

The main API verifies existing HS256 tokens using `MULTI_SCAN_JWT_KEY` or `JWT_PRIVATE_KEY`, including expiry when present. Existing login tokens may lack expiry; adding mandatory expiry or audience would need a separately reviewed token migration. The new middleware does not use or change legacy JWT-decoding middleware.

Required main adapters:

- `resolveTenant({email, storeId, signal})`: read trusted records, validate membership and active role, resolve the store's package. Return `{storeId, packageId, userId, role}` using canonical IDs. Never use browser `resellid` to select a database. A supplied mismatching package header is rejected.
- `scan({tenant, photo, signal})`: internal inference transport. No real implementation is supplied in Stage 2.
- `authorizeProducts({tenant, productIds, signal})`: return only IDs currently belonging to this store. Foreign/deleted candidates are stripped before browser responses.
- `recordScan({tenant, scanId, result, signal})`: persist a short-lived, user/store-bound scan record with allowed candidates and catalog context before returning it. Future manual corrections must also be checked against the authorized store catalog.
- `confirm({tenant, scanId, items, signal})`: verify the recorded scan belongs to this user/store, is unexpired, and is eligible for confirmation. Load fresh product records, reject unavailable/deleted/inactive products, validate combined quantities against cart/stock rules, and return `{catalogRevision, items}`. Each item must include `{productId, storeId, quantity, activate, title, price, requiresVariantSelection}`. Prices are fresh catalog values, not vector metadata. No cart persistence occurs here.
- `requestRebuild({tenant, signal})`: future tenant-scoped asynchronous job; return `{jobId}`. Must deduplicate active jobs and never use old index locations.
- `indexStatus({tenant, signal})`: return `{state}`, one of `not_built`, `queued`, `building`, `ready`, `failed`.

Missing adapters return explicit HTTP 503. Database adapters and wiring remain later-stage integration work. Merely setting `MULTI_SCAN_ENABLED=true` does not make the feature usable. No claims of live tenant verification, working recognition, or current production prices are made from mocked tests.

Internal AI authentication uses a distinct `MULTI_SCAN_SERVICE_KEY` of at least 32 bytes. The `x-multi-scan-capability` format is `base64url(JSON).hex(HMAC-SHA256(payload))`. Claims: `{aud:'multi-scan-image',storeId,packageId,userId,role,iat,exp,requestId,method,path}`. `path` is the router path including `/internal/ai/multi-scan`, excluding the deployment prefix. Maximum lifetime is 60 seconds. Every request needs a unique UUID requestId. JSON POSTs bind `bodyHash` to SHA-256 of `JSON.stringify(parsedBody)`; multipart scan requests bind `photoHash` to SHA-256 of the original photo bytes. Never put the service secret in the frontend.

Replay protection is bounded and process-local. A deployment with multiple workers needs a shared replay store or equivalent ingress enforcement before activation. Service TLS/network isolation, rotation, rate limits across processes, distributed build locks and a cancellable worker are future deployment requirements. Adapters must observe AbortSignal and bound any background work; HTTP deadlines alone cannot forcibly stop a native inference task. No worker or production transport is started here.

## Configuration

No existing `.env` was edited. Supported environment variables:

| Name | Default |
| --- | --- |
| MULTI_SCAN_ENABLED | false; only literal `true` enables routing |
| MULTI_SCAN_MAX_BYTES | 10485760 |
| MULTI_SCAN_MAX_PIXELS | 24000000 |
| MULTI_SCAN_MAX_DIMENSION | 10000 |
| MULTI_SCAN_UPLOAD_TIMEOUT_MS | 15000 |
| MULTI_SCAN_OPERATION_TIMEOUT_MS | 30000 per adapter call |
| MULTI_SCAN_MAX_ACTIVE | 1 active upload/scan per router process |
| MULTI_SCAN_JWT_KEY | existing JWT_PRIVATE_KEY fallback, main only |
| MULTI_SCAN_SERVICE_KEY | unset, AI only |

Uploads allow exactly one `photo`, no additional form fields. Supported actual formats are single-frame JPEG, PNG and WebP with matching MIME. Sharp enforces pixel/dimension limits, fully decodes, rotates EXIF orientation and produces bounded RGB data. The original detection image is not reduced to embedding resolution. Data remains in memory; no image/cache files are written. Upload and adapter deadlines return clear errors. Limits are per process, not distributed quotas.

## Response contracts

Errors: `{ok:false,error:{code,message}}` with 400/401/403/408/413/415/429/502/503/504 as appropriate. Unexpected errors return a generic 500, without internal paths or credentials.

Scan: `{ok:true,scanId,image:{width,height},indexVersion,scoreType,detections}`. Boxes are `[x,y,width,height]` in oriented source pixels. Each detection has a unique ID, candidates `{productId,score}`, `reviewRequired:true`, and `UNVALIDATED_MATCH` or `UNKNOWN_PRODUCT`. Raw ranking scores are not probabilities. Empty detections are valid. No boxes, products, prices or quantities are fabricated.

Confirm request: `{scanId,items:[{productId,quantity}]}`. Duplicate IDs must first be aggregated; counts must be integers 1–100 with 1–100 lines. Client price/excess/override fields inside items are rejected. Confirmation returns `{ok:true,scanId,confirmed:true,cartMutation:false,catalogRevision,items}`. Variant selection remains explicit. The existing cart API must still validate final pricing and inventory; the frontend must not treat a confirmation as a saved cart or reserved stock.

Readiness honestly reports `ready:false` in this skeleton. The internal scan/rebuild endpoints return model/index unavailable even with valid authorization. There is no auto-add or model loading.

## Dependency isolation

Existing main API packages include Express/jsonwebtoken, but not Multer or Sharp. The new `multi-scan-runtime/package.json` proposes pinned Multer 2.0.2 and Sharp 0.34.5. It was **not installed**. Any future install must occur inside this new package only and may create its own lockfile/node_modules; it must not update the parent manifest, lockfile or dependencies. A missing runtime returns HTTP 503 only when the enabled scan route needs it.

The AI API uses its already installed Multer and Sharp. The tests explicitly inject those dependencies into the main router; production main runtime resolution does not import the sibling project. No packages were added to existing dependency directories.

## Tests and safety verification

Run from the main API project:

```sh
node tests/multi-scan/stage2.test.js
```

This uses Node's test API, real Express/Multer/Sharp, synthetic image buffers and mocked trusted adapters. Node HTTP streams run in memory without ports. The test imports no production server, database, Redis, legacy model loader or index builder. Tests can also be invoked through `node --test` where the environment supports child-process test reporting.

The safety evidence includes baseline SHA-256 inventories, original Git status, final comparison and a complete list of new files. Source/assets/manifests/lockfiles are covered even when untracked; `.git`, sandbox control directories and `node_modules` are excluded from the source inventory. A separate full dependency-inclusive baseline was attempted; only report its coverage if completed. No dependency installation or mutation was performed.

Frontend Git resolves to `/mnt/g` and reports this frontend tree as untracked; the two API projects started clean. Hash comparison is the source of truth for existing files. Existing scanner code/assets and production image directories must remain untouched.

## Frontend blocker

`src/index.js` imports `App` explicitly; `src/App.js` uses explicit imports and `<Route>` entries. No plugin, glob import, or extension registration mechanism was found. A new scanner component is not reachable solely by adding its file.

Smallest future integration proposal: import a new scanner page and add a protected `/:slug/multi-scan` route in `src/App.js`. A cashier can then use its URL; an optional visible button would additionally require an additive navigation edit (e.g. Header/TabBottom/CartButton). These edits are **not authorized and were not made**. An isolated standalone frontend is a zero-edit alternative for review, but it would not automatically share the existing application's cart and should not be presented as completed POS integration. Do not use runtime injection or monkey-patching.

No frontend component or cart adapter was implemented in Stage 2; those belong to Stage 8 and remain subject to the integration restriction.

## Proposed Stage 3 (approval required)

Implement a new detector interface and independent model manifest, preprocessing, letterbox coordinate recovery, NMS and crop tests. Evaluate a rights-cleared YOLOX-Tiny ONNX artifact with real inference on CPU. Keep it outside old CLIP assets. Generic weights do not prove grocery instance detection; use labeled counter photographs to determine custom training needs. Benchmark latency/memory and impact on the old scanner before activation. Do not integrate SigLIP/DINO/OCR or deploy as part of Stage 3 without the relevant later-stage authorization.

## Created-file inventory

Main API (13 new files):

- `routes/multi-scan.js`
- `controllers/multi-scan.js`
- `middlewares/multi-scan-auth.js`
- `services/multi-scan/contracts.js`
- `services/multi-scan/upload.js`
- `services/multi-scan/runtime.js`
- `multi-scan-runtime/package.json`
- `tests/multi-scan/stage2.test.js`
- `tests/multi-scan/verify-protected.py`
- `docs/multi-scan/STAGE2.md`
- `docs/multi-scan/protected-files.before.json`
- `docs/multi-scan/protected-files.after.json`
- `docs/multi-scan/tests-stage2.tap`

AI API (6 new files):

- `routes/multi-scan.js`
- `controllers/multi-scan.js`
- `middlewares/multi-scan-service-auth.js`
- `services/multi-scan/contracts.js`
- `services/multi-scan/upload.js`
- `services/multi-scan/runtime.js`

Frontend: no files created or modified.

## Executed verification

`node tests/multi-scan/stage2.test.js`: **31 passed, 0 failed**, using mocked catalog/inference adapters and real upload/image libraries. TAP output is saved in `tests-stage2.tap`. All new JavaScript files passed `node --check`. These are skeleton tests, not model accuracy or production-readiness evidence.

Protected-file SHA-256 comparison is recorded in `protected-files.after.json`; the inventory covers 11,644 pre-existing source/configuration/manifest/lockfile/model/index/image files across all three projects. Read the report's `unchanged`, `changed`, and `missing` fields for the executed comparison. Dependency directories and Git/sandbox metadata are excluded; no dependency installation or modification was performed. No existing single-product scanner file or asset was intentionally changed. No production services, database connections, deployments, commits or pushes were performed.
