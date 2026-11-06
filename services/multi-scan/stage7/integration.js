'use strict';
const {check,uuid,newId,IntegrationError}=require('./contracts');
const {validateResponse}=require('./validation');
const {resolveReview}=require('./resolution');
async function protect(fn){try{return await fn();}catch(e){if(e instanceof IntegrationError)throw e;throw new IntegrationError('BACKEND_UNAVAILABLE','Authoritative integration unavailable',503);}}
function imageBuffer(photo){check(Buffer.isBuffer(photo)&&photo.length>0&&photo.length<=10485760,'INVALID_IMAGE','Encoded image Buffer up to 10 MiB required',415);const png=photo.length>=8&&photo.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),jpeg=photo[0]===255&&photo[1]===216&&photo[2]===255,webp=photo.subarray(0,4).toString()==='RIFF'&&photo.subarray(8,12).toString()==='WEBP';check(png||jpeg||webp,'INVALID_IMAGE','JPEG/PNG/WebP container required',415);return png?'image/png':jpeg?'image/jpeg':'image/webp';}
class Integration{
 constructor({security,catalog,client}){check(security&&catalog&&client,'INTEGRATION_UNCONFIGURED','Explicit isolated services required',503);Object.assign(this,{security,catalog,client});this.active=false;}
 async scan({token,storeId,packageHint,photo,requestId=newId(),signal}={}){check(!this.active,'INTEGRATION_BUSY','One scan per integration instance',429);check(uuid(requestId),'INVALID_REQUEST_ID','Request UUID required');this.active=true;try{const grant=await this.security.authenticate({token,storeId,packageHint,signal}),mime=imageBuffer(photo),scanId=newId(),image=Buffer.from(photo),scope={storeId:grant.storeId,packageId:grant.packageId,userId:grant.userId,role:grant.role};const envelope=await this.client.request('recognize',{tenant:scope,requestId,signal,body:{schemaVersion:1,scanId,tenant:{storeId:grant.storeId,packageId:grant.packageId},image:{encoding:'base64',mime,data:image.toString('base64')},topK:5}});const valid=validateResponse(envelope,{tenant:scope,requestId,scanId});return await resolveReview(valid,grant,this.catalog,{signal});}catch(e){if(e instanceof IntegrationError)throw e;throw new IntegrationError('BACKEND_UNAVAILABLE','Authoritative integration unavailable',503);}finally{this.active=false;}}
 // Explicit P6 path only; legacy scan DTO and authorization remain unchanged.
 async scanLive({grant,release,scanId,requestId,photo,signal,conformance}={}) {
  check(!this.active,'INTEGRATION_BUSY','One scan per integration instance',429);
  check(uuid(scanId)&&uuid(requestId)&&typeof conformance==='function'&&release,
    'LIVE_INTEGRATION_UNCONFIGURED','Explicit live context required',503);
  this.active=true;
  try {
   const authorized=await this.security.revalidate(grant,{signal});
   check(authorized.storeId===release.tenant.storeId&&authorized.packageId===release.tenant.packageId,
     'STORE_FORBIDDEN','Scanner scope denied',403);
   const mime=imageBuffer(photo),image=Buffer.from(photo);
   const envelope=await this.client.request('recognize',{tenant:authorized,requestId,signal,body:{schemaVersion:1,scanId,
    tenant:{storeId:authorized.storeId,packageId:authorized.packageId},release:{id:release.releaseId,digest:release.digest},
    image:{encoding:'base64',mime,data:image.toString('base64')},topK:5}});
   const normalized=await conformance(envelope,{release,requestId,scanId,signal});
   const review=await resolveReview(normalized,grant,this.catalog,{signal});
   await this.security.revalidate(grant,{signal});
   return {envelope,review};
  } finally {this.active=false;}
 }
 async prepareRebuild({token,storeId,packageHint,signal}={}){return protect(async()=>{const grant=await this.security.authenticate({token,storeId,packageHint,signal});await this.security.revalidate(grant,{admin:true,signal});const snapshot=await this.catalog.createSnapshot(grant,{signal});return {state:'prepared_only',snapshot,executionRequested:false,liveIndexRebuilt:false};});}
 async status({token,storeId,packageHint,signal}={}){return protect(async()=>{const grant=await this.security.authenticate({token,storeId,packageHint,signal});await this.security.revalidate(grant,{admin:true,signal});const data=await this.client.request('status',{tenant:grant,signal});check(['not_built','queued','building','ready','failed'].includes(data.result?.state),'INVALID_AI_RESPONSE','Invalid index state',502);return {state:data.result.state,featureActivated:false};});}
}
module.exports={Integration,imageBuffer};
