'use strict';
const {performance}=require('node:perf_hooks');
const {randomUUID}=require('node:crypto');
const {Integration}=require('../stage7/integration');
const {AiClient,paths}=require('../stage7/client');
const {check}=require('../stage7/contracts');
const {aiRequire,scope,serviceKey}=require('./fixture');
const {createReceiver}=aiRequire('./services/multi-scan/stage7/receiver');

// A safe composition boundary: real JWT + HMAC + validators, injected in-memory transport.
class OfflineHarness {
 constructor({fixture,pipeline,afterInference,timeoutMs=120000}){
  this.fixture=fixture;this.pipeline=pipeline;this.afterInference=afterInference;
  this.active=false;this.used=new Set();this.trace=null;
  const receiver=createReceiver({serviceKey,pipeline:{recognize:async(...args)=>{
   const start=performance.now();const result=await pipeline.recognize(...args);
   this.trace={raw:result,inferenceMs:performance.now()-start};
   if(afterInference)await afterInference(fixture,result);
   return result;
  }}});
  const client=new AiClient({url:'http://127.0.0.1:45679',allowedAddresses:['127.0.0.1'],serviceKey,timeoutMs,transport:async options=>{
   // No socket, DNS lookup, server or production network is used.
   const value=await receiver({method:'POST',path:paths.recognize,headers:options.headers,body:JSON.parse(options.body),signal:options.signal});
   return {status:200,body:Buffer.from(JSON.stringify(value))};
  }});
  const catalog={security:fixture.security,current:async(...args)=>{const t=performance.now();try{return await fixture.catalog.current(...args);}finally{if(this.trace)this.trace.catalogValidationMs=performance.now()-t;}}};
  this.integration=new Integration({security:fixture.security,catalog,client});
 }
 async run({photo,token=this.fixture.token(),storeId=scope.storeId,packageHint=scope.packageId,submissionId=randomUUID(),signal}={}){
  check(!this.active,'HARNESS_BUSY','One offline scan at a time',429);
  check(typeof submissionId==='string'&&/^[a-zA-Z0-9_-]{1,64}$/.test(submissionId),'INVALID_SUBMISSION','Bounded submission ID required');
  check(!this.used.has(submissionId),'DUPLICATE_SUBMISSION','Use a new explicit submission ID',409);
  check(this.used.size<100,'SUBMISSION_LIMIT','Create a fresh offline worker after 100 attempts',429);
  this.used.add(submissionId);this.active=true;this.trace=null;const t=performance.now(),cpu=process.cpuUsage();
  try{
   const review=await this.integration.scan({token,storeId,packageHint,photo,signal});
   check(review.reviewRequired===true&&review.confirmed===false&&review.cartMutation===false,'UNSAFE_RESULT','Review-only output required');
   return {kind:'offline-stage9-review',review,raw:this.trace?.raw,timings:{inferenceMs:this.trace?.inferenceMs||0,catalogValidationMs:this.trace?.catalogValidationMs||0,totalMs:performance.now()-t},cpu:process.cpuUsage(cpu),memory:{rssBytes:process.memoryUsage().rss,processLifetimePeakRssBytes:process.resourceUsage().maxRSS*1024},featureActivated:false,cartMutation:false,orderPersisted:false};
  }finally{this.active=false;}
 }
}

// Explicit simulated cashier decisions only; never auto-select recognition suggestions.
function reviewedSelections(review,decisions){
 const grouped=new Map(),unknown=[];
 for(const detection of review.detections){
  const decision=decisions[detection.detectionId];
  check(decision&&(decision.exclude===true||decision.reviewed===true),'REVIEW_REQUIRED','Every object needs a cashier decision');
  if(decision.exclude===true){unknown.push(detection.detectionId);continue;}
  const candidate=detection.candidates.find(c=>c.productId===decision.productId);
  check(candidate?.eligibleForReview===true,'UNAVAILABLE_SELECTION','Select a current eligible exact SKU');
  check(Number.isSafeInteger(decision.quantity)&&decision.quantity>=1&&decision.quantity<=100,'INVALID_QUANTITY','Quantity must be 1..100');
  const old=grouped.get(candidate.productId)||{productId:candidate.productId,quantity:0,detectionIds:[]};
  old.quantity+=decision.quantity;old.detectionIds.push(detection.detectionId);check(old.quantity<=100,'QUANTITY_LIMIT','Aggregated quantity exceeds 100');grouped.set(candidate.productId,old);
 }
 return {items:[...grouped.values()].sort((a,b)=>a.productId.localeCompare(b.productId)),unknown,reviewRequired:true,confirmed:false,cartMutation:false};
}
module.exports={OfflineHarness,reviewedSelections};
