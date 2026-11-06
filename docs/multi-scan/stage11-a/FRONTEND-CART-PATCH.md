# Frontend mounting specification and cart audit

**PROPOSED; no patch applied.** Current frontend root is `/mnt/g/clavstore/clavstore-ui/clavstore-reseller-original`. Source references below are relative to that root; exact absolute paths and baseline hashes are in APPROVAL-MATRIX.json.

## Minimum separate POS entry

Stage 10's App.js-only example makes a disabled direct URL possible, but it does not add access from the existing POS and would pass an incompatible legacy user.token if MultiScanPosPanel were enabled. The selected plan uses new wrapper components rather than modifying global authentication, old camera or the frozen Stage 8 panel.

| Target | Exact insertion point / imports | Proposed behavior | Regression | Rollback |
|---|---|---|---|---|
| src/App.js | Lazy declarations next to PointOfSale around line 68; new Route inside Routes (starts :635), adjacent to admin/orders around :896–904. Existing lazy, Route, AdminRoute and Suspense already imported | Conditional separate `/:slug/admin/multi-product-review` route only if review flag explicitly true; new lazy ScannerReviewEntry wrapper | Disabled flag has no route/network/camera; empty-cart URL works when explicitly enabled for isolated tests; old /:slug/pos and admin orders unchanged | Remove only new lazy declaration and conditional Route hunk using preapproved bytes |
| src/pages/PointOfSale.js | New ScannerReviewLink import near line 10; render immediately after `<h4 className="pointofsale-title">` at :274, before hr | Distinct **Multi-product review** link only for permitted current store and explicit flag. Do not repurpose old barcode/camera button or save-order callback | Flag false leaves old markup/behavior; authorized link uses selected store slug; no cart change on click; mobile/desktop access; existing Save Order and old scanner preserved | Remove only import and link element hunk; no calculation/payment edits |

Illustrative specification (documentation, not an applicable patch):

```jsx
// App.js: new lazy declaration alongside existing PointOfSale declaration
const ScannerReviewEntry = lazy(() => import('./components/multiScan/stage11/ScannerReviewEntry'));
// Inside existing Routes/Suspense, near the admin orders route
{process.env.REACT_APP_MULTI_SCAN_REVIEW_ENABLED === 'true' && (
  <Route path="/:slug/admin/multi-product-review" element={
    <AdminRoute landing="orders"><ScannerReviewEntry /></AdminRoute>
  } />
)}
// PointOfSale.js: one new import/element; the new component owns flag/permission checks
import ScannerReviewLink from '../components/multiScan/stage11/ScannerReviewLink';
// Immediately after existing POS title:
<ScannerReviewLink />
```

Flag is a public CRA build-time boolean, not a secret or live kill switch. Do not change any environment/configuration file in 11-B without separate explicit approval. Defaults remain false; tests may provide literal configuration through declared interfaces without activating a deployed build. A later runtime rollback must close backend admission immediately; removing an already-built browser link may require rebuilding/restoring an artifact. Backend gates remain mandatory regardless of cached browser flag.

The POS page currently renders only when cart is nonempty (App.js:806–825). This separate route has no such condition and may be visited directly when empty. A menu/header link for empty-cart discovery is optional and is not part of the minimum patch. Existing PointOfSaleButton.js:123–130 opens the old Barcode modal and :137 calls handlePosOrder; leave both intact. Header.js navigation/search remains unchanged. No original camera function, old `/gratis/ai-image/search`, payment/saveCartOrder callback, reducer, global style or product-search implementation is edited.

## New wrapper contract (new files only in 11-B, not created now)

ScannerReviewEntry must verify selected estoreSet._id/resellid, authenticated UI subject and `useParams().slug` agree before requesting scanner credentials; initial render must remain paused until this is resolved. AdminRoute uses role checks and effect-based navigation (src/components/routes/AdminRoute.js:89,99–118), not a cryptographic or synchronous per-store security boundary. It can render children before a redirect, so do not use it to authorize camera/network access or infer server permission.

The new entry obtains a scanner-specific credential by fresh password proof, keeps it in memory, pins the selected main API origin and tenant, and passes credentials/cart read-only into existing MultiProductCameraScanner through its public props. Use createMultiScanApi({enabled,baseURL}) with the pinned base and explicit credential handling; old chooseApiLink switches main hosts using stored-token/store-age state while login uses a different auth host. Do not send scanner credentials to a guessed API host. MultiScanPosPanel.jsx currently passes user.token unchanged; leave it unmodified and do not use it as the enabled credential boundary.

On scanner 401/expiry, logout/user/store/reseller/API-base change: abort all scanner operations, unmount/clear photo/review, stop tracks/revoke URLs through existing cleanup, drop scanner credential and require explicit reauthentication. Preserve global Redux user, legacy userToken and customer cart. Do not reuse App.js's broad res.data.err localStorage.clear/emptyCart path, and do not add global Axios interceptors. A new API object composed from public methods may surface typed expiry/truncation errors and safe scan-level warnings; it must not mutate the old client object or module exports.

No camera opens just by loading a route: Stage 8 CameraCapture is user-triggered, with per-device stream cleanup and capture readiness. Existing camera.js normalizes file orientation via createImageBitmap and caps longest edge at 1920; unsupported browser behavior is explicit. Cancellation/generation guards, responsive SVG viewBox, manual catalog correction, explicit exact-SKU acknowledgment and unknown exclusion are available offline. Actual browser permission/EXIF/device/keyboard behavior is **NOT VERIFIED**. Native/raw returned boxes must match the oriented uploaded preview dimensions; server PNG bridge does not resize.

Scan-level warning handling is mandatory at the new API boundary before old normalizeScan, which drops top-level reviewReasons. Reject detector/candidate/crop truncation and wrong model/index context before returning any selectable result. Display noncritical scan warnings in the new wrapper if needed. The old Stage 10 crop-only guard is not enough (probe P06). A future defense-in-depth patch to frozen model.js/scanner/summary/hook remains optional separately approved work, not silently bundled into App.js changes.

Potential UX defect to test: ManualProductSearch.jsx keys lifetime by credential context, not scan ID; selected correction target and result list can outlive a rescan. useMultiScan.manual() can turn a stale target ID into a new manual item. Fresh server verification/cashier acknowledgment still protect mutation, but target reset on new scan should be explicitly tested and any frozen ManualProductSearch change separately approved. Do not fix this with DOM injection or hidden state patching.

## Cart safety findings

| Invariant | VERIFIED FROM SOURCE / historical test | Remaining limit before enabled staging |
|---|---|---|
| Exact SKU grouping | model.js:11 uses productId map; flavor/size IDs stay separate | Per-detection acknowledgment must remain explicit; no auto-leading choice |
| Unknown exclusion | aggregateSelections requires known reviewed SKU or explicit exclusion; requires at least one known item to prepare | Whole-unknown scans can be reviewed but cannot produce a cart proposal; explain this rather than auto-substitute |
| Current price/stock | cartAdapter.js:14–30 calls verifySelections, requires current-main-catalog authority and total existing+new stock; freezes neither live DB nor stock | Production verifier not registered; must load server-owned scoped cart, not trust browser fingerprint or fixture getCart=[] |
| Slug collision | cartAdapter.js:24 rejects distinct IDs sharing current p.slug; getUnique.js merges _id OR slug | Stage 7 repository.js:4 omits slug; new review projection must include real current slug (probe P07), or this defense cannot run reliably |
| Special/waiting flows | Adapter rejects selected excess/manual-price lines, segregate and waiting.newQuantity | It does not independently reject waiting._id with zero/absent newQuantity. Server review must reject those links and preserve existing POS flow |
| Duplicate submit | Adapter pending flag; hook busy ref; prepared button disabled until edit | Process-local UI defense is not durable idempotency. Repeated proposal preparation does not authorize a write; future mutation requires scoped durable replay/version protection |
| No Redux/state mutation | Returns copied draft + existing storeToCart action creator; never dispatches; commit throws | Prepared plan/action must not be passed to a mutating callback; new wrapper leaves onPrepared unset or displays a read-only plan |
| Existing cart identity | Copy/fingerprint before/after await | New server validator must reject/explicitly handle duplicate IDs, foreign cart lines and special lines; using find() on first existing line is not proof of complete stock accounting |
| Existing price/wholesale | Stage 7 currentProduct and Stage 9 fixture verifier follow current authorized thresholds; old updateCart recomputes using cached/current records | Do not return raw internal product clones or supplier-cost/showPass fields. Fresh public product shape and manual-override rejection required |
| No server validation bypass | Existing AddToCart.js:136–141 dispatches/writes/persists and cannot be reused as a pure scanner add helper | Do not invoke it or order.updateCart, saveCartOrder, cart reducer dispatch or localStorage setItem during review-only staging |

Further conservative behavior: Stage 7 potentialAggregateQuantity counts every detection's alternative candidate. A SKU may be marked unavailable for potential ambiguity even when explicit final selected quantity would fit. Stage 8 aggregateSelections rejects availability=false before fresh review, so correction may need current manual search or a separately approved refined eligibility design. This is a fail-closed usability limitation, not permission to bypass stock checks.

Stage 7 MongooseRepository has no current text search API and no full POS public product DTO. The new scoped search/review repository should retain current/authorized lookup but select only required public fields including slug; don't broaden Stage 7 projection silently or call legacy global cached search under decode-only auth. Stage 9 createOfflineReviewVerifier clones fixture products and has no durable scan ownership/expiry registry; it is a contract example, not a production controller.

Initial staging remains review-only: exact current records and an undispatched plan may be displayed; **no automatic cart addition, Redux dispatch, order API or live persistence**. No DB schema migration/dependency installation is needed for this read-only proposal. Optional future mutation is excluded from 11-B and requires an independent atomic stock/cart/idempotency design and authorization.
