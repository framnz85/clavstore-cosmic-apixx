const express = require("express");
const router = express.Router();
const {
  listCountry,
  listAddiv1,
  listAddiv2,
  listAddiv3,
  copyAllAddiv1,
  saveCreatedLocation1,
  copyAllAddiv2,
  saveCreatedLocation2,
  copyAllAddiv3,
  saveCreatedLocation3,
  saveLocation3,
  listMyCountry,
  listNewAdded,
  listMyAddiv1,
  listMyAddiv2,
  listMyAddiv3,
  getAddiv3,
  updateMyAddiv3,
  deleteAddiv3,
  deleteAddiv2,
  deleteAddiv1,
} = require("../controllers/address");

const { authCheck, adminGratisCheck } = require("../middlewares/auth");

router.get("/gratis/country", listCountry);
router.get("/gratis/addiv1/:couid", listAddiv1);
router.get("/gratis/addiv2/:couid/:addiv1", listAddiv2);
router.get("/gratis/addiv3/:couid/:addiv1/:addiv2", listAddiv3);

router.put("/gratis/copyalladdiv1", authCheck, adminGratisCheck, copyAllAddiv1);
router.put(
  "/gratis/savecreatedlocation1",
  authCheck,
  adminGratisCheck,
  saveCreatedLocation1
);
router.put("/gratis/copyalladdiv2", authCheck, adminGratisCheck, copyAllAddiv2);
router.put(
  "/gratis/savecreatedlocation2",
  authCheck,
  adminGratisCheck,
  saveCreatedLocation2
);
router.put("/gratis/copyalladdiv3", authCheck, adminGratisCheck, copyAllAddiv3);
router.put(
  "/gratis/savecreatedlocation3",
  authCheck,
  adminGratisCheck,
  saveCreatedLocation3
);
router.put("/gratis/savelocation3", authCheck, adminGratisCheck, saveLocation3);

router.get("/gratis/mycountry", listMyCountry);
router.get("/gratis/myaddiv3", authCheck, adminGratisCheck, listNewAdded);
router.get("/gratis/myaddiv1/:couid", listMyAddiv1);
router.get("/gratis/myaddiv2/:couid/:addiv1", listMyAddiv2);
router.get("/gratis/myaddiv3/:couid/:addiv1/:addiv2", listMyAddiv3);

router.get("/gratis/locate/:addiv3", getAddiv3);
router.put(
  "/gratis/updatemyaddiv3/:addiv3",
  authCheck,
  adminGratisCheck,
  updateMyAddiv3
);

router.delete(
  "/gratis/deleteaddiv3",
  authCheck,
  adminGratisCheck,
  deleteAddiv3
);
router.delete(
  "/gratis/deleteaddiv2",
  authCheck,
  adminGratisCheck,
  deleteAddiv2
);
router.delete(
  "/gratis/deleteaddiv1",
  authCheck,
  adminGratisCheck,
  deleteAddiv1
);

module.exports = router;
