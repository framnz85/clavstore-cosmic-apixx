'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),jwt=require('jsonwebtoken');
const fixture=require('./release-fixture.json');
const {createScannerAuthority}=require('../../../services/multi-scan/stage12/scanner-authority');
const {createApprovedReleaseProvider}=require('../../../services/multi-scan/stage12/approved-release');
const {Catalog}=require('../../../services/multi-scan/stage7/catalog');
const {createReviewService,createCorrectionSource}=require('../../../services/multi-scan/stage12/review-service');
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
 const unusedCorrections={search:async(grant,ctx)=>{state.searches++;if(state.searchHook)return state.searchHook(grant,ctx);return {tenant:ctx.tenant,revision:'current-catalog-v1',products:[{productId:'7'.repeat(24),...ctx.tenant,activate:true}]};}};
 state.rows=[{_id:productId,estoreid:tenant.storeId,slug:'rice-1kg',title:'Rice',variantName:'1kg',activate:true,price:10,quantity:30,segregate:false,wholesale:[{wcount:5,wprice:8}]}];
 repository.products=async(storeId,ids)=>{if(state.productHook)return state.productHook(storeId,ids);return clone(state.rows.filter(p=>ids.includes(p._id)));};
 repository.brands=async()=>[];repository.searchProducts=async()=>{state.searches++;return state.searchRows===undefined?clone(state.rows):state.searchRows;};
 const catalog=new Catalog({repository,security:authority.security,imagePolicy:{}});
 const corrections=createCorrectionSource({authority,catalog,repository});
 const dependencies={authority,releases,recognition,corrections,ownerMode:'single-process',clock:()=>state.now,idFactory:()=>uid(++ids)};
 const create=overrides=>createScanRegistry({...dependencies,...overrides});
 const registry=create(settings);
 const serviceDependencies={authority,catalog,releases,registry,corrections,clock:()=>state.now,idFactory:()=>uid(10000+(++ids))};
 const service=createReviewService(serviceDependencies);
 async function grant({user=0,storeId=tenant.storeId,lifetime=900}={}) {
  const u=users[user],token=jwt.sign({sub:u._id,email:u.email,storeId,packageId:tenant.packageId,iss:config.issuer,aud:config.audience,iat:state.now,exp:state.now+lifetime},config.key);
  return authority.authenticate({token,requestedStoreId:storeId});
 }
 return {service,serviceDependencies,catalog,repository,unusedCorrections,state,users,authority,releases,recognition,corrections,dependencies,create,registry,grant};
}
async function reserve(f,params={}) {const grant=await f.grant(params.grant),r=await f.registry.reserve(grant,{submissionId:params.id||uid(1000),image:params.image||image()});return {...r,grant};}
async function ready(f,params) {const r=await reserve(f,params),started=await f.registry.start(r.worker,{expectedRevision:r.scan.revision}),scan=await f.registry.complete(r.worker,{expectedRevision:started.revision});return {...r,scan};}
const choice=(id='det_0',qty=1,p=productId)=>({detectionId:id,productId:p,quantity:qty});
function deferred() {let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
async function rejection(fn,code) {await assert.rejects(async()=>fn(),error=>error.code===code);}


async function quoted(f,params={}) {const r=await ready(f,params);const input={schemaVersion:2,scanId:r.scan.scanId,expectedRevision:r.scan.revision,expectedReviewVersion:r.scan.reviewVersion,decisions:[choice()],totals:[{productId,addedQuantity:1,existingQuantity:0,finalQuantity:1}],cartFingerprint:'a'.repeat(64)};const quote=await f.service.quote(r.grant,input);return {...r,input,quote};}
const confirmation=r=>({schemaVersion:2,scanId:r.scan.scanId,quoteId:r.quote.quoteId,requestDigest:r.quote.requestDigest,expectedReviewVersion:r.quote.reviewVersion,attemptId:uid(9000),explicit:true});
test('missing authority/catalog/release/registry and different Security instance fail closed',()=>{
 assert.throws(()=>createReviewService(),{code:'AUTHORITY_UNAVAILABLE'});const f=harness();
 for(const [key,value,code] of [['authority',{},'AUTHORITY_UNAVAILABLE'],['catalog',{},'CATALOG_UNAVAILABLE'],['catalog',{...f.catalog,security:{}},'CATALOG_UNAVAILABLE'],['releases',{},'RELEASE_PROVIDER_UNAVAILABLE'],['registry',{},'REGISTRY_UNAVAILABLE']])assert.throws(()=>createReviewService({...f.serviceDependencies,[key]:value}),{code});
});
test('fresh quote and final permit use actual P1/P2/P3/currentProduct, never AI prices',async()=>{
 const f=harness(),r=await quoted(f);assert.equal(r.quote.items[0].unitPrice,10);assert.equal(r.quote.items[0].product.slug,'rice-1kg');assert.equal(r.quote.expiresAt,f.state.now+15);assert.equal(r.quote.confirmed,false);
 const permit=await f.service.confirm(r.grant,confirmation(r));assert.equal(permit.expiresAt,f.state.now+5);assert.equal(permit.cartMutation,false);assert.equal(permit.accountAuthentication,false);assert.equal(permit.oneUse,true);assert.equal(permit.items[0].unitPrice,10);assert.ok(Object.isFrozen(permit));assert.equal(f.state.rows[0].quantity,30);
 const status=await f.service.attempt(r.grant,{schemaVersion:2,scanId:r.scan.scanId,attemptId:uid(9000)});assert.equal(status.status,'intent-recorded');assert.equal(status.replayAllowed,false);assert.ok(!('items' in status));assert.ok(!('requestDigest' in status));
});
test('repeated detections merge exact SKU added totals and bind final count',async()=>{
 const f=harness();f.state.specs=[{},{}];const r=await ready(f);const q=await f.service.quote(r.grant,{schemaVersion:2,scanId:r.scan.scanId,expectedRevision:2,expectedReviewVersion:0,decisions:[choice('det_0',2),choice('det_1',3)],totals:[{productId,addedQuantity:5,existingQuantity:2,finalQuantity:7}],cartFingerprint:'a'.repeat(64)});assert.equal(q.items.length,1);assert.equal(q.items[0].quantity,5);assert.equal(q.items[0].finalQuantity,7);assert.equal(q.items[0].unitPrice,10);
});
test('wholesale uses trusted current permission and requested final total',async()=>{
 const f=harness();f.users[0].wholesale=true;const r=await ready(f);const q=await f.service.quote(r.grant,{schemaVersion:2,scanId:r.scan.scanId,expectedRevision:2,expectedReviewVersion:0,decisions:[choice()],totals:[{productId,addedQuantity:1,existingQuantity:4,finalQuantity:5}],cartFingerprint:'a'.repeat(64)});assert.equal(q.items[0].unitPrice,8);assert.equal(q.items[0].product.price,10);
});
for(const [name,mutate,code] of [
 ['forged grant',(f,r)=>{r.grant={...r.grant};},'INVALID_SESSION'],
 ['other user',async(f,r)=>{r.grant=await f.grant({user:1});},'SCAN_FORBIDDEN'],
 ['other store',async(f,r)=>{r.grant=await f.grant({storeId:'6'.repeat(24)});},'SCAN_FORBIDDEN'],
 ['expired session',(f)=>{f.state.now+=901;},'INVALID_SESSION'],
 ['expired scan',(f)=>{f.state.now+=301;},'SCAN_EXPIRED'],
 ['revoked release',(f)=>{f.state.approved=false;},'RELEASE_UNAPPROVED'],
 ['changed release',(f)=>{f.state.bundle.release.approvalVersion++;},'RELEASE_CHANGED'],
 ['unknown scan',(f,r)=>{r.scan={...r.scan,scanId:uid(999)};},'SCAN_EXPIRED']
])test(name+' cannot obtain a permit',async()=>{const f=harness(),r=await quoted(f);await mutate(f,r);await rejection(()=>f.service.confirm(r.grant,confirmation(r)),code);});
for(const extra of [{price:1},{stock:100},{role:'admin'},{password:'private'},{tenant},{releaseId:uid(77)},{reviewDigest:'a'.repeat(64)},{indexPath:'/tmp/index'}])test('strict quote rejects '+Object.keys(extra)[0],async()=>{
 const f=harness(),r=await quoted(f);await rejection(()=>f.service.quote(r.grant,{...r.input,...extra}),'INVALID_REQUEST');
});
test('strict confirmation rejects forged provenance and unexpected credentials',async()=>{
 const f=harness(),r=await quoted(f);await rejection(()=>f.service.confirm(r.grant,{...confirmation(r),requestDigest:'b'.repeat(64)}),'STALE_REVIEW');await rejection(()=>f.service.confirm(r.grant,{...confirmation(r),password:'x'}),'INVALID_REQUEST');await rejection(()=>f.service.confirm(r.grant,{...confirmation(r),explicit:false}),'INVALID_CONFIRMATION');
});
for(const [name,change] of [['price',p=>p.price++],['stock',p=>p.quantity--],['slug',p=>p.slug='rice-new'],['variant',p=>p.variantName='2kg'],['wholesale',p=>p.wholesale[0].wprice=7],['updated revision',p=>p.updatedAt='2030-01-01'],['inactive',p=>p.activate=false],['insufficient stock',p=>p.quantity=0]])test('changed '+name+' invalidates quote without permit',async()=>{
 const f=harness(),r=await quoted(f);change(f.state.rows[0]);await rejection(()=>f.service.confirm(r.grant,confirmation(r)),'REVIEW_CHANGED');await rejection(()=>f.service.confirm(r.grant,confirmation(r)),'CONFIRMATION_REPLAY');
 const status=await f.service.attempt(r.grant,{schemaVersion:2,scanId:r.scan.scanId,attemptId:uid(9000)});assert.equal(status.status,'review-changed');assert.equal(status.permitId,null);
});
for(const [name,value] of [['null',null],['missing rows',[]],['duplicate rows','duplicate'],['foreign rows','foreign']])test('catalog '+name+' fails closed',async()=>{
 const f=harness(),r=await quoted(f);f.state.productHook=async()=>{if(value==='duplicate')return [clone(f.state.rows[0]),clone(f.state.rows[0])];if(value==='foreign')return [{...f.state.rows[0],estoreid:'6'.repeat(24)}];return value;};await assert.rejects(()=>f.service.confirm(r.grant,confirmation(r)));assert.equal((await f.service.attempt(r.grant,{schemaVersion:2,scanId:r.scan.scanId,attemptId:uid(9000)})).status,'uncertain');
});
test('catalog exception is sanitized and never returns a partial permit',async()=>{const f=harness(),r=await quoted(f);f.state.productHook=async()=>{throw Error('PRIVATE_DATABASE_CREDENTIAL');};await assert.rejects(()=>f.service.confirm(r.grant,confirmation(r)),e=>e.code==='CATALOG_UNAVAILABLE'&&!e.message.includes('PRIVATE'));});
test('stale review/revision rejects without mutating another review',async()=>{const f=harness(),r=await quoted(f);await rejection(()=>f.service.quote(r.grant,r.input),'STALE_REVIEW');await f.registry.review(r.grant,{scanId:r.scan.scanId,expectedRevision:r.quote.revision,decisions:[choice('det_0',2)]});await rejection(()=>f.service.confirm(r.grant,confirmation(r)),'STALE_REVIEW');});
test('cancelled scan cannot confirm old quote',async()=>{const f=harness(),r=await quoted(f);await f.registry.cancel(r.grant,{scanId:r.scan.scanId,expectedRevision:r.quote.revision});await rejection(()=>f.service.confirm(r.grant,confirmation(r)),'STALE_REVIEW');});
test('expired quote cannot confirm',async()=>{const f=harness(),r=await quoted(f);f.state.now+=15;await rejection(()=>f.service.confirm(r.grant,confirmation(r)),'QUOTE_EXPIRED');});
test('simultaneous confirmations produce one permit; same/different attempt replay denied',async()=>{
 const f=harness(),r=await quoted(f),out=await Promise.allSettled([f.service.confirm(r.grant,confirmation(r)),f.service.confirm(r.grant,confirmation(r))]);assert.equal(out.filter(v=>v.status==='fulfilled').length,1);assert.equal(out.filter(v=>v.status==='rejected').length,1);
 await rejection(()=>f.service.confirm(r.grant,confirmation(r)),'CONFIRMATION_REPLAY');await rejection(()=>f.service.confirm(r.grant,{...confirmation(r),attemptId:uid(9001)}),'CONFIRMATION_REPLAY');
});
test('lost response exposes metadata only, no reissued permit',async()=>{const f=harness(),r=await quoted(f);const p=await f.service.confirm(r.grant,confirmation(r)),s=await f.service.attempt(r.grant,{schemaVersion:2,scanId:r.scan.scanId,attemptId:uid(9000)});assert.equal(s.permitId,p.permitId);assert.equal(s.replayAllowed,false);assert.equal(s.items,undefined);await rejection(()=>f.service.confirm(r.grant,confirmation(r)),'CONFIRMATION_REPLAY');});
test('capacity retains consumed tombstones and never evicts to admit another quote',async()=>{
 const f=harness();const service=createReviewService({...f.serviceDependencies,limits:{maxRecords:1}});f.service=service;const r=await quoted(f);await service.confirm(r.grant,confirmation(r));await rejection(()=>service.quote(r.grant,r.input),'QUOTE_CAPACITY');assert.equal(service.stats().records,1);f.state.now+=301;assert.equal(service.stats().records,0);
});
test('quote byte capacity fails before metadata quote/permit issuance',async()=>{const f=harness();f.service=createReviewService({...f.serviceDependencies,limits:{maxBytes:1}});await rejection(()=>quoted(f),'QUOTE_CAPACITY');assert.equal(f.service.stats().records,0);});
test('quantity input must equal canonical per-detection additions',async()=>{const f=harness(),r=await ready(f);await rejection(()=>f.service.quote(r.grant,{schemaVersion:2,scanId:r.scan.scanId,expectedRevision:2,expectedReviewVersion:0,decisions:[choice()],totals:[{productId,addedQuantity:2,existingQuantity:0,finalQuantity:2}],cartFingerprint:'a'.repeat(64)}),'REVIEW_MISMATCH');});
for(const [name,modify] of [['negative',t=>t.existingQuantity=-1],['fraction',t=>t.addedQuantity=1.5],['over limit',t=>{t.existingQuantity=100;t.finalQuantity=101;}],['wrong sum',t=>t.finalQuantity=2],['credential',t=>t.password='x']])test('invalid totals '+name+' rejected',async()=>{const f=harness(),r=await quoted(f),t=clone(r.input);modify(t.totals[0]);await assert.rejects(()=>f.service.quote(r.grant,t));});
for(const [name,modify] of [['waiting',p=>p.waiting={_id:'8'.repeat(24),newQuantity:1}],['segregated',p=>p.segregate=true],['same-ID variant ambiguity',p=>p.variantName=['a','b']],['missing slug',p=>delete p.slug],['custom price',p=>p.priceChange=true]])test('unsupported '+name+' rejected before quote',async()=>{const f=harness();modify(f.state.rows[0]);await assert.rejects(()=>quoted(f));assert.equal(f.service.stats().records,0);});
test('unknown/uncertain cannot be selected without registered correction',async()=>{for(const specs of [[{unknown:true}],[{uncertain:true}]]){const f=harness();f.state.specs=specs;await rejection(()=>quoted(f),'UNAUTHORIZED_SELECTION');}});
test('correction facade searches scoped current rows, returns sanitized labels and registers unknown selection',async()=>{
 const f=harness();f.state.specs=[{unknown:true}];const r=await ready(f);const result=await f.service.search(r.grant,{schemaVersion:2,scanId:r.scan.scanId,expectedRevision:2,detectionId:'det_0',query:'Rice'});assert.equal(result.products[0].productId,productId);assert.equal(result.products[0].title,'Rice');assert.equal(result.products[0].price,undefined);
 const quote=await f.service.quote(r.grant,{schemaVersion:2,scanId:r.scan.scanId,expectedRevision:result.revision,expectedReviewVersion:result.reviewVersion,decisions:[choice()],totals:[{productId,addedQuantity:1,existingQuantity:0,finalQuantity:1}],cartFingerprint:'a'.repeat(64)});assert.equal(quote.items[0].unitPrice,10);
});
test('empty correction results cannot redisplay old candidates',async()=>{const f=harness(),r=await ready(f);const request={schemaVersion:2,scanId:r.scan.scanId,expectedRevision:2,detectionId:'det_0',query:'Rice'},a=await f.service.search(r.grant,request);f.state.searchRows=[];const b=await f.service.search(r.grant,{...request,expectedRevision:a.revision,query:'Other'});assert.deepEqual(b.products,[]);});
test('foreign/duplicate/oversized correction provider output is rejected',async()=>{for(const rows of [[{_id:productId,estoreid:'6'.repeat(24),activate:true}],Array.from({length:21},()=>({_id:productId,estoreid:tenant.storeId,activate:true})),[{_id:productId,estoreid:tenant.storeId,activate:true},{_id:productId,estoreid:tenant.storeId,activate:true}]]){const f=harness(),r=await ready(f);f.state.searchRows=rows;await rejection(()=>f.service.search(r.grant,{schemaVersion:2,scanId:r.scan.scanId,expectedRevision:2,detectionId:'det_0',query:'Rice'}),'CORRECTION_PROVIDER_UNAVAILABLE');}});
test('distinct corrected variant IDs remain separate, slug collisions rejected',async()=>{
 for(const collision of [false,true]){const f=harness();f.state.specs=[{unknown:true},{unknown:true}];const second={...clone(f.state.rows[0]),_id:'7'.repeat(24),slug:collision?'rice-1kg':'rice-2kg',variantName:'2kg'};f.state.rows.push(second);const r=await ready(f);let rev=2;for(const detectionId of ['det_0','det_1']){const res=await f.service.search(r.grant,{schemaVersion:2,scanId:r.scan.scanId,expectedRevision:rev,detectionId,query:'rice'});rev=res.revision;}
 const input={schemaVersion:2,scanId:r.scan.scanId,expectedRevision:rev,expectedReviewVersion:2,decisions:[choice(),choice('det_1',1,second._id)],totals:[productId,second._id].map(productId=>({productId,addedQuantity:1,existingQuantity:0,finalQuantity:1})),cartFingerprint:'a'.repeat(64)};
 if(collision)await rejection(()=>f.service.quote(r.grant,input),'SKU_COLLISION');else{const quote=await f.service.quote(r.grant,input);assert.equal(quote.items.length,2);assert.notEqual(quote.items[0].product.variantName,quote.items[1].product.variantName);}}
});
test('expired session during final catalog await issues no permit',async()=>{const f=harness(),r=await quoted(f);f.state.productHook=async()=>{f.state.now+=901;return clone(f.state.rows);};await rejection(()=>f.service.confirm(r.grant,confirmation(r)),'INVALID_SESSION');});
test('late catalog after cancellation cannot issue permit',async()=>{const f=harness(),r=await quoted(f),d=deferred();f.state.productHook=async()=>{await d.promise;return clone(f.state.rows);};const pending=f.service.confirm(r.grant,confirmation(r));await new Promise(resolve=>setImmediate(resolve));await f.registry.cancel(r.grant,{scanId:r.scan.scanId,expectedRevision:r.quote.revision});d.resolve();await rejection(()=>pending,'STALE_REVIEW');});
test('source errors and interrupted confirmation leave only uncertain metadata',async()=>{
 const f=harness(),r=await quoted(f);const broken={...f.registry,recordConfirmation:async()=>{throw Object.assign(Error('Safe'),{code:'OWNER_UNAVAILABLE',status:503});}};
 const service=createReviewService({...f.serviceDependencies,registry:broken});f.service=service;const s=await ready(f,{id:uid(1001)}),q=await service.quote(s.grant,{...r.input,scanId:s.scan.scanId});const attempt={...s,quote:q};await rejection(()=>service.confirm(s.grant,confirmation(attempt)),'OWNER_UNAVAILABLE');const status=await service.attempt(s.grant,{schemaVersion:2,scanId:s.scan.scanId,attemptId:uid(9000)});assert.equal(status.status,'uncertain');assert.equal(status.replayAllowed,false);
});
test('dispose/restart and backwards clock fail closed',async()=>{const f=harness(),r=await quoted(f);const restart=createReviewService(f.serviceDependencies);await rejection(()=>restart.confirm(r.grant,confirmation(r)),'QUOTE_EXPIRED');f.state.now--;assert.throws(()=>f.service.stats(),{code:'CLOCK_UNAVAILABLE'});f.state.now++;f.service.dispose();await rejection(()=>f.service.confirm(r.grant,confirmation(r)),'OWNER_CLOSED');});
test('invalid authority and registry outputs never produce quote or permit',async()=>{
 const f=harness(),r=await ready(f);const input={schemaVersion:2,scanId:r.scan.scanId,expectedRevision:2,expectedReviewVersion:0,decisions:[choice()],totals:[{productId,addedQuantity:1,existingQuantity:0,finalQuantity:1}],cartFingerprint:'a'.repeat(64)};
 for(const overrides of [{authority:{security:f.authority.security,revalidate:async()=>null}},{registry:{...f.registry,status:async()=>null}},{releases:{resolve:async()=>Object.freeze({}),assertActive:async r=>r,details:()=>null}}]){const service=createReviewService({...f.serviceDependencies,...overrides});await assert.rejects(()=>service.quote(r.grant,input));assert.equal(service.stats().records,0);}
});
test('missing correction dependency fails before registry search mutation',async()=>{const f=harness(),r=await ready(f),service=createReviewService({...f.serviceDependencies,corrections:undefined});await rejection(()=>service.search(r.grant,{schemaVersion:2,scanId:r.scan.scanId,expectedRevision:2,detectionId:'det_0',query:'rice'}),'CORRECTION_PROVIDER_UNAVAILABLE');assert.equal((await f.registry.status(r.grant,{scanId:r.scan.scanId})).revision,2);});
test('interrupted correction clears private result ticket for a later explicit search',async()=>{
 const f=harness(),r=await ready(f),d=deferred();f.state.productHook=async()=>{await d.promise;return clone(f.state.rows);};
 const pending=f.service.search(r.grant,{schemaVersion:2,scanId:r.scan.scanId,expectedRevision:2,detectionId:'det_0',query:'rice'});await new Promise(resolve=>setImmediate(resolve));
 await f.registry.review(r.grant,{scanId:r.scan.scanId,expectedRevision:3,decisions:[choice()]});d.resolve();await rejection(()=>pending,'STALE_REVISION');f.state.productHook=null;
 const scan=await f.registry.status(r.grant,{scanId:r.scan.scanId}),res=await f.service.search(r.grant,{schemaVersion:2,scanId:r.scan.scanId,expectedRevision:scan.revision,detectionId:'det_0',query:'rice'});assert.equal(res.products.length,1);
});
test('concurrent correction calls on same grant cannot exchange result tickets',async()=>{const f=harness(),r=await ready(f),d=deferred();f.state.productHook=async()=>{await d.promise;return clone(f.state.rows);};const request={schemaVersion:2,scanId:r.scan.scanId,expectedRevision:2,detectionId:'det_0',query:'rice'},pending=f.service.search(r.grant,request);await rejection(()=>f.service.search(r.grant,{...request,query:'other'}),'REVIEW_BUSY');d.resolve();assert.equal((await pending).products[0].productId,productId);});
test('quote and permit expiries remain capped by parent grant',async()=>{const f=harness(),r=await quoted(f,{grant:{lifetime:3}});assert.equal(r.quote.expiresAt,f.state.now+3);assert.equal((await f.service.confirm(r.grant,confirmation(r))).expiresAt,f.state.now+3);});
test('expiry while final confirmation hook awaits returns no usable permit',async()=>{
 const f=harness(),original=f.registry.recordConfirmation;const service=createReviewService({...f.serviceDependencies,registry:{...f.registry,recordConfirmation:async(...args)=>{const result=await original(...args);f.state.now+=6;return result;}}});f.service=service;const r=await quoted(f);await rejection(()=>service.confirm(r.grant,confirmation(r)),'PERMIT_EXPIRED');await rejection(()=>service.confirm(r.grant,confirmation(r)),'CONFIRMATION_REPLAY');assert.equal((await service.attempt(r.grant,{schemaVersion:2,scanId:r.scan.scanId,attemptId:uid(9000)})).status,'uncertain');
});
test('one attempt cannot be reused across another owned scan',async()=>{const f=harness(),a=await quoted(f),b=await quoted(f,{id:uid(1002)});await f.service.confirm(a.grant,confirmation(a));await rejection(()=>f.service.confirm(b.grant,confirmation(b)),'ATTEMPT_CONFLICT');});
test('aborted confirmation keeps a one-way uncertain result',async()=>{const f=harness(),r=await quoted(f),d=deferred(),abort=new AbortController();f.state.productHook=async()=>{await d.promise;return clone(f.state.rows);};const pending=f.service.confirm(r.grant,confirmation(r),{signal:abort.signal});await new Promise(resolve=>setImmediate(resolve));abort.abort();d.resolve();await assert.rejects(()=>pending);await rejection(()=>f.service.confirm(r.grant,confirmation(r)),'CONFIRMATION_REPLAY');});
test('optional null variant is a valid unambiguous single SKU',async()=>{const f=harness();f.state.rows[0].variantName=null;const r=await quoted(f);assert.equal(r.quote.items[0].product.variantName,null);});
test('input snapshot cannot be changed across asynchronous quote validation',async()=>{const f=harness(),r=await ready(f),input={schemaVersion:2,scanId:r.scan.scanId,expectedRevision:2,expectedReviewVersion:0,decisions:[choice()],totals:[{productId,addedQuantity:1,existingQuantity:0,finalQuantity:1}],cartFingerprint:'a'.repeat(64)};const pending=f.service.quote(r.grant,input);input.decisions[0].quantity=100;input.totals[0].addedQuantity=100;assert.equal((await pending).items[0].quantity,1);});
test('foreign attempt status cannot disclose another principal intent',async()=>{const f=harness(),r=await quoted(f);await f.service.confirm(r.grant,confirmation(r));await rejection(async()=>f.service.attempt(await f.grant({user:1}),{schemaVersion:2,scanId:r.scan.scanId,attemptId:uid(9000)}),'SCAN_FORBIDDEN');});
test('concurrent quote requests cannot publish competing reviews',async()=>{const f=harness(),r=await ready(f),input={schemaVersion:2,scanId:r.scan.scanId,expectedRevision:2,expectedReviewVersion:0,decisions:[choice()],totals:[{productId,addedQuantity:1,existingQuantity:0,finalQuantity:1}],cartFingerprint:'a'.repeat(64)},out=await Promise.allSettled([f.service.quote(r.grant,input),f.service.quote(r.grant,input)]);assert.equal(out.filter(v=>v.status==='fulfilled').length,1);assert.equal(out.find(v=>v.status==='rejected').reason.code,'REVIEW_BUSY');});
test('malformed final registry output cannot issue a permit',async()=>{const f=harness();f.service=createReviewService({...f.serviceDependencies,registry:{...f.registry,recordConfirmation:async()=>({status:'confirmation-accepted'})}});const r=await quoted(f);await rejection(()=>f.service.confirm(r.grant,confirmation(r)),'PROVENANCE_INVALID');assert.equal((await f.service.attempt(r.grant,{schemaVersion:2,scanId:r.scan.scanId,attemptId:uid(9000)})).status,'uncertain');});
test('current membership revocation blocks confirmation',async()=>{const f=harness(),r=await quoted(f);f.users[0].estoreid='6'.repeat(24);f.users[0].estoreids=[];await assert.rejects(()=>f.service.confirm(r.grant,confirmation(r)));});
test('malformed or substituted catalog pricing authority is rejected',async()=>{for(const change of [s=>delete s.wholesale,s=>s.wholesale='yes',s=>s.wholesale=!s.wholesale,s=>s.role='admin']){const f=harness(),r=await ready(f),catalog={security:f.authority.security,current:async(...args)=>{const v=await f.catalog.current(...args);v.scope={...v.scope};change(v.scope);return v;}},service=createReviewService({...f.serviceDependencies,catalog});await rejection(()=>service.quote(r.grant,{schemaVersion:2,scanId:r.scan.scanId,expectedRevision:2,expectedReviewVersion:0,decisions:[choice()],totals:[{productId,addedQuantity:1,existingQuantity:0,finalQuantity:1}],cartFingerprint:'a'.repeat(64)}),'CATALOG_INVALID');assert.equal(service.stats().records,0);}});
