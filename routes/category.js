const express = require("express");
const router = express.Router();
const {
  getCategory,
  getCategories,
  checkImageUser,
  addCategory,
  updateCategory,
  importCategories,
  removeCategory,
} = require("../controllers/category");
const { authCheck, adminGratisCheck } = require("../middlewares/auth");

router.get("/gratis/get-category/:catid", authCheck, getCategory);
router.get("/gratis/get-categories", getCategories);
router.get(
  "/gratis/check-image-owner-category/:publicid",
  authCheck,
  adminGratisCheck,
  checkImageUser,
);
router.post("/gratis/add-category", authCheck, adminGratisCheck, addCategory);
router.put(
  "/gratis/update-category/:catid",
  authCheck,
  adminGratisCheck,
  updateCategory,
);
router.put(
  "/gratis/import-categories",
  authCheck,
  adminGratisCheck,
  importCategories,
);
router.delete(
  "/gratis/remove-category/:catid",
  authCheck,
  adminGratisCheck,
  removeCategory,
);

module.exports = router;
