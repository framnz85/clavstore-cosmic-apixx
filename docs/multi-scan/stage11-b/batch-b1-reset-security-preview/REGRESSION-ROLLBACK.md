# Regression, rollback and approval boundaries

## Exact Option A source scope

Only main routes/user.js is proposed. OPTION-A.diff replaces the two PUT registrations; original forgotPassword/resetPassword imports and controller functions remain untouched. Entire reset authCheck/adminGratisCheck chain is replaced by terminal denial so unverified/expired/no-token/cashier requests reaching that route produce the same503 before any old guard's DB lookup. Global middleware and every other route, normal login, frontend, models, password records, hashing and flags are unchanged. Preserve original CRLF. PATCH-MANIFEST.json contains absolute path/current and candidate SHA.

Both legitimate forgotten-password users and administrators/moderators/cashiers using the old reset action lose these two workflows after a future deployment. Their UI wrappers currently expect the old actions and must handle503; no frontend fix is hidden. Current source and production still retain old behavior because no patch or deployment occurred. Normal login and old-password change registration stay intact, but the latter's full security is not certified. Generic credential-write bypasses remain and must not be treated as contained.

## Tests after separately authorized implementation

Capture unique original routes/user.js bytes before applying and verify original hash0dd77b60b993926406bfdc2ebeee92dff90966e92a3c955785313df95460516e plus two scanner pins. Recheck clean applicability, review exact two-registration change and callback safety. New fixture tests may be created only under that later authorization.

Run syntax on target and new test sources; all12 prepared cases and new user-route binding/login/change/recovery UX fixtures. Execute existing31 Stage2,28 Batch A security, and full historical428 suites using existing isolated runners and new output directories; report counts, failures and skips separately. Those suites were not rerun in this review and do not substitute for new account-route tests. No production services or DB imports. Recheck six scanner routes and default-disabled503/DISABLED; no feature flag or key provisioned. Confirm known account-write gaps remain documented, not exploited or silently altered.

Test global parser/CORS precedence and installed mount behavior only in authorized isolated HTTP streams/harness; no promise uniform503 for pre-router failures. If truly every HTTP payload must503 before parsing, an exact additional server/ingress patch would be a separate review, not expanded Option A.

## Byte-exact rollback — NOT EXECUTED

Before later application, exclusively create a uniquely named original-byte backup with SHA0dd77b60b993926406bfdc2ebeee92dff90966e92a3c955785313df95460516e, record Git/full hashes/88 symlink targets and preserve unrelated user work. Before rollback verify current file matches proposed hash in PATCH-MANIFEST.json and that no later work was added. Restore only this file's exact archived original bytes; verify original SHA/CRLF and rerun appropriate source/binding fixtures. Do not reset/clean repos, blindly git restore untracked files or overwrite backups; no DB/model/cart/index/key/flag rollback belongs to this patch.

Reverting reopens BOTH known unsafe routes. Require explicit security acceptance or separately approved admission containment rather than automatically restoring dangerous behavior just to satisfy legacy UI expectations. Source rollback has no effect on passwords already changed or old issued sessions; no claim of session revocation or production remediation. No backup/rollback or source mutation performed during preview.

## Option B regression and migration gates

Later verified recovery needs challenge race/expiry/replay, tenant/current privilege, verified delivery, modern hash and resource bounds, all password verifiers/legacy digest-login migration, epoch enforcement at every consumer and transactional/CAS failure tests. New fields/collection/index and showPass cleanup need explicit data migration/access/rollback approval. No bulk enabling existing untrusted roles. A replacement must fail closed if schema/proof/DB/epoch source is unavailable; no key/config/model/provider/deployment shortcut inferred.
