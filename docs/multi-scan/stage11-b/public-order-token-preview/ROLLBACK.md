# Rollback preparation — not executed

No source patch is applied in this preview. ORDER-ROUTES-ORIGINAL.txt is the byte-exact review baseline, including CRLF. Verify it and the live development target before any later application; preserve a fresh unique backup at that time.

Original routes/order.js SHA256:
`cab1f734e9b34b2585d3f8777b42325ba934412a7d6a639925dad61b796664bd`

Proposed resulting SHA256:
`2a448f501d35157b9c4a11ac3c0a2a21ed476aeb6f8d4d7dceb8064457223bdf`

After a separately authorized implementation, a rollback must first confirm the target exactly matches that postimage and the rollback artifact exactly matches the original hash. Stop if either differs; never overwrite subsequent user changes. Review the security effect: restoring this binding reopens the unsafe public order-token issuance and data response. Do not treat rollback as security-neutral.

From main backend, check `git apply --reverse --check docs/multi-scan/stage11-b/public-order-token-preview/ONE-ROUTE.diff`; only after a separate rollback decision reverse that one diff or restore byte-exact verified preimage. Rehash, inspect the exact one-line reverse change, syntax-check, run relevant regressions and audit protected sources/all88 symlink targets. Do not git reset/checkout dirty work or restore an older user-router backup. Existing two-route recovery containment is unrelated and must stay intact. New preview checks that demand denial must fail after reversal; do not skip or weaken them.

No DB/cache/key migration is part of this route patch. The patch and rollback do not revoke already issued tokens or erase caches. No deployment, production credential rotation, scanner activation or provider operation is authorized by this procedure.
