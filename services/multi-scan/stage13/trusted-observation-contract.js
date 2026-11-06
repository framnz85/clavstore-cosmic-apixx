'use strict';
// Pure evidence eligibility only. Trusted verifier ports authenticate external evidence;
// this module neither issues proofs nor installs a provider or writes authority state.
const {digest,freeze}=require('../stage12/approved-release');
class EvidenceError extends Error{constructor(code){super('Trusted observation unavailable or denied');this.code=code;this.status=503;}}
function deny(code='OBSERVATION_INVALID'){throw new EvidenceError(code);}
function need(ok,code){if(!ok)deny(code);}
function fields(v,required,optional=[]){
 need(v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v)));
 const ds=Object.getOwnPropertyDescriptors(v),names=Reflect.ownKeys(ds);
 need(names.every(k=>typeof k==='string'&&[...required,...optional].includes(k)&&ds[k].enumerable&&Object.hasOwn(ds[k],'value'))&&required.every(k=>Object.hasOwn(ds,k)));
}
function copy(v){
 let nodes=0;const walk=(x,d)=>{
  need(d<=12&&++nodes<=512,'OBSERVATION_LIMIT');
  if(x===null||typeof x==='boolean')return x;
  if(typeof x==='string'){need(Buffer.byteLength(x)<=512,'OBSERVATION_LIMIT');return x;}
  if(typeof x==='number'){need(Number.isFinite(x));return x;}
  need(x&&typeof x==='object'&&!Array.isArray(x));fields(x,Reflect.ownKeys(x));return Object.fromEntries(Object.keys(x).map(k=>[k,walk(x[k],d+1)]));
 };const result=walk(v,0);need(Buffer.byteLength(JSON.stringify(result))<=16384,'OBSERVATION_LIMIT');return result;
}
const integer=v=>Number.isSafeInteger(v)&&v>=0;
const label=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(v);
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
const same=(a,b)=>digest(a)===digest(b);
function tenant(t){fields(t,['packageId','storeId']);need(Object.values(t).every(v=>typeof v==='string'&&/^[a-f0-9]{24}$/.test(v)),'TENANT_INVALID');}
const COMMON=['authorityId','sourceId','audience','authorityEpoch','tenant','purpose','challengeId','bootId','issuedAt','expiresAt'];
function buildContract(config){
 fields(config,['authorityId','sourceId','audience','authorityEpoch','verifyCheckpoint','verifySource','verifyClock','verifyBootstrap']);
 const {authorityId,sourceId,audience,authorityEpoch,verifyCheckpoint,verifySource,verifyClock,verifyBootstrap}=config;
 need([authorityId,sourceId,audience].every(label)&&uuid(authorityEpoch)&&[verifyCheckpoint,verifySource,verifyClock,verifyBootstrap].every(v=>typeof v==='function'),'OBSERVATION_UNCONFIGURED');
 const verify=(fn,proof,context)=>{try{const value=fn(proof,freeze(copy(context)));need(value&&typeof value.then!=='function');return copy(value);}catch{deny('EVIDENCE_UNTRUSTED');}};
 function common(e,purpose,context){
  tenant(e.tenant);need(e.authorityId===authorityId&&e.sourceId===sourceId&&e.audience===audience&&e.authorityEpoch===authorityEpoch&&same(e.tenant,context.tenant)&&e.purpose===purpose,'EVIDENCE_BINDING');
  need(uuid(e.challengeId)&&uuid(e.bootId),'EVIDENCE_BINDING');
  need(integer(e.issuedAt)&&integer(e.expiresAt)&&e.issuedAt<=context.now&&context.now<e.expiresAt&&e.expiresAt>e.issuedAt&&e.expiresAt-e.issuedAt<=60&&context.now-e.issuedAt<60,'EVIDENCE_EXPIRED');
 }
 function floor(f,c){fields(f,['revision','checkpointDigest','decisionSequence','stateDigest']);need(integer(f.revision)&&f.revision>0&&hex(f.checkpointDigest)&&integer(f.decisionSequence)&&hex(f.stateDigest)&&f.revision===c.revision&&f.checkpointDigest===c.checkpointDigest&&f.decisionSequence===c.decisionSequence&&f.stateDigest===c.stateDigest,'CHECKPOINT_FLOOR_CONFLICT');}
 function evaluate(input){
  fields(input,['context','checkpointProof','sourceProof','clockProof'],['bootstrapProof']);const x=freeze(copy(input.context));
  fields(x,['authorityId','tenant','sequence','stateDigest','now','genesis']);tenant(x.tenant);
  need(x.authorityId===authorityId&&integer(x.sequence)&&hex(x.stateDigest)&&integer(x.now)&&typeof x.genesis==='boolean'&&x.genesis===(x.sequence===0),'CONTEXT_INVALID');
  need(x.genesis===Object.hasOwn(input,'bootstrapProof'),'BOOTSTRAP_REQUIRED');
  const c=verify(verifyCheckpoint,input.checkpointProof,x);fields(c,[...COMMON,'status','decisionSequence','stateDigest','headEventId','historyDigest','revision','checkpointDigest','floor','pending','recovery','bootstrapId']);common(c,'scanner-checkpoint',x);
  need(c.status==='FINALIZED'&&c.pending===null&&c.recovery==='CLEAR','CHECKPOINT_DENIED');
  need(integer(c.decisionSequence)&&c.decisionSequence===x.sequence&&hex(c.stateDigest)&&c.stateDigest===x.stateDigest,'CHECKPOINT_HEAD_CONFLICT');
  need(integer(c.revision)&&c.revision>0&&hex(c.checkpointDigest)&&uuid(c.bootstrapId),'CHECKPOINT_INVALID');floor(c.floor,c);
  need(x.genesis?c.headEventId===null&&c.historyDigest===null:uuid(c.headEventId)&&hex(c.historyDigest),'CHECKPOINT_INVALID');
  const s=verify(verifySource,input.sourceProof,x);fields(s,[...COMMON,'revision','checkpointDigest','floor','latest','available','consistent','keyStatus','checkpointStatus','pending','recovery','challengeFresh','bootCurrent','bootstrapId']);common(s,'scanner-observation-source',x);
  need(s.revision===c.revision&&s.checkpointDigest===c.checkpointDigest&&s.bootstrapId===c.bootstrapId,'SOURCE_HEAD_CONFLICT');floor(s.floor,c);
  need(s.latest===true&&s.available===true&&s.consistent===true&&s.keyStatus==='ACTIVE'&&s.checkpointStatus==='FINALIZED'&&s.pending===false&&s.recovery==='CLEAR'&&s.challengeFresh===true&&s.bootCurrent===true,'SOURCE_UNAVAILABLE');
  const k=verify(verifyClock,input.clockProof,x);fields(k,[...COMMON,'healthy','lowerUTC','upperUTC','timeFloor','uncertaintySeconds','regressed','monotonic']);common(k,'scanner-clock',x);
  // No owner-approved skew/network budget exists. Admit only exact, zero-uncertainty
  // verified time; do not invent a positive operational allowance or grace period.
  need(k.healthy===true&&integer(k.lowerUTC)&&integer(k.upperUTC)&&k.lowerUTC===x.now&&k.upperUTC===x.now&&integer(k.timeFloor)&&k.timeFloor<=k.lowerUTC&&k.uncertaintySeconds===0&&k.regressed===false&&k.monotonic===true,'CLOCK_UNAVAILABLE');
  const evidence=[c,s,k];
  if(x.genesis){
   const g=verify(verifyBootstrap,input.bootstrapProof,x);fields(g,[...COMMON,'bootstrapId','decisionSequence','stateDigest','genesisUpdatedAt','ownerAuthorized','oneTimeAuthorized','replayed','keyStatus']);common(g,'scanner-genesis-bootstrap',x);
   need(g.bootstrapId===c.bootstrapId&&uuid(g.bootstrapId)&&g.decisionSequence===0&&g.stateDigest===c.stateDigest&&integer(g.genesisUpdatedAt)&&g.genesisUpdatedAt<=x.now&&g.ownerAuthorized===true&&g.oneTimeAuthorized===true&&g.replayed===false&&g.keyStatus==='ACTIVE','BOOTSTRAP_DENIED');
   const expected={schemaVersion:1,authorityId,tenant:x.tenant,sequence:0,updatedAt:g.genesisUpdatedAt,activeReleaseId:null,records:[],tombstones:[],seenRequests:[]};
   need(digest(expected)===g.stateDigest,'BOOTSTRAP_DIGEST_CONFLICT');evidence.push(g);
  }
  need(evidence.every(v=>v.challengeId===s.challengeId&&v.bootId===s.bootId),'CHALLENGE_CONFLICT');
  const observedAt=Math.min(...evidence.map(v=>v.issuedAt)),expiresAt=Math.min(observedAt+60,...evidence.map(v=>v.expiresAt));
  need(expiresAt>x.now&&x.now-observedAt<60,'EVIDENCE_EXPIRED');
  return freeze({kind:'OBSERVATION_ELIGIBILITY',consumerApproval:false,observation:{authorityId,tenant:copy(x.tenant),sequence:c.decisionSequence,stateDigest:c.stateDigest,observedAt,expiresAt,highWaterSequence:c.floor.decisionSequence,clockHealthy:true,available:true,consistent:true}});
 }
 return Object.freeze({evaluate:input=>{try{return evaluate(input);}catch(e){if(e instanceof EvidenceError)throw e;deny();}}});
}
function createTrustedObservationContract(config){try{return buildContract(config);}catch(e){if(e instanceof EvidenceError)throw e;deny('OBSERVATION_UNCONFIGURED');}}
module.exports={createTrustedObservationContract};
