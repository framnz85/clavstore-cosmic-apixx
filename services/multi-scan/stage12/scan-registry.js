'use strict';
const {randomUUID} = require('node:crypto');
const {digest, sha, freeze, scope, sameTenant} = require('./approved-release');
const {createConformanceGuard} = require('./conformance');
function need(ok, code, status=400) {
  if (!ok) throw Object.assign(new Error('Scanner provenance unavailable or invalid'), {code,status});
}
const uuid = value => typeof value==='string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
const hex = value => typeof value==='string' && /^[a-f0-9]{64}$/.test(value);
function fields(value, required, optional=[]) {
  need(value && typeof value==='object' && !Array.isArray(value) && required.every(k=>Object.hasOwn(value,k)) &&
    Object.keys(value).every(k=>required.includes(k)||optional.includes(k)), 'INVALID_REQUEST');
}
const copy = value => JSON.parse(JSON.stringify(value));
function snapshot(value) {
  let raw;try{raw=JSON.stringify(value);}catch{need(false,'INVALID_REQUEST');}
  need(typeof raw==='string'&&Buffer.byteLength(raw)<=65536,'INVALID_REQUEST');return freeze(JSON.parse(raw));
}
function providerFields(value,required) {try{fields(value,required);}catch{need(false,'PROVIDER_INVALID',503);}}
const principal = value => ({userId:value.userId,storeId:value.storeId,packageId:value.packageId});
function createScanRegistry({authority,releases,recognition,corrections,ownerMode,clock=()=>Math.floor(Date.now()/1000),idFactory=randomUUID,limits={}}={}) {
  need(ownerMode==='single-process','OWNER_UNAVAILABLE',503);
  need(authority && typeof authority.revalidate==='function','AUTHORITY_UNAVAILABLE',503);
  need(releases && ['resolve','assertActive','details'].every(k=>typeof releases[k]==='function'),'RELEASE_PROVIDER_UNAVAILABLE',503);
  need(recognition && typeof recognition.read==='function','RECOGNITION_PROVIDER_UNAVAILABLE',503);
  need(corrections===undefined || typeof corrections?.search==='function','CORRECTION_PROVIDER_UNAVAILABLE',503);
  need(typeof clock==='function' && typeof idFactory==='function','INVALID_CONFIG',503);
  const caps={maxRecords:128,maxPerUser:8,maxRecordBytes:65536,maxBytes:8388608,maxCorrections:200,searchPerMinute:10};
  need(limits && typeof limits==='object' && !Array.isArray(limits) && Object.keys(limits).every(k=>Object.hasOwn(caps,k) && Number.isSafeInteger(limits[k]) && limits[k]>=1 && limits[k]<=caps[k]),'INVALID_CONFIG',503);
  const bounds={...caps,...limits}, records=new Map(), submissions=new Map(), workers=new WeakMap(), writers=new WeakMap();
  const revalidate=authority.revalidate.bind(authority), read=recognition.read.bind(recognition), search=corrections?.search.bind(corrections);
  const releasePort=Object.freeze(Object.fromEntries(['resolve','assertActive','details'].map(k=>[k,releases[k].bind(releases)])));
  const validate=createConformanceGuard({releases:releasePort});
  let disposed=false, bytes=0, lastNow=-1;
  const now=()=>{let n;try{n=clock();}catch{need(false,'CLOCK_UNAVAILABLE',503);}need(Number.isSafeInteger(n)&&n>=lastNow&&n>=0,'CLOCK_UNAVAILABLE',503);lastNow=n;return n;};
  const active=()=>need(!disposed,'OWNER_CLOSED',503);
  const options=value=>{fields(value,[],['signal']);need(!value.signal?.aborted,'ABORTED',499);};
  const newId=()=>{let id;try{id=idFactory();}catch{need(false,'INVALID_SERVER_ID',503);}need(uuid(id),'INVALID_SERVER_ID',503);return id;};
  const epoch=newId();
  const view=record=>freeze(copy(record.data));
  function store(record,data,insert=false) {
    const raw=JSON.stringify(data), size=Buffer.byteLength(raw);
    need(size<=bounds.maxRecordBytes && bytes-(record.size||0)+size<=bounds.maxBytes,'PROVENANCE_CAPACITY',503);
    record.data=freeze(data); bytes+=size-(record.size||0); record.size=size;
    if(insert)records.set(data.scanId,record);
  }
  function update(record,patch) {store(record,{...copy(record.data),...patch,revision:record.data.revision+1});}
  function invalidateWriter(record) {if(record.writer)writers.delete(record.writer);record.writer=null;}
  function closeWorker(record) {if(record.worker)workers.delete(record.worker);record.worker=null;record.running=false;}
  function finish(record,status) {
    const keep=['scanId','ownerEpoch','principal','submissionId','normalizedImageSha256','requestId','release','createdAt','expiresAt','sessionExpiry','reviewVersion','cartMutation','authorization'];
    const tombstone=Object.fromEntries(keep.map(k=>[k,record.data[k]]));
    store(record,{...tombstone,status,revision:record.data.revision+1});
    invalidateWriter(record);if(!record.running)closeWorker(record);
  }
  function prune() {
    active();const time=now();
    for(const record of records.values())if(record.data.expiresAt<=time) {
      if(record.running||record.pendingSearch) {if(record.data.status!=='expired')finish(record,'expired');}
      else {records.delete(record.data.scanId);submissions.delete(record.submissionKey);bytes-=record.size;closeWorker(record);invalidateWriter(record);}
    }
  }
  async function who(grant,opts) {
    active();options(opts);const current=scope(await revalidate(grant,opts));
    need(Number.isSafeInteger(grant?.expiresAt)&&grant.expiresAt>now(),'AUTHORITY_INVALID',503);options(opts);return current;
  }
  function current(record,expected,statuses) {
    active();prune();need(records.get(record.data.scanId)===record && record.data.expiresAt>now(),'SCAN_EXPIRED',410);
    need(Number.isSafeInteger(expected)&&expected>=0,'INVALID_REVISION');
    need(record.data.revision===expected,'STALE_REVISION',409);
    need(statuses.includes(record.data.status),'INVALID_TRANSITION',409);
  }
  async function approved(release,opts) {
    need(await releasePort.assertActive(release,opts)===release,'RELEASE_PROVIDER_INVALID',503);
    const data=releasePort.details(release);
    need(data&&data.release===release&&Object.isFrozen(release)&&Object.isFrozen(data)&&
      sameTenant(data.metadata?.tenant,release.tenant)&&typeof data.metadata.revision==='string'&&data.metadata.revision.length>0&&
      data.metadata.revision===release.catalog?.snapshotRevision&&Array.isArray(data.metadata.products)&&
      data.indexes?.siglip?.manifest&&data.indexes?.dino?.manifest&&typeof release.siglip?.generation==='string'&&typeof release.dino?.generation==='string'&&
      data.indexes.siglip.manifest.generation===release.siglip.generation&&data.indexes.dino.manifest.generation===release.dino.generation,'RELEASE_PROVIDER_INVALID',503);
  }
  async function authorizeRecord(grant,record,opts) {
    const authorized=await who(grant,opts);
    need(digest(principal(authorized))===digest(record.data.principal),'SCAN_FORBIDDEN',403);
    await approved(record.release,opts);
    const again=await who(grant,opts);
    need(digest(principal(again))===digest(record.data.principal),'SCAN_FORBIDDEN',403);
    active();prune();need(records.get(record.data.scanId)===record&&record.data.expiresAt>now(),'SCAN_EXPIRED',410);
  }
  async function owned(grant,scanId,opts) {
    need(uuid(scanId),'INVALID_SCAN_ID');await who(grant,opts);prune();
    const record=records.get(scanId);need(record,'SCAN_EXPIRED',410);await authorizeRecord(grant,record,opts);return record;
  }
  function workerRecord(worker) {active();const r=workers.get(worker);need(r&&records.get(r.data.scanId)===r,'WORKER_REQUIRED',403);return r;}
  function currentWriter(writer,record) {
    active();prune();const lease=writers.get(writer);
    need(lease&&lease.record===record&&records.get(record.data.scanId)===record&&record.data.expiresAt>now()&&
      lease.version===record.data.reviewVersion&&lease.digest===record.data.reviewDigest,'STALE_REVIEW',409);
  }
  async function writerRecord(writer,opts) {
    active();const lease=writers.get(writer);need(lease,'REVIEW_LEASE_REQUIRED',403);
    await authorizeRecord(lease.grant,lease.record,opts);
    need(writers.get(writer)===lease&&lease.version===lease.record.data.reviewVersion&&lease.digest===lease.record.data.reviewDigest,'STALE_REVIEW',409);
    return lease.record;
  }
  return Object.freeze({
    async reserve(grant,input,opts={}) {
      fields(input,['submissionId','image']);need(uuid(input.submissionId)&&Buffer.isBuffer(input.image)&&input.image.length>0&&input.image.length<=10485760,'INVALID_SCAN_REQUEST');
      // Hash immediately; original/normalized image buffers are never stored in the registry.
      const imageHash=sha(input.image), submissionId=input.submissionId;
      const authorized=await who(grant,opts),release=await releasePort.resolve(grant,opts);
      need(sameTenant(release.tenant,authorized)&&uuid(release.releaseId)&&hex(release.digest)&&Number.isSafeInteger(release.expiresAt),'RELEASE_INVALID',503);
      await approved(release,opts);const again=await who(grant,opts);
      need(digest(principal(again))===digest(principal(authorized)),'SCAN_FORBIDDEN',403);
      prune();const key=JSON.stringify([authorized.userId,authorized.storeId,authorized.packageId,submissionId]),existing=records.get(submissions.get(key));
      if(existing) {
        need(existing.data.normalizedImageSha256===imageHash,'SUBMISSION_CONFLICT',409);
        need(existing.data.release.id===release.releaseId&&existing.data.release.digest===release.digest,'RELEASE_CONFLICT',409);
        return Object.freeze({scan:view(existing),duplicate:true,worker:null});
      }
      need(records.size<bounds.maxRecords && [...records.values()].filter(r=>r.data.principal.userId===authorized.userId).length<bounds.maxPerUser,'SCAN_CAPACITY',429);
      const scanId=newId(),requestId=newId();need(scanId!==requestId&&scanId!==epoch&&requestId!==epoch&&
        ![...records.values()].some(r=>[r.data.scanId,r.data.requestId].some(id=>id===scanId||id===requestId)),'SERVER_ID_COLLISION',503);
      const time=now(),expiresAt=Math.min(time+300,grant.expiresAt,release.expiresAt);need(expiresAt>time,'SCAN_EXPIRED',410);
      const record={release,grant,submissionKey:key,running:false,pendingSearch:false,completing:false};
      const data={scanId,ownerEpoch:epoch,principal:principal(authorized),submissionId,normalizedImageSha256:imageHash,
        requestId,release:{id:release.releaseId,digest:release.digest},createdAt:time,expiresAt,sessionExpiry:grant.expiresAt,
        status:'reserved',revision:0,reviewVersion:0,resultDigest:null,detections:[],corrections:[],searchTimes:[],
        decisions:[],items:[],reviewDigest:null,issuedQuotes:[],terminalAttempt:null,cartMutation:false,authorization:false};
      store(record,data,true);submissions.set(key,scanId);const worker=Object.freeze({});record.worker=worker;workers.set(worker,record);
      return Object.freeze({scan:view(record),duplicate:false,worker});
    },
    async start(worker,input,opts={}) {
      fields(input,['expectedRevision']);input=snapshot(input);const r=workerRecord(worker);await authorizeRecord(r.grant,r,opts);current(r,input.expectedRevision,['reserved']);
      update(r,{status:'processing'});r.running=true;return view(r);
    },
    async complete(worker,input,opts={}) {
      fields(input,['expectedRevision']);input=snapshot(input);const r=workerRecord(worker);current(r,input.expectedRevision,['processing']);
      need(!r.completing,'WORK_BUSY',409);r.completing=true;
      try {
        await authorizeRecord(r.grant,r,opts);current(r,input.expectedRevision,['processing']);
        let result;
        try {result=await read(freeze({scanId:r.data.scanId,requestId:r.data.requestId,tenant:r.release.tenant,
          release:r.data.release,normalizedImageSha256:r.data.normalizedImageSha256}),opts);}
        catch {need(false,'RECOGNITION_PROVIDER_UNAVAILABLE',503);}
        providerFields(result,['normalizedImageSha256','envelope']);need(result.normalizedImageSha256===r.data.normalizedImageSha256,'IMAGE_PROVENANCE_MISMATCH',503);
        const normalized=await validate(result.envelope,{release:r.release,requestId:r.data.requestId,scanId:r.data.scanId,signal:opts.signal});
        await authorizeRecord(r.grant,r,opts);current(r,input.expectedRevision,['processing']);
        const detections=normalized.detections.map(d=>({id:d.detectionId,candidateExactIds:d.candidates.map(c=>c.productId),
          unknown:d.status==='unknown_or_unverified'||!d.candidates.length,uncertain:d.status!=='review_required'||d.reviewReasons.length>0}));
        update(r,{status:'reviewable',resultDigest:digest(normalized),detections});return view(r);
      } catch(error) {
        if(records.get(r.data.scanId)===r&&r.data.status==='processing')finish(r,now()>=r.data.expiresAt?'expired':'failed');
        throw error;
      } finally {r.completing=false;closeWorker(r);if(!disposed)prune();}
    },
    async fail(worker,input,opts={}) {
      fields(input,['expectedRevision']);input=snapshot(input);const r=workerRecord(worker);await authorizeRecord(r.grant,r,opts);current(r,input.expectedRevision,['reserved','processing']);finish(r,'failed');return view(r);
    },
    settle(worker) {
      const r=workerRecord(worker);need(!r.completing,'WORK_BUSY',409);
      if(['reserved','processing'].includes(r.data.status))finish(r,'failed');closeWorker(r);prune();return Object.freeze({settled:true});
    },
    async status(grant,input,opts={}) {fields(input,['scanId']);input=snapshot(input);return view(await owned(grant,input.scanId,opts));},
    async cancel(grant,input,opts={}) {
      fields(input,['scanId','expectedRevision']);input=snapshot(input);const r=await owned(grant,input.scanId,opts);
      current(r,input.expectedRevision,['reserved','processing','reviewable','quote-issued','cancelled']);
      if(r.data.status!=='cancelled')finish(r,'cancelled');return view(r);
    },
    async searchCorrections(grant,input,opts={}) {
      fields(input,['scanId','expectedRevision','detectionId','query']);input=snapshot(input);
      need(typeof input.query==='string'&&input.query.length>=2&&input.query.length<=128,'INVALID_QUERY');
      const r=await owned(grant,input.scanId,opts);current(r,input.expectedRevision,['reviewable','quote-issued']);
      need(r.data.detections.some(d=>d.id===input.detectionId),'UNKNOWN_DETECTION');need(search,'CORRECTION_PROVIDER_UNAVAILABLE',503);need(!r.pendingSearch,'WORK_BUSY',409);
      const times=r.data.searchTimes.filter(t=>now()-t<60);need(times.length<bounds.searchPerMinute,'CORRECTION_RATE_LIMIT',429);
      update(r,{status:'reviewable',searchTimes:[...times,now()],reviewVersion:r.data.reviewVersion+1,reviewDigest:null,decisions:[],items:[],issuedQuotes:r.data.issuedQuotes.map(q=>({...q,active:false}))});
      invalidateWriter(r);const revision=r.data.revision;r.pendingSearch=true;
      try {
        let result;try {result=await search(grant,freeze({scanId:r.data.scanId,tenant:r.release.tenant,detectionId:input.detectionId,query:input.query,limit:20}),opts);}
        catch {need(false,'CORRECTION_PROVIDER_UNAVAILABLE',503);}
        providerFields(result,['tenant','revision','products']);providerFields(result.tenant,['storeId','packageId']);need(sameTenant(result.tenant,r.release.tenant)&&typeof result.revision==='string'&&result.revision.length>0&&result.revision.length<=128&&Array.isArray(result.products)&&result.products.length<=20,'CORRECTION_PROVIDER_INVALID',503);
        const seen=new Set(),authorized=[];
        for(const p of result.products) {
          providerFields(p,['productId','storeId','packageId','activate']);need(typeof p.productId==='string'&&/^[a-f0-9]{24}$/.test(p.productId)&&sameTenant(p,r.release.tenant)&&p.activate===true&&!seen.has(p.productId),'CORRECTION_PROVIDER_INVALID',503);
          seen.add(p.productId);authorized.push({detectionId:input.detectionId,productId:p.productId,searchRevision:result.revision});
        }
        await authorizeRecord(grant,r,opts);current(r,revision,['reviewable']);
        const pairs=r.data.corrections.filter(c=>!authorized.some(a=>a.detectionId===c.detectionId&&a.productId===c.productId)).concat(authorized);
        need(pairs.length<=bounds.maxCorrections,'CORRECTION_CAPACITY',429);update(r,{corrections:pairs});return view(r);
      } finally {r.pendingSearch=false;if(!disposed)prune();}
    },
    async review(grant,input,opts={}) {
      fields(input,['scanId','expectedRevision','decisions']);input=snapshot(input);need(Array.isArray(input.decisions)&&input.decisions.length<=10,'INVALID_DECISIONS');
      const r=await owned(grant,input.scanId,opts);current(r,input.expectedRevision,['reviewable','quote-issued']);
      need(input.decisions.length===r.data.detections.length,'REVIEW_INCOMPLETE');const decisions=[],seen=new Set(),totals=new Map();
      for(const choice of input.decisions) {
        const d=r.data.detections.find(d=>d.id===choice?.detectionId);need(d&&!seen.has(d.id),'INVALID_DECISIONS');seen.add(d.id);
        if(choice.excluded===true) {fields(choice,['detectionId','excluded']);decisions.push({detectionId:d.id,excluded:true});continue;}
        fields(choice,['detectionId','productId','quantity']);need(Number.isSafeInteger(choice.quantity)&&choice.quantity>=1&&choice.quantity<=100,'INVALID_QUANTITY');
        const correction=r.data.corrections.find(c=>c.detectionId===d.id&&c.productId===choice.productId);
        need(correction||!d.unknown&&!d.uncertain&&d.candidateExactIds.includes(choice.productId),'UNAUTHORIZED_SELECTION',403);
        const decision={detectionId:d.id,productId:choice.productId,quantity:choice.quantity,source:correction?{kind:'correction',revision:correction.searchRevision}:{kind:'recognition',resultDigest:r.data.resultDigest}};
        decisions.push(decision);const total=totals.get(choice.productId)||{productId:choice.productId,quantity:0,detectionIds:[]};total.quantity+=choice.quantity;total.detectionIds.push(d.id);need(total.quantity<=100,'INVALID_QUANTITY');totals.set(choice.productId,total);
      }
      decisions.sort((a,b)=>a.detectionId.localeCompare(b.detectionId));const items=[...totals.values()].sort((a,b)=>a.productId.localeCompare(b.productId));items.forEach(item=>item.detectionIds.sort());
      update(r,{status:'reviewable',reviewVersion:r.data.reviewVersion+1,decisions,items,reviewDigest:digest(decisions),issuedQuotes:r.data.issuedQuotes.map(q=>({...q,active:false}))});
      invalidateWriter(r);const writer=Object.freeze({});writers.set(writer,{record:r,grant,version:r.data.reviewVersion,digest:r.data.reviewDigest});r.writer=writer;
      return Object.freeze({scan:view(r),reviewLease:writer});
    },
    // Metadata-only hooks for the future P4 server service. These mint no quote/permit,
    // validate no price/stock and must never be exposed as cart authorization endpoints.
    async recordQuote(writer,input,opts={}) {
      fields(input,['expectedRevision','quoteId','requestDigest','expiresAt']);input=snapshot(input);need(uuid(input.quoteId)&&hex(input.requestDigest)&&Number.isSafeInteger(input.expiresAt),'INVALID_QUOTE_METADATA');
      const r=await writerRecord(writer,opts);currentWriter(writer,r);need(r.data.items.length>0,'REVIEW_REQUIRED',409);
      const old=r.data.issuedQuotes.find(q=>q.quoteId===input.quoteId);
      if(old) {need(old.requestDigest===input.requestDigest&&old.expiresAt===input.expiresAt&&old.reviewVersion===r.data.reviewVersion,'QUOTE_CONFLICT',409);return view(r);}
      current(r,input.expectedRevision,['reviewable','quote-issued']);need(input.expiresAt>now()&&input.expiresAt<=Math.min(now()+15,r.data.expiresAt),'QUOTE_EXPIRED',410);need(r.data.issuedQuotes.length<16,'QUOTE_CAPACITY',429);
      update(r,{status:'quote-issued',issuedQuotes:[...r.data.issuedQuotes.map(q=>({...q,active:false})),{quoteId:input.quoteId,requestDigest:input.requestDigest,expiresAt:input.expiresAt,reviewVersion:r.data.reviewVersion,active:true}]});return view(r);
    },
    async recordConfirmation(writer,input,opts={}) {
      fields(input,['expectedRevision','quoteId','attemptId','explicit']);input=snapshot(input);need(uuid(input.quoteId)&&uuid(input.attemptId)&&input.explicit===true,'EXPLICIT_CONFIRMATION_REQUIRED');
      const r=await writerRecord(writer,opts);currentWriter(writer,r);
      if(r.data.status==='confirmation-accepted') {need(r.data.terminalAttempt.id===input.attemptId&&r.data.terminalAttempt.quoteId===input.quoteId,'ATTEMPT_CONFLICT',409);return view(r);}
      current(r,input.expectedRevision,['quote-issued']);const quote=r.data.issuedQuotes.find(q=>q.quoteId===input.quoteId&&q.active&&q.reviewVersion===r.data.reviewVersion);
      need(quote&&quote.expiresAt>now(),'QUOTE_EXPIRED',410);
      update(r,{status:'confirmation-accepted',issuedQuotes:r.data.issuedQuotes.map(q=>({...q,active:false})),terminalAttempt:{id:input.attemptId,quoteId:input.quoteId,reviewDigest:r.data.reviewDigest,requestDigest:quote.requestDigest,outcome:'intent-recorded'}});return view(r);
    },
    stats() {if(!disposed)prune();return Object.freeze({ownerEpoch:epoch,disposed,records:records.size,bytes,running:[...records.values()].filter(r=>r.running||r.pendingSearch).length});},
    dispose() {disposed=true;for(const r of records.values()){closeWorker(r);invalidateWriter(r);}records.clear();submissions.clear();bytes=0;}
  });
}
module.exports={createScanRegistry};
