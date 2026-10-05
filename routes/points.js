const express = require("express");
const router = express.Router();
const {
  getPoints,
  getPoint,
  updatePoint,
  deletePoint,
} = require("../controllers/points");
const { authCheck, adminGratisCheck } = require("../middlewares/auth");

// Get all points for an estore
router.get("/gratis/points", authCheck, adminGratisCheck, getPoints);

// Get one points record
router.get(
  "/gratis/points/:pointid",
  authCheck,
  adminGratisCheck,
  getPoint,
);

// Update points
router.put(
  "/gratis/points/:pointid",
  authCheck,
  adminGratisCheck,
  updatePoint,
);

// Delete points
router.delete(
  "/gratis/points/:pointid",
  authCheck,
  adminGratisCheck,
  deletePoint,
);

module.exports = router;
