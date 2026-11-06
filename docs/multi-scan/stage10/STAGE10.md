# Stage 10 — production-readiness design and controlled-rollout preparation

**Overall: BLOCKED. The system is not production-ready.** Real grocery accuracy, authentication compatibility, endpoint composition and target-host deployment capacity remain open. All existing files stay protected. No feature was mounted/activated, no integration patch was applied, no production MongoDB/Redis/cart/order operation occurred, and no InterServer host was accessed. No rollout phase was advanced or executed.

The deliverable is an actionable, reviewable design, new inert offline helpers and regression evidence. It does not claim that documentation resolves runtime deployment blockers.

## Readiness deliverables

- [Authentication analysis](AUTHENTICATION.md): actual sign sites, algorithm/iat/expiry/audience behavior, strict Stage 7 compatibility, refresh-token source findings, legacy decode-only middleware boundary and the recommended dedicated scanner credential option.
- [Proposed integration patches](INTEGRATION-PATCHES.md): precise main/AI route/controller/upload/private parser changes, disabled frontend App.js diff, authentication alternatives, deadlines/errors/flags and exact protected-file approval candidates. **Proposal only; not applied.**
- [Resources, grocery accuracy and cart](RESOURCES-ACCURACY-CART.md): which layers impose ten objects, safe future 20+ design, measured versus estimated capacity, real dataset collection/labeling plan, proposed metric gates and future cart safety requirements.
- [Security, diagnostics and rollback](SECURITY-OBSERVABILITY.md): new allowlisted local logging/correlation/admission proofs, production rate/audit/privacy requirements, service auth/limits and rollback design.
- [Readiness matrix](READINESS-MATRIX.md) / [JSON](readiness-matrix.json): component status, evidence, blocker, required change, risk and approval. No component is promoted to controlled staging by this assessment.
- [Phased rollout](ROLLOUT.md) / [JSON](rollout-plan.json): A offline, B authorized edits, C isolated staging, D real accuracy evaluation, E limited review-only pilot and F separately authorized optional mutation, each with entry/exit/stop criteria.
- [Protected change specification](protected-change-spec.json): source hashes for proposed edit locations, including alternative versus mandatory/future scope. No stored credential values were read.
- [Performance evidence index](performance-evidence.json): read-only review of actual Stage 3–9 artifacts and hashes. Existing native tests rerun, but no new capacity benchmark is claimed.
- [Current assessment](assessment.json): BLOCKED; feature and cart mutation disabled; no rollout phases executed.

## New files and standalone adapters

New main API service files under `services/multi-scan/stage10/`:

1. `upload-bridge.js` converts the frozen Stage 2 validated/oriented RGB representation to dimension-preserving PNG bytes accepted by Stage 7, with decoded/encoded limits and cancellation checks. It uses a supplied verified image runtime, never imports legacy models, never writes photos, and does not mount anything. This resolves a composability problem offline without editing upload.js; production wiring is still blocked pending approval.
2. `review-contract.js` adds a post-Stage-7 complete-review boundary: matching tenant, authoritative current catalog, review-only/no-cart/no-order flags, explicit SKU selection, ten-object cap and rejection of CROP_LIMIT_APPLIED. Unknown objects remain unknown.
3. `admission.js` is a disabled-by-default process-local model of one active native scan, no queue, bounded tenant/user rate state and disable/drain/idempotent-release behavior. It is not authentication or a distributed production limiter.
4. `observability.js` provides server UUIDs, tenant-safe public errors, keyed pseudonyms, allowlisted timing/model/index/event fields and an explicitly supplied local sink. Raw customer photos/OCR/tokens/headers/text/errors are never forwarded; there is no production telemetry connection.
5. `readiness.js` evaluates proposed offline evidence gates and keeps activation/production/cart permission false even for favorable test inputs. Missing real data blocks commercial readiness.

New tests: `tests/multi-scan/stage10/readiness.test.js`. New scripts: `scripts/multi-scan/stage10/assess.js`, `run-tests.py`, `verify-protected.py`. Documentation, source-pinned specifications, manifests and logs live only in this new docs directory. Full new-file paths and generated artifact classification are in inventory.json. No frontend or AI backend production/source file was added or changed.

## Key blocker findings

**Authentication.** Current login/registration/app/order tokens use the installed HS256 default and automatic iat but omit exp. Optional confirmed-admin audience is clavmall-estore; no issuer is specified at those sign sites. No source-level refresh-token mechanism was found. Production key/issuer/audience values are unverified. The legacy authCheck decodes rather than verifying JWTs; it must not become the scanner's authentication path. Stage 7 correctly rejects no-exp, expired/forged/wrong-algorithm or mismatched scoped claims. The recommended narrow change is a credential-validated scanner-purpose short-lived issuer with a distinct key and coordinated issuer/audience configuration, plus an explicit frontend credential wrapper. Do not exchange a decoded legacy email token or order-derived token for scanner access. Common-token expiry migration is an alternative with wider session impact, not a change applied now.

**Endpoints.** The main Stage 2 DTO drops Stage 7 evidence/current catalog semantics, confirm emits confirmed:true, search/fresh review endpoints are unregistered, and the private receiver remains unmounted. The AI global 2 MiB parser and legacy 32 KiB prefix parser both conflict with encoded-image JSON. Exact early private mount and main route/controller edits are specified for approval. The new RGB bridge allows reuse of the frozen upload validator without an upload.js change. Feature gates, private address/TLS pins, body-bound HMAC/replay checks and current tenant grants must remain intact.

**Incomplete scan safety.** The ten-object bottleneck is Stage 6 crop processing plus Stage 7 validation, not YOLOX's default 100-object output cap or the frontend's 100-detection bound. Stage 8 currently drops scan-level reviewReasons, so CROP_LIMIT_APPLIED could be hidden. The new unregistered server output guard rejects truncation; approved wiring is mandatory before enabled staging. Frontend global warning preservation/blocking is a recommended additional approved change. Twenty-object behavior is not verified and the cap was not changed.

**Grocery accuracy.** There is no qualifying rights-cleared real grocery reference/checkout dataset, exact-SKU/box/quantity ground truth or commercial evaluation result. The plan defines real collection, independent annotations and held-out sessions with unknowns, variants/sizes, lighting, rotation and occlusion. Proposed gates cover exact SKU, detection recall, raw object counts, separately reviewed SKU counts, unknown rejection, variant errors and false-acceptance uncertainty; owner/statistical approval and real evidence are required. All suggestions continue to require human review. Pending-review rate is monitored separately from 100% cashier review coverage; reducing safety review is not a performance target.

**Cart.** Frozen Stage 8 prepares only an undispatched action with fresh server verification and explicit cashier choice; commit remains disabled. Exact IDs, variants, current total stock/price, authorized wholesale, waiting/segregated behavior, stale cart state and slug collisions are part of the proposed integration contract. Current cached cart persistence is not proof of atomic fresh stock validation. Durable scoped idempotency, current authorization and transactional stock/cart reconciliation are required before separately authorized mutation. No live persistence or Redux dispatch was performed.

**Performance/VPS.** Measured Stage 9 controlled synthetic warm means are 0.734/3.215/5.773 seconds for 1/5/10 crops; cold scans 5.088/7.773/10.385 seconds; native lifetime peak about 1.09–1.12 GiB. These use four synthetic SKUs on an i9-9900, with two warm samples, not actual grocery photos or VPS load. Natural YOLOX found zero generated-label objects. Model sessions are resident, native work is sequential per worker, and adding workers duplicates memory and contends on CPU. Initial candidate staging allocation of four dedicated vCPUs/four GiB for one isolated AI worker is only a headroom estimate, not a verified InterServer requirement or plan recommendation. Proposed compatible timeout ladder and target-host p95/p99/memory/OOM tests remain approval-dependent; 20-object arithmetic is explicitly unverified.

## Offline validation

**428 tests passed: 389 frozen Stage 2–9 tests plus 39 new Stage 10 tests, zero failures.** The frozen suites include 19 actual native ONNX/OCR tests, not just mocks. The new tests use fixture-only credentials, in-memory repositories/transports and isolated image bytes. No application server or database client is started. Stage 10 adds tests for default algorithm/no-exp compatibility, bounded claims and wrong issuer/audience/subject/algorithms/signatures, raw-to-encoded upload composition and byte/pixel bounds, default-disabled behavior, rate/concurrency state, rollback disable/drain, correlation/sanitization/pseudonym separation, model/index fields, sink failure, null/nonfinite accuracy evidence, proposed false-acceptance bounds, stale/unknown/foreign catalog records and safe incomplete-scan rejection. Existing tests continue to cover variant aggregation, unknown exclusion, current price/stock, service errors, replay/tenant/model/index contracts and frontend review/cart handoff.

Test logs/counts are in test-logs/ and test-summary.json; syntax-checks.json records all new JS/Python helpers. Reproduction from the main API root, choosing NEW output paths:

```text
python3 scripts/multi-scan/stage10/run-tests.py /tmp/NEW-stage10-tests
node scripts/multi-scan/stage10/assess.js /tmp/NEW-stage10-assessment.json
python3 scripts/multi-scan/stage10/verify-protected.py --before docs/multi-scan/stage10/protected-files.before.json.gz --output /tmp/NEW-stage10-integrity.json.gz
```

No package installation or lockfile edit is required. Jest uses the existing isolated Stage 9 configuration and /tmp cache path. The full reproduction helper is syntax checked; retained results come from the equivalent Stage 10 test command plus the frozen Stage 9 full-regression runner. Real HTTP/TLS, camera/device, deployment rollback and target-VPS tests were not performed or claimed.

## Integrity and production boundary

Before development/testing, full SHA-256/Git status/symlink targets were recorded for all three projects: **106,761 pre-existing files and 88 symlinks**, without exclusions. This includes frozen Stage 2–9 sources/docs, package files, dependencies, caches, all original single-product scanner files and model/index assets. Before/final manifests and inventory.json supply complete evidence; final comparison results are appended after the audit. New report/inventory final text is outside its own recursive manifest enumeration boundary; no old file is excluded.

No production/VPS access, MongoDB/Redis connection, live cart/order operation, localStorage write, external telemetry, route mounting, activation, package change or rollout phase execution occurred. New temporary drafts/tests/cache artifacts under /tmp are reported separately; no existing file is repaired or overwritten to force integrity results.

## Recommended next stage

Stage 11 should be a **separately authorized integration implementation**, limited to the selected exact protected-file specification, new credential/handler/worker composition and non-production contract tests, while all flags remain disabled and cart mutation stays prohibited. Resolve the scanner credential choice before frontend enabled wiring. Host access/deployment, real dataset retention, pilot activation and optional mutation each need their own later explicit authorization and evidence. Until then the overall readiness remains BLOCKED. **STOP after Stage 10.**

Final integrity result: **106,761 pre-existing files and all 88 tracked symlink targets unchanged; zero changed/missing files, zero changed symlinks, zero read errors, no exclusions.** 45 new files were created, all within the main API Stage 10 service/test/script/documentation paths. No frontend or AI backend additions, and no new repository cache/telemetry files. [inventory.json](inventory.json) lists every new path, before/after Git status and separate /tmp artifacts. The final manifest and final text of these two new documents are explicit recursive enumeration boundaries, not exclusions of protected paths. No protected file was subsequently touched.
