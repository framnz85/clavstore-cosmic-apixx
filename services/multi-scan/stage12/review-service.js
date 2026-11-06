'use strict';
// Unmounted server-only ports. No model discovery, environment fallback or cart writes.
const {randomUUID}=require('node:crypto');
const {digest,freeze,sameTenant,scope}=require('./approved-release');
const {currentProduct}=require('../stage7/resolution');
const {id}=require('../stage7/contracts');
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const canonicalId=v=>typeof v==='string'&&/^[a-f0-9]{24}$/.test(v);
const copy=v=>JSON.parse(JSON.stringify(v));
function need(ok,code,status=400){if(!ok)throw Object.assign(new Error('Scanner review unavailable or invalid'),{code,status});}
function fields(v,required,optional=[]){need(v&&typeof v==='object'&&!Array.isArray(v)&&required.every(k=>Object.hasOwn(v,k))&&Object.keys(v).every(k=>required.includes(k)||optional.includes(k)),'INVALID_REQUEST');}
function snapshot(v){let raw;try{raw=JSON.stringify(v);}catch{need(false,'INVALID_REQUEST');}need(typeof raw==='string'&&Buffer.byteLength(raw)<=65536,'INVALID_REQUEST');return freeze(JSON.parse(raw));}
const principal=s=>({userId:s.userId,storeId:s.storeId,packageId:s.packageId});
const samePrincipal=(a,b)=>digest(principal(a))===digest(principal(b));
function ports({authority,catalog}={}){
 need(authority&&typeof authority.revalidate==='function'&&authority.security,'AUTHORITY_UNAVAILABLE',503);
 need(catalog&&typeof catalog.current==='function'&&catalog.security===authority.security,'CATALOG_UNAVAILABLE',503);
 return {who:authority.revalidate.bind(authority),current:catalog.current.bind(catalog)};
}
function safeText(v,max){return typeof v==='string'&&v.length>0&&v.length<=max&&![...v].some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127);}
async function readCurrent(port,grant,ids,expected,opts){
 let value;try{value=await port.current(grant,ids,opts);}catch(error){if([401,403].includes(error.status))throw error;need(false,'CATALOG_UNAVAILABLE',503);}
 try{
  need(value&&samePrincipal(scope(value.scope),expected)&&value.scope.role===expected.role&&typeof value.scope.wholesale==='boolean'&&value.scope.wholesale===grant.wholesale&&Array.isArray(value.rows)&&value.rows.length===ids.length&&value.brands instanceof Map&&hex(value.resolutionFingerprint),'CATALOG_INVALID',503);
  const seen=new Set();for(const row of value.rows){const key=id(row._id);need(ids.includes(key)&&!seen.has(key)&&id(row.estoreid)===expected.storeId,'CATALOG_INVALID',503);seen.add(key);}
 }catch{need(false,'CATALOG_INVALID',503);}
 return value;
}
// Supply this adapter to P3's correction port; P3 owns rate limits/registration/CAS.
function createCorrectionSource({authority,catalog,repository}={}){
 const port=ports({authority,catalog});need(repository&&typeof repository.searchProducts==='function','CORRECTION_PROVIDER_UNAVAILABLE',503);
 const search=repository.searchProducts.bind(repository);
 const results=new WeakMap(),pending=new WeakSet();
 return Object.freeze({
  clear(grant){results.delete(grant);},
  take(grant,input){const result=results.get(grant);results.delete(grant);need(result&&result.scanId===input.scanId&&result.detectionId===input.detectionId&&result.query===input.query,'CORRECTION_RESULT_UNAVAILABLE',503);return result.ids;},
  async search(grant,input,opts={}){
  fields(input,['scanId','tenant','detectionId','query','limit']);input=snapshot(input);
  need(uuid(input.scanId)&&safeText(input.query,128)&&input.query.length>=2&&input.limit===20,'INVALID_QUERY');
  need(!results.has(grant)&&!pending.has(grant),'CORRECTION_RESULT_PENDING',409);pending.add(grant);
  try{
  const authorized=scope(await port.who(grant,opts));need(sameTenant(input.tenant,authorized),'SCAN_FORBIDDEN',403);
  let rows;try{rows=await search(authorized.storeId,input.query,{limit:20,signal:opts.signal});}catch{need(false,'CORRECTION_PROVIDER_UNAVAILABLE',503);}
  need(Array.isArray(rows)&&rows.length<=20,'CORRECTION_PROVIDER_INVALID',503);
  const ids=[];for(const p of rows){let key,store;try{key=id(p._id);store=id(p.estoreid);}catch{need(false,'CORRECTION_PROVIDER_INVALID',503);}need(store===authorized.storeId&&p.activate===true&&!ids.includes(key),'CORRECTION_PROVIDER_INVALID',503);ids.push(key);}
  const current=await readCurrent(port,grant,ids,authorized,opts),again=scope(await port.who(grant,opts));need(samePrincipal(again,authorized),'SCAN_FORBIDDEN',403);
  need(current.rows.every(p=>p.activate===true),'CORRECTION_PROVIDER_INVALID',503);
  results.set(grant,freeze({scanId:input.scanId,detectionId:input.detectionId,query:input.query,ids}));
  return freeze({tenant:{storeId:authorized.storeId,packageId:authorized.packageId},revision:current.resolutionFingerprint,products:ids.map(productId=>({productId,storeId:authorized.storeId,packageId:authorized.packageId,activate:true}))});
  }finally{pending.delete(grant);}
 }});
}
function createReviewService({authority,catalog,releases,registry,corrections,clock=()=>Math.floor(Date.now()/1000),idFactory=randomUUID,limits={}}={}){
 const port=ports({authority,catalog});
 need(releases&&['resolve','assertActive','details'].every(k=>typeof releases[k]==='function'),'RELEASE_PROVIDER_UNAVAILABLE',503);
 need(registry&&['status','review','searchCorrections','recordQuote','recordConfirmation'].every(k=>typeof registry[k]==='function'),'REGISTRY_UNAVAILABLE',503);
 need(typeof clock==='function'&&typeof idFactory==='function','INVALID_CONFIG',503);
 fields(limits,[],['maxRecords','maxBytes']);const bounds={maxRecords:128,maxBytes:8388608,...limits};
 need(Number.isSafeInteger(bounds.maxRecords)&&bounds.maxRecords>=1&&bounds.maxRecords<=128&&Number.isSafeInteger(bounds.maxBytes)&&bounds.maxBytes>=1&&bounds.maxBytes<=8388608,'INVALID_CONFIG',503);
 const releasePort=Object.fromEntries(['resolve','assertActive','details'].map(k=>[k,releases[k].bind(releases)]));
 const scanPort=Object.fromEntries(['status','review','searchCorrections','recordQuote','recordConfirmation'].map(k=>[k,registry[k].bind(registry)]));
 const records=new Map(),busy=new Set(),searchBusy=new WeakSet();let disposed=false,last=-1,reserved=0,bytes=0;
 function now(){let n;try{n=clock();}catch{need(false,'CLOCK_UNAVAILABLE',503);}need(Number.isSafeInteger(n)&&n>=0&&n>=last,'CLOCK_UNAVAILABLE',503);last=n;return n;}
 function active(opts={}){need(!disposed,'OWNER_CLOSED',503);fields(opts,[],['signal']);need(!opts.signal?.aborted,'ABORTED',499);now();}
 function prune(){active();for(const [key,r] of records)if(!r.pending&&r.retainUntil<=now()){records.delete(key);bytes-=r.size;}}
 function newId(){let value;try{value=idFactory();}catch{need(false,'SERVER_ID_UNAVAILABLE',503);}need(uuid(value)&&![...records.values()].some(r=>r.id===value||r.permitId===value||r.attemptId===value),'SERVER_ID_COLLISION',503);return value;}
 function store(r,data){const size=Buffer.byteLength(JSON.stringify(data));need(size<=65536&&bytes-r.size+size<=bounds.maxBytes,'QUOTE_CAPACITY',429);bytes+=size-r.size;r.size=size;r.data=freeze(copy(data));}
 async function owned(grant,scanId,opts){
  active(opts);need(uuid(scanId),'INVALID_SCAN_ID');const authorized=scope(await port.who(grant,opts));
  const scan=await scanPort.status(grant,{scanId},opts);
  need(scan&&scan.scanId===scanId&&samePrincipal(scan.principal,authorized)&&Number.isSafeInteger(scan.expiresAt)&&scan.expiresAt>now()&&Number.isSafeInteger(scan.revision)&&Number.isSafeInteger(scan.reviewVersion),'PROVENANCE_INVALID',503);
  const release=await releasePort.resolve(grant,opts);need(release&&Object.isFrozen(release)&&await releasePort.assertActive(release,opts)===release,'RELEASE_INVALID',503);
  const details=releasePort.details(release);need(details&&details.release===release&&sameTenant(release.tenant,authorized)&&release.releaseId===scan.release?.id&&release.digest===scan.release?.digest&&Number.isSafeInteger(release.expiresAt)&&release.expiresAt>now(),'RELEASE_CHANGED',409);
  const again=scope(await port.who(grant,opts));need(samePrincipal(again,authorized),'SCAN_FORBIDDEN',403);active(opts);
  return {scan,authorized,release};
 }
 function totals(input){
  need(Array.isArray(input)&&input.length>=1&&input.length<=10,'INVALID_TOTALS');const seen=new Set();
  for(const t of input){fields(t,['productId','addedQuantity','existingQuantity','finalQuantity']);need(canonicalId(t.productId)&&!seen.has(t.productId)&&['addedQuantity','existingQuantity','finalQuantity'].every(k=>Number.isSafeInteger(t[k]))&&t.addedQuantity>=1&&t.existingQuantity>=0&&t.finalQuantity===t.addedQuantity+t.existingQuantity&&t.finalQuantity<=100,'INVALID_TOTALS');seen.add(t.productId);}
  return [...input].sort((a,b)=>a.productId.localeCompare(b.productId));
 }
 async function offer(grant,requested,authorized,opts){
  const current=await readCurrent(port,grant,requested.map(t=>t.productId),authorized,opts),slugs=new Set();
  const items=requested.map(t=>{
   const p=current.rows.find(p=>id(p._id)===t.productId);
   need(p.activate===true,'PRODUCT_UNAVAILABLE',409);
   need((p.variantName===undefined||p.variantName===null||typeof p.variantName==='string'&&p.variantName.length<=256)&&(!Object.hasOwn(p,'variants')||p.variants===undefined),'AMBIGUOUS_VARIANT',409);
   need(safeText(p.slug,256)&&!slugs.has(p.slug),'SKU_COLLISION',409);slugs.add(p.slug);
   let brand;try{if(p.brand)brand=current.brands.get(id(p.brand._id||p.brand));}catch{need(false,'CATALOG_INVALID',503);}
   const resolved=currentProduct(p,brand,current.scope,t.finalQuantity,t.finalQuantity);
   need(resolved&&resolved.eligibleForReview&&resolved.reviewReasons.length===0&&!p.segregate&&!p.waiting?._id&&!p.waiting?.newQuantity&&!p.excess&&!p.priceChange,'PRODUCT_UNAVAILABLE',409);
   need(safeText(resolved.title,128)&&typeof resolved.currentPrice.suggestedUnitPrice==='number'&&Number.isFinite(resolved.currentPrice.suggestedUnitPrice),'CATALOG_INVALID',503);
   const product={_id:t.productId,estoreid:authorized.storeId,slug:p.slug,title:resolved.title,variantName:resolved.variant,price:p.price,quantity:p.quantity,activate:true,segregate:false,unitOfMeasure:resolved.unitOfMeasure};
   return {productId:t.productId,quantity:t.addedQuantity,existingQuantity:t.existingQuantity,finalQuantity:t.finalQuantity,product,unitPrice:resolved.currentPrice.suggestedUnitPrice,priceAuthority:'current_main_catalog'};
  });
  // Keep legacy fingerprint semantics unchanged; bind all newly emitted fields too.
  return freeze({items,catalogRevision:digest({legacy:current.resolutionFingerprint,items})});
 }
 function metadata(r){return freeze({schemaVersion:2,attemptId:r.attemptId,quoteId:r.id,scanId:r.scanId,status:r.outcome,permitId:r.permitId||null,expiresAt:r.permitExpiry||null,cartMutation:false,receiptAuthority:'advisory-only',replayAllowed:false});}
 return Object.freeze({
  async search(grant,input,opts={}){
   fields(input,['schemaVersion','scanId','expectedRevision','detectionId','query']);input=snapshot(input);need(input.schemaVersion===2,'UNSUPPORTED_SCHEMA');
   need(corrections&&typeof corrections.take==='function'&&typeof corrections.clear==='function','CORRECTION_PROVIDER_UNAVAILABLE',503);
   need(grant&&typeof grant==='object','INVALID_SESSION',401);need(!searchBusy.has(grant),'REVIEW_BUSY',409);searchBusy.add(grant);
   try{
   await owned(grant,input.scanId,opts);
   const scan=await scanPort.searchCorrections(grant,{scanId:input.scanId,expectedRevision:input.expectedRevision,detectionId:input.detectionId,query:input.query},opts);
   need(corrections&&typeof corrections.take==='function','CORRECTION_PROVIDER_UNAVAILABLE',503);
   const ids=corrections.take(grant,input);need(Array.isArray(ids)&&ids.length<=20&&new Set(ids).size===ids.length&&ids.every(productId=>scan.corrections.some(c=>c.detectionId===input.detectionId&&c.productId===productId)),'CORRECTION_PROVIDER_INVALID',503);
   const {authorized}=await owned(grant,input.scanId,opts),current=await readCurrent(port,grant,ids,authorized,opts);
   const products=current.rows.filter(p=>p.activate===true).map(p=>({productId:id(p._id),title:safeText(p.title,128)?p.title:null,variant:safeText(p.variantName,256)?p.variantName:null}));
   const latest=await owned(grant,input.scanId,opts);need(latest.scan.revision===scan.revision,'STALE_REVISION',409);
   return freeze({schemaVersion:2,scanId:scan.scanId,revision:scan.revision,reviewVersion:scan.reviewVersion,products,cartMutation:false});
   }finally{corrections.clear(grant);searchBusy.delete(grant);}
  },
  async quote(grant,input,opts={}){
   fields(input,['schemaVersion','scanId','expectedRevision','expectedReviewVersion','decisions','totals','cartFingerprint']);input=snapshot(input);
   need(input.schemaVersion===2&&hex(input.cartFingerprint),'INVALID_REQUEST');const requested=totals(input.totals);prune();
   need(!busy.has(input.scanId),'REVIEW_BUSY',409);need(records.size+reserved<bounds.maxRecords,'QUOTE_CAPACITY',429);busy.add(input.scanId);reserved++;
   let r;
   try{
    const context=await owned(grant,input.scanId,opts);need(context.scan.revision===input.expectedRevision&&context.scan.reviewVersion===input.expectedReviewVersion,'STALE_REVIEW',409);
    const reviewed=await scanPort.review(grant,{scanId:input.scanId,expectedRevision:input.expectedRevision,decisions:input.decisions},opts),scan=reviewed.scan;
    need(reviewed.reviewLease&&scan?.scanId===input.scanId&&samePrincipal(scan.principal,context.authorized)&&Array.isArray(scan.items)&&scan.items.length===requested.length&&requested.every(t=>scan.items.some(i=>i.productId===t.productId&&i.quantity===t.addedQuantity))&&hex(scan.reviewDigest),'REVIEW_MISMATCH',409);
    const priced=await offer(grant,requested,context.authorized,opts),fresh=await owned(grant,input.scanId,opts);need(fresh.scan.revision===scan.revision&&fresh.scan.reviewDigest===scan.reviewDigest,'STALE_REVIEW',409);
    const time=now(),expiresAt=Math.min(time+15,scan.expiresAt,grant.expiresAt,fresh.release.expiresAt);need(expiresAt>time,'QUOTE_EXPIRED',410);
    const requestDigest=digest({scanId:scan.scanId,reviewVersion:scan.reviewVersion,reviewDigest:scan.reviewDigest,release:scan.release,totals:requested,cartFingerprint:input.cartFingerprint,...priced});
    r={id:newId(),scanId:scan.scanId,principal:principal(context.authorized),retainUntil:scan.expiresAt,lease:reviewed.reviewLease,requested,revision:scan.revision,reviewVersion:scan.reviewVersion,reviewDigest:scan.reviewDigest,release:scan.release,pending:true,size:0,outcome:'quoted'};
    store(r,{schemaVersion:2,quoteId:r.id,scanId:r.scanId,tenant:{storeId:r.principal.storeId,packageId:r.principal.packageId},reviewVersion:r.reviewVersion,reviewDigest:r.reviewDigest,release:r.release,requestDigest,cartFingerprint:input.cartFingerprint,...priced,issuedAt:time,expiresAt,reviewRequired:true,confirmed:false,cartMutation:false,priceAuthority:'current_main_catalog'});records.set(r.id,r);
    const recorded=await scanPort.recordQuote(r.lease,{expectedRevision:scan.revision,quoteId:r.id,requestDigest,expiresAt},opts);
    need(recorded?.scanId===r.scanId&&recorded.status==='quote-issued'&&recorded.reviewVersion===r.reviewVersion&&recorded.revision===scan.revision+1,'PROVENANCE_INVALID',503);r.revision=recorded.revision;
    active(opts);need(expiresAt>now(),'QUOTE_EXPIRED',410);r.pending=false;return freeze({...r.data,revision:r.revision});
   }catch(error){if(r){r.pending=false;r.outcome='unavailable';}throw error;}
   finally{reserved--;busy.delete(input.scanId);}
  },
  async confirm(grant,input,opts={}){
   fields(input,['schemaVersion','scanId','quoteId','requestDigest','expectedReviewVersion','attemptId','explicit']);input=snapshot(input);
   need(input.schemaVersion===2&&uuid(input.quoteId)&&uuid(input.attemptId)&&hex(input.requestDigest)&&input.explicit===true,'INVALID_CONFIRMATION');
   const context=await owned(grant,input.scanId,opts);prune();const r=records.get(input.quoteId);
   need(r&&r.scanId===input.scanId,'QUOTE_EXPIRED',410);need(samePrincipal(r.principal,context.authorized),'SCAN_FORBIDDEN',403);
   need(!r.pending&&r.outcome==='quoted','CONFIRMATION_REPLAY',409);
   need(![...records.values()].some(q=>q.attemptId===input.attemptId),'ATTEMPT_CONFLICT',409);
   need(input.requestDigest===r.data.requestDigest&&input.expectedReviewVersion===r.reviewVersion&&context.scan.revision===r.revision&&context.scan.reviewDigest===r.reviewDigest&&digest(context.scan.release)===digest(r.release),'STALE_REVIEW',409);
   need(r.data.expiresAt>now(),'QUOTE_EXPIRED',410);r.pending=true;r.attemptId=input.attemptId;r.outcome='checking';
   try{
    const priced=await offer(grant,r.requested,context.authorized,opts);need(digest(priced)===digest({items:r.data.items,catalogRevision:r.data.catalogRevision}),'REVIEW_CHANGED',409);
    const fresh=await owned(grant,r.scanId,opts);need(fresh.scan.revision===r.revision&&fresh.scan.reviewDigest===r.reviewDigest,'STALE_REVIEW',409);
    const time=now(),expiresAt=Math.min(time+5,r.data.expiresAt,r.retainUntil,grant.expiresAt,fresh.release.expiresAt);need(expiresAt>time,'QUOTE_EXPIRED',410);
    const permitId=newId();need(permitId!==input.attemptId,'SERVER_ID_COLLISION',503);r.permitId=permitId;
    const accepted=await scanPort.recordConfirmation(r.lease,{expectedRevision:r.revision,quoteId:r.id,attemptId:input.attemptId,explicit:true},opts);
    need(accepted?.status==='confirmation-accepted'&&accepted.scanId===r.scanId&&accepted.terminalAttempt?.id===input.attemptId&&accepted.terminalAttempt.quoteId===r.id&&accepted.terminalAttempt.requestDigest===r.data.requestDigest&&accepted.reviewVersion===r.reviewVersion&&accepted.reviewDigest===r.reviewDigest&&accepted.revision===r.revision+1&&samePrincipal(accepted.principal,r.principal),'PROVENANCE_INVALID',503);
    active(opts);need(expiresAt>now(),'PERMIT_EXPIRED',410);r.outcome='intent-recorded';r.permitId=permitId;r.permitExpiry=expiresAt;
    return freeze({...r.data,permitId,attemptId:r.attemptId,issuedAt:time,expiresAt,confirmed:true,reviewRequired:true,cartMutation:false,accountAuthentication:false,oneUse:true});
   }catch(error){const failure=['PRODUCT_UNAVAILABLE','SKU_COLLISION','AMBIGUOUS_VARIANT'].includes(error.code)?Object.assign(new Error('Scanner offer changed; review again'),{code:'REVIEW_CHANGED',status:409}):error;r.outcome=failure.code==='REVIEW_CHANGED'?'review-changed':'uncertain';throw failure;}
   finally{r.pending=false;}
  },
  async attempt(grant,input,opts={}){
   fields(input,['schemaVersion','scanId','attemptId']);input=snapshot(input);need(input.schemaVersion===2&&uuid(input.attemptId),'INVALID_REQUEST');
   const {authorized}=await owned(grant,input.scanId,opts);prune();const r=[...records.values()].find(q=>q.scanId===input.scanId&&q.attemptId===input.attemptId);
   need(r&&samePrincipal(r.principal,authorized),'ATTEMPT_UNAVAILABLE',410);return metadata(r);
  },
  stats(){prune();return freeze({records:records.size,bytes,pending:reserved+[...records.values()].filter(r=>r.pending).length});},
  dispose(){disposed=true;records.clear();busy.clear();bytes=0;}
 });
}
module.exports={createReviewService,createCorrectionSource};
