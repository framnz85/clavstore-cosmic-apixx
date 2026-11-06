# Minimum later integration proposal — not implemented

All existing files remain frozen for Stage 9. This document identifies exact integration boundaries for a later approved stage; it does not authorize feature activation or cart mutation.

## Separate frontend entry and feature flag

`src/App.js` currently declares the POS lazy import at line 68 and mounts `/:slug/pos` around line 806 inside UserRoute, only when a cart already exists. Do not change that route or the old scanner. The smallest disabled mounting patch is one lazy declaration and one independent route inside the existing Routes/Suspense tree:

```jsx
const MultiScanPosPanel = lazy(() => import('./components/multiScan/MultiScanPosPanel'));
// A separate route; this is proposal text only.
<Route path="/:slug/admin/multi-product-review" element={
  <AdminRoute landing="orders"><MultiScanPosPanel enabled={false} /></AdminRoute>
} />
```

This uses the existing orders access convention and permits review with an empty cart. AdminRoute is a navigation convenience; it must not be trusted as API authorization. For actual staging review, an explicitly approved flag could replace the false literal with `process.env.REACT_APP_MULTI_SCAN_REVIEW_ENABLED === 'true'`. Keep it absent/false by default. The frozen Stage 8 panel reads `user.token`, `estoreSet._id`, `estoreSet.resellid` and the existing cart selector. Validate those store/reseller fields against the deployed catalog before activation. Do not add a dispatching/persisting onPrepared callback.

A disabled mount needs only App.js changes; enabling usable browser scanning additionally needs the server work below. The existing single-product scanner (`ImageCapture.js`, old AI API function, routes and legacy model/index resources) is not part of this patch.

## Authentication and main API

Existing `controllers/auth.js` JWT sign calls around lines 104/129 and `controllers/user.js` around 793 issue tokens without expiration. Stage 7 intentionally rejects those tokens. Approve bounded token issuance/migration in those files or approve a dedicated credential-validated scanner token issuer. Do not relax Stage 7 expiry, signature, lifetime, membership, reseller ownership, role or wholesale checks. Use separate strong JWT and HMAC service keys, configured through trusted server startup.

`routes/multi-scan.js` and `controllers/multi-scan.js` currently route Stage 2 DTOs; the scan output loses rich Stage 7 data and confirm emits confirmed status. A later approved integration must either replace that scan handler boundary or introduce a separately registered controller that deliberately wins routing for the existing browser path `/ai/multi-scan/scan`. Avoid ambiguous autoload order. Preserve encoded upload bytes after bounded image validation: frozen `services/multi-scan/upload.js` currently emits raw RGB, while Stage 7 expects encoded bytes. Prefer a new bounded upload adapter passed explicitly at the approved route wiring rather than editing the old scanner or global runtime.

New authenticated catalog search and fresh review handlers are required for the frozen Stage 8 client paths:

- GET `/ai/multi-scan/stage8/products`: scoped current catalog candidate DTOs, source authority and tenant. No vector output may authorize a product by itself.
- POST `/ai/multi-scan/stage8/review`: exact IDs/counts, scan ID and optimistic cart fingerprint only; return fresh authoritative product records and final prices for total existing-plus-added quantity. Verify current permissions, stock, wholesale tiers, waiting/segregated flow and SKU/slug collisions. The Stage 9 review-verifier module is an offline contract demonstration, not a production controller or production cart authority.

Use Stage 7 `createSubsystem` with explicitly injected production model handles and snapshot session support only after approval. Keep `MULTI_SCAN_ENABLED` false and review-only flags mandatory. Do not wire the frozen Stage 2 confirm endpoint into review.

## Private AI receiver and body limits

Register the pure Stage 7 receiver through a new explicitly composed handler, not a discovered side-effect module. Existing AI `server.js` line 18 installs a global 2 MiB JSON parser before route autoload at lines 44–45. Existing AI `routes/multi-scan.js` installs a 32 KiB parser across `/internal/ai/multi-scan`. Both block the roughly 14 MiB encoded-image contract. Therefore AI server.js needs an approved early mount for the exact new receiver paths with the bounded private body parser **before** the global parser and legacy route prefix handler. Do not increase all public body limits as a workaround. Keep fixed operation paths, private/TLS address pins, HMAC body binding, replay checks, deadlines and cancellation. Real socket/TLS/disconnect behavior remains untested here.

The Stage 6 scan pipeline and Stage 7 validator hard-cap 10 objects. Approving 20 requires coordinated, measured limits in those frozen components, service response caps and UI resource budgets; Stage 9 deliberately did not bypass the limit.

## Rollback

Disable the frontend review flag and both main/AI feature gates first; cancel/drain active workers. Remove the separately approved App.js route/import and explicit backend handler registrations, restoring the prior signed deployment artifact. Keep new isolated modules inert. Never delete or rebuild legacy scanner resources during rollback. Because review-only mode has no cart/order writes or schema migration, it needs no cart data rollback. A future mutation stage must define its own idempotency/atomic stock and reconciliation rollback plan before being approved.

## Stage 10 roadmap

1. Supply rights-cleared real references and independently human-reviewed checkout scenes. Audit tenant IDs, variants, sizes, unknowns, occlusion/rotation/lighting and held-out capture-session splits; measure accuracy before selecting thresholds.
2. Approve exact frozen-file changes for short-lived authentication, encoded upload, rich response composition, new catalog/review endpoints and early private receiver registration. Validate database snapshot topology, real reseller mappings, authenticated immutable reference delivery, durable index/snapshot retention and key rotation.
3. Run actual private HTTP/TLS, disconnect/timeout/replay and browser camera/EXIF/resize/accessibility E2E tests in non-production. Test stale catalog/cart races and native failure/resource limits. Profile target VPS CPU, resident memory, worker count and queue/admission control using representative data; local numbers are not InterServer capacity evidence.
4. Keep disabled by default and review-only until explicit activation approval. Actual Redux dispatch, localStorage persistence, updateCart calls and order writes require a separate approved scope with existing server validation, exact SKU isolation, atomic stock checks and idempotency. Stage 9 provides no such activation.
