'use strict';
const {test}=require('node:test'),a=require('node:assert/strict');
const {createDevelopmentQuote}=require('../../../services/multi-scan/stage13/development-quote');
const store='6aea21f9b2f055c904c7ba16',ids=['6aea21f9b2f055c904c7ba17','6aea21f9b2f055c904c7ba18','6aea21f9b2f055c904c7ba19'];
const cashier={userId:'6aea21f9b2f055c904c7ba21',storeId:store,role:'cashier'};
function fixture(){
 const order=[ids[0],ids[0],ids[1],ids[1],ids[2]],results=order.map((productId,i)=>({id:String(i),productId,matchStatus:'matched',ambiguous:false}));
 const review={id:'a'.repeat(64),authority:'CASHIER_REVIEW_ONLY',expiresAt:100000,version:2,results,cashierReview:results.map(r=>({id:r.id,status:'confirmed',productId:r.productId})),cartHandoff:{storeId:store,rejectedIds:[],unresolvedIds:[],groups:ids.map(productId=>({productId,quantity:order.filter(id=>id===productId).length,proposalIds:results.filter(r=>r.productId===productId).map(r=>r.id)}))},recognitionEvidence:{kind:'VERIFIED_NATIVE_CPU_RECOGNITION'}};
 const rows=ids.map((id,i)=>({_id:id,estoreid:store,activate:true,slug:'dev-'+i,title:['Milo','Bear Brand','Lucky Me'][i],variantName:['24g','33g','55g'][i],price:[12,15,18][i],quantity:100,segregate:false}));
 return {review,rows};
}
test('validated Stage 13 review yields read-only current-catalog quote',async()=>{const {review,rows}=fixture();let reads=0;const quote=createDevelopmentQuote({reviews:{get:()=>review},readProducts:async()=>{reads++;return rows},clock:()=>1000});const result=await quote(review.id,cashier);a.equal(result.sourceType,'stage13_verified_cashier_review');a.equal(result.total,72);a.deepEqual(result.items.map(i=>i.quantity),[2,2,1]);a.equal(result.cartMutation,false);a.equal(result.permit,null);a.equal(reads,1);});
test('expired and tampered review fail closed',async()=>{const {review,rows}=fixture();const quote=createDevelopmentQuote({reviews:{get:()=>review},readProducts:async()=>rows,clock:()=>1000});review.expiresAt=1000;await a.rejects(quote(review.id,cashier),/REVIEW_NOT_CONFIRMED/);review.expiresAt=100000;review.cashierReview[0].productId=ids[1];await a.rejects(quote(review.id,cashier),/REVIEW_NOT_CONFIRMED/);});
test('wrong-store product and cashier fail closed',async()=>{const {review,rows}=fixture();const quote=createDevelopmentQuote({reviews:{get:()=>review},readProducts:async()=>rows,clock:()=>1000});rows[0].estoreid='613216389261e003d696cc65';await a.rejects(quote(review.id,cashier),/CATALOG_INVALID/);await a.rejects(quote(review.id,{...cashier,storeId:'613216389261e003d696cc65'}),/CASHIER_SCOPE/);});
test('quote has no cart-write capability',async()=>{const {review,rows}=fixture();const result=await createDevelopmentQuote({reviews:{get:()=>review},readProducts:async()=>rows,clock:()=>1000})(review.id,cashier);a.deepEqual(Object.keys(result).filter(k=>/commit|permit|cartMutation/i.test(k)),['cartMutation','permit']);a.equal(result.readOnly,true);});
