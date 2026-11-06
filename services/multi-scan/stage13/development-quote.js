'use strict';
// Read-only Stage 13 provenance branch for the isolated development POS.
const {createHash}=require('node:crypto');
const {currentProduct}=require('../stage7/resolution');
const STORE='6aea21f9b2f055c904c7ba16';
const hex=v=>typeof v==='string'&&/^[a-f0-9]{24}$/.test(v);
const fail=code=>{throw Object.assign(Error(code),{code});};
function createDevelopmentQuote({reviews,readProducts,clock=Date.now}={}){
 if(process.env.NODE_ENV!=='development'||typeof reviews?.get!=='function'||typeof readProducts!=='function')fail('QUOTE_UNAVAILABLE');
 return async function quote(reviewId,cashier){
  if(!cashier||cashier.role!=='cashier'||cashier.storeId!==STORE||!hex(cashier.userId))fail('CASHIER_SCOPE');
  if(!/^[a-f0-9]{64}$/.test(reviewId||''))fail('INVALID_REVIEW_ID');
  // get() rechecks original signed native receipt, crop bytes, source journal and expiry.
  const review=reviews.get(reviewId);
  if(review.id!==reviewId||review.authority!=='CASHIER_REVIEW_ONLY'||review.expiresAt<=clock()||review.cartHandoff?.storeId!==STORE||review.results?.length!==5||review.cashierReview?.length!==5||review.cartHandoff?.rejectedIds?.length||review.cartHandoff?.unresolvedIds?.length)fail('REVIEW_NOT_CONFIRMED');
  const seen=new Set(),counts=new Map();
  for(const result of review.results){
   const decision=review.cashierReview.find(d=>d.id===result.id);
   if(!decision||seen.has(result.id)||decision.status!=='confirmed'||result.matchStatus!=='matched'||result.ambiguous||decision.productId!==result.productId||!hex(decision.productId))fail('REVIEW_NOT_CONFIRMED');
   seen.add(result.id);counts.set(decision.productId,(counts.get(decision.productId)||0)+1);
  }
  if(seen.size!==5||counts.size!==3||review.cartHandoff.groups?.length!==3)fail('REVIEW_NOT_CONFIRMED');
  const grouped=new Set();
  for(const group of review.cartHandoff.groups){
   if(grouped.has(group.productId)||counts.get(group.productId)!==group.quantity||group.proposalIds?.length!==group.quantity||group.proposalIds.some(id=>!seen.has(id)))fail('REVIEW_TAMPERED');
   grouped.add(group.productId);
  }
  if(grouped.size!==counts.size)fail('REVIEW_TAMPERED');
  const ids=[...counts.keys()],rows=await readProducts(ids);
  if(!Array.isArray(rows)||rows.length!==ids.length)fail('CATALOG_UNAVAILABLE');
  const products=new Map();
  for(const p of rows){const id=String(p._id),store=String(p.estoreid);if(!ids.includes(id)||products.has(id)||store!==STORE||p.activate!==true||!p.slug||p.variants?.length||p.segregate||p.waiting?._id)fail('CATALOG_INVALID');products.set(id,p);}
  let total=0;const items=ids.map(productId=>{
   const p=products.get(productId),quantity=counts.get(productId);
   const resolved=currentProduct(p,null,{wholesale:false},quantity,quantity);
   if(!resolved?.eligibleForReview||resolved.reviewReasons.length||!Number.isFinite(resolved.currentPrice.suggestedUnitPrice)||resolved.currentPrice.suggestedUnitPrice<0)fail('PRODUCT_UNAVAILABLE');
   const unitPrice=resolved.currentPrice.suggestedUnitPrice,lineTotal=Math.round(unitPrice*quantity*100)/100;
   total+=lineTotal;
   return {productId,title:resolved.title,variant:resolved.variant,quantity,unitPrice,lineTotal,availableStock:p.quantity,priceAuthority:'current_main_catalog'};
  });
  if(review.expiresAt<=clock())fail('REVIEW_EXPIRED');
  const issuedAt=clock(),expiresAt=Math.min(review.expiresAt,issuedAt+15000);
  if(expiresAt<=issuedAt)fail('REVIEW_EXPIRED');
  const evidenceDigest=createHash('sha256').update(JSON.stringify({reviewId,version:review.version,decisions:review.cashierReview,source:review.recognitionEvidence})).digest('hex');
  return Object.freeze({schemaVersion:1,sourceType:'stage13_verified_cashier_review',authority:'isolated_development_pos',reviewId,reviewVersion:review.version,storeId:STORE,cashierId:cashier.userId,evidenceDigest,items,total:Math.round(total*100)/100,currency:'PHP',issuedAt,expiresAt,readOnly:true,cartMutation:false,permit:null});
 };
}
module.exports={createDevelopmentQuote};
