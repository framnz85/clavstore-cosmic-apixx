# Rollback artifact and guarded procedure — not executed

Fresh pre-implementation bytes are preserved at ORDER-ROUTES-ORIGINAL.txt in this directory, created before the router was modified. This is a new artifact for this batch; CRLF is preserved.

Original SHA256: `cab1f734e9b34b2585d3f8777b42325ba934412a7d6a639925dad61b796664bd`.
Applied SHA256: `2a448f501d35157b9c4a11ac3c0a2a21ed476aeb6f8d4d7dceb8064457223bdf`.

Reversal would reopen unsafe public login-token issuance/account data disclosure and needs a separate decision. Stop on any current/backup hash mismatch; do not overwrite intervening work or use git reset/checkout on this dirty workspace.

After a separately authorized rollback decision, from the main backend root:

```python
from pathlib import Path
from hashlib import sha256
router = Path("routes/order.js")
backup = Path("docs/multi-scan/stage11-b/public-order-token-implementation/ORDER-ROUTES-ORIGINAL.txt")
assert sha256(router.read_bytes()).hexdigest() == "2a448f501d35157b9c4a11ac3c0a2a21ed476aeb6f8d4d7dceb8064457223bdf"
original = backup.read_bytes()
assert sha256(original).hexdigest() == "cab1f734e9b34b2585d3f8777b42325ba934412a7d6a639925dad61b796664bd"
router.write_bytes(original)
assert sha256(router.read_bytes()).hexdigest() == sha256(original).hexdigest()
```

Alternatively check and reverse only the reviewed public-order-token-preview/ONE-ROUTE.diff after verifying these hashes. Inspect exact one-line reversal, syntax-check and run relevant regressions/integrity checks. New containment tests intentionally fail if denial is removed; do not skip or weaken them to hide rollback effects. Preserve other work, recovery503 routes, scanner pins and all88 symlink targets. No deployment, DB/cache/credential operation, feature activation or other security patch is part of this procedure.
