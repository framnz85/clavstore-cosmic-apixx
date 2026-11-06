const express = require("express");
const router = express.Router();
const {
  getPayment,
  getPayments,
  payXendit,
  addPayment,
  updatePayment,
  removePayment,
} = require("../controllers/payment");
const { getSuperPayment } = require("../controllers/superBilling");
const { authCheck, adminGratisCheck } = require("../middlewares/auth");

router.get("/gratis/get-payment/:payid", authCheck, getPayment);
router.get("/gratis/get-super-payment/:payid", authCheck, getSuperPayment);
router.get("/gratis/get-payments", authCheck, getPayments);
router.post("/gratis/xendit-payment", authCheck, payXendit);
router.post("/gratis/add-payment", authCheck, adminGratisCheck, addPayment);
router.put(
  "/gratis/update-payment/:payid",
  authCheck,
  adminGratisCheck,
  updatePayment
);
router.delete(
  "/gratis/remove-payment/:payid",
  authCheck,
  adminGratisCheck,
  removePayment
);

module.exports = router;
