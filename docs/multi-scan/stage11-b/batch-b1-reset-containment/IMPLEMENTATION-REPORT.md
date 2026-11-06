# Option A containment implementation results

Completed in development only. The exact approved OPTION-A.diff passed clean-apply verification and was applied to routes/user.js. No further security implementation, deployment, live database operation, production credential rotation, feature activation, cart operation or Batch B.2 work was performed.

## Applied behavior and scope

PUT /gratis/reset-password/:userid and PUT /gratis/forgot-password now each bind only this terminal callback:

```js
(_req, res) => res.status(503).json({ err: "Password recovery is temporarily unavailable." })
```

The reset route's entire old authCheck/adminGratisCheck/resetPassword chain was replaced, so even absent, forged or expired JWTs cannot invoke that old guard or password-changing handler through this route. The forgot handler is likewise unbound. Neither callback reads the request, queries accounts, changes passwords, generates a proof/secret or reveals whether an account exists. Both workflows, including legitimate staff resets, are unavailable. Original controller functions/imports remain unchanged. See APPLIED.diff for the exact applied change.

Both routes were verified against the original source and approved diff before modification. Original CRLF bytes were preserved. Only these two of twenty user registrations changed; all other eighteen bindings and all remaining source bytes reconstruct the original exactly. Normal login source files, authentication modules, models, controllers and authenticated change-password registration/controller are unchanged.

## SHA-256

| File/state | SHA-256 |
| --- | --- |
| routes/user.js original / rollback bytes | `0dd77b60b993926406bfdc2ebeee92dff90966e92a3c955785313df95460516e` |
| routes/user.js applied | `a8c092ffc22484b7d5cfd0b876ac160a04a2343d12bedea0d39a56a198216ddd` |
| routes/multi-scan.js unchanged approved Batch A | `469c88c14c7472b59aa145e74c785d8ec85adbd1540a8be3fcffd0f98cd99836` |
| tests/multi-scan/stage2.test.js unchanged A.1 | `a7ff4edd000f7882b9d27e4b3c7e709904a5063f0ddf7dbdadd1ff56465ebe4a` |

## Validation results

| Check | Result | Evidence |
| --- | --- | --- |
| Twelve planned containment scenarios | 12 passed; 0 failed/skipped/cancelled | CONTAINMENT-DIRECT.tap; new tests/multi-scan/stage11/recovery-containment.test.js |
| Batch A security | 28 passed; 0 failed/skipped/cancelled | batch-a-security/SECURITY.tap |
| Historical suite | 428 passed; no new failures or skips | historical/summary.json and nested TAP/Jest logs |
| Stage 2 route inventory (included in 428) | 31 passed; 0 failed/skipped | historical/stages2-9/stages2-6/stage2.tap |
| Relevant syntax | 9 passed | SYNTAX.json |
| Absent/false/malformed session flags | Seven independent probes returned 503 DISABLED | batch-a-security/FLAG-RESULTS.json |
| Existing scanner default gate | Batch A test 24 passed; main false/session gate behavior passed | batch-a-security/SECURITY.tap |
| Development feature configuration | Neither scanner flag present in .env or inherited process; no configuration edits | FEATURE-CONFIG.json |

Total distinct functional tests: 468 (12 + 28 + 428); Stage 2 is a subset, not additional. Scanner remains disabled by default. Explicit enabling in the existing Batch A runner occurs solely in an isolated synthetic child-process fixture, never in application configuration.

The twelve cases cover forgot/reset denial, complete bound chains excluding original guards/handlers, no request/model/proof access, forged and expired tokens, cashier and cross-store attempts, unchanged normal login with successful/wrong-password fake fixtures, unchanged other bindings and old-password proof success/failure fixtures, uniform account-existence responses, and protected scanner pins. An owned Express router verifies mounted-prefix/trailing-slash behavior with in-memory HTTP streams and the exact source-extracted terminal callbacks.

Tests never import the legacy application router/controllers/models normally, start a listening server, mutate require caches or use live Mongo/Redis. Callback evaluation uses an empty VM context and exact full-binding checks plus byte restoration. Login/change-password fixtures use extracted unchanged functions with explicitly owned fake dependencies. App login is hash/binding checked, not end-to-end executed. These checks establish this patch's scope and isolated behavior; they do not certify full production startup, proxy/ingress behavior, every legacy flow or overall application security. Existing global JSON parser/CORS can reject before these handlers; 503 applies to valid parsed requests reaching the matched PUT routes.

## Integrity and modified files

BASELINE.json.gz captured 106,960 preexisting regular files across all three projects with zero read errors. AFTER.json.gz plus strict allowlist verification in INTEGRITY.json confirms:

- Sole changed existing file: main backend routes/user.js.
- No preexisting files missing; all other preexisting file hashes unchanged, including frontend and AI projects.
- All 88 symlink targets unchanged (frontend 75, main 5, AI 8).
- Sole Git status delta: ` M routes/user.js` in main backend. Other project statuses unchanged.
- Protected scanner router/test pins unchanged.

The generic verifier exits 1 because it detects any changed existing file; this expected result was inspected and accepted only after asserting the exact one-file allowlist, no missing files, identical complete symlink maps and the intended Git delta. New files are solely the new containment test and documentation/results/rollback artifacts in this directory. REPRODUCE.md and the final audit/report/inventory artifacts were written after the full scan and are explicitly listed in INVENTORY.json. No protected-source edits occurred after that scan.

## Rollback and remaining blockers

USER-ROUTES-ORIGINAL.txt was preserved before applying the patch, with the original hash above. ROLLBACK.md contains a hash-guarded byte restoration procedure; it was not executed. Restoring it would re-enable the vulnerable recovery bindings and needs a separate operational decision.

REMAINING-RISKS.md documents unresolved generic profile, customer, app and import credential writes, weak decode-only legacy authentication, MD5/digest-login, authority-field mass assignment and missing reliable credential/session revocation semantics. Option A does not resolve these writers or prove the application is safe overall. Secure replacement, schema/migration/session safeguards, trusted scanner authorization data/adapters and further integration prerequisites remain unresolved. No additional hardening was applied.

Stopped after implementing and validating this containment. No deployment or scanner activation.
