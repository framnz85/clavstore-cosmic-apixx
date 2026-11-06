const express = require("express");
const router = express.Router();
const {
  getEstore,
  getDefaultEstore,
  getReseller,
  getPackage,
  getPackages,
  getDedicatedEstores,
  getEstoreCounters,
  getAllowedEstores,
  searchEstoreByText,
  searchWarehouseByText,
  updateEstore,
  createEstore,
  addNewEstore,
  copyingEstore,
  updateEstoreCounters,
  updateEstoresDefault,
  updateEstoresVissible,
  deletingEstore,
} = require("../controllers/estore");
const {
  getSuperPackage,
  getSuperPackages,
} = require("../controllers/superBilling");
const { authCheck, adminGratisCheck } = require("../middlewares/auth");

router.get("/gratis/estore/:slug", getEstore);
router.get("/gratis/default-estore", getDefaultEstore);
router.get("/gratis/reseller/:id", getReseller);
router.get("/gratis/get-package/:id/:packid", getPackage);
router.get("/gratis/get-super-package/:id/:packid/:branchid", getSuperPackage);
router.get("/gratis/get-packages/:packDefault", getPackages);
router.get("/gratis/get-super-packages/:packDefault", getSuperPackages);
router.get("/gratis/dedicated-estores", getDedicatedEstores);
router.get("/gratis/estore-counters/:estoreid", getEstoreCounters);
router.post("/gratis/allowed-estores", getAllowedEstores);
router.post("/gratis/estore-by-id-text", searchEstoreByText);
router.post("/gratis/warehouse-estores-search", searchWarehouseByText);
router.post("/gratis/estore-update", authCheck, adminGratisCheck, updateEstore);
router.post("/gratis/estore-create/:resellid", createEstore);
router.post(
  "/gratis/add-new-estore/:resellid",
  authCheck,
  adminGratisCheck,
  addNewEstore,
);
router.post(
  "/gratis/copying-estore/:resellid",
  authCheck,
  adminGratisCheck,
  copyingEstore,
);
router.put("/gratis/update-estore-counters", updateEstoreCounters);
router.put("/gratis/update-estores-default", updateEstoresDefault);
router.put("/gratis/update-estores-visible", updateEstoresVissible);
router.delete(
  "/gratis/delete-estore/:deleteid",
  authCheck,
  adminGratisCheck,
  deletingEstore,
);

module.exports = router;
