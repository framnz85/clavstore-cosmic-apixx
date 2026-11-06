'use strict';
const {check}=require('../stage7/contracts');
// Inert process-local admission model. Never mounted and never shared across production workers.
function createAdmission({enabled=false,maxActive=1,maxKeys=128,burst=3,refillMs=60000,clock=()=>Date.now()}={}){
 check(Number.isInteger(maxActive)&&maxActive>=1&&maxActive<=1&&Number.isInteger(maxKeys)&&maxKeys>=1&&maxKeys<=1024&&Number.isInteger(burst)&&burst>=1&&burst<=10&&Number.isInteger(refillMs)&&refillMs>=1000,'INVALID_CONFIG','Bounded isolated admission configuration required');
 let open=enabled===true,active=0;const buckets=new Map();
 return {
  acquire({verifiedPrincipal,tenant}={}){
   check(open,'FEATURE_DISABLED','Multi-scan disabled',503);
   check(/^[a-f0-9]{24}$/.test(verifiedPrincipal?.userId||'')&&/^[a-f0-9]{24}$/.test(tenant?.storeId||'')&&/^[a-f0-9]{24}$/.test(tenant?.packageId||''),'VERIFIED_CONTEXT_REQUIRED','Call only after Stage 7 authorization',403);
   // IDs are a trusted caller precondition, not a replacement for authentication.
   check(active<maxActive,'BUSY','Worker busy; no waiting queue',429);
   const key=tenant.packageId+':'+tenant.storeId+':'+verifiedPrincipal.userId,now=clock();
   for(const [k,b] of buckets)if(now-b.updated>=refillMs*burst)buckets.delete(k);
   let bucket=buckets.get(key);
   if(!bucket){check(buckets.size<maxKeys,'RATE_LIMIT_CAPACITY','Admission state capacity reached',429);bucket={tokens:burst,updated:now};}
   const elapsed=Math.max(0,now-bucket.updated);bucket.tokens=Math.min(burst,bucket.tokens+elapsed/refillMs);bucket.updated=now;
   check(bucket.tokens>=1,'RATE_LIMITED','Too many scans; retry later',429);bucket.tokens--;buckets.set(key,bucket);active++;
   let released=false;return {release(){if(!released){released=true;active--;}}};
  },disable(){open=false;},status(){return {enabled:open,active,trackedKeys:buckets.size,queueLength:0,scope:'process-local-offline-model'};}
 };
}
module.exports={createAdmission};
