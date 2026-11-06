# Proposed integration changes — DOCUMENTATION ONLY

No patch below was applied. Existing files, Stage 2–9 modules and all original scanner resources remain protected. These specifications require explicit approval before implementation. Stage 10 helpers are inert new modules, not registered HTTP handlers.

## Backend flow and minimum wiring

Browser multipart photo + scanner credential → main feature gate → Stage 7 signature/expiry + current store/reseller authorization → bounded Stage 2 upload → new Stage 10 oriented-RGB/PNG bridge → Stage 7 Integration.scan → fixed private AiClient operation with signed body/correlation → Stage 7 receiver → Stage 3 YOLOX → crops → Stage 4 SigLIP + independent Stage 5 DINO retrieval → Stage 6 OCR/reranker → Stage 7 response validation/current catalog → new complete-review guard → rich review response. Unknown detections have empty/uncertain candidates and remain unselected. No Stage 2 confirm call and no cart persistence.

**main routes/multi-scan.js:** approve replacing only the new multi-scan /scan registration's controller/auth composition, plus new authenticated Stage 8 search/review registrations. Keep /ai/multi-scan/scan because the frozen frontend client uses it. Do not rely on route-autoload order to override it from another file. Stage 7 routeAuth handles the Stage 2 middleware shape; the actual scan must obtain its own verified grant through Integration.scan or a deliberately reviewed public grant interface, rather than fabricate a grant from req fields. Admit after verified authorization and release only after native work settles, even if the response socket closes. Keep disabled gate before upload allocation. New rate/admission helpers do not authenticate callers.

**main controllers/multi-scan.js:** approve a separate rich scan-controller path or replace only that multi-scan handler. Existing scanResponse strips rich model/OCR/current product data and the existing confirm handler emits confirmed:true. Neither is usable unchanged as a Stage 7 review endpoint. New handlers should pass the verified raw header token/store/reseller selector to Integration.scan, call requireCompleteReview on its result with the independently authorized scope, and return it without the Stage 2 DTO reducer. Generate server correlation UUIDs; propagate deadlines/disconnect AbortSignal into every await. Do not map foreign catalog messages or stack traces to browser errors.

**Upload resolution without a frozen upload edit:** Stage 2 validateImage produces bounded fully decoded EXIF-oriented RGB. The new stage10/upload-bridge.js re-encodes that RGB as PNG, preserves dimensions and applies a <=10 MiB output cap. Offline tests verify exact pixels/dimensions and compose the frozen validator with Stage 7 imageBuffer. Wire this helper through the approved controller/route composition; do not alter services/multi-scan/upload.js, the old camera, or the old runtime. Compression expansion can reject a valid large source as IMAGE_TOO_LARGE; do not silently downscale and misalign frontend overlays. Keep native runtime paths explicit and verified. No production image decode/HTTP upload was exercised here.

**New search/review controllers (unregistered):** GET /ai/multi-scan/stage8/products requires current scoped search with Stage 7 candidate DTOs. POST /ai/multi-scan/stage8/review accepts exact IDs/counts, scan ID and optimistic cart fingerprint only; authenticates again, loads the authoritative cart/current catalog and returns exact products/current totals/wholesale-authorized unit prices. Never accept client prices or use the fingerprint as authorization. Bind scans to tenant/user with expiry, record manual-search provenance, and treat `manual-review` as a separate authenticated manual-catalog flow. Stage 9 review-verifier is an offline example using fixture state, not a production server cart implementation. Scan registry, image provider and metadata/index snapshot adapters still need a trusted production design.

**AI server.js:** approve an explicit early mount of the Stage 7 private receiver path BEFORE the global express.json({limit:'2mb'}) around line 18 and legacy route discovery around lines 44–45. A new controller/parser may live in new service files; do not place an auto-activating file in routes as a workaround. Give exact paths a bounded <=14 MiB JSON contract compatible with the <=10 MiB image, before the legacy /internal/ai/multi-scan 32 KiB prefix parser. The Stage 7 body validator/base64 cap and signed-body limits still apply. Keep other public parser limits unchanged. If early mounting is rejected, modifying the old prefix router to deliberately skip/delegate the new path is an alternative approved change, not both by default.

Compose actual workers and authorized snapshot/image metadata at trusted startup only. New production modules must not import Stage 9 fixtures or telemetry-disabled test singleton workers as an application bootstrap. Preserve model/preprocessor checksums and independent generation IDs, use private/TLS address pins, fixed operation paths and the unchanged signed capability verifier. Verify replay protection across workers/restarts before a multi-worker deployment; existing replay/snapshot registries are process-local.

## Proposed frontend patch (not applied)

Only a disabled mount can be reviewed independently of server readiness. Existing App.js uses lazy imports/Routes/Suspense, and /:slug/pos requires a nonempty cart inside UserRoute. Use a separate scanner route with an empty-cart-compatible orders guard; leave that route and the old single-product scanner intact.

```diff
--- src/App.js (protected; proposal only)
+++ src/App.js (proposed future edit)
@@ lazy component declarations
+const MultiScanPosPanel = lazy(() => import('./components/multiScan/MultiScanPosPanel'));
@@ inside existing Routes/Suspense
+<Route path="/:slug/admin/multi-product-review" element={
+  <AdminRoute landing="orders"><MultiScanPosPanel enabled={false} /></AdminRoute>
+} />
```

After approved authentication/endpoint staging, a separate approval may replace false with `process.env.REACT_APP_MULTI_SCAN_REVIEW_ENABLED === 'true'`. Keep absence/false disabled. Existing MultiScanPosPanel passes user.token; the recommended scanner-specific issuer requires an approved credential wrapper/panel change per AUTHENTICATION.md. Match selected estoreSet._id/resellid to URL/authorized context and reset on changes. AdminRoute navigation is not server security. Leave onPrepared unset or review-only; never dispatch/store/persist the returned action in this rollout.

Stage 8 already has user-click camera permission, device selection, lifecycle cleanup, orientation normalization, progress/cancel/retry, explicit SKU/quantity acknowledgment, manual search and unknown exclusion. Actual browser/EXIF/keyboard/permission UX has not been verified on hardware. API/missing-service errors are visible; proposed TOO_MANY_OBJECTS should gain a plain-language mapping in src/functions/multi-scan.js if enabled staging uses the new server rejection.

**Additional usability/safety observation:** frozen model.js discards top-level reviewReasons; the scanner renders per-detection warnings only. Stage 6 truncation CROP_LIMIT_APPLIED can therefore be hidden. The new server-side requireCompleteReview rejects this response before exposure when wired, without a frozen frontend edit. Recommended future approved model.js/MultiProductCameraScanner.jsx changes also preserve/display scan-level warnings, with MultiScanSummary/useMultiScan blocking preparation for incomplete scans. Do not silently acknowledge or merge omitted objects. No such edits were performed.

## Feature flags, error and deadline policy

Frontend flag false, main MULTI_SCAN_ENABLED=false and private receiver gate false are independent defaults. The pure Stage 7 receiver has no automatic gate/registration: its future handler must supply the gate. Failure of configuration/model/index/authorization must fail closed without impacting legacy startup or falling back to the old scanner.

Proposed staging deadline ladder (configuration proposal, not a measurement): upload <=15 s, private inference <=45 s, main post-upload <=60 s, browser <=90 s and reverse-proxy budget >=95 s with bounded body/read timeouts. Frozen default AI/main operation timeout is 30 s; Stage 7 maximum is 120 s and frontend currently 90 s. Choose a compatible ladder with actual target-host p95/p99 evidence before approval, rather than independently increasing timeouts. Native abort may not preempt an ongoing session; hold admission until its promise settles and terminate/replace a dedicated worker on a separately defined hard watchdog. Do not release a CPU slot solely on HTTP close as the Stage 2 capacity middleware currently does. No response retries for recognition; retry requires explicit user action/new submission identity.

Use stable errors: disabled 503; auth 401; role/tenant 403; invalid image 415; byte cap 413; oversized/incomplete object workload 422; busy/rate 429 with bounded Retry-After; unavailable model/index 503; timeout 504. Map internal unknown codes to sanitized generic messages with a server UUID. Keep actual Stage 7 errors where safe, log only allowlisted diagnostics. No internal URLs, SQL/Mongo text, credentials, image bytes or foreign product details in browser errors.

## Exact protected-file approval inventory

| Protected file | Proposed change | Required when |
|---|---|---|
| frontend src/App.js | One lazy import and separate disabled orders-guarded route | Any UI mounting |
| frontend src/components/multiScan/MultiScanPosPanel.jsx (or approved new credential wrapper via App.js) | Scanner-purpose credential boundary, tenant reset | Recommended dedicated issuer |
| main routes/multi-scan.js | Explicit Stage 7 scan auth/controller composition and new search/review/credential registrations | Any browser integration |
| main controllers/multi-scan.js OR approved new controller imported by the route | Rich review DTO, RGB bridge, complete-review guard, cancellation/admission | Any usable scanning |
| AI server.js | Exact early gated private parser/receiver mount before global parser/autoload | Private encoded-image integration |
| main controllers/auth.js, controllers/user.js, controllers/app/user.js | Explicit bounded signed issuance if shared-token alternative chosen | Alternative only |
| main controllers/order.js | Purpose-isolation decision for order-derived token, not a blanket scanner upgrade | Authentication migration review |
| frontend src/functions/multi-scan.js | Clear additional incomplete-scan/service error mapping | Recommended enabled UX |
| frontend src/components/multiScan/model.js, MultiProductCameraScanner.jsx, MultiScanSummary.jsx/useMultiScan.js as needed | Preserve global warnings and block incomplete preparation | Recommended defense in depth; server guard mandatory |
| AI stage6/pipeline.js; main stage7/validation.js and related bounded response/query budgets | Coordinated >10 cap change | Future >10 support only; not staging minimum |

No package manifests, legacy scanner, old image endpoint, cart reducer or persistence function needs to be changed to mount a disabled review-only page. Production connection/configuration, durable snapshots, rate coordination and image providers need explicit new modules and authorized startup wiring; none is installed now.
