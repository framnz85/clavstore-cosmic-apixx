'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fixture=require('./release-fixture.json');
const {createApprovedReleaseProvider,validateBundle,digest,sha}=require('../../../services/multi-scan/stage12/approved-release');
const clone=value=>JSON.parse(JSON.stringify(value)),tenant=fixture.bundle.release.tenant;
function harness() {
  const state={bundle:clone(fixture.bundle),now:1800000000,approved:true,calls:0};
  const grant=Object.freeze({}),other=Object.freeze({});
  const authority={async revalidate(input){assert.equal(input,grant);return {...tenant,userId:fixture.userId,role:'cashier'};}};
  const provider={async load(scope){state.calls++;assert.equal(scope.storeId,tenant.storeId);return state.bundle;},async approval(){return state.approved;}};
  const releases=createApprovedReleaseProvider({authority,provider,clock:()=>state.now});
  return {state,grant,other,releases,authority,provider};
}
function repin(bundle) {
  const r=bundle.release;r.catalog.metadataSha256=digest(bundle.metadata);r.catalog.productSetSha256=digest(bundle.metadata.products.map(p=>p._id));
  for(const slot of ['siglip','dino']){r[slot].manifestSha256=sha(bundle.indexes[slot].manifestJson);r[slot].modelAndPreprocessorDigest=digest(JSON.parse(bundle.indexes[slot].manifestJson).model);}
}
function editManifest(bundle,slot,edit){const m=JSON.parse(bundle.indexes[slot].manifestJson);edit(m);bundle.indexes[slot].manifestJson=JSON.stringify(m);repin(bundle);}
test('test fixture is explicitly synthetic; valid approved tuple resolves immutable private handle',async()=>{
  assert.equal(fixture.testOnly,true);const f=harness(),r=await f.releases.resolve(f.grant);
  assert.equal(r.digest,digest(f.state.bundle.release));assert.ok(Object.isFrozen(r));assert.equal(await f.releases.assertActive(r),r);
  assert.ok(Object.isFrozen(f.releases.details(r).metadata.products));
});
for(const options of [{},{authority:{}},{authority:{revalidate(){}}},{authority:{revalidate(){}},provider:{load(){}}}]){
 test('missing trusted authority or approved provider fails closed',()=>assert.throws(()=>createApprovedReleaseProvider(options),error=>error.status===503));
}
const attacks=[
 ['wrong store',b=>{b.release.tenant.storeId='9'.repeat(24);}],
 ['missing bundle',()=>null],['unknown release',()=>({})],['missing index metadata',b=>{delete b.indexes.dino;}],
 ['missing OCR dictionary',b=>{delete b.pipeline.ocr.dictionarySha256;}],
 ['mismatched dimensions',b=>editManifest(b,'siglip',m=>{m.model.dimension=384;})],
 ['mismatched DINO dimensions',b=>editManifest(b,'dino',m=>{m.model.dimension=768;})],
 ['SigLIP DINO mismatch',b=>{b.indexes.dino=clone(b.indexes.siglip);repin(b);}],
 ['stale catalog',b=>editManifest(b,'dino',m=>{m.catalogRevision='stale';})],
 ['foreign generation tenant',b=>editManifest(b,'siglip',m=>{m.tenant.storeId='9'.repeat(24);})],
 ['path in generation',b=>{b.release.siglip.generation='../../other-store';}],
 ['arbitrary path field',b=>{b.release.indexPath='/etc/passwd';}],
 ['invalid metadata price field',b=>{b.metadata.products[0].price=1;repin(b);}],
 ['metadata foreign product',b=>{b.metadata.products[0].estoreid='9'.repeat(24);repin(b);}],
 ['forged metadata digest',b=>{b.release.catalog.metadataSha256='0'.repeat(64);}],
 ['unapproved mapping product',b=>{const m=JSON.parse(b.indexes.siglip.mappingJson);m[0].productId='9'.repeat(24);b.indexes.siglip.mappingJson=JSON.stringify(m);editManifest(b,'siglip',v=>{v.files['mapping.json']={bytes:Buffer.byteLength(b.indexes.siglip.mappingJson),sha256:sha(b.indexes.siglip.mappingJson)};});}],
 ['invalid provider output',()=>[]],['incomplete release',b=>{delete b.release.pipeline;}],
 ['duplicate metadata product',b=>{b.metadata.products.push(clone(b.metadata.products[0]));repin(b);}],
 ['OCR metadata mismatch',b=>{b.pipeline.ocr.dictionarySha256='0'.repeat(64);}],
 ['policy mismatch',b=>{b.pipeline.policy.version='other';}],
 ['expired release',b=>{b.release.expiresAt=1800000000;}],['future release',b=>{b.release.issuedAt=1800000001;}],
 ['overlong release',b=>{b.release.expiresAt=1800003601;}]
];
for(const [name,mutate] of attacks) test(name+' fails even when injected approval says true',async()=>{
 const f=harness(),changed=mutate(f.state.bundle);if(changed!==undefined)f.state.bundle=changed;
 await assert.rejects(f.releases.resolve(f.grant),error=>[403,503].includes(error.status));
});
test('revoked and invalid approval output fail closed',async()=>{for(const approved of [false,null,undefined,{approved:true},1]){const f=harness();f.state.approved=approved;await assert.rejects(f.releases.resolve(f.grant),{code:'RELEASE_UNAPPROVED'});}});
test('approval revocation and stale release changes invalidate existing handles',async()=>{
 const f=harness(),r=await f.releases.resolve(f.grant);f.state.approved=false;await assert.rejects(f.releases.assertActive(r));
 f.state.approved=true;f.state.bundle.release.approvalVersion++;await assert.rejects(f.releases.assertActive(r),{code:'RELEASE_CHANGED'});
});
test('cloned release handle cannot authorize metadata access',async()=>{const f=harness(),r=await f.releases.resolve(f.grant);await assert.rejects(f.releases.assertActive({...r}),{code:'RELEASE_HANDLE_REQUIRED'});assert.throws(()=>f.releases.details({...r}));});
test('client selection options and substituted grants do not choose indexes',async()=>{
 const f=harness();await assert.rejects(f.releases.resolve(f.grant,{indexPath:'/tmp/foreign'}),{code:'RELEASE_SELECTION_FORBIDDEN'});
 await assert.rejects(f.releases.resolve(f.other));assert.equal(f.state.calls,0);
});
test('provider exceptions and malformed trusted scope reject without leaking source details',async()=>{
 const f=harness();const p={...f.provider,load:async()=>{throw Error('private-path');}};
 const r=createApprovedReleaseProvider({authority:f.authority,provider:p,clock:()=>f.state.now});
 await assert.rejects(r.resolve(f.grant),error=>error.status===503&&!error.message.includes('private-path'));
 const bad=createApprovedReleaseProvider({authority:{revalidate:async()=>({storeId:tenant.storeId})},provider:f.provider});
 await assert.rejects(bad.resolve(f.grant),{code:'AUTHORITY_INVALID'});
});
test('expiry during approval and cancellation invalidate resolution',async()=>{
 const f=harness();const r=createApprovedReleaseProvider({authority:f.authority,provider:{...f.provider,approval:async()=>{f.state.now+=3601;return true;}},clock:()=>f.state.now});
 await assert.rejects(r.resolve(f.grant),{code:'RELEASE_EXPIRED'});
 const controller=new AbortController();controller.abort();await assert.rejects(f.releases.resolve(f.grant,{signal:controller.signal}),{code:'ABORTED'});
});
test('raw validator itself never mints a provider handle',async()=>{const f=harness(),raw=validateBundle(f.state.bundle,tenant,f.state.now);await assert.rejects(f.releases.assertActive(raw.release),{code:'RELEASE_HANDLE_REQUIRED'});});
const jwt=require('jsonwebtoken');
const {createScannerAuthority}=require('../../../services/multi-scan/stage12/scanner-authority');
const {createConformanceGuard}=require('../../../services/multi-scan/stage12/conformance');
async function realAuthority() {
 const f=harness(),config={enabled:true,key:'p2-test-only-scanner-key-1234567890123',issuer:'cosmic-clavstore-scanner',audience:'clavstore-multiscan-review',ttl:900};
 const repository={usersByEmail:async()=>[{_id:fixture.userId,email:'cashier@example.test',role:'cashier',estoreid:tenant.storeId,resellid:tenant.packageId}],
 store:async()=>({_id:tenant.storeId,resellid:tenant.packageId,status:'active',accessibility:{cashier:['orders']}}),
 packageOwner:async()=>({_id:tenant.packageId,status:'active',reseller:{status:true}})};
 const authority=createScannerAuthority({sessionConfig:config,repository,clock:()=>f.state.now});
 const token=jwt.sign({sub:fixture.userId,email:'cashier@example.test',storeId:tenant.storeId,packageId:tenant.packageId,
 iss:config.issuer,aud:config.audience,iat:f.state.now,exp:f.state.now+900},config.key);
 const grant=await authority.authenticate({token,requestedStoreId:tenant.storeId});
 const releases=createApprovedReleaseProvider({authority,provider:f.provider,clock:()=>f.state.now});
 return {...f,authority,grant,releases};
}
function envelope(data,r) {
 const models={siglip2:data.indexes.siglip.manifest.model,dinov2:data.indexes.dino.manifest.model,ocr:data.pipeline.ocr};
 const candidates=[{productId:fixture.bundle.metadata.products[0]._id,...tenant,rank:1,rankingScore:.5,reviewRequired:true,reviewReasons:[],conflicts:[],scores:Object.fromEntries(['siglip2','dinov2'].map(name=>[name,{similarity:.5,rank:1,referenceId:'front',modelVersion:models[name].modelRevision,indexGeneration:name==='siglip2'?r.siglip.generation:r.dino.generation}]))}];
 return {ok:true,requestId:'test-request',tenant,result:{schemaVersion:1,scanId:'test-scan',tenant,release:{id:r.releaseId,digest:r.digest},reviewRequired:true,acceptanceAllowed:false,reviewReasons:[],
 detector:{model:data.pipeline.detector,image:{width:100,height:100},quality:{truncated:false,candidateLimitApplied:false}},results:[{detectionId:'det_1',tenant,models,indexGenerations:{siglip2:r.siglip.generation,dinov2:r.dino.generation},catalogRevision:r.catalog.snapshotRevision,policy:{...data.pipeline.policy,settings:{}},candidates,status:'review_required',quantity:1,reviewRequired:true,acceptanceAllowed:false,reviewReasons:[],detection:{box:[0,0,50,50]},ocr:{rawText:'',normalizedText:'',regions:[],quality:{width:50,height:50}}}]}};
}
test('P1 private grant is required; requested store never becomes release authority',async()=>{
 const f=await realAuthority(),r=await f.releases.resolve(f.grant);assert.equal(r.tenant.storeId,tenant.storeId);
 await assert.rejects(f.releases.resolve({...f.grant}),{code:'INVALID_SESSION'});
 f.state.now+=901;await assert.rejects(f.releases.assertActive(r),{code:'INVALID_SESSION'});
});
test('complete pinned raw response normalizes without trusting AI price or stock',async()=>{
 const f=await realAuthority(),r=await f.releases.resolve(f.grant),raw=envelope(f.releases.details(r),r);
 raw.result.results[0].candidates[0].price=999;raw.result.results[0].candidates[0].stock=999;
 const normalized=await createConformanceGuard({releases:f.releases})(raw,{release:r,requestId:'test-request',scanId:'test-scan'});
 assert.equal(normalized.detections[0].candidates[0].price,undefined);assert.equal(normalized.detections[0].candidates[0].stock,undefined);
});
for(const [label,mutate] of [
 ['detector truncation',r=>{r.detector.quality.truncated=true;}],['candidate truncation',r=>{r.detector.quality.candidateLimitApplied=true;}],
 ['crop truncation',r=>{r.reviewReasons.push('CROP_LIMIT_APPLIED');}],['unapproved generation',r=>{r.results[0].indexGenerations.dinov2='other';}],
 ['wrong OCR dictionary',r=>{r.results[0].models.ocr.dictionarySha256='0'.repeat(64);}],['foreign model dimensions',r=>{r.results[0].models.siglip2.dimension=384;}],
 ['foreign candidate',r=>{r.results[0].candidates[0].productId='9'.repeat(24);}],['wrong policy',r=>{r.results[0].policy.settings={other:true};}],
 ['wrong release echo',r=>{r.release.id='unknown';}],['missing completeness',r=>{delete r.detector.quality.truncated;}]
]) test('raw conformance rejects '+label,async()=>{
 const f=await realAuthority(),r=await f.releases.resolve(f.grant),raw=clone(envelope(f.releases.details(r),r));mutate(raw.result);
 await assert.rejects(createConformanceGuard({releases:f.releases})(raw,{release:r,requestId:'test-request',scanId:'test-scan'}));
});
