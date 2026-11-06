# Rollback procedures — no rollback performed

There is no application change to roll back in this stage. Only new review files exist in this folder. In particular, keep the already implemented two recovery503 routes; do not restore an earlier vulnerable user router by confusing this review with the previous containment.

## Before any future authorized implementation

1. Choose the exact patch subset/behavior and confirm its dependencies. PATCH-MANIFEST.json gives each01–05 preimage/postimage SHA-256;06 adds only a future core/test and has no runtime binding.
2. Rehash current source and stop on any mismatch. Preserve fresh byte-exact preimages before applying, including CRLF. The nine current snapshots in rollback-preimages and ROLLBACK-PREIMAGES.json are review-time evidence; they are not permission to overwrite intervening work.
3. Record which patches/files actually changed and run source-bound security/regression/integrity validation. Do not modify the global legacy guard, login, frontend, environment or scanner as an undeclared dependency.

## If future approved development patches must be reverted

Stop if current hashes do not match the recorded approved postimages. Review the security effect: reverting containment reopens known credential/privilege writers and unsafe signed-token issuance. Reverse only the approved subset, in reverse dependency order, after `git apply --reverse --check <patch>`. Do not use git reset/checkout on a dirty workspace.

Alternatively restore each changed source from its matching fresh preimage only after checking both current postimage and backup hashes. ROLLBACK-PREIMAGES.json maps the current nine route/controller files to their review snapshots. A whole-file restore is safe only when no later unrelated change exists; otherwise prepare an exact reverse diff for review. For partial series, use the per-step preimage hash in PATCH-MANIFEST.json, not an assumed final-state hash. The baseline routes/user.js snapshot already includes both emergency recovery503 routes and must retain them.

Remove future added core/test files only if their exact approved content/hash matches and they have no subsequent user changes/references. Do not remove or alter these evidence documents or another task's files automatically. No DB/schema migration is included in the prepared diffs; a future data/epoch migration needs its own reviewed rollback policy and must not decrement epochs or resurrect revoked grants/sessions.

After any authorized rollback: verify syntax, exact intended reverse diff, all unaffected source hashes and88 symlink targets; rerun relevant tests. Tests that require containment should fail if it was intentionally removed; do not suppress them or call rollback security-equivalent. No deployment, key operation, scanner activation or destructive database action belongs to this procedure.
