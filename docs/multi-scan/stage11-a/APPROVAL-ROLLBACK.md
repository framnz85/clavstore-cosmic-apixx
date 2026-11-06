# Independently approvable implementation batches and rollback

All entries are **PROPOSED**, not permission or applied changes. Exact absolute paths, source SHA-256 pins, reason, necessity, risk, affected behavior, tests, migration/dependency implications and rollback are in APPROVAL-MATRIX.json. IDs below distinguish selected changes from Stage 10 alternatives; excluded alternatives are not silently authorized.

## First minimal batch to submit: A — scanner authentication only

**One protected file:** `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/routes/multi-scan.js`.

Baseline SHA-256: `f4948acc53c4e6d6b2029e8896bd8ef21b5e33516a47c31bff44ab7736440c08`.

Approve only the A01 scope: a default-disabled credential-proven scanner-session route placed before the existing prefix bearer middleware, plus explicitly enumerated NEW pure session/credential/config/repository/test modules. No change to existing login/registration/app/order token issuers, authCheck, frontend, cart, AI service, vector index or configuration file. No endpoint activation, production model import, host access or deployment. A later B edit of this same router needs its own scope/approval.

Proposed new A files (not created in 11-A): main services/multi-scan/stage11/{session-config,session-service,session-handler,credential-repository,session-factory}.js and isolated tests/multi-scan/stage11/auth-session.test.js. These are named interfaces to design/review, not implemented modules. Key loading is trusted and missing keys leave the route disabled/unavailable; code approval does not provision secrets or permit environment changes.

A entry: explicit written file/hunk/new-module approval and fixture credential schema. A exit: default-disabled import safe; no production DB/cache/listen; subject/issuer/audience/scope/expiry cases pass; old route behavior preserved; exact diff and hash review. No DB schema migration or new dependencies.

## Batch B — backend main/private composition

Selected protected files: B01 `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/routes/multi-scan.js` (a separate delta after A); B02 `/mnt/g/clavstore/clavstore-api/clavstore-ai-image-api/server.js` (early exact gated parser/receiver).

New main files should provide rich handlers, a scoped public search/review projection including slug, bounded scan/session ownership registry, exact raw AI conformance/model pins/truncation guard, metadata-export protocol and explicit production composition. New AI files should provide inert worker composition, trusted read-only metadata provider and receiver HTTP/worker lifetime owner. All live model/network providers stay gated; public-interface composition must never mutate existing module exports or import Stage 9 fixtures as startup. BACKEND-AI-REVIEW.md selects a read-only versioned sidecar direction; artifact provenance/export authorization must be specified before usable E2E, not left as an always-admin callback.

B exit: contract/import/authorization/DTO/body/namespace/model/metadata/admission/cleanup tests and full isolated regression evidence. No automatic rebuild or index/schema format change, no persistence. Native slots belong to AI worker until true settlement; main IO slots are separate. If a factory requires another protected edit, stop and submit that exact additional scope instead of expanding B.

## Batch C — frontend flag-hidden POS access

Selected protected files: C01 `/mnt/g/clavstore/clavstore-ui/clavstore-reseller-original/src/App.js`; C02 `/mnt/g/clavstore/clavstore-ui/clavstore-reseller-original/src/pages/PointOfSale.js`.

New ScannerReviewEntry, ScannerReviewLink and API/session wrappers acquire a dedicated credential, pin base/scope and render the frozen scanner through public props. Feature flag default false; no global auth/cart cleanup; no onPrepared mutation callback. Alternate panel/model/error/manual-search patches are separately listed, not preauthorized. A disabled direct URL needs only App.js, but a visible POS entry additionally needs the small link insertion; both remain absent with flag false.

C exit: component/route/role/empty-cart/store/expired-session/camera/overlay/manual review tests; no dispatch/persistence/storage writes; legacy payment/order/scanner interactions unchanged. Browser hardware remains a separate D scope.

## Batch D — review-only E2E validation, not source-edit authorization

No protected modification is granted by D. It requires separate written staging host/network/fixture DB/browser/data access scope; no production Mongo/Redis/customer cart/VPS access is implied by source approval. Entry requires A/B/C reviewed disabled artifacts and an approved metadata bridge. Exit requires actual HTTP/TLS/parser/cancellation/native-busy/browser/rollback evidence and review-only output. Real grocery labels/accuracy and target capacity are still required before any cashier pilot. No mutation integration or environment flag activation is inherited automatically.

## Rollback plans per batch

| Batch | Files / baseline | Flags and rollback trigger | Safe restoration | Before/after tests | Database/index impact |
|---|---|---|---|---|---|
| A | A01 hash above; new A files inert | Keep main/session gates false. Roll back on legacy route change, model import when disabled, credential leakage or invalid token acceptance | Close session admission, discard only new memory sessions, restore approved A hunk or exact archived bytes; existing old POS token/cart unchanged | Disabled/import-safe and JWT/role/credential tests; old login routes; full frozen suites | No schema/index migration. Issued scanner tokens require gate closure and expiry or dedicated-key revocation; restoring source alone does not revoke them |
| B | B01 baseline relative to approved A, B02 original source pin | Close main/private review gates on truncation, wrong pins/scope, parser bypass, overrun or DTO mutation | Drain/join AI native worker separately from main IO. Restore B-specific artifact/hunks, retaining approved A if desired. Never delete/rebuild old indexes | Route order/body/HMAC/current records/sidecar/native leases plus frozen suites; actual staging restore only when separately authorized | New sidecars/contexts invalidated or retained read-only by manifest; no legacy index/schema change. Recovered generation must have matching metadata |
| C | C01/C02 source pins in matrix; new wrapper/link files | Flag false by default; revoke backend admission immediately on session/cart/old camera regression | Restore exact imports/route/link hunk or signed frontend build. Do not clear customer storage/cart or change old scanner. Cached build flag is not an instant server kill switch | Disabled route/link, old POS payments/Barcode, expiry/scope reset, no writes | No DB/index or customer cart migration |
| D | Approved A/B/C release manifest and full SHA archive; no source delta by D alone | Stop test access/admission on cross-tenant, unsafe review, leak, OOM/hang or old scanner regression | Stop only authorized staging worker/test sessions and restore known-good staging artifact via documented runbook; no rollback executed now | Repeat safe pre/post checks plus separately approved HTTP/browser/worker drain exercise | No production records/indexes touched. Any staging artifact deletion needs its own authorization |

Before editing any approved batch, capture that batch's current byte archive and SHA, Git state, all 88 symlink targets and an exact changed-path allowlist. Several relevant scanner files are currently untracked, and the frontend repository root is /mnt/g while main/AI are separate roots. **Do not assume git restore can restore them.** Use an explicitly approved immutable byte/artifact backup, verify SHA after restore, preserve unrelated user work and CRLF/LF boundaries, and never reset/clean entire repositories. No backup restore, git mutation or rollback command was executed in 11-A.

## Complete existing-file approval inventory

| ID | Batch | Exact path | Necessity | Risk | Selected? |
|---|---|---|---|---|---|
| A01 | A | /mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/routes/multi-scan.js | Mandatory for selected Batch A | High | Yes |
| B01 | B | /mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/routes/multi-scan.js | Mandatory for selected Batch B | High | Yes |
| B02 | B | /mnt/g/clavstore/clavstore-api/clavstore-ai-image-api/server.js | Mandatory for selected Batch B | High | Yes |
| C01 | C | /mnt/g/clavstore/clavstore-ui/clavstore-reseller-original/src/App.js | Mandatory for selected Batch C | Medium | Yes |
| C02 | C | /mnt/g/clavstore/clavstore-ui/clavstore-reseller-original/src/pages/PointOfSale.js | Mandatory for POS entry, not for a manually entered test URL | Medium | Yes |
| ALT01 | B alternative | /mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/controllers/multi-scan.js | Alternative; excluded from selected minimal set | High | No — separate alternative/deferred |
| ALT02 | A alternative | /mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/controllers/auth.js | Deferred alternative, NOT selected | Critical | No — separate alternative/deferred |
| ALT03 | A alternative | /mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/controllers/user.js | Deferred alternative, NOT selected | Critical | No — separate alternative/deferred |
| ALT04 | A alternative | /mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/controllers/app/user.js | Deferred alternative, NOT selected | High | No — separate alternative/deferred |
| ALT05 | Global security, outside A-D | /mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/controllers/order.js | Separate project, NOT selected | Critical | No — separate alternative/deferred |
| ALT06 | Global security, outside A-D | /mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/middlewares/auth.js | Separate mandatory security remediation before production promotion; NOT included in 11-B first patch | Critical | No — separate alternative/deferred |
| ALT07 | B alternative | /mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/server.js | Alternative; excluded | High | No — separate alternative/deferred |
| ALT08 | B alternative | /mnt/g/clavstore/clavstore-api/clavstore-ai-image-api/routes/multi-scan.js | Alternative; excluded | High | No — separate alternative/deferred |
| ALT09 | B alternative | /mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/services/multi-scan/stage7/repository.js | Alternative; excluded | Medium | No — separate alternative/deferred |
| ALT10 | B alternative | /mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/services/multi-scan/stage7/validation.js | Alternative; excluded | High | No — separate alternative/deferred |
| ALT11 | C optional | /mnt/g/clavstore/clavstore-ui/clavstore-reseller-original/src/components/multiScan/model.js | Optional defense in depth; not selected | Medium | No — separate alternative/deferred |
| ALT12 | C optional | /mnt/g/clavstore/clavstore-ui/clavstore-reseller-original/src/components/multiScan/MultiProductCameraScanner.jsx | Optional defense in depth; not selected | Medium | No — separate alternative/deferred |
| ALT13 | C optional | /mnt/g/clavstore/clavstore-ui/clavstore-reseller-original/src/components/multiScan/MultiScanSummary.jsx | Optional defense in depth; not selected | Medium | No — separate alternative/deferred |
| ALT14 | C optional | /mnt/g/clavstore/clavstore-ui/clavstore-reseller-original/src/components/multiScan/useMultiScan.js | Optional defense in depth; not selected | Medium | No — separate alternative/deferred |
| ALT15 | C alternative | /mnt/g/clavstore/clavstore-ui/clavstore-reseller-original/src/components/multiScan/MultiScanPosPanel.jsx | Alternative; excluded | Medium | No — separate alternative/deferred |
| ALT16 | C optional | /mnt/g/clavstore/clavstore-ui/clavstore-reseller-original/src/functions/multi-scan.js | Optional; excluded | Low | No — separate alternative/deferred |
| ALT17 | C optional | /mnt/g/clavstore/clavstore-ui/clavstore-reseller-original/src/components/multiScan/ManualProductSearch.jsx | Optional UX hardening; separate approval if exercised in staging | Medium | No — separate alternative/deferred |
| ALT18 | C optional | /mnt/g/clavstore/clavstore-ui/clavstore-reseller-original/src/components/multiScan/cartAdapter.js | Optional defense; excluded | Medium | No — separate alternative/deferred |
| FUT01 | Future >10 | /mnt/g/clavstore/clavstore-api/clavstore-ai-image-api/services/multi-scan/stage6/pipeline.js | Deferred; explicitly excluded from 11-B | High | No — separate alternative/deferred |
| FUT02 | Future offline helper hardening | /mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/services/multi-scan/stage9/native.js | Deferred; no production reuse or edit in 11-B | Medium | No — separate alternative/deferred |

Every row requires separate explicit approval of its scope; the table is not a request to modify all listed files. Main controller/auth/middleware, Stage 7 validator/repository, Stage 8 components/client/adapter, Stage 6 >10 cap and Stage 9 helper edits are **not** included in the selected four-file union. No new dependency or DB schema migration is needed for the selected short-lived, single-worker, read-only design. A later password/refresh/durable-cart/index-format migration requires a new approval and its own reversible data plan.
