const ObjectId = require("mongoose").Types.ObjectId;

const Cashflow = require("../models/cashflow");
const User = require("../models/user");

const normalizeDescription = (description) => {
  if (description === undefined || description === null) return undefined;
  return String(description).trim();
};

const createCashflowEntry = async ({
  estoreid,
  createdBy,
  type,
  referenceid,
  amount,
  date,
  bankid,
  balanceInflow,
  balanceOutflow,
  description,
}) => {
  if (!ObjectId.isValid(estoreid)) {
    throw new Error("Invalid estoreid");
  }

  if (!ObjectId.isValid(referenceid)) {
    throw new Error("Invalid referenceid");
  }

  if (bankid && !ObjectId.isValid(bankid)) {
    throw new Error("Invalid bankid");
  }

  if (!ObjectId.isValid(createdBy)) {
    throw new Error("Invalid createdBy");
  }

  const cashflow = new Cashflow({
    type,
    referenceid: new ObjectId(referenceid),
    amount,
    description: normalizeDescription(description),
    date: date || new Date(),
    bankid: bankid ? new ObjectId(bankid) : undefined,
    balanceInflow,
    balanceOutflow,
    estoreid: new ObjectId(estoreid),
    createdBy: new ObjectId(createdBy),
  });

  await cashflow.save();
  return cashflow;
};

const buildCashflowPayload = (body = {}) => ({
  type: body.type,
  referenceid: body.referenceid,
  amount: body.amount,
  date: body.date,
  bankid: body.bankid,
  balanceInflow: body.balanceInflow,
  balanceOutflow: body.balanceOutflow,
  description: normalizeDescription(body.description),
});

// Create Cashflow
exports.createCashflow = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const email = req.user?.email;
  try {
    if (!email) {
      return res.status(400).json({ error: "User email is required" });
    }

    const user = await User.findOne({ email }).exec();
    if (!user || !user._id) {
      return res.status(400).json({ error: "User not found" });
    }

    const canOverrideCreatedBy = user.role === "admin";
    let createdBy = user._id;

    if (req.body.createdBy !== undefined) {
      if (!canOverrideCreatedBy) {
        return res
          .status(403)
          .json({ error: "Not authorized to set createdBy" });
      }

      if (!ObjectId.isValid(req.body.createdBy)) {
        return res.status(400).json({ error: "Invalid createdBy" });
      }

      createdBy = new ObjectId(req.body.createdBy);
    }

    const cashflow = await createCashflowEntry({
      ...buildCashflowPayload(req.body),
      estoreid,
      createdBy,
    });
    res.json(cashflow);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.createCashflowEntry = createCashflowEntry;

// Get All Cashflows
exports.getCashflows = async (req, res) => {
  const estoreid = req.headers.estoreid;
  try {
    if (!ObjectId.isValid(estoreid)) {
      return res.status(400).json({ error: "Invalid estoreid" });
    }

    const query = { estoreid: new ObjectId(estoreid) };
    const hasPagination =
      req.query.page !== undefined || req.query.pageSize !== undefined;

    if (!hasPagination) {
      const cashflows = await Cashflow.find(query).populate("createdBy").sort({
        date: -1,
        createdAt: -1,
      });
      return res.json(cashflows);
    }

    const requestedPage = Number(req.query.page);
    const requestedPageSize = Number(req.query.pageSize);
    const page =
      Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const pageSize =
      Number.isFinite(requestedPageSize) && requestedPageSize > 0
        ? Math.min(requestedPageSize, 100)
        : 10;
    const skip = (page - 1) * pageSize;

    const [total, cashflows] = await Promise.all([
      Cashflow.countDocuments(query),
      Cashflow.find(query)
        .populate("createdBy")
        .sort({ date: -1, createdAt: -1 })
        .skip(skip)
        .limit(pageSize),
    ]);

    return res.json({
      data: cashflows,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Update Cashflow
exports.updateCashflow = async (req, res) => {
  const { id } = req.params;
  const estoreid = req.headers.estoreid;
  try {
    if (!ObjectId.isValid(estoreid) || !ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid cashflow or estore id" });
    }

    if (req.body.referenceid && !ObjectId.isValid(req.body.referenceid)) {
      return res.status(400).json({ error: "Invalid referenceid" });
    }

    if (req.body.bankid && !ObjectId.isValid(req.body.bankid)) {
      return res.status(400).json({ error: "Invalid bankid" });
    }

    const payload = buildCashflowPayload(req.body);
    if (payload.referenceid) {
      payload.referenceid = new ObjectId(payload.referenceid);
    }
    if (payload.bankid) {
      payload.bankid = new ObjectId(payload.bankid);
    }

    const cashflow = await Cashflow.findOneAndUpdate(
      {
        _id: new ObjectId(id),
        estoreid: new ObjectId(estoreid),
      },
      payload,
      {
        new: true,
        runValidators: true,
      },
    );

    if (!cashflow) {
      return res.status(404).json({ error: "Cashflow not found" });
    }

    res.json(cashflow);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Delete Cashflow
exports.deleteCashflow = async (req, res) => {
  const { createdBy } = req.params;
  const estoreid = req.headers.estoreid;
  try {
    if (!ObjectId.isValid(estoreid) || !ObjectId.isValid(createdBy)) {
      return res.status(400).json({ error: "Invalid createdBy or estore id" });
    }

    const result = await Cashflow.deleteMany({
      createdBy: new ObjectId(createdBy),
      estoreid: new ObjectId(estoreid),
    });

    if (!result.deletedCount) {
      return res.status(404).json({ error: "Cashflow not found" });
    }

    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
