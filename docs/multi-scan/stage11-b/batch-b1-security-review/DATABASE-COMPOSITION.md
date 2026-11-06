# Trusted database composition — concrete dependency design, not wired

## Actual contracts

Main dbconnect/gratis.js creates a connection at import from GRATIS_DATABASE, logs URI/raw errors and exports the conn variable. No await-ready or explicit shutdown/event lifecycle was found in the inspected bootstrap/server. Catch covers synchronous creation failure; async readiness is not established merely by export/log. Models/user.js and models/estore.js import this module and register GratisUser/GratisEstore. CommonJS caching normally shares this module-created handle, but an import may be its first initialization. Do not load models to inspect them during a preview or from disabled scanner code.

Main server.js loads dotenv, global JSON/CORS, then synchronously autoloads all route exports, then starts Redis and listen. Many route controllers import models before listen; the scanner default export is mounted without getSessionSources. Reusing the default mongoose.connection is wrong for these createConnection models. SuperEstore uses dbconnect/super and the same model name on a different connection; models/app variants duplicate names on Gratis but canonical app controllers import the main models. Never discover trusted DB ownership by model name alone or scan all mongoose connections looking for a matching name.

## Proposed composition responsibilities

1. The existing application startup owner remains sole owner of its existing Gratis connection. An explicitly reviewed startup refactor obtains that already-owned handle plus canonical User/Estore and the separately approved policy model. It does not create a second connection or let a scanner request import dbconnect as a fallback. The owner must attest that these models belong to that exact registered connection, not a client-selected DB.
2. A NEW pure composition factory receives `{connection,User,Estore,AuthorizationPolicy}` and identity/grant/clock/lifecycle dependencies. No top-level model/DB/server imports, process-global mutation, require-cache manipulation or singleton auto-mount. Constructing an inert provider must not require ready DB or alter legacy startup when scanner flags are false.
3. Existing main router.createRouter({getSessionSources}) is a verified public entry. A future exact startup mount must call that explicit factory once rather than mount both default and composed routers. Disabled gate must run before obtaining sources. No route/auth modifications are made here; main server startup delta is separate explicit approval, not inherited Stage11-A scope.
4. GetSources receives no HTTP tenant/database selector. When actually invoked after flags/config gate, assert connection.readyState===1, User.db/Estore.db/policy.db are identical to supplied connection, and its model registry contains those exact handles. Registry checks validate supplied ownership; do not use them to search for any convenient connection. Missing/disconnected/wrong handles503 with sanitized code; never create/reconnect/select another DB as a scanner fallback.
5. Query only canonical current User/Estore and independent policy by verified identity id and typed selected scope, with strict projections, bounded results, primary reads and maxTimeMS <=5000. No User.showPass, cached Redis user DTO, billing plan or URI in public responses/logs. Primary reads do not establish atomic multi-document snapshots; epoch/final recheck and mutation protocol are separate lifecycle requirements.
6. The application owner handles ready/error/disconnect/reconnect and shutdown. Scanner admission closes on loss of authoritative readiness; existing lease stays owned until underlying work settles. Scanner does not close a shared application connection on timeout/disable. Driver selection/buffering timeouts and actual cancellation settlement must be bounded/tested separately; maxTimeMS alone is not a total wall-clock deadline.
7. Register/migrate the NEW policy collection only under separate schema/index approval at controlled startup/migration time. No automatic index build, policy creation/enrollment or database connection on first scan request. Optional disabled scanner initialization must not block legacy POS bootstrap; enabled scanner cannot fail open if policy readiness is missing.

## Source-level composition sketch — proposed interfaces, not existing exports

```javascript
// Called by an explicitly approved application composition owner, after ownership is established.
// Inputs already exist as trusted handles; no require(models), connect(), environment URL or HTTP selector here.
const deps = { connection, User, Estore, AuthorizationPolicy };
const authorization = createScopedCurrentAuthorization(deps); // NEW contract, implementation blocked pending policy approval
const getSessionSources = createSessionSources(deps, authorization); // NEW contract, not the current status-only v2
const router = mainRouter.createRouter({ getSessionSources }); // existing verified public router interface
// Exact single mounting/startup lifecycle hunk requires separately approved server composition.
```

The sketch is deliberately not claimed executable or ready to paste: scoped grant/version information must reach issuance and subsequent consumers, which current Batch A getSources/status-only facade does not fully provide. Enumerate the necessary explicit interface changes before preparing that integration patch. Do not manufacture default-active callbacks or mutate frozen Stage7 grants to fit current interfaces.

## Exact remediation currently supported

02-CONNECTION-LOG-REDACTION.diff removes known URI/raw error interpolation only. It does not change connection creation, async readiness, shutdown or source wiring. PATCH-MANIFEST.json pins current bytes/CRLF and candidate result. A broader initialization/lifecycle refactor needs new pure bootstrap fixtures and exact ownership/deployment decisions; do not silently alter dbconnect or server. No live database or Redis connection was made during review.
