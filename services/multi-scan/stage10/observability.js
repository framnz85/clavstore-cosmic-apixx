'use strict';
const {createHmac,randomUUID}=require('node:crypto');
const {check}=require('../stage7/contracts');
const events=new Set(['scan_started','scan_finished','scan_failed','review_prepared','admin_snapshot_prepared','admin_index_requested','rollback_disabled']);
const stages=new Set(['upload','detect','crop','siglip2','dinov2','ocr','retrieval','rerank','catalog','total']);
const codes=new Set(['FEATURE_DISABLED','INVALID_TOKEN','TOKEN_LIFETIME_REQUIRED','STORE_FORBIDDEN','PACKAGE_FORBIDDEN','INVALID_IMAGE','IMAGE_TOO_LARGE','BUSY','RATE_LIMITED','AI_TIMEOUT','AI_UNAVAILABLE','STALE_PRODUCT_DATA','INSUFFICIENT_STOCK','ABORTED','INTERNAL_ERROR','TOO_MANY_OBJECTS']);
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function requestId(){return randomUUID();} // Never trust a public caller's correlation ID as internal authority.
function publicError(error,correlationId){const code=codes.has(error?.code)?error.code:'INTERNAL_ERROR';return {ok:false,requestId:uuid.test(correlationId||'')?correlationId:requestId(),error:{code,message:({INVALID_TOKEN:'Sign in again.',TOKEN_LIFETIME_REQUIRED:'A new scanner sign-in is required.',FEATURE_DISABLED:'Multi-product scanning is disabled.',TOO_MANY_OBJECTS:'Capture ten or fewer objects and try again.',BUSY:'Scanner busy. Retry shortly.',AI_TIMEOUT:'Recognition timed out. Review and retry.',INSUFFICIENT_STOCK:'Stock changed. Review quantities.'})[code]||'Unable to complete the scan. Your cart has not changed.'}};}
function createRecorder({sink,pseudonymKey,clock=()=>new Date().toISOString()}={}){
 check(typeof sink==='function'&&typeof pseudonymKey==='string'&&Buffer.byteLength(pseudonymKey)>=32,'DIAGNOSTICS_UNCONFIGURED','Explicit local sink and distinct pseudonym key required');
 const hash=value=>createHmac('sha256',pseudonymKey).update(value).digest('hex').slice(0,24);
 return (event,input={})=>{
  check(events.has(event)&&uuid.test(input.requestId||''),'INVALID_EVENT','Allowlisted event and server request UUID required');
  const record={schemaVersion:1,event,requestId:input.requestId,time:clock(),reviewOnly:true};
  if(input.tenant){check(['packageId','storeId'].every(k=>/^[a-f0-9]{24}$/.test(input.tenant[k]||'')),'INVALID_EVENT','Scoped tenant required');record.tenantKey=hash(input.tenant.packageId+':'+input.tenant.storeId);}
  if(input.userId){check(/^[a-f0-9]{24}$/.test(input.userId),'INVALID_EVENT','Valid principal required');record.actorKey=hash('actor:'+input.userId);}
  if(input.error)record.errorCode=codes.has(input.error.code)?input.error.code:'INTERNAL_ERROR';
  if(input.timings){record.timings={};for(const [k,v] of Object.entries(input.timings))if(stages.has(k)&&Number.isFinite(v)&&v>=0&&v<=120000)record.timings[k]=v;}
  if(Number.isInteger(input.detections)&&input.detections>=0&&input.detections<=10)record.detections=input.detections;
  if(input.generations){record.generations={};for(const name of ['siglip2','dinov2'])if(/^g-[a-f0-9-]{36}$/.test(input.generations[name]||'')&&uuid.test(input.generations[name].slice(2)))record.generations[name]=input.generations[name];}
  if(input.modelPins){record.modelPins={};for(const name of ['yolox','siglip2','dinov2','ocrDet','ocrRec'])if(/^[a-f0-9]{64}$/.test(input.modelPins[name]||''))record.modelPins[name]=input.modelPins[name];}
  // Never forward arbitrary objects, raw error messages/stacks, tokens, headers, image/OCR bytes or SKU titles.
  try{sink(Object.freeze(record));return {recorded:true};}catch{return {recorded:false};}
 };
}
module.exports={createRecorder,requestId,publicError};
