# Rollback procedure — not executed

The byte-exact original is USER-ROUTES-ORIGINAL.txt in this directory.

Original SHA-256: `0dd77b60b993926406bfdc2ebeee92dff90966e92a3c955785313df95460516e`.
Applied SHA-256: `a8c092ffc22484b7d5cfd0b876ac160a04a2343d12bedea0d39a56a198216ddd`.

After a separate decision to restore the vulnerable recovery behavior, stop if either hash does not match. From the main backend root, use this guarded restoration:

```python
from pathlib import Path
from hashlib import sha256
router = Path("routes/user.js")
backup = Path("docs/multi-scan/stage11-b/batch-b1-reset-containment/USER-ROUTES-ORIGINAL.txt")
assert sha256(router.read_bytes()).hexdigest() == "a8c092ffc22484b7d5cfd0b876ac160a04a2343d12bedea0d39a56a198216ddd"
original = backup.read_bytes()
assert sha256(original).hexdigest() == "0dd77b60b993926406bfdc2ebeee92dff90966e92a3c955785313df95460516e"
router.write_bytes(original)
assert sha256(router.read_bytes()).hexdigest() == sha256(original).hexdigest()
```

Preserve CRLF bytes. Verify syntax and review the exact reverse diff, rerun applicable historical tests and integrity audit. The new containment tests should fail after rollback because denial is intentionally removed; do not suppress them. Do not deploy or enable features as part of this procedure.
