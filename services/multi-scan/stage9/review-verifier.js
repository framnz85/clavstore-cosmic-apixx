'use strict';
const {check,id}=require('../stage7/contracts');
const {currentProduct}=require('../stage7/resolution');
const {scope,clone}=require('./fixture');
// Offline implementation of the proposed Stage 8 review contract; never registered as HTTP.
function createOfflineReviewVerifier({fixture,getCart=()=>[],token=()=>fixture.token()}){
 return async({scanId,items,cartFingerprint},{signal}={})=>{
  const grant=await fixture.security.authenticate({token:token(),storeId:scope.storeId,packageHint:scope.packageId,signal});
  check(typeof scanId==='string'&&Array.isArray(items)&&items.length>=1&&items.length<=100,'INVALID_SELECTION','Select bounded exact SKUs');
  const requested=items.map(p=>({productId:id(p.productId),quantity:p.quantity}));
  check(new Set(requested.map(p=>p.productId)).size===requested.length&&requested.every(p=>Number.isSafeInteger(p.quantity)&&p.quantity>=1&&p.quantity<=100),'INVALID_SELECTION','Unique exact SKU counts required');
  const cart=clone(getCart());check(Array.isArray(cart)&&JSON.stringify(cart)===cartFingerprint,'STALE_CART','The offline authoritative cart changed');
  const current=await fixture.catalog.current(grant,requested.map(p=>p.productId),{signal});
  const rows=new Map(current.rows.map(p=>[p._id,p]));
  const verified=requested.map(item=>{
   const p=rows.get(item.productId);check(p?.activate===true,'STALE_PRODUCT_DATA','Current product missing or inactive');
   const old=cart.find(line=>line._id===p._id);check(!old||Number.isSafeInteger(old.count)&&old.count>0,'INVALID_CART','Invalid current cart quantity');
   const total=item.quantity+(old?.count||0),resolved=currentProduct(p,null,current.scope,total,total);
   check(resolved?.eligibleForReview===true,'INSUFFICIENT_STOCK','Current total exceeds stock or price is invalid');
   check(!resolved.reviewReasons.some(r=>r.startsWith('INVALID_WHOLESALE')||r==='AMBIGUOUS_WHOLESALE_TIERS'),'INVALID_PRICE','Wholesale policy requires manual review');
   check(!p.waiting?._id&&!p.waiting?.newQuantity&&!p.segregate,'SPECIAL_STOCK','Use existing POS waiting-stock flow');
   return {...item,product:clone(p),unitPrice:resolved.currentPrice.suggestedUnitPrice,priceAuthority:'current_main_catalog'};
  });
  await fixture.security.revalidate(grant,{signal});
  return {tenant:{...scope},scanId,catalogRevision:current.resolutionFingerprint,reviewRequired:true,confirmed:false,cartMutation:false,items:verified};
 };
}
module.exports={createOfflineReviewVerifier};
