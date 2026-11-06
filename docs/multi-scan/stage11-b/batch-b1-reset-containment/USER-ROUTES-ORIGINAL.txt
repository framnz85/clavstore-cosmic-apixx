const express = require("express");
const router = express.Router();
const {
  getUserDetails,
  getRaffleEntries,
  getTopEntries,
  getAllUsers,
  getNotification,
  createNewUser,
  updateUser,
  updateCustomer,
  verifyUserEmail,
  changePassword,
  resetPassword,
  forgotPassword,
  deleteUser,
  deleteAllRaffles,
  sendEmail,
  addToWishlist,
  handleWorkflow1,
  sendVerificationCode,
  deleteAccountRequest,
  importUsers,
} = require("../controllers/user");
const { authCheck, adminGratisCheck } = require("../middlewares/auth");

router.get("/gratis/user-details/:resellid", authCheck, getUserDetails);
router.get("/gratis/raffle-entries", authCheck, getRaffleEntries);
router.get(
  "/gratis/top-entries/:count",
  authCheck,
  adminGratisCheck,
  getTopEntries,
);
router.get(
  "/gratis/get-notification/:day",
  authCheck,
  adminGratisCheck,
  getNotification,
);
router.post("/gratis/all-users", authCheck, adminGratisCheck, getAllUsers);
router.post("/gratis/user-create/:resellid", createNewUser);
router.post("/gratis/user-email", sendEmail);
router.post("/gratis/add-wishlist", authCheck, addToWishlist);
router.post("/gratis/workflow-register1", handleWorkflow1);
router.post("/gratis/send-verification-code", sendVerificationCode);
router.put("/gratis/user-update", authCheck, updateUser);
router.put("/gratis/update-customer/:userid", authCheck, updateCustomer);
router.put("/gratis/user-verify", authCheck, verifyUserEmail);
router.put("/gratis/change-password", authCheck, changePassword);
router.put(
  "/gratis/reset-password/:userid",
  authCheck,
  adminGratisCheck,
  resetPassword,
);
router.put("/gratis/forgot-password", forgotPassword);
router.put("/gratis/delete-account-request", deleteAccountRequest);
router.put("/gratis/import-users", authCheck, adminGratisCheck, importUsers);
router.delete(
  "/gratis/user-delete/:userid",
  authCheck,
  adminGratisCheck,
  deleteUser,
);
router.delete(
  "/gratis/delete-all-raffles",
  authCheck,
  adminGratisCheck,
  deleteAllRaffles,
);

module.exports = router;
