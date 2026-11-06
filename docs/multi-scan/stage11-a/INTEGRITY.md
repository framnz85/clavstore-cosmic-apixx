# Stage 11-A integrity verification

**PASS**: all 106,806 actual pre-existing files and 88 original symlink target strings remain unchanged. Zero protected file changes/deletions, zero changed symlinks, zero read errors. No source/index/model/cache/package/configuration file was created. Only the 17 newly named documentation artifacts listed in INVENTORY.json were created.

## Baseline scope and transparency

Before review report development, the frozen Stage 10 read-only verifier recorded every project file, symlink target and per-project Git status. Its stdout was captured exclusively in the new baseline-audit.log, so the raw protected-files.before.json.gz also enumerated that just-created Stage 11-A log while it was being written. This is a new report, not a pre-existing protected file.

protected-files.scope-before.json.gz is a NEW immutable derivative of that raw snapshot, omitting only the single newly created docs/multi-scan/stage11-a/baseline-audit.log from the pre-existing-file comparison. It retains every actual pre-existing file/hash and all original symlink targets, and explicitly records this documentation-only scope normalization. No existing file/cache or Stage 2–10 path was excluded, deleted or repaired. The raw baseline and log are retained unmodified for inspection.

The unchanged existing scripts/multi-scan/stage10/verify-protected.py compared this scoped baseline with the final full project scan and wrote protected-files.final.json.gz exclusively. Its outcome is unchanged=true; exclusions=[]; errors=[]. New files under the Stage 11-A directory are inventoried separately, including the raw/scoped/final manifests. Final scan happens before creation of this integrity report, STAGE11-A.md and INVENTORY.json; those three documents and the manifest itself are explicitly listed outside their recursive enumeration boundary. No pre-existing file was subsequently touched.

## Independently inspected Git roots

| Project | Actual repository root | Protected files | Original symlinks | Changed/missing/changed targets |
|---|---|---:|---:|---|
| /mnt/g/clavstore/clavstore-ui/clavstore-reseller-original | /mnt/g | 85533 | 75 | 0 / 0 / 0 |
| /mnt/g/clavstore/clavstore-api/clavstore-cosmic-api | /mnt/g/clavstore/clavstore-api/clavstore-cosmic-api | 6981 | 5 | 0 / 0 / 0 |
| /mnt/g/clavstore/clavstore-api/clavstore-ai-image-api | /mnt/g/clavstore/clavstore-api/clavstore-ai-image-api | 14292 | 8 | 0 / 0 / 0 |

Before/after scoped Git working-tree status is retained verbatim in INVENTORY.json; initial repository-root discovery is in REPOSITORIES.json. The frontend parent Git status marks the project untracked and many scanner resources in main/AI are also untracked; a clean/unchanged Git status would not be enough to prove file integrity. SHA-256 and symlink targets provide that proof. No git add/checkout/reset/clean/commit/push was used.

## Execution and artifacts

Only source/document reading, hashing/Git read-only inspection, eight safe in-memory probes and documentation validation were performed. The 428 historical tests were not rerun. No native sessions, photo encodes, index publication, application bootstrap, production model import, server/listener, DB/Redis/network/telemetry, deployment or rollback was invoked. No application environment/configuration was changed. No actual JWT/secret/database credential value was printed or saved.

There were no new repository caches or temporary image/index/test fixtures. No new runtime program/test file was persisted under /tmp or the projects in Stage 11-A; inline inspection processes held scratch values only in memory. Existing caches and all earlier-stage artifacts were left intact.

Document consistency inspection verified all 25 approval entries have required fields, absolute files and source hashes matching baseline, four selected unique protected paths, first batch A01 alone, and eight separately labeled probe observations. Proposals are not implemented fixes or automatic approvals.
