const ObjectId = require("mongoose").Types.ObjectId;

const Billing = require("../models/billing");
const User = require("../models/user");
const Package = require("../models/package");
const Payment = require("../models/payment");

exports.latestBill = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const packid = req.params.packid;

  try {
    let latest = {};
    if (packid === "all") {
      latest = await Billing.findOne({
        estoreid: new ObjectId(estoreid),
        status: { $in: ["Unpaid", "Pending"] },
      }).sort({ payDeadline: 1 });
    } else {
      latest = await Billing.findOne({
        estoreid: new ObjectId(estoreid),
        package: new ObjectId(packid),
        status: { $in: ["Unpaid", "Pending"] },
      }).sort({ payDeadline: 1 });
    }
    if (latest) {
      res.json(latest);
    } else {
      res.json({ ok: true });
    }
  } catch (error) {
    console.log(error.message);
    res.json({ err: "Getting latest bill fails. " + error.message });
  }
};

exports.getHostingBill = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const resellid = req.headers.resellid;
  const packid = req.headers.packid;
  const email = req.user.email;
  let bank = "";
  let deadDuration = 0;

  try {
    const user = await User.findOne({ email }).exec();
    const package = await Package.findOne({ _id: new ObjectId(packid) });
    const latestBill = await Billing.findOne({
      estoreid: new ObjectId(estoreid),
    }).sort({ payDeadline: -1 });
    let futureDate = new Date();
    const latestHostBill = await Billing.findOne({
      estoreid: new ObjectId(estoreid),
      package: new ObjectId(packid),
      billType: "monthly",
    }).sort({ payDeadline: -1 });
    if (latestHostBill) {
      futureDate = new Date();
      const latestpayDeadline = new Date(latestHostBill.payDeadline);
      const timeDifference = latestpayDeadline.getTime() - futureDate.getTime();
      const daysDifference = Math.round(timeDifference / (1000 * 3600 * 24));
      if (daysDifference > 0) {
        deadDuration = daysDifference + 31;
      } else {
        deadDuration = 31;
      }
    } else {
      deadDuration = (package.hostingStart ? package.hostingStart : 1) * 31;
    }
    futureDate = new Date();
    const payDeadline = new Date(
      futureDate.setDate(futureDate.getDate() + deadDuration)
    ).toLocaleString("en-us", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
    });
    futureDate = new Date();
    const billDeadline = new Date(
      futureDate.setDate(futureDate.getDate() + deadDuration + 31)
    ).toLocaleString("en-us", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
    });
    if (latestBill && latestBill.bank) {
      bank = latestBill.bank;
    } else {
      const onePayment = await Payment.findOne({
        estoreid: new ObjectId(resellid),
      });
      bank = onePayment._id;
    }

    const billing = new Billing({
      estoreid: new ObjectId(estoreid),
      package: new ObjectId(packid),
      userid: user._id,
      billType: "monthly",
      packageDesc: package.name + " Monthly Hosting Fee",
      totalAmount: package.hostingFee,
      bank,
      status: "Unpaid",
      payDeadline,
      billStatus: "Not Billed",
      billDeadline,
    });
    await billing.save();
    res.json(billing);
  } catch (error) {
    res.json({ err: "Getting billings fails. " + error.message });
  }
};

exports.getBillings = async (req, res) => {
  const estoreid = req.headers.estoreid;

  try {
    const billings = await Billing.find({
      estoreid: new ObjectId(estoreid),
    })
      .populate("package")
      .populate("bank")
      .sort({ payDeadline: 1 });
    res.json(billings);
  } catch (error) {
    res.json({ err: "Getting billings fails. " + error.message });
  }
};

exports.addBilling = async (req, res) => {
  const values = req.body;
  const email = req.user.email;
  let data = {};
  let billing = {};
  try {
    const user = await User.findOne({ email }).exec();
    const checkExistBill = await Billing.findOne({
      estoreid: new ObjectId(values[0].estoreid),
      userid: new ObjectId(user._id),
      package: new ObjectId(values[0].package),
      status: { $in: ["Unpaid", "Pending"] },
    });
    if (checkExistBill) {
      res.json({
        ok: true,
        message: "You have already pending order for this account",
      });
    } else {
      for (let i = 0; i < values.length; i++) {
        data = {
          ...values[i],
          estoreid: new ObjectId(values[i].estoreid),
          userid: new ObjectId(user._id),
          package: new ObjectId(values[i].package),
        };
        billing = new Billing(data);
        await billing.save();
      }
      res.json({ ok: true });
    }
  } catch (error) {
    res.json({ err: "Adding billing fails. " + error.message });
  }
};

exports.updateBilling = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const billid = req.body.billid;
  let data = req.body;

  try {
    delete data.billid;
    if (data && data.bank) {
      data = { ...data, bank: new ObjectId(data.bank) };
    }
    const checkExistBill = await Billing.findOne({
      _id: new ObjectId(billid),
      estoreid: new ObjectId(estoreid),
    });
    if (checkExistBill && checkExistBill.status === "Paid") {
      data = { ...data, status: "Paid" };
    }
    const result = await Billing.findOneAndUpdate(
      {
        _id: new ObjectId(billid),
        estoreid: new ObjectId(estoreid),
      },
      data,
      { new: true }
    );
    res.json(result);
  } catch (error) {
    res.json({ err: "Getting billings fails. " + error.message });
  }
};
