# Validation commands

Run from the main backend root. Use fresh output-directory names for runners (they refuse overwrites).

```bash
NODE_ENV=test MULTI_SCAN_ENABLED=false MULTI_SCAN_SESSION_ENABLED=false node tests/multi-scan/stage11/recovery-containment.test.js
python3 tests/multi-scan/stage11/run-auth-session.py /tmp/clavstore-containment-security-UNIQUE
NODE_ENV=test MULTI_SCAN_ENABLED=false MULTI_SCAN_SESSION_ENABLED=false ORT_DISABLE_TELEMETRY=1 python3 scripts/multi-scan/stage10/run-tests.py /tmp/clavstore-containment-historical-UNIQUE
node --check routes/user.js
node --check tests/multi-scan/stage11/recovery-containment.test.js
```

The full historical runner includes Stage 2 (31 tests). The security runner generates its own synthetic child-process key/configuration and never changes .env. Direct node invocation is used for the twelve node:test scenarios so each is individually visible in TAP. An initial node --test invocation reported one passing file wrapper; CONTAINMENT-DIRECT.tap is the authoritative twelve-scenario record.

The harness reads the actual complete router registration arguments with a constrained reader, checks the exact terminal callback, and compares all other source bytes to the original rollback artifact. It evaluates only the extracted callbacks in an empty owned VM context and mounts those callbacks on an owned Express router with in-memory HTTP streams. No app bootstrap, controller import, require-cache mutation, listening server or live DB is used. Normal login and old-password fixtures evaluate unchanged source functions with explicit fake dependencies; app login is source/hash-checked only. This does not certify production startup, ingress behavior, all legacy login flows, or broader application security.
