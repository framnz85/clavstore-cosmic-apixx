'use strict';
// Offline repository only. No production model, database or legacy scanner imports.
const {createRequire}=require('node:module');
const path=require('node:path');
const jwt=require('jsonwebtoken');
const {Security}=require('../stage7/security');
const {Catalog,ImagePolicy}=require('../stage7/catalog');
const aiRoot=path.resolve(__dirname,'../../../../clavstore-ai-image-api');
const aiRequire=createRequire(path.join(aiRoot,'package.json'));
const scope=Object.freeze({storeId:'1'.repeat(24),packageId:'2'.repeat(24)});
const userId='3'.repeat(24),brandId='8'.repeat(24);
const jwtKey='stage9-offline-jwt-fixture-only-123456789012345';
const serviceKey='stage9-offline-service-fixture-only-98765432100';
const id=i=>(i+1).toString(16).padStart(24,'0');
const clone=x=>JSON.parse(JSON.stringify(x));
function createFixture(){
 const now={seconds:Math.floor(Date.now()/1000)};
 const specs=aiRequire('./tests/multi-scan/stage6/images/manifest.json').specs.slice(0,4);
 const state={user:{_id:userId,email:'offline-stage9@example.test',role:'admin',estoreid:scope.storeId,estoreids:[],resellid:scope.packageId,wholesale:true},store:{_id:scope.storeId,resellid:scope.packageId,status:'active',accessibility:{cashier:['orders']}},owner:{_id:scope.packageId,status:'active',reseller:{status:true}},products:specs.map((s,i)=>({_id:id(i),estoreid:scope.storeId,title:`${s.brand} ${s.variant} ${s.size}`,brand:brandId,variantName:s.variant,description:'Synthetic generated label fixture, NOT real grocery data',images:[{url:`https://offline.example.test/references/${s.name}.png`}],quantity:100,waiting:{},segregate:false,activate:true,price:10+i,wholesale:[{wcount:3,wprice:8+i}],packaging:{},unitOfMeasure:'pack',updatedAt:'2026-10-22T00:00:00Z'})),events:[],writes:0};
 const repository={usersByEmail:async(email,store)=>{state.events.push('users');return state.user&&email===state.user.email&&store===scope.storeId?[clone(state.user)]:[];},store:async store=>store===scope.storeId?clone(state.store):null,packageOwner:async pkg=>pkg===scope.packageId?clone(state.owner):null,products:async(store,ids)=>{state.events.push('current-products');return clone(state.products.filter(p=>p.estoreid===store&&ids.includes(p._id)));},productPage:async(store,{after,limit,session}={})=>clone((session?.rows||state.products).filter(p=>p.estoreid===store&&(!after||p._id>after)).sort((a,b)=>a._id.localeCompare(b._id)).slice(0,limit)),brands:async(store,ids)=>store===scope.storeId&&ids.includes(brandId)?[{_id:brandId,estoreid:store,name:'Synthetic labels'}]:[],withSnapshot:async(fn,options)=>fn({...options,session:{rows:clone(state.products)}})};
 const security=new Security({repository,key:jwtKey,clock:()=>now.seconds});
 const catalog=new Catalog({repository,security,imagePolicy:new ImagePolicy(['https://offline.example.test/references/']),clock:()=>now.seconds});
 const token=(claims={})=>jwt.sign({email:state.user.email,iat:now.seconds,exp:now.seconds+600,...claims},jwtKey);
 return {state,specs,repository,security,catalog,token,now};
}
module.exports={createFixture,scope,userId,id,jwtKey,serviceKey,aiRoot,aiRequire,clone};
