'use strict';
const {check,same,clone}=require('../stage7/contracts');
// Additional output guard after Stage 7 authentication/validation/resolution, not a replacement.
function requireCompleteReview(review,authorizedTenant){
 check(review&&same(review.tenant,authorizedTenant),'FOREIGN_REVIEW','Review scope differs',403);
 check(review.reviewRequired===true&&review.confirmed===false&&review.cartMutation===false&&review.orderPersisted===false&&review.priceAuthority==='current_main_catalog','UNSAFE_REVIEW','Current review-only catalog output required',502);
 check(Array.isArray(review.reviewReasons)&&Array.isArray(review.detections)&&review.detections.length<=10,'INVALID_REVIEW','Bounded review output required',502);
 check(!review.reviewReasons.includes('CROP_LIMIT_APPLIED'),'TOO_MANY_OBJECTS','Capture fewer than eleven objects; this scan was truncated',422);
 for(const d of review.detections)check(d.reviewRequired===true&&d.confirmed===false&&d.suggestedProductId===null&&d.selectionRequired===true,'UNSAFE_REVIEW','Explicit cashier selection is required',502);
 return clone(review);
}
module.exports={requireCompleteReview};
