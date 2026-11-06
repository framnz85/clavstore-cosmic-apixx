# Isolated validation reproduction

Run from main backend; use new unique output directories where runners refuse overwrite.

```bash
NODE_ENV=test MULTI_SCAN_ENABLED=false MULTI_SCAN_SESSION_ENABLED=false node tests/multi-scan/stage11/public-order-containment.test.js
NODE_ENV=test MULTI_SCAN_ENABLED=false MULTI_SCAN_SESSION_ENABLED=false node tests/multi-scan/stage11/recovery-containment.test.js
python3 tests/multi-scan/stage11/run-auth-session.py /tmp/clavstore-order-security-UNIQUE
NODE_ENV=test MULTI_SCAN_ENABLED=false MULTI_SCAN_SESSION_ENABLED=false ORT_DISABLE_TELEMETRY=1 python3 scripts/multi-scan/stage10/run-tests.py /tmp/clavstore-order-historical-UNIQUE
node --check routes/order.js
node --check tests/multi-scan/stage11/public-order-containment.test.js
```

The new9 tests read the actual changed complete binding, verify exact expected callback and full byte restoration, evaluate only the terminal function in an owned context, and mount it on an owned Express router using in-memory HTTP streams. All21 other route bindings must match the original. Tripwire fixtures record zero old controller/signing/model/cache calls; a throwing request proxy verifies the callback reads no account/selector data. No application router/controllers/models/bootstrap are normally imported, no global module-cache mutation, no listening port or live DB/Redis/provider/cart operation. Existing pure scanner configuration helpers are loaded safely; existing scanner runner uses synthetic keys and flags in independent child processes, not application activation.

This is source-bound isolated validation of the applied change plus unchanged-source regression tests. It does not certify production startup, external ingress/mobile behavior or the security of unchanged legacy authentication. The503 contract applies to valid reached matched handlers; earlier global CORS/parser responses remain. Express implicit HEAD uses the GET status and no response body. No full server or live account was used.
