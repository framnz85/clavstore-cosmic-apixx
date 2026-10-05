const express = require("express");
const router = express.Router();
const jobList = require("../controllers/jobList");
const { authCheck, adminGratisCheck } = require("../middlewares/auth");

router.post(
  "/gratis/joblists",
  authCheck,
  adminGratisCheck,
  jobList.createJobList,
);
router.get("/gratis/joblists", jobList.getAllJobLists);
router.get(
  "/gratis/joblist/:id",
  authCheck,
  adminGratisCheck,
  jobList.getJobListById,
);
router.post(
  "/gratis/joblists/search",
  authCheck,
  adminGratisCheck,
  jobList.searchJobList,
);
router.put(
  "/gratis/joblists/:id",
  authCheck,
  adminGratisCheck,
  jobList.updateJobList,
);
router.delete(
  "/gratis/joblists/:id",
  authCheck,
  adminGratisCheck,
  jobList.deleteJobList,
);

module.exports = router;
