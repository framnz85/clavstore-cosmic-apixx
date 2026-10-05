const express = require("express");
const router = express.Router();
const { getCategories } = require("../controllers/app/category");
const { authCheck, adminGratisCheck } = require("../middlewares/auth");

router.post("/app/all-categories", authCheck, adminGratisCheck, getCategories);

module.exports = router;
