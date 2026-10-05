const express = require("express");
const router = express.Router();
const jobOrder = require("../controllers/joborder");
const { authCheck, adminGratisCheck } = require("../middlewares/auth");

router.post(
  "/gratis/joborders",
  authCheck,
  adminGratisCheck,
  jobOrder.createJobOrder,
);
router.get(
  "/gratis/joborders",
  authCheck,
  adminGratisCheck,
  jobOrder.getAllJobOrders,
);
router.get(
  "/gratis/joborder/:id",
  authCheck,
  adminGratisCheck,
  jobOrder.getJobOrderById,
);
router.put(
  "/gratis/joborders/:id",
  authCheck,
  adminGratisCheck,
  jobOrder.updateJobOrder,
);
router.delete(
  "/gratis/joborders/:id",
  authCheck,
  adminGratisCheck,
  jobOrder.deleteJobOrder,
);

router.post(
  "/gratis/user-joborders",
  authCheck,
  jobOrder.createCustomerJobOrder,
);
router.get("/gratis/user-joborders", authCheck, jobOrder.getCustomerJobOrders);
router.put(
  "/gratis/user-joborders/:id",
  authCheck,
  jobOrder.updateCustomerJobOrder,
);
router.delete(
  "/gratis/user-joborders/:id",
  authCheck,
  jobOrder.deleteCustomerJobOrder,
);

// Routes for managing jobs within an order
router.post(
  "/gratis/joborders/:id/jobs",
  authCheck,
  adminGratisCheck,
  jobOrder.addJobToOrder,
);
router.put(
  "/gratis/joborders/:id/jobs/:jobIndex",
  authCheck,
  adminGratisCheck,
  jobOrder.updateJobInOrder,
);
router.delete(
  "/gratis/joborders/:id/jobs/:jobIndex",
  authCheck,
  adminGratisCheck,
  jobOrder.removeJobFromOrder,
);

module.exports = router;
