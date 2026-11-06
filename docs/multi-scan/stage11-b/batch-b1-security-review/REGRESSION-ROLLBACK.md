# Regression, migration and rollback gates

## Before any later source implementation

Require explicit approval of exact paths/hunks and fixture contracts. Recheck Batch A router and A.1 test pins and PATCH-MANIFEST.json original hashes; `git apply --check` each independently selected candidate. Capture new Git/full-file/88-symlink baseline and unique original byte archives before editing; never overwrite prior snapshots. CRLF preservation is part of the proposed diff. No automatic approval of other review paths or future schema/provider files.

S01 recovery containment tests must be new isolated tests plus legacy route inventory/login/signup/profile/recovery UX fixtures; expected recovery503 is deliberate reviewed behavior, not an existing failure to hide. S02 logging tests need pure dependency-injected bootstrap fixtures or another separately approved extraction; do not load dbconnect to see whether a production connection starts. No monkeypatching or runtime export/cache injection. Verify same single connection/export/lifecycle semantics and no URI/error text in logs. Syntax checks on changed files and unchanged scanner; current31 Stage2,28 Batch A security and historical428 suites after each approved source batch. Add coverage for every remediated protected writer and13 security cases; historical scanner tests alone do not cover unsafe account APIs.

Do not modify an old failing test or suppress failures without explicit scope. Existing POS/cart/barcode/single-product scanner and global login behavior must remain unchanged except explicitly approved recovery downtime or subsequent auth cutover. Fixture request/response parity, no real writes/servers/DB/Redis, default-disabled scanner and no new startup import/connection are required. Full hardware/ingress/global parser/logging/distributed limits and real revocation topology need separately authorized staging evidence.

## Migration plan boundary

No migration executed. Both status options are NEW proposals, not deployed schema. Approve field/collection names, status semantics, protected writer, operator bootstrap, indexes/validators, identity mapping and topology before producing executable migration scripts. All missing/new records default deny, no bulk-active enrollment from current role rows. Use independent staff/owner attestation, immutable migration inventory and CAS/version increments. Interrupted transitions stay disabled. Never assume multi-document transactions or majority consistency from source alone.

## Rollback of exact candidates

For S01/S02 use only the specifically approved target's original bytes and original SHA in PATCH-MANIFEST.json; verify current candidate SHA before undo, restore no unrelated file and recheck exact hash. Both reversals reintroduce security risks (unsafe recovery or secret-bearing logging), so rollback requires explicit acceptance or separately authorized admission containment. Do not undo security merely to make a legacy UI pass. No repository reset/clean, blind untracked git restore, backup overwrite, shared DB close/reconnect, key rotation or global flag change inferred.

For later authority schema/epoch cutover: close authorized scanner admission, preserve revoked/deleted records and monotonic epochs, keep policy files/data until reviewed recovery. Do not drop the new collection, reset versions, bulk reenable, accept old missing-version tokens or revert consumers to decode-only auth. Restoring source alone cannot revoke already accepted credentials. Any data/index deletion or restoration requires separate access approval and a verified migration-specific manifest. No DB/index/cart migration/rollback performed now.

## After any authorized change or rollback

Repeat relevant isolated suites, exact router/test/source hashes, complete Git statuses and full-file allowlist/88-target comparison; enumerate new tests/docs and caches separately. On unexpected file change or security regression stop and report; no repair outside allowlist. Review remains blocked for activation until all authority, credential, lifecycle, ingress and logging gates are evidenced.
