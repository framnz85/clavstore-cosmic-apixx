# Stage 11-A — independent security and integration review

**Review-only milestone complete. Overall readiness remains BLOCKED. No integration code, configuration, dependency, route, index, cart behavior or deployed system was changed.** No production MongoDB/Redis, InterServer/VPS, HTTP service, native inference or deployment was accessed or started. No rollout or rollback was executed and Stage 11-B was not started.

## First minimal protected-file batch to submit for approval

**Batch A: modify only `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/routes/multi-scan.js`**, limited to an explicitly default-disabled scanner-session registration **before** the existing prefix bearer-auth chain in createRouter. Put credential verification, dedicated bounded token issuance, configuration and fixture tests in enumerated NEW modules. Baseline SHA-256: `f4948acc53c4e6d6b2029e8896bd8ef21b5e33516a47c31bff44ab7736440c08`.

This is a proposed approval scope, not an applied patch or permission to activate the route. Do not change existing login/registration/app/order token issuers, legacy auth middleware, frontend or cart in this first batch. Require fresh credential proof; never upgrade a decoded legacy bearer token or client hash into a scanner session. Key provisioning/environment changes, host access and activation need separate authorization. [Exact scope and rollback](APPROVAL-ROLLBACK.md).

## Executive findings

The Stage 10 plan is useful but incomplete. Independent review against actual source and eight safe fixture/pure-interface probes identified or confirmed these corrections:

1. Legacy `authCheck` uses jwt-decode, not signature verification. Existing sign sites omit exp; purpose varies, including order-derived tokens. Stage 7 strict verification must stay intact. A dedicated purpose/key/issuer/audience/store-bound credential flow is narrower than global token migration. Actual active tokens/key configuration remain NOT VERIFIED.
2. New route autoload is not equivalent to safe composition. Main/AI use separate repositories and unconditionally load route entries; an old prefix gate/auth/parser can intercept a later new handler. Use explicit registration and gate pure imports before obtaining real model handles; models/user imports a DB bootstrap with connection side effects.
3. Stage 2 controller cannot transparently wrap the rich service: it receives flat tenant/raw RGB, strips DTO evidence, generates another scan ID and confirm says confirmed:true. New explicit handlers can reuse the Stage 10 raw→PNG bridge and Stage 7 public interfaces without editing the old controller/upload modules.
4. Main Stage 7 model validation checks pin **shape**, not every approved deployment value (probe P05). Exact model/preprocessor/OCR/policy/generation conformance must be specified in a new raw-envelope boundary.
5. Detector truncation/candidate-limit flags can be lost through Stage 7 and pass Stage 10's CROP_LIMIT-only guard (P06). The future raw boundary must reject all incomplete scans before any selectable UI output. Do not lower detector cap to ten and assume omitted objects are visible to the current guard.
6. Stage 9 orchestration is fixture-specific: static scoped test credentials/catalog, captured admin grant, generated rectangles/temp indexes and a textual temp-root check. Do not import it into application startup. A trusted same-tenant/revision/generation metadata bridge is still missing; a reviewed read-only sidecar direction is proposed, not implemented.
7. Stage 7 current product projection omits slug (P07), although the frontend adapter needs it to detect legacy slug-based variant collisions. There is no production current text-search/full-public-POS projection or scan-ownership registry. New scoped search/review providers must supply those explicitly and never return raw internal product rows.
8. Main network timeout is not proof remote native inference stopped. AI owns its native lease until real settlement/worker exit. Stage 7 also normalizes upstream busy status to a generic service error, so exact public 429 behavior needs explicit adapter tests rather than assumption.
9. A direct App.js route is not an existing POS entry or scanner credential boundary. The minimal selected frontend batch is App.js plus one PointOfSale.js link insertion, with new memory-session wrapper/API components, flag false, no global logout/cart cleanup and no old scanner replacement.
10. Real grocery accuracy and VPS capacity remain BLOCKED/NOT VERIFIED. Historical synthetic timings and 428 historical tests do not establish them. No 20-object limit change or performance claim is proposed for 11-B.

[Detailed corrections](REVIEW-CORRECTIONS.md) distinguish source evidence, reproduced limitations and proposed mitigations.

## Deliverable map

| Required review | New documentation |
|---|---|
| JWT matrix / safe legitimate-session transition | [JWT-COMPATIBILITY.md](JWT-COMPATIBILITY.md) |
| Backend endpoints, uploads, auth, parser order, errors/deadlines and AI contracts | [BACKEND-AI-REVIEW.md](BACKEND-AI-REVIEW.md) |
| Exact App/POS insertion points, imports, flag behavior, tests, rollback and cart audit | [FRONTEND-CART-PATCH.md](FRONTEND-CART-PATCH.md) |
| Security threats, severity/mitigation/test matrix and planned regressions | [THREATS-REGRESSION.md](THREATS-REGRESSION.md) |
| File-by-file approval / independent batches / rollback | [APPROVAL-ROLLBACK.md](APPROVAL-ROLLBACK.md), [APPROVAL-MATRIX.json](APPROVAL-MATRIX.json) |
| Actual repository roots/status | [REPOSITORIES.json](REPOSITORIES.json), [INTEGRITY.md](INTEGRITY.md) |
| Exact reviewed source hashes and evidence provenance | [SOURCE-EVIDENCE.json](SOURCE-EVIDENCE.json) |
| Safe current diagnostic observations | [source-probes.json](source-probes.json) |
| Full new-file and integrity results | [INVENTORY.json](INVENTORY.json) |

The approval matrix contains **25 distinct proposed scope rows**, each with exact absolute path, current purpose, proposed change/reason, mandatory/optional/alternative status, risk, affected behavior, tests, rollback, SHA-256, migration/dependency implications and separate approval requirement. This is not permission to edit every row. The selected minimal A/B/C union is four unique protected files: main routes/multi-scan.js, AI server.js, frontend App.js and frontend pages/PointOfSale.js. B revisits the main router only under a separately approved delta. D grants no source edits; staging/data/network/browser access is separate. Wider legacy auth remediation, Stage 7/8 alternative hardening, Stage 9 helper cleanup and >10 changes are explicitly excluded unless separately approved.

## Evidence labels and execution limits

- **VERIFIED FROM SOURCE:** actual algorithms/defaults/sign sites, role/store/reseller resolver, prefix parser/auth order, public contracts, raw/RGB transport, frontend route/cart behavior and hard bounds. Sixty-eight reviewed source/document hashes are pinned in SOURCE-EVIDENCE.json.
- **VERIFIED BY TEST (historical):** Stage 10 retained 428 passing regressions, including native fixture tests. They were read, **not rerun in Stage 11-A**.
- **VERIFIED BY TEST (11-A probe):** eight in-memory diagnostic checks, zero execution failures. Four demonstrate limitations (pin allowlist, detector completeness, slug projection, textual temporary-root check); their successful reproduction is not a security pass or a deployed exploit. No new test/program file was written.
- **PROPOSED:** every source/route/credential/metadata/provider/frontend/batch/rollback change in these reports. Nothing applied.
- **BLOCKED / NOT VERIFIED:** production security migration, actual credential provisioning, full network metadata contract, HTTP/TLS/browser staging, real grocery dataset/accuracy, target host capacity and any mutation integration.

Preserved **historical Stage 6** benchmark: approximately 0.67 s / 3.47 s / 6.90 s for 1/5/10 crops, reported peak about 1.05 GiB. No new native benchmark, actual grocery inference or InterServer test was executed. Full object-limit discussion distinguishes detector output, crop generation, recognition, response validation, UI and SKU quantities; the ten-object cap remains unchanged.

## Integrity result and stop boundary

**106,806 pre-existing files and all 88 tracked symlink targets unchanged**, with zero changed/missing files, zero changed symlinks and zero read errors. All **17 new files are Stage 11-A documentation under this new directory only**; no source/scripts/tests/configuration/images/index/cache files were added. Main and AI are separate Git repositories; frontend resolves to /mnt/g. The audit did not assume shared ownership or rely on untracked Git status as file-integrity proof.

[Integrity details](INTEGRITY.md) explain the raw baseline's newly created audit-log entry and the scoped baseline retaining every actual pre-existing file. No pre-existing path is excluded. Final report/inventory files and the final manifest are explicit recursive enumeration boundaries. No existing documentation was overwritten; all outputs were created exclusively and would stop if their unique names existed.

**Recommendation:** submit only Batch A01 for explicit Stage 11-B source approval first, with its named new modules/tests and default-disabled gates. Review its concrete diff/results before considering B, C or separately authorized D. Do not activate endpoints or proceed automatically. **STOP after Stage 11-A.**
