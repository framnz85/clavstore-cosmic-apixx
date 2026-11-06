'use strict';
// Proposed gates only. This pure function cannot enable routes, deploy or mutate carts.
const proposedGates=Object.freeze({minimumScenes:200,minimumKnownObjects:1000,minimumUnknownObjects:300,minimumAcceptedEvaluationDecisions:1000,exactSkuTop1:.95,detectionRecall:.95,objectCountingAccuracy:.95,reviewedSkuCountingAccuracy:.99,unknownRejection:.95,maximumVariantConfusion:.02,maximumFalseAcceptanceUpper95:.005,requiredCashierReviewCoverage:1});
function falseAcceptanceUpper95(errors,total){if(!Number.isSafeInteger(errors)||!Number.isSafeInteger(total)||errors<0||total<1||errors>total)return null;if(errors===0)return 1-Math.pow(.05,1/total);const z=1.6448536269514722,p=errors/total,den=1+z*z/total;return (p+z*z/(2*total)+z*Math.sqrt(p*(1-p)/total+z*z/(4*total*total)))/den;}
function assessAccuracy(evidence){
 const blockers=[],r=evidence?.evaluation,m=r?.metrics,s=r?.samples,t=r?.totals;
 if(evidence?.realPhotographs!==true||evidence?.rightsAudited!==true||evidence?.heldOutHumanLabelsAudited!==true)blockers.push('REAL_RIGHTS_CLEARED_HELD_OUT_DATA_REQUIRED');
 if(!s||![s.scenes,s.knownObjects,s.unknownObjects].every(n=>Number.isSafeInteger(n)&&n>=0)||s.scenes<proposedGates.minimumScenes||s.knownObjects<proposedGates.minimumKnownObjects||s.unknownObjects<proposedGates.minimumUnknownObjects)blockers.push('INSUFFICIENT_LABELED_SAMPLES');
 for(const [key,min] of [['exactSkuTop1',.95],['detectionRecall',.95],['objectCountingAccuracy',.95],['reviewedSkuCountingAccuracy',.99],['unknownRejection',.95]])if(!Number.isFinite(m?.[key])||m[key]<min||m[key]>1)blockers.push('METRIC_GATE_'+key);
 if(!Number.isFinite(m?.variantConfusion)||m.variantConfusion<0||m.variantConfusion>.02)blockers.push('VARIANT_CONFUSION_GATE');
 const upper=falseAcceptanceUpper95(t?.falseAccepted,t?.accepted);
 if(!t||t.accepted<1000||upper===null||upper>.005)blockers.push('FALSE_ACCEPTANCE_EVIDENCE_GATE');
 // All scanner suggestions still require review in this rollout, regardless of recognition accuracy.
 if(!Number.isFinite(m?.reviewRequiredRate)||m.reviewRequiredRate<0||m.reviewRequiredRate>1||evidence?.cashierReviewCoverage!==1)blockers.push('REVIEW_ONLY_POLICY_GATE');
 return {status:blockers.length?'BLOCKED':'READY FOR OFFLINE TESTING',blockers,falseAcceptanceUpper95:upper,productionReady:false,activationAllowed:false,thresholdsAreProposed:true};
}
function readinessSummary({accuracyPassed=false,endpointsValidated=false,capacityValidated=false,stagingApproved=false}={}){return {status:accuracyPassed&&endpointsValidated&&capacityValidated&&stagingApproved?'READY FOR CONTROLLED STAGING':'BLOCKED',productionReady:false,featureEnabled:false,cartMutationAllowed:false,approvalStillRequired:true};}
module.exports={proposedGates,falseAcceptanceUpper95,assessAccuracy,readinessSummary};
