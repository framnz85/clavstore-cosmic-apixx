'use strict';
// Uninstalled private adapter. All handles, clocks and verification ports are trusted host inputs.
const {createReleaseAuthorityDomain}=require('./release-authority-domain');
const {digest,freeze}=require('../stage12/approved-release');
function fail(code='REGISTRY_UNAVAILABLE'){throw Object.assign(new Error('Release registry unavailable or denied'),{code,status:503});}
function need(ok,code){if(!ok)fail(code);}
function fields(v,required,optional=[]){
 need(v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v)));
 const ds=Object.getOwnPropertyDescriptors(v),keys=Reflect.ownKeys(ds);
 need(keys.every(k=>typeof k==='string'&&[...required,...optional].includes(k)&&ds[k].enumerable&&Object.hasOwn(ds[k],'value'))&&required.every(k=>Object.hasOwn(ds,k)));
}
function copy(v,limit=2097152){
 let count=0;function walk(x,d){need(d<=30&&++count<=150000);if(x===null||typeof x==='boolean'||typeof x==='string')return x;if(typeof x==='number'){need(Number.isFinite(x));return x;}
  if(Array.isArray(x)){need(x.length<=4096&&Reflect.ownKeys(x).length===x.length+1);return Array.from({length:x.length},(_,i)=>{const p=Object.getOwnPropertyDescriptor(x,String(i));need(p&&Object.hasOwn(p,'value'));return walk(p.value,d+1);});}
  fields(x,Reflect.ownKeys(x||{}));return Object.fromEntries(Object.keys(x).map(k=>[k,walk(x[k],d+1)]));}
 const result=walk(v,0);need(Buffer.byteLength(JSON.stringify(result))<=limit);return result;
}
const same=(a,b)=>digest(a)===digest(b);
const integer=v=>Number.isSafeInteger(v)&&v>=0;
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const label=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(v);
const increment=v=>{need(integer(v)&&v<Number.MAX_SAFE_INTEGER,'GUARD_OVERFLOW');return v+1;};
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
function tenant(t){fields(t,['packageId','storeId']);need(Object.values(t).every(v=>typeof v==='string'&&/^[a-f0-9]{24}$/.test(v)));}
function createReleaseAuthorityRepository(config){
 fields(config,['authorityId','authorityEpoch','writerId','writerBootId','verifyCapability','verifyEvidence','verifyMutationPermit','verifyMutationObservation','observeMutation','client','current','history','guard','clock','verifyBinding','timeoutMS','maxCommitTimeMS','maxAttempts']);
 const {authorityId,authorityEpoch,writerId,writerBootId,verifyCapability,verifyEvidence,verifyMutationPermit,verifyMutationObservation,observeMutation,client,current,history,guard,clock,verifyBinding,timeoutMS,maxCommitTimeMS,maxAttempts}=config;
 need([clock,verifyCapability,verifyEvidence,observeMutation,verifyMutationPermit,verifyMutationObservation,verifyBinding].every(v=>typeof v==='function')&&client&&typeof client.startSession==='function'&&current&&history&&current!==history&&guard&&guard!==current&&guard!==history);
 need(['findOne','updateOne'].every(k=>typeof current[k]==='function'&&typeof guard[k]==='function')&&['findOne','insertOne'].every(k=>typeof history[k]==='function'));
 need(label(authorityId)&&uuid(authorityEpoch)&&label(writerId)&&uuid(writerBootId),'WRITER_UNCONFIGURED');
 need(integer(timeoutMS)&&timeoutMS>=100&&timeoutMS<=10000&&integer(maxCommitTimeMS)&&maxCommitTimeMS>=1&&maxCommitTimeMS<=timeoutMS&&integer(maxAttempts)&&maxAttempts>=1&&maxAttempts<=3);

 const startSession=client.startSession.bind(client),currentFind=current.findOne.bind(current),currentUpdate=current.updateOne.bind(current),historyFind=history.findOne.bind(history),historyInsert=history.insertOne.bind(history),guardFind=guard.findOne.bind(guard),guardUpdate=guard.updateOne.bind(guard);
 const key=t=>`${authorityId}:${t.packageId}:${t.storeId}`;
 function binding(session){need(verifyBinding({client,current,history,guard,authorityId,authorityEpoch,writerId,writerBootId,session,requirements:freeze({snapshot:true,primary:true,majority:true,journal:true,uniqueTenant:true,uniqueEvent:true,uniqueGuard:true,uniquePermit:true,uniqueReservation:true,epochBound:true,retainedBarrierHistory:true})})===true,'TRANSACTION_BINDING_REQUIRED');}
 function envelope(raw,t){
  const row=copy(raw);fields(row,['_id','authorityId','tenant','sequence','stateDigest','headEventId','decision']);
  need(row._id===key(t)&&row.authorityId===authorityId&&same(row.tenant,t)&&integer(row.sequence)&&hex(row.stateDigest)&&row.stateDigest===digest(row.decision)&&row.sequence===row.decision.sequence&&same(row.decision.tenant,t)&&row.decision.authorityId===authorityId,'REGISTRY_CORRUPT');
  need(row.sequence===0?row.headEventId===null:uuid(row.headEventId),'REGISTRY_CORRUPT');return row;
 }
 function historyRow(raw,row){
  const h=copy(raw,4194304);fields(h,['_id','authorityId','tenant','sequence','eventId','previousStateDigest','stateDigest','decision','audit','persistence','mutation']);
  need(h._id===`${row._id}:${row.sequence}`&&h.authorityId===authorityId&&same(h.tenant,row.tenant)&&h.sequence===row.sequence&&h.eventId===row.headEventId&&hex(h.previousStateDigest)&&h.stateDigest===row.stateDigest&&same(h.decision,row.decision),'AUDIT_MISMATCH');
  const a=h.audit;fields(a,['schemaVersion','authorityId','tenant','eventId','actorId','capability','action','reasonCode','releaseId','digest','approvalVersion','previousSequence','sequence','at','outcome','distribution','retention']);
  need(a.schemaVersion===1&&a.authorityId===authorityId&&same(a.tenant,row.tenant)&&a.eventId===h.eventId&&a.sequence===h.sequence&&a.previousSequence===h.sequence-1&&a.at===row.decision.updatedAt&&a.outcome==='PLANNED'&&same(a.distribution,{main:'PENDING',ai:'PENDING'})&&same(a.retention,{minimumDays:365,retainUntil:a.at+365*86400,legalHoldOverridesPurge:true})&&same(h.persistence,{appliedWithinTransaction:true}),'AUDIT_MISMATCH');
  need(typeof a.actorId==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(a.actorId)&&/^[A-Z][A-Z0-9_]{0,63}$/.test(a.reasonCode)&&uuid(a.releaseId)&&['BUILD','VALIDATE','APPROVE','ACTIVATE','REVOKE','EXPIRE','ROLLBACK'].includes(a.action),'AUDIT_MISMATCH');
  need(a.capability===(a.action==='ROLLBACK'?'APPROVE_AND_ACTIVATE':a.action==='EXPIRE'?'ACTIVATE':a.action)&&(a.digest===null||hex(a.digest))&&(a.approvalVersion===null||integer(a.approvalVersion)&&a.approvalVersion>0),'AUDIT_MISMATCH');need(h.mutation?.guardBefore?.binding?.operatorActorId===a.actorId,'AUDIT_MISMATCH');mutation(h.mutation,row,h);return h;
 }
 function canonicalKey(t){return {authorityId,authorityEpoch,tenant:copy(t)};}
 function guardId(t){return JSON.stringify([authorityId,authorityEpoch,t.packageId,t.storeId]);}
 function guardQuery(t){return {_id:guardId(t),'key.authorityId':authorityId,'key.authorityEpoch':authorityEpoch,'key.tenant.packageId':t.packageId,'key.tenant.storeId':t.storeId};}
 function scoped(k,t){fields(k,['authorityId','authorityEpoch','tenant']);tenant(k.tenant);need(same(k,canonicalKey(t)),'GUARD_SCOPE');}
 function point(p){fields(p,['operationId','operationDigest','revision','eventDigest','checkpointDigest','anchorDigest','prefixDigest']);need(uuid(p.operationId)&&integer(p.revision)&&p.revision>0&&[p.operationDigest,p.eventDigest,p.checkpointDigest,p.anchorDigest,p.prefixDigest].every(hex),'POINT_INVALID');}
 function guardHash(g){const core={...g};delete core.guardDigest;return digest({domain:'COSMIC_SCANNER_REGISTRY_GUARD_V1',guard:core});}
 function guardRow(raw,t){const g=copy(raw,65536);fields(g,['schemaVersion','_id','key','bootstrapId','guardRevision','fenceToken','useCounter','status','binding','lastMutationId','barrierOperationId','barrierDigest','previousGuardDigest','updatedAt','guardDigest']);scoped(g.key,t);
  need(g.schemaVersion===1&&g._id===guardId(t)&&uuid(g.bootstrapId)&&integer(g.guardRevision)&&g.guardRevision>0&&integer(g.fenceToken)&&integer(g.useCounter)&&['ARMED','CONSUMED','DENIED'].includes(g.status)&&(g.lastMutationId===null||uuid(g.lastMutationId))&&uuid(g.barrierOperationId)&&hex(g.barrierDigest)&&hex(g.previousGuardDigest)&&integer(g.updatedAt)&&hex(g.guardDigest)&&guardHash(g)===g.guardDigest,'GUARD_INVALID');
  if(g.binding!==null){const b=g.binding;fields(b,['reservationId','requestId','commandDigest','authorizationDigest','operatorActorId','writerId','writerBootId','baseSequence','baseStateDigest','targetSequence','preparePoint','notAfter']);point(b.preparePoint);need(uuid(b.reservationId)&&uuid(b.requestId)&&hex(b.commandDigest)&&hex(b.authorizationDigest)&&label(b.operatorActorId)&&label(b.writerId)&&uuid(b.writerBootId)&&integer(b.baseSequence)&&hex(b.baseStateDigest)&&b.targetSequence===increment(b.baseSequence)&&integer(b.notAfter),'GUARD_INVALID');}
  need(g.status==='DENIED'||g.binding!==null&&g.fenceToken>0,'GUARD_INVALID');if(g.status==='CONSUMED')need(g.useCounter>0&&g.lastMutationId===g.binding.requestId,'GUARD_INVALID');return g;
 }
 function consume(g,requestId,time){const a=copy(g);a.status='CONSUMED';a.guardRevision=increment(g.guardRevision);a.useCounter=increment(g.useCounter);a.lastMutationId=requestId;a.previousGuardDigest=g.guardDigest;a.updatedAt=time;a.guardDigest=guardHash(a);return a;}
 function verified(fn,proof,context){try{const v=fn(proof,freeze(copy(context)));need(v&&typeof v.then!=='function','WRITER_PROOF_UNTRUSTED');return copy(v,65536);}catch{fail('WRITER_PROOF_UNTRUSTED');}}
 function core(command,stateDigest){return {schemaVersion:1,key:canonicalKey(command.tenant),action:command.action,releaseId:command.releaseId,expectedSequence:command.expectedSequence,expectedStateDigest:stateDigest,requestId:command.requestId,reasonCode:command.reasonCode,bundlePin:command.bundlePin||null,rollbackOf:command.rollbackOf||null};}
 function permit(proof,command,row,time,observedGuard=null){
  const p=verified(verifyMutationPermit,proof,{key:canonicalKey(command.tenant),writerId,writerBootId,command:Object.fromEntries(Object.entries(command).filter(([k])=>k!=='bundleJson')),guard:observedGuard,now:time,stateDigest:row?.stateDigest||null});fields(p,['schemaVersion','purpose','issuerId','audience','key','bootstrapId','permitId','operatorActorId','writerId','writerBootId','reservationId','requestId','action','releaseId','commandDigest','authorizationDigest','baseSequence','baseStateDigest','targetSequence','fenceToken','guardRevision','useCounter','barrierOperationId','barrierDigest','preparePoint','fencedPoint','issuedAt','expiresAt','notAfter','challengeId','bootId']);scoped(p.key,command.tenant);point(p.preparePoint);point(p.fencedPoint);
  need(p.schemaVersion===1&&p.purpose==='scanner-registry-mutation'&&label(p.issuerId)&&label(p.audience)&&uuid(p.bootstrapId)&&uuid(p.permitId)&&label(p.operatorActorId)&&p.writerId===writerId&&p.writerBootId===writerBootId&&uuid(p.reservationId)&&p.requestId===command.requestId&&p.action===command.action&&p.releaseId===command.releaseId&&hex(p.authorizationDigest)&&p.baseSequence===command.expectedSequence&&hex(p.baseStateDigest)&&p.targetSequence===increment(p.baseSequence)&&integer(p.fenceToken)&&p.fenceToken>0&&integer(p.guardRevision)&&p.guardRevision>0&&integer(p.useCounter)&&uuid(p.barrierOperationId)&&hex(p.barrierDigest)&&p.fencedPoint.revision===increment(p.preparePoint.revision)&&p.preparePoint.operationId!==p.fencedPoint.operationId&&uuid(p.challengeId)&&uuid(p.bootId),'PERMIT_INVALID');
  if(row)need(row.sequence===p.baseSequence,'SEQUENCE_CONFLICT');need(p.commandDigest===digest(core(command,p.baseStateDigest))&&(!row||row.stateDigest===p.baseStateDigest),'PERMIT_BASE');need(integer(p.issuedAt)&&integer(p.expiresAt)&&integer(p.notAfter)&&p.issuedAt<=time&&time<p.expiresAt&&time<p.notAfter&&p.notAfter<=p.expiresAt&&p.expiresAt-p.issuedAt<=60,'PERMIT_EXPIRED');return freeze(p);
 }
 function permitMatch(p,command,row,g,time){need(g.status==='ARMED'&&g.bootstrapId===p.bootstrapId&&g.guardRevision===p.guardRevision&&g.useCounter===p.useCounter&&g.fenceToken===p.fenceToken&&g.barrierDigest===p.barrierDigest&&g.barrierOperationId===p.barrierOperationId&&g.updatedAt<=time,'GUARD_CONFLICT');const expected=Object.fromEntries(['reservationId','requestId','commandDigest','authorizationDigest','operatorActorId','writerId','writerBootId','baseSequence','baseStateDigest','targetSequence','preparePoint','notAfter'].map(k=>[k,p[k]]));need(same(g.binding,expected)&&same(row.tenant,command.tenant)&&row.sequence===p.baseSequence&&row.stateDigest===p.baseStateDigest&&time<p.notAfter&&time<p.expiresAt,'GUARD_BINDING');}
 function writerObservation(proof,c){const e=verified(verifyMutationObservation,proof,c),p=c.permit;fields(e,['purpose','key','bootstrapId','permitId','reservationId','requestId','commandDigest','authorizationDigest','writerId','writerBootId','fenceToken','barrierDigest','fencedPoint','challengeId','bootId','latest','retainedPrefix','uncertaintySeconds','floor','observation']);scoped(e.key,c.tenant);
  need(e.purpose==='scanner-registry-mutation-observation'&&['bootstrapId','permitId','reservationId','requestId','commandDigest','authorizationDigest','writerId','writerBootId','fenceToken','barrierDigest','fencedPoint','challengeId','bootId'].every(k=>same(e[k],p[k]))&&e.latest===true&&e.retainedPrefix===true&&e.uncertaintySeconds===0,'WRITER_OBSERVATION');
  fields(e.floor,['fenceToken','guardRevision','barrierDigest','fencedPoint']);need(same(e.floor,{fenceToken:p.fenceToken,guardRevision:p.guardRevision,barrierDigest:p.barrierDigest,fencedPoint:p.fencedPoint}),'WRITER_FLOOR');const o=e.observation;fields(o,['authorityId','tenant','sequence','stateDigest','observedAt','expiresAt','highWaterSequence','clockHealthy','available','consistent']);need(o.authorityId===authorityId&&same(o.tenant,c.tenant)&&o.sequence===p.baseSequence&&o.highWaterSequence===p.baseSequence&&o.stateDigest===p.baseStateDigest&&o.stateDigest===c.stateDigest&&integer(o.observedAt)&&integer(o.expiresAt)&&o.observedAt>=p.issuedAt&&o.observedAt<=c.now&&c.now<o.expiresAt&&o.expiresAt<=p.notAfter&&o.expiresAt-o.observedAt<=60&&o.clockHealthy===true&&o.available===true&&o.consistent===true,'WRITER_OBSERVATION');return o;
 }
 function metadata(p,b,a,previousStateDigest,nextStateDigest,plannedAt){return {schemaVersion:1,key:p.key,bootstrapId:p.bootstrapId,permitId:p.permitId,reservationId:p.reservationId,requestId:p.requestId,commandDigest:p.commandDigest,authorizationDigest:p.authorizationDigest,writerId:p.writerId,writerBootId:p.writerBootId,fenceToken:p.fenceToken,barrierOperationId:p.barrierOperationId,barrierDigest:p.barrierDigest,preparePoint:p.preparePoint,fencedPoint:p.fencedPoint,guardBefore:b,guardAfter:a,previousStateDigest,nextStateDigest,plannedAt,notAfter:p.notAfter};}
 function mutation(m,row,h){fields(m,['schemaVersion','key','bootstrapId','permitId','reservationId','requestId','commandDigest','authorizationDigest','writerId','writerBootId','fenceToken','barrierOperationId','barrierDigest','preparePoint','fencedPoint','guardBefore','guardAfter','previousStateDigest','nextStateDigest','plannedAt','notAfter']);scoped(m.key,row.tenant);point(m.preparePoint);point(m.fencedPoint);const b=guardRow(m.guardBefore,row.tenant),a=guardRow(m.guardAfter,row.tenant);need(m.schemaVersion===1&&uuid(m.permitId)&&uuid(m.bootstrapId)&&uuid(m.reservationId)&&label(m.writerId)&&uuid(m.writerBootId)&&hex(m.commandDigest)&&hex(m.authorizationDigest)&&m.requestId===h.eventId&&m.previousStateDigest===h.previousStateDigest&&m.nextStateDigest===row.stateDigest&&m.plannedAt===h.audit.at&&m.plannedAt>=b.updatedAt&&integer(m.notAfter)&&m.plannedAt<m.notAfter&&m.fencedPoint.revision===increment(m.preparePoint.revision)&&m.fencedPoint.operationId!==m.preparePoint.operationId&&b.status==='ARMED'&&a.status==='CONSUMED'&&same(a,consume(b,m.requestId,m.plannedAt)),'MUTATION_INVALID');
  need(b.bootstrapId===m.bootstrapId&&b.fenceToken===m.fenceToken&&b.barrierOperationId===m.barrierOperationId&&b.barrierDigest===m.barrierDigest&&b.binding.operatorActorId===h.audit.actorId&&b.binding.baseSequence===h.sequence-1&&b.binding.baseStateDigest===m.previousStateDigest&&b.binding.targetSequence===h.sequence&&b.binding.notAfter===m.notAfter&&['reservationId','requestId','commandDigest','authorizationDigest','writerId','writerBootId','preparePoint'].every(k=>same(b.binding[k],m[k])),'MUTATION_INVALID');
 }

 async function execute(input){
  let session,error,result,callbackDone=false,attempts=0,staged=false,ack=false,lastTime=-1,marker=null,callbackError=null;
  function now(){const n=clock();need(integer(n)&&n>=lastTime,'CLOCK_INVALID');lastTime=n;return n;}
  try{
   fields(input,['command','capabilityProof','mutationPermitProof']);fields(input.command,['tenant','action','releaseId','expectedSequence','requestId','reasonCode'],['bundleJson','bundlePin','evidenceProof','rollbackOf']);
   const evidenceProof=input.command.evidenceProof,capabilityProof=input.capabilityProof,mutationPermitProof=input.mutationPermitProof;
   const command=freeze(copy(Object.fromEntries(Object.keys(input.command).filter(k=>k!=='evidenceProof').map(k=>[k,input.command[k]])),20000000));
   tenant(command.tenant);need(integer(command.expectedSequence)&&uuid(command.requestId)&&uuid(command.releaseId)&&['BUILD','VALIDATE','APPROVE','ACTIVATE','REVOKE','EXPIRE','ROLLBACK'].includes(command.action)&&/^[A-Z][A-Z0-9_]{0,63}$/.test(command.reasonCode));
   need((command.action==='VALIDATE')===Object.hasOwn(input.command,'evidenceProof'));
   const started=now();const initialPermit=permit(mutationPermitProof,command,null,started);binding(null);session=await startSession();
   need(session&&typeof session.withTransaction==='function'&&typeof session.endSession==='function'&&typeof session.inTransaction==='function'&&!session.hasEnded,'SESSION_INVALID');binding(session);
   const options={readConcern:{level:'snapshot'},readPreference:'primary',writeConcern:{w:'majority',j:true},timeoutMS,maxCommitTimeMS};
   const returned=await session.withTransaction(async()=>{
    callbackDone=false;marker=null;callbackError=null;
    try{
     need(++attempts<=maxAttempts,'RETRY_LIMIT');need(!session.hasEnded&&session.inTransaction()===true,'SESSION_INVALID');binding(session);
     need((now()-started)*1000<timeoutMS,'TRANSACTION_DEADLINE');
     const scope={authorityId,'tenant.packageId':command.tenant.packageId,'tenant.storeId':command.tenant.storeId};
     const query={...scope,_id:key(command.tenant)},opts={session,maxTimeMS:timeoutMS};
     const row=envelope(await currentFind(query,opts),command.tenant);
     if(row.sequence>0)historyRow(await historyFind({...scope,_id:`${row._id}:${row.sequence}`},opts),row);
     need(!await historyFind({...scope,eventId:command.requestId},opts),'REQUEST_REPLAY');
     const time=now(),gquery=guardQuery(command.tenant),before=guardRow(await guardFind(gquery,opts),command.tenant);
     const per=permit(mutationPermitProof,command,row,time,before);need(same(per,initialPermit),'PERMIT_CHANGED');
     need(!await historyFind({...scope,'mutation.key.authorityEpoch':authorityEpoch,'mutation.permitId':per.permitId},opts),'PERMIT_REPLAY');
     need(!await historyFind({...scope,'mutation.key.authorityEpoch':authorityEpoch,'mutation.reservationId':per.reservationId},opts),'RESERVATION_REPLAY');
     const extra={key:per.key,permit:per,guard:before,requestId:command.requestId,reservationId:per.reservationId,writerId,writerBootId};
     const domain=createReleaseAuthorityDomain({authorityId,verifyCapability,verifyEvidence,verifyObservation:(proof,c)=>writerObservation(proof,{...c,...extra})});
     const plan=()=>{const at=now();permitMatch(per,command,row,before,at);const context=freeze(copy({authorityId,tenant:command.tenant,sequence:row.sequence,stateDigest:row.stateDigest,now:at,genesis:row.sequence===0,...extra}));const observationProof=observeMutation(context);need(observationProof&&typeof observationProof.then!=='function','OBSERVATION_UNTRUSTED');return domain.plan({state:row.decision,observationProof,capabilityProof,now:at,command:{...command,...(command.action==='VALIDATE'?{evidenceProof}:{})}});};
     plan();const intent=plan();
     need(intent.audit.actorId===per.operatorActorId,'PERMIT_ACTOR');need(per.notAfter<=intent.transaction.notAfter&&(Math.min(intent.transaction.notAfter,per.notAfter,per.expiresAt)-now())*1000>timeoutMS,'AUTHORIZATION_DEADLINE');
     const next={...query,tenant:command.tenant};delete next['tenant.packageId'];delete next['tenant.storeId'];
     Object.assign(next,{sequence:intent.transaction.nextSequence,stateDigest:intent.transaction.nextStateDigest,headEventId:command.requestId,decision:intent.decision});
     const after=freeze(consume(before,command.requestId,intent.audit.at));
     const h=freeze({_id:`${row._id}:${next.sequence}`,authorityId,tenant:command.tenant,sequence:next.sequence,eventId:command.requestId,previousStateDigest:row.stateDigest,stateDigest:next.stateDigest,decision:intent.decision,audit:intent.audit,persistence:{appliedWithinTransaction:true},mutation:metadata(per,before,after,row.stateDigest,next.stateDigest,intent.audit.at)});
     envelope(next,command.tenant);historyRow(h,next);
     // Mark before the first write: transport failure may have reached the server.
     staged=true;
     const gu=await guardUpdate({...gquery,bootstrapId:before.bootstrapId,status:'ARMED',guardRevision:before.guardRevision,useCounter:before.useCounter,fenceToken:before.fenceToken,guardDigest:before.guardDigest,previousGuardDigest:before.previousGuardDigest,barrierOperationId:before.barrierOperationId,barrierDigest:before.barrierDigest,binding:copy(before.binding)},{$set:{status:after.status,guardRevision:after.guardRevision,useCounter:after.useCounter,lastMutationId:after.lastMutationId,previousGuardDigest:after.previousGuardDigest,updatedAt:after.updatedAt,guardDigest:after.guardDigest}},{...opts,upsert:false});
     need(gu?.acknowledged===true&&gu.matchedCount===1&&gu.modifiedCount===1,'GUARD_CONFLICT');
     const update=await currentUpdate({...query,sequence:command.expectedSequence,stateDigest:row.stateDigest},{$set:{sequence:next.sequence,stateDigest:next.stateDigest,headEventId:next.headEventId,decision:next.decision}},{...opts,upsert:false});
     need(update?.acknowledged===true&&update.matchedCount===1&&update.modifiedCount===1,'CAS_CONFLICT');
     const inserted=await historyInsert(h,opts);need(inserted?.acknowledged===true&&inserted.insertedId===h._id,'AUDIT_WRITE_FAILED');
     need(same(guardRow(await guardFind(gquery,opts),command.tenant),after),'GUARD_MISMATCH');
     const verified=envelope(await currentFind(query,opts),command.tenant);need(same(verified,next),'REGISTRY_CORRUPT');const verifiedHistory=historyRow(await historyFind({...scope,_id:h._id},opts),verified);need(same(verifiedHistory,h),'AUDIT_MISMATCH');
     need(session.inTransaction()===true&&!session.hasEnded,'SESSION_INVALID');need(now()<Math.min(intent.transaction.notAfter,per.notAfter,per.expiresAt)&&(now()-started)*1000<timeoutMS,'TRANSACTION_DEADLINE');
     marker=freeze({kind:'PERSISTENCE_RECEIPT',consumerApproval:false,tenant:command.tenant,sequence:next.sequence,eventId:h.eventId,stateDigest:next.stateDigest,notAfter:Math.min(intent.transaction.notAfter,per.notAfter,per.expiresAt)});callbackDone=true;return marker;
    }catch(e){callbackError=e;throw e;}
   },options);
   need(callbackDone&&!callbackError&&marker&&returned===marker&&session.inTransaction()===false&&session.transaction?.state==='TRANSACTION_COMMITTED','COMMIT_UNCERTAIN');ack=true;
   need(now()<marker.notAfter&&(now()-started)*1000<timeoutMS,'COMMIT_UNCERTAIN');result=marker;
  }catch(e){
   const uncertain=ack||callbackDone||e?.code==='COMMIT_UNCERTAIN'||e?.hasErrorLabel?.('UnknownTransactionCommitResult');
   const safe=e?.message==='Release authority domain unavailable or denied'||e?.message==='Release registry unavailable or denied';
   error={code:uncertain?'COMMIT_UNCERTAIN':safe?e.code:e?.code===11000?'CAS_CONFLICT':staged?'COMMIT_UNCERTAIN':'REGISTRY_UNAVAILABLE'};
  }finally{if(session&&typeof session.endSession==='function'){try{await session.endSession();}catch{error={code:'COMMIT_UNCERTAIN'};}}}
  if(error)fail(error.code);return result;
 }
 return Object.freeze({execute});
}
module.exports={createReleaseAuthorityRepository};
