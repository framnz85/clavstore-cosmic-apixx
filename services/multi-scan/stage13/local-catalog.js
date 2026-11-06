'use strict';
// Local scanner demonstration only. Fixed loopback target; no application DB configuration.
const fs=require('node:fs');
const path=require('node:path');
const {MongoClient,ObjectId}=require('mongodb');
const manifestPath=path.resolve(__dirname,'../../../dev-fixtures/multi-scan/local-catalog/manifest.json');
const uri='mongodb://127.0.0.1:27017/cosmic_scanner_local_test?directConnection=true&serverSelectionTimeoutMS=3000';
const hex24=x=>typeof x==='string'&&/^[a-f0-9]{24}$/.test(x);
function readManifest(){
 const m=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
 if(m.schemaVersion!==1||m.endpoint!=='127.0.0.1:27017'||m.database!=='cosmic_scanner_local_test'||!hex24(m.storeId)||!Array.isArray(m.products)||m.products.length!==5)throw Error('INVALID_LOCAL_MANIFEST');
 const ids=new Set(),skus=new Set();
 for(const p of m.products){if(!hex24(p._id)||!/^lab-five-[a-z-]+$/.test(p.labSkuId)||!p.customid?.startsWith('SCANNER-LOCAL-TEST-')||p.customid!=='SCANNER-LOCAL-TEST-'+p.labSkuId||typeof p.title!=='string'||!p.title||typeof p.variantName!=='string'||!p.variantName||ids.has(p._id)||skus.has(p.labSkuId))throw Error('INVALID_LOCAL_MANIFEST');ids.add(p._id);skus.add(p.labSkuId);}
 return m;
}
function projectCatalog(manifest,rows){
 const found=new Map();
 for(const r of rows){const id=String(r._id),store=String(r.estoreid);if(found.has(id)||store!==manifest.storeId||!manifest.products.some(p=>p._id===id))throw Error('INVALID_LOCAL_PRODUCT');found.set(id,r);}
 return {trustedStoreId:manifest.storeId,trustedCatalog:{source:'isolated-development-catalog',storeId:manifest.storeId,products:manifest.products.flatMap(p=>{const r=found.get(p._id);if(!r||!(r._id instanceof ObjectId)||!(r.estoreid instanceof ObjectId)||r.customid!==p.customid||r.title!==p.title||r.variantName!==p.variantName)return [];return [{labSkuId:p.labSkuId,storeId:manifest.storeId,_id:p._id,title:r.title,variant:r.variantName,status:r.activate===true?'active':'inactive'}];})}};
}
async function loadLocalCatalog({manifest=readManifest(),clientFactory=()=>new MongoClient(uri,{serverSelectionTimeoutMS:3000,connectTimeoutMS:3000})}={}){
 if(process.env.NODE_ENV!=='development')throw Error('DEVELOPMENT_ONLY');
 const client=clientFactory();
 try{
  await client.connect();
  const ids=manifest.products.map(p=>new ObjectId(p._id));
  const rows=await client.db('cosmic_scanner_local_test').collection('gratisproducts').find({estoreid:new ObjectId(manifest.storeId),_id:{$in:ids}},{projection:{_id:1,estoreid:1,title:1,variantName:1,customid:1,activate:1},maxTimeMS:3000}).toArray();
  return projectCatalog(manifest,rows);
 }finally{await client.close();}
}
module.exports={loadLocalCatalog,projectCatalog,readManifest,manifestPath};
