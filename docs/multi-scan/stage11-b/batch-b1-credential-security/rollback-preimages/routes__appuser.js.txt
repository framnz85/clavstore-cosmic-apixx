const express = require("express");
const router = express.Router();
const {
  getUsers,
  getDefaultEstore,
  getUserDetails,
  loginUser,
  updateUser,
} = require("../controllers/app/user");
const { authCheck, adminGratisCheck } = require("../middlewares/auth");

router.get("/app/user-details/:resellid", authCheck, getUserDetails);
router.get("/app/default-estore/:estoreid", authCheck, getDefaultEstore);
router.post("/app/all-users", authCheck, adminGratisCheck, getUsers);
router.post("/app/auth-login", loginUser);
router.put("/app/update-user", authCheck, updateUser);

module.exports = router;
