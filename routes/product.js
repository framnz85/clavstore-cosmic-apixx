const express = require("express");
const router = express.Router();
const {
  randomItems,
  getProductBySlug,
  getProductReviews,
  getProductById,
  itemsByBarcode,
  loadInitProducts,
  getWaitingProducts,
  inventorySummary,
  getAdminItems,
  addProduct,
  searchProduct,
  submitRating,
  updateProduct,
  receiveProducts,
  importProducts,
  updateWaitingProduct,
  deleteProduct,
  deleteWaitingProduct,
  checkImageUser,
} = require("../controllers/product");
const { getMarketPrices } = require("../controllers/superProduct");
const { authCheck, adminGratisCheck } = require("../middlewares/auth");

router.get("/gratis/products/random/:count", randomItems);
router.get("/gratis/get-product-by-slug/:slug/:prodid", getProductBySlug);
router.get("/gratis/get-product-reviews/:prodid", getProductReviews);
router.get(
  "/gratis/get-product-by-id/:prodid",
  authCheck,
  adminGratisCheck,
  getProductById,
);
router.get("/gratis/get-product-by-barcode/:barcode", itemsByBarcode);
router.get(
  "/gratis/init-product/:count",
  authCheck,
  adminGratisCheck,
  loadInitProducts,
);
router.get(
  "/gratis/get-waiting-products",
  authCheck,
  adminGratisCheck,
  getWaitingProducts,
);
router.get(
  "/gratis/get-inventory-summary",
  authCheck,
  adminGratisCheck,
  inventorySummary,
);
router.get(
  "/gratis/check-image-owner-product/:publicid",
  authCheck,
  adminGratisCheck,
  checkImageUser,
);
router.get(
  "/gratis/get-market-prices/:barcode",
  authCheck,
  adminGratisCheck,
  getMarketPrices,
);
router.post(
  "/gratis/get-admin-products",
  authCheck,
  adminGratisCheck,
  getAdminItems,
);
router.post("/gratis/get-best-seller", getAdminItems);
router.post("/gratis/add-product", authCheck, adminGratisCheck, addProduct);
router.post("/gratis/search-product", searchProduct);
router.post("/gratis/submit-rating", authCheck, submitRating);
router.put(
  "/gratis/update-product/:prodid",
  authCheck,
  adminGratisCheck,
  updateProduct,
);
router.put(
  "/gratis/receive-product",
  authCheck,
  adminGratisCheck,
  receiveProducts,
);
router.put(
  "/gratis/import-products",
  authCheck,
  adminGratisCheck,
  importProducts,
);
router.put(
  "/gratis/update-waiting-product",
  authCheck,
  adminGratisCheck,
  updateWaitingProduct,
);
router.delete(
  "/gratis/delete-product/:prodid",
  authCheck,
  adminGratisCheck,
  deleteProduct,
);
router.delete(
  "/gratis/delete-waiting-product/:waitid",
  authCheck,
  adminGratisCheck,
  deleteWaitingProduct,
);

module.exports = router;
