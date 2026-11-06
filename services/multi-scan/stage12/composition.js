'use strict';
// Trusted host factory only. No environment discovery, DB imports, socket listeners or worker spawning.
const {createScannerAuthority}=require('./scanner-authority');
const {createApprovedReleaseProvider,sha,freeze}=require('./approved-release');
const {createConformanceGuard}=require('./conformance');
const {createScanRegistry}=require('./scan-registry');
const {createReviewService,createCorrectionSource}=require('./review-service');
const {Catalog,ImagePolicy}=require('../stage7/catalog');
const {AiClient,nativeTransport}=require('../stage7/client');
const {Integration}=require('../stage7/integration');
const {createAdmission}=require('../stage10/admission');
const {encodeOrientedRgb}=require('../stage10/upload-bridge');
const {readSessionConfig}=require('../stage11/session-config');
const {createEndpoints}=require('./endpoints');
const {config}=require('../contracts');
const {check,abort}=require('../stage7/contracts');
function createScannerAssembly(options={}) {
 // Disabled construction neither inspects providers nor constructs an Express router.
 if(options.enabled!==true)return Object.freeze({router:null,isReady:()=>false,close:()=>Promise.resolve()});
 const {sessionConfig,repository,releaseProvider,aiConfig,loadRuntime,imagePrefixes,ownerMode,clock=()=>Math.floor(Date.now()/1000),operationTimeoutMs=30000}=options;
 check(ownerMode==='single-process'&&typeof clock==='function'&&typeof loadRuntime==='function',
  'PROVIDERS_UNAVAILABLE','Scanner dependencies unavailable',503);
 check(Number.isSafeInteger(operationTimeoutMs)&&operationTimeoutMs>=10&&operationTimeoutMs<=30000,'INVALID_CONFIG','Invalid scanner deadline',503);
 check(repository&&['usersByEmail','store','packageOwner','products','brands','searchProducts','withSnapshot','productPage'].every(k=>typeof repository[k]==='function')&&
  [repository.User,repository.Estore].every(m=>m&&typeof m.find==='function'),'PROVIDERS_UNAVAILABLE','Trusted catalog/session sources required',503);
 check(aiConfig&&typeof sessionConfig?.key==='string'&&aiConfig.serviceKey!==sessionConfig.key,
  'DISTINCT_KEYS_REQUIRED','Separate scanner credentials required',503);
 let closed=false,closePromise;const pending=new Set(),controllers=new Set(),results=new Map(),views=new Map();let viewBytes=0;
 function own(value){const p=Promise.resolve(value);pending.add(p);void p.finally(()=>pending.delete(p)).catch(()=>{});return p;}
 const wrapPort=fn=>(...args)=>own(Promise.resolve().then(()=>fn(...args)));
 const repo=Object.freeze(Object.fromEntries(['usersByEmail','store','packageOwner','products','brands','searchProducts','withSnapshot','productPage'].map(k=>[k,wrapPort(repository[k].bind(repository))])));
 const authority=createScannerAuthority({sessionConfig,repository:repo,clock});
 const catalog=new Catalog({repository:repo,security:authority.security,imagePolicy:new ImagePolicy(imagePrefixes),clock});
 check(releaseProvider&&typeof releaseProvider.load==='function'&&typeof releaseProvider.approval==='function','RELEASE_PROVIDER_UNAVAILABLE','Release provider required',503);
 const releases=createApprovedReleaseProvider({authority,provider:{load:wrapPort(releaseProvider.load.bind(releaseProvider)),approval:wrapPort(releaseProvider.approval.bind(releaseProvider))},clock});
 const transport=aiConfig.transport||nativeTransport;
 check(typeof transport==='function'&&(aiConfig.lookup===undefined||typeof aiConfig.lookup==='function'),'AI_UNCONFIGURED','Trusted transport required',503);
 // Track underlying transport/DNS settlement even when AiClient returns a timeout first.
 const clientOptions={...aiConfig,clock,timeoutMs:operationTimeoutMs,transport:wrapPort(transport)};
 if(aiConfig.lookup)clientOptions.lookup=wrapPort(aiConfig.lookup);
 else {const dns=require('node:dns/promises');clientOptions.lookup=wrapPort(host=>dns.lookup(host,{all:true}));}
 const client=new AiClient(clientOptions),integration=new Integration({security:authority.security,catalog,client});
 const conformance=createConformanceGuard({releases});
 const corrections=createCorrectionSource({authority,catalog,repository:repo});
 const registry=createScanRegistry({authority,releases,recognition:{async read(ctx){const r=results.get(ctx.scanId);check(r&&r.normalizedImageSha256===ctx.normalizedImageSha256,'PROVENANCE_INVALID','Owned result required',503);return r;}},corrections,ownerMode,clock});
 const review=createReviewService({authority,catalog,releases,registry,corrections,clock});
 const admission=createAdmission({enabled:true,clock:()=>clock()*1000});
 const uploadConfig=config({MULTI_SCAN_ENABLED:'true'});let runtime;
 function runtimePort(){
  check(!closed,'OWNER_CLOSED','Scanner closed',503);
  if(!runtime){const r=loadRuntime();if(r&&typeof r.then==='function')void Promise.resolve(r).catch(()=>{});check(r&&typeof r.then!=='function'&&typeof r.multer==='function'&&typeof r.sharp==='function','UPLOAD_RUNTIME_UNAVAILABLE','Verified upload runtime required',503);
   const sharp=r.sharp;
   // Proxy chaining must return the same proxy, not a substitute pipeline/authority.
   const wrapSharp=(...args)=>{const target=sharp(...args);let proxy;proxy=new Proxy(target,{get(t,k){const v=t[k];if(typeof v!=='function')return v;return (...a)=>{if(['metadata','toBuffer'].includes(k))return own(Promise.resolve().then(()=>v.apply(t,a)));const result=v.apply(t,a);return result===t?proxy:result;};}});return proxy;};
   runtime=Object.freeze({multer:r.multer,sharp:wrapSharp});
  }return runtime;
 }
 // Stage11's session endpoint uses exactly the same existing model handles and key.
 function sessionModel(model){return {find(...args){check(!closed,'OWNER_CLOSED','Scanner closed',503);let query=model.find(...args);const proxy=new Proxy({}, {get(_target,key){const value=query[key];if(typeof value!=='function')return value;return (...a)=>{if(key==='exec')return own(Promise.resolve().then(()=>{check(!closed,'OWNER_CLOSED','Scanner closed',503);return value.apply(query,a);}));query=value.apply(query,a);return proxy;};}});return proxy;}};}
 const sessionSources=Object.freeze({User:sessionModel(repository.User),Estore:sessionModel(repository.Estore)});
 function getSessionSources(){const configured=readSessionConfig(true);check(!closed&&configured.enabled&&['key','issuer','audience','ttl'].every(k=>configured[k]===sessionConfig[k]),'AUTH_UNCONFIGURED','Scanner session configuration unavailable',503);return sessionSources;}
 function pruneViews(){for(const [id,v] of views)if(v.expiresAt<=clock()){viewBytes-=v.bytes;views.delete(id);}}
 function putView(scan,data){pruneViews();const text=JSON.stringify(data),bytes=Buffer.byteLength(text);check(bytes<=65536&&views.size<128&&viewBytes+bytes<=8388608,'REVIEW_CAPACITY','Review capacity unavailable',503);views.set(scan.scanId,{expiresAt:scan.expiresAt,bytes,data:freeze(JSON.parse(text))});viewBytes+=bytes;}
 function publicScan(scan){pruneViews();const view=views.get(scan.scanId);return freeze({schemaVersion:2,scanId:scan.scanId,status:scan.status,revision:scan.revision,reviewVersion:scan.reviewVersion,expiresAt:scan.expiresAt,tenant:{storeId:scan.principal.storeId,packageId:scan.principal.packageId},...(view&&['reviewable','quote-issued'].includes(scan.status)?{review:view.data}:{}),reviewRequired:true,confirmed:false,cartMutation:false});}
 async function scan(grant,{submissionId,readPhoto},signal){
  abort(signal);const authorized=await authority.revalidate(grant,{signal});
  const lease=admission.acquire({verifiedPrincipal:authorized,tenant:authorized});let reserved,worker;
  try{
   const photo=await readPhoto();abort(signal);
   const encoded=await encodeOrientedRgb(photo,{sharp:runtimePort().sharp,signal});
   reserved=await registry.reserve(grant,{submissionId,image:encoded.photo},{signal});
   if(reserved.duplicate)return publicScan(reserved.scan);
   worker=reserved.worker;
   const started=await registry.start(worker,{expectedRevision:reserved.scan.revision},{signal});
   const release=await releases.resolve(grant,{signal});
   check(release.releaseId===started.release.id&&release.digest===started.release.digest,'RELEASE_CHANGED','Release changed',409);
   const result=await integration.scanLive({grant,release,scanId:started.scanId,requestId:started.requestId,photo:encoded.photo,signal,conformance});
   abort(signal);
   // No model output can publish directly: P3 reads this private, hash-bound server result.
   results.set(started.scanId,{normalizedImageSha256:sha(encoded.photo),envelope:result.envelope});
   const completed=await registry.complete(worker,{expectedRevision:started.revision},{signal});worker=null;
   // Presentation cache is bounded/expiring, never provenance or quote authority.
   const presentation={...result.review};delete presentation.tenant;
   presentation.detections=presentation.detections.map(d=>{const safe={...d};delete safe.ocr;return safe;});
   putView(completed,presentation);return publicScan(completed);
  }finally{
   if(reserved)results.delete(reserved.scan.scanId);
   if(worker){try{registry.settle(worker);}catch{/* completed/expired owner cannot be revived */}}
   lease.release();
  }
 }
 // HTTP timeout/abort ends the caller, not this operation's ownership or provider promises.
 function run(task,{signal}={}){
  check(!closed,'OWNER_CLOSED','Scanner closed',503);const controller=new AbortController();controllers.add(controller);
  const external=()=>controller.abort();signal?.addEventListener('abort',external,{once:true});if(signal?.aborted)controller.abort();
  const work=own(Promise.resolve().then(()=>{abort(controller.signal);return task(controller.signal);}));
  let timer,onAbort;const cancelled=new Promise((resolve,reject)=>{onAbort=()=>reject(Object.assign(new Error('Scanner request cancelled'),{status:controller.timedOut?504:499,code:controller.timedOut?'OPERATION_TIMEOUT':'ABORTED'}));controller.signal.addEventListener('abort',onAbort,{once:true});});
  timer=setTimeout(()=>{controller.timedOut=true;controller.abort();},operationTimeoutMs);
  void work.finally(()=>{controllers.delete(controller);signal?.removeEventListener('abort',external);}).catch(()=>{});
  return Promise.race([work,cancelled]).finally(()=>{clearTimeout(timer);controller.signal.removeEventListener('abort',onAbort);});
 }
 const ports=Object.freeze({authenticate:(input)=>authority.authenticate(input),scan,status:async(grant,input,signal)=>publicScan(await registry.status(grant,input,{signal})),cancel:async(grant,input,signal)=>publicScan(await registry.cancel(grant,input,{signal})),search:(g,i,s)=>review.search(g,i,{signal:s}),quote:(g,i,s)=>review.quote(g,i,{signal:s}),confirm:(g,i,s)=>review.confirm(g,i,{signal:s}),attempt:(g,i,s)=>review.attempt(g,i,{signal:s}),run,getSessionSources,loadRuntime:runtimePort,uploadConfig});
 const router=createEndpoints({ports,isOpen:()=>!closed});
 return Object.freeze({router,isReady:()=>!closed,close(){if(!closePromise){closed=true;admission.disable();for(const controller of controllers)controller.abort();closePromise=(async()=>{while(pending.size)await Promise.allSettled([...pending]);registry.dispose();review.dispose();results.clear();views.clear();viewBytes=0;})();}return closePromise;}});
}
module.exports={createScannerAssembly};
