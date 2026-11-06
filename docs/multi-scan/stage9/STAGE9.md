# Stage 9 — offline pipeline validation

Stage 9 supplies a new offline harness and validation tools. All existing Stage 2–8 files, the original scanner and its models/indexes remain frozen. The feature is unmounted, disabled and review-only. No HTTP server, production database/Redis connection, cart persistence, Redux dispatch, order write, deployment or activation occurred. Stage 10 requires explicit approval.

## Outcome and limits

The real frozen native models and HNSW retrieval can be composed with the real Stage 7 JWT/HMAC/current-catalog interfaces and the frozen Stage 8 selection/cart adapter. **This is not a real grocery accuracy result.** The available images are generated flat labels, not product or checkout photographs. Native YOLOX returned zero detections on those images, so a naturally detected nonempty grocery-to-cart pipeline remains unvalidated. Controlled synthetic rectangles exercise downstream native inference at known workloads and are explicitly identified separately from YOLOX output. No photographs, SKU ground truth or accuracy values were invented.

Twenty objects cannot be exercised through the frozen integration: Stage 6 ScanPipeline and the Stage 7 validator both cap output at ten. The harness rejects 20 rather than bypassing or silently truncating that requested benchmark. See the [dataset specification](DATASET.md), [dataset availability](dataset-availability.json), [performance detail](performance-summary.json) and [exact integration proposal](INTEGRATION-PROPOSAL.md).

## New orchestration and file architecture

Main API new modules under `services/multi-scan/stage9/`:

- `fixture.js`: explicit in-memory repository, short-lived signed test credentials, synthetic scoped catalog and dependency roots. No production model/DB imports. The actual Stage 7 Security and Catalog classes perform authorization and current reads.
- `orchestrator.js`: OfflineHarness uses Stage 7 Integration → AiClient → in-memory transport → Stage 7 AI receiver → injected Stage 6 pipeline → strict Stage 7 response validation and fresh catalog resolution. No socket is opened. It preserves raw and authorized results, timing/CPU/memory traces, detection IDs, independent model fingerprints/index generation IDs and review-only flags. `reviewedSelections` groups only explicit simulated cashier decisions by exact SKU.
- `native.js`: composes the existing Stage 3 detector/decode/crop interfaces, Stage 4 SigLIP embedder/index/recognizer, Stage 5 DINO equivalents/CombinedRecognizer and Stage 6 OCR/Reranker/CropPipeline/ScanPipeline. New wrappers compose public interfaces; no monkey patches, module-loader changes or duplicate inference code. Explicit controlled-crops mode runs YOLOX but uses supplied synthetic rectangles for the workload. Ordinary yolox mode uses actual YOLOX detections only.
- `review-verifier.js`: offline-only implementation of the proposed frontend review DTO. Reauthenticates and uses Stage 7 Catalog.current/currentProduct to refresh exact records, current retail/authorized wholesale pricing and stock for existing-plus-added counts. No HTTP registration or cart writes.
- `dataset.js` and `evaluation.js`: bounded manifest/photo validation and documented accuracy/counting/latency arithmetic. They do not claim a real dataset exists.

New scripts under `scripts/multi-scan/stage9/`: `native-worker.js`, `run-native.py`, `evaluate.js`, `run-tests.py` and `verify-protected.py`. Native benchmarks use fresh telemetry-disabled subprocesses, exclusively created /tmp index roots and bounded worker deadlines. New main tests are `tests/multi-scan/stage9/pipeline.test.js` and `evaluation.test.js`.

The only frontend additions are `src/components/multiScan/__tests_stage9__/handoff.test.js` and `scripts/multi-scan/stage9/jest.config.cjs`. They import the unchanged Stage 8 model/cart adapter through the existing test dependencies. No App.js, package file, production React source, route, reducer or API client was modified. Complete new paths, Git states and generated-artifact classification are recorded in `inventory.json`.

## Native end-to-end execution

The index-build child creates separate actual SigLIP 2 (768 dimensions) and DINOv2 (384 dimensions) native indexes from four existing generated reference labels in /tmp. Authenticated immutable catalog metadata and references come from a Stage 7 snapshot; candidate reranking resolves that same snapshot revision. Search scope/principal is revalidated. No legacy indexes or single-product resources are loaded or rebuilt.

In each workload child: short-lived JWT authentication → signed body-bound internal capability → bounded encoded image → actual YOLOX → actual crop extraction (natural or explicitly controlled) → actual SigLIP/DINO sessions and retrieval → actual PP-OCRv5 → actual reranking → strict response validation → fresh current catalog → structured review output. Model/index metadata remains attached per detection. Synthetic fixture catalog price changes from 10 to 12.75 **after inference**; returned retail authority is 12.75. Model titles/prices cannot bypass current catalog resolution.

For controlled workloads, simulated human choices refer to the known generated-label fixture order, not to inferred leading rank. The resulting exact SKU totals pass a second current server review, with final price/stock checks. The separately executed frontend tests take the persisted native result through the unchanged Stage 8 normalization, explicit review/aggregation and cart adapter. The adapter returns the existing `cart/storeToCart` action without dispatching it. Native worker data, substage timings, CPU use, peak RSS, metadata and undispatched-hand-off evidence are retained in `native/` and test logs.

Partial `INFERENCE_FAILED` or `OCR_INFERENCE_FAILED` errors become an explicitly unknown detection with the same detection ID, no candidates and PARTIAL_INFERENCE_FAILURE. Successful sibling objects remain available for review. The wrapper discards incomplete evidence rather than treating one model as sufficient. Missing model artifacts, authorization, corrupt indexes, cancellation and contract errors stay fatal. A complete secure-pipeline test verifies a successful object beside a failed/unknown object. The frozen pipeline itself remains unchanged.

## Quantity and cart boundary

Tests verify three identical exact IDs become quantity three, while two same-brand flavor IDs remain separate. Manual corrections, quantity edits and explicit unknown exclusions are tested. No candidate is automatically accepted. Unknown/uncertain objects remain detection-level records until a simulated cashier decision explicitly excludes or reviews them.

Fresh server review validates current authorization, exact requested IDs, quantity bounds, current catalog ownership/active state, current price and total stock including the existing cart. Wholesale uses current permission and the greatest applicable valid tier through Stage 7 currentProduct; duplicate/invalid tiers require manual review. Waiting/segregated stock is rejected for the existing POS flow. Frozen Stage 8 also blocks slug collisions, excess/manual-price lines, concurrent preparation and stale cart snapshots. Incoming arrays are not mutated; localStorage writes and live persistence are not called. The returned ephemeral action is review evidence, not a separate permanent cart.

## Local CPU and memory benchmark

Host: Intel Core i9-9900 @ 3.10 GHz, 16 logical CPUs, Linux x64, Node v18.20.4; two threads per native model, sequential model/crop execution and one admitted scan per worker. These measurements do not establish InterServer VPS capacity. Four synthetic SKUs and four reference images are much smaller than a production catalog.

| Controlled crops | Cold model scan | Warm mean (n=2) | Lifetime peak RSS |
|---:|---:|---:|---:|
| 1 | 5.088 s | 0.734 s | 1115.2 MiB |
| 5 | 7.773 s | 3.215 s | 1134.6 MiB |
| 10 | 10.385 s | 5.773 s | 1142.4 MiB |

Separate actual-YOLOX-only generated-label scans: zero detected objects in all three runs; cold 532.7 ms, warm mean 48.5 ms, peak 203.1 MiB. Those are empty-result timings, not complete recognition performance. Isolated index-build child elapsed 5.834 s.

Cold means a fresh child with unloaded model sessions and prebuilt isolated indexes; OS filesystem cache is not purged. Initial snapshot/reference loading and index verification are reported as setupMs separately. First-scan initialization includes verified model reads and native session loading. Two warm scans reuse sessions/index handles. Peak memory is the process-lifetime high-water mark, not an interval-specific stage peak; it includes the concurrency probe. Native worker initialization/residency, model-level initialization time and scan CPU user/system microseconds are preserved.

The 1/5/10 input scene sizes are 640×300, 3200×300 and 3200×600 respectively; these are controlled workload images, not photographs produced by the Stage 8 1920-pixel camera normalization. Detection timings include its own crop stage; controlled crop timing adds a separate decode/extraction. OCR timings include OCR initialization and internal inference/geometry/text processing. Substage columns overlap and must not be summed. Full scan latency includes JWT/HMAC/serialization/current catalog checks; explicit simulated aggregation and final fresh review are additional measured fields. Human review waiting time is excluded. Full stage-level cold and warm means are in performance-summary.json; raw timing trees are in native/*.json.

Each workload tests concurrent scan admission: the second call is rejected as HARNESS_BUSY with no waiting queue. Repeated submission IDs are rejected as DUPLICATE_SUBMISSION; at most 100 attempt identities are retained per harness. These are one-worker safety checks, not a throughput/load-test claim. Coordinated multi-worker target-host testing remains necessary.

## Accuracy and dataset availability

Real reference photographs: 0 qualifying. Human-labeled checkout scenes: 0. Known/unknown grocery ground-truth objects: 0. Detection precision/recall, counting accuracy, exact SKU Top-1, Top-5, unknown rejection, variant confusion, false acceptance and review-required rate for real groceries are **not measurable yet**. Empty denominators yield null, never fabricated zero or perfect scores. Generated fixture recognition and unit metric arithmetic are not substituted for real accuracy.

Dataset tools support explicit reference/checkout sessions, exact SKU quantities, boxes, unknowns, variants/sizes and occlusion/rotation/lighting attributes. Validation checks scoped IDs, dimensions/count consistency, rights declarations, exact hash/session leakage, path traversal/symlinks, byte checksums and oriented image dimensions. Methodology and prediction format, including denominators and IoU matching, are detailed in DATASET.md. No copyrighted images were downloaded or reused as an invented labeled dataset.

## Tests, failures and security

Results are recorded in test-summary.json and test-logs/. Stage 9 adds 24 pipeline/security/review tests, 19 dataset/evaluation/byte-verification tests and 6 frontend handoff tests. The 340 existing Stage 2–8 tests are rerun without edits, including 19 native ONNX/OCR tests. **389 tests pass, zero failures.** Native benchmark executions are additional evidence and are not counted as unit-test assertions. Syntax checks cover all new CJS and Python helpers; frontend imports compile through Babel/Jest.

Coverage includes missing model files, corrupt index checksums, empty detections, explicit unknown handling, invalid/oversized images, expired/forged JWTs before inference, foreign store/package/catalog rows, inactive/deleted SKUs, stale independent index revisions, post-inference price changes, stale cart snapshots, stock totals/wholesale permissions, service failures/timeouts, partial inference with sibling recovery, duplicate submissions, concurrent scans and the hard 10-object limit. Dataset tests check noninvented arithmetic, null denominators, false acceptance, variants, missed objects, one-to-one boxes, labeling/usage-rights requirements, leakage and filesystem escapes. Frontend tests verify the actual native result against frozen review/cart interfaces with no storage writes.

Reproduce after choosing NEW output paths:

```text
python3 scripts/multi-scan/stage9/run-native.py /tmp/NEW-stage9-native
python3 scripts/multi-scan/stage9/run-tests.py /tmp/NEW-stage9-tests
node scripts/multi-scan/stage9/evaluate.js DATASET.json PREDICTIONS.json NEW-RESULT.json PHOTO_ROOT
```

Run these from the main API project. The frontend test reads docs/multi-scan/stage9/native/controlled-5.json by default, or STAGE9_NATIVE_REPORT may point to a fresh controlled-5 report. Tests require the existing dependencies/artifacts; no package installation, lockfile edits, server startup or production credentials are needed. run-native.py writes indexes and results only to newly created temporary paths. Test caches are isolated under /tmp/clavstore-stage9-jest.

## Compatibility and remaining blockers

Before implementation/testing, all three project roots were fully hashed with Git status and symlink targets: **106,706 pre-existing files and 88 symlinks, without exclusions**. This includes all frozen frontend scanner resources, old models/indexes, caches, routes/controllers, package files and dependencies. protected-files.before.json.gz and protected-files.final.json.gz provide the comparison; inventory.json records all new paths and before/after statuses. The final audit outcome is appended after verification. Reports/inventory written after the final scan are new-file enumeration boundaries, not exclusions of protected files.

No production DB, Redis, cart or order operations occurred. New indexes, synthetic test-image byte files, deliberately corrupt test indexes, drafts and Jest caches are under /tmp and listed separately from repository additions. Raw result JSON/TAP/log artifacts retained in docs are reports, not runtime caches. No legacy :memory:.ses telemetry file should be produced; ORT_DISABLE_TELEMETRY=1 is set in native/test subprocesses.

Still blocked under the frozen-file policy: real grocery accuracy/nonempty naturally detected grocery E2E; 20-object execution; expired-token issuance migration; encoded upload/rich browser DTO composition; unregistered authenticated search/fresh-review endpoints; private receiver registration before incompatible JSON parsers; real ownership/session/CDN/index retention configuration; private HTTP/TLS and actual device/browser E2E. The exact existing files and minimum proposed mounting/registration changes, feature flags, authentication requirements and rollback procedure are in INTEGRATION-PROPOSAL.md. Those changes were not performed.

## Stage 10 boundary

The Stage 10 roadmap in INTEGRATION-PROPOSAL.md begins with real rights-cleared held-out grocery data, then separately approved authentication/router/upload composition, actual staging HTTP/TLS/browser validation and target-host resource profiling. Feature activation remains disabled. Cart mutation requires an additional explicit approval and atomic stock/idempotency validation. **Stopped after Stage 9.**

Final integrity outcome: **106,706 protected files and 88 symlinks intact; zero changed/missing files, zero changed symlinks, zero read errors, no exclusions.** 55 new files were created: 53 in the main API project (offline code/tests/reports) and 2 frontend test/tooling files; none in the AI backend. No new repository cache/telemetry files. Complete paths and before/after Git state are in [inventory.json](inventory.json). The final manifest and final text of this new report/inventory sit outside their own recursive enumeration boundary. No protected file was subsequently touched.
