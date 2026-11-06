'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),Module=require('node:module');
const {createReleaseSource}=require('../../../services/multi-scan/stage13/release-source');
const {createApprovedReleaseProvider,validateBundle,digest,sha}=require('../../../services/multi-scan/stage12/approved-release');
const {createScannerAuthority}=require('../../../services/multi-scan/stage12/scanner-authority');
const fixture=require('../stage12/release-fixture.json'),jwt=require('jsonwebtoken');
const clone=v=>JSON.parse(JSON.stringify(v)),tenant=fixture.bundle.release.tenant;
const scope={...tenant,userId:fixture.userId,role:'cashier'};
async function denied(task){await assert.rejects(task,error=>error.status===503&&error.code==='RELEASE_SOURCE_UNAVAILABLE'&&error.message==='Scanner release source unavailable'&&!error.cause);}
async function harness(t,{limits}={}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'clavstore-s13-release-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const state={now:1800000000,bundle:clone(fixture.bundle),entry:null,calls:0,hook:null};
 async function write(bundle=state.bundle){state.bundle=bundle;const raw=JSON.stringify(bundle);await fs.writeFile(path.join(root,'approved.json'),raw);state.entry={tenant:clone(tenant),releaseId:bundle.release.releaseId,digest:digest(bundle.release),approvalVersion:bundle.release.approvalVersion,issuedAt:1800000000,expiresAt:1800003600,revoked:false,bundle:{file:'approved.json',sha256:sha(raw)}};}
 await write();
 const reader=async(wanted,opts)=>{state.calls++;assert.deepEqual(wanted,tenant);assert.ok(Object.isFrozen(wanted));assert.equal(Object.keys(opts).join(','),'signal');if(state.hook)await state.hook();return clone(state.entry);};
 const source=createReleaseSource({root,currentApprovals:reader,clock:()=>state.now,...(limits?{limits}:{})});
 const config={enabled:true,key:'s13-offline-test-only-session-key-1234567890',issuer:'cosmic-clavstore-scanner',audience:'clavstore-multiscan-review',ttl:900};
 const user={_id:scope.userId,email:'cashier@example.test',role:'cashier',estoreid:tenant.storeId,resellid:tenant.packageId};
 const repository={usersByEmail:async()=>[clone(user)],store:async()=>({_id:tenant.storeId,resellid:tenant.packageId,status:'active',accessibility:{cashier:['orders']}}),packageOwner:async()=>({_id:tenant.packageId,status:'active',reseller:{status:true}})};
 const authority=createScannerAuthority({sessionConfig:config,repository,clock:()=>state.now});
 const token=claims=>jwt.sign({sub:user._id,email:user.email,...tenant,iss:config.issuer,aud:config.audience,iat:state.now,exp:state.now+900,...claims},config.key);
 const grant=()=>authority.authenticate({token:token(),requestedStoreId:tenant.storeId,requestedPackageId:tenant.packageId});
 const releases=createApprovedReleaseProvider({authority,provider:source,clock:()=>state.now});
 const descriptor=()=>({releaseId:state.entry.releaseId,digest:state.entry.digest,approvalVersion:state.entry.approvalVersion,tenant:clone(tenant)});
 return {root,state,write,reader,source,authority,grant,releases,descriptor,token};
}
test('module import and construction are inert; no DB/network/model/fixture discovery',async()=>{
 const name=require.resolve('../../../services/multi-scan/stage13/release-source'),cached=require.cache[name],load=Module._load,open=fs.open;let calls=0;
 try{delete require.cache[name];Module._load=function(request,...args){assert.ok(!/mongoose|redis|onnx|sharp|hnsw|stage9|fixture|dbconnect|models\//.test(request));return load.call(this,request,...args);};fs.open=async()=>{calls++;throw Error('Forbidden I/O');};const {createReleaseSource:create}=require(name);assert.throws(()=>create(),{status:503});create({root:'/tmp/unconfigured-never-opened',currentApprovals:async()=>{throw Error('No discovery');}});assert.equal(calls,0);}finally{Module._load=load;fs.open=open;require.cache[name]=cached;}
});
for(const config of [{},{root:'/tmp'},{root:'relative',currentApprovals:async()=>null},{root:'/',currentApprovals:async()=>null},{root:'/tmp/../tmp',currentApprovals:async()=>null},{root:'/tmp/',currentApprovals:async()=>null},{root:'/tmp',currentApprovals:{}},{root:'/tmp',currentApprovals:async()=>null,enabled:true}])test('missing/noncanonical/extra configuration fails closed: '+Object.keys(config).join(','),()=>assert.throws(()=>createReleaseSource(config),{status:503}));
for(const limits of [{maxBytes:0},{maxBytes:16777217},{maxRecords:0},{maxRecords:129},{maxBytes:NaN},{unknown:1}])test('invalid bounded limits reject '+JSON.stringify(limits),()=>assert.throws(()=>createReleaseSource({root:'/tmp',currentApprovals:async()=>null,limits}),{status:503}));
test('test-only approved bundle resolves through actual P1/P2; repeated fresh reads/assertActive remain permitted',async t=>{assert.equal(fixture.testOnly,true);const f=await harness(t),grant=await f.grant(),r=await f.releases.resolve(grant);assert.equal(r.digest,f.state.entry.digest);assert.ok(Object.isFrozen(r));assert.equal(await f.releases.assertActive(r),r);assert.equal((await f.releases.resolve(grant)).releaseId,r.releaseId);assert.ok(f.state.calls>=12);});
for(const change of [{storeId:'9'.repeat(24)},{packageId:'9'.repeat(24)},{role:'owner'},{indexPath:'/etc/passwd'},{releaseId:'client'},{tenant}, {userId:undefined}])test('client/foreign/malformed scope rejected '+Object.keys(change).join(','),async t=>{const f=await harness(t);await denied(()=>f.source.load({...scope,...change}));assert.ok(f.state.calls<=1);});
test('P1/P2 reject forged/cloned/foreign/expired authority before the source is read',async t=>{const f=await harness(t);await assert.rejects(f.authority.authenticate({token:'forged',requestedStoreId:tenant.storeId}));await assert.rejects(f.authority.authenticate({token:f.token(),requestedStoreId:'9'.repeat(24)}));await assert.rejects(f.releases.resolve({...await f.grant()}));const grant=await f.grant();f.state.now+=901;await assert.rejects(f.releases.resolve(grant));assert.equal(f.state.calls,0);});
for(const options of [{indexPath:'/etc/passwd'},{releaseId:'client'},{tenant},{signal:{}},[]])test('no source caller-selected options '+JSON.stringify(options),async t=>{const f=await harness(t);await denied(()=>f.source.load(scope,options));assert.equal(f.state.calls,0);});
for(const value of [null,false,true,1,[],{},'unapproved'])test('invalid independent registry output '+JSON.stringify(value),async t=>{const f=await harness(t);f.state.entry=value;await denied(()=>f.source.load(scope));});
for(const [name,edit] of [
 ['wrong tenant',e=>{e.tenant.storeId='9'.repeat(24);}],['wrong package',e=>{e.tenant.packageId='9'.repeat(24);}],
 ['revoked',e=>{e.revoked=true;}],['truthy revoked',e=>{e.revoked=0;}],['expired',e=>{e.expiresAt=1800000000;}],['future',e=>{e.issuedAt++;}],['long lifetime',e=>{e.expiresAt++;}],
 ['missing byte pin',e=>{delete e.bundle.sha256;}],['invalid digest',e=>{e.digest='invalid';}],['version',e=>{e.approvalVersion=0;}],['unknown field',e=>{e.approved=true;}],['wrong file pin',e=>{e.bundle.sha256='0'.repeat(64);}],
 ['unknown release',e=>{e.releaseId='99999999-9999-4999-8999-999999999999';}]
])test('independent registry rejects '+name,async t=>{const f=await harness(t);edit(f.state.entry);await denied(()=>f.source.load(scope));});
test('correct bundle checksums never substitute for independent approval',async t=>{const f=await harness(t);f.state.entry=null;await assert.rejects(f.releases.resolve(await f.grant()));assert.equal(f.state.calls,1);});
test('registry exceptions are sanitized without paths or secrets',async t=>{const f=await harness(t);f.state.hook=()=>{throw Error('/private/operator/SECRET');};await denied(()=>f.source.load(scope));});
for(const filename of ['/etc/passwd','../other.json','x/../approved.json','sub/approved.json','..\\approved.json','%2e%2e.json','approved.json/','a.json\0','a..json'])test('unsafe registry filename rejected '+JSON.stringify(filename),async t=>{const f=await harness(t);f.state.entry.bundle.file=filename;await denied(()=>f.source.load(scope));});
for(const kind of ['missing','directory','symlink file','symlink root','symlink ancestor'])test('unsafe/missing filesystem '+kind,async t=>{
 const f=await harness(t),file=path.join(f.root,'approved.json');let root=f.root;
 if(kind==='missing')await fs.unlink(file);
 if(kind==='directory'){await fs.unlink(file);await fs.mkdir(file);}
 if(kind==='symlink file'){await fs.rename(file,path.join(f.root,'outside.json'));await fs.symlink('outside.json',file);}
 if(kind==='symlink root'){root=f.root+'-link';await fs.symlink(f.root,root);t.after(()=>fs.unlink(root));}
 if(kind==='symlink ancestor'){await fs.mkdir(path.join(f.root,'real'));await fs.rename(file,path.join(f.root,'real','approved.json'));await fs.symlink('real',path.join(f.root,'link'));root=path.join(f.root,'link');}
 const source=createReleaseSource({root,currentApprovals:f.reader,clock:()=>f.state.now});await denied(()=>source.load(scope));
});
for(const [name,bytes] of [['bad JSON',Buffer.from('{')],['invalid UTF8',Buffer.from([123,34,255,34,58,49,125])],['missing release',Buffer.from('{}')]])test('invalid bytes '+name,async t=>{const f=await harness(t);await fs.writeFile(path.join(f.root,'approved.json'),bytes);f.state.entry.bundle.sha256=sha(bytes);await denied(()=>f.source.load(scope));});
test('oversized regular file rejects before allocating/reading its contents',async t=>{const f=await harness(t,{limits:{maxBytes:64}});await denied(()=>f.source.load(scope));});
test('simulated FIFO metadata rejects before reading and uses a nonblocking descriptor',async t=>{
 const f=await harness(t),open=fs.open;let seen=false,read=false;
 fs.open=async function(filename,flags,...args){const handle=await open.call(this,filename,flags,...args);if(String(filename).endsWith('/approved.json')){seen=true;assert.ok(flags&require('node:fs').constants.O_NONBLOCK);handle.stat=async()=>({isFile:()=>false,size:1n});handle.read=async()=>{read=true;throw Error('Must not read nonregular input');};}return handle;};
 try{await denied(()=>f.source.load(scope));assert.equal(seen,true);assert.equal(read,false);}finally{fs.open=open;}
});
for(const [name,edit] of [['revoked',e=>{e.revoked=true;}],['version',e=>{e.approvalVersion++;}],['file pin',e=>{e.bundle.sha256='0'.repeat(64);}]])test('registry changes during file read deny '+name,async t=>{const f=await harness(t);f.state.hook=()=>{if(f.state.calls===2)edit(f.state.entry);};await denied(()=>f.source.load(scope));});
test('file change during registry await after read fails instead of approving old bytes',async t=>{const f=await harness(t);f.state.hook=async()=>{if(f.state.calls===2)await fs.appendFile(path.join(f.root,'approved.json'),' ');};await denied(()=>f.source.load(scope));});
test('file replacement with same bytes is detected by inode identity',async t=>{const f=await harness(t);f.state.hook=async()=>{if(f.state.calls===2){await fs.rename(path.join(f.root,'approved.json'),path.join(f.root,'old.json'));await fs.writeFile(path.join(f.root,'approved.json'),JSON.stringify(f.state.bundle));}};await denied(()=>f.source.load(scope));});
test('parent symlink swap cannot redirect descriptor-relative bundle reads outside approved root',async t=>{
 const f=await harness(t);await fs.mkdir(path.join(f.root,'inside'));await fs.mkdir(path.join(f.root,'outside'));await fs.rename(path.join(f.root,'approved.json'),path.join(f.root,'inside','approved.json'));await fs.writeFile(path.join(f.root,'outside','approved.json'),'SECRET_OUTSIDE');
 const root=path.join(f.root,'inside'),open=fs.open;let switched=false;const observed=[];
 fs.open=async function(filename,...args){if(String(filename).endsWith('/approved.json')&&!switched){switched=true;await fs.rename(root,path.join(f.root,'moved'));await fs.symlink(path.join(f.root,'outside'),root);}const h=await open.call(this,filename,...args);if(String(filename).endsWith('/approved.json')){const read=h.read.bind(h);h.read=async function(buffer,offset,length,position){const result=await read(buffer,offset,length,position);observed.push(Buffer.from(buffer.subarray(offset,offset+result.bytesRead)));return result;};}return h;};
 try{await denied(()=>createReleaseSource({root,currentApprovals:f.reader,clock:()=>f.state.now}).load(scope));assert.equal(switched,true);assert.equal(sha(Buffer.concat(observed)),f.state.entry.bundle.sha256);assert.ok(!Buffer.concat(observed).toString().includes('SECRET_OUTSIDE'));}finally{fs.open=open;}
});
test('leaf symlink swap at open is rejected, not read',async t=>{const f=await harness(t),open=fs.open;let switched=false;fs.open=async function(filename,...args){if(String(filename).endsWith('/approved.json')&&!switched){switched=true;await fs.rename(path.join(f.root,'approved.json'),path.join(f.root,'old.json'));await fs.symlink('old.json',path.join(f.root,'approved.json'));}return open.call(this,filename,...args);};try{await denied(()=>f.source.load(scope));assert.ok(switched);}finally{fs.open=open;}});
for(const [key,value] of [['releaseId','99999999-9999-4999-8999-999999999999'],['digest','0'.repeat(64)],['approvalVersion',2],['indexPath','/etc/passwd']])test('approval rejects substituted descriptor '+key,async t=>{const f=await harness(t);await f.source.load(scope);await denied(()=>f.source.approval({...f.descriptor(),[key]:value}));});
test('approval requires a verified load observation; it cannot approve arbitrary caller tuples',async t=>{const f=await harness(t);await denied(()=>f.source.approval(f.descriptor()));});
for(const change of ['revocation','version','file','missing'])test('post-load current approval rechecks '+change,async t=>{const f=await harness(t);await f.source.load(scope);const descriptor=f.descriptor();if(change==='revocation')f.state.entry.revoked=true;if(change==='version')f.state.entry.approvalVersion++;if(change==='file')await fs.appendFile(path.join(f.root,'approved.json'),' ');if(change==='missing')await fs.unlink(path.join(f.root,'approved.json'));await denied(()=>f.source.approval(descriptor));});
test('approval registry swap during its own await is rejected',async t=>{const f=await harness(t);await f.source.load(scope);f.state.hook=()=>{if(f.state.calls===4)f.state.entry.revoked=true;};await denied(()=>f.source.approval(f.descriptor()));});
for(const [name,mutate] of [
 ['SigLIP dimension',b=>{const m=JSON.parse(b.indexes.siglip.manifestJson);m.model.dimension=384;b.indexes.siglip.manifestJson=JSON.stringify(m);}],
 ['DINO dimension',b=>{const m=JSON.parse(b.indexes.dino.manifestJson);m.model.dimension=768;b.indexes.dino.manifestJson=JSON.stringify(m);}],
 ['mixed catalog',b=>{const m=JSON.parse(b.indexes.dino.manifestJson);m.catalogRevision='other';b.indexes.dino.manifestJson=JSON.stringify(m);}],
 ['unknown generation',b=>{b.release.siglip.generation='g-99999999-9999-4999-8999-999999999999';}],
 ['OCR dictionary',b=>{b.pipeline.ocr.dictionarySha256='0'.repeat(64);}],['policy',b=>{b.pipeline.policy.version='unapproved';}],
 ['foreign metadata',b=>{b.metadata.products[0].estoreid='9'.repeat(24);}],['unknown index',b=>{delete b.indexes.dino;}]
])test('actual unchanged P2 rejects independently pinned inconsistent '+name,async t=>{const f=await harness(t);mutate(f.state.bundle);for(const slot of ['siglip','dino']){if(f.state.bundle.indexes[slot]){const raw=f.state.bundle.indexes[slot].manifestJson;f.state.bundle.release[slot].manifestSha256=sha(raw);f.state.bundle.release[slot].modelAndPreprocessorDigest=digest(JSON.parse(raw).model);}}f.state.bundle.release.catalog.metadataSha256=digest(f.state.bundle.metadata);await f.write();await assert.rejects(f.releases.resolve(await f.grant()));});
test('aborted read never touches approval or filesystem',async t=>{const f=await harness(t),c=new AbortController();c.abort();await denied(()=>f.source.load(scope,{signal:c.signal}));assert.equal(f.state.calls,0);});
test('abort during approval await rejects after dependency returns',async t=>{const f=await harness(t),c=new AbortController();f.state.hook=()=>c.abort();await denied(()=>f.source.load(scope,{signal:c.signal}));});
for(const value of [NaN,-1,1.5,undefined])test('invalid clock '+String(value)+' fails before registry',async t=>{const f=await harness(t);f.state.now=value;await denied(()=>f.source.load(scope));assert.equal(f.state.calls,0);});
test('backward clock invalidates observation and fails closed',async t=>{const f=await harness(t);await f.source.load(scope);f.state.now--;await denied(()=>f.source.approval(f.descriptor()));});
test('unavailable descriptor-relative filesystem has no path-based fallback',async t=>{const f=await harness(t),open=fs.open;fs.open=async function(filename,...args){if(String(filename).startsWith('/proc/self/fd/'))throw Error('Unsupported descriptor paths');return open.call(this,filename,...args);};try{await denied(()=>f.source.load(scope));}finally{fs.open=open;}});
test('source opens only read-only descriptors and closes them after failure',async t=>{const f=await harness(t),open=fs.open;let live=0,opened=0;fs.open=async function(filename,flags,...args){assert.equal(flags&3,0);const h=await open.call(this,filename,flags,...args),close=h.close.bind(h);live++;opened++;h.close=async()=>{try{return await close();}finally{live--;}};return h;};f.state.hook=()=>{if(f.state.calls===2)throw Error('PRIVATE_REGISTRY');};try{await denied(()=>f.source.load(scope));assert.ok(opened>0);assert.equal(live,0);}finally{fs.open=open;}});

test('unexpired tenant observations are bounded; expired entries can be pruned without stale fallback',async t=>{
 const f=await harness(t),otherTenant={...tenant,storeId:'9'.repeat(24)},otherScope={...scope,...otherTenant};
 const other=JSON.parse(JSON.stringify(f.state.bundle).split(tenant.storeId).join(otherTenant.storeId));
 other.release.catalog.metadataSha256=digest(other.metadata);
 for(const slot of ['siglip','dino']){const manifest=JSON.parse(other.indexes[slot].manifestJson),mapping=other.indexes[slot].mappingJson;manifest.files['mapping.json']={bytes:Buffer.byteLength(mapping),sha256:sha(mapping)};const raw=JSON.stringify(manifest);other.indexes[slot].manifestJson=raw;other.release[slot].manifestSha256=sha(raw);other.release[slot].modelAndPreprocessorDigest=digest(manifest.model);}
 validateBundle(other,otherTenant,f.state.now);
 async function saveOther(){const raw=JSON.stringify(other);await fs.writeFile(path.join(f.root,'other.json'),raw);return {...clone(f.state.entry),tenant:otherTenant,releaseId:other.release.releaseId,digest:digest(other.release),issuedAt:f.state.now,expiresAt:f.state.now+3600,bundle:{file:'other.json',sha256:sha(raw)}};}
 let second=await saveOther();const source=createReleaseSource({root:f.root,limits:{maxRecords:1},clock:()=>f.state.now,currentApprovals:async wanted=>wanted.storeId===tenant.storeId?f.state.entry:second});
 await source.load(scope);await denied(()=>source.load(otherScope));await source.load(scope);
 f.state.now+=3601;other.release.issuedAt=f.state.now;other.release.expiresAt=f.state.now+3600;second=await saveOther();validateBundle(other,otherTenant,f.state.now);await source.load(otherScope);
});
test('concurrent same-tenant reads and approvals retain one exact immutable tuple',async t=>{const f=await harness(t);const values=await Promise.all(Array.from({length:5},()=>f.source.load(scope)));assert.ok(values.every(v=>digest(v)===digest(values[0])));assert.deepEqual(await Promise.all(Array.from({length:5},()=>f.source.approval(f.descriptor()))),[true,true,true,true,true]);});
