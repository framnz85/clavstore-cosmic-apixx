# Proposed trusted adapter — documentation only, integration BLOCKED

New proposed main API path: `services/multi-scan/stage11/trusted-sources.js` (currently absent). Complete exact candidate source follows; NEW-ADAPTER.diff is its standard unapplied new-file diff. This is an inert proposal, not a production provider or accepting placeholder. No existing implementation/interface needs changing merely to supply fixture data through the already declared getSessionSources parameter.

The provider returns read-only User/Estore query facades matching precisely the find/select/sort/limit/maxTimeMS/lean/exec subset used by the unchanged Batch A CredentialRepository. createTrustedRepository is a convenience returning that original repository with the same provePassword/usersByEmail/store/packageOwner methods; it adds no parallel JWT verifier. All current tenant/role/ownership checks stay in unchanged SessionService/Stage7 Security. The facade never replaces model methods/prototypes or mutates exports and exposes no writes.

getHandles is a **required trusted server composition callback**, never browser input. It must return existing {User,Estore,connection}, with exact model identity on the same already-connected Gratis connection; there is no automatic model import, new connection, collection naming guess, default DB fallback or connection-registry search. Identity decisions come from a **required, currently unidentified authoritative provider**. Missing either function or model/connection state returns503. No production implementation of either callback is supplied or claimed possible within current verified information.

identityStatus receives {userId,notBefore} and must return {userId,state,observedAt}. These are proposed provider-interface DTO fields, NOT existing DB fields, claims or a new collection. State is active/disabled/revoked; observedAt is integer Unix milliseconds no older than this specific request and not in the future. It must perform a current, bounded, read-only authoritative lookup, not echo inputs, derive active from absent fields, relabel cached decisions as fresh or return constant active. Unknown/malformed/stale/wrong-identity decisions fail503. Known disabled/revoked rows are excluded (credential stage generic401; later authority reread403). Existing deleteAccount.request=true is excluded directly as additional denial, not used as a complete enabled-status source.

Unchanged Stage7 checks active store, primary/secondary membership, matching user/store resellid, active reseller parent and trusted staff role/orders permission. Any matching browser-supplied id remains a selector only. Fresh password and strict HS256/issuer/audience/expiry/sub/scope rules remain unchanged. The new provider does not repair unsafe legacy role-write boundaries: production use is BLOCKED until their integrity and identity status source are resolved.

```javascript
'use strict';
// PROPOSAL ONLY: no model/database/bootstrap imports and no inferred identity policy.
const {id} = require('../stage7/contracts');
const {fault} = require('./session-config');
const {CredentialRepository} = require('./credential-repository');
function createTrustedSourcesProvider({getHandles,identityStatus,clock = Date.now} = {}) {
  // Construction is inert; source resolution happens only when existing gated issuance calls this provider.
  return async function getSources() {
    if (typeof getHandles !== 'function' || typeof identityStatus !== 'function') throw fault(503,'UNAVAILABLE');
    const handles = await getHandles();
    const {User,Estore,connection} = handles || {};
    function ready() {
      if (!connection || connection.readyState !== 1 || !User || !Estore ||
          User.db !== connection || Estore.db !== connection ||
          User.modelName !== 'GratisUser' || Estore.modelName !== 'GratisEstore' ||
          connection.models?.GratisUser !== User || connection.models?.GratisEstore !== Estore ||
          typeof User.find !== 'function' || typeof Estore.find !== 'function') throw fault(503,'UNAVAILABLE');
    }
    ready();
    function readFacade(model,isUser) {
      return Object.freeze({find(filter) {
        ready();
        let q = model.find(filter), limit, timeout, selected = false, sorted = false, lean = false;
        if (!q || typeof q.read !== 'function') throw fault(503,'UNAVAILABLE');
        q = q.read('primary');
        const chain = {
          select(value) { selected=true;q=q.select(value);return chain; },
          sort(value) {
            if (!value || Object.keys(value).length !== 1 || value._id !== 1) throw fault(503,'UNAVAILABLE');
            sorted=true;q=q.sort(value);return chain;
          },
          limit(value) { limit=value;q=q.limit(value);return chain; },
          maxTimeMS(value) { timeout=value;q=q.maxTimeMS(value);return chain; },
          lean() { lean=true;q=q.lean();return chain; },
          async exec() {
            ready();
            if (!selected || !sorted || !lean || !Number.isSafeInteger(limit) || limit<1 || limit>2 ||
                !Number.isSafeInteger(timeout) || timeout<100 || timeout>5000) throw fault(503,'UNAVAILABLE');
            const rows = await q.exec();ready();
            if (!Array.isArray(rows) || rows.length>limit) throw fault(503,'UNAVAILABLE');
            if (!isUser) return rows;
            const allowed=[];
            for (const row of rows) {
              const userId=id(row._id);
              if (row.deleteAccount?.request === true) continue;
              const notBefore=clock();
              const decision=await identityStatus(Object.freeze({userId,notBefore}));
              const now=clock();ready();
              // These are NEW provider DTO fields, not guessed fields in existing MongoDB documents.
              if (!decision || decision.userId!==userId || !Number.isSafeInteger(decision.observedAt) ||
                  decision.observedAt<notBefore || decision.observedAt>now ||
                  !['active','disabled','revoked'].includes(decision.state)) throw fault(503,'UNAVAILABLE');
              if (decision.state==='active') allowed.push(row);
            }
            return allowed;
          }
        };
        return chain;
      }});
    }
    return Object.freeze({User:readFacade(User,true),Estore:readFacade(Estore,false)});
  };
}
async function createTrustedRepository(options) {
  // Same provePassword/usersByEmail/store/packageOwner contract as the approved Batch A repository.
  return new CredentialRepository(await createTrustedSourcesProvider(options)());
}
module.exports = {createTrustedSourcesProvider,createTrustedRepository};
```

## Composition status and exact existing-file boundary

The existing `routes/multi-scan.js` already accepts options.getSessionSources and passes it into the session endpoint. A reviewed explicit caller could supply createTrustedSourcesProvider via that declared option without any router/auth code delta. That interface compatibility is source-verified; it is NOT actual default-router wiring.

**Production composition is BLOCKED:** current server.js autoload mounts the default export without options. Supplying trusted existing model handles and a real status provider needs a reviewed startup caller/ownership boundary. The earlier Stage11-A selected batch explicitly excluded main server.js changes. Do not broaden that scope here. No existing-file unified diff is recommended or fabricated while the status/authority source and write-boundary fixes are unknown. See APPROVAL-SCOPE.md for pinned affected paths and why concrete production hunks are withheld. The only exact diff produced is the inert new adapter module proposal; no claim that applying it alone would connect production data.

## Resource/security limits

Each raw query uses primary reads, explicit <=2 limit and100–5000ms server execution budget through the existing repository. Source handles must already be connected; disconnected/mismatched handles fail503. Existing outer10-second session deadline and lease-until-settlement remain authoritative. Identity provider must have its own bounded lookup/cancellation/settlement contract before integration; this facade does not invent a DB schema, open network connections or release a lease early by racing an uncancelled lookup. Database driver selection/buffering can outlast maxTimeMS: actual settlement/deployment policy remains a blocker.

Active decisions are fetched again for each credential/current-user query; no Redis/user cache, persistent session collection or policy cache. Read-time freshness stamps cannot prove the provider itself is authoritative; review that implementation and protected role writes before allowing any live grant. Cross-document changes after a read are possible; no atomic revocation promise. Fail-closed availability can deny legitimate legacy accounts with missing data; never fill missing parent/member/role/status with defaults.

Only syntax parsing and new-file diff clean-check were performed on this candidate, without executing it. New fixture tests are specified separately for a later approved implementation. No current Batch A source or A.1 test changed.
