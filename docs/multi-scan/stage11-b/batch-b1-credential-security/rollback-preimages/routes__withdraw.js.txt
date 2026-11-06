const express = require("express");
const router = express.Router();
const {
  getDashboard,
  getUserToAffiliate,
  getWithdrawals,
  getAffiliates,
  saveWithdrawal,
  approveWithdraw,
} = require("../controllers/withdraw");
const { authCheck, adminGratisCheck } = require("../middlewares/auth");

router.get("/gratis/get-dashboard", authCheck, adminGratisCheck, getDashboard);
router.get(
  "/gratis/user-to-affiliate/:email",
  authCheck,
  adminGratisCheck,
  getUserToAffiliate
);
router.post(
  "/gratis/get-withdrawals",
  authCheck,
  adminGratisCheck,
  getWithdrawals
);
router.post(
  "/gratis/get-affiliates",
  authCheck,
  adminGratisCheck,
  getAffiliates
);
router.post(
  "/gratis/save-withdrawal",
  authCheck,
  adminGratisCheck,
  saveWithdrawal
);
router.put("/gratis/approve-withdrawal", authCheck, approveWithdraw);

module.exports = router;
