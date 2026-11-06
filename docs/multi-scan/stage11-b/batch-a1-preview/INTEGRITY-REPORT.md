# Batch A.1 patch-preview integrity

**All106,872 pre-existing regular files unchanged; all88 symlink targets unchanged.** Zero modified/missing existing files, zero added/removed/changed symlink targets, zero read errors, no unrelated changes. The historical test, current router, five auth modules, old scanner, frontend, cart, environment/configuration, dependencies, previous reports/tests and all other existing files remain byte-identical. No patch applied or executable/test/program file created. New artifacts are uniquely created documentation only; no existing document overwritten.

| Project | Existing files unchanged | Symlinks unchanged | Changed | Missing |
|---|---:|---:|---:|---:|
| /mnt/g/clavstore/clavstore-ui/clavstore-reseller-original | 85533 | 75 | 0 | 0 |
| /mnt/g/clavstore/clavstore-api/clavstore-cosmic-api | 7047 | 5 | 0 | 0 |
| /mnt/g/clavstore/clavstore-api/clavstore-ai-image-api | 14292 | 8 | 0 | 0 |

Test SHA256 remains `62d3bf92d27c5f8b84edf89985760f1720cc296d84154920fa74967d6eb75ec3`.
Router SHA256 remains `469c88c14c7472b59aa145e74c785d8ec85adbd1540a8be3fcffd0f98cd99836`.

BASELINE.json.gz and FINAL-AUDIT.json.gz record complete per-file SHA256 maps, symlink targets and scoped Git statuses across frontend/main/AI roots. No pre-existing file is excluded. Frontend Git ownership is /mnt/g; API repositories are independent. Read-only Git commands use GIT_OPTIONAL_LOCKS=0. Existing untracked status entries are preserved; full hashes supply content proof beyond Git status.

The baseline precedes new file creation in this preview directory. Its output itself is created after baseline enumeration. Final audit enumerated106,876 files including four new docs (baseline, diff, evidence, review); its own output plus this integrity report and INVENTORY.json are three explicit post-enumeration new-doc boundaries, yielding seven total new documentation files. Inventory records hashes of the other six final docs and names itself without a circular self-hash. Final test/router hashes and Git statuses are rechecked before these exclusive completion writes.

No production server/listening port, MongoDB, Redis, deployment, feature enablement or cart operation. Read-only route import and an existing in-memory HTTP flag probe ran in independent processes with both flags absent; response503/DISABLED confirms default-disabled scanner session behavior. Parent/service environment and env files unchanged; no key provisioned. No protected-directory cache added or rewritten. No temporary model/index/artifact generation. Full historical/security suites are planned for after authorization, not rerun or claimed passing here. The proposed test was parsed only, never executed as revised source.

## Git statuses

### /mnt/g/clavstore/clavstore-ui/clavstore-reseller-original

Before and after (identical):

```text
?? clavstore/clavstore-ui/clavstore-reseller-original/
```

### /mnt/g/clavstore/clavstore-api/clavstore-cosmic-api

Before and after (identical):

```text
?? controllers/multi-scan.js
?? docs/
?? middlewares/multi-scan-auth.js
?? multi-scan-runtime/
?? routes/multi-scan.js
?? scripts/
?? services/
?? tests/
```

### /mnt/g/clavstore/clavstore-api/clavstore-ai-image-api

Before and after (identical):

```text
?? controllers/multi-scan.js
?? docs/
?? middlewares/multi-scan-service-auth.js
?? multi-scan-data/
?? routes/multi-scan.js
?? scripts/
?? services/
?? tests/
```

## Stop boundary

TEST-PATCH.diff is unapplied. REVIEW.md contains investigation, original-intent assessment, exact correction, required post-approval tests and byte-exact rollback procedure. Existing historical failure remains until explicitly authorized correction; no Batch B work. Wait for explicit approval to modify only tests/multi-scan/stage2.test.js line206.
