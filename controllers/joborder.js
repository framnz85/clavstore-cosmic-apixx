const ObjectId = require("mongoose").Types.ObjectId;
const JobOrder = require("../models/joborder");
const JobList = require("../models/jobList");
const User = require("../models/user");
const Cashflow = require("../models/cashflow");
const Estore = require("../models/estore");
const { createCashflowEntry } = require("./cashflow");
const { redisClient } = require("../config/redis");
const {
  clearOneItemCache,
  clearMultiItemsCache,
  clearSubItemCache,
} = require("./redis/clearing");

const toObjectId = (value) =>
  value && ObjectId.isValid(value) ? new ObjectId(value) : undefined;

const normalizePrice = (price) => {
  if (price && typeof price === "object") return price.amount || 0;
  return typeof price === "number" ? price : 0;
};

const normalizeQuantity = (quantity) => {
  const q = Number(quantity);
  return Number.isFinite(q) && q > 0 ? q : 1;
};

const calculateTotalAmount = (jobs) => {
  return jobs.reduce((total, job) => {
    const jobPrice = normalizePrice(job.price);
    const jobQuantity = normalizeQuantity(job.quantity);
    return total + jobPrice * jobQuantity;
  }, 0);
};

const isCompletedStatus = (status) =>
  status === "Complete" || status === "Completed";

const getJobOrderListCacheKey = (estoreid, filters = {}) => {
  const safeFilters = {
    search: filters.search || "all",
    orderStatus: filters.orderStatus || "all",
    customerId: filters.customerId || "all",
    jobId: filters.jobId || "all",
    paymentOption: filters.paymentOption || "all",
  };

  return `jobOrders:${estoreid}:${JSON.stringify(safeFilters)}`;
};

const getJobOrderByIdCacheKey = (estoreid, id) => `jobOrder:${estoreid}:${id}`;

const cashFlowEntry = async (jobOrder, estoreid, createdBy) => {
  try {
    const paymentOptionId =
      jobOrder && jobOrder.paymentOption ? jobOrder.paymentOption : null;

    const estore = await Estore.findById(estoreid)
      .select("upStatus2 upgradeType enableCashflow")
      .lean();

    if (!estore.enableCashflow) return;

    if (
      paymentOptionId &&
      ObjectId.isValid(paymentOptionId) &&
      (!estore ||
        String(estore.upStatus2 || "") !== "Active" ||
        String(estore.upgradeType || "") !== "2")
    ) {
      return;
    }

    const cashflowAmount =
      jobOrder && jobOrder.totalAmount ? Number(jobOrder.totalAmount) : 0;
    const orderCash = jobOrder && jobOrder.cash ? Number(jobOrder.cash) : 0;
    const posCashPaid = orderCash > 0;
    const inflowAmount = posCashPaid ? orderCash : cashflowAmount;
    const changeAmount = posCashPaid
      ? Math.max(orderCash - cashflowAmount, 0)
      : 0;

    let finalBalanceInflow = inflowAmount;
    let finalBalanceOutflow = 0;

    const latestCashflowQuery =
      jobOrder.paymentOption && ObjectId.isValid(jobOrder.paymentOption)
        ? {
            estoreid: new ObjectId(estoreid),
            createdBy: new ObjectId(createdBy),
            bankid: new ObjectId(jobOrder.paymentOption),
          }
        : {
            estoreid: new ObjectId(estoreid),
            createdBy: new ObjectId(createdBy),
            $or: [{ bankid: { $exists: false } }, { bankid: null }],
          };

    const latestCashflow = await Cashflow.findOne(latestCashflowQuery)
      .sort({ date: -1, createdAt: -1 })
      .select("balanceInflow balanceOutflow")
      .lean();

    const latestBalanceInflow = latestCashflow
      ? parseFloat(latestCashflow.balanceInflow) || 0
      : 0;
    const latestBalanceOutflow = latestCashflow
      ? parseFloat(latestCashflow.balanceOutflow) || 0
      : 0;

    finalBalanceInflow = latestBalanceInflow + inflowAmount;
    finalBalanceOutflow = latestBalanceOutflow + changeAmount;

    if (
      ObjectId.isValid(estoreid) &&
      ObjectId.isValid(jobOrder && jobOrder._id) &&
      ObjectId.isValid(createdBy)
    ) {
      const bankId =
        jobOrder && ObjectId.isValid(jobOrder.paymentOption)
          ? new ObjectId(jobOrder.paymentOption)
          : null;

      await createCashflowEntry({
        estoreid,
        createdBy,
        type: "jobs",
        amount: cashflowAmount,
        referenceid: jobOrder._id,
        date: new Date(),
        bankid: bankId,
        balanceInflow: finalBalanceInflow,
        balanceOutflow: finalBalanceOutflow,
      });
    }
  } catch (cashflowError) {
    console.log("Create cashflow failed:", cashflowError.message);
  }
};

exports.createJobOrder = async (req, res) => {
  const estoreid = req.headers.estoreid;
  try {
    const {
      code,
      customerId,
      customerName,
      customerPhone,
      customerEmail,
      jobs,
      date,
      dueDate,
      createdBy,
      paymentOption,
      notes,
      orderStatus,
    } = req.body;

    if ((!customerId && !customerName) || !jobs || jobs.length === 0) {
      return res.status(400).json({
        message: "Customer and at least one job are required",
      });
    }

    if (customerId && !ObjectId.isValid(customerId)) {
      return res.status(400).json({ message: "Invalid customerId" });
    }
    if (createdBy && !ObjectId.isValid(createdBy)) {
      return res.status(400).json({ message: "Invalid createdBy" });
    }
    if (paymentOption && !ObjectId.isValid(paymentOption)) {
      return res.status(400).json({ message: "Invalid paymentOption" });
    }
    if (estoreid && !ObjectId.isValid(estoreid)) {
      return res.status(400).json({ message: "Invalid estoreid" });
    }

    // Normalize jobs array
    const normalizedJobs = jobs.map((job) => ({
      jobId: toObjectId(job.jobId),
      jobTitle: job.jobTitle || "",
      quantity: normalizeQuantity(job.quantity),
      price: normalizePrice(job.price),
      status: job.status || "Not Processed",
      notes: job.notes || "",
    }));

    const totalAmount = calculateTotalAmount(normalizedJobs);

    const jobOrder = new JobOrder({
      code,
      customerId,
      customerName,
      customerPhone,
      customerEmail,
      jobs: normalizedJobs,
      totalAmount,
      orderStatus: orderStatus || "Not Processed",
      date,
      dueDate,
      createdBy: toObjectId(createdBy),
      paymentOption: toObjectId(paymentOption),
      customerId: toObjectId(customerId),
      estoreid: toObjectId(estoreid),
      notes,
    });

    const saved = await jobOrder.save();
    const populated = await JobOrder.findById(saved._id)
      .populate("customerId", "name email phone")
      .populate("jobs.jobId", "title uom price")
      .populate("paymentOption", "bankName")
      .populate("createdBy", "name email");

    const jobsChange = new Date().valueOf();
    await Estore.findByIdAndUpdate(estoreid, { jobsChange });

    await clearOneItemCache(estoreid, "jobOrders");
    await clearMultiItemsCache(estoreid, "jobOrders");
    await clearSubItemCache(saved._id.toString(), estoreid, "jobOrder");

    res.status(201).json({
      message: "Job order created successfully",
      data: populated,
      jobsChange,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error creating job order",
      error: error.message,
    });
  }
};

exports.getAllJobOrders = async (req, res) => {
  const estoreid = req.headers.estoreid;
  try {
    const { search, orderStatus, customerId, jobId, paymentOption } = req.query;
    const cacheKey = getJobOrderListCacheKey(estoreid, {
      search,
      orderStatus,
      customerId,
      jobId,
      paymentOption,
    });

    const cachedJobOrders = await redisClient.get(cacheKey);
    if (cachedJobOrders) {
      return res.status(200).json(JSON.parse(cachedJobOrders));
    }

    const filter = {};

    if (estoreid && !ObjectId.isValid(estoreid)) {
      return res.status(400).json({ message: "Invalid estoreid" });
    }
    if (customerId && !ObjectId.isValid(customerId)) {
      return res.status(400).json({ message: "Invalid customerId" });
    }
    if (jobId && !ObjectId.isValid(jobId)) {
      return res.status(400).json({ message: "Invalid jobId" });
    }
    if (paymentOption && !ObjectId.isValid(paymentOption)) {
      return res.status(400).json({ message: "Invalid paymentOption" });
    }

    if (estoreid) filter.estoreid = new ObjectId(estoreid);
    if (orderStatus) filter.orderStatus = orderStatus;
    if (customerId) filter.customerId = new ObjectId(customerId);
    if (jobId) {
      filter["jobs.jobId"] = new ObjectId(jobId);
    }
    if (paymentOption) {
      filter.paymentOption = new ObjectId(paymentOption);
    }

    let query = JobOrder.find(filter);

    if (search) {
      query = query.find({ $text: { $search: search } });
    }

    const jobOrders = await query
      .populate("customerId", "name email phone")
      .populate("jobs.jobId", "title uom price")
      .populate("paymentOption", "bankName")
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 });

    await redisClient.set(cacheKey, JSON.stringify(jobOrders), {
      EX: 86400,
    });

    res.status(200).json(jobOrders);
  } catch (error) {
    res.status(500).json({
      message: "Error fetching job orders",
      error: error.message,
    });
  }
};

const getCustomerForRequest = async (req, estoreid) => {
  if (!req.user?.email || !ObjectId.isValid(estoreid)) return null;
  return User.findOne({
    email: req.user.email,
    estoreid: new ObjectId(estoreid),
  })
    .select("_id name email phone")
    .lean();
};

const applyCatalogPrices = async (jobs, estoreid) => {
  if (!Array.isArray(jobs) || !ObjectId.isValid(estoreid)) return null;

  const jobIds = jobs.map((job) => job.jobId);
  if (jobIds.some((jobId) => !ObjectId.isValid(jobId))) return null;

  const catalogJobs = await JobList.find({
    _id: { $in: jobIds.map((jobId) => new ObjectId(jobId)) },
    estoreid: new ObjectId(estoreid),
  })
    .select("title price")
    .lean();
  const catalogById = new Map(
    catalogJobs.map((job) => [job._id.toString(), job]),
  );

  if (
    catalogJobs.length !== new Set(jobIds.map((jobId) => jobId.toString())).size
  ) {
    return null;
  }

  return jobs.map((job) => {
    const catalogJob = catalogById.get(job.jobId.toString());
    return {
      ...job,
      jobTitle: catalogJob.title,
      price: catalogJob.price,
    };
  });
};

exports.createCustomerJobOrder = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const customer = await getCustomerForRequest(req, estoreid);

  if (!customer) {
    return res.status(403).json({ message: "Customer account not found" });
  }

  req.body.customerId = customer._id.toString();
  req.body.customerName = customer.name || req.body.customerName;
  req.body.customerPhone = customer.phone || req.body.customerPhone;
  req.body.customerEmail = customer.email || req.body.customerEmail;
  req.body.createdBy = customer._id.toString();
  req.body.jobs = await applyCatalogPrices(req.body.jobs, estoreid);
  if (!req.body.jobs) {
    return res.status(400).json({ message: "One or more jobs are invalid" });
  }
  return exports.createJobOrder(req, res);
};

exports.getCustomerJobOrders = async (req, res) => {
  const customer = await getCustomerForRequest(req, req.headers.estoreid);

  if (!customer) {
    return res.status(403).json({ message: "Customer account not found" });
  }

  req.query.customerId = customer._id.toString();
  return exports.getAllJobOrders(req, res);
};

const authorizeCustomerJobOrder = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const customer = await getCustomerForRequest(req, estoreid);
  const id = req.params.id;

  if (!customer || !ObjectId.isValid(id)) {
    res.status(403).json({ message: "Job order access denied" });
    return null;
  }

  const jobOrder = await JobOrder.findOne({
    _id: new ObjectId(id),
    estoreid: new ObjectId(estoreid),
    customerId: customer._id,
  });

  if (!jobOrder) {
    res.status(404).json({ message: "Job order not found" });
    return null;
  }

  if (jobOrder.orderStatus !== "Not Processed") {
    res.status(409).json({
      message: "Only Not Processed job orders can be changed",
    });
    return null;
  }

  return customer;
};

exports.updateCustomerJobOrder = async (req, res) => {
  const customer = await authorizeCustomerJobOrder(req, res);
  if (!customer) return;

  req.body.jobs = await applyCatalogPrices(req.body.jobs, req.headers.estoreid);
  if (!req.body.jobs) {
    return res.status(400).json({ message: "One or more jobs are invalid" });
  }
  req.body.customerId = customer._id.toString();
  req.body.createdBy = customer._id.toString();
  req.body.orderStatus = "Not Processed";
  return exports.updateJobOrder(req, res);
};

exports.deleteCustomerJobOrder = async (req, res) => {
  const customer = await authorizeCustomerJobOrder(req, res);
  if (!customer) return;
  return exports.deleteJobOrder(req, res);
};

exports.getJobOrderById = async (req, res) => {
  const estoreid = req.headers.estoreid;
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    if (estoreid && !ObjectId.isValid(estoreid)) {
      return res.status(400).json({ message: "Invalid estoreid" });
    }

    const query = estoreid
      ? { _id: new ObjectId(id), estoreid: new ObjectId(estoreid) }
      : { _id: new ObjectId(id) };

    const jobOrder = await JobOrder.findOne(query)
      .populate("customerId", "name email phone")
      .populate("jobs.jobId", "title uom price")
      .populate("paymentOption", "bankName")
      .populate("createdBy", "name email");

    if (!jobOrder) {
      return res.status(404).json({ message: "Job order not found" });
    }

    res.status(200).json(jobOrder);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching job order", error: error.message });
  }
};

exports.updateJobOrder = async (req, res) => {
  const estoreid = req.headers.estoreid;
  try {
    const { id } = req.params;
    const updates = { ...req.body };
    let shouldUnsetPaymentOption = false;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    if (estoreid && !ObjectId.isValid(estoreid)) {
      return res.status(400).json({ message: "Invalid estoreid" });
    }

    if (updates.customerId !== undefined) {
      if (updates.customerId && !ObjectId.isValid(updates.customerId)) {
        return res.status(400).json({ message: "Invalid customerId" });
      }
      updates.customerId = toObjectId(updates.customerId);
    }

    if (updates.createdBy !== undefined) {
      if (updates.createdBy && !ObjectId.isValid(updates.createdBy)) {
        return res.status(400).json({ message: "Invalid createdBy" });
      }
      updates.createdBy = toObjectId(updates.createdBy);
    }

    if (updates.paymentOption !== undefined) {
      if (ObjectId.isValid(updates.paymentOption)) {
        updates.paymentOption = toObjectId(updates.paymentOption);
      } else {
        shouldUnsetPaymentOption = true;
        delete updates.paymentOption;
      }
    } else {
      shouldUnsetPaymentOption = true;
      delete updates.paymentOption;
    }

    // If jobs array is provided, normalize it and recalculate total
    if (updates.jobs && Array.isArray(updates.jobs)) {
      updates.jobs = updates.jobs.map((job) => ({
        jobId: toObjectId(job.jobId),
        jobTitle: job.jobTitle || "",
        quantity: normalizeQuantity(job.quantity),
        price: normalizePrice(job.price),
        status: job.status || "Not Processed",
        notes: job.notes || "",
      }));
      updates.totalAmount = calculateTotalAmount(updates.jobs);
    }

    const query = {
      _id: new ObjectId(id),
      ...(estoreid ? { estoreid: new ObjectId(estoreid) } : {}),
    };

    const existingJobOrder = await JobOrder.findOne(query)
      .select("orderStatus createdBy estoreid")
      .lean();

    if (!existingJobOrder) {
      return res.status(404).json({ message: "Job order not found" });
    }

    const updatePayload = {};
    if (Object.keys(updates).length > 0) {
      updatePayload.$set = updates;
    }
    if (shouldUnsetPaymentOption) {
      updatePayload.$unset = { paymentOption: "" };
    }

    const jobOrder = await JobOrder.findOneAndUpdate(query, updatePayload, {
      new: true,
      runValidators: true,
    })
      .populate("customerId", "name email phone")
      .populate("jobs.jobId", "title uom price")
      .populate("paymentOption", "bankName")
      .populate("createdBy", "name email");

    await clearOneItemCache(estoreid || jobOrder.estoreid, "jobOrders");
    await clearMultiItemsCache(estoreid || jobOrder.estoreid, "jobOrders");
    await clearSubItemCache(
      jobOrder._id.toString(),
      estoreid || jobOrder.estoreid,
      "jobOrder",
    );

    const updatedStatus = updates.orderStatus || jobOrder.orderStatus;
    const wasCompleted = isCompletedStatus(existingJobOrder.orderStatus);
    const isNowCompleted = isCompletedStatus(updatedStatus);

    if (isNowCompleted && !wasCompleted) {
      await cashFlowEntry(
        jobOrder,
        estoreid || jobOrder.estoreid,
        updates.createdBy ||
          jobOrder.createdBy?._id ||
          existingJobOrder.createdBy,
      );
    }

    res.status(200).json(jobOrder);
  } catch (error) {
    res.status(500).json({
      message: "Error updating job order",
      error: error.message,
    });
  }
};

exports.deleteJobOrder = async (req, res) => {
  const estoreid = req.headers.estoreid;
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    if (estoreid && !ObjectId.isValid(estoreid)) {
      return res.status(400).json({ message: "Invalid estoreid" });
    }

    const jobOrder = await JobOrder.findOneAndDelete({
      _id: new ObjectId(id),
      ...(estoreid ? { estoreid: new ObjectId(estoreid) } : {}),
    });

    if (!jobOrder) {
      return res.status(404).json({ message: "Job order not found" });
    }

    await clearOneItemCache(estoreid || jobOrder.estoreid, "jobOrders");
    await clearMultiItemsCache(estoreid || jobOrder.estoreid, "jobOrders");
    await clearSubItemCache(
      jobOrder._id.toString(),
      estoreid || jobOrder.estoreid,
      "jobOrder",
    );

    res.status(200).json(jobOrder);
  } catch (error) {
    res.status(500).json({
      message: "Error deleting job order",
      error: error.message,
    });
  }
};

// Add a job to existing job order
exports.addJobToOrder = async (req, res) => {
  const estoreid = req.headers.estoreid;
  try {
    const { id } = req.params;
    const { jobId, jobTitle, quantity, price, status, notes } = req.body;

    if (!jobId) {
      return res.status(400).json({ message: "Job ID is required" });
    }
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    if (estoreid && !ObjectId.isValid(estoreid)) {
      return res.status(400).json({ message: "Invalid estoreid" });
    }

    const newJob = {
      jobId: toObjectId(jobId),
      jobTitle: jobTitle || "",
      quantity: normalizeQuantity(quantity),
      price: normalizePrice(price),
      status: status || "Not Processed",
      notes: notes || "",
    };

    const query = {
      _id: new ObjectId(id),
      ...(estoreid ? { estoreid: new ObjectId(estoreid) } : {}),
    };

    const jobOrder = await JobOrder.findOneAndUpdate(
      query,
      {
        $push: { jobs: newJob },
      },
      { new: true, runValidators: true },
    );

    if (!jobOrder) {
      return res.status(404).json({ message: "Job order not found" });
    }

    // Recalculate total amount
    jobOrder.totalAmount = calculateTotalAmount(jobOrder.jobs);
    await jobOrder.save();

    const populated = await JobOrder.findById(id)
      .populate("customerId", "name email phone")
      .populate("jobs.jobId", "title uom price")
      .populate("paymentOption", "bankName")
      .populate("createdBy", "name email");

    await clearOneItemCache(estoreid || jobOrder.estoreid, "jobOrders");
    await clearMultiItemsCache(estoreid || jobOrder.estoreid, "jobOrders");
    await clearSubItemCache(
      jobOrder._id.toString(),
      estoreid || jobOrder.estoreid,
      "jobOrder",
    );

    res.status(200).json({
      message: "Job added to order successfully",
      data: populated,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error adding job to order",
      error: error.message,
    });
  }
};

// Remove a job from job order
exports.removeJobFromOrder = async (req, res) => {
  const estoreid = req.headers.estoreid;
  try {
    const { id, jobIndex } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    if (estoreid && !ObjectId.isValid(estoreid)) {
      return res.status(400).json({ message: "Invalid estoreid" });
    }

    const jobOrder = await JobOrder.findOne({
      _id: new ObjectId(id),
      ...(estoreid ? { estoreid: new ObjectId(estoreid) } : {}),
    });

    if (!jobOrder) {
      return res.status(404).json({ message: "Job order not found" });
    }

    const index = parseInt(jobIndex);
    if (isNaN(index) || index < 0 || index >= jobOrder.jobs.length) {
      return res.status(400).json({ message: "Invalid job index" });
    }

    jobOrder.jobs.splice(index, 1);

    if (jobOrder.jobs.length === 0) {
      return res.status(400).json({
        message: "Cannot remove all jobs from order. Delete the order instead.",
      });
    }

    jobOrder.totalAmount = calculateTotalAmount(jobOrder.jobs);
    await jobOrder.save();

    const populated = await JobOrder.findById(id)
      .populate("customerId", "name email phone")
      .populate("jobs.jobId", "title uom price")
      .populate("paymentOption", "bankName")
      .populate("createdBy", "name email");

    await clearOneItemCache(estoreid || jobOrder.estoreid, "jobOrders");
    await clearMultiItemsCache(estoreid || jobOrder.estoreid, "jobOrders");
    await clearSubItemCache(
      jobOrder._id.toString(),
      estoreid || jobOrder.estoreid,
      "jobOrder",
    );

    res.status(200).json({
      message: "Job removed from order successfully",
      data: populated,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error removing job from order",
      error: error.message,
    });
  }
};

// Update a specific job within an order
exports.updateJobInOrder = async (req, res) => {
  const estoreid = req.headers.estoreid;
  try {
    const { id, jobIndex } = req.params;
    const { jobId, jobTitle, quantity, price, status, notes } = req.body;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    if (estoreid && !ObjectId.isValid(estoreid)) {
      return res.status(400).json({ message: "Invalid estoreid" });
    }

    const jobOrder = await JobOrder.findOne({
      _id: new ObjectId(id),
      ...(estoreid ? { estoreid: new ObjectId(estoreid) } : {}),
    });

    if (!jobOrder) {
      return res.status(404).json({ message: "Job order not found" });
    }

    const index = parseInt(jobIndex);
    if (isNaN(index) || index < 0 || index >= jobOrder.jobs.length) {
      return res.status(400).json({ message: "Invalid job index" });
    }

    // Update only provided fields
    if (jobId !== undefined) jobOrder.jobs[index].jobId = toObjectId(jobId);
    if (jobTitle !== undefined) jobOrder.jobs[index].jobTitle = jobTitle;
    if (quantity !== undefined)
      jobOrder.jobs[index].quantity = normalizeQuantity(quantity);
    if (price !== undefined) jobOrder.jobs[index].price = normalizePrice(price);
    if (status !== undefined) jobOrder.jobs[index].status = status;
    if (notes !== undefined) jobOrder.jobs[index].notes = notes;

    jobOrder.totalAmount = calculateTotalAmount(jobOrder.jobs);
    await jobOrder.save();

    const populated = await JobOrder.findById(id)
      .populate("customerId", "name email phone")
      .populate("jobs.jobId", "title uom price")
      .populate("paymentOption", "bankName")
      .populate("createdBy", "name email");

    await clearOneItemCache(estoreid || jobOrder.estoreid, "jobOrders");
    await clearMultiItemsCache(estoreid || jobOrder.estoreid, "jobOrders");
    await clearSubItemCache(
      jobOrder._id.toString(),
      estoreid || jobOrder.estoreid,
      "jobOrder",
    );

    res.status(200).json({
      message: "Job updated successfully",
      data: populated,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error updating job in order",
      error: error.message,
    });
  }
};
