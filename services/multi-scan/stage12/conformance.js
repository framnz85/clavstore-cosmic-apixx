'use strict';
const {digest,sha,check,sameTenant} = require('./approved-release');
const {validateResponse} = require('../stage7/validation');
function createConformanceGuard({releases}={}) {
  check(releases&&typeof releases.assertActive==='function'&&typeof releases.details==='function','RELEASE_PROVIDER_UNAVAILABLE');
  return async function validate(envelope,{release,requestId,scanId,signal}={}) {
    await releases.assertActive(release,{signal});
    let serialized;try{serialized=JSON.stringify(envelope);}catch{check(false,'INVALID_AI_RESPONSE',502);}
    check(typeof serialized==='string'&&Buffer.byteLength(serialized)<=1048576,'INVALID_AI_RESPONSE',502);
    envelope=JSON.parse(serialized);
    const data=releases.details(release),result=envelope?.result;
    // Existing structural validation is additive; never normalize before completeness checks.
    check(envelope?.ok===true&&envelope.requestId===requestId&&sameTenant(envelope.tenant,release.tenant)&&
      result&&result.scanId===scanId&&sameTenant(result.tenant,release.tenant),'AI_RELEASE_MISMATCH',502);
    check(result.release?.id===release.releaseId&&result.release?.digest===release.digest,'AI_RELEASE_MISMATCH',502);
    check(digest(result.detector?.model)===release.pipeline.detectorDigest,'AI_MODEL_MISMATCH',502);
    check(result.detector?.quality&&result.detector.quality.truncated===false&&result.detector.quality.candidateLimitApplied===false&&
      Array.isArray(result.reviewReasons)&&!result.reviewReasons.includes('CROP_LIMIT_APPLIED'),'INCOMPLETE_SCAN',422);
    check(Array.isArray(result.results)&&result.results.length<=10,'INVALID_AI_RESPONSE',502);
    for(const detection of result.results) {
      check(detection.catalogRevision===release.catalog.snapshotRevision&&
        detection.indexGenerations?.siglip2===release.siglip.generation&&detection.indexGenerations?.dinov2===release.dino.generation,'AI_INDEX_MISMATCH',502);
      check(digest(detection.models?.siglip2)===release.siglip.modelAndPreprocessorDigest&&
        digest(detection.models?.dinov2)===release.dino.modelAndPreprocessorDigest&&
        digest(detection.models?.ocr)===release.pipeline.ocrAndDictionaryDigest,'AI_MODEL_MISMATCH',502);
      check(detection.policy?.version===data.pipeline.policy.version&&detection.policy?.sha256===data.pipeline.policy.sha256&&
        detection.policy.settings&&typeof detection.policy.settings==='object'&&sha(JSON.stringify(detection.policy.settings))===data.pipeline.policy.sha256,'AI_POLICY_MISMATCH',502);
      check(Array.isArray(detection.candidates)&&detection.candidates.length<=20,'INVALID_AI_RESPONSE',502);
      for(const candidate of detection.candidates) {
        check(sameTenant(candidate,release.tenant),'AI_RELEASE_MISMATCH',502);
        for(const [name,score] of Object.entries(candidate.scores||{})) {
          const slot=name==='siglip2'?'siglip':name==='dinov2'?'dino':null;
          check(slot&&data.indexes[slot].mapping.some(row=>row.productId===candidate.productId&&row.referenceId===score.referenceId),'AI_PRODUCT_MISMATCH',502);
        }
      }
    }
    const normalized=validateResponse(envelope,{tenant:release.tenant,requestId,scanId});
    await releases.assertActive(release,{signal});return normalized;
  };
}
module.exports={createConformanceGuard};
