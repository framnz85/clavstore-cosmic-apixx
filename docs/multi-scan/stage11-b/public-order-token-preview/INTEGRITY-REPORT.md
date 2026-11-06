# Integrity verification

PASS: all107,040 preexisting regular files across the three projects retain their baseline hashes, with zero missing files/read errors. All88 symlink targets and Git statuses are unchanged. Full baseline/after manifests have no exclusions. Only new artifacts were created under docs/multi-scan/stage11-b/public-order-token-preview/. No source patch was applied.

- Frontend:85,533 existing files,75 unchanged symlink targets.
- Main backend:7,215 existing files,5 unchanged symlink targets.
- AI backend:14,292 existing files,8 unchanged symlink targets.

Current routes/order.js remains `cab1f734e9b34b2585d3f8777b42325ba934412a7d6a639925dad61b796664bd`.
Existing recovery router routes/user.js remains `a8c092ffc22484b7d5cfd0b876ac160a04a2343d12bedea0d39a56a198216ddd`.
Scanner routes/multi-scan.js remains `469c88c14c7472b59aa145e74c785d8ec85adbd1540a8be3fcffd0f98cd99836`.
A.1 tests/multi-scan/stage2.test.js remains `a7ff4edd000f7882b9d27e4b3c7e709904a5063f0ddf7dbdadd1ff56465ebe4a`.

All inspected source pins were independently rehashed after tests. Scanner flags are absent/not enabled in inherited process and inspected main environment files; configuration bytes unchanged. Scanner remains disabled by default. Existing Batch A synthetic fixture configuration does not activate the application scanner.

Final documentation/flag/inventory artifacts written after AFTER are new files scoped to this review folder. INVENTORY.json hashes the final artifacts except itself. No deployment, production DB/Redis, live credential/provider/cart operation or destructive test occurred.
