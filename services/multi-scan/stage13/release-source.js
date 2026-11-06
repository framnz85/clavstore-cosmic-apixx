'use strict';
// Inert, read-only P2 source. Private host port, NOT authentication or release approval by itself.
const fs = require('node:fs/promises');
const {constants} = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {scope, sameTenant, digest, freeze} = require('../stage12/approved-release');
const id = value => typeof value === 'string' && /^[a-f0-9]{24}$/.test(value);
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
function unavailable() { return Object.assign(new Error('Scanner release source unavailable'), {code:'RELEASE_SOURCE_UNAVAILABLE',status:503}); }
function need(ok) { if (!ok) throw unavailable(); }
function fields(value, required, optional=[]) {
  need(value && typeof value === 'object' && !Array.isArray(value) && required.every(k => Object.hasOwn(value,k)) && Object.keys(value).every(k => required.includes(k) || optional.includes(k)));
}
function tenant(value) { fields(value,['storeId','packageId']); need(id(value.storeId) && id(value.packageId)); return {storeId:value.storeId,packageId:value.packageId}; }
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const identity = stat => ['dev','ino','size','mode','mtimeNs','ctimeNs'].map(k => String(stat[k])).join(':');
const dirIdentity = stat => `${stat.dev}:${stat.ino}`;
function createReleaseSource(options={}) {
  fields(options,['root','currentApprovals'],['clock','limits']);
  const {root,currentApprovals,clock=()=>Math.floor(Date.now()/1000),limits={}}=options;
  need(typeof root==='string' && path.isAbsolute(root) && root!==path.parse(root).root && path.resolve(root)===root &&
    !root.includes('\0') && typeof currentApprovals==='function' && typeof clock==='function');
  fields(limits,[],['maxBytes','maxRecords']);
  const maxBytes=limits.maxBytes ?? 16777216, maxRecords=limits.maxRecords ?? 128;
  need(Number.isSafeInteger(maxBytes) && maxBytes>=1 && maxBytes<=16777216 && Number.isSafeInteger(maxRecords) && maxRecords>=1 && maxRecords<=128);
  // Linux descriptor-relative traversal prevents a renamed/symlinked parent from redirecting reads.
  // No portable path-based fallback: unavailable platforms must fail closed.
  need(process.platform==='linux' && Number.isInteger(constants.O_NOFOLLOW) && Number.isInteger(constants.O_DIRECTORY) && Number.isInteger(constants.O_NONBLOCK));
  const directoryFlags=constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW;
  const fileFlags=constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK;
  const observations=new Map(); let last=-1;
  function now(signal) {
    need(signal===undefined || typeof signal.aborted==='boolean' && typeof signal.addEventListener==='function');
    need(!signal?.aborted); const time=clock(); need(integer(time) && time>=last); last=time; return time;
  }
  function opts(value) { fields(value,[],['signal']); now(value.signal); return value.signal; }
  async function guarded(fn) { try { return await fn(); } catch { throw unavailable(); } }
  function prune(time) { for (const [key,value] of observations) if (value.expiresAt<=time) observations.delete(key); }
  async function approved(wanted,signal) {
    now(signal);
    const input=await currentApprovals(freeze({...wanted}),{signal}); now(signal);
    const raw=JSON.stringify(input); need(typeof raw==='string' && Buffer.byteLength(raw)<=4096);
    const entry=JSON.parse(raw);
    fields(entry,['tenant','releaseId','digest','approvalVersion','issuedAt','expiresAt','revoked','bundle']);
    tenant(entry.tenant); need(sameTenant(entry.tenant,wanted) && uuid(entry.releaseId) && hex(entry.digest) && Number.isSafeInteger(entry.approvalVersion) && entry.approvalVersion>0);
    const time=now(signal);
    need(integer(entry.issuedAt) && integer(entry.expiresAt) && entry.issuedAt<=time && entry.expiresAt>time && entry.expiresAt-entry.issuedAt<=3600 && entry.revoked===false);
    fields(entry.bundle,['file','sha256']);
    need(typeof entry.bundle.file==='string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,95}\.json$/.test(entry.bundle.file) && hex(entry.bundle.sha256));
    return freeze(entry);
  }
  async function openRoot(signal) {
    let handle=await fs.open(path.parse(root).root,directoryFlags);
    try {
      for (const component of root.split(path.sep).filter(Boolean)) {
        now(signal);
        const next=await fs.open(`/proc/self/fd/${handle.fd}/${component}`,directoryFlags);
        try { await handle.close(); } catch (error) { await next.close(); throw error; }
        handle=next;
      }
      now(signal); return handle;
    } catch (error) { await handle.close(); throw error; }
  }
  async function withFile(entry,signal,operation) {
    let directory,file,checkFile,checkRoot;
    try {
      directory=await openRoot(signal); const rootStat=await directory.stat({bigint:true});
      const filename=`/proc/self/fd/${directory.fd}/${entry.bundle.file}`;
      file=await fs.open(filename,fileFlags); now(signal);
      const before=await file.stat({bigint:true});
      need(before.isFile() && before.size>0n && before.size<=maxBytes);
      const value=await operation(file,before); now(signal);
      need(identity(await file.stat({bigint:true}))===identity(before));
      // Check the currently named inode; never reopen the filename to obtain the approved bytes.
      checkFile=await fs.open(filename,fileFlags);
      need(identity(await checkFile.stat({bigint:true}))===identity(before));
      checkRoot=await openRoot(signal);
      need(dirIdentity(await checkRoot.stat({bigint:true}))===dirIdentity(rootStat)); now(signal);
      return {value,stat:identity(before)};
    } finally {
      // Close every owned descriptor even if a close itself fails; no writes or directory creation.
      const closed=await Promise.allSettled([checkRoot,checkFile,file,directory].filter(Boolean).map(handle=>handle.close()));
      need(closed.every(result=>result.status==='fulfilled'));
    }
  }
  return Object.freeze({
    async load(authorizedScope,options={}) {
      return guarded(async()=>{
        fields(authorizedScope,['storeId','packageId','userId','role']);
        const authorized=scope(authorizedScope), wanted=tenant({storeId:authorized.storeId,packageId:authorized.packageId}), signal=opts(options);
        const entry=await approved(wanted,signal), key=`${wanted.packageId}/${wanted.storeId}`, fingerprint=digest(entry);
        prune(now(signal)); need(observations.has(key) || observations.size<maxRecords);
        const loaded=await withFile(entry,signal,async(file,before)=>{
          const bytes=Buffer.alloc(Number(before.size)); let offset=0;
          while (offset<bytes.length) { now(signal); const part=await file.read(bytes,offset,bytes.length-offset,offset); need(part.bytesRead>0); offset+=part.bytesRead; }
          need(sha(bytes)===entry.bundle.sha256);
          const text=bytes.toString('utf8'); need(Buffer.from(text,'utf8').equals(bytes));
          const bundle=JSON.parse(text), release=bundle?.release;
          // Tuple binding only. Existing P2 validateBundle still validates the full catalog/model/index schema.
          need(release && release.releaseId===entry.releaseId && release.approvalVersion===entry.approvalVersion && sameTenant(release.tenant,wanted) && digest(release)===entry.digest);
          need(digest(await approved(wanted,signal))===fingerprint);
          return freeze(bundle);
        });
        // Recheck the bound after awaits; concurrent tenant loads cannot exceed capacity.
        prune(now(signal)); need(observations.has(key) || observations.size<maxRecords);
        observations.set(key,{fingerprint,stat:loaded.stat,expiresAt:entry.expiresAt}); return loaded.value;
      });
    },
    async approval(descriptor,options={}) {
      return guarded(async()=>{
        fields(descriptor,['releaseId','digest','approvalVersion','tenant']);
        const wanted=tenant(descriptor.tenant), signal=opts(options);
        need(uuid(descriptor.releaseId) && hex(descriptor.digest) && Number.isSafeInteger(descriptor.approvalVersion) && descriptor.approvalVersion>0);
        const entry=await approved(wanted,signal), observation=observations.get(`${wanted.packageId}/${wanted.storeId}`);
        need(observation && observation.expiresAt>now(signal) && observation.fingerprint===digest(entry) &&
          descriptor.releaseId===entry.releaseId && descriptor.digest===entry.digest && descriptor.approvalVersion===entry.approvalVersion);
        await withFile(entry,signal,async(_file,before)=>{
          need(identity(before)===observation.stat); need(digest(await approved(wanted,signal))===observation.fingerprint);
        });
        return true;
      });
    }
  });
}
module.exports={createReleaseSource};
