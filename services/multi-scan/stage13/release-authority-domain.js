'use strict';
// Pure, uninstalled domain. Trusted host verifiers and authenticated repository snapshots are
// mandatory inputs. Outputs are transaction/audit INTENTS, never committed state or credentials.
const {validateBundle,digest,sha,freeze}=require('../stage12/approved-release');
const CAPS=Object.freeze(['BUILD','VALIDATE','APPROVE','ACTIVATE','REVOKE','READ']);
const STATES=Object.freeze(['DRAFT','VALIDATED','APPROVED','ACTIVE','SUPERSEDED','REVOKED','EXPIRED']);
const POLICY=Object.freeze({freshnessSeconds:60,graceSeconds:0,auditRetentionDays:365});
const id=v=>typeof v==='string'&&/^[a-f0-9]{24}$/.test(v);
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const int=v=>Number.isSafeInteger(v)&&v>=0;
const label=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(v);
const same=(a,b)=>digest(a)===digest(b);
function need(ok,code='DOMAIN_INVALID'){if(!ok)throw Object.assign(new Error('Release authority domain unavailable or denied'),{code,status:503});}
function fields(v,required,optional=[]){
 need(v&&typeof v==='object'&&!Array.isArray(v)&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null));
 const d=Object.getOwnPropertyDescriptors(v),names=Reflect.ownKeys(d);
 need(names.every(k=>typeof k==='string'&&(required.includes(k)||optional.includes(k))&&Object.hasOwn(d[k],'value')&&d[k].enumerable)&&required.every(k=>Object.hasOwn(d,k)));
}
function copy(value,maxBytes=1048576){
 let nodes=0;
 function visit(v,depth){need(depth<=24&&++nodes<=100000,'DOMAIN_LIMIT');
  if(v===null||typeof v==='boolean')return v;
  if(typeof v==='string'){need(Buffer.byteLength(v)<=16777216,'DOMAIN_LIMIT');return v;}
  if(typeof v==='number'){need(Number.isFinite(v));return v;}
  if(Array.isArray(v)){
   need(v.length<=4096&&Reflect.ownKeys(v).length===v.length+1,'DOMAIN_LIMIT');
   return Array.from({length:v.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(v,String(i));need(d&&Object.hasOwn(d,'value'));return visit(d.value,depth+1);});
  }
  need(v&&typeof v==='object');const names=Reflect.ownKeys(v);fields(v,names);return Object.fromEntries(names.map(k=>[k,visit(v[k],depth+1)]));
 }
 const result=visit(value,0);need(Buffer.byteLength(JSON.stringify(result))<=maxBytes,'DOMAIN_LIMIT');return result;
}
function tenant(v){fields(v,['packageId','storeId']);need(id(v.packageId)&&id(v.storeId),'TENANT_REQUIRED');return v;}
function descriptor(d){
 fields(d,['release','digest','bundle']);const r=d.release;
 fields(r,['schemaVersion','releaseId','tenant','catalog','siglip','dino','pipeline','issuedAt','expiresAt','approvalVersion']);tenant(r.tenant);
 need(r.schemaVersion===1&&uuid(r.releaseId)&&hex(d.digest)&&digest(r)===d.digest&&int(r.issuedAt)&&int(r.expiresAt)&&r.expiresAt>r.issuedAt&&r.expiresAt-r.issuedAt<=3600&&int(r.approvalVersion)&&r.approvalVersion>0,'RELEASE_INVALID');
 fields(r.catalog,['snapshotRevision','metadataSha256','productSetSha256']);need(typeof r.catalog.snapshotRevision==='string'&&r.catalog.snapshotRevision.length>0&&r.catalog.snapshotRevision.length<=128&&hex(r.catalog.metadataSha256)&&hex(r.catalog.productSetSha256));
 for(const slot of ['siglip','dino']){fields(r[slot],['generation','manifestSha256','modelAndPreprocessorDigest']);need(typeof r[slot].generation==='string'&&r[slot].generation.startsWith('g-')&&uuid(r[slot].generation.slice(2))&&hex(r[slot].manifestSha256)&&hex(r[slot].modelAndPreprocessorDigest),'INDEX_PAIR_REQUIRED');}
 fields(r.pipeline,['detectorDigest','ocrAndDictionaryDigest','policyDigest']);need(Object.values(r.pipeline).every(hex));
 fields(d.bundle,['file','sha256']);need(typeof d.bundle.file==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}\.json$/.test(d.bundle.file)&&hex(d.bundle.sha256));return d;
}
function evidence(e,d,authorityId){
 fields(e,['authorityId','tenant','actorId','descriptorDigest','checkedAt','expiresAt','artifactBytesVerified','nativeCompatible','eligible','rightsPolicyId','qualityPolicyId','coveragePolicyId']);
 need(e.authorityId===authorityId&&same(tenant(e.tenant),d.release.tenant)&&label(e.actorId)&&e.descriptorDigest===digest(d)&&int(e.checkedAt)&&int(e.expiresAt)&&e.expiresAt>e.checkedAt&&e.expiresAt<=d.release.expiresAt&&e.artifactBytesVerified===true&&e.nativeCompatible===true&&e.eligible===true&&[e.rightsPolicyId,e.qualityPolicyId,e.coveragePolicyId].every(label),'VALIDATION_REQUIRED');
}
function stateData(s,authorityId){
 fields(s,['schemaVersion','authorityId','tenant','sequence','updatedAt','activeReleaseId','records','tombstones','seenRequests']);tenant(s.tenant);
 need(s.schemaVersion===1&&s.authorityId===authorityId&&int(s.sequence)&&int(s.updatedAt)&&Array.isArray(s.records)&&s.records.length<=256&&Array.isArray(s.tombstones)&&s.tombstones.length<=1024&&Array.isArray(s.seenRequests)&&s.seenRequests.length<=1024,'STATE_INVALID');
 const ids=new Set();
 for(const r of s.records){fields(r,['descriptor','status','validation','approvedBy','activatedAt']);descriptor(r.descriptor);const rid=r.descriptor.release.releaseId;
  need(!ids.has(rid)&&same(r.descriptor.release.tenant,s.tenant)&&STATES.includes(r.status),'STATE_INVALID');ids.add(rid);
  if(r.validation!==null)evidence(r.validation,r.descriptor,authorityId);
  need(r.approvedBy===null||label(r.approvedBy));need(r.activatedAt===null||int(r.activatedAt));
  if(['VALIDATED','APPROVED','ACTIVE','SUPERSEDED'].includes(r.status))need(r.validation!==null,'VALIDATION_REQUIRED');
  if(['APPROVED','ACTIVE','SUPERSEDED'].includes(r.status))need(r.approvedBy!==null,'APPROVAL_REQUIRED');
  if(['ACTIVE','SUPERSEDED'].includes(r.status))need(r.activatedAt!==null,'STATE_INVALID');
 }
 const tombstones=new Set();for(const t of s.tombstones){fields(t,['releaseId','sequence','at','actorId','reasonCode']);need(uuid(t.releaseId)&&!tombstones.has(t.releaseId)&&int(t.sequence)&&t.sequence>0&&t.sequence<=s.sequence&&int(t.at)&&t.at<=s.updatedAt&&label(t.actorId)&&/^[A-Z][A-Z0-9_]{0,63}$/.test(t.reasonCode),'TOMBSTONE_INVALID');tombstones.add(t.releaseId);}
 for(const r of s.records)need((r.status==='REVOKED')===tombstones.has(r.descriptor.release.releaseId),'TOMBSTONE_INVALID');
 need(s.seenRequests.every(uuid)&&new Set(s.seenRequests).size===s.seenRequests.length,'REQUEST_INVALID');
 const active=s.records.filter(r=>r.status==='ACTIVE');need(active.length<=1&&(active.length===0?s.activeReleaseId===null:s.activeReleaseId===active[0].descriptor.release.releaseId),'ACTIVE_CONFLICT');
 if(s.sequence===0)need(s.records.length===0&&s.tombstones.length===0&&s.seenRequests.length===0&&s.activeReleaseId===null,'STATE_INVALID');return s;
}
function createReleaseAuthorityDomain(options){
 fields(options,['authorityId','verifyCapability','verifyObservation','verifyEvidence'],['policy']);
 const {authorityId,verifyCapability,verifyObservation,verifyEvidence}=options;
 need(label(authorityId)&&[verifyCapability,verifyObservation,verifyEvidence].every(f=>typeof f==='function'),'AUTHORITY_UNCONFIGURED');
 if(Object.hasOwn(options,'policy')){const p=copy(options.policy);fields(p,['freshnessSeconds','graceSeconds','auditRetentionDays']);need(same(p,POLICY),'POLICY_CONFLICT');}
 function verified(fn,proof,context,code){let value;try{value=fn(proof,freeze(copy(context)));need(value&&typeof value.then!=='function',code);return copy(value);}catch{need(false,code);}}
 function context(input,action){
  fields(input,['state','observationProof','capabilityProof','now'],action==='READ'?[]:['command']);
  const s=stateData(copy(input.state),authorityId),now=input.now;need(int(now)&&now>=s.updatedAt,'CLOCK_INVALID');
  const o=verified(verifyObservation,input.observationProof,{authorityId,tenant:s.tenant,stateDigest:digest(s),now},'OBSERVATION_UNTRUSTED');
  fields(o,['authorityId','tenant','sequence','stateDigest','observedAt','expiresAt','highWaterSequence','clockHealthy','available','consistent']);
  need(o.authorityId===authorityId&&same(tenant(o.tenant),s.tenant)&&o.stateDigest===digest(s)&&o.sequence===s.sequence&&o.highWaterSequence===s.sequence,'SEQUENCE_REPLAY');
  need(o.clockHealthy===true&&o.available===true&&o.consistent===true&&int(o.observedAt)&&o.observedAt>=s.updatedAt&&o.observedAt<=now&&int(o.expiresAt)&&o.expiresAt>now&&o.expiresAt<=o.observedAt+60&&now<o.observedAt+60,'OBSERVATION_STALE');
  const c=verified(verifyCapability,input.capabilityProof,{authorityId,tenant:s.tenant,action,now},'CAPABILITY_UNTRUSTED');
  fields(c,['authorityId','actorId','kind','tenant','capabilities','issuedAt','expiresAt']);
  need(c.authorityId===authorityId&&label(c.actorId)&&same(tenant(c.tenant),s.tenant)&&['operator','builder','consumer'].includes(c.kind)&&Array.isArray(c.capabilities)&&c.capabilities.length>0&&c.capabilities.every(v=>CAPS.includes(v))&&new Set(c.capabilities).size===c.capabilities.length&&int(c.issuedAt)&&c.issuedAt<=now&&int(c.expiresAt)&&c.expiresAt>now,'CAPABILITY_INVALID');
  need(c.kind==='operator'||c.capabilities.every(v=>(c.kind==='builder'?['BUILD','READ']:['READ']).includes(v)),'CAPABILITY_DENIED');
  const required=action==='ROLLBACK'?['APPROVE','ACTIVATE']:action==='EXPIRE'?['ACTIVATE']:[action];
  need(required.every(v=>c.capabilities.includes(v)),'CAPABILITY_DENIED');return {s,now,o,c};
 }
 function complete(command,s,now){
  need(typeof command.bundleJson==='string'&&Buffer.byteLength(command.bundleJson)<=16777216,'BUNDLE_REQUIRED');
  fields(command.bundlePin,['file','sha256']);need(sha(command.bundleJson)===command.bundlePin.sha256,'BUNDLE_INTEGRITY');
  let validated;try{validated=validateBundle(JSON.parse(command.bundleJson),s.tenant,now);}catch{need(false,'RELEASE_INVALID');}
  const raw={...validated.release};delete raw.digest;
  const d=descriptor({release:raw,digest:validated.release.digest,bundle:copy(command.bundlePin)});
  need(d.release.releaseId===command.releaseId,'RELEASE_MISMATCH');return d;
 }
 function live(r,now){need(r&&r.descriptor.release.issuedAt<=now&&r.descriptor.release.expiresAt>now,'RELEASE_EXPIRED');}
 function validated(r,now){live(r,now);need(r.validation&&r.validation.checkedAt<=now&&r.validation.expiresAt>now,'VALIDATION_EXPIRED');}
 function plan(input){
  fields(input,['state','observationProof','capabilityProof','now','command']);
  fields(input.command,['tenant','action','releaseId','expectedSequence','requestId','reasonCode'],['bundleJson','bundlePin','evidenceProof','rollbackOf']);
  const cmd=copy(Object.fromEntries(Object.keys(input.command).map(k=>[k,k==='evidenceProof'?null:input.command[k]])),20000000);
  fields(cmd,['tenant','action','releaseId','expectedSequence','requestId','reasonCode'],['bundleJson','bundlePin','evidenceProof','rollbackOf']);
  need(['BUILD','VALIDATE','APPROVE','ACTIVATE','REVOKE','EXPIRE','ROLLBACK'].includes(cmd.action),'ACTION_INVALID');
  // Evidence proof identity must not be serialized/cloned. Only its trusted verifier consumes it.
  const action=cmd.action,{s,now,o,c}=context(input,action);need(same(tenant(cmd.tenant),s.tenant),'TENANT_MISMATCH');
  need(int(cmd.expectedSequence)&&cmd.expectedSequence===s.sequence&&s.sequence<Number.MAX_SAFE_INTEGER,'SEQUENCE_CONFLICT');
  need(uuid(cmd.releaseId)&&uuid(cmd.requestId)&&/^[A-Z][A-Z0-9_]{0,63}$/.test(cmd.reasonCode),'AUDIT_INVALID');
  need(!s.seenRequests.includes(cmd.requestId),'REQUEST_REPLAY');need(s.seenRequests.length<1024,'DOMAIN_LIMIT');
  const hasBundle=['BUILD','VALIDATE','APPROVE','ACTIVATE','ROLLBACK'].includes(action);
  need(hasBundle===Object.hasOwn(cmd,'bundleJson')&&hasBundle===Object.hasOwn(cmd,'bundlePin'),'COMMAND_INVALID');
  need((action==='VALIDATE')===Object.hasOwn(cmd,'evidenceProof')&&(action==='ROLLBACK')===Object.hasOwn(cmd,'rollbackOf'),'COMMAND_INVALID');
  const next=copy(s),r=next.records.find(v=>v.descriptor.release.releaseId===cmd.releaseId);
  if(action!=='REVOKE')need(!s.tombstones.some(t=>t.releaseId===cmd.releaseId),'RELEASE_REVOKED');
  const d=hasBundle?complete(cmd,s,now):null;
  if(d&&r)need(same(d,r.descriptor),'RELEASE_MISMATCH');
  if(action==='BUILD'){
   need(!r&&next.records.length<256,'TRANSITION_INVALID');next.records.push({descriptor:d,status:'DRAFT',validation:null,approvedBy:null,activatedAt:null});
  }else if(action==='VALIDATE'){
   need(r&&r.status==='DRAFT','TRANSITION_INVALID');
   const e=verified(verifyEvidence,input.command.evidenceProof,{authorityId,tenant:s.tenant,descriptorDigest:digest(d),now},'EVIDENCE_UNTRUSTED');
   evidence(e,d,authorityId);need(e.actorId===c.actorId&&e.checkedAt<=now&&e.expiresAt>now,'VALIDATION_REQUIRED');r.validation=e;r.status='VALIDATED';
  }else if(action==='APPROVE'){
   need(r&&r.status==='VALIDATED','TRANSITION_INVALID');validated(r,now);r.approvedBy=c.actorId;r.status='APPROVED';
  }else if(action==='ACTIVATE'||action==='ROLLBACK'){
   need(r&&r.status==='APPROVED','TRANSITION_INVALID');validated(r,now);
   if(action==='ROLLBACK'){
    need(uuid(cmd.rollbackOf)&&cmd.rollbackOf!==cmd.releaseId,'ROLLBACK_INVALID');const old=s.records.find(v=>v.descriptor.release.releaseId===cmd.rollbackOf);
    need(old&&old.status==='SUPERSEDED'&&!s.tombstones.some(t=>t.releaseId===cmd.rollbackOf),'ROLLBACK_INVALID');
    const artifacts=v=>({catalog:v.catalog,siglip:v.siglip,dino:v.dino,pipeline:v.pipeline});need(same(artifacts(old.descriptor.release),artifacts(d.release)),'ROLLBACK_INVALID');
   }
   for(const previous of next.records)if(previous.status==='ACTIVE')previous.status='SUPERSEDED';r.status='ACTIVE';r.activatedAt=now;next.activeReleaseId=cmd.releaseId;
  }else if(action==='REVOKE'){
   need(!s.tombstones.some(t=>t.releaseId===cmd.releaseId)&&next.tombstones.length<1024,'RELEASE_REVOKED');
   if(r)r.status='REVOKED';if(next.activeReleaseId===cmd.releaseId)next.activeReleaseId=null;
   next.tombstones.push({releaseId:cmd.releaseId,sequence:s.sequence+1,at:now,actorId:c.actorId,reasonCode:cmd.reasonCode});
  }else{
   need(r&&!['REVOKED','EXPIRED'].includes(r.status)&&r.descriptor.release.expiresAt<=now,'TRANSITION_INVALID');r.status='EXPIRED';if(next.activeReleaseId===cmd.releaseId)next.activeReleaseId=null;
  }
  next.sequence++;next.updatedAt=now;next.seenRequests.push(cmd.requestId);stateData(next,authorityId);
  const retainUntil=now+365*86400;need(int(retainUntil),'CLOCK_INVALID');
  const target=r?.descriptor||d;
  const notAfter=Math.min(o.expiresAt,c.expiresAt,hasBundle?d.release.expiresAt:o.expiresAt,hasBundle&&r?.validation?r.validation.expiresAt:o.expiresAt);
  const audit={schemaVersion:1,authorityId,tenant:s.tenant,eventId:cmd.requestId,actorId:c.actorId,capability:action==='ROLLBACK'?'APPROVE_AND_ACTIVATE':action==='EXPIRE'?'ACTIVATE':action,action,reasonCode:cmd.reasonCode,releaseId:cmd.releaseId,digest:target?.digest||null,approvalVersion:target?.release.approvalVersion||null,previousSequence:s.sequence,sequence:next.sequence,at:now,outcome:'PLANNED',distribution:{main:'PENDING',ai:'PENDING'},retention:{minimumDays:365,retainUntil,legalHoldOverridesPurge:true}};
  return freeze({kind:'TRANSITION_INTENT',committed:false,consumerApproval:false,decision:next,audit,transaction:{required:true,atomicDecisionAndAudit:true,compare:{tenant:s.tenant,expectedSequence:s.sequence,expectedStateDigest:digest(s)},nextSequence:next.sequence,nextStateDigest:digest(next),requiresUniqueTenant:true,requiresDurableTombstones:true,requiresDurableHighWater:true,notAfter}});
 }
 function read(input){const {s,now,o}=context(input,'READ');const r=s.records.find(v=>v.descriptor.release.releaseId===s.activeReleaseId);need(r&&r.status==='ACTIVE','NO_ACTIVE_RELEASE');validated(r,now);return freeze({kind:'READ_ELIGIBILITY',consumerApproval:false,authorityId,tenant:s.tenant,sequence:s.sequence,descriptor:r.descriptor,notAfter:Math.min(o.expiresAt,r.validation.expiresAt,r.descriptor.release.expiresAt)});}
 return Object.freeze({plan,read,policy:POLICY});
}
module.exports={createReleaseAuthorityDomain,CAPABILITIES:CAPS,STATES,POLICY};
