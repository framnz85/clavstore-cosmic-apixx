const express = require("express");
const router = express.Router();
const {
  getAllCounts,
  getProducts,
  updateProduct,
} = require("../controllers/app/product");
const { authCheck, adminGratisCheck } = require("../middlewares/auth");

router.get("/app/get-all-counts", authCheck, adminGratisCheck, getAllCounts);
router.post("/app/all-products", authCheck, adminGratisCheck, getProducts);
router.put("/app/update-product", authCheck, adminGratisCheck, updateProduct);

module.exports = router;
