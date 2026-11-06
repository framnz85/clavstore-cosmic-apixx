'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),jwt=require('jsonwebtoken');
const fixture=require('./release-fixture.json');
const {createScannerAuthority}=require('../../../services/multi-scan/stage12/scanner-authority');
const {createApprovedReleaseProvider,sha,digest}=require('../../../services/multi-scan/stage12/approved-release');
const {createScanRegistry}=require('../../../services/multi-scan/stage12/scan-registry');
const clone=v=>JSON.parse(JSON.stringify(v)),tenant=fixture.bundle.release.tenant,productId=fixture.bundle.metadata.products[0]._id;
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,image=()=>Buffer.from('synthetic-normalized-upload');
function rawEnvelope(bundle,ctx,specs=[{}]) {
 const models={siglip2:JSON.parse(bundle.indexes.siglip.manifestJson).model,dinov2:JSON.parse(bundle.indexes.dino.manifestJson).model,ocr:bundle.pipeline.ocr};
 return {ok:true,requestId:ctx.requestId,tenant:ctx.tenant,result:{schemaVersion:1,scanId:ctx.scanId,tenant:ctx.tenant,release:ctx.release,
 reviewRequired:true,acceptanceAllowed:false,reviewReasons:[],detector:{model:bundle.pipeline.detector,image:{width:100,height:100},quality:{truncated:false,candidateLimitApplied:false}},results:specs.map((spec,i)=>({detectionId:'det_'+i,tenant:ctx.tenant,models,indexGenerations:{siglip2:bundle.release.siglip.generation,dinov2:bundle.release.dino.generation},catalogRevision:bundle.release.catalog.snapshotRevision,policy:{...bundle.pipeline.policy,settings:{}},status:spec.unknown?'unknown_or_unverified':spec.uncertain?'conflict_review':'review_required',reviewRequired:true,acceptanceAllowed:false,reviewReasons:spec.uncertain?['MULTIPLE_PLAUSIBLE_SKUS']:[],detection:{box:[0,0,50,50]},ocr:{rawText:'PRIVATE_OCR_TEXT',normalizedText:'',regions:[],quality:{width:50,height:50}},candidates:spec.unknown?[]:[{productId,...ctx.tenant,rank:1,rankingScore:.5,price:999,stock:999,reviewRequired:true,reviewReasons:[],conflicts:[],scores:Object.fromEntries(['siglip2','dinov2'].map(name=>[name,{similarity:.5,rank:1,referenceId:'front',modelVersion:models[name].modelRevision,indexGeneration:name==='siglip2'?bundle.release.siglip.generation:bundle.release.dino.generation}]))}]}))}};
}
function harness(settings={}) {
 const state={now:1800000000,bundle:clone(fixture.bundle),approved:true,reads:0,searches:0,specs:[{}],readHook:null,searchHook:null};let ids=0;
 const users=[{_id:fixture.userId,email:'first@example.test',role:'cashier',estoreid:tenant.storeId,estoreids:['6'.repeat(24)],resellid:tenant.packageId},
 {_id:'5'.repeat(24),email:'second@example.test',role:'cashier',estoreid:tenant.storeId,resellid:tenant.packageId}];
 const config={enabled:true,key:'p3-synthetic-session-key-not-production-123456789',issuer:'cosmic-clavstore-scanner',audience:'clavstore-multiscan-review',ttl:900};
 const repository={usersByEmail:async email=>users.filter(u=>u.email===email),store:async id=>({_id:id,resellid:tenant.packageId,status:'active',accessibility:{cashier:['orders'],moderator:['orders']}}),packageOwner:async()=>({_id:tenant.packageId,status:'active',reseller:{status:true}})};
 const authority=createScannerAuthority({sessionConfig:config,repository,clock:()=>state.now});
 const releases=createApprovedReleaseProvider({authority,provider:{load:async()=>state.bundle,approval:async()=>state.approved},clock:()=>state.now});
 const recognition={read:async ctx=>{state.reads++;if(state.readHook)return state.readHook(ctx);return {normalizedImageSha256:ctx.normalizedImageSha256,envelope:rawEnvelope(state.bundle,ctx,state.specs)};}};
 const corrections={search:async(grant,ctx)=>{state.searches++;if(state.searchHook)return state.searchHook(grant,ctx);return {tenant:ctx.tenant,revision:'current-catalog-v1',products:[{productId:'7'.repeat(24),...ctx.tenant,activate:true}]};}};
 const dependencies={authority,releases,recognition,corrections,ownerMode:'single-process',clock:()=>state.now,idFactory:()=>uid(++ids)};
 const create=overrides=>createScanRegistry({...dependencies,...overrides});
 const registry=create(settings);
 async function grant({user=0,storeId=tenant.storeId,lifetime=900}={}) {
  const u=users[user],token=jwt.sign({sub:u._id,email:u.email,storeId,packageId:tenant.packageId,iss:config.issuer,aud:config.audience,iat:state.now,exp:state.now+lifetime},config.key);
  return authority.authenticate({token,requestedStoreId:storeId});
 }
 return {state,users,authority,releases,recognition,corrections,dependencies,create,registry,grant};
}
async function reserve(f,params={}) {const grant=await f.grant(params.grant),r=await f.registry.reserve(grant,{submissionId:params.id||uid(1000),image:params.image||image()});return {...r,grant};}
async function ready(f,params) {const r=await reserve(f,params),started=await f.registry.start(r.worker,{expectedRevision:r.scan.revision}),scan=await f.registry.complete(r.worker,{expectedRevision:started.revision});return {...r,scan};}
const choice=(id='det_0',qty=1,p=productId)=>({detectionId:id,productId:p,quantity:qty});
async function reviewed(f) {const r=await ready(f),review=await f.registry.review(r.grant,{scanId:r.scan.scanId,expectedRevision:r.scan.revision,decisions:[choice()]});return {...r,...review};}
function deferred() {let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
async function rejection(fn,code) {await assert.rejects(async()=>fn(),error=>error.code===code);}

test('unconfigured owner and trusted providers fail closed',()=>{
 assert.throws(()=>createScanRegistry(),{code:'OWNER_UNAVAILABLE'});
 const f=harness();for(const [field,value,code] of [['authority',{},'AUTHORITY_UNAVAILABLE'],['releases',{},'RELEASE_PROVIDER_UNAVAILABLE'],['recognition',{},'RECOGNITION_PROVIDER_UNAVAILABLE'],['corrections',{},'CORRECTION_PROVIDER_UNAVAILABLE'],['ownerMode','multi-process','OWNER_UNAVAILABLE']])assert.throws(()=>f.create({[field]:value}),{code});
});
test('real P1/P2 reserve -> processing -> validated review preserves hashes and private ownership',async()=>{
 const f=harness(),r=await ready(f);assert.equal(r.scan.status,'reviewable');assert.equal(r.scan.normalizedImageSha256,sha(image()));assert.equal(f.state.reads,1);
 assert.equal(r.scan.detections[0].candidateExactIds[0],productId);assert.equal(r.scan.reviewDigest,null);assert.equal(r.scan.cartMutation,false);assert.equal(r.scan.authorization,false);assert.ok(Object.isFrozen(r.scan));
 const text=JSON.stringify(r.scan);for(const forbidden of ['PRIVATE_OCR_TEXT','synthetic-normalized-upload','first@example.test','"price"','"stock"'])assert.ok(!text.includes(forbidden));
});
test('same owned submission/image is idempotent, returns no replacement worker and never extends TTL',async()=>{
 const f=harness(),r=await reserve(f);f.state.now+=5;const same=await f.registry.reserve(r.grant,{submissionId:r.scan.submissionId,image:image()});
 assert.equal(same.duplicate,true);assert.equal(same.worker,null);assert.equal(same.scan.scanId,r.scan.scanId);assert.equal(same.scan.expiresAt,r.scan.expiresAt);assert.equal(f.state.reads,0);
 await rejection(()=>f.registry.reserve(r.grant,{submissionId:r.scan.submissionId,image:Buffer.from('other')}),'SUBMISSION_CONFLICT');
});
test('concurrent duplicate reservations have one server owner',async()=>{
 const f=harness(),g=await f.grant(),items=await Promise.all(Array.from({length:6},()=>f.registry.reserve(g,{submissionId:uid(1000),image:image()})));
 assert.equal(items.filter(v=>v.worker).length,1);assert.equal(f.registry.stats().records,1);
});
test('same submission hint from independent users stays independently scoped',async()=>{
 const f=harness(),a=await reserve(f),b=await reserve(f,{grant:{user:1}});assert.notEqual(a.scan.scanId,b.scan.scanId);assert.equal(f.registry.stats().records,2);
});
test('cross-store and cross-principal status/review/cancellation are denied',async()=>{
 const f=harness(),r=await ready(f);
 for(const g of [await f.grant({user:1}),await f.grant({storeId:'6'.repeat(24)})]) {
  await rejection(()=>f.registry.status(g,{scanId:r.scan.scanId}),'SCAN_FORBIDDEN');
  await rejection(()=>f.registry.cancel(g,{scanId:r.scan.scanId,expectedRevision:r.scan.revision}),'SCAN_FORBIDDEN');
 }
});
test('forged P1 grants, cloned workers and fabricated scan IDs are unusable',async()=>{
 const f=harness(),r=await reserve(f);
 await rejection(()=>f.registry.status({...r.grant},{scanId:r.scan.scanId}),'INVALID_SESSION');
 await rejection(()=>f.registry.start({...r.worker},{expectedRevision:0}),'WORKER_REQUIRED');
 await rejection(()=>f.registry.status(r.grant,{scanId:uid(999)}),'SCAN_EXPIRED');
});
test('client scan IDs, tenant/release hints and claimed image hashes cannot create provenance',async()=>{
 const f=harness(),g=await f.grant();
 for(const extra of [{scanId:uid(99)},{tenant},{release:fixture.bundle.release},{normalizedImageSha256:'a'.repeat(64)}])await rejection(()=>f.registry.reserve(g,{submissionId:uid(1000),image:image(),...extra}),'INVALID_REQUEST');
 await rejection(()=>f.registry.reserve(g,{submissionId:uid(1000),image:{type:'Buffer',data:[1]}}),'INVALID_SCAN_REQUEST');assert.equal(f.registry.stats().records,0);
});
test('reservation TTL is capped by session, release and five-minute review window',async()=>{
 const f=harness(),a=await reserve(f);assert.equal(a.scan.expiresAt,f.state.now+300);
 const g=await f.grant({lifetime:45}),b=await f.registry.reserve(g,{submissionId:uid(1001),image:image()});assert.equal(b.scan.expiresAt,f.state.now+45);
 f.state.bundle.release.expiresAt=f.state.now+20;const c=await reserve(f,{id:uid(1002)});assert.equal(c.scan.expiresAt,f.state.now+20);
});
test('expired authorization cannot reserve or inspect a scan',async()=>{
 const f=harness(),r=await reserve(f,{grant:{lifetime:10}});f.state.now+=11;
 await rejection(()=>f.registry.status(r.grant,{scanId:r.scan.scanId}),'INVALID_SESSION');
});
test('revoked or changed approved release cannot be substituted into a scan',async()=>{
 const f=harness(),r=await reserve(f);f.state.approved=false;await rejection(()=>f.registry.start(r.worker,{expectedRevision:0}),'RELEASE_UNAPPROVED');
 f.state.approved=true;f.state.bundle.release.approvalVersion++;
 await rejection(()=>f.registry.status(r.grant,{scanId:r.scan.scanId}),'RELEASE_CHANGED');
 await rejection(()=>f.registry.reserve(r.grant,{submissionId:r.scan.submissionId,image:image()}),'RELEASE_CONFLICT');
});
test('invalid trusted authority/release output never creates a record',async()=>{
 const f=harness(),g=await f.grant();
 for(const authority of [{revalidate:async()=>null},{revalidate:async()=>({storeId:tenant.storeId})}]) {const registry=f.create({authority});await assert.rejects(registry.reserve(g,{submissionId:uid(1000),image:image()}));assert.equal(registry.stats().records,0);}
 const releases={resolve:async()=>({...fixture.bundle.release,digest:digest(fixture.bundle.release)}),assertActive:async()=>false,details:()=>({})};
 const registry=f.create({releases});await rejection(()=>registry.reserve(g,{submissionId:uid(1000),image:image()}),'RELEASE_PROVIDER_INVALID');
});
test('missing, invalid, mismatched-image or forged recognition output fails terminally',async()=>{
 for(const variant of ['missing','image','foreign','exception']) {
  const f=harness();f.state.readHook=async ctx=>{
   if(variant==='exception')throw Error('private database/password details');if(variant==='missing')return {};
   const envelope=rawEnvelope(f.state.bundle,ctx);if(variant==='foreign')envelope.result.results[0].candidates[0].productId='9'.repeat(24);
   return {normalizedImageSha256:variant==='image'?'0'.repeat(64):ctx.normalizedImageSha256,envelope};
  };
  const r=await reserve(f),s=await f.registry.start(r.worker,{expectedRevision:0});
  await assert.rejects(f.registry.complete(r.worker,{expectedRevision:s.revision}),error=>!error.message.includes('private database'));
  assert.equal((await f.registry.status(r.grant,{scanId:r.scan.scanId})).status,'failed');assert.equal(f.registry.stats().running,0);
  const retry=await f.registry.reserve(r.grant,{submissionId:r.scan.submissionId,image:image()});assert.equal(retry.worker,null);assert.equal(retry.scan.status,'failed');
 }
});
test('client cannot provide recognition results to the completion contract',async()=>{
 const f=harness(),r=await reserve(f);await rejection(()=>f.registry.complete(r.worker,{expectedRevision:0,envelope:{}}),'INVALID_REQUEST');assert.equal(f.state.reads,0);
});
test('stale versions and duplicate completion never publish twice',async()=>{
 const f=harness(),r=await reserve(f);await rejection(()=>f.registry.start(r.worker,{expectedRevision:99}),'STALE_REVISION');
 const started=await f.registry.start(r.worker,{expectedRevision:0});await rejection(()=>f.registry.start(r.worker,{expectedRevision:0}),'STALE_REVISION');
 await f.registry.complete(r.worker,{expectedRevision:started.revision});await rejection(()=>f.registry.complete(r.worker,{expectedRevision:started.revision}),'WORKER_REQUIRED');assert.equal(f.state.reads,1);
});
test('cancellation beats a late provider result and does not free running ownership early',async()=>{
 const f=harness(),wait=deferred();let ctx;f.state.readHook=async c=>{ctx=c;return wait.promise;};const r=await reserve(f);await f.registry.start(r.worker,{expectedRevision:0});
 const completing=f.registry.complete(r.worker,{expectedRevision:1});while(!ctx)await new Promise(resolve=>setImmediate(resolve));
 await rejection(()=>f.registry.complete(r.worker,{expectedRevision:1}),'WORK_BUSY');
 await f.registry.cancel(r.grant,{scanId:r.scan.scanId,expectedRevision:1});assert.equal(f.registry.stats().running,1);
 assert.throws(()=>f.registry.settle(r.worker),{code:'WORK_BUSY'});
 wait.resolve({normalizedImageSha256:ctx.normalizedImageSha256,envelope:rawEnvelope(f.state.bundle,ctx)});
 await rejection(()=>completing,'STALE_REVISION');assert.equal((await f.registry.status(r.grant,{scanId:r.scan.scanId})).status,'cancelled');assert.equal(f.registry.stats().running,0);
});
test('expiry keeps in-flight records until settlement and rejects the late result',async()=>{
 const f=harness({limits:{maxRecords:1}}),wait=deferred();let ctx;f.state.readHook=async c=>{ctx=c;return wait.promise;};
 const r=await reserve(f);await f.registry.start(r.worker,{expectedRevision:0});const completing=f.registry.complete(r.worker,{expectedRevision:1});while(!ctx)await new Promise(resolve=>setImmediate(resolve));
 f.state.now+=301;assert.equal(f.registry.stats().records,1);assert.equal(f.registry.stats().running,1);
 await rejection(()=>reserve(f,{id:uid(1002)}),'SCAN_CAPACITY');
 wait.resolve({normalizedImageSha256:ctx.normalizedImageSha256,envelope:rawEnvelope(f.state.bundle,ctx)});
 await assert.rejects(completing);assert.equal(f.registry.stats().records,0);
});
test('restart invalidates scan IDs, writer/worker handles and pending old publication',async()=>{
 const f=harness(),r=await reserve(f);f.registry.dispose();const next=f.create();
 await rejection(()=>next.status(r.grant,{scanId:r.scan.scanId}),'SCAN_EXPIRED');await rejection(()=>next.start(r.worker,{expectedRevision:0}),'WORKER_REQUIRED');
 await rejection(()=>f.registry.status(r.grant,{scanId:r.scan.scanId}),'OWNER_CLOSED');assert.notEqual(next.stats().ownerEpoch,r.scan.ownerEpoch);
});
test('per-user and global capacity retain unexpired terminal tombstones',async()=>{
 const f=harness({limits:{maxPerUser:1,maxRecords:2}}),r=await reserve(f);await f.registry.cancel(r.grant,{scanId:r.scan.scanId,expectedRevision:0});
 await rejection(()=>reserve(f,{id:uid(1001)}),'SCAN_CAPACITY');await reserve(f,{id:uid(1001),grant:{user:1}});
 f.state.now+=301;assert.equal(f.registry.stats().records,0);assert.equal((await reserve(f,{id:uid(1001)})).scan.status,'reserved');
});
test('record/global byte exhaustion never partially inserts provenance',async()=>{
 for(const limits of [{maxRecordBytes:1},{maxBytes:1}]) {
  const f=harness({limits});await rejection(()=>reserve(f),'PROVENANCE_CAPACITY');assert.deepEqual([f.registry.stats().records,f.registry.stats().bytes],[0,0]);
 }
});
test('large publication fails without leaving any partially recognized items',async()=>{
 const probe=harness(),reserved=await reserve(probe),base=probe.registry.stats().bytes;assert.equal(reserved.scan.status,'reserved');
 const f=harness({limits:{maxRecordBytes:base+10}}),r=await reserve(f);await f.registry.start(r.worker,{expectedRevision:0});
 await rejection(()=>f.registry.complete(r.worker,{expectedRevision:1}),'PROVENANCE_CAPACITY');const result=await f.registry.status(r.grant,{scanId:r.scan.scanId});assert.equal(result.status,'failed');assert.equal(result.detections,undefined);
});
test('server ID collision/invalid generator and invalid limit configuration fail closed',async()=>{
 const f=harness();assert.throws(()=>f.create({idFactory:()=>'/bad'}),{code:'INVALID_SERVER_ID'});assert.throws(()=>f.create({limits:{maxRecords:129}}),{code:'INVALID_CONFIG'});
 const bad=f.create({idFactory:()=>uid(1)}),g=await f.grant();await rejection(()=>bad.reserve(g,{submissionId:uid(1000),image:image()}),'SERVER_ID_COLLISION');assert.equal(bad.stats().records,0);
});
test('clock reversal fails closed rather than extending leases',async()=>{const f=harness();await reserve(f);f.state.now--;assert.throws(()=>f.registry.stats(),{code:'CLOCK_UNAVAILABLE'});});
test('review requires explicit decisions for every detection, preserves variants by exact ID and merges repeated SKU quantities',async()=>{
 const f=harness();f.state.specs=[{},{}];const r=await ready(f);
 await rejection(()=>f.registry.review(r.grant,{scanId:r.scan.scanId,expectedRevision:r.scan.revision,decisions:[choice()]}),'REVIEW_INCOMPLETE');
 const reviewed=await f.registry.review(r.grant,{scanId:r.scan.scanId,expectedRevision:r.scan.revision,decisions:[choice('det_0',2),choice('det_1',3)]});
 assert.equal(reviewed.scan.items[0].quantity,5);assert.equal(reviewed.scan.items.length,1);assert.equal(reviewed.scan.cartMutation,false);
});
test('unknown/uncertain candidates need current scoped correction or exclusion, never auto-selection',async()=>{
 for(const specs of [[{unknown:true}],[{uncertain:true}]]) {
  const f=harness();f.state.specs=specs;const r=await ready(f);
  await rejection(()=>f.registry.review(r.grant,{scanId:r.scan.scanId,expectedRevision:r.scan.revision,decisions:[choice()]}),'UNAUTHORIZED_SELECTION');
  const excluded=await f.registry.review(r.grant,{scanId:r.scan.scanId,expectedRevision:r.scan.revision,decisions:[{detectionId:'det_0',excluded:true}]});assert.equal(excluded.scan.items.length,0);
 }
});
test('arbitrary product/price/stock injection and fractional/excess quantities reject without revision change',async()=>{
 const f=harness(),r=await ready(f);
 for(const decision of [{...choice(),price:1},{...choice(),stock:999},choice('det_0',1,'9'.repeat(24)),choice('det_0',1.2),choice('det_0',101)]) {
  await assert.rejects(f.registry.review(r.grant,{scanId:r.scan.scanId,expectedRevision:r.scan.revision,decisions:[decision]}));
  assert.equal((await f.registry.status(r.grant,{scanId:r.scan.scanId})).revision,r.scan.revision);
 }
});
test('registered current correction is scoped, versioned and separated from another exact SKU',async()=>{
 const f=harness();f.state.specs=[{},{}];const r=await ready(f),searched=await f.registry.searchCorrections(r.grant,{scanId:r.scan.scanId,expectedRevision:r.scan.revision,detectionId:'det_1',query:'product'});
 const result=await f.registry.review(r.grant,{scanId:r.scan.scanId,expectedRevision:searched.revision,decisions:[choice('det_0'),choice('det_1',2,'7'.repeat(24))]});
 assert.equal(result.scan.items.length,2);assert.equal(result.scan.decisions[1].source.kind,'correction');assert.equal(result.scan.decisions[1].source.revision,'current-catalog-v1');assert.ok(result.scan.reviewDigest);
});
test('missing correction provider and malformed/foreign/inactive provider output fail closed',async()=>{
 const absent=harness({corrections:undefined}),a=await ready(absent);await rejection(()=>absent.registry.searchCorrections(a.grant,{scanId:a.scan.scanId,expectedRevision:a.scan.revision,detectionId:'det_0',query:'ok'}),'CORRECTION_PROVIDER_UNAVAILABLE');
 for(const variant of ['missing','foreign','inactive','duplicate','price']) {
  const f=harness();f.state.searchHook=async(g,ctx)=>{
   if(variant==='missing')return {};
   const p={productId:'7'.repeat(24),...ctx.tenant,activate:variant!=='inactive'};if(variant==='foreign')p.storeId='9'.repeat(24);if(variant==='price')p.price=1;
   return {tenant:ctx.tenant,revision:'current',products:variant==='duplicate'?[p,p]:[p]};
  };const r=await ready(f);await assert.rejects(f.registry.searchCorrections(r.grant,{scanId:r.scan.scanId,expectedRevision:r.scan.revision,detectionId:'det_0',query:'ok'}));assert.equal((await f.registry.status(r.grant,{scanId:r.scan.scanId})).corrections.length,0);
 }
});
test('correction result/rate/eligibility limits reject rather than silently truncate',async()=>{
 const f=harness({limits:{searchPerMinute:1,maxCorrections:1}}),r=await ready(f),s=await f.registry.searchCorrections(r.grant,{scanId:r.scan.scanId,expectedRevision:r.scan.revision,detectionId:'det_0',query:'ok'});
 await rejection(()=>f.registry.searchCorrections(r.grant,{scanId:r.scan.scanId,expectedRevision:s.revision,detectionId:'det_0',query:'ok'}),'CORRECTION_RATE_LIMIT');
 f.state.now+=60;f.state.searchHook=async(g,c)=>({tenant:c.tenant,revision:'new',products:[{productId:'8'.repeat(24),...c.tenant,activate:true}]});
 await rejection(()=>f.registry.searchCorrections(r.grant,{scanId:r.scan.scanId,expectedRevision:s.revision,detectionId:'det_0',query:'ok'}),'CORRECTION_CAPACITY');
});
test('pending correction is busy and late completion cannot revive a cancelled record',async()=>{
 const f=harness(),wait=deferred();let context;f.state.searchHook=async(g,c)=>{context=c;return wait.promise;};const r=await ready(f);
 const pending=f.registry.searchCorrections(r.grant,{scanId:r.scan.scanId,expectedRevision:r.scan.revision,detectionId:'det_0',query:'ok'});while(!context)await new Promise(resolve=>setImmediate(resolve));
 const current=await f.registry.status(r.grant,{scanId:r.scan.scanId});await rejection(()=>f.registry.searchCorrections(r.grant,{scanId:r.scan.scanId,expectedRevision:current.revision,detectionId:'det_0',query:'ok'}),'WORK_BUSY');
 await f.registry.cancel(r.grant,{scanId:r.scan.scanId,expectedRevision:current.revision});wait.resolve({tenant:context.tenant,revision:'current',products:[]});await rejection(()=>pending,'STALE_REVISION');assert.equal((await f.registry.status(r.grant,{scanId:r.scan.scanId})).status,'cancelled');
});
test('private provenance quote/confirmation metadata hooks record intent only and are replay-safe',async()=>{
 const f=harness(),r=await reviewed(f),quote={expectedRevision:r.scan.revision,quoteId:uid(2000),requestDigest:'a'.repeat(64),expiresAt:f.state.now+15};
 await rejection(()=>f.registry.recordQuote({...r.reviewLease},quote),'REVIEW_LEASE_REQUIRED');
 const q=await f.registry.recordQuote(r.reviewLease,quote);assert.equal(q.status,'quote-issued');assert.equal(q.authorization,false);
 assert.equal((await f.registry.recordQuote(r.reviewLease,quote)).revision,q.revision);
 const request={expectedRevision:q.revision,quoteId:quote.quoteId,attemptId:uid(2001),explicit:true},confirmed=await f.registry.recordConfirmation(r.reviewLease,request);
 assert.equal(confirmed.status,'confirmation-accepted');assert.equal(confirmed.cartMutation,false);assert.equal(confirmed.authorization,false);
 assert.equal((await f.registry.recordConfirmation(r.reviewLease,request)).revision,confirmed.revision);
 await rejection(()=>f.registry.recordConfirmation(r.reviewLease,{...request,attemptId:uid(2002)}),'ATTEMPT_CONFLICT');
 const duplicate=await f.registry.reserve(r.grant,{submissionId:r.scan.submissionId,image:image()});assert.equal(duplicate.worker,null);assert.equal(duplicate.scan.status,'confirmation-accepted');assert.equal(f.state.reads,1);
});
test('review changes invalidate old quote/writer and no confirmation occurs without explicit intent',async()=>{
 const f=harness(),r=await reviewed(f),q=await f.registry.recordQuote(r.reviewLease,{expectedRevision:r.scan.revision,quoteId:uid(2000),requestDigest:'a'.repeat(64),expiresAt:f.state.now+15});
 await rejection(()=>f.registry.recordConfirmation(r.reviewLease,{expectedRevision:q.revision,quoteId:uid(2000),attemptId:uid(2001),explicit:false}),'EXPLICIT_CONFIRMATION_REQUIRED');
 const newer=await f.registry.review(r.grant,{scanId:r.scan.scanId,expectedRevision:q.revision,decisions:[choice('det_0',2)]});assert.notEqual(newer.scan.reviewDigest,r.scan.reviewDigest);
 await rejection(()=>f.registry.recordConfirmation(r.reviewLease,{expectedRevision:newer.scan.revision,quoteId:uid(2000),attemptId:uid(2001),explicit:true}),'REVIEW_LEASE_REQUIRED');
});
test('expired provenance quote metadata cannot record confirmation or extend original expiry',async()=>{
 const f=harness(),r=await reviewed(f),q=await f.registry.recordQuote(r.reviewLease,{expectedRevision:r.scan.revision,quoteId:uid(2000),requestDigest:'a'.repeat(64),expiresAt:f.state.now+1});f.state.now+=2;
 await rejection(()=>f.registry.recordConfirmation(r.reviewLease,{expectedRevision:q.revision,quoteId:uid(2000),attemptId:uid(2001),explicit:true}),'QUOTE_EXPIRED');
 await rejection(()=>f.registry.recordQuote(r.reviewLease,{expectedRevision:q.revision,quoteId:uid(2000),requestDigest:'a'.repeat(64),expiresAt:f.state.now+10}),'QUOTE_CONFLICT');
});
test('explicit worker failure requires separate settlement and reserved cancellation cannot start',async()=>{
 const f=harness(),r=await reserve(f);await f.registry.start(r.worker,{expectedRevision:0});await f.registry.fail(r.worker,{expectedRevision:1});assert.equal(f.registry.stats().running,1);f.registry.settle(r.worker);assert.equal(f.registry.stats().running,0);
 const b=await reserve(f,{id:uid(1001)});await f.registry.cancel(b.grant,{scanId:b.scan.scanId,expectedRevision:0});await rejection(()=>f.registry.start(b.worker,{expectedRevision:0}),'WORKER_REQUIRED');
});
test('same hint after original tombstone expiry requires a new scan and never replays prior results',async()=>{
 const f=harness(),r=await ready(f);await f.registry.cancel(r.grant,{scanId:r.scan.scanId,expectedRevision:r.scan.revision});f.state.now+=301;
 const again=await f.registry.reserve(await f.grant(),{submissionId:r.scan.submissionId,image:image()});assert.notEqual(again.scan.scanId,r.scan.scanId);assert.equal(again.scan.status,'reserved');assert.ok(again.worker);assert.equal(f.state.reads,1);
});
test('over-limit correction results fail without partial registration',async()=>{
 const f=harness(),r=await ready(f);f.state.searchHook=async(g,c)=>({tenant:c.tenant,revision:'current',products:Array.from({length:21},(_,i)=>({productId:(i+20).toString(16).padStart(24,'0'),...c.tenant,activate:true}))});
 await rejection(()=>f.registry.searchCorrections(r.grant,{scanId:r.scan.scanId,expectedRevision:r.scan.revision,detectionId:'det_0',query:'ok'}),'CORRECTION_PROVIDER_INVALID');
 assert.equal((await f.registry.status(r.grant,{scanId:r.scan.scanId})).corrections.length,0);
});
test('failed correction attempts consume bounded rate budget and do not retain query text',async()=>{
 const f=harness({limits:{searchPerMinute:1}}),r=await ready(f);f.state.searchHook=async()=>({});
 await assert.rejects(f.registry.searchCorrections(r.grant,{scanId:r.scan.scanId,expectedRevision:r.scan.revision,detectionId:'det_0',query:'SENSITIVE_QUERY'}));
 const state=await f.registry.status(r.grant,{scanId:r.scan.scanId});assert.ok(!JSON.stringify(state).includes('SENSITIVE_QUERY'));
 await rejection(()=>f.registry.searchCorrections(r.grant,{scanId:r.scan.scanId,expectedRevision:state.revision,detectionId:'det_0',query:'ok'}),'CORRECTION_RATE_LIMIT');
});
test('quote provenance metadata capacity retains old IDs and empty reviews cannot authorize anything',async()=>{
 const f=harness(),r=await reviewed(f);let revision=r.scan.revision;
 for(let i=0;i<16;i++) revision=(await f.registry.recordQuote(r.reviewLease,{expectedRevision:revision,quoteId:uid(3000+i),requestDigest:'a'.repeat(64),expiresAt:f.state.now+15})).revision;
 await rejection(()=>f.registry.recordQuote(r.reviewLease,{expectedRevision:revision,quoteId:uid(4000),requestDigest:'a'.repeat(64),expiresAt:f.state.now+15}),'QUOTE_CAPACITY');
 const excluded=await f.registry.review(r.grant,{scanId:r.scan.scanId,expectedRevision:revision,decisions:[{detectionId:'det_0',excluded:true}]});
 await rejection(()=>f.registry.recordQuote(excluded.reviewLease,{expectedRevision:excluded.scan.revision,quoteId:uid(4000),requestDigest:'a'.repeat(64),expiresAt:f.state.now+15}),'REVIEW_REQUIRED');
});
test('membership changes invalidate outstanding private provenance writers',async()=>{
 const f=harness(),r=await reviewed(f);f.users[0].role='moderator';
 await rejection(()=>f.registry.recordQuote(r.reviewLease,{expectedRevision:r.scan.revision,quoteId:uid(2000),requestDigest:'a'.repeat(64),expiresAt:f.state.now+15}),'SESSION_CHANGED');
});
test('release revocation during private recognition validation cannot publish results',async()=>{
 const f=harness();f.state.readHook=async ctx=>{f.state.approved=false;return {normalizedImageSha256:ctx.normalizedImageSha256,envelope:rawEnvelope(f.state.bundle,ctx)};};
 const r=await reserve(f);await f.registry.start(r.worker,{expectedRevision:0});await rejection(()=>f.registry.complete(r.worker,{expectedRevision:1}),'RELEASE_UNAPPROVED');
 f.state.approved=true;assert.equal((await f.registry.status(r.grant,{scanId:r.scan.scanId})).status,'failed');
});
test('JSON inputs are captured before awaits so later mutations cannot alter reviewed intent',async()=>{
 const f=harness(),r=await ready(f),request={scanId:r.scan.scanId,expectedRevision:r.scan.revision,decisions:[choice()]};
 const pending=f.registry.review(r.grant,request);request.decisions[0].productId='9'.repeat(24);request.decisions[0].quantity=99;
 const result=await pending;assert.equal(result.scan.items[0].productId,productId);assert.equal(result.scan.items[0].quantity,1);
});
test('concurrent review writers use compare-and-set and cannot overwrite another revision',async()=>{
 const f=harness(),r=await ready(f);const outcomes=await Promise.allSettled([1,2].map(quantity=>f.registry.review(r.grant,{scanId:r.scan.scanId,expectedRevision:r.scan.revision,decisions:[choice('det_0',quantity)]})));
 assert.equal(outcomes.filter(v=>v.status==='fulfilled').length,1);assert.equal(outcomes.find(v=>v.status==='rejected').reason.code,'STALE_REVISION');
});
test('disposing an owner cannot revive a late result and does not pretend to cancel its provider',async()=>{
 const f=harness(),wait=deferred();let ctx;f.state.readHook=async c=>{ctx=c;return wait.promise;};const r=await reserve(f);await f.registry.start(r.worker,{expectedRevision:0});
 const pending=f.registry.complete(r.worker,{expectedRevision:1});while(!ctx)await new Promise(resolve=>setImmediate(resolve));f.registry.dispose();
 assert.equal(f.registry.stats().records,0);wait.resolve({normalizedImageSha256:ctx.normalizedImageSha256,envelope:rawEnvelope(f.state.bundle,ctx)});await rejection(()=>pending,'OWNER_CLOSED');assert.equal(f.registry.stats().disposed,true);
});
test('invalid image envelope and unknown correction detection invoke no source',async()=>{
 const f=harness(),g=await f.grant();for(const bad of [Buffer.alloc(0),Buffer.alloc(10485761),'base64-client-string'])await rejection(()=>f.registry.reserve(g,{submissionId:uid(1000),image:bad}),'INVALID_SCAN_REQUEST');
 const r=await ready(f);await rejection(()=>f.registry.searchCorrections(r.grant,{scanId:r.scan.scanId,expectedRevision:r.scan.revision,detectionId:'unknown',query:'ok'}),'UNKNOWN_DETECTION');assert.equal(f.state.searches,0);
});
test('invalid approved-provider details cannot create provenance even with a valid resolve handle',async()=>{
 const f=harness(),g=await f.grant();
 for(const details of [()=>null,release=>Object.freeze({...f.releases.details(release),indexes:Object.freeze({})})]) {
  const registry=f.create({releases:{...f.releases,details}});
  await rejection(()=>registry.reserve(g,{submissionId:uid(1000),image:image()}),'RELEASE_PROVIDER_INVALID');assert.equal(registry.stats().records,0);
 }
});
test('global byte budget rejects another record while preserving the first record exactly',async()=>{
 const probe=harness();await reserve(probe);const size=probe.registry.stats().bytes;
 const f=harness({limits:{maxBytes:size+10}}),first=await reserve(f),before=f.registry.stats().bytes;
 await rejection(()=>reserve(f,{id:uid(1001)}),'PROVENANCE_CAPACITY');assert.equal(f.registry.stats().records,1);assert.equal(f.registry.stats().bytes,before);
 assert.deepEqual(await f.registry.status(first.grant,{scanId:first.scan.scanId}),first.scan);
});
