'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createReleaseAuthorityDomain,POLICY,CAPABILITIES,STATES}=require('../../../services/multi-scan/stage13/release-authority-domain');
const {digest,sha,validateBundle}=require('../../../services/multi-scan/stage12/approved-release');
const fixture=require('../../../../clavstore-ai-image-api/tests/multi-scan/stage12/release-fixture.json');
const clone=v=>JSON.parse(JSON.stringify(v));
const authorityId='cosmic-scanner-release-authority';
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function harness(){
 const h={now:2000000000,serial:100,highWater:0};
 const bundle=clone(fixture.bundle);bundle.release.issuedAt=h.now;bundle.release.expiresAt=h.now+3600;
 h.tenant=clone(bundle.release.tenant);h.bundle=bundle;
 h.state={schemaVersion:1,authorityId,tenant:clone(h.tenant),sequence:0,updatedAt:h.now-1,activeReleaseId:null,records:[],tombstones:[],seenRequests:[]};
 const caps=new WeakMap(),observations=new WeakMap(),evidences=new WeakMap();
 const proof=(map,value)=>{const p=Object.freeze({});map.set(p,clone(value));return p;};
 const verify=map=>p=>{if(!map.has(p))throw Error('untrusted proof');return map.get(p);};
 h.ports={authorityId,verifyCapability:verify(caps),verifyObservation:verify(observations),verifyEvidence:verify(evidences)};
 h.domain=createReleaseAuthorityDomain(h.ports);
 h.cap=(overrides={})=>proof(caps,{authorityId,actorId:'operator_1',kind:'operator',tenant:h.tenant,capabilities:[...CAPABILITIES],issuedAt:h.now-10,expiresAt:h.now+3600,...overrides});
 h.observation=(state=h.state,overrides={})=>proof(observations,{authorityId,tenant:state.tenant,sequence:state.sequence,stateDigest:digest(state),observedAt:h.now,expiresAt:h.now+60,highWaterSequence:h.highWater,clockHealthy:true,available:true,consistent:true,...overrides});
 h.encoded=(b=h.bundle)=>{const bundleJson=JSON.stringify(b);return {bundleJson,bundlePin:{file:'release.json',sha256:sha(bundleJson)}};};
 h.evidence=(b=h.bundle,overrides={})=>{
  const r=validateBundle(b,h.tenant,h.now).release,raw={...r};delete raw.digest;
  const d={release:raw,digest:r.digest,bundle:h.encoded(b).bundlePin};
  return proof(evidences,{authorityId,tenant:h.tenant,actorId:'operator_1',descriptorDigest:digest(d),checkedAt:h.now,expiresAt:b.release.expiresAt,artifactBytesVerified:true,nativeCompatible:true,eligible:true,rightsPolicyId:'rights_fixture',qualityPolicyId:'quality_fixture',coveragePolicyId:'coverage_fixture',...overrides});
 };
 h.input=(action,overrides={})=>{
  const cmd={tenant:h.tenant,action,releaseId:h.bundle.release.releaseId,expectedSequence:h.state.sequence,requestId:uid(++h.serial),reasonCode:'OFFLINE_TEST'};
  if(['BUILD','VALIDATE','APPROVE','ACTIVATE','ROLLBACK'].includes(action))Object.assign(cmd,h.encoded());
  if(action==='VALIDATE')cmd.evidenceProof=h.evidence();
  return {state:h.state,observationProof:h.observation(),capabilityProof:h.cap(),now:h.now,command:cmd,...overrides};
 };
 h.commit=intent=>{assert.equal(intent.kind,'TRANSITION_INTENT');assert.equal(intent.committed,false);assert.equal(intent.transaction.compare.expectedSequence,h.state.sequence);assert.equal(intent.transaction.compare.expectedStateDigest,digest(h.state));h.state=clone(intent.decision);h.highWater=h.state.sequence;};
 h.step=(action,change=()=>{})=>{const input=h.input(action);change(input);const intent=h.domain.plan(input);h.commit(intent);return intent;};
 h.ready=(status='ACTIVE')=>{for(const action of ['BUILD','VALIDATE','APPROVE','ACTIVATE']){h.step(action);if({BUILD:'DRAFT',VALIDATE:'VALIDATED',APPROVE:'APPROVED',ACTIVATE:'ACTIVE'}[action]===status)break;}return h;};
 h.readInput=()=>({state:h.state,observationProof:h.observation(),capabilityProof:h.cap({capabilities:['READ'],kind:'consumer',actorId:'consumer_1'}),now:h.now});
 h.nextBundle=n=>{h.bundle=clone(bundle);h.bundle.release.releaseId=uid(n);h.bundle.release.approvalVersion=n;};
 return h;
}
const denied=(fn,code)=>assert.throws(fn,e=>e&&e.status===503&&e.message==='Release authority domain unavailable or denied'&&(!code||e.code===code));
test('full lifecycle produces deterministic frozen atomic decision/audit intents, never consumer approvals',()=>{
 const h=harness();for(const action of ['BUILD','VALIDATE','APPROVE','ACTIVATE']){
  const input=h.input(action),before=JSON.stringify(input),a=h.domain.plan(input),b=h.domain.plan(input);
  assert.deepEqual(a,b);assert.equal(JSON.stringify(input),before);assert.ok(Object.isFrozen(a)&&Object.isFrozen(a.decision.records));assert.equal(a.consumerApproval,false);assert.equal(a.transaction.atomicDecisionAndAudit,true);assert.equal(a.transaction.required,true);assert.equal(a.audit.sequence,a.decision.sequence);assert.equal(a.audit.previousSequence,input.state.sequence);assert.equal(a.audit.actorId,'operator_1');assert.equal(a.audit.retention.minimumDays,365);assert.equal(a.audit.retention.retainUntil,h.now+365*86400);assert.equal(a.audit.retention.legalHoldOverridesPurge,true);h.commit(a);
 }
 const r=h.domain.read(h.readInput());assert.equal(r.consumerApproval,false);assert.equal(r.kind,'READ_ELIGIBILITY');assert.equal(r.descriptor.release.releaseId,h.bundle.release.releaseId);assert.equal(r.notAfter,h.now+60);
 assert.equal(h.state.records.filter(r=>r.status==='ACTIVE').length,1);
});
test('build and validation do not imply approval or activation',()=>{
 const h=harness();for(const action of ['BUILD','VALIDATE','APPROVE']){h.step(action);assert.equal(h.state.activeReleaseId,null);denied(()=>h.domain.read(h.readInput()),'NO_ACTIVE_RELEASE');}
});
for(const missing of ['authorityId','verifyCapability','verifyObservation','verifyEvidence'])test('missing trusted factory dependency '+missing+' fails closed',()=>{const p={...harness().ports};delete p[missing];denied(()=>createReleaseAuthorityDomain(p));});
for(const policy of [{...POLICY,freshnessSeconds:61},{...POLICY,graceSeconds:1},{...POLICY,auditRetentionDays:364},{...POLICY,auditRetentionDays:366},{freshnessSeconds:60},null])test('strict approved retention/freshness policy '+JSON.stringify(policy),()=>denied(()=>createReleaseAuthorityDomain({...harness().ports,policy})));
test('all constants frozen and exact policy accepted',()=>{assert.ok(Object.isFrozen(POLICY)&&Object.isFrozen(CAPABILITIES)&&Object.isFrozen(STATES));assert.equal(createReleaseAuthorityDomain({...harness().ports,policy:{...POLICY}}).policy.auditRetentionDays,365);});
for(const proof of [undefined,null,{},Object.freeze({verified:true,role:'admin',capabilities:['APPROVE']})])test('missing/forged capability proof '+JSON.stringify(proof),()=>{const h=harness();denied(()=>h.domain.plan(h.input('BUILD',{capabilityProof:proof})),'CAPABILITY_UNTRUSTED');});
for(const kind of ['cashier','moderator','admin'])test('ordinary application '+kind+' is not authority',()=>{const h=harness();denied(()=>h.domain.plan(h.input('BUILD',{capabilityProof:h.cap({kind})})),'CAPABILITY_INVALID');});
for(const [action,capability] of [['BUILD','BUILD'],['VALIDATE','VALIDATE'],['APPROVE','APPROVE'],['ACTIVATE','ACTIVATE'],['REVOKE','REVOKE']])test('separate '+capability+' required for '+action,()=>{const h=harness();if(action!=='BUILD'&&action!=='REVOKE')h.ready({VALIDATE:'DRAFT',APPROVE:'VALIDATED',ACTIVATE:'APPROVED'}[action]);denied(()=>h.domain.plan(h.input(action,{capabilityProof:h.cap({capabilities:CAPABILITIES.filter(v=>v!==capability)})})),'CAPABILITY_DENIED');});
for(const kind of ['builder','consumer'])for(const action of ['APPROVE','REVOKE','ACTIVATE'])test(kind+' cannot claim '+action+' even if provider lists it',()=>{const h=harness();denied(()=>h.domain.plan(h.input(action,{capabilityProof:h.cap({kind,capabilities:[action]})})),'CAPABILITY_DENIED');});
test('explicit builder BUILD and consumer READ permitted only for delegated scope',()=>{const h=harness();h.step('BUILD',i=>{i.capabilityProof=h.cap({kind:'builder',actorId:'builder_1',capabilities:['BUILD']});});h.step('VALIDATE');h.step('APPROVE');h.step('ACTIVATE');assert.equal(h.domain.read(h.readInput()).kind,'READ_ELIGIBILITY');});
for(const edit of [c=>{c.tenant.storeId='a'.repeat(24);},c=>{c.tenant.packageId='b'.repeat(24);},c=>{c.authorityId='other';},c=>{c.expiresAt=2000000000;},c=>{c.issuedAt=2000000001;},c=>{c.capabilities=['BUILD','BUILD'];},c=>{c.role='admin';},c=>{c.actorId='person@example.com';}])test('invalid trusted capability output '+edit.toString(),()=>{const h=harness(),c={authorityId,actorId:'operator_1',kind:'operator',tenant:clone(h.tenant),capabilities:['BUILD'],issuedAt:h.now-1,expiresAt:h.now+60};edit(c);denied(()=>h.domain.plan(h.input('BUILD',{capabilityProof:h.cap(c)})));});
for(const field of ['storeId','packageId'])test('command '+field+' substitution denied',()=>{const h=harness(),i=h.input('BUILD');i.command.tenant={...h.tenant,[field]:'a'.repeat(24)};denied(()=>h.domain.plan(i),'TENANT_MISMATCH');});
for(const action of ['VALIDATE','APPROVE','ACTIVATE','EXPIRE','ROLLBACK'])test('invalid initial transition '+action,()=>{const h=harness(),i=h.input(action);if(action==='ROLLBACK')i.command.rollbackOf=uid(10);denied(()=>h.domain.plan(i));});
test('strict release metadata and exact bytes reuse actual P2 validation',()=>{
 const edits=[b=>{delete b.indexes.dino;},b=>{b.metadata.revision='wrong';},b=>{b.release.siglip.generation='../../evil';},b=>{b.release.dino.modelAndPreprocessorDigest='0'.repeat(64);},b=>{b.release.tenant.storeId='a'.repeat(24);},b=>{b.release.pipeline.policyDigest='0'.repeat(64);},b=>{b.metadata.products[0].price=1;},b=>{b.release.expiresAt=2000000000;},b=>{b.release.extra=true;}];
 for(const edit of edits){const h=harness();edit(h.bundle);denied(()=>h.domain.plan(h.input('BUILD')),'RELEASE_INVALID');}
 const h=harness(),i=h.input('BUILD');i.command.bundlePin.sha256='0'.repeat(64);denied(()=>h.domain.plan(i),'BUNDLE_INTEGRITY');
});
test('validly repinned wrong model dimensions/catalog still rejected by P2',()=>{
 for(const slot of ['siglip','dino']){const h=harness(),b=h.bundle,m=JSON.parse(b.indexes[slot].manifestJson);m.model.dimension=1;b.indexes[slot].manifestJson=JSON.stringify(m);b.release[slot].manifestSha256=sha(b.indexes[slot].manifestJson);b.release[slot].modelAndPreprocessorDigest=digest(m.model);denied(()=>h.domain.plan(h.input('BUILD')),'RELEASE_INVALID');}
});
for(const edit of [e=>{e.artifactBytesVerified=false;},e=>{e.nativeCompatible=false;},e=>{e.eligible=false;},e=>{e.descriptorDigest='0'.repeat(64);},e=>{e.qualityPolicyId='';},e=>{e.rightsPolicyId='';},e=>{e.coveragePolicyId='';},e=>{e.actorId='other';},e=>{e.checkedAt=2000000001;},e=>{e.expiresAt=2000000000;},e=>{e.expiresAt=2000004000;},e=>{e.tenant.storeId='a'.repeat(24);}])test('invalid independent validation evidence '+edit.toString(),()=>{
 const h=harness().ready('DRAFT'),base={authorityId,tenant:clone(h.tenant),actorId:'operator_1',descriptorDigest:'x',checkedAt:h.now,expiresAt:h.now+3600,artifactBytesVerified:true,nativeCompatible:true,eligible:true,rightsPolicyId:'rights',qualityPolicyId:'quality',coveragePolicyId:'coverage'};
 const i=h.input('VALIDATE'),d=h.state.records[0].descriptor;base.descriptorDigest=digest(d);edit(base);i.command.evidenceProof=h.evidence(h.bundle,base);denied(()=>h.domain.plan(i));
});
test('forged evidence, unknown fields, missing audit/reason and untrusted proof fail',()=>{
 const h=harness().ready('DRAFT');for(const proof of [{},null,{verified:true}]){const i=h.input('VALIDATE');i.command.evidenceProof=proof;denied(()=>h.domain.plan(i),'EVIDENCE_UNTRUSTED');}
 for(const change of [i=>{delete i.command.reasonCode;},i=>{i.command.reasonCode='password=secret';},i=>{i.command.customer={};},i=>{i.command.audit={};},i=>{i.command.requestId='bad';},i=>{i.command.bundlePin.file='../escape.json';},i=>{delete i.command.evidenceProof;}]){const i=h.input('VALIDATE');change(i);denied(()=>h.domain.plan(i));}
});
for(const bad of [{available:false},{consistent:false},{clockHealthy:false},{observedAt:1999999939,expiresAt:2000000000},{observedAt:2000000001},{expiresAt:2000000061},{expiresAt:2000000000},{sequence:1},{highWaterSequence:1},{stateDigest:'0'.repeat(64)},{tenant:{packageId:'a'.repeat(24),storeId:'b'.repeat(24)}}])test('stale/conflicting/unavailable observation '+JSON.stringify(bad),()=>{const h=harness();denied(()=>h.domain.plan(h.input('BUILD',{observationProof:h.observation(h.state,bad)})));});
test('60-second freshness boundary has zero grace',()=>{const h=harness(),i=h.input('BUILD');i.now+=59;assert.ok(h.domain.plan(i));i.now++;denied(()=>h.domain.plan(i),'OBSERVATION_STALE');});
test('unverified observation and missing high-water after restart deny',()=>{const h=harness();denied(()=>h.domain.plan(h.input('BUILD',{observationProof:{available:true}})),'OBSERVATION_UNTRUSTED');h.highWater=5;denied(()=>h.domain.plan(h.input('BUILD')),'SEQUENCE_REPLAY');});
test('older authenticated state is rejected against current high-water',()=>{const h=harness(),old=clone(h.state);h.step('BUILD');const i=h.input('REVOKE',{state:old,observationProof:h.observation(old)});i.command.expectedSequence=0;denied(()=>h.domain.plan(i),'SEQUENCE_REPLAY');});
test('conditional sequence, duplicate attempts and fake atomic repository reject second writer',()=>{
 const h=harness(),a=h.input('BUILD'),b=h.input('BUILD'),ia=h.domain.plan(a),ib=h.domain.plan(b);h.commit(ia);assert.throws(()=>h.commit(ib));
 const i=h.input('REVOKE');i.command.requestId=a.command.requestId;denied(()=>h.domain.plan(i),'REQUEST_REPLAY');i.command.requestId=uid(800);i.command.expectedSequence=0;denied(()=>h.domain.plan(i),'SEQUENCE_CONFLICT');
});
test('duplicate activation is rejected after commit, read requires READ capability',()=>{const h=harness().ready();denied(()=>h.domain.plan(h.input('ACTIVATE')),'TRANSITION_INVALID');denied(()=>h.domain.read({...h.readInput(),capabilityProof:h.cap({capabilities:['BUILD']})}),'CAPABILITY_DENIED');});
test('only one active release, supersession and authorized fresh rollback',()=>{
 const h=harness().ready(),first=h.bundle.release.releaseId;h.nextBundle(2);h.ready();assert.equal(h.state.records.find(r=>r.descriptor.release.releaseId===first).status,'SUPERSEDED');assert.equal(h.state.records.filter(r=>r.status==='ACTIVE').length,1);
 h.nextBundle(3);h.ready('APPROVED');const intent=h.step('ROLLBACK',i=>{i.command.rollbackOf=first;});assert.equal(intent.audit.action,'ROLLBACK');assert.equal(intent.audit.capability,'APPROVE_AND_ACTIVATE');assert.equal(h.state.activeReleaseId,h.bundle.release.releaseId);
});
test('rollback requires separate APPROVE and ACTIVATE capabilities and matching eligible artifacts',()=>{
 for(const missing of ['APPROVE','ACTIVATE']){const h=harness().ready(),first=h.bundle.release.releaseId;h.nextBundle(2);h.ready();h.nextBundle(3);h.ready('APPROVED');const i=h.input('ROLLBACK',{capabilityProof:h.cap({capabilities:CAPABILITIES.filter(v=>v!==missing)})});i.command.rollbackOf=first;denied(()=>h.domain.plan(i),'CAPABILITY_DENIED');}
 const h=harness().ready('APPROVED'),i=h.input('ROLLBACK');i.command.rollbackOf=uid(50);denied(()=>h.domain.plan(i),'ROLLBACK_INVALID');
});
test('emergency revoke needs no replacement or artifacts and emits durable tombstone intent',()=>{
 const h=harness().ready();h.now+=4000;const a=h.step('REVOKE');assert.equal(a.decision.activeReleaseId,null);assert.equal(a.decision.records[0].status,'REVOKED');assert.equal(a.decision.tombstones[0].sequence,a.decision.sequence);assert.equal(a.transaction.requiresDurableTombstones,true);denied(()=>h.domain.read(h.readInput()),'NO_ACTIVE_RELEASE');
 const i=h.input('REVOKE');i.command.releaseId=uid(400);h.commit(h.domain.plan(i));assert.equal(h.state.tombstones.length,2);
});
test('revoked release IDs cannot be silently rebuilt or reinstated with edited metadata',()=>{
 const h=harness().ready();h.step('REVOKE');for(const action of ['BUILD','VALIDATE','APPROVE','ACTIVATE'])denied(()=>h.domain.plan(h.input(action)),'RELEASE_REVOKED');
 h.bundle.release.approvalVersion++;denied(()=>h.domain.plan(h.input('BUILD')),'RELEASE_REVOKED');denied(()=>h.domain.plan(h.input('REVOKE')),'RELEASE_REVOKED');
});
test('rollback cannot select revoked identity as historical source',()=>{const h=harness().ready(),first=h.bundle.release.releaseId;h.step('REVOKE');h.nextBundle(2);h.ready();h.nextBundle(3);h.ready('APPROVED');const i=h.input('ROLLBACK');i.command.rollbackOf=first;denied(()=>h.domain.plan(i),'ROLLBACK_INVALID');});
test('raw expiry and evidence expiry deny approval/read; timestamp rewriting cannot renew identity',()=>{
 const h=harness().ready('VALIDATED');h.now+=3600;denied(()=>h.domain.plan(h.input('APPROVE')),'RELEASE_INVALID');h.bundle.release.issuedAt=h.now;h.bundle.release.expiresAt=h.now+3600;denied(()=>h.domain.plan(h.input('APPROVE')),'RELEASE_MISMATCH');
 const a=harness().ready();a.now+=3600;denied(()=>a.domain.read(a.readInput()),'RELEASE_EXPIRED');a.step('EXPIRE');assert.equal(a.state.activeReleaseId,null);assert.equal(a.state.records[0].status,'EXPIRED');
});
test('audit has only bounded identifiers and no proof/bundle/image/customer/credential contents',()=>{const h=harness(),i=h.input('BUILD'),r=h.domain.plan(i);assert.equal(r.audit.outcome,'PLANNED');assert.deepEqual(r.audit.distribution,{main:'PENDING',ai:'PENDING'});const text=JSON.stringify(r.audit);for(const forbidden of ['bundleJson','password','email','capabilityProof','imageSha256','customer','price','token'])assert.equal(text.includes(forbidden),false);assert.equal(r.transaction.notAfter,h.now+60);});
test('malformed trusted provider output, async ports and getters reject without fallback',()=>{
 const h=harness();for(const field of ['verifyCapability','verifyObservation','verifyEvidence']){
  const action=field==='verifyEvidence'?'VALIDATE':'BUILD';const x=harness();if(action==='VALIDATE')x.ready('DRAFT');for(const output of [null,{},true,Promise.resolve({})]){const d=createReleaseAuthorityDomain({...x.ports,[field]:()=>output});denied(()=>d.plan(x.input(action)));}
 }
 const p={...h.ports};Object.defineProperty(p,'authorityId',{enumerable:true,get(){throw Error('secret');}});denied(()=>createReleaseAuthorityDomain(p));
 const i=h.input('BUILD');Object.defineProperty(i.command,'reasonCode',{enumerable:true,get(){throw Error('secret');}});denied(()=>h.domain.plan(i));
});
test('state structural tampering, unknown fields, overflow and duplicate active records fail',()=>{
 const edits=[s=>{s.extra=true;},s=>{s.tenant.storeId='../x';},s=>{s.activeReleaseId=uid(800);},s=>{s.records.push(clone(s.records[0]));},s=>{s.records[0].descriptor.digest='0'.repeat(64);},s=>{s.records[0].status='UNKNOWN';},s=>{s.records[0].validation=null;},s=>{s.tombstones=[{releaseId:s.activeReleaseId,sequence:1,at:s.updatedAt,actorId:'x',reasonCode:'TEST'}];}];
 for(const edit of edits){const h=harness().ready(),s=clone(h.state);edit(s);denied(()=>h.domain.read({...h.readInput(),state:s,observationProof:h.observation(s)}));}
 const h=harness(),i=h.input('BUILD');i.now=-1;denied(()=>h.domain.plan(i),'CLOCK_INVALID');
});
test('module import and construction use only pure P2/crypto; no clock/random/files/services/writes',()=>{
 const Module=require('node:module'),fs=require('node:fs'),net=require('node:net'),http=require('node:http'),crypto=require('node:crypto');
 const source=require.resolve('../../../services/multi-scan/stage13/release-authority-domain'),sourceText=fs.readFileSync(source,'utf8'),load=Module._load,saved=[],calls=[];
 const deny=name=>()=>{calls.push(name);throw Error('Forbidden effect');};const patch=(o,k)=>{saved.push([o,k,o[k]]);o[k]=deny(k);};
 try{
  Module._load=function(name,...args){if(!['../stage12/approved-release','node:crypto'].includes(name)){calls.push(name);throw Error('Forbidden import');}return load.call(this,name,...args);};
  for(const [o,ks] of [[fs,['writeFileSync','mkdirSync','openSync']],[fs.promises,['writeFile','mkdir','open']],[net,['connect','createServer']],[http,['request','createServer']],[crypto,['randomUUID','randomBytes']],[Date,['now']],[Math,['random']],[global,['setTimeout','setInterval']]])for(const k of ks)patch(o,k);
  const fresh=new Module(source,module);fresh.filename=source;fresh.paths=module.paths;fresh._compile(sourceText,source);const m=fresh.exports,h=harness();h.domain=m.createReleaseAuthorityDomain(h.ports);h.ready();assert.equal(h.domain.read(h.readInput()).kind,'READ_ELIGIBILITY');assert.equal(m.POLICY.auditRetentionDays,365);
 }finally{Module._load=load;for(const [o,k,v] of saved.reverse())o[k]=v;}
 assert.deepEqual(calls,[]);
});

test('transaction intent deadline never outlives capability, observation or validation',()=>{
 const h=harness().ready('APPROVED'),i=h.input('ACTIVATE',{capabilityProof:h.cap({expiresAt:h.now+1})});assert.equal(h.domain.plan(i).transaction.notAfter,h.now+1);
 const a=harness();a.step('BUILD');a.step('VALIDATE',i=>{i.command.evidenceProof=a.evidence(a.bundle,{expiresAt:a.now+5});});a.step('APPROVE');a.now+=5;denied(()=>a.domain.plan(a.input('ACTIVATE')),'VALIDATION_EXPIRED');
});
test('exact safe-integer sequence overflow and clock regression are denied',()=>{
 const h=harness().ready(),s=clone(h.state);s.sequence=Number.MAX_SAFE_INTEGER;h.highWater=s.sequence;
 const i=h.input('REVOKE',{state:s,observationProof:h.observation(s)});i.command.expectedSequence=s.sequence;denied(()=>h.domain.plan(i),'SEQUENCE_CONFLICT');
 const x=harness(),j=x.input('BUILD');j.now=x.state.updatedAt-1;denied(()=>x.domain.plan(j),'CLOCK_INVALID');
});
test('malformed state audit identifiers and bounded saturation never evict live history',()=>{
 const h=harness().ready(),s=clone(h.state);s.seenRequests=Array.from({length:1024},(_,i)=>uid(2000+i));const i=h.input('REVOKE',{state:s,observationProof:h.observation(s)});denied(()=>h.domain.plan(i),'DOMAIN_LIMIT');assert.equal(s.seenRequests.length,1024);
 const a=harness(),j=a.input('BUILD');Object.defineProperty(j.command,'secret',{value:'not-audit',enumerable:false});denied(()=>a.domain.plan(j));
 const k=a.input('BUILD');k.command[Symbol('unknown')]=true;denied(()=>a.domain.plan(k));
});
test('fresh rollback cannot change catalog/index bindings from its superseded artifact source',()=>{
 const h=harness().ready(),first=h.bundle.release.releaseId;h.nextBundle(2);h.ready();h.nextBundle(3);
 h.bundle.release.catalog.snapshotRevision='different';h.bundle.metadata.revision='different';
 for(const slot of ['siglip','dino']){const m=JSON.parse(h.bundle.indexes[slot].manifestJson);m.catalogRevision='different';h.bundle.indexes[slot].manifestJson=JSON.stringify(m);h.bundle.release[slot].manifestSha256=sha(h.bundle.indexes[slot].manifestJson);}
 h.bundle.release.catalog.metadataSha256=digest(h.bundle.metadata);h.ready('APPROVED');const i=h.input('ROLLBACK');i.command.rollbackOf=first;denied(()=>h.domain.plan(i),'ROLLBACK_INVALID');
});
test('explicit expiry cannot precede raw expiration or revive unavailable state',()=>{
 const h=harness().ready();denied(()=>h.domain.plan(h.input('EXPIRE')),'TRANSITION_INVALID');h.now+=3600;h.step('EXPIRE');denied(()=>h.domain.plan(h.input('EXPIRE')),'TRANSITION_INVALID');
});
test('factory captures trusted ports; later configuration replacement cannot authorize forged proof',()=>{
 const h=harness();h.ports.verifyCapability=()=>({});denied(()=>h.domain.plan(h.input('BUILD',{capabilityProof:{}})),'CAPABILITY_UNTRUSTED');assert.equal(h.domain.plan(h.input('BUILD')).kind,'TRANSITION_INTENT');
});
