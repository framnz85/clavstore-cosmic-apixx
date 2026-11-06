# Recommended scope and blockers — no existing-file patch is apply-ready

**Do not implement production wiring on the current evidence.** The exact new-file candidate is [NEW-ADAPTER-v2.diff](NEW-ADAPTER-v2.diff); [TRUSTED-ADAPTER-v2.md](TRUSTED-ADAPTER-v2.md) is authoritative. Earlier adapter draft documents remain as superseded review history and must not be implemented. Source-evidence hashes for existing files remain valid; the final proposed adapter hash is ADAPTER-v2-VALIDATION.json.

## Existing file inventory

| Absolute path | Current SHA256 | Integration assessment |
|---|---|---|
| /mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/routes/multi-scan.js | 469c88c14c7472b59aa145e74c785d8ec85adbd1540a8be3fcffd0f98cd99836 | No change needed for explicit callers: existing getSessionSources option already reaches Batch A. Default export is uncomposed and remains fail closed |
| /mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/server.js | bcb24bb081ad79884a4f71d806d2ce7150c4d5d1d30a078d763211aed7123d51 | Default-export autoload lacks provider composition. Production integration likely needs a separately reviewed explicit startup mount/caller; Stage11-A excluded this main-server delta. BLOCKED: concrete trusted source/status ownership unknown |
| /mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/services/multi-scan/stage11/session-factory.js | 4da44715ffbf65683baa0011c5cbc2a4eeb0171f5e924dadec7c8811e051d13e | No candidate change: its getSources -> new CredentialRepository contract accepts proposed read facades. No Batch A constructor/interface/JWT edits |
| /mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/tests/multi-scan/stage2.test.js | a7ff4edd000f7882b9d27e4b3c7e709904a5063f0ddf7dbdadd1ff56465ebe4a | No change: route inventory stays six, no new route proposed |
| /mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/routes/user.js | 0dd77b60b993926406bfdc2ebeee92dff90966e92a3c955785313df95460516e | Separate protected-writer review needed for unauthenticated creation and decode-guarded updates; no B.1 remediation hunk guessed |
| /mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/controllers/user.js | 2a09aff9e6dc78e5d5365e71ce9f973865d0cb17e3bf6202027a2660f6b6bcb6 | Separate identity/role/membership field-allowlist review; broad body updates/role assignment cannot establish trusted authority |
| /mnt/g/clavstore/clavstore-api/clavstore-cosmic-api/middlewares/auth.js | be118b88031b759c5ef555dfc3492cede26e8d569691279c66296ef3de01cbb8 | Separate cryptographic legacy authentication/purpose/tenant remediation review; do not treat decode as trusted |

No existing file is proposed for modification in an apply-ready B.1 patch. An exact production unified diff cannot be justified without an authoritative enabled/revoked status source, protected role/membership writers and reviewed startup handle ownership. The instruction to document blockers instead of expanding scope applies here: no invented server/auth/controller hunks or role/database schema are supplied. This is a deliberate blocked existing-file proposal, not omitted hidden integration changes. NEW-ADAPTER-v2.diff is complete and clean-checkable but applying the new file alone would not connect the default route or resolve these blockers.

## Minimum next approval

1. Approve a focused review/policy decision for identity enablement/revocation and integrity of staff role/membership writers (source paths above), identifying authoritative data and exact current-record semantics. Actual live/fixture DB inspection, if wanted, requires separately explicit access; no access implied here.
2. Once those sources are concrete, approve the new adapter module and new isolated fixture tests ONLY after their exact source/diff review; preserve all Batch A/A.1 interfaces and strict JWT rules. Current v2 is a candidate for that review, not permission.
3. Submit a separate exact startup-composition patch (possibly main server.js) using already-owned Gratis handles and the approved status provider, default-disabled. Capture per-file hashes/diffs, import behavior, bounded source lifecycle and rollback; never infer connection from browser ids or scan registry by name.
4. Activation/keys/ingress/parser/logging/distributed limits, scoped scanner consumers and frontend are separate approval scopes. No Batch B.2 authorization is inferred.

## Blocking gates

- No source-verified dedicated user-enabled/revoked registry; do not equate absent deletion request with active.
- Authenticated role/membership writer integrity not established by current legacy routes/guards. Persisted admin role alone is insufficient for live promotion.
- Stage7 packageId is reseller namespace; paid billing entitlement would require a separate explicit policy/source, not models/package inferred ownership.
- Exact trusted startup connection/provider is not composed; importing models/bootstrap as a shortcut can open connections and log URI templates. No default mongoose connection or per-tenant DB guessing.
- Identity provider freshness, resource bounds/cancellation and current-data provenance need concrete implementation. Primary reads plus time stamps do not guarantee transactional revocation or authentic protected writes.
- Dedicated key provisioning, parser/ingress errors/limits, logging/redaction and multi-worker rate policy remain blocked; existing legacy JWTs cannot supply scanner proof.

Required existing-file implementation tests/rollback, once exact future hunks exist: default-disabled and enabled-fixture import tests, no new connection, trusted same-connection/model identity, all19 cases plus existing28/428/31, full SHA/symlink allowlist; unique byte archive of each specifically approved file, restore only that file to its pinned pre-edit hash, preserve other batches. No rollback is executed now. See REGRESSION-ROLLBACK.md for this inert candidate.
