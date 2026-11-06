# Resource, accuracy and cart readiness

## Ten-object limit: actual layers

| Layer | Frozen bound | Meaning |
|---|---|---|
| Stage 3 detector config | maxDetections default 100, allowed 1–100; candidate budget default 1000 | Detector output cap, not the ten-object bottleneck |
| Stage 6 ScanPipeline | maxCrops default/hard maximum 10; slice(0,maxCrops), CROP_LIMIT_APPLIED warning | Per-image pipeline crop/output cap |
| Stage 7 response validator | result.results.length<=10; each <=20 candidates; distinct product IDs<=200 | Main API review validation cap |
| Stage 7 receiver | topK<=10 | Retrieval depth, not number of detected objects |
| Stage 2 browser DTO | <=100 detections | Older skeleton contract, not proof rich pipeline permits 100 |
| Stage 8 frontend | <=100 detections, <=20 candidates; quantity 1–100 | UI validation bounds; UI does not expand backend capacity |
| Worker/pipeline/client | one active request each; native model calls/crops sequential | Concurrency, independent of object count |

The current 20-object benchmark is blocked by frozen pipeline and validator bounds. Changing an environment detector limit does not remove them. Future 20+ work must coordinate pipeline, validator, total unique candidate/query limits, response byte limits, CPU/native memory and UI warning/busy behavior. At 20 objects × union of 20 candidates, worst-case 400 IDs exceeds Stage 7's current 200-ID budget; retaining smaller topK is an explicit policy decision, not a silent exception. Keep reference vectors, crop byte/pixel totals, OCR region costs and per-store catalog bounds separately limited.

Prefer a measured 10-object review pilot first. More than ten should return a clear incomplete-scan error and ask for fewer objects; never treat truncated counts as complete. Multiple photographs require explicit cashier review and cross-photo duplicate reasoning, not silent count summation. If 20+ is approved, test actual 1920-normalized multi-product photographs: smaller packages and unreadable text may require closer captures rather than a larger image or lower detector threshold. Do not infer accurate counts from artificial rectangles.

## Measured performance versus estimates

Evidence: Stage 3 smoke-cpu-isolated.json, Stage 4/5/6 actual-cpu-benchmark-final.json, and main docs/multi-scan/stage9/performance-summary.json/native traces. All are local CPU tests, not target-VPS measurements. Stage 3 exercises pinned YOLOX; Stage 4 SigLIP+isolated indexes; Stage 5 adds independent DINO retrieval; Stage 6 adds actual OCR/reranking but its multi-crop timing excludes detection; Stage 7 smoke is serialized fixture validation, not new inference. Stage 8 tests are jsdom/mocks. Stage 9 separately records natural YOLOX empty results versus full downstream controlled rectangles; their timings are not interchangeable.

Stage 9 i9-9900, 16 logical CPUs, two threads/model, fresh child per count:

| Controlled crops | Cold model scan | Warm mean (n=2) | Lifetime RSS peak |
|---:|---:|---:|---:|
| 1 | 5.088 s | 0.734 s | 1115.2 MiB |
| 5 | 7.773 s | 3.215 s | 1134.6 MiB |
| 10 | 10.385 s | 5.773 s | 1142.4 MiB |

Natural YOLOX on generated labels found zero objects: cold 532.7 ms, warm 48.5 ms, peak 203.1 MiB; that is not full recognition. Stage 9 fixture index-build child took 5.834 s. Source images were 640×300, 3200×300, 3200×600, not actual 1920-normalized camera photographs. Cold sessions were unloaded but OS page cache was not purged. Peak RSS is process-lifetime and includes concurrency probes, not per-stage peak. Stage 6 measured model initialization approximately SigLIP 3.061 s, DINO 0.690 s, OCR 0.647 s separately; multiple measurements differ with cache/load and are not additive to another stage's total. Detailed older evidence is indexed in performance-evidence.json.

CPU work exceeds wall time with native threads; workers compete for cores and bandwidth. All native sessions are resident per worker; adding workers tends to duplicate model/index memory. One local admitted scan is the only concurrency behavior verified. Native cancellation does not imply immediate native CPU preemption. Index growth and real OCR text density can dominate beyond the tiny four-SKU synthetic benchmark.

**Candidate staging allocation, estimate only:** start isolated AI with 4 dedicated vCPUs and 4 GiB RAM for one worker, plus separately budget main API/OS/cache, read-only pinned model storage and bounded temporary crop buffers. This is headroom against ~1.12 GiB measured native RSS, not a proven minimum or an InterServer plan recommendation. Two workers could roughly duplicate resident memory and contend on CPU; do not enable them from this arithmetic. No VPS was accessed, priced, provisioned or measured. Determine actual artifact/index disk requirements from the pinned inventory plus target catalog/reference size, retain rollback generations and enforce free-space guards. Target-host model checksum/load, p95/p99 under sustained authorized load, CPU throttling, peak memory/OOM and actual catalog cardinality are release blockers.

A naive linear estimate for 20 warm controlled crops is ~11.5 s based on the ten-crop result; it is **not verified**, not a release SLO and not an approved cap. Image quality, OCR, CPU shares and body/response limits may invalidate it. Use the explicit timeout ladder in INTEGRATION-PATCHES.md only as a proposal until target-host measurements exist.

## Practical real grocery evaluation

Commercial recognition readiness: **BLOCKED**. There are zero qualifying real checkout photographs/labels and no rights-cleared evaluation dataset. No commercial accuracy, calibration, acceptable false acceptance or target-host capacity is established.

Collect owned/permission-cleared reference photographs of actual packages with exact current scoped catalog IDs: front, rear/text panel and relevant side views, multiple batches/packaging revisions, separate size/flavor records. Record file hash, oriented dimensions, capture session, usage-rights evidence and reference ID. Do not fetch arbitrary copyrighted product images or infer labels from file names. Independently capture held-out checkout photos on the actual camera/mobile devices with 1/5/10 visible products, clutter, repeated SKUs, near-identical flavors, small/large packs, rotated/occluded packages, normal/poor lighting and products absent from the indexed catalog.

Use Stage 9 dataset.schema.json plus executable dataset/photo validators. Human annotators assign exact SKU or unknown(null), oriented XYWH boxes, visible fraction and per-object IDs; derive quantities from objects and independently review disagreements against the physical packaging/catalog. Separate reference/tuning/evaluation sessions and actual byte hashes, audit near duplicates and keep final test sessions held out. Recommended first release-gate sample minimum: 200 checkout scenes, 1000 known objects, 300 unknown objects, representation across at least 30 SKUs and 10 related size/flavor pairs, multiple sessions/devices/lighting strata. These are proposed minimums; they do not ensure statistical power per subgroup. Increase samples for observed errors and SKU/condition coverage. Report per-SKU/condition sample sizes and confidence bounds; do not average away a dangerous variant subgroup.

Proposed gates, requiring owner approval before use:

| Metric | Proposed gate | Interpretation |
|---|---:|---|
| Exact-SKU Top-1 over all known GT including missed detections | >=95% | Raw suggestion accuracy, not auto-acceptance permission |
| Detection recall at IoU .5 | >=95% | Known and unknown objects counted; score-ordered one-to-one matching |
| Exact object-count scenes | >=95% | Count independently from SKU identity |
| Exact reviewed per-SKU count scenes | >=99% | Human-assisted result, reported separately from raw recognition |
| Unknown rejection | >=95% | Missed unknown is not a correct rejection |
| Variant confusion / matched known objects | <=2% | Also inspect every same-family/size stratum |
| False acceptance of explicitly evaluated decisions | one-sided upper 95% bound <=0.5%, >=1000 evaluated acceptances | No actual cart writes; zero errors still has uncertainty |
| Cashier review coverage | 100% | Every suggestion must pass explicit human review in this rollout |
| Review-required rate | Measure and stratify, no lowering target | Stage 9 counts currently pending decisions; not the same as all suggestions being review-required |

Stage 10 readiness.js uses the exact zero-error binomial upper bound, and a one-sided Wilson approximation when errors are nonzero. Statistical/owner review of that approximation is required before adopting release gates. A null denominator is BLOCKED. The pure gate helper never activates anything, even for favorable synthetic unit inputs. Stage 9 mutually exclusive decision statuses mean pending-review rate cannot simultaneously be 100% and have accepted evaluation decisions; cashier-review coverage must be measured separately. Track correction rate and operator time as user-experience metrics; do not lower mandatory review to improve them. Proposed <=20% manual correction burden can be evaluated, but it is not an established release result. Frozen Stage 9 tools expose per-scene data; SKU/condition stratification, human-review coverage and confidence-interval reports require an approved new evaluation extension, not invented results.

## Cart safety assessment

Current scanner cart boundary is READY FOR OFFLINE TESTING, not ready for live mutation. Stage 8 requires explicit exact SKU choice/acknowledgment or explicit unknown exclusion, aggregates by exact product ID, prepares an undispatched exported storeToCart action, rechecks the current cart fingerprint and makes commit() always fail. Changing SKU/quantity invalidates the plan. Existing getUnique merges by _id OR shared nonempty slug, so the adapter rejects distinct-SKU slug collisions. Waiting/segregated/excess/manual-price flows must use the existing POS. The server must also reject waiting._id links even when waiting.newQuantity is zero; the offline Stage 9 verifier does that, while the frontend guard alone is less strict.

The existing order.updateCart around line 715 uses a store-scoped product read or cached records, recomputes retail/authorized wholesale except manual override/excess, handles waiting/stock and persists. Importing/calling it during tests would invoke live models/Redis and is prohibited. Cache presence and legacy auth mean it is not proof of fresh, cryptographically authenticated, atomic final validation. A future scanner cart flow must retain existing behavior while adding/ensuring current scoped validation, no manual-price override from scanner, exact IDs/variants and stock for existing-plus-added quantities at the mutation transaction boundary. Existing checkout/order paths must be audited separately for stock reservation/atomicity; a review quote is not a reservation.

Process-local pending flags/submission IDs protect double clicks only within one process/session; they do not provide durable mutation idempotency across retries/restarts. Optional Phase F needs a tenant/user/cart-version-bound durable idempotency key, transactional compare-and-update/reprice, replay-safe response and reconciliation before any dispatch/localStorage/updateCart call. No live cart operation was performed or authorized.
