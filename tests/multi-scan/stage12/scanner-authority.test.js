'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const {createScannerAuthority} = require('../../../services/multi-scan/stage12/scanner-authority');
const {requireCatalogProvider, requireReleaseProvider} = require('../../../services/multi-scan/stage12/provider-contracts');
const {Catalog, ImagePolicy} = require('../../../services/multi-scan/stage7/catalog');
const storeId = '1'.repeat(24), packageId = '2'.repeat(24), userId = '3'.repeat(24), other = '4'.repeat(24);
// Fixed synthetic test-only secret; never a configured application provider.
const config = {enabled:true, key:'b4-scanner-unit-test-only-key-123456789',
  issuer:'cosmic-clavstore-scanner', audience:'clavstore-multiscan-review', ttl:900};
function fixture() {
  let now = 1800000000;
  const events = [];
  const state = {user:{_id:userId, email:'cashier@example.test', role:'cashier', estoreid:storeId,
    estoreids:[other], resellid:packageId, wholesale:false},
  store:{_id:storeId, resellid:packageId, status:'active', accessibility:{cashier:['orders'],moderator:['orders']}},
  owner:{_id:packageId, status:'active', reseller:{status:true}}};
  const repository = {
    async usersByEmail(email, store, options) {events.push(['users', email, store, options]); return [state.user];},
    async store(store, options) {events.push(['store', store, options]); return state.store;},
    async packageOwner(id, options) {events.push(['owner', id, options]); return state.owner;}
  };
  const create = () => createScannerAuthority({sessionConfig:config, repository, clock:() => now});
  const token = (changes = {}, options = {}) => {
    const claims={sub:userId, email:state.user.email, storeId, packageId, iss:config.issuer,
      aud:config.audience, iat:now, exp:now+900, ...changes};
    for(const key of Object.keys(claims)) if(claims[key]===undefined) delete claims[key];
    return jwt.sign(claims, config.key, {...options,
      ...(Object.hasOwn(changes,'iat') && changes.iat===undefined ? {noTimestamp:true} : {})});
  };
  const input = changes => ({token:token(), requestedStoreId:storeId, requestedPackageId:packageId, ...changes});
  return {state, events, repository, create, token, input, advance:seconds => {now += seconds;}};
}
async function denied(operation, code, status) {
  await assert.rejects(async () => operation(), error => error.code === code && error.status === status);
}
test('missing configuration fails closed without reading environment or discovering sources', () => {
  assert.throws(() => createScannerAuthority(), {code:'AUTH_UNCONFIGURED', status:503});
});
for (const change of [{enabled:false}, {key:'short'}, {issuer:'legacy'}, {audience:'legacy'}, {ttl:3600}]) {
  test(`invalid dedicated configuration rejected: ${Object.keys(change)[0]}`, () => {
    assert.throws(() => createScannerAuthority({sessionConfig:{...config,...change}}), error => error.status === 503);
  });
}
for (const repository of [undefined, {}, {usersByEmail:async () => []}]) {
  test('missing membership provider fails at construction', () => {
    assert.throws(() => createScannerAuthority({sessionConfig:config, repository}), {code:'PROVIDER_UNAVAILABLE',status:503});
  });
}
test('authorized grant uses current role and same Security instance works with Catalog', async () => {
  const f = fixture(), authority = f.create();
  const grant = await authority.authenticate(f.input({token:f.token({role:'admin',wholesale:true})}));
  assert.equal(grant.role,'cashier'); assert.equal(grant.wholesale,false); assert.ok(Object.isFrozen(grant));
  assert.equal((await authority.revalidate(grant)).userId,userId);
  const catalog = new Catalog({security:authority.security, repository:{
    products:async (store, ids) => {assert.equal(store,storeId);assert.deepEqual(ids,[other]);return [];},
    brands:async () => []}, imagePolicy:new ImagePolicy(['https://cdn.example.test/scanner/'])});
  assert.deepEqual((await catalog.current(grant,[other])).rows,[]);
  assert.equal(grant.packageId,packageId);
});
for (const [label,change] of [['expired',{exp:1799999999}], ['no expiry',{exp:undefined}],
  ['no issued-at',{iat:undefined}], ['overlong',{exp:1800000901}], ['future',{iat:1800000010}],
  ['wrong issuer',{iss:'legacy'}], ['wrong audience',{aud:'legacy'}], ['array audience',{aud:[config.audience,'legacy']}],
  ['no subject',{sub:undefined}], ['no store',{storeId:undefined}], ['no package',{packageId:undefined}],
  ['malformed subject',{sub:'bad'}], ['noncanonical store',{storeId:'A'.repeat(24)}]]) {
  test(`${label} token rejected before membership lookup`, async () => {
    const f=fixture(), authority=f.create();
    await assert.rejects(authority.authenticate(f.input({token:f.token(change)})), error => error.status === 401);
    assert.equal(f.events.length,0);
  });
}
test('forged signature, unsigned token and wrong algorithm rejected', async () => {
  const f=fixture(), a=f.create(), claims=jwt.decode(f.token());
  for (const token of [jwt.sign(claims,'forged-test-only-key'), jwt.sign(claims,'',{algorithm:'none'}), f.token({}, {algorithm:'HS512'})]) {
    await denied(() => a.authenticate(f.input({token})), 'INVALID_TOKEN',401);
  }
  assert.equal(f.events.length,0);
});
test('cross-store substitution denied even with membership in both stores', async () => {
  const f=fixture(), a=f.create();
  await denied(() => a.authenticate(f.input({requestedStoreId:other})), 'STORE_FORBIDDEN',403);
  assert.equal(f.events.length,0);
});
test('cross-package substitution denied before repository access', async () => {
  const f=fixture(); await denied(() => f.create().authenticate(f.input({requestedPackageId:other})), 'STORE_FORBIDDEN',403);
  assert.equal(f.events.length,0);
});
test('optional package constraint derives authority only from signed scope and trusted rows', async () => {
  const f=fixture(); const g=await f.create().authenticate(f.input({requestedPackageId:undefined}));
  assert.equal(g.packageId,packageId);
});
test('exposed Security also enforces signed-store binding', async () => {
  const f=fixture(); await denied(() => f.create().security.authenticate({token:f.token(),storeId:other}), 'STORE_FORBIDDEN',403);
  assert.equal(f.events.length,0);
});
for (const [label,extra] of [['unknown index release',{releaseId:'unknown'}], ['invented scan provenance',{provenance:{scanId:other}}],
  ['scan identifier',{scanId:'00000000-0000-4000-8000-000000000001'}], ['client role',{role:'admin'}], ['duplicate scope alias',{storeId:other}]]) {
  test(`${label} is not accepted by the authority request contract`, async () => {
    const f=fixture(), a=f.create();
    // Repeated identifiers remain invalid input, not a substitute for the future registry.
    for(let i=0;i<2;i++) await denied(() => a.authenticate(f.input(extra)), 'INVALID_REQUEST',400);
    assert.equal(f.events.length,0);
  });
}
for (const [method,value] of [['usersByEmail',null], ['usersByEmail',{}], ['usersByEmail',[null]],
  ['usersByEmail',[{_id:'bad'}]], ['store',[]], ['packageOwner',{_id:packageId,status:1}]]) {
  test(`invalid ${method} output fails closed`, async () => {
    const f=fixture();f.repository[method]=async () => value;
    await denied(() => f.create().authenticate(f.input()), 'PROVIDER_INVALID',503);
  });
}
test('provider failure is sanitized and never discloses database/account details', async () => {
  const f=fixture();f.repository.usersByEmail=async () => {throw Error('private account data');};
  await assert.rejects(f.create().authenticate(f.input()), error => error.status===503 && !error.message.includes('private'));
});
for (const mutate of [s => {s.user.role='customer';}, s => {s.user.estoreid=other;s.user.estoreids=[];},
  s => {s.store.status='paused';}, s => {s.owner.reseller.status=false;}, s => {s.store.accessibility.cashier=[];},
  s => {s.user.deleteAccount={request:true};}, s => {s.user.resellid=other;}]) {
  test('current trusted membership/role/store/package denial cannot be bypassed', async () => {
    const f=fixture();mutate(f.state);
    await assert.rejects(f.create().authenticate(f.input()), error => error.status===403);
  });
}
test('empty or ambiguous user results deny instead of choosing an account', async () => {
  for(const count of [0,2]) {const f=fixture();f.repository.usersByEmail=async () => Array(count).fill(f.state.user);
    await denied(() => f.create().authenticate(f.input()), 'STORE_FORBIDDEN',403);}
});
test('subject must equal trusted repository identity', async () => {
  const f=fixture();await denied(() => f.create().authenticate(f.input({token:f.token({sub:other})})), 'IDENTITY_MISMATCH',401);
});
test('cloned, foreign-instance and browser-fabricated grants are rejected', async () => {
  const f=fixture(),a=f.create(),g=await a.authenticate(f.input());
  for(const candidate of [{...g}, JSON.parse(JSON.stringify(g)), {}, null]) {
    await denied(() => a.revalidate(candidate), 'INVALID_SESSION',401);
  }
  await denied(() => f.create().revalidate(g), 'INVALID_SESSION',401);
});
test('role and wholesale changes invalidate previously authorized grants', async () => {
  for(const change of [{role:'moderator'}, {wholesale:true}]) {
    const f=fixture(),a=f.create(),g=await a.authenticate(f.input());Object.assign(f.state.user,change);
    await denied(() => a.revalidate(g), 'SESSION_CHANGED',403);
  }
});
test('expired grant rejected before lookup', async () => {
  const f=fixture(),a=f.create(),g=await a.authenticate(f.input());f.advance(901);f.events.length=0;
  await denied(() => a.revalidate(g), 'INVALID_SESSION',401);assert.equal(f.events.length,0);
});
test('expiry during authenticate await rejects', async () => {
  const f=fixture();f.repository.packageOwner=async () => {f.advance(901);return f.state.owner;};
  await denied(() => f.create().authenticate(f.input()), 'INVALID_TOKEN',401);
});
test('expiry during revalidate await rejects, including calls through exposed Security', async () => {
  const f=fixture();let expire=false;
  f.repository.packageOwner=async () => {if(expire)f.advance(901);return f.state.owner;};
  const a=f.create(),g=await a.authenticate(f.input());expire=true;
  await denied(() => a.security.revalidate(g), 'INVALID_SESSION',401);
});
test('aborted requests cannot reach providers', async () => {
  const f=fixture(),controller=new AbortController();controller.abort();
  await denied(() => f.create().authenticate(f.input({signal:controller.signal})), 'ABORTED',499);
  assert.equal(f.events.length,0);
});
test('invalid clock fails closed', async () => {
  const f=fixture(),a=createScannerAuthority({sessionConfig:config,repository:f.repository,clock:()=>NaN});
  await denied(() => a.authenticate(f.input()), 'AUTH_UNCONFIGURED',503);
});
test('missing authoritative catalog interface cannot satisfy the future composition contract', () => {
  for(const provider of [undefined,{}, {current:async () => ({price:1})}]) {
    assert.throws(() => requireCatalogProvider(provider), {code:'PROVIDER_UNAVAILABLE',status:503});
  }
});
test('missing release interface cannot select even a client-named unknown release', () => {
  assert.throws(() => requireReleaseProvider({releaseId:'unknown'}), {code:'PROVIDER_UNAVAILABLE',status:503});
});
test('provider interfaces only validate methods and never invoke providers or approve output', () => {
  const forbidden=()=>{throw Error('must not invoke');};
  const catalog={current:forbidden,metadata:forbidden},release={resolve:forbidden,assertActive:forbidden};
  assert.equal(requireCatalogProvider(catalog),catalog); assert.equal(requireReleaseProvider(release),release);
});

for(const bad of [{wholesale:'true'}, {deleteAccount:'inactive'}, {deleteAccount:{request:'true'}}, {estoreid:0}]) {
  test('malformed security-relevant membership fields fail closed', async () => {
    const f=fixture();Object.assign(f.state.user,bad);
    await denied(() => f.create().authenticate(f.input()), 'PROVIDER_INVALID',503);
  });
}
test('provider implementations are captured and cannot be replaced after construction', async () => {
  const f=fixture(),a=f.create();f.repository.usersByEmail=async () => {throw Error('replacement');};
  assert.equal((await a.authenticate(f.input())).role,'cashier');
});
test('cancellation during provider await fails closed', async () => {
  const f=fixture(),controller=new AbortController();
  f.repository.packageOwner=async () => {controller.abort();return f.state.owner;};
  await denied(() => f.create().authenticate(f.input({signal:controller.signal})), 'ABORTED',499);
});
