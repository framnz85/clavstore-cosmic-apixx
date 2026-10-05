const express = require("express");
const router = express.Router();
const {
  getBrand,
  getBrands,
  checkImageUser,
  addBrand,
  updateBrand,
  importBrands,
  removeBrand,
} = require("../controllers/brand");
const { authCheck, adminGratisCheck } = require("../middlewares/auth");

router.get("/gratis/get-brand/:braid", authCheck, getBrand);
router.get("/gratis/get-brands", getBrands);
router.get(
  "/gratis/check-image-owner-brand/:publicid",
  authCheck,
  adminGratisCheck,
  checkImageUser
);
router.post("/gratis/add-brand", authCheck, adminGratisCheck, addBrand);
router.put(
  "/gratis/update-brand/:braid",
  authCheck,
  adminGratisCheck,
  updateBrand
);
router.put("/gratis/import-brands", authCheck, adminGratisCheck, importBrands);
router.delete(
  "/gratis/remove-brand/:braid",
  authCheck,
  adminGratisCheck,
  removeBrand
);

module.exports = router;
