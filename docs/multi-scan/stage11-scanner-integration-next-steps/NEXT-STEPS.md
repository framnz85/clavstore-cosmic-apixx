# Scanner-only continuation: picture to confirmed frontend cart

This supersedes the direction of the interrupted payment-access design. This review continues only the camera-based multi-product scanner. No application source, feature flag, model/index, cart or business workflow was modified or activated. Only this new scanner review directory is authored here. Previous source changes are left untouched. No deployment or production database/server access.

## Required finish line

Photograph -> AI Image API -> YOLOX-Tiny individual detections -> SigLIP2 + DINOv2 + OCR -> exact selected-store catalog candidates -> cashier review/correction/quantity -> explicit final confirmation -> existing frontend cart -> release scanner resources and return control to frontend.

The scanner stops at frontend cart handoff. It does not call payment, order submission/status, checkout, registration, recovery or unrelated authentication APIs. It does not redesign the existing workflows after cart handoff. The original single-product/image/barcode scanner remains a separate unchanged path.

## Source-verified current state

| Stage | Existing implementation/evidence | Remaining work |
| --- | --- | --- |
|1–2 | Architectural/disabled-route boundaries are retained in Stage2 and later reviews; no standalone Stage1 report was located in inspected docs. Main/AI multi-scan route skeletons exist. | Real composition and public contract wiring; router autoload is not usable inference integration. |
|3 | Dedicated lazy YOLOX-Tiny CPU worker, preprocessing, NMS/crops and integrity pins. | Grocery instance performance is unverified; generic COCO weights are not proof of detecting grocery packages. |
|4–5 | Separate SigLIP2/DINOv2 embedding/retrieval and scoped index stores. | Real store reference images, independent correctly scoped versioned indexes, current metadata bridge. Keep old single-product CLIP assets separate. |
|6 | OCR + visual evidence reranking and crop/scan pipelines. | Compose as actual AI service with complete evidence and bounded worker supervision. |
|7 | Explicit catalog/security/AI client services; strict current-product resolution. | Trusted scanner actor/grant source, model handles, current public product projection/search, scan ownership/expiry registry, rich API handlers. |
|8 | Camera capture/preview/boxes, manual SKU correction, quantity/unknown review and a pure cart planner. | UI is unmounted; wrapper uses legacy user.token; no final cart dispatch or persistence. |
|9–10 | Offline/native fixtures, frontend action preparation tests, upload bridge, bounded admission/readiness helpers. | Fixture harness is not a production composition root. Real grocery accuracy and target-host capacity are not established. |
|11 | Disabled scanner-session endpoint/modules implemented; historical route inventory correction completed. | Production trusted-source provider and strict scope-aware scan/search/review consumers remain absent; memory-only frontend session wrapper absent. |

Main controllers/multi-scan.js still reports skeleton status and delegates only optional adapters. AI controllers/multi-scan.js still returns MODELS_UNAVAILABLE. Existing rich Stage7 service is not mounted. The frontend requests rich scan/search/review contracts but its search/review endpoints are not registered by the current skeleton. Skeleton confirmation returns a different contract from the Stage8 review-only cart planner; do not bridge these by fabricating fields or dropping evidence.

Source anchors: main routes/multi-scan.js; controllers/multi-scan.js; services/multi-scan/stage7/{composition,integration,repository}.js; services/multi-scan/stage10/{upload-bridge,review-contract}.js. AI routes/multi-scan.js and controllers/multi-scan.js. Frontend components/multiScan and functions/multi-scan.js. SOURCE-PINS.json records inspected hashes.

## Proposed next batches, in order

### S1 — Scanner UI and final frontend cart adapter, with owned fixtures first

Implement an independently gated entry and a separate multi-product button/link. Use the existing camera/review components, not the old ImageCapture/Barcode button. Make the entry work with an empty frontend cart; existing POS route availability is cart-dependent. Initial proposed mount files are frontend src/App.js and src/pages/PointOfSale.js; any empty-cart navigation link should be enumerated separately when preparing its concrete diff. Do not alter existing save/order callbacks.

Add scanner-only entry/session/client/commit modules under components/multiScan/stage11 and extend scanner-only hook/summary as needed for an explicit final **Add confirmed products to cart** action. Current onPrepared returns a review proposal and must never auto-dispatch. Existing frozen summary text says integration is pending: replace that scanner-specific development wording when implementing the real final-confirmation state, without editing unrelated product flows. New tests compose a mocked scanner API and owned Redux/localStorage fixtures while the live feature remains disabled.

The new adapter must consume current server-validated public product records, aggregate exact _id quantities, and use existing cartSlice.storeToCart without changing the reducer/getUnique. Persist the same resulting frontend cart to its existing localStorage cart key; do not create a second permanent scanner cart or send requests to order/cart/checkout/payment APIs. Preserve unrelated existing cart lines and metadata. Compare the actual reducer result with the prepared cart, not just the action payload.

Guard explicit cashier review, exact variant SKU/size, unknown exclusion, existing+new stock, fresh applicable price/wholesale rules, special/waiting/excess/manual-price lines, duplicate IDs and distinct IDs sharing the legacy slug. Recheck store/user/API/session, cart snapshot and selection revision after every await and immediately before synchronous handoff. Disable duplicate clicks; no partial additions on failure; specify/test Redux/storage failure recovery and do not claim database-level atomicity. Do not hold/reserve stock or claim the scanner replaces later frontend validation.

On success show added quantities, invalidate/consume the local handoff plan, abort outstanding scanner work, release camera tracks/photo URLs and memory credentials, unmount/close scanner and return to the existing frontend cart/POS entry. No submit/pay action follows. Test persistence/reload and navigation so existing frontend restoration cannot silently replace the accepted cart with stale data. If compatibility needs an unrelated workflow change, record it as a blocker rather than editing that workflow.

### S2 — Scanner-scoped credentials and authorization

Keep the existing /ai/multi-scan/session boundary disabled. Do not feed MultiScanPosPanel's legacy user.token into strict scanner consumers or treat UI role/store state as server permission. Add a memory-only scanner credential wrapper, explicit API-origin/store binding, expiry/cancel handling and scanner-only guards with mandatory signature/algorithm/issuer/audience/expiry/immutable subject/store checks and current grant revalidation. No global logout, userToken/localStorage rewrite or unrelated middleware migration.

Blocker: a fresh legacy password check plus client-writable legacy role/membership data is not automatically trustworthy scanner authority. Propose a scanner-owned, independently maintained operator/store-grant and credential/revocation source, or an explicitly attested trusted adapter contract. Missing/ambiguous/revoked grants deny. Do not manufacture active status or infer ownership from decoded tokens. This may require an explicitly reviewed scanner enrollment/provisioning contract, not changes to customer registration or other authentication. Existing BatchA logic can be reused only where its interfaces satisfy that scanner-owned trust contract; a fallback to weak legacy identity is not allowed.

This blocker does not prevent S1 fixture development or S3 pure transport/provider composition, but it prevents safe enabled live scanner access. Document it here; no general security-remediation project follows.

### S3 — Wire main API to AI recognition, current catalog and fresh review

Add explicit scanner-only composition/handlers, reusing lazy workers and pure Stage7/10 interfaces. Proposed existing mounting surfaces: main routes/multi-scan.js and an AI server.js scanner-only registration. Prepare concrete file-level diffs before implementation. Do not import Stage9 fixture/native orchestration as production runtime, mutate old exports, shadow routes accidentally or relax old service auth.

Register the new scanner handler chain before an old prefix gate/parser can intercept it; reject unmatched scanner-version paths within that chain. Use main API for browser calls, then authenticated main-to-AI transport. Handle the existing 2MiB global JSON parser only with a bounded scanner-specific mount/transport; no broad parser or unrelated route change. Reuse oriented RGB-to-PNG bridge where appropriate; preserve geometry and do not apply EXIF twice.

Connect YOLOX -> per-object visual/OCR pipeline using the exact approved model/preprocessor/policy pins, per-store/package catalog revisions and independent index generations. Retain native admission until actual work settles after cancellation/timeout. Keep the current ten-object bound; reject any detector/crop/candidate truncation clearly rather than silently omitting products. Unknown/failed objects require exclusion or manual correction; never autoaccept a top match.

Add current-store search and final-review providers with full safe POS product shape including slug. Revalidate every SKU/current active state/price/stock and current scanner permission; never trust an AI price or browser-supplied product object. Use a scanner-owned scan registry binding scanId to subject/store/expiry. A browser cart fingerprint is a race marker, not trusted authorization or stock proof: validate any cart ID/count projection as untrusted input against current scoped products, reject duplicates/foreign/special rows, and clearly bound freshness until frontend handoff. No order/cart database mutation is needed for this scanner review interface.

### S4 — End-to-end isolated integration and grocery-photo evidence

Exercise capture/file normalization -> main scanner upload -> authenticated AI -> model workers -> selected-store indexes -> current catalog -> explicit cashier review -> existing frontend cart in an owned fixture environment. Include corrected variants/quantities, multiple identical SKUs, mixed unknowns and all-unknown/empty scenes. No production inference request or live cart write in validation.

Use actual consented/reference grocery photographs and separately labeled multi-product scenes. Existing generated-label benchmarks and controlled crop fixtures do not establish positive real-grocery YOLOX detection. Measure missed/double-counted packages and confusing sizes/flavors before calling the end-to-end objective validated. If general detector weights miss packages, plan detector-specific data/fine-tuning within scanner scope; do not disguise controlled boxes as detection success. Device/browser camera/EXIF and target-host CPU/memory/cancellation/legacy-scanner coexistence need validation. Keep production disabled regardless of successful fixture runs.

### S5 — Scanner regression and disabled readiness review

Run scanner-specific backend/frontend tests, existing28 session security tests and historical428 suite (with unchanged unrelated test sources). Add actual reducer/storage handoff assertions, stale cart/tenant/session cancellation, duplicate submit, partial-failure cleanup, foreign SKU and index-revision tests. Preserve old scanner hashes and run its existing camera/image-search fixtures. Verify false/absent/malformed flags cause no scanner network/model/camera/cart side effects.

No deployment or activation is part of these batches. MULTI_SCAN_ENABLED remains effectively false throughout; frontend/session flags also default off. Offline fixture composition may test enabled behavior explicitly without enabling an application configuration. A later activation decision is separate from this continuation plan.

## Original single-product scanner preservation

Keep frontend src/components/modal/modalComponents/ImageCapture.js, src/components/modal/Barcode.js, src/functions/ai-image.js and the old AI /gratis/ai-image/search/build interfaces/assets unchanged. The existing PointOfSaleButton barcode entry remains intact. No replacement of single-product scanning with multi-product inference. Cart integration consumes the existing reducer/action and local cart contract without modifying getUnique, checkout or downstream business workflows.

## Scope guard and evidence limit

Allowed work is scanner-specific UI/session/AI/catalog/review/cart-adapter integration and minimal scanner mounting changes. Excluded: payments/customer payment data, order management, checkout, customer registration/password recovery, unrelated auth and post-cart business workflows. No unrelated remediation or reversal is proposed. Proposed fields/endpoints/providers above are design contracts, not features claimed installed.

This is a source review and next-step report, not a new test run. Recent scanner/historical results remain historical evidence; no new model accuracy, production readiness or camera/cart handoff success is claimed. Standalone Stage1 report was not available; no missing artifact content was invented. Current feature defaults were verified from source/configuration without printing secrets.

**Recommended immediate implementation slice: S1, the disabled scanner entry and fixture-backed explicit frontend cart handoff. Prepare its exact scanner-only diff and tests; work on S2/S3 contracts without modifying excluded systems.**
