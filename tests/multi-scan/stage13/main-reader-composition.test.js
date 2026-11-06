'use strict';
// Offline test-only composition. No application startup, socket listener, model or operational approval.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const Module=require('node:module');
const {createRequire}=require('node:module');
const jwt=require('jsonwebtoken'),express=require('express');
const ai=createRequire(path.resolve(__dirname,'../../../../clavstore-ai-image-api/package.json'));
const {createMainReaderAssembly}=require('../../../services/multi-scan/stage13/main-reader-composition');
const {createReleaseSource:createAiSource}=ai('./services/multi-scan/stage13/release-source');
const {digest,sha,validateBundle}=require('../../../services/multi-scan/stage12/approved-release');
const {createReceiver}=ai('./services/multi-scan/stage7/receiver');
const {createReplayOwner}=ai('./services/multi-scan/stage12/worker-owner');
const {request,rawEnvelope,uid}=require('../stage12/composition.test');
const fixture=require('../stage12/release-fixture.json');
const clone=v=>JSON.parse(JSON.stringify(v)),baseTenant=fixture.bundle.release.tenant;
const baseProduct=fixture.bundle.metadata.products[0]._id;
// Distinct, literal test-only signing inputs, never installed/generated production credentials.
const serviceKey='s13-6-offline-service-fixture-12345678901234567890';
const sessionConfig={enabled:true,key:'s13-6-offline-session-fixture-distinct-1234567890',issuer:'cosmic-clavstore-scanner',audience:'clavstore-multiscan-review',ttl:900};
function repin(bundle){
 bundle.release.catalog.metadataSha256=digest(bundle.metadata);
 bundle.release.catalog.productSetSha256=digest(bundle.metadata.products.map(p=>p._id));
 for(const slot of ['siglip','dino']){
  const encoded=bundle.indexes[slot],m=JSON.parse(encoded.manifestJson);
  m.files['mapping.json']={bytes:Buffer.byteLength(encoded.mappingJson),sha256:sha(encoded.mappingJson)};
  encoded.manifestJson=JSON.stringify(m);bundle.release[slot].manifestSha256=sha(encoded.manifestJson);
  bundle.release[slot].modelAndPreprocessorDigest=digest(m.model);
 }
 return bundle;
}
function secondBundle(){
 let raw=JSON.stringify(fixture.bundle);
 for(const [from,to] of [[baseTenant.storeId,'9'.repeat(24)],[baseTenant.packageId,'8'.repeat(24)],[baseProduct,'6'.repeat(24)]])raw=raw.split(from).join(to);
 return repin(JSON.parse(raw));
}
const keyOf=t=>t.packageId+'/'+t.storeId;
const turn=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}
async function harness(t,{twoStores=false,timeoutMs=2000,workerTimeoutMs=2000}={}){
 assert.equal(fixture.testOnly,true);
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'clavstore-s13-6-'));
 const state={now:1800000065,main:{records:new Map(),bundles:new Map(),calls:0},ai:{records:new Map(),bundles:new Map(),calls:0},
  transports:0,builds:0,runs:0,handles:0,metadata:0,receives:0,unblock:[],contexts:[],specs:[{}]};
 let assembly,receiver,replayOwner;
 t.after(async()=>{for(const release of state.unblock)release();if(assembly)await assembly.close();receiver?.close();replayOwner?.close();await fs.rm(root,{recursive:true,force:true});});
 async function publish(side,bundle,{pretty=false,name}={}){
  const data=state[side],tenant=bundle.release.tenant,raw=JSON.stringify(bundle,null,pretty?2:0);
  const file=name||`${side}-${tenant.storeId}.json`;await fs.writeFile(path.join(data.root,file),raw);
  data.bundles.set(keyOf(tenant),bundle);
  data.records.set(keyOf(tenant),{tenant:clone(tenant),releaseId:bundle.release.releaseId,digest:digest(bundle.release),approvalVersion:bundle.release.approvalVersion,
   issuedAt:1800000000,expiresAt:1800003600,revoked:false,bundle:{file,sha256:sha(raw)}});
 }
 const bundles=[clone(fixture.bundle),...(twoStores?[secondBundle()]:[])];
 for(const side of ['main','ai']){
  state[side].root=path.join(root,side);await fs.mkdir(state[side].root);
  for(const b of bundles){validateBundle(b,b.release.tenant,state.now);await publish(side,clone(b));}
 }
 const readers={};
 for(const side of ['main','ai'])readers[side]=async(tenant,options)=>{
  assert.ok(Object.isFrozen(tenant));assert.deepEqual(Object.keys(tenant).sort(),['packageId','storeId']);assert.deepEqual(Object.keys(options),['signal']);
  state[side].calls++;if(state[side].hook)await state[side].hook(tenant);
  return clone(state[side].records.get(keyOf(tenant))??null);
 };
 const sources={ai:createAiSource({root:state.ai.root,currentApprovals:readers.ai,clock:()=>state.now})};
 const users=bundles.map((b,i)=>({_id:i?'7'.repeat(24):fixture.userId,email:`cashier${i}@example.test`,role:'cashier',estoreid:b.release.tenant.storeId,resellid:b.release.tenant.packageId}));
 const rows=bundles.map((b,i)=>({_id:b.metadata.products[0]._id,estoreid:b.release.tenant.storeId,slug:'synthetic-sku-'+i,title:b.metadata.products[0].title,
  variantName:b.metadata.products[0].variantName,activate:true,price:10+i,quantity:30,segregate:false}));
 const repository={usersByEmail:async email=>{if(state.membershipHook)await state.membershipHook();return clone(users.filter(u=>u.email===email));},
  store:async id=>{const b=bundles.find(b=>b.release.tenant.storeId===id);return b?{_id:id,resellid:b.release.tenant.packageId,status:'active',accessibility:{cashier:['orders']}}:null;},
  packageOwner:async id=>bundles.some(b=>b.release.tenant.packageId===id)?{_id:id,status:'active',reseller:{status:true}}:null,
  products:async(storeId,ids)=>clone(rows.filter(p=>p.estoreid===storeId&&ids.includes(p._id))),brands:async()=>[],searchProducts:async()=>[],
  withSnapshot:async()=>{throw Error('No snapshot publication');},productPage:async()=>[],User:{find(){throw Error('No password query');}},Estore:{find(){throw Error('No password query');}}};
 state.now-=65;replayOwner=createReplayOwner({ownerMode:'single-process',clock:()=>state.now});state.now+=65;
 const receiverOptions={live:true,serviceKey,provider:sources.ai,replayOwner,ownerMode:'single-process',clockMs:()=>state.now*1000,timeoutMs:workerTimeoutMs,
  buildWorker:({grants})=>{state.builds++;state.grants=grants;if(state.buildHook)return state.buildHook();return {onExit(fn){state.exit=fn;},async run(image,context,options){
   state.runs++;state.contexts.push(context);assert.ok(Buffer.isBuffer(image));assert.ok(Object.isFrozen(context.principal));
   const ctx=state.contextHook?state.contextHook(context):context;
   await grants.authorize({...ctx,operation:'search'});
   const bundle=state.ai.bundles.get(keyOf(ctx.tenant));assert.ok(bundle);
   if(state.workerBefore)await state.workerBefore(ctx,options);
   for(const slot of ['siglip','dino']){
    const pin=await grants.pin(ctx,slot),encoded=bundle.indexes[slot];
    let handle={generation:pin.generation,manifestSha256:pin.manifestSha256,manifest:JSON.parse(encoded.manifestJson),mapping:JSON.parse(encoded.mappingJson)};
    if(state.handleHook)handle=state.handleHook(handle,slot);
    await grants.validateHandle(ctx,slot,handle);state.handles++;
   }
   const metadata=await grants.metadata(ctx);state.metadata++;assert.equal(metadata.revision,bundle.release.catalog.snapshotRevision);
   let result=rawEnvelope(bundle,{scanId:options.scanId,tenant:ctx.tenant},state.specs).result;
   if(ctx.tenant.storeId!==baseTenant.storeId)result=JSON.parse(JSON.stringify(result).split(baseProduct).join(bundle.metadata.products[0]._id));
   delete result.release;
   if(state.resultHook)result=state.resultHook(result);
   if(state.workerAfter)await state.workerAfter(ctx,options);
   return result;
  }};}};
 receiver=createReceiver(receiverOptions);
 async function receive(req){state.receives++;try{return {status:200,body:Buffer.from(JSON.stringify(await receiver(req)))}}catch(error){state.lastError={code:error.code,status:error.status};return {status:error.status||503,body:Buffer.from(JSON.stringify({ok:false,error:{code:error.code}}))};}}
 const transport=async input=>{
  state.transports++;state.input=input;
  const req={method:'POST',path:input.url.pathname,headers:{...input.headers},body:JSON.parse(input.body.toString()),signal:input.signal};
  state.request=req;if(state.transportBefore)await state.transportBefore(req);
  const response=await receive(req);if(state.transportAfter)await state.transportAfter(response);return response;
 };
 const assemblyOptions={sessionConfig,repository,aiConfig:{url:'http://127.0.0.1',serviceKey,allowedAddresses:['127.0.0.1'],transport,
  lookup:async()=>{throw Error('No DNS allowed');}},loadRuntime:()=>state.runtimeHook?state.runtimeHook():({sharp:ai('sharp'),multer:ai('multer')}),imagePrefixes:['https://fixtures.invalid/catalog/'],ownerMode:'single-process',clock:()=>state.now,operationTimeoutMs:timeoutMs};
 const options={enabled:true,releaseSourceOptions:{root:state.main.root,currentApprovals:readers.main},assemblyOptions};
 assembly=createMainReaderAssembly(options);const app=express();app.use('/api',assembly.router); // Test-owned object; never listens or installs routes into an application.
 function token(i=0,claims={}){const u=users[i];return jwt.sign({sub:u._id,email:u.email,storeId:u.estoreid,packageId:u.resellid,iss:sessionConfig.issuer,aud:sessionConfig.audience,iat:state.now,exp:state.now+900,...claims},sessionConfig.key);}
 function headers(i=0){return {authtoken:token(i),estoreid:users[i].estoreid,resellid:users[i].resellid,'x-multi-scan-schema-version':'2'};}
 async function scan({i=0,id=uid(1000),extra={},targetApp=app}={}){
  const photo=await ai('sharp')({create:{width:100,height:100,channels:3,background:'red'}}).png().toBuffer();
  const boundary='s13-6-synthetic';const body=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="fixture.png"\r\nContent-Type: image/png\r\n\r\n`),photo,Buffer.from(`\r\n--${boundary}--\r\n`)]);
  return request(targetApp,'/api/ai/multi-scan/scan',{method:'POST',headers:{...headers(i),'x-multi-scan-submission-id':id,'content-type':`multipart/form-data; boundary=${boundary}`,...extra},body});
 }
 const status=(id,i=0,targetApp=app)=>request(targetApp,'/api/ai/multi-scan/status?schemaVersion=2&scanId='+id,{headers:headers(i)});
 const cancel=scan=>request(app,'/api/ai/multi-scan/stage12/cancel',{method:'POST',headers:{...headers(),'content-type':'application/json'},body:JSON.stringify({schemaVersion:2,scanId:scan.scanId,expectedRevision:scan.revision})});
 const deny=async settings=>{const r=await scan(settings);assert.notEqual(r.status,200);assert.equal(r.cache,'no-store');assert.equal(r.body.review,undefined);assert.ok(!JSON.stringify(r.body).includes(root));if(state.request){const observed=await status(state.request.body.scanId);assert.equal(observed.body.review,undefined);if(observed.status===200)assert.ok(!['reviewable','quote-issued','confirmation-accepted'].includes(observed.body.status));}return r;};
 return {root,state,sources,readers,publish,users,rows,options,receiverOptions,assembly,receiver,replayOwner,scan,status,cancel,deny,token,receive};
}
async function ready(f,settings){const r=await f.scan(settings);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.status,'reviewable');return r.body;}
function entry(f,side,tenant=baseTenant){return f.state[side].records.get(keyOf(tenant));}
function bundle(f,side,tenant=baseTenant){return f.state[side].bundles.get(keyOf(tenant));}
async function rewrite(f,side,mutate){const b=clone(bundle(f,side));mutate(b);repin(b);await f.publish(side,b);}


const configDenied=fn=>assert.throws(fn,e=>e.status===503&&e.code==='SCANNER_COMPOSITION_UNAVAILABLE'&&e.message==='Scanner composition unavailable'&&!e.cause);
for(const enabled of [undefined,false,'true',1,null,{},[]])test('only literal true opts in; disabled provider getters are untouched: '+JSON.stringify(enabled),async()=>{
 const options={enabled};for(const key of ['releaseSourceOptions','assemblyOptions'])Object.defineProperty(options,key,{enumerable:true,get(){throw Error('Disabled getter touched');}});
 const result=createMainReaderAssembly(options);assert.equal(result.router,null);assert.equal(result.isReady(),false);assert.deepEqual(Object.keys(result).sort(),['close','isReady','router']);await result.close();
});
for(const value of [undefined,null,false,0,'disabled'])test('absent/non-enabled input remains dormant '+String(value),async()=>{const result=createMainReaderAssembly(value);assert.equal(result.router,null);await result.close();});
test('fresh actual import and disabled/enabled construction perform no discovery, I/O, timers, service calls or mounting',async t=>{
 const f=await harness(t),root=path.resolve(__dirname,'../../../services/multi-scan')+path.sep;
 const cache=new Map(Object.entries(require.cache).filter(([name])=>name.startsWith(root))),load=Module._load,open=fs.open,net=require('node:net'),http=require('node:http'),https=require('node:https');
 const tcp=net.Socket.prototype.connect,listen=net.Server.prototype.listen,httpRequest=http.request,httpsRequest=https.request,timer=global.setTimeout,interval=global.setInterval,router=express.Router;let routers=0,external=0;const seen=[];let instance;
 const forbidden=()=>{external++;throw Error('Forbidden constructor side effect');};
 try{
  for(const name of cache.keys())delete require.cache[name];
  Module._load=function(name,...args){assert.ok(!/dbconnect|mongoose|redis|onnx|hnsw|stage9|(?:^|\/)models\/|server(?:\.js)?$|^(sharp|multer)$/.test(name),name);seen.push(name);return load.call(this,name,...args);};
  fs.open=forbidden;net.Socket.prototype.connect=forbidden;net.Server.prototype.listen=forbidden;http.request=forbidden;https.request=forbidden;global.setTimeout=forbidden;global.setInterval=forbidden;
  express.Router=function(...args){routers++;return router(...args);};
  const {createMainReaderAssembly:create}=require('../../../services/multi-scan/stage13/main-reader-composition');
  const disabled=create();assert.equal(disabled.router,null);assert.equal(routers,0);
  instance=create(f.options);assert.equal(instance.isReady(),true);assert.ok(routers>0); // Existing P6 allocates its unmounted router; nothing listens/mounts in an application.
  assert.equal(external,0);assert.equal(f.state.main.calls,0);assert.equal(f.state.ai.calls,0);assert.equal(f.state.transports,0);assert.equal(f.state.builds,0);
  assert.ok(seen.includes('./release-source'));assert.ok(seen.includes('../stage12/composition'));
 }finally{
  Module._load=load;fs.open=open;net.Socket.prototype.connect=tcp;net.Server.prototype.listen=listen;http.request=httpRequest;https.request=httpsRequest;global.setTimeout=timer;global.setInterval=interval;express.Router=router;
  for(const name of Object.keys(require.cache))if(name.startsWith(root))delete require.cache[name];for(const [name,value] of cache)require.cache[name]=value;
  if(instance)await instance.close();
 }
});
test('actual factory binds main reader to P6 and real independent AI reader/P5 with authoritative review',async t=>{
 const f=await harness(t);assert.equal(f.state.main.calls,0);assert.equal(f.state.ai.calls,0);assert.equal(f.state.transports,0);assert.equal(f.state.builds,0);
 assert.deepEqual(Object.keys(f.assembly).sort(),['close','isReady','router']);const scan=await ready(f);
 assert.ok(f.state.main.calls>0&&f.state.ai.calls>0);assert.equal(f.state.handles,2);assert.equal(f.state.metadata,1);assert.equal(f.state.runs,1);
 assert.equal(f.state.request.body.release.digest,digest(bundle(f,'main').release));assert.equal(f.state.request.body.release.id,bundle(f,'ai').release.releaseId);
 assert.notEqual(scan.scanId,uid(1000));assert.equal(scan.scanId,f.state.request.body.scanId);assert.equal(scan.confirmed,false);assert.equal(scan.cartMutation,false);assert.equal(scan.review.detections[0].suggestedProductId,null);
 assert.equal(scan.review.detections[0].candidates[0].currentPrice.retail,10);assert.equal(f.rows[0].quantity,30);assert.equal((await f.status(scan.scanId)).status,200);
});
for(const [name,edit] of [
 ['missing source options',o=>{delete o.releaseSourceOptions;}],['missing assembly options',o=>{delete o.assemblyOptions;}],['extra top authority',o=>{o.storeId='9'.repeat(24);}],['top source override',o=>{o.releaseProvider={load(){},approval(){}};}],
 ['missing root',o=>{delete o.releaseSourceOptions.root;}],['relative root',o=>{o.releaseSourceOptions.root='relative';}],['root alias',o=>{o.releaseSourceOptions.root+='/../main';}],
 ['missing approvals',o=>{delete o.releaseSourceOptions.currentApprovals;}],['wrong approval shape',o=>{o.releaseSourceOptions.currentApprovals={approved:true};}],['independent source clock',o=>{o.releaseSourceOptions.clock=()=>1800000000;}],
 ['source enabled',o=>{o.releaseSourceOptions.enabled=true;}],['source path selection',o=>{o.releaseSourceOptions.indexPath='/etc/passwd';}],['invalid limits',o=>{o.releaseSourceOptions.limits={maxRecords:129};}],
 ['assembly enabled override',o=>{o.assemblyOptions.enabled=true;}],['assembly source override',o=>{o.assemblyOptions.releaseProvider={load:async()=>fixture.bundle,approval:async()=>true};}],['unknown assembly field',o=>{o.assemblyOptions.tenant=baseTenant;}],
 ['missing session',o=>{delete o.assemblyOptions.sessionConfig;}],['malformed session',o=>{o.assemblyOptions.sessionConfig={};}],['weak session key',o=>{o.assemblyOptions.sessionConfig={...sessionConfig,key:'weak'};}],
 ['missing repository',o=>{delete o.assemblyOptions.repository;}],['malformed repository',o=>{o.assemblyOptions.repository={};}],['missing catalog method',o=>{o.assemblyOptions.repository={...o.assemblyOptions.repository,products:null};}],
 ['missing AI config',o=>{delete o.assemblyOptions.aiConfig;}],['weak service key',o=>{o.assemblyOptions.aiConfig={...o.assemblyOptions.aiConfig,serviceKey:'weak'};}],['equal keys',o=>{o.assemblyOptions.aiConfig={...o.assemblyOptions.aiConfig,serviceKey:sessionConfig.key};}],
 ['missing runtime',o=>{delete o.assemblyOptions.loadRuntime;}],['invalid runtime',o=>{o.assemblyOptions.loadRuntime={};}],['missing image policy',o=>{delete o.assemblyOptions.imagePrefixes;}],
 ['missing owner',o=>{delete o.assemblyOptions.ownerMode;}],['wrong owner',o=>{o.assemblyOptions.ownerMode='multi-process';}],['nonfunction clock',o=>{o.assemblyOptions.clock=123;}],['null clock',o=>{o.assemblyOptions.clock=null;}],['invalid deadline',o=>{o.assemblyOptions.operationTimeoutMs=30001;}],
 ['unknown symbol',o=>{o[Symbol('unapproved')]=true;}],['hidden override',o=>{Object.defineProperty(o.assemblyOptions,'releaseProvider',{value:{},enumerable:false});}]
])test('explicit factory configuration rejects '+name+' without touching trusted external ports',async t=>{
 const f=await harness(t),o={...f.options,releaseSourceOptions:{...f.options.releaseSourceOptions},assemblyOptions:{...f.options.assemblyOptions}};edit(o);configDenied(()=>createMainReaderAssembly(o));
 assert.equal(f.state.main.calls,0);assert.equal(f.state.ai.calls,0);assert.equal(f.state.transports,0);assert.equal(f.state.builds,0);
});
test('throwing config/getter failures are sanitized with no private cause',async t=>{
 const f=await harness(t);for(const key of ['enabled','releaseSourceOptions','assemblyOptions']){const o={...f.options};Object.defineProperty(o,key,{get(){throw Error('SECRET_PRIVATE_PATH');}});configDenied(()=>createMainReaderAssembly(o));}
 const o={...f.options,releaseSourceOptions:{...f.options.releaseSourceOptions}};Object.defineProperty(o.releaseSourceOptions,'root',{get(){throw Error('SECRET_PRIVATE_PATH');}});configDenied(()=>createMainReaderAssembly(o));assert.equal(f.state.main.calls,0);
});
test('conflicting enabled getter cannot turn a changed snapshot into an active assembly',async t=>{
 const f=await harness(t);let reads=0;const o={...f.options};Object.defineProperty(o,'enabled',{get(){return ++reads===1;}});configDenied(()=>createMainReaderAssembly(o));assert.equal(f.state.main.calls,0);
});
test('default clock construction is inert and does not claim metadata health',async t=>{
 const f=await harness(t),o={...f.options,assemblyOptions:{...f.options.assemblyOptions}};delete o.assemblyOptions.clock;const assembly=createMainReaderAssembly(o);
 try{assert.equal(assembly.isReady(),true);assert.equal(f.state.main.calls,0);assert.equal(f.state.transports,0);}finally{await assembly.close();}
});
test('one explicit non-wall clock reaches both reader and P6; semantic clock failure is deferred safely',async t=>{
 const f=await harness(t);await ready(f);assert.ok(f.state.main.calls>0);const g=await harness(t);g.state.membershipHook=()=>{g.state.now=NaN;};await g.deny();assert.equal(g.state.main.calls,0);assert.equal(g.state.transports,0);
});
test('reader limits are bound to the actual source, not ignored or replaced',async t=>{
 const f=await harness(t),assembly=createMainReaderAssembly({...f.options,releaseSourceOptions:{...f.options.releaseSourceOptions,limits:{maxBytes:1}}}),app=express();app.use('/api',assembly.router);
 try{const r=await f.scan({targetApp:app});assert.equal(r.status,503);assert.equal(r.body.review,undefined);assert.ok(f.state.main.calls>0);assert.equal(f.state.transports,0);}finally{await assembly.close();}
});
for(const kind of ['missing approval','unknown release','revoked','expired','invalid record','throwing source','malformed bytes','wrong index','foreign metadata'])test('bound real reader/P2 rejects '+kind+' on request while constructor readiness remains only open-state',async t=>{
 const f=await harness(t);assert.equal(f.assembly.isReady(),true);assert.equal(f.state.main.calls,0);
 if(kind==='missing approval')f.state.main.records.clear();if(kind==='unknown release')entry(f,'main').releaseId=uid(999);if(kind==='revoked')entry(f,'main').revoked=true;if(kind==='expired')entry(f,'main').expiresAt=f.state.now;
 if(kind==='invalid record')f.state.main.records.set(keyOf(baseTenant),true);
 if(kind==='throwing source')f.state.main.hook=()=>{throw Error('SECRET_SOURCE');};
 if(kind==='malformed bytes'){const e=entry(f,'main');await fs.writeFile(path.join(f.state.main.root,e.bundle.file),'{');e.bundle.sha256=sha('{');}
 if(kind==='wrong index')await rewrite(f,'main',b=>{b.release.siglip.generation='g-'+uid(999);});
 if(kind==='foreign metadata')await rewrite(f,'main',b=>{b.metadata.products[0].estoreid='9'.repeat(24);});
 await f.deny();assert.equal(f.state.transports,0);assert.equal(f.state.builds,0);assert.ok(f.state.main.calls>0);
});
for(const kind of ['forged','expired','wrong store','wrong package','changed membership'])test('actual P1 rejects '+kind+' before bound reader or AI',async t=>{
 const f=await harness(t);let extra={};if(kind==='forged')extra={authtoken:'forged'};if(kind==='expired')extra={authtoken:f.token(0,{exp:f.state.now-1})};if(kind==='wrong store')extra={estoreid:'9'.repeat(24)};if(kind==='wrong package')extra={resellid:'8'.repeat(24)};if(kind==='changed membership')f.users[0].estoreid='9'.repeat(24);
 await f.deny({extra});assert.equal(f.state.main.calls,0);assert.equal(f.state.ai.calls,0);assert.equal(f.state.transports,0);
});
test('signed expected release cannot override a different independently valid AI approval',async t=>{
 const f=await harness(t),b=clone(bundle(f,'ai'));b.release.approvalVersion++;validateBundle(b,baseTenant,f.state.now);await f.publish('ai',b);
 await f.deny();assert.equal(f.state.lastError.code,'RELEASE_FORBIDDEN');assert.ok(f.state.main.calls>0&&f.state.ai.calls>0);assert.equal(f.state.builds,0);
});
test('private signed replay and worker principal cloning remain denied through the factory',async t=>{
 const f=await harness(t);await ready(f);await turn();await assert.rejects(f.receiver({...f.state.request,signal:undefined}),{code:'CAPABILITY_REPLAY'});assert.equal(f.state.runs,1);
 const g=await harness(t);g.state.contextHook=ctx=>({...ctx,principal:Object.freeze({...ctx.principal})});await g.deny();assert.equal(g.state.handles,0);
});
test('main conformance cannot be bypassed by a malformed private response',async t=>{
 const f=await harness(t);f.state.transportAfter=async response=>{const raw=JSON.parse(response.body.toString());raw.result.results[0].indexGenerations.siglip2='g-'+uid(999);response.body=Buffer.from(JSON.stringify(raw));};
 await f.deny();assert.equal(f.state.handles,2);assert.equal(f.state.runs,1);
});
test('repeated construction yields isolated P6 owners, not a cached assembly or shared scan registry',async t=>{
 const f=await harness(t),other=createMainReaderAssembly(f.options),app=express();app.use('/api',other.router);
 try{assert.notEqual(other,f.assembly);const a=await ready(f),b=await f.scan({targetApp:app});assert.equal(b.status,200);assert.notEqual(a.scanId,b.body.scanId);assert.equal(f.state.runs,2);
  assert.equal((await f.status(a.scanId,0,app)).status,410);assert.equal((await f.status(b.body.scanId)).status,410);
  await f.assembly.close();assert.equal(other.isReady(),true);assert.equal((await f.status(b.body.scanId,0,app)).status,200);
 }finally{await other.close();}
});
test('two-store scope remains isolated under the bound factory without duplicate cart or authority systems',async t=>{
 const f=await harness(t,{twoStores:true}),a=await ready(f),b=await ready(f,{i:1,id:uid(1001)});assert.equal(a.tenant.storeId,baseTenant.storeId);assert.equal(b.tenant.storeId,'9'.repeat(24));assert.equal(b.review.detections[0].candidates[0].productId,'6'.repeat(24));assert.equal((await f.status(a.scanId,1)).status,403);assert.equal((await f.status(b.scanId)).status,403);assert.equal(f.state.handles,4);
});
for(const kind of ['provider','transport'])test('P6 close remains idempotent and cannot acknowledge pending '+kind+' settlement',async t=>{
 const f=await harness(t),start=deferred(),finish=deferred();f.state.unblock.push(finish.resolve);
 if(kind==='provider')f.state.main.hook=async()=>{start.resolve();await finish.promise;};else f.state.transportBefore=async()=>{start.resolve();await finish.promise;};
 const scan=f.scan();await start.promise;const close=f.assembly.close();assert.equal(close,f.assembly.close());assert.equal(f.assembly.isReady(),false);let drained=false;close.then(()=>{drained=true;});await turn();assert.equal(drained,false);
 const cancelled=await scan;assert.equal(cancelled.status,499);assert.equal(cancelled.body.review,undefined);assert.equal(drained,false);finish.resolve();await close;assert.equal(drained,true);
});
test('configuration snapshots cannot replace the bound source, while current approval revocation still takes effect',async t=>{
 const f=await harness(t);f.options.releaseSourceOptions.currentApprovals=async()=>{throw Error('Unapproved later callback');};f.options.assemblyOptions.clock=()=>NaN;
 await ready(f);assert.ok(f.state.main.calls>0);entry(f,'main').revoked=true;await f.deny({id:uid(1001)});assert.equal(f.state.runs,1);
});
test('failed construction cannot poison later explicit valid construction or create a global fallback',async t=>{
 const f=await harness(t);configDenied(()=>createMainReaderAssembly({...f.options,releaseSourceOptions:{...f.options.releaseSourceOptions,currentApprovals:null}}));
 const other=createMainReaderAssembly(f.options),app=express();app.use('/api',other.router);try{assert.notEqual(other,f.assembly);const r=await f.scan({targetApp:app});assert.equal(r.status,200);assert.ok(f.state.main.calls>0&&f.state.ai.calls>0);}finally{await other.close();}
});
