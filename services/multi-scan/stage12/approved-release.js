'use strict';
// Pure, injected read-only approval. No environment, filesystem, database or model imports.
const {createHash} = require('node:crypto');
function check(ok, code = 'RELEASE_INVALID', status = 503) {
  if (!ok) throw Object.assign(new Error('Scanner release unavailable or denied'), {code, status});
}
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const id = value => typeof value === 'string' && /^[a-f0-9]{24}$/.test(value);
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
const generation = value => typeof value === 'string' && value.startsWith('g-') && uuid(value.slice(2));
const text = (value, limit = 128) => typeof value === 'string' && value.length > 0 && value.length <= limit;
function keys(value, names) {
  check(value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === names.length && names.every(k => Object.hasOwn(value, k)));
}
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = value => sha(JSON.stringify(canonical(value)) ?? 'null');
const sameTenant = (a, b) => a && b && id(a.storeId) && id(a.packageId) && a.storeId === b.storeId && a.packageId === b.packageId;
function scope(value) {
  check(value && id(value.storeId) && id(value.packageId) && id(value.userId) &&
    ['admin','moderator','cashier'].includes(value.role), 'AUTHORITY_INVALID', 503);
  return {storeId:value.storeId, packageId:value.packageId, userId:value.userId, role:value.role};
}
function parse(bytes) { check(text(bytes, 8388608)); try { return JSON.parse(bytes); } catch { check(false); } }
function validateBundle(input, tenant, now) {
  let bundle;
  try {
    const raw = JSON.stringify(input); check(typeof raw === 'string' && Buffer.byteLength(raw) <= 16777216);
    bundle = JSON.parse(raw);
  } catch { check(false); }
  keys(bundle, ['release','metadata','indexes','pipeline']);
  const r = bundle.release;
  keys(r, ['schemaVersion','releaseId','tenant','catalog','siglip','dino','pipeline','issuedAt','expiresAt','approvalVersion']);
  keys(r.tenant, ['storeId','packageId']); check(sameTenant(r.tenant, tenant), 'RELEASE_FORBIDDEN', 403);
  check(r.schemaVersion === 1 && uuid(r.releaseId) && Number.isSafeInteger(r.approvalVersion) && r.approvalVersion > 0);
  check(Number.isSafeInteger(r.issuedAt) && Number.isSafeInteger(r.expiresAt) && r.issuedAt <= now &&
    r.expiresAt > now && r.expiresAt > r.issuedAt && r.expiresAt-r.issuedAt <= 3600, 'RELEASE_EXPIRED');
  keys(r.catalog, ['snapshotRevision','metadataSha256','productSetSha256']);
  check(text(r.catalog.snapshotRevision) && hex(r.catalog.metadataSha256) && hex(r.catalog.productSetSha256));
  keys(r.pipeline, ['detectorDigest','ocrAndDictionaryDigest','policyDigest']);
  keys(bundle.pipeline, ['detector','ocr','policy']);
  keys(bundle.pipeline.detector, ['id','sha256']);
  check(bundle.pipeline.detector.id === 'yolox-tiny-coco-0.1.1rc0' && hex(bundle.pipeline.detector.sha256));
  keys(bundle.pipeline.ocr, ['id','detRevision','detSha256','recRevision','recSha256','dictionarySha256','preprocessingVersion','postprocessingVersion','configSha256']);
  const o = bundle.pipeline.ocr;
  check(o.id === 'PaddlePaddle/PP-OCRv5-mobile-onnx' && ['detSha256','recSha256','dictionarySha256','configSha256'].every(k => hex(o[k])) &&
    ['detRevision','recRevision'].every(k => /^[a-f0-9]{40}$/.test(o[k])) && text(o.preprocessingVersion) && text(o.postprocessingVersion));
  keys(bundle.pipeline.policy, ['version','sha256']); check(text(bundle.pipeline.policy.version) && hex(bundle.pipeline.policy.sha256));
  check(r.pipeline.detectorDigest === digest(bundle.pipeline.detector) &&
    r.pipeline.ocrAndDictionaryDigest === digest(o) && r.pipeline.policyDigest === digest(bundle.pipeline.policy));
  const metadata = bundle.metadata;
  keys(metadata, ['tenant','revision','products']);keys(metadata.tenant, ['storeId','packageId']);
  check(sameTenant(metadata.tenant, tenant), 'RELEASE_FORBIDDEN', 403);
  check(metadata.revision === r.catalog.snapshotRevision && digest(metadata) === r.catalog.metadataSha256);
  check(Array.isArray(metadata.products) && metadata.products.length <= 10000);
  const products = new Map(); let previous = '', totalRefs = 0;
  for (const p of metadata.products) {
    keys(p, ['_id','estoreid','packageId','title','brand','variantName','description','packaging','unitOfMeasure','references']);
    check(id(p._id) && p._id > previous && p.estoreid === tenant.storeId && p.packageId === tenant.packageId);
    check(text(p.title,512) && typeof p.variantName === 'string' && p.variantName.length <= 256 &&
      typeof p.description === 'string' && p.description.length <= 2000 && typeof p.unitOfMeasure === 'string' && p.unitOfMeasure.length <= 128);
    check(p.brand === null || typeof p.brand === 'string' && p.brand.length <= 256 ||
      p.brand && typeof p.brand === 'object' && !Array.isArray(p.brand) && Object.keys(p.brand).every(k => ['_id','name'].includes(k)) && id(p.brand._id) && text(p.brand.name,256));
    check(p.packaging && typeof p.packaging === 'object' && !Array.isArray(p.packaging) &&
      Object.keys(p.packaging).every(k => ['weight','length','width','height','volume'].includes(k) && Number.isFinite(p.packaging[k]) && p.packaging[k] >= 0));
    check(Array.isArray(p.references) && p.references.length <= 20);
    const refs = new Set();
    for (const ref of p.references) {
      keys(ref, ['referenceId','imageKey','imageSha256']);
      check(text(ref.referenceId,64) && /^[a-zA-Z0-9_-]{1,64}$/.test(ref.referenceId) && hex(ref.imageKey) && hex(ref.imageSha256) && !refs.has(ref.referenceId));
      refs.add(ref.referenceId); totalRefs++; check(totalRefs <= 100000);
    }
    previous = p._id; products.set(p._id,p);
  }
  check(digest([...products.keys()]) === r.catalog.productSetSha256);
  keys(bundle.indexes, ['siglip','dino']);
  const indexes = {};
  for (const [slot,modelId,dimension,file] of [['siglip','google/siglip2-base-patch16-224',768,'siglip2.bin'],['dino','facebook/dinov2-small',384,'dinov2.bin']]) {
    keys(r[slot], ['generation','manifestSha256','modelAndPreprocessorDigest']);
    check(generation(r[slot].generation) && hex(r[slot].manifestSha256) && hex(r[slot].modelAndPreprocessorDigest));
    const encoded = bundle.indexes[slot]; keys(encoded, ['manifestJson','mappingJson']);
    const manifest = parse(encoded.manifestJson), mapping = parse(encoded.mappingJson);
    keys(manifest, slot === 'dino' ? ['schemaVersion','namespace','generation','tenant','model','catalogRevision','referenceCount','productCount','skipped','files'] :
      ['schemaVersion','generation','tenant','model','catalogRevision','referenceCount','productCount','skipped','files']);
    keys(manifest.tenant, ['storeId','packageId']);
    check(manifest.schemaVersion === 1 && (slot !== 'dino' || manifest.namespace === 'stage5-dinov2') &&
      sameTenant(manifest.tenant, tenant) && manifest.generation === r[slot].generation && manifest.catalogRevision === metadata.revision);
    check(sha(encoded.manifestJson) === r[slot].manifestSha256);
    keys(manifest.model, ['modelId','modelRevision','modelSha256','preprocessingVersion','preprocessorSha256','dimension']);
    const model = manifest.model;
    check(model.modelId === modelId && model.dimension === dimension && /^[a-f0-9]{40}$/.test(model.modelRevision) &&
      hex(model.modelSha256) && hex(model.preprocessorSha256) && text(model.preprocessingVersion) && digest(model) === r[slot].modelAndPreprocessorDigest);
    keys(manifest.files, ['mapping.json',file]);
    for (const entry of Object.values(manifest.files)) { keys(entry,['bytes','sha256']); check(Number.isSafeInteger(entry.bytes) && entry.bytes >= 0 && hex(entry.sha256)); }
    check(manifest.files['mapping.json'].bytes === Buffer.byteLength(encoded.mappingJson) && manifest.files['mapping.json'].sha256 === sha(encoded.mappingJson));
    check(Array.isArray(mapping) && mapping.length <= 100000 && manifest.referenceCount === mapping.length);
    const seen = new Set(), mappedProducts = new Set();
    mapping.forEach((row,label) => {
      keys(row,['label','productId','referenceId','imageSha256']);
      const p=products.get(row.productId), ref=p?.references.find(v => v.referenceId === row.referenceId), key=row.productId+':'+row.referenceId;
      check(row.label === label && ref && ref.imageSha256 === row.imageSha256 && !seen.has(key));
      seen.add(key); mappedProducts.add(row.productId);
    });
    check(manifest.productCount === mappedProducts.size && Array.isArray(manifest.skipped) && manifest.skipped.length <= 100000);
    for(const row of manifest.skipped) {
      keys(row,['productId','referenceId','reason']);
      check(products.get(row.productId)?.references.some(ref => ref.referenceId === row.referenceId) && text(row.reason));
    }
    indexes[slot]={manifest,mapping};
  }
  return freeze({release:{...r,digest:digest(r)}, metadata, indexes, pipeline:bundle.pipeline});
}
function createApprovedReleaseProvider({authority, provider, clock = () => Math.floor(Date.now()/1000)} = {}) {
  check(authority && typeof authority.revalidate === 'function', 'AUTHORITY_UNAVAILABLE');
  check(provider && typeof provider.load === 'function' && typeof provider.approval === 'function' && typeof clock === 'function', 'RELEASE_PROVIDER_UNAVAILABLE');
  const revalidate=authority.revalidate.bind(authority), load=provider.load.bind(provider), approval=provider.approval.bind(provider), leases=new WeakMap();
  const now=() => {const n=clock();check(Number.isSafeInteger(n) && n>=0,'CLOCK_UNAVAILABLE');return n;};
  const abort=signal => check(!signal?.aborted,'ABORTED',499);
  async function read(grant, options) {
    check(options && Object.keys(options).every(k => k==='signal'), 'RELEASE_SELECTION_FORBIDDEN',403);
    abort(options.signal);
    const authorized=scope(await revalidate(grant,{signal:options.signal}));
    let input;try {input=await load(freeze({...authorized}),{signal:options.signal});} catch {check(false,'RELEASE_PROVIDER_UNAVAILABLE');}
    abort(options.signal);
    const data=validateBundle(input,authorized,now());
    let approved;try {approved=await approval(freeze({releaseId:data.release.releaseId,digest:data.release.digest,
      approvalVersion:data.release.approvalVersion,tenant:data.release.tenant}),{signal:options.signal});} catch {check(false,'RELEASE_PROVIDER_UNAVAILABLE');}
    check(approved === true,'RELEASE_UNAPPROVED');
    const current=scope(await revalidate(grant,{signal:options.signal}));
    check(digest(current)===digest(authorized),'RELEASE_FORBIDDEN',403);
    abort(options.signal);check(data.release.expiresAt>now(),'RELEASE_EXPIRED');
    return data;
  }
  return Object.freeze({
    async resolve(grant, options={}) {const data=await read(grant,options);leases.set(data.release,{grant,data});return data.release;},
    async assertActive(release, options={}) {
      const lease=leases.get(release);check(lease,'RELEASE_HANDLE_REQUIRED',403);check(release.expiresAt>now(),'RELEASE_EXPIRED');
      const current=await read(lease.grant,options);
      check(current.release.digest===release.digest,'RELEASE_CHANGED');return release;
    },
    details(release) {const lease=leases.get(release);check(lease,'RELEASE_HANDLE_REQUIRED',403);return lease.data;}
  });
}
module.exports={createApprovedReleaseProvider,validateBundle,digest,sha,freeze,check,scope,sameTenant,keys};
