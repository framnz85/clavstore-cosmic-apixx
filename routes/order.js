const express = require("express");
const router = express.Router();
const {
  userOrder,
  userAppOrder,
  userOrders,
  adminOrder,
  adminOrders,
  adminSales,
  updateCart,
  updateCartPurchase,
  saveCartOrder,
  saveCartPurchase,
  updateOrderStatus,
  updatePaidOrder,
  updateCustomDetails,
  updateProductRating,
  voidProducts,
  editOrder,
  submitEditOrder,
  deleteAdminOrder,
  deleteOrder,
} = require("../controllers/order");
const {
  saveCartWarehouseOrder,
  adminWarehouseOrders,
  adminWarehouseOrder,
} = require("../controllers/orderware");
const { authCheck, adminGratisCheck } = require("../middlewares/auth");

router.get("/gratis/user-order/:orderid", authCheck, userOrder);
router.get("/gratis/user-order-app/:orderid", userAppOrder);
router.get(
  "/gratis/admin-order/:orderid",
  authCheck,
  adminGratisCheck,
  adminOrder,
);
router.get(
  "/gratis/admin-warehouse-order/:orderid",
  authCheck,
  adminGratisCheck,
  adminWarehouseOrder,
);
router.post("/gratis/user-orders", authCheck, userOrders);
router.post("/gratis/admin-orders", authCheck, adminGratisCheck, adminOrders);
router.post(
  "/gratis/admin-warehouse-orders",
  authCheck,
  adminGratisCheck,
  adminWarehouseOrders,
);
router.post("/gratis/update-cart", authCheck, updateCart);
router.post(
  "/gratis/update-cart-purchase",
  authCheck,
  adminGratisCheck,
  updateCartPurchase,
);
router.post("/gratis/save-cart-order", authCheck, saveCartOrder);
router.post(
  "/gratis/save-cart-purchase",
  authCheck,
  adminGratisCheck,
  saveCartPurchase,
);
router.post(
  "/gratis/save-cart-warehouse-order",
  authCheck,
  saveCartWarehouseOrder,
);
router.post("/gratis/admin-sales", authCheck, adminGratisCheck, adminSales);
router.put(
  "/gratis/update-order-status",
  authCheck,
  adminGratisCheck,
  updateOrderStatus,
);
router.put("/gratis/update-paid-order", authCheck, updatePaidOrder);
router.put("/gratis/update-custom-details", authCheck, updateCustomDetails);
router.put("/gratis/update-product-rating", authCheck, updateProductRating);
router.put("/gratis/void-product", authCheck, adminGratisCheck, voidProducts);
router.put("/gratis/edit-order", authCheck, editOrder);
router.put("/gratis/submit-edit-order", authCheck, submitEditOrder);
router.delete(
  "/gratis/delete-admin-order/:orderid",
  authCheck,
  adminGratisCheck,
  deleteAdminOrder,
);
router.delete("/gratis/delete-order/:orderid", authCheck, deleteOrder);

module.exports = router;
