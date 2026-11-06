# Batch B.1-S protected-file integrity audit

**All106,927 pre-existing regular files unchanged; all88 symlink targets identical.** Zero modified/missing files, zero changed/added/removed symlink targets, zero read errors. Both required approved pins match before and after; every additionally reviewed source pin in SOURCE-EVIDENCE.json rechecked. No route/controller/auth/model/connection/frontend/POS/cart/config/environment/dependency/test/prior-document file modified, overwritten, removed, moved or renamed.

| Project | Existing regular files unchanged | Symlink targets unchanged | Changed | Missing |
|---|---:|---:|---:|---:|
| /mnt/g/clavstore/clavstore-ui/clavstore-reseller-original | 85533 | 75 | 0 | 0 |
| /mnt/g/clavstore/clavstore-api/clavstore-cosmic-api | 7102 | 5 | 0 | 0 |
| /mnt/g/clavstore/clavstore-api/clavstore-ai-image-api | 14292 | 8 | 0 | 0 |

Full per-file SHA256 maps/Git statuses and symlink target maps are in BASELINE.json.gz and FINAL-AUDIT.json.gz. No existing path excluded. Git reads use GIT_OPTIONAL_LOCKS=0; frontend Git root is /mnt/g and APIs are independent repositories. Status alone is insufficient because relevant source/test trees are untracked; full hashes provide the content-integrity proof. Final Git statuses and required/source pins were rechecked before these exclusive completion-document writes.

The final scan enumerated106,945 regular files:106,927 pre-existing plus18 new docs (including baseline output created after baseline enumeration). Its own output, INTEGRITY-REPORT.md and INVENTORY.json are three explicit post-enumeration additions, for21 total new documentation files. Inventory hashes all other20 final artifacts and names itself without circular hash. Every new path is in this review directory; no executable module, test, migration script or protected cache created or rewritten. No unrelated additions/changes detected.

Only source reads/static search, full hashes/status, clean-apply checks and vm.Script syntax construction on two proposed strings were performed. Exact unapplied diffs preserve original CRLF counts. No proposed source was executed or applied. No server/model/database-bootstrap module imported. No production DB/Redis/service connection, active attack, install/config/env change, index rebuild, cart operation, deployment/push, model inference or feature activation. Existing test suites were not rerun;428/28/31 are prior A.1 results and remain labelled historical. No runtime code injection, monkeypatching or cache/export replacement.

Both exact patch candidates remain independently proposed; neither authorizes broad role/credential/schema/lifecycle remediation, adapter implementation or activation. Missing authority/source/writer guarantees remain BLOCKED. No rollback was performed and no existing backup overwritten. Current scanner default-disabled code remains byte-identical; no claim about unseen deployed environment is made. Stop after review; no B.2.

## Git working-tree status

### /mnt/g/clavstore/clavstore-ui/clavstore-reseller-original

Before/after identical:

```text
?? clavstore/clavstore-ui/clavstore-reseller-original/
```

### /mnt/g/clavstore/clavstore-api/clavstore-cosmic-api

Before/after identical:

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

Before/after identical:

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
