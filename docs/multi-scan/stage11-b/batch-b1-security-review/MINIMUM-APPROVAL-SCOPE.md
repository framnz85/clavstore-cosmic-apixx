# Smallest recommended implementation approval

**No implementation is authorized or performed by this review. No adapter deployment or scanner activation is safe yet.**

## First independent candidate: S01 recovery containment only

Approve, if desired, only the exact one-line route correction in01-RECOVERY-CONTAINMENT.diff plus new isolated tests/documentation. It returns503 instead of invoking unproved password replacement. Its intentional password-recovery outage must be explicitly accepted. It does not remediate all credential/role paths, complete revocation, alter scanner code, migrate schemas, enable endpoints or change frontend/cart behavior. Other account takeover and authority risks stay blockers.

- Candidate `01-RECOVERY-CONTAINMENT.diff`: `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/routes/user.js`. Current SHA256 `0dd77b60b993926406bfdc2ebeee92dff90966e92a3c955785313df95460516e`; proposed SHA256 `984e17abf59326cc6e617d87364802f4ca076775cc9ac0a71a23dc1235845fab`.
- Candidate `02-CONNECTION-LOG-REDACTION.diff`: `/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/dbconnect/gratis.js`. Current SHA256 `d32854d271b043c57e0d28bd9e92a3b11a37470b681f7adc6b5be81c4310144d`; proposed SHA256 `52dd7903136bf8ea0d3d2e828cec24f1b78b13bf41a88d32160b9526be685326`.

S02 connection-log redaction is separately approvable; it is not silently bundled with S01. Its exact two-log-line change has separate tests/rollback and does not fix async connection ownership or global logging. Both exact diffs pass clean-apply/syntax checks but were not applied/executed. See PATCH-PROPOSALS.md and PATCH-MANIFEST.json.

## Next security foundation decisions — review before code

Choose hardened-User status/version vs independent scanner authority collection, verified enrollment/operator bootstrap, exact privilege/tenant/target matrix, fail-closed multi-record transition and revocation linearization guarantee. Then submit exact protected-writer patches for the29 inventoried paths, including credential entry points and broad store/app/user/import writes; protect all aliases, operators/dotted fields and alternate entry points, not just the visible UI. Avoid a broad forced replacement of global auth middleware without legitimate issuer/caller migration coverage.

Subsequent explicitly scoped source batches should be small reviewable groups: profile/signup and staff-grant separation; credential recovery/reset protection; store/namespace/permission ownership controls; status/epoch schema/migration and privileged writer; explicit DB composition; dedicated scanner issuance and every-consumer epoch/scope enforcement. Each needs current absolute-path hashes, exact hunks/new sources, fixture tests, intentional compatibility effects and exact-byte/data rollback. No implied permission to edit all listed legacy files. New schema fields/collection and migration are proposals only, not already-deployed data or ready migration scripts.

Current required router/test baselines remain unchanged and all live gates remain untouched. Keep scanner unavailable while status, role-write, credential-write, source-ownership and ingress/deployment controls are unresolved. Prior B.1 adapter v2 alone is not sufficient and must not be implemented as the finished foundation. Do not proceed to B.2 until separately and explicitly authorized.
