'use strict';
process.env.ORT_DISABLE_TELEMETRY='1';
const fs=require('node:fs/promises'),os=require('node:os');
const {performance}=require('node:perf_hooks');
const {createFixture,scope,id}=require('../../../services/multi-scan/stage9/fixture');
const {createNative,syntheticPhoto,summarizeTimings}=require('../../../services/multi-scan/stage9/native');
const {OfflineHarness,reviewedSelections}=require('../../../services/multi-scan/stage9/orchestrator');
const {createOfflineReviewVerifier}=require('../../../services/multi-scan/stage9/review-verifier');
async function main(){
 const [operation,root,output,countArg='1',mode='controlled-crops']=process.argv.slice(2),count=Number(countArg);
 if(!['build','benchmark'].includes(operation)||!root||!output)throw Error('Supply build/benchmark, /tmp index root and new output path');
 const fixture=createFixture(),start=performance.now(),baseline=process.memoryUsage().rss;
 const native=await createNative({fixture,root,build:operation==='build',count,mode});
 const result={kind:operation==='build'?'native-isolated-index-build':'native-offline-pipeline-benchmark',mode,count,synthetic:true,realGroceryAccuracyMeasured:false,hardware:{cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,totalMemoryBytes:os.totalmem(),platform:os.platform(),arch:os.arch(),node:process.version},baselineRssBytes:baseline,setupMs:native.setupMs,models:native.models,indexBuilds:native.builds,threadsPerNativeModel:2};
 let samples=[];
 try{
  if(operation==='benchmark'){
   const photo=await syntheticPhoto(native.images,count);result.photoBytes=photo.length;
   const harness=new OfflineHarness({fixture,pipeline:native.pipeline,afterInference:async f=>{f.state.products[0].price=12.75;}});
   const initialization={};for(const [name,worker] of Object.entries(native.workers)){initialization[name]={residentBeforeFirstScan:name==='yolox'?!!worker.manager.session:!!worker.session||!!worker.sessions?.rec};}
   for(let run=0;run<3;run++){
    const actual=await harness.run({photo,submissionId:`${mode}-${count}-${run}`});
    const rawCount=native.lastDetector.detections.length;
    const t=performance.now();
    const decisions=Object.fromEntries(actual.review.detections.map((d,i)=>[d.detectionId,mode==='controlled-crops'?{reviewed:true,productId:id(i%fixture.specs.length),quantity:1}:{exclude:true}]));
    const aggregation=reviewedSelections(actual.review,decisions),aggregationMs=performance.now()-t;
    const verifiedStart=performance.now();
    const cartReady=aggregation.items.length?await createOfflineReviewVerifier({fixture})({scanId:actual.review.scanId,items:aggregation.items,cartFingerprint:'[]'}):null;
    const finalReviewMs=performance.now()-verifiedStart;
    actual.simulatedCashierAggregation=aggregation;actual.cartReadyReview=cartReady;
    result.samples=result.samples||[];result.samples.push({phase:run===0?'cold-model-scan':'warm-scan',count:actual.review.detections.length,actualYoloxDetections:rawCount,timings:{...summarizeTimings(actual),simulatedAggregationMs:aggregationMs,finalFreshReviewMs:finalReviewMs,totalThroughSimulatedReviewMs:actual.timings.totalMs+aggregationMs+finalReviewMs},cpu:actual.cpu,memory:actual.memory,unknownDetections:actual.review.detections.filter(d=>!d.candidates.length||d.status==='unknown_or_unverified').length});
    if(run===0){result.example=actual;result.example.image=actual.raw.detector.image;}
    samples.push(actual);
   }
   result.initialization=initialization;
   // Simulated human fixture choices use known workload image order, not inferred rank.
   if(mode==='controlled-crops'){
    const example=result.example.review,decisions=Object.fromEntries(example.detections.map((d,i)=>[d.detectionId,{reviewed:true,productId:id(i%fixture.specs.length),quantity:1}]));
    result.simulatedCashier=reviewedSelections(example,decisions);
   }
   const first=harness.run({photo,submissionId:'concurrent-first'});
   try{await harness.run({photo,submissionId:'concurrent-second'});throw Error('Concurrent scan unexpectedly accepted');}catch(e){if(e.code!=='HARNESS_BUSY')throw e;result.concurrent={secondRejected:true,code:e.code,waitingQueue:false};}
   await first;
   try{await harness.run({photo,submissionId:'concurrent-first'});throw Error('Duplicate scan accepted');}catch(e){if(e.code!=='DUPLICATE_SUBMISSION')throw e;result.duplicateSubmission={rejected:true,code:e.code};}
   result.currentPriceAfterInference=fixture.state.products[0].price;
  }
  result.processCpuUsage=process.cpuUsage();result.peakProcessRssBytes=process.resourceUsage().maxRSS*1024;result.finalRssBytes=process.memoryUsage().rss;result.totalWorkerMs=performance.now()-start;result.databaseWrites=fixture.state.writes;result.cartMutation=false;result.featureActivated=false;
 }finally{await native.close();}
 await fs.writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({operation,mode,count,output,totalWorkerMs:result.totalWorkerMs,peakRssBytes:result.peakProcessRssBytes,samples:result.samples?.map(s=>({phase:s.phase,count:s.count,actualYoloxDetections:s.actualYoloxDetections,totalMs:s.timings.totalMs}))}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
