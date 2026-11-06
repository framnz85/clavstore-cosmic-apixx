'use strict';
// Synthetic credentials/configuration exist only in a separate test process.
const crypto = require('node:crypto');
const worker = process.argv.includes('--fixture-worker');
const probe = process.argv.includes('--flag-probe');
if (!worker && !probe) {
  process.stderr.write('Use python3 tests/multi-scan/stage11/run-auth-session.py <new-output-directory> for isolated fixture configuration.\n');
  process.exit(2);
}
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {Duplex} = require('node:stream');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const jwt = require('jsonwebtoken');
const {createSessionEndpoint} = require('../../../services/multi-scan/stage11/session-factory');
const {readSessionConfig,messages} = require('../../../services/multi-scan/stage11/session-config');
const {CredentialRepository} = require('../../../services/multi-scan/stage11/credential-repository');
const {SessionService} = require('../../../services/multi-scan/stage11/session-service');
const prefix='/ai/multi-scan/session';
const storeId='1'.repeat(24),packageId='2'.repeat(24),userId='3'.repeat(24),foreign='4'.repeat(24);
const email='scanner-fixture@example.test',password='synthetic-password-for-tests-only';
const clone = x => JSON.parse(JSON.stringify(x));
const payload = changes => ({email,password,storeId,...changes});
function fixture() {
  const state={users:[{_id:userId,email,password:crypto.createHash('md5').update(password).digest('hex'),
    role:'cashier',estoreid:storeId,estoreids:[],resellid:packageId,wholesale:false,
    deleteAccount:{request:false},showPass:'NEVER-EXPOSE-SHOWPASS'}],stores:[{_id:storeId,resellid:packageId,
    status:'active',accessibility:{cashier:['orders'],moderator:['orders']}},
    {_id:packageId,status:'active',reseller:{status:true}}],calls:[],before:null};
  const field=(row,key)=>key.split('.').reduce((v,k)=>v?.[k],row);
  function match(row,filter) {
    return Object.entries(filter).every(([key,value]) => key==='$or' ? value.some(v=>match(row,v)) :
      Array.isArray(field(row,key)) ? field(row,key).includes(value) : field(row,key)===value);
  }
  function model(kind) {
    return {find(filter) {
      let projection,limit,timeout,sort;
      const q={select(v){projection=v;return q;},sort(v){sort=v;return q;},limit(v){limit=v;return q;},
        maxTimeMS(v){timeout=v;return q;},lean(){return q;},async exec(){
          state.calls.push({kind,filter:clone(filter),projection:clone(projection),limit,timeout,sort});
          assert.equal(timeout,5000);assert.deepEqual(sort,{_id:1});assert(limit===1 || limit===2);
          if(state.before)await state.before(state.calls.length,kind);
          let rows=state[kind].filter(row=>match(row,filter)).slice(0,limit).map(clone);
          const keys=typeof projection==='string'?projection.split(' '):Object.keys(projection);
          rows=rows.map(row=>{
            const selected={};for(const key of keys){const top=key.split('.')[0];
              if(row[top]!==undefined)selected[top]=clone(row[top]);}
            if(selected.estoreids)selected.estoreids=selected.estoreids.slice(0,1001);
            return selected;
          });return rows;
        }};return q;
    }};
  }
  return {state,sources:{User:model('users'),Estore:model('stores')}};
}
function appFor(f=fixture(),options={}) {
  const app=express();
  if(options.globalParser)app.use(express.json({limit:'2mb'}));
  app.post(prefix,createSessionEndpoint({mainEnabled:options.mainEnabled ?? true,
    getSources:options.noProvider?undefined:(options.getSources || (()=>f.sources))}));
  app.get('/legacy-scanner-fixture',(_q,s)=>s.json({legacy:true}));
  return app;
}
function request(app,body=payload(),headers={},peer='fixture-peer') {
  return new Promise((resolve,reject)=>{
    const chunks=[];const socket=new Duplex({read(){},write(chunk,encoding,done){chunks.push(Buffer.from(chunk));done();}});
    Object.defineProperty(socket,'remoteAddress',{value:peer});
    const req=new http.IncomingMessage(socket);req.url=prefix;req.method='POST';
    const raw=typeof body==='string'?body:JSON.stringify(body);
    req.headers={'content-type':'application/json','content-length':String(Buffer.byteLength(raw)),...headers};
    req.httpVersionMajor=1;req.httpVersionMinor=1;
    const res=new http.ServerResponse(req);res.assignSocket(socket);res.on('error',reject);
    res.once('finish',()=>{
      const rawResponse=Buffer.concat(chunks).toString();const content=rawResponse.slice(rawResponse.indexOf('\r\n\r\n')+4);
      let data;try{data=JSON.parse(content);}catch{data=content;}
      resolve({status:res.statusCode,body:data,headers:res.getHeaders()});socket.destroy();
    });
    app.handle(req,res,err=>{if(err)reject(err);else{res.statusCode=404;res.end();}});
    req.push(Buffer.from(raw));req.push(null);req.complete=true;
  });
}
function expectError(r,status,code) {
  assert.equal(r.status,status,JSON.stringify(r.body));
  assert.deepEqual(Object.keys(r.body).sort(),['error','requestId']);
  assert.deepEqual(r.body.error,{code,message:messages[code]});
  assert.match(r.body.requestId,/^[a-f0-9-]{36}$/);
  assert.equal(r.headers['cache-control'],'no-store');assert.equal(r.headers.pragma,'no-cache');
}
function expectSuccess(r,role='cashier') {
  assert.equal(r.status,200,JSON.stringify(r.body));
  assert.deepEqual(Object.keys(r.body).sort(),['expiresAt','requestId','scope','token','tokenType']);
  assert.deepEqual(r.body.scope,{storeId,packageId,userId,role});
  const c=jwt.verify(r.body.token,process.env.MULTI_SCAN_SESSION_JWT_KEY,{algorithms:['HS256'],
    issuer:'cosmic-clavstore-scanner',audience:'clavstore-multiscan-review'});
  assert.equal(c.sub,userId);assert.equal(c.email,email);assert.equal(c.storeId,storeId);assert.equal(c.packageId,packageId);
  assert.equal(c.exp-c.iat,900);assert.equal(r.body.expiresAt,c.exp);assert.equal(r.body.tokenType,'Bearer');
  assert.deepEqual(Object.keys(c).sort(),['aud','email','exp','iat','iss','packageId','storeId','sub']);
  assert.equal(r.headers['cache-control'],'no-store');assert.equal(r.headers.pragma,'no-cache');
}
function token(changes={},options={}) {
  const now=Math.floor(Date.now()/1000);
  return jwt.sign({sub:userId,email,storeId,packageId,iat:now,exp:now+900,
    iss:'cosmic-clavstore-scanner',aud:'clavstore-multiscan-review',...changes},
    process.env.MULTI_SCAN_SESSION_JWT_KEY,{algorithm:'HS256',...options});
}
const authorization=t=>({authorization:'Bearer '+t});
function flagProbe(value) {
  const file=process.argv[process.argv.indexOf('--flag-results')+1];
  const rows=JSON.parse(fs.readFileSync(file,'utf8'));
  const row=rows.find(row=>row.value===(value===undefined?null:value));
  assert(row,'missing independently executed flag fixture');return row.result;
}
if(probe) {
  let called=false;
  request(appFor(fixture(),{getSources:()=>{called=true;throw Error('provider must not run');}}))
    .then(r=>{expectError(r,503,'DISABLED');assert.equal(called,false);process.stdout.write(JSON.stringify(r));})
    .catch(e=>{process.stderr.write(String(e));process.exitCode=1;});
} else {
  test('01 undefined session flag returns503 before source acquisition',()=>{expectError(flagProbe(undefined),503,'DISABLED');});
  test('02 disabled session flag returns503',()=>{expectError(flagProbe('false'),503,'DISABLED');});
  test('03 empty malformed and unexpected flags never enable',()=>{
    for(const value of ['', 'TRUE','1','true ','yes'])expectError(flagProbe(value),503,'DISABLED');
  });
  test('04 explicit enabled fixture succeeds; main false still disabled',async()=>{
    expectSuccess(await request(appFor()));expectError(await request(appFor(fixture(),{mainEnabled:false})),503,'DISABLED');
  });
  test('05 absent Authorization requires fresh password proof',async()=>{
    expectSuccess(await request(appFor()));const b=payload();delete b.password;
    expectError(await request(appFor(),b),400,'INVALID_PAYLOAD');
    expectError(await request(appFor(),payload({password:'wrong'})),401,'INVALID_CREDENTIALS');
  });
  test('06 malformed Bearer headers are rejected',async()=>{
    for(const v of ['Basic abc','Bearer ','Bearer x.y.z, Bearer x.y.z','Bearer '+'x'.repeat(8201)])
      expectError(await request(appFor(),payload(),{authorization:v}),401,'INVALID_TOKEN');
  });
  test('07 invalid signature cannot authenticate',async()=>{
    const claims=jwt.decode(token());const bad=jwt.sign(claims,crypto.randomBytes(48).toString('hex'));
    expectError(await request(appFor(),payload(),authorization(bad)),401,'INVALID_TOKEN');
  });
  test('08 unsupported HS384 and unsigned tokens rejected',async()=>{
    expectError(await request(appFor(),payload(),authorization(token({}, {algorithm:'HS384'}))),401,'INVALID_TOKEN');
    const c=jwt.decode(token());const unsigned=jwt.sign(c,null,{algorithm:'none'});
    expectError(await request(appFor(),payload(),authorization(unsigned)),401,'INVALID_TOKEN');
  });
  test('09 expiry and bounded lifetime mandatory',async()=>{
    const now=Math.floor(Date.now()/1000);
    for(const c of [{exp:now},{exp:undefined},{iat:now+60,exp:now+900},{exp:now+901}]) {
      const claims=jwt.decode(token());Object.assign(claims,c);
      for(const k of Object.keys(claims))if(claims[k]===undefined)delete claims[k];
      expectError(await request(appFor(),payload(),authorization(jwt.sign(claims,process.env.MULTI_SCAN_SESSION_JWT_KEY))),401,'INVALID_TOKEN');
    }
    expectError(await request(appFor(),payload(),authorization(token({}, {noTimestamp:true}))),401,'INVALID_TOKEN');
  });
  test('10 identity and signed scope required',async()=>{
    for(const key of ['email','sub','storeId','packageId']) {
      const c=jwt.decode(token());delete c[key];
      expectError(await request(appFor(),payload(),authorization(jwt.sign(c,process.env.MULTI_SCAN_SESSION_JWT_KEY))),401,'INVALID_TOKEN');
    }
  });
  test('11 wrong issuer rejected',async()=>{expectError(await request(appFor(),payload(),authorization(token({iss:'other'}))),401,'INVALID_TOKEN');});
  test('12 wrong audience and legacy purpose rejected',async()=>{
    for(const aud of ['other','clavmall-estore'])expectError(await request(appFor(),payload(),authorization(token({aud}))),401,'INVALID_TOKEN');
  });
  test('13 inactive or revoked current store denied',async()=>{
    const f=fixture();f.state.stores[0].status='inactive';expectError(await request(appFor(f)),403,'DENIED');
    const g=fixture();g.state.before=async n=>{if(n===2)g.state.users=[];};expectError(await request(appFor(g)),403,'DENIED');
  });
  test('14 cross-tenant store selector cannot grant access',async()=>{
    expectError(await request(appFor(),payload({storeId:foreign})),401,'INVALID_CREDENTIALS');
    expectError(await request(appFor(),payload({storeId:foreign}),authorization(token())),401,'INVALID_TOKEN');
    expectError(await request(appFor(),payload(),authorization(token({packageId:foreign}))),403,'DENIED');
    expectError(await request(appFor(),payload(),authorization(token({sub:foreign}))),403,'DENIED');
  });
  test('15 cashier with primary or secondary membership and orders permitted',async()=>{
    expectSuccess(await request(appFor()));const f=fixture();f.state.users[0].estoreid=foreign;f.state.users[0].estoreids=[storeId];
    expectSuccess(await request(appFor(f)));
  });
  test('16 cashier lacking current orders permission denied',async()=>{
    const f=fixture();f.state.stores[0].accessibility.cashier=[];expectError(await request(appFor(f)),403,'DENIED');
  });
  test('17 only trusted admin role grants admin scope',async()=>{
    const f=fixture();f.state.users[0].role='admin';delete f.state.stores[0].accessibility;
    expectSuccess(await request(appFor(f)), 'admin');
    expectError(await request(appFor(),payload({role:'admin'})),400,'INVALID_PAYLOAD');
  });
  test('18 unknown revoked and ambiguous users fail closed',async()=>{
    const f=fixture();f.state.users=[];expectError(await request(appFor(f)),401,'INVALID_CREDENTIALS');
    const g=fixture();g.state.users[0].deleteAccount.request=true;expectError(await request(appFor(g)),403,'DENIED');
    const h=fixture();h.state.users.push({...h.state.users[0],_id:foreign});expectError(await request(appFor(h)),401,'INVALID_CREDENTIALS');
  });
  test('19 missing trusted authorization data fails closed',async()=>{
    expectError(await request(appFor(fixture(),{noProvider:true})),503,'UNAVAILABLE');
    expectError(await request(appFor(fixture(),{getSources:()=>({})})),503,'UNAVAILABLE');
    for(const index of [0,1]){const f=fixture();f.state.stores.splice(index,1);expectError(await request(appFor(f)),403,'DENIED');}
    const f=fixture();f.state.before=()=>{throw Error('database unavailable');};expectError(await request(appFor(f)),503,'UNAVAILABLE');
  });
  test('20 public response excludes internal credentials and hashes',async()=>{
    const f=fixture();f.state.stores[0].internalAISecret='NEVER-EXPOSE-INTERNAL-AI-KEY';
    const r=await request(appFor(f));expectSuccess(r);
    for(const secret of [process.env.MULTI_SCAN_SESSION_JWT_KEY,password,f.state.users[0].password,'NEVER-EXPOSE-SHOWPASS','NEVER-EXPOSE-INTERNAL-AI-KEY'])
      assert(!JSON.stringify(r.body).includes(secret));
    for(const q of f.state.calls){const selected=typeof q.projection==='string'?q.projection:Object.keys(q.projection).join(' ');assert(!selected.includes('showPass'));}
    for(const name of ['session-config','credential-repository','session-service','session-handler','session-factory'])
      assert(!/console\.|logger\./.test(fs.readFileSync(path.join(__dirname,'../../../services/multi-scan/stage11',name+'.js'),'utf8')));
  });
  test('21 concurrent duplicate requests cannot overlap credential work',async()=>{
    let release,started;const held=new Promise(resolve=>{release=resolve;}),begun=new Promise(resolve=>{started=resolve;});
    const f=fixture();f.state.before=async n=>{if(n===1){started();await held;}};
    const app=appFor(f),first=request(app);await begun;
    expectError(await request(app),429,'BUSY');assert.equal(f.state.calls.length,1);
    release();expectSuccess(await first);expectSuccess(await request(app));
    expectSuccess(await request(app));expectSuccess(await request(app));
    const r=await request(app);expectError(r,429,'RATE_LIMITED');assert.equal(r.headers['retry-after'],'60');
  });
  test('22 exact payload shape and serialized bound enforced',async()=>{
    const bad=[payload({extra:1}),[],payload({password:''}),payload({password:8}),payload({email:'bad'}),payload({storeId:'bad'})];
    for(const b of bad)expectError(await request(appFor(),b),400,'INVALID_PAYLOAD');
    for(const headers of [{'content-type':'text/plain'},{authtoken:'legacy'},{estoreid:storeId},{resellid:packageId}])
      expectError(await request(appFor(),payload(),headers),400,'INVALID_PAYLOAD');
    expectError(await request(appFor(fixture(),{globalParser:true}),payload({extra:'x'.repeat(8192)})),413,'TOO_LARGE');
    expectError(await request(appFor(),'{'),400,'INVALID_PAYLOAD');
  });
  test('23 unexpected exception sanitized; timed-out operation retains admission',async()=>{
    const secret='PRIVATE-URI-KEY-STACK';
    const r=await request(appFor(fixture(),{getSources:()=>{throw Error(secret);}}));expectError(r,503,'UNAVAILABLE');assert(!JSON.stringify(r).includes(secret));
    let release,started;const held=new Promise(resolve=>{release=resolve;}),begun=new Promise(resolve=>{started=resolve;});
    const f=fixture();f.state.before=async n=>{if(n===1){started();await held;}};
    const app=appFor(f),first=request(app);await begun;
    expectError(await first,504,'TIMEOUT');expectError(await request(app),429,'BUSY');
    release();await new Promise(resolve=>setImmediate(resolve));expectSuccess(await request(app));
  });
  test('24 existing routes preserved and default export remains feature-disabled',async()=>{
    const router=require('../../../routes/multi-scan');const root=path.resolve(__dirname,'../../..');
    const backup=fs.readFileSync(path.join(root,'docs/multi-scan/stage11-b/batch-a-implementation/routes-multi-scan-original-20261022.txt'),'utf8');
    const source=fs.readFileSync(path.join(root,'routes/multi-scan.js'),'utf8');
    const stripped=source.replace("const { createSessionEndpoint } = require('../services/multi-scan/stage11/session-factory');\n",'')
      .replace("  router.post(prefix+'/session', createSessionEndpoint({ mainEnabled: cfg.enabled, getSources: options.getSessionSources }));\n",'');
    assert.equal(crypto.createHash('sha256').update(stripped, 'utf8').digest('hex'), '8a18b15b7ca8fe5453ba4a63b98aa0fe8dc3f9cd6203a8752a4cf57e3fa804ae');
    const oldRoutes=[...backup.matchAll(/router\.(get|post)\(prefix\+'([^']+)'/g)].map(m=>[m[1],'/ai/multi-scan'+m[2]]);
    const actual=router.stack.filter(x=>x.route && x.route.path!==prefix).map(x=>[Object.keys(x.route.methods)[0],x.route.path]);
    assert.deepEqual(actual,oldRoutes);
    assert.equal(router.stack.filter(x=>x.route?.path===prefix).length,1);
    assert.equal(router.stack.findIndex(x=>x.route?.path===prefix),0);
    assert(!router.stack[1].route);assert(router.stack[1].regexp.test('/ai/multi-scan/status'));
    const app=express();app.use(router);expectError(await request(app),503,'DISABLED');
    for(const filename of Object.keys(require.cache))assert(!/\/(dbconnect|models)\//.test(filename));
  });
  test('configuration has no fallback and rejects key reuse',()=>{
    const env={MULTI_SCAN_SESSION_ENABLED:'true',MULTI_SCAN_SESSION_JWT_KEY:process.env.MULTI_SCAN_SESSION_JWT_KEY,
      MULTI_SCAN_SESSION_ISSUER:'cosmic-clavstore-scanner',MULTI_SCAN_SESSION_AUDIENCE:'clavstore-multiscan-review'};
    for(const change of [{MULTI_SCAN_SESSION_JWT_KEY:''},{MULTI_SCAN_SESSION_JWT_KEY:'short'},
      {MULTI_SCAN_SESSION_ISSUER:''},{MULTI_SCAN_SESSION_AUDIENCE:'legacy'},{JWT_PRIVATE_KEY:env.MULTI_SCAN_SESSION_JWT_KEY},
      {MULTI_SCAN_SERVICE_KEY:env.MULTI_SCAN_SESSION_JWT_KEY}])assert.throws(()=>readSessionConfig(true,{...env,...change}),{code:'UNAVAILABLE'});
  });
  test('fresh credential hash shortcut and changed identity rejected',async()=>{
    const f=fixture();expectError(await request(appFor(f),payload({password:f.state.users[0].password})),401,'INVALID_CREDENTIALS');
    const g=fixture();g.state.users[0].password='unsupported';expectError(await request(appFor(g)),401,'INVALID_CREDENTIALS');
    const h=fixture();h.state.before=async n=>{if(n===2)h.state.users[0]._id=foreign;};expectError(await request(appFor(h)),403,'DENIED');
  });
  test('service injected clock rejects expiration without changing runtime clocks',async()=>{
    const f=fixture(),config=readSessionConfig(true);let now=1700000000;
    const service=new SessionService({repository:new CredentialRepository(f.sources),config,clock:()=>now});
    const issued=await service.issue(payload());now=issued.expiresAt;
    assert.throws(()=>service.verify(issued.token,payload()),{code:'INVALID_TOKEN'});
  });
  test('rate map bounded; forwarded headers do not select peer',async()=>{
    const app=appFor();for(let i=0;i<128;i++)expectError(await request(app,payload({extra:true}),{},'peer-'+i),400,'INVALID_PAYLOAD');
    expectError(await request(app,payload(),{},'peer-overflow'),429,'RATE_LIMITED');
    const other=appFor();for(let i=0;i<5;i++)expectSuccess(await request(other,payload(),{'x-forwarded-for':'fake-'+i}));
    expectError(await request(other,payload(),{'x-forwarded-for':'new-fake'}),429,'RATE_LIMITED');
  });
}
