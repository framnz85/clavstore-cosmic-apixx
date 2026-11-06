'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {performance}=require('node:perf_hooks');
const {check}=require('../stage7/contracts');
const {aiRequire,aiRoot,scope,userId,id}=require('./fixture');
const {getWorkerDetector}=aiRequire('./services/multi-scan/stage3/worker-detector');
const {decodeImage}=aiRequire('./services/multi-scan/stage3/preprocess');
const {extractCrops}=aiRequire('./services/multi-scan/stage3/crops');
const {config:detConfig}=aiRequire('./services/multi-scan/stage3/config');
const {getWorkerEmbedder:getSiglip}=aiRequire('./services/multi-scan/stage4/worker-embedder');
const {getWorkerEmbedder:getDino}=aiRequire('./services/multi-scan/stage5/worker-embedder');
const {IndexStore:SiglipStore}=aiRequire('./services/multi-scan/stage4/index-store');
const {IndexStore:DinoStore}=aiRequire('./services/multi-scan/stage5/index-store');
const {Recognizer:SiglipRecognizer}=aiRequire('./services/multi-scan/stage4/recognizer');
const {Recognizer:DinoRecognizer}=aiRequire('./services/multi-scan/stage5/recognizer');
const {CombinedRecognizer}=aiRequire('./services/multi-scan/stage5/combined-recognizer');
const {OcrWorker}=aiRequire('./services/multi-scan/stage6/ocr');
const {Reranker}=aiRequire('./services/multi-scan/stage6/reranker');
const {CropPipeline,ScanPipeline}=aiRequire('./services/multi-scan/stage6/pipeline');

class ResilientCrops {
 constructor({crops,reranker,models,ocrModel,generations,revision}){Object.assign(this,{crops,reranker,models,ocrModel,generations,revision});}
 async recognize(image,context,options){
  try{return await this.crops.recognize(image,context,options);}catch(error){
   // Authorization, corruption, cancellation, contract errors and missing models remain fatal.
   if(!['INFERENCE_FAILED','OCR_INFERENCE_FAILED'].includes(error.code))throw error;
   const sharp=aiRequire('sharp'),dimensions=await sharp(image).metadata();
   const result=await this.reranker.rerank({detectionId:options.detectionId,
    visual:{candidates:[],models:this.models,generations:this.generations,catalogRevision:this.revision},
    ocr:{rawText:'',normalizedText:'',regions:[],model:this.ocrModel,quality:{width:dimensions.width,height:dimensions.height,usable:false},reviewReasons:['PARTIAL_INFERENCE_FAILURE']},quality:{usable:false}},context);
   return {...result,failure:{code:error.code,evidenceAvailable:false},timings:{...result.timings,failedInference:true}};
  }
 }
}
async function createNative({fixture,root,build=false,mode='yolox',count=1}){
 check(process.env.ORT_DISABLE_TELEMETRY==='1','ISOLATED_WORKER_REQUIRED','Telemetry-disabled child required');
 check(path.isAbsolute(root)&&root.startsWith('/tmp/'),'OFFLINE_PATH_REQUIRED','Indexes must live under /tmp');
 check(['yolox','controlled-crops'].includes(mode),'INVALID_MODE','Explicit native validation mode required');
 check(Number.isInteger(count)&&count>=1&&count<=10,'CROP_LIMIT','Frozen Stage 6/7 permit at most 10 objects',413);
 const start=performance.now(),grant=await fixture.security.authenticate({token:fixture.token(),storeId:scope.storeId});
 const snapshot=await fixture.catalog.createSnapshot(grant),indexing=await fixture.catalog.indexingSnapshot(grant,{snapshotId:snapshot.snapshotId});
 const authorize=async({tenant,principal,operation,signal})=>{check(tenant?.storeId===scope.storeId&&tenant?.packageId===scope.packageId&&principal?.userId===userId,'TENANT_FORBIDDEN','Offline scope denied',403);const verified=await fixture.security.revalidate(grant,{admin:operation==='build',signal});return {storeId:verified.storeId,packageId:verified.packageId};};
 const context={tenant:scope,principal:{userId,role:'admin'}};
 const images=await Promise.all(fixture.specs.map(s=>fs.readFile(path.join(aiRoot,'tests/multi-scan/stage6/images',s.file))));
 const indexCatalog={snapshot:async()=>indexing,image:async({productId,imageKey,tenant,principal,signal})=>{await authorize({tenant,principal,signal,operation:'build'});const p=indexing.products.find(p=>p.productId===productId);check(p?.references.some(r=>r.imageKey===imageKey),'INVALID_REFERENCE','Unknown fixture reference');return images[indexing.products.indexOf(p)];}};
 const siglip=getSiglip(),dino=getDino(),ocr=new OcrWorker(),yolox=getWorkerDetector();
 const stores={siglip2:new SiglipStore({root:path.join(root,'siglip'),model:siglip.metadata,embedder:siglip,catalog:indexCatalog,authorize}),dinov2:new DinoStore({root:path.join(root,'dino'),model:dino.metadata,embedder:dino,catalog:indexCatalog,authorize})};
 const builds={};if(build)for(const [name,store] of Object.entries(stores))builds[name]=await store.build(context);
 const handles={};for(const [name,store] of Object.entries(stores)){handles[name]=await store.load(context);check(handles[name].manifest.catalogRevision===snapshot.revision,'STALE_INDEX','Isolated index revision mismatch');}
 const visual=new CombinedRecognizer({siglip:new SiglipRecognizer({embedder:siglip,indexStore:stores.siglip2}),dino:new DinoRecognizer({embedder:dino,indexStore:stores.dinov2})});
 const reranker=new Reranker({catalog:{lookup:async({productIds,catalogRevision,signal})=>fixture.catalog.metadata(grant,{snapshotId:snapshot.snapshotId,revision:catalogRevision,productIds,signal})},authorize});
 const crops=new CropPipeline({visual,ocr,reranker});
 const resilient=new ResilientCrops({crops,reranker,models:{siglip2:siglip.metadata,dinov2:dino.metadata},ocrModel:ocr.metadata,generations:Object.fromEntries(Object.entries(handles).map(([k,v])=>[k,v.generation])),revision:snapshot.revision});
 let lastDetector;
 const detector={detect:async(image,options)=>{
  const actual=await yolox.detect(image,options);lastDetector=actual;
  if(mode==='yolox')return actual;
  // Workload-only supplied rectangles, never presented as YOLOX detections or grocery labels.
  const t=performance.now(),decoded=await decodeImage(image,detConfig());
  const boxes=Array.from({length:count},(_,i)=>({anchor:i,box:[(i%5)*640,Math.floor(i/5)*300,640,300],score:1,classId:0}));
  const detections=await extractCrops(decoded,boxes,{...options.tenant,scanId:options.scanId},detConfig(),options.signal);
  return {...actual,detections,quality:{...actual.quality,controlledSyntheticBoxes:true},timings:{...actual.timings,controlledDecodeAndCropMs:performance.now()-t}};
 }};
 const pipeline=new ScanPipeline({detector,crops:resilient,maxCrops:10});
 return {pipeline,images,stores,builds,context,setupMs:performance.now()-start,models:{siglip2:siglip.metadata,dinov2:dino.metadata,ocr:ocr.metadata},workers:{siglip,dino,ocr,yolox},get lastDetector(){return lastDetector;},async close(){await ocr.close();await siglip.close();await dino.close();await yolox.close();}};
}
async function syntheticPhoto(images,count){
 const sharp=aiRequire('sharp'),columns=Math.min(5,count),rows=Math.ceil(count/5);
 const composites=[];for(let i=0;i<count;i++)composites.push({input:await sharp(images[i%images.length]).resize(640,300,{fit:'fill'}).png().toBuffer(),left:(i%5)*640,top:Math.floor(i/5)*300});
 return sharp({create:{width:columns*640,height:rows*300,channels:3,background:'white'}}).composite(composites).png().toBuffer();
}
function summarizeTimings(run){
 const raw=run.raw,totals={detectionMs:raw.timings.detection.totalMs,croppingMs:raw.timings.detection.cropMs,controlledDecodeAndCropMs:raw.timings.detection.controlledDecodeAndCropMs||0,siglip2InferenceMs:0,dinov2InferenceMs:0,ocrMs:0,retrievalMs:0,rerankingMs:0,modelInitializationMs:raw.timings.detection.modelLoadMs,catalogValidationMs:run.timings.catalogValidationMs,totalMs:run.timings.totalMs};
 for(const r of raw.results){for(const [name,key] of [['siglip2','siglip2InferenceMs'],['dinov2','dinov2InferenceMs']]){const t=r.timings.visual?.[name];totals[key]+=t?.embedding?.inferenceMs||0;totals.retrievalMs+=t?.retrieval?.totalMs||0;totals.modelInitializationMs+=t?.embedding?.initializeMs||0;}totals.ocrMs+=r.timings.ocr?.totalMs||0;totals.modelInitializationMs+=r.timings.ocr?.initializeMs||0;totals.rerankingMs+=r.timings.rerankingMs||0;}
 return totals;
}
module.exports={createNative,syntheticPhoto,summarizeTimings,ResilientCrops};
