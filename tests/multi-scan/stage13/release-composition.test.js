'use strict';
// Offline test-only composition. No application startup, socket listener, model or operational approval.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createRequire}=require('node:module'),{createHmac}=require('node:crypto');
const jwt=require('jsonwebtoken'),express=require('express');
const ai=createRequire(path.resolve(__dirname,'../../../../clavstore-ai-image-api/package.json'));
const {createReleaseSource}=require('../../../services/multi-scan/stage13/release-source');
const {createReleaseSource:createAiSource}=ai('./services/multi-scan/stage13/release-source');
const {createScannerAssembly}=require('../../../services/multi-scan/stage12/composition');
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
function resign(req,claims={}){
 const old=JSON.parse(Buffer.from(req.headers['x-multi-scan-capability'].split('.')[0],'base64url'));
 const payload=Buffer.from(JSON.stringify({...old,bodyHash:sha(JSON.stringify(req.body)),...claims})).toString('base64url');
 req.headers['x-multi-scan-capability']=payload+'.'+createHmac('sha256',serviceKey).update(payload).digest('hex');
}
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
 const sources={};
 for(const [side,create] of [['main',createReleaseSource],['ai',createAiSource]])sources[side]=create({root:state[side].root,clock:()=>state.now,currentApprovals:async(tenant,options)=>{
  assert.ok(Object.isFrozen(tenant));assert.deepEqual(Object.keys(tenant).sort(),['packageId','storeId']);assert.deepEqual(Object.keys(options),['signal']);
  state[side].calls++;if(state[side].hook)await state[side].hook(tenant);
  return clone(state[side].records.get(keyOf(tenant))??null);
 }});
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
 const options={enabled:true,sessionConfig,repository,releaseProvider:sources.main,aiConfig:{url:'http://127.0.0.1',serviceKey,allowedAddresses:['127.0.0.1'],transport,
  lookup:async()=>{throw Error('No DNS allowed');}},loadRuntime:()=>state.runtimeHook?state.runtimeHook():({sharp:ai('sharp'),multer:ai('multer')}),imagePrefixes:['https://fixtures.invalid/catalog/'],ownerMode:'single-process',clock:()=>state.now,operationTimeoutMs:timeoutMs};
 assembly=createScannerAssembly(options);const app=express();app.use('/api',assembly.router); // Test-owned object; never listens or installs routes into an application.
 function token(i=0,claims={}){const u=users[i];return jwt.sign({sub:u._id,email:u.email,storeId:u.estoreid,packageId:u.resellid,iss:sessionConfig.issuer,aud:sessionConfig.audience,iat:state.now,exp:state.now+900,...claims},sessionConfig.key);}
 function headers(i=0){return {authtoken:token(i),estoreid:users[i].estoreid,resellid:users[i].resellid,'x-multi-scan-schema-version':'2'};}
 async function scan({i=0,id=uid(1000),extra={}}={}){
  const photo=await ai('sharp')({create:{width:100,height:100,channels:3,background:'red'}}).png().toBuffer();
  const boundary='s13-6-synthetic';const body=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="fixture.png"\r\nContent-Type: image/png\r\n\r\n`),photo,Buffer.from(`\r\n--${boundary}--\r\n`)]);
  return request(app,'/api/ai/multi-scan/scan',{method:'POST',headers:{...headers(i),'x-multi-scan-submission-id':id,'content-type':`multipart/form-data; boundary=${boundary}`,...extra},body});
 }
 const status=(id,i=0)=>request(app,'/api/ai/multi-scan/status?schemaVersion=2&scanId='+id,{headers:headers(i)});
 const cancel=scan=>request(app,'/api/ai/multi-scan/stage12/cancel',{method:'POST',headers:{...headers(),'content-type':'application/json'},body:JSON.stringify({schemaVersion:2,scanId:scan.scanId,expectedRevision:scan.revision})});
 const deny=async settings=>{const r=await scan(settings);assert.notEqual(r.status,200);assert.equal(r.cache,'no-store');assert.equal(r.body.review,undefined);assert.ok(!JSON.stringify(r.body).includes(root));if(state.request){const observed=await status(state.request.body.scanId);assert.equal(observed.body.review,undefined);if(observed.status===200)assert.ok(!['reviewable','quote-issued','confirmation-accepted'].includes(observed.body.status));}return r;};
 return {root,state,sources,publish,users,rows,options,receiverOptions,assembly,receiver,replayOwner,scan,status,cancel,deny,token,receive};
}
async function ready(f,settings){const r=await f.scan(settings);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.status,'reviewable');return r.body;}
function entry(f,side,tenant=baseTenant){return f.state[side].records.get(keyOf(tenant));}
function bundle(f,side,tenant=baseTenant){return f.state[side].bundles.get(keyOf(tenant));}
async function rewrite(f,side,mutate){const b=clone(bundle(f,side));mutate(b);repin(b);await f.publish(side,b);}

test('both real independent readers compose through P1/P6, signed P5, exact handles and P3 publication',async t=>{
 const f=await harness(t),scan=await ready(f);
 assert.notEqual(f.state.main.root,f.state.ai.root);assert.notEqual(f.sources.main,f.sources.ai);
 assert.ok(f.state.main.calls>0&&f.state.ai.calls>0);assert.equal(f.state.transports,1);assert.equal(f.state.builds,1);assert.equal(f.state.runs,1);assert.equal(f.state.handles,2);assert.equal(f.state.metadata,1);
 assert.deepEqual(scan.tenant,baseTenant);assert.notEqual(scan.scanId,uid(1000));assert.equal(scan.scanId,f.state.request.body.scanId);const signed=JSON.parse(Buffer.from(f.state.request.headers['x-multi-scan-capability'].split('.')[0],'base64url'));assert.equal(signed.bodyHash,sha(JSON.stringify(f.state.request.body)));assert.equal(signed.correlationId,f.state.request.headers['x-request-id']);assert.equal(f.state.request.body.release.digest,digest(bundle(f,'main').release));assert.equal(f.state.request.body.release.id,bundle(f,'ai').release.releaseId);
 assert.equal(f.state.input.headers.authtoken,undefined);assert.equal(scan.cartMutation,false);assert.equal(scan.confirmed,false);
 assert.equal(scan.review.detections[0].suggestedProductId,null);assert.equal(scan.review.detections[0].candidates[0].currentPrice.retail,10);
 assert.equal(f.rows[0].quantity,30);assert.ok(!JSON.stringify(scan).includes('PRIVATE_OCR'));
 const s=await f.status(scan.scanId);assert.equal(s.status,200);assert.equal(s.body.scanId,scan.scanId);assert.deepEqual(s.body.review,scan.review);
});
test('different basenames and independently pinned JSON whitespace preserve the same approved semantic release',async t=>{
 const f=await harness(t);await f.publish('ai',clone(bundle(f,'ai')),{pretty:true,name:'independent-ai-copy.json'});
 assert.notEqual(entry(f,'ai').bundle.sha256,entry(f,'main').bundle.sha256);assert.equal(entry(f,'ai').digest,entry(f,'main').digest);await ready(f);assert.equal(f.state.handles,2);
});
for(const spec of [{unknown:true},{uncertain:true}])test('recognition remains explicit review only '+JSON.stringify(spec),async t=>{
 const f=await harness(t);f.state.specs=[spec];const scan=await ready(f);assert.equal(scan.review.detections[0].suggestedProductId,null);assert.equal(scan.cartMutation,false);assert.equal(scan.confirmed,false);
});
for(const [name,extra] of [['wrong store',{estoreid:'9'.repeat(24)}],['wrong package',{resellid:'8'.repeat(24)}],['forged token',{authtoken:'forged'}],['missing token',{authtoken:''}]])test('P1 rejects '+name+' before either reader or transport',async t=>{
 const f=await harness(t);await f.deny({extra});assert.equal(f.state.main.calls,0);assert.equal(f.state.ai.calls,0);assert.equal(f.state.transports,0);assert.equal(f.state.builds,0);
});
for(const side of ['main','ai'])for(const kind of ['missing registry','missing file','unknown release','revoked','expired approval','duplicate registry','bad JSON','invalid UTF8','catalog mismatch','dimension mismatch','duplicate product','duplicate mapping','foreign product','generation path','OCR mismatch','throwing registry'])test(side+' reader/P2 rejects '+kind+' through the composed chain',async t=>{
 const f=await harness(t),e=entry(f,side),file=path.join(f.state[side].root,e.bundle.file);
 if(kind==='missing registry')f.state[side].records.delete(keyOf(baseTenant));
 if(kind==='missing file')await fs.unlink(file);
 if(kind==='unknown release')e.releaseId=uid(999);
 if(kind==='revoked')e.revoked=true;
 if(kind==='expired approval')e.expiresAt=f.state.now;
 if(kind==='duplicate registry')f.state[side].records.set(keyOf(baseTenant),[clone(e),clone(e)]);
 if(kind==='bad JSON'||kind==='invalid UTF8'){const raw=kind==='bad JSON'?Buffer.from('{'):Buffer.from([255,254]);await fs.writeFile(file,raw);e.bundle.sha256=sha(raw);}
 if(kind==='throwing registry')f.state[side].hook=()=>{throw Error('SECRET_OPERATOR_PATH');};
 if(kind==='catalog mismatch')await rewrite(f,side,b=>{const m=JSON.parse(b.indexes.dino.manifestJson);m.catalogRevision='stale';b.indexes.dino.manifestJson=JSON.stringify(m);});
 if(kind==='dimension mismatch')await rewrite(f,side,b=>{const m=JSON.parse(b.indexes.siglip.manifestJson);m.model.dimension=384;b.indexes.siglip.manifestJson=JSON.stringify(m);});
 if(kind==='duplicate product')await rewrite(f,side,b=>{b.metadata.products.push(clone(b.metadata.products[0]));});
 if(kind==='duplicate mapping')await rewrite(f,side,b=>{const m=JSON.parse(b.indexes.siglip.mappingJson);m.push(clone(m[0]));b.indexes.siglip.mappingJson=JSON.stringify(m);});
 if(kind==='foreign product')await rewrite(f,side,b=>{b.metadata.products[0].estoreid='9'.repeat(24);});
 if(kind==='generation path')await rewrite(f,side,b=>{b.release.siglip.generation='../foreign';});
 if(kind==='OCR mismatch')await rewrite(f,side,b=>{b.pipeline.ocr.dictionarySha256='0'.repeat(64);});
 const response=await f.deny();assert.ok(!JSON.stringify(response.body).includes('SECRET_OPERATOR_PATH'));assert.ok(f.state.main.calls>0);assert.equal(f.state.builds,0);
 assert.equal(f.state.transports,side==='main'?0:1);assert.equal(f.state.ai.calls>0,side==='ai');
});
for(const kind of ['release UUID','approval version','catalog revision','siglip generation','dino generation'])test('independently valid but conflicting AI '+kind+' cannot replace signed main release',async t=>{
 const f=await harness(t),b=clone(bundle(f,'ai'));
 if(kind==='release UUID')b.release.releaseId=uid(999);
 if(kind==='approval version')b.release.approvalVersion++;
 if(kind==='catalog revision'){b.metadata.revision='independent-revision';b.release.catalog.snapshotRevision=b.metadata.revision;for(const slot of ['siglip','dino']){const m=JSON.parse(b.indexes[slot].manifestJson);m.catalogRevision=b.metadata.revision;b.indexes[slot].manifestJson=JSON.stringify(m);}}
 for(const slot of ['siglip','dino'])if(kind===slot+' generation'){const m=JSON.parse(b.indexes[slot].manifestJson);m.generation='g-'+uid(991);b.release[slot].generation=m.generation;b.indexes[slot].manifestJson=JSON.stringify(m);}
 repin(b);validateBundle(b,baseTenant,f.state.now);await f.publish('ai',b);await f.deny();assert.equal(f.state.lastError.code,'RELEASE_FORBIDDEN');assert.equal(f.state.builds,0);assert.ok(f.state.ai.calls>0);
});
for(const slot of ['siglip','dino'])test('actual opaque grants reject substituted '+slot+' JSON handle before result publication',async t=>{
 const f=await harness(t);f.state.handleHook=(h,s)=>s===slot?{...h,generation:'g-'+uid(999)}:h;await f.deny();assert.equal(f.state.lastError.code,'INDEX_RELEASE_MISMATCH');assert.equal(f.state.runs,1);assert.equal(f.state.handles,slot==='siglip'?0:1);
});
for(const kind of ['catalog','index','model','policy','foreign product','truncated','scan ID','release'])test('main raw conformance rejects synthetic result substitution '+kind,async t=>{
 const f=await harness(t);f.state.transportAfter=async response=>{if(response.status!==200)return;const raw=JSON.parse(response.body.toString()),d=raw.result.results[0];
  if(kind==='catalog')d.catalogRevision='foreign';if(kind==='index')d.indexGenerations.siglip2='g-'+uid(999);if(kind==='model')d.models.siglip2.dimension=384;
  if(kind==='policy')d.policy.version='unapproved';if(kind==='foreign product')d.candidates[0].productId='9'.repeat(24);
  if(kind==='truncated')raw.result.detector.quality.truncated=true;if(kind==='scan ID')raw.result.scanId=uid(999);if(kind==='release')raw.result.release.digest='0'.repeat(64);
  response.body=Buffer.from(JSON.stringify(raw));};await f.deny();assert.equal(f.state.runs,1);assert.equal(f.state.handles,2);
});
for(const kind of ['unsigned','forged signature','body tamper','correlation'])test('real private verifier rejects '+kind+' before AI reader/worker',async t=>{
 const f=await harness(t);f.state.transportBefore=async req=>{if(kind==='unsigned')delete req.headers['x-multi-scan-capability'];if(kind==='forged signature')req.headers['x-multi-scan-capability']='invalid.'+'0'.repeat(64);if(kind==='body tamper')req.body.release.digest='0'.repeat(64);if(kind==='correlation')req.headers['x-request-id']=uid(999);};
 await f.deny();assert.equal(f.state.ai.calls,0);assert.equal(f.state.builds,0);assert.equal(f.state.lastError.status,401);
});
for(const kind of ['body tenant','signed foreign store','signed foreign package','index path'])test('even a signed substituted '+kind+' cannot select another tenant/index',async t=>{
 const f=await harness(t);f.state.transportBefore=async req=>{
  if(kind==='body tenant')req.body.tenant.storeId='9'.repeat(24);
  if(kind==='signed foreign store'){req.body.tenant.storeId='9'.repeat(24);resign(req,{storeId:'9'.repeat(24)});return;}
  if(kind==='signed foreign package'){req.body.tenant.packageId='8'.repeat(24);resign(req,{packageId:'8'.repeat(24)});return;}
  if(kind==='index path')req.body.indexPath='/etc/passwd';resign(req);
 };await f.deny();assert.equal(f.state.builds,0);
});
test('exact captured private request replay fails without second worker or local source read',async t=>{
 const f=await harness(t);await ready(f);await turn();const calls=f.state.ai.calls;await assert.rejects(f.receiver({...f.state.request,signal:undefined}),{code:'CAPABILITY_REPLAY'});assert.equal(f.state.runs,1);assert.equal(f.state.ai.calls,calls);
});
test('same principal/submission/image returns server-owned cached scan without a second transport',async t=>{
 const f=await harness(t),a=await ready(f),b=await ready(f);assert.equal(a.scanId,b.scanId);assert.deepEqual(a.review,b.review);assert.equal(f.state.transports,1);assert.equal(f.state.runs,1);
});
for(const kind of ['cloned principal','foreign store','index selection'])test('worker grant boundary rejects '+kind,async t=>{
 const f=await harness(t);f.state.contextHook=ctx=>kind==='cloned principal'?{...ctx,principal:Object.freeze({...ctx.principal})}:kind==='foreign store'?{...ctx,tenant:{...ctx.tenant,storeId:'9'.repeat(24)}}:{...ctx,indexPath:'/foreign'};
 await f.deny();assert.equal(f.state.handles,0);assert.equal(f.state.runs,1);
});
test('closed opaque principal cannot be reused after receiver settlement',async t=>{
 const f=await harness(t);await ready(f);await turn();const calls=f.state.ai.calls;await assert.rejects(f.state.grants.pin(f.state.contexts[0],'siglip'),{code:'REQUEST_GRANT_REQUIRED'});assert.equal(f.state.ai.calls,calls);
});
for(const kind of ['main before','main during membership','AI before','AI during open','AI during worker'])test('expired authorization fails closed '+kind,async t=>{
 const f=await harness(t);
 if(kind==='main before'){await f.deny({extra:{authtoken:f.token(0,{exp:f.state.now-1})}});assert.equal(f.state.main.calls,0);return;}
 if(kind==='main during membership'){let changed=false;f.state.membershipHook=()=>{if(!changed){changed=true;f.state.now+=901;}};}
 if(kind==='AI before')f.state.transportBefore=async()=>{f.state.now+=61;};
 if(kind==='AI during open')f.state.ai.hook=()=>{if(f.state.ai.calls===1)f.state.now+=61;};
 if(kind==='AI during worker')f.state.workerAfter=()=>{f.state.now+=61;};
 await f.deny();assert.equal(f.state.runs,kind==='AI during worker'?1:0);
});
for(const side of ['main','ai'])for(const phase of ['resolution','owned work','before main completion'])test(side==='ai'&&phase==='before main completion'?'AI revocation after its last checked boundary blocks the next request, without a global atomicity claim':side+' revocation at '+phase+' prevents publication',async t=>{
 const f=await harness(t);
 if(phase==='resolution')f.state[side].hook=()=>{if(f.state[side].calls===2)entry(f,side).revoked=true;};
 if(phase==='owned work')f.state.workerAfter=()=>{entry(f,side).revoked=true;};
 if(phase==='before main completion')f.state.transportAfter=async()=>{entry(f,side).revoked=true;};
 if(side==='ai'&&phase==='before main completion'){
  // No API promises global revocation after AI's last checked boundary. Prove the next private request rejects.
  await ready(f);await turn();await f.deny({id:uid(1001)});assert.equal(f.state.runs,1);
 }else{await f.deny();assert.equal(f.state.runs,phase==='resolution'?0:1);}
});
for(const side of ['main','ai'])for(const kind of ['traversal','absolute','leaf symlink','root symlink','parent swap'])test(side+' source preserves filesystem boundary under '+kind,async t=>{
 const f=await harness(t),e=entry(f,side),selected=path.join(f.state[side].root,e.bundle.file),outside=path.join(f.root,'outside');await fs.mkdir(outside);await fs.writeFile(path.join(outside,e.bundle.file),'SECRET_OUTSIDE');
 if(kind==='traversal')e.bundle.file='../outside/'+e.bundle.file;
 if(kind==='absolute')e.bundle.file=path.join(outside,e.bundle.file);
 if(kind==='leaf symlink'){await fs.unlink(selected);await fs.symlink(path.join(outside,e.bundle.file),selected);}
 if(kind==='root symlink'){await fs.rename(f.state[side].root,path.join(f.root,'moved'));await fs.symlink(outside,f.state[side].root);}
 if(kind==='parent swap'){
  const open=fs.open,observed=[];let swapped=false;
  fs.open=async function(filename,...args){
   if(String(filename).endsWith('/'+e.bundle.file)&&!swapped){swapped=true;await fs.rename(f.state[side].root,path.join(f.root,'moved'));await fs.symlink(outside,f.state[side].root);}
   const h=await open.call(this,filename,...args);
   if(String(filename).endsWith('/'+e.bundle.file)){const read=h.read.bind(h);h.read=async function(bytes,offset,length,position){const result=await read(bytes,offset,length,position);observed.push(Buffer.from(bytes.subarray(offset,offset+result.bytesRead)));return result;};}return h;
  };
  try{await f.deny();assert.equal(swapped,true);assert.equal(sha(Buffer.concat(observed)),e.bundle.sha256);assert.ok(!Buffer.concat(observed).toString().includes('SECRET_OUTSIDE'));}finally{fs.open=open;}
 }else await f.deny();
 assert.equal(f.state.builds,0);assert.equal(f.state.transports,side==='main'?0:1);
});
for(const side of ['main','ai'])for(const kind of ['registry changes','file changes'])test(side+' inconsistent current source at an await fails closed: '+kind,async t=>{
 const f=await harness(t);f.state[side].hook=async()=>{if(f.state[side].calls===2){if(kind==='registry changes')entry(f,side).approvalVersion++;else await fs.appendFile(path.join(f.state[side].root,entry(f,side).bundle.file),' ');}};
 await f.deny();assert.equal(f.state.builds,0);assert.equal(f.state.transports,side==='main'?0:1);
});
for(const [side,create] of [['main',createReleaseSource],['ai',createAiSource]])for(const config of [{},{root:'/tmp'},{root:'relative',currentApprovals:async()=>null},{root:'/tmp',currentApprovals:{}}])test(side+' source construction rejects missing/invalid configuration '+Object.keys(config),()=>{
 assert.throws(()=>create(config),{code:'RELEASE_SOURCE_UNAVAILABLE',status:503});
});
test('disabled P6 construction remains inert without resolving source properties',()=>{
 const disabled=createScannerAssembly({enabled:false,get releaseProvider(){throw Error('Must not inspect');}});assert.equal(disabled.router,null);assert.equal(disabled.isReady(),false);return disabled.close();
});
for(const key of ['releaseProvider','repository','aiConfig','ownerMode'])test('P6 missing '+key+' rejects without reader or transport activity',async t=>{
 const f=await harness(t);assert.throws(()=>createScannerAssembly({...f.options,[key]:undefined}));assert.equal(f.state.main.calls,0);assert.equal(f.state.ai.calls,0);assert.equal(f.state.transports,0);
});
for(const key of ['provider','serviceKey','buildWorker','replayOwner'])test('P5 missing '+key+' rejects before source/worker activity',async t=>{
 const f=await harness(t);assert.throws(()=>createReceiver({...f.receiverOptions,[key]:undefined}));assert.equal(f.state.ai.calls,0);assert.equal(f.state.builds,0);
});
test('missing upload runtime rejects a real composed upload before either source or private worker',async t=>{
 const f=await harness(t);f.state.runtimeHook=()=>({});await f.deny();assert.equal(f.state.main.calls,0);assert.equal(f.state.ai.calls,0);assert.equal(f.state.transports,0);assert.equal(f.state.builds,0);
});

for(const kind of ['throws','invalid worker'])test('worker initialization '+kind+' is isolated and cannot retry into a permissive fallback',async t=>{
 const f=await harness(t);f.state.buildHook=()=>{if(kind==='throws')throw Error('SECRET_WORKER');return {};};await f.deny();assert.equal(f.state.builds,1);assert.equal(f.state.runs,0);
 await f.deny({id:uid(1001)});assert.equal(f.state.builds,1);assert.equal(f.state.runs,0);
});
test('two real store releases share one owner without leaking metadata, scans or grants',async t=>{
 const f=await harness(t,{twoStores:true}),a=await ready(f),b=await ready(f,{i:1,id:uid(1001)});
 assert.deepEqual(a.tenant,baseTenant);assert.equal(b.tenant.storeId,'9'.repeat(24));assert.equal(b.tenant.packageId,'8'.repeat(24));
 assert.equal(a.review.detections[0].candidates[0].productId,baseProduct);assert.equal(b.review.detections[0].candidates[0].productId,'6'.repeat(24));
 assert.equal(b.review.detections[0].candidates[0].currentPrice.retail,11);assert.ok(!JSON.stringify(a.review).includes('6'.repeat(24)));assert.ok(!JSON.stringify(b.review).includes(baseProduct));
 assert.equal((await f.status(a.scanId,1)).status,403);assert.equal((await f.status(b.scanId,0)).status,403);assert.equal((await f.status(a.scanId)).status,200);
 assert.equal(f.state.runs,2);assert.equal(f.state.handles,4);assert.equal(f.state.builds,1);assert.equal(f.state.contexts[0].tenant.storeId,baseTenant.storeId);assert.equal(f.state.contexts[1].tenant.storeId,'9'.repeat(24));
});
test('actual worker owner retains timed-out synthetic work until settlement; no overlapping operation',async t=>{
 const f=await harness(t,{timeoutMs:500,workerTimeoutMs:60}),start=deferred(),finish=deferred();f.state.unblock.push(finish.resolve);
 f.state.workerBefore=async()=>{start.resolve();await finish.promise;};const scan=f.deny();await start.promise;await scan;
 assert.equal(f.receiver.stats().busy,true);await f.deny({id:uid(1001)});assert.equal(f.state.lastError.code,'RECEIVER_BUSY');assert.equal(f.state.runs,1);
 finish.resolve();for(let i=0;i<40&&f.receiver.stats().busy;i++)await new Promise(r=>setTimeout(r,5));assert.equal(f.receiver.stats().busy,false);
});
test('cancelling a processing P3 scan blocks late result without pretending the worker has exited',async t=>{
 const f=await harness(t),start=deferred(),finish=deferred();f.state.unblock.push(finish.resolve);
 f.state.workerBefore=async()=>{start.resolve();await finish.promise;};const scan=f.scan();await start.promise;
 const id=f.state.request.body.scanId,processing=await f.status(id);assert.equal(processing.status,200);assert.equal(processing.body.status,'processing');
 const cancelled=await f.cancel(processing.body);assert.equal(cancelled.status,200);assert.equal(cancelled.body.status,'cancelled');assert.equal(f.receiver.stats().busy,true);
 finish.resolve();const late=await scan;assert.notEqual(late.status,200);assert.equal(late.body.review,undefined);const final=await f.status(id);assert.equal(final.body.status,'cancelled');assert.equal(final.body.review,undefined);
});
