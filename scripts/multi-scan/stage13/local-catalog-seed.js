'use strict';
// Development-only. Never consult the application's database configuration.
const fs=require('node:fs');
const path=require('node:path');
const {MongoClient,ObjectId}=require('mongodb');
const uri='mongodb://127.0.0.1:27017/cosmic_scanner_local_test?directConnection=true&serverSelectionTimeoutMS=3000';
const database='cosmic_scanner_local_test';
const manifestPath=path.resolve(__dirname,'../../../dev-fixtures/multi-scan/local-catalog/manifest.json');
const products=Object.freeze([
 {labSkuId:'lab-five-milo',title:'Nestlé Milo powdered choco malt milk drink 24g',variantName:'Powdered Choco Malt Milk Drink'},
 {labSkuId:'lab-five-bearbrand',title:'Bear Brand Fortified powdered milk drink 33g',variantName:'Fortified Swak Pack'},
 {labSkuId:'lab-five-luckyme-beef',title:'Lucky Me Beef Na Beef instant noodles 55g',variantName:'Beef Na Beef'},
 {labSkuId:'lab-five-ligo-sardines',title:'Ligo Sardines in Tomato Sauce 155g',variantName:'In Tomato Sauce'},
 {labSkuId:'lab-five-colgate-multipack',title:'Colgate Fresh Confidence toothpaste multipack',variantName:'Cool Menthol Fresh with Cooling Crystals'}
]);
const fail=(code)=>{throw Error(code)};
async function run(mode){
 if(!['--plan','--seed','--verify'].includes(mode)||process.env.NODE_ENV!=='development')fail('DEVELOPMENT_ONLY');
 const client=new MongoClient(uri,{serverSelectionTimeoutMS:3000,connectTimeoutMS:3000});
 try{
  await client.connect();
  const admin=client.db('admin');
  const ping=await admin.command({ping:1});
  if(ping.ok!==1)fail('LOCAL_PING_FAILED');
  const names=await admin.command({listDatabases:1,filter:{name:database},nameOnly:true,authorizedDatabases:true});
  const exists=names.databases.some(x=>x.name===database),manifestExists=fs.existsSync(manifestPath);
  if(mode==='--plan')return {endpoint:'127.0.0.1:27017',database,exists,manifestExists,proposedProducts:products.map(p=>p.labSkuId)};
  if(mode==='--verify'||exists||manifestExists){
   if(!exists||!manifestExists)fail('LOCAL_CATALOG_STATE_MISMATCH');
   const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
   if(manifest.database!==database||manifest.endpoint!=='127.0.0.1:27017'||!ObjectId.isValid(manifest.storeId)||manifest.products?.length!==5)fail('INVALID_LOCAL_MANIFEST');
   const rows=await client.db(database).collection('gratisproducts').find({estoreid:new ObjectId(manifest.storeId)}).toArray();
   const collections=await client.db(database).listCollections({}, {nameOnly:true}).toArray();
   if(collections.length!==1||collections[0].name!=='gratisproducts'||rows.length!==5)fail('UNEXPECTED_LOCAL_CATALOG_CONTENTS');
   for(const expected of products){const entry=manifest.products.find(p=>p.labSkuId===expected.labSkuId),row=rows.find(p=>String(p._id)===entry?._id);if(!entry||!row||!(row._id instanceof ObjectId)||String(row.estoreid)!==manifest.storeId||row.customid!==entry.customid||row.title!==expected.title||row.variantName!==expected.variantName||row.activate!==true||row.price!==0)fail('LOCAL_PRODUCT_MISMATCH');}
   return {status:'verified-existing',manifestPath,storeId:manifest.storeId,productIds:manifest.products.map(p=>p._id)};
  }
  if(mode==='--verify')fail('LOCAL_CATALOG_MISSING');
  const storeId=new ObjectId(),stamp=new Date();
  const rows=products.map(p=>({_id:new ObjectId(),estoreid:storeId,title:p.title,variantName:p.variantName,customid:'SCANNER-LOCAL-TEST-'+p.labSkuId,activate:true,price:0,quantity:0,createdAt:stamp,updatedAt:stamp}));
  await client.db(database).collection('gratisproducts').insertMany(rows,{ordered:true});
  const manifest={schemaVersion:1,endpoint:'127.0.0.1:27017',database,storeId:String(storeId),products:products.map((p,i)=>({...p,_id:String(rows[i]._id),customid:rows[i].customid}))};
  fs.mkdirSync(path.dirname(manifestPath),{recursive:true});
  fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
  const verified=await client.db(database).collection('gratisproducts').find({estoreid:storeId}).toArray();
  if(verified.length!==5||!manifest.products.every(p=>verified.some(r=>String(r._id)===p._id&&r.activate===true)))fail('LOCAL_SEED_VERIFY_FAILED');
  return {status:'created',manifestPath,storeId:manifest.storeId,productIds:manifest.products.map(p=>p._id)};
 }finally{await client.close();}
}
if(require.main===module)run(process.argv[2]).then(x=>console.log(JSON.stringify(x,null,2))).catch(e=>{console.error(e.message);process.exitCode=1});
module.exports={run,products,manifestPath};
