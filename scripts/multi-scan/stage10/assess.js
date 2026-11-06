'use strict';
const fs=require('node:fs/promises');
const {assessAccuracy,readinessSummary,proposedGates}=require('../../../services/multi-scan/stage10/readiness');
async function main(){const output=process.argv[2];if(!output)throw Error('Supply a NEW report path');const result={stage:10,scope:'offline-readiness-assessment-only',overall:readinessSummary(),commercialRecognition:assessAccuracy(null),proposedGates,featureMounted:false,productionAccess:false,cartMutation:false,rolloutPhasesExecuted:[]};await fs.writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,status:result.overall.status,activationAllowed:false}));}
main().catch(e=>{console.error('ASSESSMENT_FAILED',e.code||'ERROR');process.exitCode=1;});
