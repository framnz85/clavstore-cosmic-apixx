const express = require("express");
const router = express.Router();
const {
  loginUser,
  loginUserByMd5,
  checkEmailExist,
  getCountries,
} = require("../controllers/auth");

router.post("/gratis/auth-login", loginUser);
router.post("/gratis/auth-login-md5", loginUserByMd5);
router.post("/gratis/check-email-exist", checkEmailExist);
router.get("/gratis/get-countries", getCountries);

module.exports = router;
