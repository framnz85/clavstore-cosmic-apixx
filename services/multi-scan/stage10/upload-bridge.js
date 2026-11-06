'use strict';
const {check}=require('../stage7/contracts');
// Standalone Stage 2 oriented-RGB -> Stage 7 encoded-image bridge. No route is installed.
async function encodeOrientedRgb(photo,{sharp,signal,maxBytes=10485760}={}){
 check(typeof sharp==='function','UPLOAD_RUNTIME_UNAVAILABLE','Explicit verified image runtime required',503);
 check(!signal?.aborted,'ABORTED','Upload cancelled',499);
 const {width,height,channels,format,data}=photo||{};
 check(Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>0&&height>0&&width<=10000&&height<=10000&&width*height<=24000000&&channels===3&&format==='raw-rgb'&&Buffer.isBuffer(data)&&data.length===width*height*3,'INVALID_IMAGE','Bounded EXIF-oriented RGB is required',415);
 check(Number.isSafeInteger(maxBytes)&&maxBytes>=1024&&maxBytes<=10485760,'INVALID_CONFIG','Encoded limit must not exceed Stage 7 ten MiB');
 const encoded=await sharp(Buffer.from(data),{raw:{width,height,channels:3}}).png().toBuffer();
 check(!signal?.aborted,'ABORTED','Upload cancelled',499);
 check(encoded.length>0&&encoded.length<=maxBytes,'IMAGE_TOO_LARGE','Re-encoded upload exceeds the ten MiB contract',413);
 return {photo:encoded,image:{width,height},mime:'image/png',orientation:'already-applied-by-stage2',reviewRequired:true};
}
module.exports={encodeOrientedRgb};
