'use strict';
// Offline only: node evaluate.js dataset.json predictions.json NEW-result.json [photo-root]
const fs=require('node:fs/promises');
const {verifyPhotos}=require('../../../services/multi-scan/stage9/dataset');
const {evaluate}=require('../../../services/multi-scan/stage9/evaluation');
async function main(){const [manifest,predictions,output,root]=process.argv.slice(2);if(!manifest||!predictions||!output)throw Error('Supply dataset, predictions and a new result path');for(const f of [manifest,predictions])if((await fs.stat(f)).size>16777216)throw Error('JSON exceeds 16 MiB');const dataset=JSON.parse(await fs.readFile(manifest)),result=evaluate(dataset,JSON.parse(await fs.readFile(predictions)));result.photoVerification=root?await verifyPhotos(dataset,root):{verified:false,reason:'No photo root supplied; metrics are label-only and not a validated photograph evaluation'};await fs.writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});}
main().catch(e=>{console.error(e.code||'EVALUATION_FAILED',e.message);process.exitCode=1;});
