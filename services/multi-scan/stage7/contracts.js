'use strict';
const {createHash,randomUUID}=require('node:crypto');
class IntegrationError extends Error{constructor(code,message,status=500){super(message);this.code=code;this.status=status;}}
function check(ok,code,message,status=400){if(!ok)throw new IntegrationError(code,message,status);}
function id(v){const s=typeof v==='string'?v:v&&typeof v.toHexString==='function'?v.toHexString():null;check(typeof s==='string'&&/^[a-f0-9]{24}$/i.test(s),'INVALID_ID','Canonical ObjectId required');return s.toLowerCase();}
function abort(signal){check(!signal?.aborted,'ABORTED','Operation cancelled',499);}
function freeze(v){if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
const clone=v=>JSON.parse(JSON.stringify(v));
const sha=b=>createHash('sha256').update(b).digest('hex');
const digest=v=>sha(Buffer.from(JSON.stringify(v)));
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
const same=(a,b)=>id(a.storeId)===id(b.storeId)&&id(a.packageId)===id(b.packageId);
const text=(v,n=512)=>typeof v==='string'?v.slice(0,n):'';
module.exports={IntegrationError,check,id,abort,freeze,clone,sha,digest,uuid,same,text,newId:randomUUID};
