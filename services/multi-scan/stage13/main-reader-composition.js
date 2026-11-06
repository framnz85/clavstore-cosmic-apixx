'use strict';
// Uninstalled host binding only. No environment discovery, startup caller or application mount.
const {createReleaseSource}=require('./release-source');
const {createScannerAssembly}=require('../stage12/composition');
const unavailable=()=>Object.assign(new Error('Scanner composition unavailable'),{code:'SCANNER_COMPOSITION_UNAVAILABLE',status:503});
function fields(value,required,optional=[]){
 if(!value||typeof value!=='object'||Array.isArray(value))throw unavailable();
 const names=Reflect.ownKeys(value);
 if(!required.every(name=>Object.hasOwn(value,name))||!names.every(name=>typeof name==='string'&&(required.includes(name)||optional.includes(name))))throw unavailable();
 // Snapshot configuration fields once; never JSON-clone private handles or functions.
 return Object.fromEntries(names.map(name=>[name,value[name]]));
}
function createMainReaderAssembly(options={}){
 try{
  // Gate before destructuring: even top-level provider getters stay untouched when disabled.
  if(options?.enabled!==true)return createScannerAssembly({enabled:false});
  const input=fields(options,['enabled','releaseSourceOptions','assemblyOptions']);
  if(input.enabled!==true)throw unavailable();
  const source=fields(input.releaseSourceOptions,['root','currentApprovals'],['limits']);
  const assembly=fields(input.assemblyOptions,['sessionConfig','repository','aiConfig','loadRuntime','imagePrefixes','ownerMode'],['clock','operationTimeoutMs']);
  const clock=assembly.clock===undefined?()=>Math.floor(Date.now()/1000):assembly.clock;
  const releaseProvider=createReleaseSource({...source,clock});
  // Return P6 itself: its readiness means open, and its existing close owns local drain.
  return createScannerAssembly({...assembly,enabled:true,clock,releaseProvider});
 }catch{
  // Host config/getter/constructor failures must not disclose secrets or become a fallback.
  throw unavailable();
 }
}
module.exports={createMainReaderAssembly};
