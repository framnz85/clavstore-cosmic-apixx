# Complete proposed authentication sources — DOCUMENTATION ONLY

No module below exists as executable code from this preview. Paths are relative to the main API. All five belong under `services/multi-scan/stage11/`. Review this file together with ROUTE-PATCH.diff; the two added router lines delegate the exact gate, validation, ordering and error contract to these specified sources. No dependency installation is needed (Node crypto, Express and existing jsonwebtoken).

**BLOCKED for activation:** the existing default router supplies no `getSessionSources`. This is an explicit trusted composition parameter returning existing `{User,Estore}` handles, never HTTP data, global mutation, a runtime patch or a production-model import. The proposed default route returns 503 when enabled without this provider. Production composition needs a separately reviewed scope; this proposal intentionally supplies no guessed live provider.

**Proposed contract requiring review:** issuer/audience, new environment variable names and scoped JWT claims below are the Stage 11-A migration proposal, not observed properties of legacy tokens. They are not provisioned. No signing key is generated, copied or disclosed. `storeId`/`packageId` are proposed JWT scope claims, NOT new database fields. Actual membership fields and active reseller relationship are reused exactly from Stage 7 and remain subject to deployment-data verification. A missing relationship denies access; it is never inferred from browser claims.

The five modules separate strict configuration/error vocabulary, bounded credential/current-record access, JWT/session authorization, HTTP contract, and pure route composition/admission. No persistent sessions or collection. This is complete candidate source, with operational blockers explicitly closed by 503 rather than insecure accepting placeholders.

## `services/multi-scan/stage11/session-config.js`

```javascript
'use strict';
const messages = Object.freeze({
  DISABLED:'Scanner sessions are disabled', UNAVAILABLE:'Scanner authentication unavailable',
  INVALID_PAYLOAD:'Invalid session request', TOO_LARGE:'Session request exceeds limit',
  INVALID_TOKEN:'Invalid or expired scanner token', INVALID_CREDENTIALS:'Authentication failed',
  DENIED:'Store access denied', RATE_LIMITED:'Too many authentication attempts',
  BUSY:'Scanner authentication busy', TIMEOUT:'Scanner authentication timed out'
});
function fault(status, code) {
  return Object.assign(new Error(messages[code]), {sessionFault:true, status, code});
}
function readSessionConfig(mainEnabled, env = process.env) {
  if (mainEnabled !== true || env.MULTI_SCAN_SESSION_ENABLED !== 'true') return {enabled:false};
  const key = env.MULTI_SCAN_SESSION_JWT_KEY;
  // These NEW configured values are the Stage 11-A proposal, not a legacy-token contract.
  if (typeof key !== 'string' || Buffer.byteLength(key) < 32 ||
      env.MULTI_SCAN_SESSION_ISSUER !== 'cosmic-clavstore-scanner' ||
      env.MULTI_SCAN_SESSION_AUDIENCE !== 'clavstore-multiscan-review') throw fault(503,'UNAVAILABLE');
  for (const [name,value] of Object.entries(env)) {
    if (name !== 'MULTI_SCAN_SESSION_JWT_KEY' && /JWT|SECRET|HMAC|TOKEN|KEY/i.test(name) && value === key)
      throw fault(503,'UNAVAILABLE');
  }
  return Object.freeze({enabled:true,key,issuer:env.MULTI_SCAN_SESSION_ISSUER,
    audience:env.MULTI_SCAN_SESSION_AUDIENCE,ttl:900});
}
module.exports = {messages,fault,readSessionConfig};
```

## `services/multi-scan/stage11/credential-repository.js`

```javascript
'use strict';
const {createHash,timingSafeEqual} = require('node:crypto');
const {projections} = require('../stage7/repository');
const {id,abort} = require('../stage7/contracts');
const {fault} = require('./session-config');
class CredentialRepository {
  constructor({User,Estore} = {}) {
    if (![User,Estore].every(model => model && typeof model.find === 'function')) throw fault(503,'UNAVAILABLE');
    Object.assign(this,{User,Estore});
  }
  async query(model,filter,projection,limit,signal) {
    abort(signal);
    const rows = await model.find(filter).select(projection).sort({_id:1})
      .limit(limit).maxTimeMS(5000).lean().exec();
    abort(signal);
    if (!Array.isArray(rows) || rows.length > limit) throw fault(503,'UNAVAILABLE');
    return rows;
  }
  async usersByEmail(email,storeId,{signal} = {}) {
    return this.query(this.User,{email,$or:[{estoreid:id(storeId)},{estoreids:id(storeId)}]},projections.user,2,signal);
  }
  async store(storeId,{signal} = {}) {
    return (await this.query(this.Estore,{_id:id(storeId)},projections.store,1,signal))[0] || null;
  }
  async packageOwner(packageId,{signal} = {}) {
    return (await this.query(this.Estore,{_id:id(packageId),'reseller.status':true,status:'active'},projections.store,1,signal))[0] || null;
  }
  async provePassword({email,password,storeId},signal) {
    const rows = await this.query(this.User,{email,$or:[{estoreid:id(storeId)},{estoreids:id(storeId)}]},
      {...projections.user,password:1},2,signal);
    const row = rows.length === 1 ? rows[0] : null;
    const digest = createHash('md5').update(password,'utf8').digest();
    // Legacy MD5 verification only; never accept a client digest as credential proof.
    const supported = row && typeof row.password === 'string' && /^[0-9a-f]{32}$/i.test(row.password);
    const stored = supported ? Buffer.from(row.password,'hex') : Buffer.alloc(16);
    const equal = timingSafeEqual(digest,stored);
    if (!row || !supported || !equal) throw fault(401,'INVALID_CREDENTIALS');
    return {userId:id(row._id),email:row.email};
  }
}
module.exports = {CredentialRepository};
```

## `services/multi-scan/stage11/session-service.js`

```javascript
'use strict';
const jwt = require('jsonwebtoken');
const {Security} = require('../stage7/security');
const {id,abort} = require('../stage7/contracts');
const {fault} = require('./session-config');
class SessionService {
  constructor({repository,config,clock = () => Math.floor(Date.now()/1000)}) {
    Object.assign(this,{repository,config,clock});
    this.security = new Security({repository,key:config.key,issuer:config.issuer,
      audience:config.audience,maxAgeSeconds:config.ttl,clock});
  }
  verify(token,input) {
    let c;
    try {
      c = this.security.verify(token);
      if (id(c.sub) !== c.sub || id(c.storeId) !== input.storeId ||
          typeof c.packageId !== 'string' || id(c.packageId) !== c.packageId ||
          c.email !== input.email || c.exp-c.iat > this.config.ttl) throw new Error();
    } catch { throw fault(401,'INVALID_TOKEN'); }
    return c;
  }
  async issue(input,bearer,signal) {
    const previous = bearer === undefined ? null : this.verify(bearer,input);
    const identity = await this.repository.provePassword(input,signal);
    const scope = await this.security.resolveTenant({email:identity.email,storeId:input.storeId,signal});
    if (scope.userId !== identity.userId || (previous &&
        (previous.sub !== scope.userId || previous.packageId !== scope.packageId))) throw fault(403,'DENIED');
    const now = this.clock();
    const token = jwt.sign({email:scope.email,storeId:scope.storeId,packageId:scope.packageId,iat:now},
      this.config.key,{algorithm:'HS256',subject:scope.userId,issuer:this.config.issuer,
        audience:this.config.audience,expiresIn:this.config.ttl});
    const grant = await this.security.authenticate({token,storeId:scope.storeId,packageHint:scope.packageId,signal});
    // Re-resolve trusted records after password proof. Never manufacture a Stage 7 grant.
    if (grant.userId !== identity.userId || grant.role !== scope.role || grant.wholesale !== scope.wholesale)
      throw fault(403,'DENIED');
    abort(signal);
    const claims = this.verify(token,input); // expiry checked again after asynchronous authorization
    return {token,tokenType:'Bearer',expiresAt:claims.exp,scope:{storeId:grant.storeId,
      packageId:grant.packageId,userId:grant.userId,role:grant.role}};
  }
}
module.exports = {SessionService};
```

## `services/multi-scan/stage11/session-handler.js`

```javascript
'use strict';
const {randomUUID} = require('node:crypto');
const {messages,fault} = require('./session-config');
function validate(req) {
  const b = req.body;
  if (!req.is('application/json') || !b || Array.isArray(b) || typeof b !== 'object') throw fault(400,'INVALID_PAYLOAD');
  if (Buffer.byteLength(JSON.stringify(b)) > 8192) throw fault(413,'TOO_LARGE');
  if (Object.keys(b).sort().join(',') !== 'email,password,storeId' ||
      typeof b.email !== 'string' || b.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email) ||
      typeof b.password !== 'string' || b.password.length === 0 || Buffer.byteLength(b.password) > 1024 ||
      typeof b.storeId !== 'string' || !/^[a-f0-9]{24}$/.test(b.storeId)) throw fault(400,'INVALID_PAYLOAD');
  // Legacy authtoken and tenant headers are not authentication for issuance.
  if (req.headers.authtoken !== undefined || req.headers.estoreid !== undefined || req.headers.resellid !== undefined)
    throw fault(400,'INVALID_PAYLOAD');
  const value = req.headers.authorization;
  if (value !== undefined && (typeof value !== 'string' || value.length > 8200 || !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)))
    throw fault(401,'INVALID_TOKEN');
  return {input:{email:b.email,password:b.password,storeId:b.storeId},bearer:value === undefined ? undefined : value.slice(7)};
}
function begin(req,res,next) {
  req.scannerSessionRequestId = randomUUID();
  res.set('Cache-Control','no-store');res.set('Pragma','no-cache');next();
}
function error(err,req,res,next) {
  if (res.headersSent) return next(err);
  let status = 503, code = 'UNAVAILABLE';
  if (err && err.sessionFault === true && Object.hasOwnProperty.call(messages,err.code)) {
    status=err.status;code=err.code;
  } else if (err && err.type === 'entity.too.large') {status=413;code='TOO_LARGE';}
  else if (err && err.type === 'entity.parse.failed') {status=400;code='INVALID_PAYLOAD';}
  else if (err && ['STORE_FORBIDDEN','PACKAGE_FORBIDDEN','ROLE_FORBIDDEN','IDENTITY_MISMATCH'].includes(err.code)) {status=403;code='DENIED';}
  if (status === 429) res.set('Retry-After','60');
  res.status(status).json({error:{code,message:messages[code]},requestId:req.scannerSessionRequestId});
}
module.exports = {validate,begin,error};
```

## `services/multi-scan/stage11/session-factory.js`

```javascript
'use strict';
const express = require('express');
const {fault,readSessionConfig} = require('./session-config');
const {CredentialRepository} = require('./credential-repository');
const {SessionService} = require('./session-service');
const {validate,begin,error} = require('./session-handler');
function createSessionEndpoint({mainEnabled,getSources} = {}) {
  // Composition is explicit. Missing production provider remains unavailable; never import DB models here.
  const attempts = new Map();
  let occupied = false;
  function gate(req,res,next) {
    try {
      const cfg = readSessionConfig(mainEnabled);
      if (!cfg.enabled) throw fault(503,'DISABLED');
      req.scannerSessionConfig = cfg;next();
    } catch (e) {next(e);}
  }
  function admit(req,res,next) {
    try {
      const now = Date.now(), peer = req.socket.remoteAddress || 'unknown';
      for (const [key,value] of attempts) if (value.until <= now) attempts.delete(key);
      if (!attempts.has(peer) && attempts.size >= 128) throw fault(429,'RATE_LIMITED');
      const entry = attempts.get(peer) || {count:0,until:now+60000};
      if (++entry.count > 5) {attempts.set(peer,entry);throw fault(429,'RATE_LIMITED');}
      attempts.set(peer,entry);next();
    } catch (e) {next(e);}
  }
  async function issue(req,res,next) {
    let acquired = false, timer, onClose;
    const controller = new AbortController();
    try {
      const {input,bearer} = validate(req);
      if (occupied) throw fault(429,'BUSY');
      if (typeof getSources !== 'function') throw fault(503,'UNAVAILABLE');
      occupied=true;acquired=true;
      onClose=()=>controller.abort();res.once('close',onClose);
      const work = Promise.resolve().then(async () => {
        const sources = await getSources();
        if (controller.signal.aborted) throw fault(504,'TIMEOUT');
        const repository = new CredentialRepository(sources);
        const service = new SessionService({repository,config:req.scannerSessionConfig});
        return service.issue(input,bearer,controller.signal);
      });
      // Preserve admission until underlying work settles, including on deadline/disconnect.
      void work.finally(()=>{occupied=false;}).catch(()=>{});
      const timeout = new Promise((resolve,reject) => {
        timer=setTimeout(()=>{controller.abort();reject(fault(504,'TIMEOUT'));},10000);
      });
      const result = await Promise.race([work,timeout]);
      if (!controller.signal.aborted && !res.destroyed)
        res.status(200).json({...result,requestId:req.scannerSessionRequestId});
    } catch (e) {
      if (!res.destroyed) next(e);
    } finally {
      clearTimeout(timer);
      if (onClose) res.removeListener('close',onClose);
      // acquired work owns occupied until settlement; do not release it on HTTP timeout.
      if (!acquired) controller.abort();
    }
  }
  return [begin,gate,admit,express.json({limit:'8kb',strict:true}),issue,error];
}
module.exports = {createSessionEndpoint};
```

## Exact ordering and limits

The new POST handler is registered before the existing prefix middleware. Its order is server UUID/no-store headers → strict main+session flag/config gate → per-socket attempt limiter → local JSON parser → exact body/header validation → single in-flight lease → trusted source handle acquisition → optional scanner JWT verification → fresh password verification → current Stage 7 user/store/reseller/permission resolution → bounded signing → Stage 7 authenticate/current resolution → final expiry/scope check → allowlisted response. Each error is handled by its route-local sanitizer; successful responses never call next or fall through to the legacy chain.

Password is mandatory even with a valid optional scanner Bearer token. Missing Authorization is deliberately allowed with fresh credentials (there is no circular requirement for a scanner token to acquire the first scanner token). A supplied bearer is strictly verified and bound to the selected scope; no token upgrade from legacy authtoken. This optional-header behavior is a proposal requiring explicit contract approval. A bearer alone cannot issue a token. Do not silently replace it with decoded legacy identity.

The main server's existing 2 MiB JSON parser runs earlier: the local 8 KiB parser cannot prevent its allocation or sanitize its earlier malformed-JSON errors. The serialized post-parse 8 KiB bound is enforceable here. **BLOCKED:** strict pre-parser body limits and uniform errors for global parser failures require separately scoped ingress/server review. Gate prevents new credential queries/local parsing when disabled, not global parsing already performed. This limitation is not concealed by the patch.

The rate limiter allows five attempts per socket peer per fixed 60-second window, caps its map at 128 peers, rejects excess with 429/Retry-After:60, and never trusts forwarded headers. There is one in-flight credential operation per router instance, no queue. Its 10-second response deadline aborts between bounded 5-second queries and keeps admission until actual settlement. A hung provider leaves admission closed. **BLOCKED:** deployment-wide rate enforcement, trusted ingress peer policy and gateway/header/read deadlines must be approved before multi-worker or public activation; this in-memory map is not a distributed limiter. Shared-proxy peers intentionally share a conservative quota.

No application logging in these modules: no password, hash, JWT, headers, DB documents, service keys or query errors. Only the response UUID/code/status can be fed to a future approved allowlist logger. Existing ingress/APM/body logging must be audited before activation. No JWT/internal key is ever returned except the new dedicated browser scanner token. Success is a constructed public DTO, not a DB or configuration serialization.

Current records are checked twice, but this does not promise an atomic revocation transaction. A token is a short-lived credential; every future protected scanner operation must re-resolve current membership and compare its signed store/package scope. Batch A does not replace Stage 2 scanner auth or make its old prefix accept this dedicated token. Consumer integration and strong scope checks belong to separately approved Batch B.
