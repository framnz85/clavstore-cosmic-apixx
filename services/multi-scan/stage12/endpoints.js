'use strict';
// Inert factory: accepts only the privately composed ports, never request-created authority.
const express=require('express');
const {createUpload}=require('../upload');
const {createSessionEndpoint}=require('../stage11/session-factory');
const {check,abort}=require('../stage7/contracts');
const PREFIX='/ai/multi-scan';
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
const id=v=>typeof v==='string'&&/^[a-f0-9]{24}$/.test(v);
function fields(value,required,optional=[]){check(value&&typeof value==='object'&&!Array.isArray(value)&&required.every(k=>Object.hasOwn(value,k))&&Object.keys(value).every(k=>required.includes(k)||optional.includes(k)),'INVALID_REQUEST','Invalid scanner request',400);}
function createEndpoints({ports,isOpen}={}){
 check(ports&&['authenticate','scan','status','cancel','search','quote','confirm','attempt','run','getSessionSources','loadRuntime'].every(k=>typeof ports[k]==='function')&&ports.uploadConfig&&typeof isOpen==='function','ENDPOINTS_UNCONFIGURED','Scanner endpoints unavailable',503);
 const router=express.Router(),upload=createUpload(ports.uploadConfig,ports.loadRuntime);
 router.use(PREFIX,(req,res,next)=>{res.set('Cache-Control','no-store');if(isOpen()!==true)return res.status(503).json({ok:false,error:{code:'SCANNER_UNAVAILABLE',message:'Scanner unavailable'}});next();});
 router.post(PREFIX+'/session',(req,res,next)=>{const send=res.json;res.json=function(value){if(isOpen()!==true)return send.call(this.status(503),{ok:false,error:{code:'SCANNER_UNAVAILABLE',message:'Scanner unavailable'}});return send.call(this,value);};next();},createSessionEndpoint({mainEnabled:true,getSources:ports.getSessionSources}));
 router.use(PREFIX,express.json({limit:'32kb',strict:true}),(req,res,next)=>{try{if(req.body)check(Buffer.byteLength(JSON.stringify(req.body))<=32768,'JSON_TOO_LARGE','Invalid scanner request',413);next();}catch(e){next(e);}});
 async function authenticate(req,signal){
  const h=req.headers;
  check(typeof h.authtoken==='string'&&h.authtoken.length>0&&h.authtoken.length<=8192&&!h.authorization,'INVALID_TOKEN','Scanner credential required',401);
  check(id(h.estoreid)&&id(h.resellid),'INVALID_SCOPE','Canonical scanner scope required',400);
  check(h['x-multi-scan-schema-version']==='2','UNSUPPORTED_SCHEMA','Scanner schema version2 required',400);
  return ports.authenticate({token:h.authtoken,requestedStoreId:h.estoreid,requestedPackageId:h.resellid,signal});
 }
 const handler=task=>(req,res,next)=>{
  const controller=new AbortController();const disconnected=()=>{if(!res.writableFinished)controller.abort();};
  const aborted=()=>controller.abort();req.once('aborted',aborted);res.once('close',disconnected);
  Promise.resolve().then(()=>ports.run(async signal=>{const grant=await authenticate(req,signal);const value=await task(req,res,grant,signal);abort(signal);return value;},{signal:controller.signal})).then(value=>{if(!res.destroyed&&!res.writableEnded)res.status(200).json(value);},error=>{if(!res.destroyed&&!res.writableEnded)next(error);}).finally(()=>{req.removeListener('aborted',aborted);res.removeListener('close',disconnected);});
 };
 router.post(PREFIX+'/scan',handler(async(req,res,grant,signal)=>{
  fields(req.query,[]);const submissionId=req.headers['x-multi-scan-submission-id'];check(uuid(submissionId),'INVALID_SUBMISSION','Submission UUID required',400);
  return ports.scan(grant,{submissionId,readPhoto:async()=>{
   await new Promise((resolve,reject)=>{
    const cancelled=()=>{req.destroy();reject(Object.assign(new Error('Upload cancelled'),{status:499,code:'ABORTED'}));};
    signal.addEventListener('abort',cancelled,{once:true});
    upload(req,res,error=>{signal.removeEventListener('abort',cancelled);error?reject(error):resolve();});
    if(signal.aborted)cancelled();
   });
   const photo=req.multiScanPhoto;delete req.multiScanPhoto;return photo;
  }},signal);
 }));
 router.get(PREFIX+'/status',handler((req,res,g,s)=>{fields(req.query,['schemaVersion','scanId']);check(req.query.schemaVersion==='2'&&uuid(req.query.scanId),'INVALID_REQUEST','Invalid scanner status',400);return ports.status(g,{scanId:req.query.scanId},s);}));
 router.post(PREFIX+'/stage12/cancel',handler((req,res,g,s)=>{fields(req.query,[]);fields(req.body,['schemaVersion','scanId','expectedRevision']);check(req.body.schemaVersion===2,'UNSUPPORTED_SCHEMA','Version2 required',400);return ports.cancel(g,{scanId:req.body.scanId,expectedRevision:req.body.expectedRevision},s);}));
 router.get(PREFIX+'/stage8/products',handler((req,res,g,s)=>{fields(req.query,['schemaVersion','scanId','expectedRevision','detectionId','q'],['limit']);check(req.query.schemaVersion==='2'&&/^(0|[1-9]\d{0,8})$/.test(req.query.expectedRevision)&&(req.query.limit===undefined||req.query.limit==='20'),'INVALID_REQUEST','Invalid correction query',400);return ports.search(g,{schemaVersion:2,scanId:req.query.scanId,expectedRevision:Number(req.query.expectedRevision),detectionId:req.query.detectionId,query:req.query.q},s);}));
 for(const [path,method] of [['/stage8/review','quote'],['/stage12/commit-permit','confirm']])router.post(PREFIX+path,handler((req,res,g,s)=>{fields(req.query,[]);return ports[method](g,req.body,s);}));
 router.get(PREFIX+'/stage12/attempt/:id',handler((req,res,g,s)=>{fields(req.query,['schemaVersion','scanId']);check(req.query.schemaVersion==='2','UNSUPPORTED_SCHEMA','Version2 required',400);return ports.attempt(g,{schemaVersion:2,scanId:req.query.scanId,attemptId:req.params.id},s);}));
 router.use(PREFIX,(error,req,res,next)=>{if(res.headersSent)return next(error);const status=[400,401,403,408,409,410,413,415,422,429,499,502,503,504].includes(error.status)?error.status:503;const code=status===503?'SCANNER_UNAVAILABLE':status===502?'INVALID_AI_RESPONSE':typeof error.code==='string'&&/^[A-Z0-9_]{1,64}$/.test(error.code)?error.code:'SCANNER_UNAVAILABLE';res.status(status).set('Cache-Control','no-store').json({ok:false,error:{code,message:'Scanner unavailable or request rejected'}});});
 return router;
}
module.exports={createEndpoints};
