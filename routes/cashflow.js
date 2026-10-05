const express = require("express");
const router = express.Router();
const {
  createCashflow,
  getCashflows,
  updateCashflow,
  deleteCashflow,
} = require("../controllers/cashflow");
const { authCheck, adminGratisCheck } = require("../middlewares/auth");

// Create Cashflow
router.post("/gratis/cashflow", authCheck, adminGratisCheck, createCashflow);

// Get All Cashflows
router.get("/gratis/cashflow", authCheck, adminGratisCheck, getCashflows);

// Update Cashflow
router.put("/gratis/cashflow/:id", authCheck, adminGratisCheck, updateCashflow);

// Delete Cashflow
router.delete(
  "/gratis/cashflow/:createdBy",
  authCheck,
  adminGratisCheck,
  deleteCashflow,
);

module.exports = router;
