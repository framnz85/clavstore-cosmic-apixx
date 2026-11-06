'use strict';
// Pure, uninstalled protocol model. Hashes/intents are not authentication, storage or ACKs.
const {digest,freeze}=require('../stage12/approved-release');
class LedgerError extends Error{constructor(code){super('Checkpoint ledger unavailable or denied');this.code=code;this.status=503;}}
function need(ok,code='LEDGER_INVALID'){if(!ok)throw new LedgerError(code);}
function fields(v,required,optional=[]){need(v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v)));const ds=Object.getOwnPropertyDescriptors(v);need(Reflect.ownKeys(ds).every(k=>typeof k==='string'&&[...required,...optional].includes(k)&&ds[k].enumerable&&Object.hasOwn(ds[k],'value'))&&required.every(k=>Object.hasOwn(ds,k)));}
function copy(v){let nodes=0;const visit=(x,d)=>{need(++nodes<=30000&&d<=24,'LEDGER_LIMIT');if(x===null||typeof x==='boolean')return x;if(typeof x==='number'){need(Number.isFinite(x));return x;}if(typeof x==='string'){need(Buffer.byteLength(x)<=512,'LEDGER_LIMIT');return x;}if(Array.isArray(x)){need(x.length<=1024&&Reflect.ownKeys(x).length===x.length+1,'LEDGER_LIMIT');return Array.from({length:x.length},(_,i)=>{const p=Object.getOwnPropertyDescriptor(x,String(i));need(p&&Object.hasOwn(p,'value'));return visit(p.value,d+1);});}need(x&&typeof x==='object');fields(x,Reflect.ownKeys(x));return Object.fromEntries(Object.keys(x).map(k=>[k,visit(x[k],d+1)]));};const result=visit(v,0);need(Buffer.byteLength(JSON.stringify(result))<=1048576,'LEDGER_LIMIT');return result;}
const int=v=>Number.isSafeInteger(v)&&v>=0;
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
const label=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(v);
const reason=v=>typeof v==='string'&&/^[A-Z][A-Z0-9_]{0,63}$/.test(v);
const same=(a,b)=>digest(a)===digest(b);
const increment=v=>{need(int(v)&&v<Number.MAX_SAFE_INTEGER,'LEDGER_OVERFLOW');return v+1;};
const CAPS=['BUILD','VALIDATE','APPROVE','ACTIVATE','REVOKE','READ'];
const ACTIONS=['BUILD','VALIDATE','APPROVE','ACTIVATE','REVOKE','EXPIRE','ROLLBACK'];
const BODIES=Object.freeze({PREPARE:['reservationId','requestId','commandDigest','authorizationDigest','action','releaseId','reasonCode','baseSequence','baseStateDigest','targetSequence','writerId','writerBootId','fenceToken'],FENCE_APPLIED:['reservationId','requestId','fenceToken','writerId','writerBootId','barrierDigest'],FINALIZE:['reservationId','requestId','fenceToken','commandDigest','authorizationDigest','head','registryEvidenceDigest','barrierDigest','revokedReleaseIds'],FREEZE:['reasonCode','evidenceDigest']});
const checkpoint=s=>{const p={...s};delete p.checkpointDigest;return digest({domain:'COSMIC_SCANNER_LEDGER_CHECKPOINT_V1',projection:p});};
const eventHash=event=>digest({domain:'COSMIC_SCANNER_LEDGER_EVENT_V1',event});
function ids(v){need(Array.isArray(v)&&v.length<=1024,'LEDGER_LIMIT');need(v.every(uuid)&&v.every((x,i)=>i===0||v[i-1]<x),'DENIALS_INVALID');}
function head(h){fields(h,['decisionSequence','stateDigest','headEventId','historyDigest','bootstrapId']);need(int(h.decisionSequence)&&hex(h.stateDigest)&&uuid(h.bootstrapId));need(h.decisionSequence===0?h.headEventId===null&&h.historyDigest===null:uuid(h.headEventId)&&hex(h.historyDigest));}
function reservation(p){fields(p,[...BODIES.PREPARE,'actorId','prepareRevision','prepareEventDigest']);need(uuid(p.reservationId)&&uuid(p.requestId)&&hex(p.commandDigest)&&hex(p.authorizationDigest)&&ACTIONS.includes(p.action)&&uuid(p.releaseId)&&reason(p.reasonCode)&&label(p.actorId)&&label(p.writerId)&&uuid(p.writerBootId)&&int(p.baseSequence)&&hex(p.baseStateDigest)&&p.targetSequence===increment(p.baseSequence)&&int(p.fenceToken)&&p.fenceToken>0&&int(p.prepareRevision)&&p.prepareRevision>0&&hex(p.prepareEventDigest),'RESERVATION_INVALID');}
function construct(config){
 fields(config,['authorityId','authorityEpoch','verifyActor','verifyLedgerObservation','verifyFence','verifyReconciliation','verifyClock']);
 const {authorityId,authorityEpoch,verifyActor,verifyLedgerObservation,verifyFence,verifyReconciliation,verifyClock}=config;
 need(label(authorityId)&&uuid(authorityEpoch)&&[verifyActor,verifyLedgerObservation,verifyFence,verifyReconciliation,verifyClock].every(v=>typeof v==='function'),'LEDGER_UNCONFIGURED');
 function key(k){fields(k,['authorityId','authorityEpoch','tenant']);fields(k.tenant,['packageId','storeId']);need(k.authorityId===authorityId&&k.authorityEpoch===authorityEpoch&&Object.values(k.tenant).every(v=>typeof v==='string'&&/^[a-f0-9]{24}$/.test(v)),'KEY_INVALID');}
 function state(s){
  fields(s,['schemaVersion','key','revision','lastEventDigest','checkpointDigest','updatedAt','phase','head','pending','writerFence','revokedReleaseIds','seenOperations']);key(s.key);head(s.head);ids(s.revokedReleaseIds);
  need(s.schemaVersion===1&&int(s.revision)&&s.revision>0&&hex(s.lastEventDigest)&&hex(s.checkpointDigest)&&int(s.updatedAt)&&['FINALIZED','PREPARED','FENCED','FROZEN'].includes(s.phase)&&int(s.writerFence)&&Array.isArray(s.seenOperations)&&s.seenOperations.length<=1024,'STATE_INVALID');
  const seen=new Set();let previous=0;for(const r of s.seenOperations){fields(r,['operationId','operationDigest','eventDigest','revision']);need(uuid(r.operationId)&&!seen.has(r.operationId)&&hex(r.operationDigest)&&hex(r.eventDigest)&&int(r.revision)&&r.revision>previous&&r.revision<=s.revision,'IDEMPOTENCY_INVALID');seen.add(r.operationId);previous=r.revision;}
  if(s.seenOperations.length){const last=s.seenOperations[s.seenOperations.length-1];need(last.revision===s.revision&&last.eventDigest===s.lastEventDigest,'STATE_INVALID');}
  need(s.phase==='FINALIZED'?s.pending===null:s.phase==='FROZEN'||s.pending!==null,'STATE_INVALID');
  if(s.pending!==null){const p=s.pending;reservation(p);need(p.baseSequence===s.head.decisionSequence&&p.baseStateDigest===s.head.stateDigest&&p.fenceToken===s.writerFence&&p.prepareRevision<=s.revision,'STATE_INVALID');if(s.phase==='PREPARED')need(p.prepareRevision===s.revision&&p.prepareEventDigest===s.lastEventDigest,'STATE_INVALID');if(s.phase==='FENCED')need(increment(p.prepareRevision)===s.revision,'STATE_INVALID');}
  need(s.head.decisionSequence!==0||s.revokedReleaseIds.length===0,'STATE_INVALID');need(checkpoint(s)===s.checkpointDigest,'STATE_DIGEST_CONFLICT');
 }
 function body(kind,b){fields(b,BODIES[kind]);if(kind==='FREEZE'){need(reason(b.reasonCode)&&hex(b.evidenceDigest));return;}
  need(uuid(b.reservationId)&&uuid(b.requestId)&&int(b.fenceToken)&&b.fenceToken>0);
  if(kind==='PREPARE')need(hex(b.commandDigest)&&hex(b.authorizationDigest)&&ACTIONS.includes(b.action)&&uuid(b.releaseId)&&reason(b.reasonCode)&&int(b.baseSequence)&&hex(b.baseStateDigest)&&b.targetSequence===increment(b.baseSequence)&&label(b.writerId)&&uuid(b.writerBootId));
  if(kind==='FENCE_APPLIED')need(label(b.writerId)&&uuid(b.writerBootId)&&hex(b.barrierDigest));
  if(kind==='FINALIZE'){head(b.head);ids(b.revokedReleaseIds);need(hex(b.commandDigest)&&hex(b.authorizationDigest)&&hex(b.registryEvidenceDigest)&&hex(b.barrierDigest));}
 }
 function plan(input){
  fields(input,['state','command','actorProof','observationProof','clockProof','now'],['fenceProof','reconciliationProof']);
  const s=copy(input.state),cmd=copy(input.command),now=input.now;state(s);
  need(Object.hasOwn(BODIES,cmd.kind),'TRANSITION_INVALID');fields(cmd,['kind','operationId','expectedRevision','expectedCheckpointDigest',...BODIES[cmd.kind]]);
  need(uuid(cmd.operationId)&&int(cmd.expectedRevision)&&hex(cmd.expectedCheckpointDigest)&&int(now)&&now>=s.updatedAt,'COMMAND_INVALID');
  const b=Object.fromEntries(BODIES[cmd.kind].map(k=>[k,cmd[k]]));body(cmd.kind,b);
  need((cmd.kind==='FENCE_APPLIED')===Object.hasOwn(input,'fenceProof')&&(cmd.kind==='FINALIZE')===Object.hasOwn(input,'reconciliationProof'),'PROOF_REQUIRED');
  const operationDigest=digest({domain:'COSMIC_SCANNER_LEDGER_OPERATION_V1',command:cmd});
  const context=freeze(copy({key:s.key,revision:s.revision,checkpointDigest:s.checkpointDigest,lastEventDigest:s.lastEventDigest,phase:s.phase,head:s.head,pending:s.pending,writerFence:s.writerFence,revokedReleaseIds:s.revokedReleaseIds,operationId:cmd.operationId,operationDigest,requestId:cmd.requestId||s.pending?.requestId||null,commandDigest:cmd.commandDigest||s.pending?.commandDigest||null,authorizationDigest:cmd.authorizationDigest||s.pending?.authorizationDigest||null,command:cmd,now}));
  const common=['purpose','sourceId','key','operationId','operationDigest','requestId','challengeId','bootId','issuedAt','expiresAt'];
  function verify(fn,proof,purpose,extra){let e;try{e=fn(proof,context);need(e&&typeof e.then!=='function');e=copy(e);}catch{need(false,'PROOF_UNTRUSTED');}fields(e,[...common,...extra]);key(e.key);need(e.purpose===purpose&&label(e.sourceId)&&same(e.key,s.key)&&e.operationId===cmd.operationId&&e.operationDigest===operationDigest&&e.requestId===context.requestId&&uuid(e.challengeId)&&uuid(e.bootId),'PROOF_BINDING');need(int(e.issuedAt)&&int(e.expiresAt)&&e.issuedAt<=now&&now<e.expiresAt&&e.expiresAt-e.issuedAt<=60&&now-e.issuedAt<60,'PROOF_EXPIRED');return e;}
  const actor=verify(verifyActor,input.actorProof,'scanner-ledger-actor',['actorId','kind','capabilities','duties','commandDigest','authorizationDigest']);
  need(label(actor.actorId)&&['operator','builder','fencer','reconciler','emergency'].includes(actor.kind)&&Array.isArray(actor.capabilities)&&actor.capabilities.every(v=>CAPS.includes(v))&&new Set(actor.capabilities).size===actor.capabilities.length&&Array.isArray(actor.duties)&&actor.duties.every(v=>['FENCE_APPLIED','FINALIZE','FREEZE'].includes(v))&&new Set(actor.duties).size===actor.duties.length&&actor.commandDigest===context.commandDigest&&actor.authorizationDigest===context.authorizationDigest,'ACTOR_INVALID');
  if(cmd.kind==='PREPARE'){const required=cmd.action==='ROLLBACK'?['APPROVE','ACTIVATE']:cmd.action==='EXPIRE'?['ACTIVATE']:[cmd.action];need((actor.kind==='operator'||actor.kind==='builder'&&cmd.action==='BUILD')&&required.every(v=>actor.capabilities.includes(v)),'ACTOR_DENIED');}
  else need(actor.duties.includes(cmd.kind)&&(cmd.kind==='FENCE_APPLIED'?actor.kind==='fencer':cmd.kind==='FINALIZE'?actor.kind==='reconciler':['operator','emergency'].includes(actor.kind)),'ACTOR_DENIED');
  if(actor.kind==='builder')need(actor.capabilities.every(v=>['BUILD','READ'].includes(v))&&actor.duties.length===0,'ACTOR_DENIED');
  const o=verify(verifyLedgerObservation,input.observationProof,'scanner-ledger-observation',['revision','checkpointDigest','lastEventDigest','phase','headDigest','pendingDigest','writerFence','revocationsDigest','anchor','latest','available','consistent','acknowledgedPrefix','bootstrapId']);
  fields(o.anchor,['revision','checkpointDigest','lastEventDigest']);need(o.revision===s.revision&&o.checkpointDigest===s.checkpointDigest&&o.lastEventDigest===s.lastEventDigest&&o.phase===s.phase&&o.headDigest===digest(s.head)&&o.pendingDigest===digest(s.pending)&&o.writerFence===s.writerFence&&o.revocationsDigest===digest(s.revokedReleaseIds)&&o.bootstrapId===s.head.bootstrapId&&same(o.anchor,{revision:s.revision,checkpointDigest:s.checkpointDigest,lastEventDigest:s.lastEventDigest})&&o.latest===true&&o.available===true&&o.consistent===true&&o.acknowledgedPrefix===true,'OBSERVATION_CONFLICT');
  const clock=verify(verifyClock,input.clockProof,'scanner-ledger-clock',['clockHealthy','lowerUTC','upperUTC','timeFloor','uncertaintySeconds','monotonic','regressed']);
  need(clock.clockHealthy===true&&clock.lowerUTC===now&&clock.upperUTC===now&&int(clock.timeFloor)&&clock.timeFloor<=now&&clock.uncertaintySeconds===0&&clock.monotonic===true&&clock.regressed===false,'CLOCK_INVALID');
  const proofs=[actor,o,clock];let f,r;
  if(cmd.kind==='FENCE_APPLIED'){
   f=verify(verifyFence,input.fenceProof,'scanner-ledger-fence',['reservationId','writerId','writerBootId','fenceToken','barrierDigest','guardDigest','commandDigest','authorizationDigest','baseSequence','baseStateDigest','durable','current','noConflictingWriter']);proofs.push(f);
   need(f.reservationId===b.reservationId&&f.writerId===b.writerId&&f.writerBootId===b.writerBootId&&f.fenceToken===b.fenceToken&&f.barrierDigest===b.barrierDigest&&hex(f.guardDigest)&&f.commandDigest===context.commandDigest&&f.authorizationDigest===context.authorizationDigest&&int(f.baseSequence)&&hex(f.baseStateDigest)&&f.durable===true&&f.current===true&&f.noConflictingWriter===true,'FENCE_INVALID');
  }
  if(cmd.kind==='FINALIZE'){
   r=verify(verifyReconciliation,input.reconciliationProof,'scanner-ledger-reconciliation',['reservationId','writerId','writerBootId','fenceToken','commandDigest','authorizationDigest','baseSequence','baseStateDigest','head','barrierDigest','registryEvidenceDigest','currentDigest','historyDigest','auditDigest','mutationDigest','committed','atomic','current','revocationsPreserved','revokedReleaseIds','fenceEvent']);proofs.push(r);
   need(r.reservationId===b.reservationId&&label(r.writerId)&&uuid(r.writerBootId)&&r.fenceToken===b.fenceToken&&r.commandDigest===b.commandDigest&&r.authorizationDigest===b.authorizationDigest&&int(r.baseSequence)&&hex(r.baseStateDigest)&&same(r.head,b.head)&&r.barrierDigest===b.barrierDigest&&r.registryEvidenceDigest===b.registryEvidenceDigest&&r.currentDigest===b.head.stateDigest&&r.historyDigest===b.head.historyDigest&&hex(r.auditDigest)&&hex(r.mutationDigest)&&r.committed===true&&r.atomic===true&&r.current===true&&r.revocationsPreserved===true&&same(r.revokedReleaseIds,b.revokedReleaseIds),'RECONCILIATION_INVALID');
  }
  need(proofs.every(p=>p.challengeId===o.challengeId&&p.bootId===o.bootId),'PROOF_BINDING');
  const prior=s.seenOperations.find(v=>v.operationId===cmd.operationId);
  if(prior){need(prior.operationDigest===operationDigest,'IDEMPOTENCY_CONFLICT');return freeze({kind:'IDEMPOTENCY_REFERENCE',committed:false,consumerApproval:false,reference:prior,current:{key:s.key,revision:s.revision,checkpointDigest:s.checkpointDigest,phase:s.phase},permitsMutation:false,requiresAuthenticatedStatus:true});}
  need(s.phase!=='FROZEN','LEDGER_FROZEN');need(cmd.expectedRevision===s.revision&&cmd.expectedCheckpointDigest===s.checkpointDigest,'CAS_CONFLICT');need(s.seenOperations.length<1024,'LEDGER_LIMIT');
  const next=copy(s),p=s.pending;
  if(cmd.kind==='PREPARE'){
   need(s.phase==='FINALIZED'&&p===null&&b.baseSequence===s.head.decisionSequence&&b.baseStateDigest===s.head.stateDigest&&b.fenceToken===increment(s.writerFence),'TRANSITION_INVALID');need(!s.revokedReleaseIds.includes(b.releaseId),'RELEASE_REVOKED');if(b.action==='REVOKE')need(s.revokedReleaseIds.length<1024,'LEDGER_LIMIT');next.phase='PREPARED';next.writerFence=b.fenceToken;
  }else if(cmd.kind==='FENCE_APPLIED'){
   need(s.phase==='PREPARED'&&p&&b.reservationId===p.reservationId&&b.requestId===p.requestId&&b.writerId===p.writerId&&b.writerBootId===p.writerBootId&&b.fenceToken===p.fenceToken&&f.baseSequence===p.baseSequence&&f.baseStateDigest===p.baseStateDigest,'TRANSITION_INVALID');next.phase='FENCED';
  }else if(cmd.kind==='FINALIZE'){
   need(s.phase==='FENCED'&&p&&b.reservationId===p.reservationId&&b.requestId===p.requestId&&b.fenceToken===p.fenceToken&&b.commandDigest===p.commandDigest&&b.authorizationDigest===p.authorizationDigest&&r.writerId===p.writerId&&r.writerBootId===p.writerBootId&&r.baseSequence===p.baseSequence&&r.baseStateDigest===p.baseStateDigest&&b.head.decisionSequence===p.targetSequence&&b.head.headEventId===p.requestId&&b.head.bootstrapId===s.head.bootstrapId,'TRANSITION_INVALID');
   const e=r.fenceEvent;fields(e,['schemaVersion','key','revision','previousEventDigest','previousCheckpointDigest','operationId','at','actorId','kind','body']);key(e.key);body('FENCE_APPLIED',e.body);
   need(e.schemaVersion===1&&same(e.key,s.key)&&e.kind==='FENCE_APPLIED'&&e.revision===s.revision&&e.previousEventDigest===p.prepareEventDigest&&hex(e.previousCheckpointDigest)&&uuid(e.operationId)&&e.at===s.updatedAt&&label(e.actorId)&&eventHash(e)===s.lastEventDigest&&same(e.body,{reservationId:p.reservationId,requestId:p.requestId,fenceToken:p.fenceToken,writerId:p.writerId,writerBootId:p.writerBootId,barrierDigest:b.barrierDigest}),'BARRIER_CONFLICT');
   need(s.revokedReleaseIds.every(v=>b.revokedReleaseIds.includes(v))&&(p.action!=='REVOKE'||b.revokedReleaseIds.includes(p.releaseId)),'REVOCATION_LOST');next.head=copy(b.head);next.revokedReleaseIds=copy(b.revokedReleaseIds);next.pending=null;next.phase='FINALIZED';
  }else next.phase='FROZEN';
  next.revision=increment(s.revision);next.updatedAt=now;
  const event={schemaVersion:1,key:s.key,revision:next.revision,previousEventDigest:s.lastEventDigest,previousCheckpointDigest:s.checkpointDigest,operationId:cmd.operationId,at:now,actorId:actor.actorId,kind:cmd.kind,body:b};const eventDigest=eventHash(event);
  if(cmd.kind==='PREPARE')next.pending={...b,actorId:actor.actorId,prepareRevision:next.revision,prepareEventDigest:eventDigest};
  next.lastEventDigest=eventDigest;next.seenOperations.push({operationId:cmd.operationId,operationDigest,eventDigest,revision:next.revision});next.checkpointDigest=checkpoint(next);state(next);
  const notAfter=Math.min(...proofs.map(v=>v.expiresAt));
  return freeze({kind:'LEDGER_TRANSITION_INTENT',committed:false,consumerApproval:false,event,eventDigest,nextProjection:next,persistence:{required:true,compare:{key:s.key,expectedRevision:s.revision,expectedCheckpointDigest:s.checkpointDigest,expectedLastEventDigest:s.lastEventDigest},atomicEventProjectionIdempotency:true,uniqueOperation:{key:s.key,operationId:cmd.operationId,operationDigest},preserveAcknowledgedPrefix:true,independentAnchorBeforeAck:true,permitsMutation:false,issuesAcknowledgement:false,notAfter}});
 }
 return Object.freeze({plan:input=>{try{return plan(input);}catch(e){if(e instanceof LedgerError)throw e;throw new LedgerError('LEDGER_INVALID');}}});
}
function createCheckpointLedgerDomain(config){try{return construct(config);}catch(e){if(e instanceof LedgerError)throw e;throw new LedgerError('LEDGER_UNCONFIGURED');}}
module.exports={createCheckpointLedgerDomain};
