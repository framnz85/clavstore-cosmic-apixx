const express = require("express");
const router = express.Router();
const {
  latestBill,
  getHostingBill,
  getBillings,
  addBilling,
  updateBilling,
} = require("../controllers/billing");
const {
  latestSuperBill,
  getHostingSuperBill,
  getSuperBillings,
} = require("../controllers/superBilling");
const { authCheck, adminGratisCheck } = require("../middlewares/auth");

router.get(
  "/gratis/latest-bill/:packid",
  authCheck,
  adminGratisCheck,
  latestBill
);
router.get("/gratis/latest-super-bill/:packid", authCheck, latestSuperBill);
router.get(
  "/gratis/get-hosting-billing",
  authCheck,
  adminGratisCheck,
  getHostingBill
);
router.get("/gratis/get-hosting-super-billing", authCheck, getHostingSuperBill);
router.get("/gratis/get-billings", authCheck, adminGratisCheck, getBillings);
router.get("/gratis/get-super-billings", authCheck, getSuperBillings);
router.post("/gratis/add-billing", authCheck, adminGratisCheck, addBilling);
router.put(
  "/gratis/update-billing",
  authCheck,
  adminGratisCheck,
  updateBilling
);

module.exports = router;
