const ObjectId = require("mongoose").Types.ObjectId;

const Billing = require("../models/superBilling");
const Estore = require("../models/superEstore");
const User = require("../models/user");
const Package = require("../models/superPackage");
const Payment = require("../models/superPayment");
const EstoreNormal = require("../models/estore");

exports.latestSuperBill = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const packid = req.params.packid;

  try {
    let latest = {};
    if (packid === "all") {
      latest = await Billing.findOne({
        estoreid: new ObjectId(estoreid),
        status: "Unpaid",
      }).sort({ payDeadline: 1 });
    } else {
      latest = await Billing.findOne({
        estoreid: new ObjectId(estoreid),
        package: new ObjectId(packid),
        status: "Unpaid",
      }).sort({ payDeadline: 1 });
    }
    if (latest) {
      res.json(latest);
    } else {
      res.json({ ok: true });
    }
  } catch (error) {
    res.json({ err: "Getting latest bill fails. " + error.message });
  }
};

exports.getHostingSuperBill = async (req, res) => {
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
      futureDate.setDate(futureDate.getDate() + deadDuration),
    ).toLocaleString("en-us", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
    });
    futureDate = new Date();
    const billDeadline = new Date(
      futureDate.setDate(futureDate.getDate() + deadDuration + 31),
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

exports.getSuperBillings = async (req, res) => {
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

exports.getSuperPayment = async (req, res) => {
  const payid = req.params.payid;
  const estoreid = req.headers.estoreid;
  try {
    const payment = await Payment.findOne({
      _id: new ObjectId(payid),
      estoreid: new ObjectId(estoreid),
    });
    res.json(payment);
  } catch (error) {
    res.json({ err: "Getting payment fails. " + error.message });
  }
};

exports.getSuperPackage = async (req, res) => {
  const id = req.params.id;
  const branchid = req.params.branchid;
  const packid = req.params.packid;
  let package = {};

  try {
    if (ObjectId.isValid(packid)) {
      package = await Package.findOne({
        _id: new ObjectId(packid),
      }).exec();
    } else {
      package = await Package.findOne({
        defaultPackage: { $ne: "basic" },
        default: true,
      }).exec();
    }
    if (package) {
      const estore = await EstoreNormal.findOne({
        _id: new ObjectId(branchid),
      })
        .populate("country")
        .exec();
      const payments = await Payment.find({
        estoreid: new ObjectId(id),
        purpose: { $ne: "basic" },
      }).exec();
      res.json({
        ...package._doc,
        currency: estore.country.currency,
        reseller: estore.reseller,
        payments,
      });
    } else {
      res.json({
        err: "Error getting the package",
      });
    }
  } catch (error) {
    res.json({ err: "Fetching reseller information fails. " + error.message });
  }
};

exports.getSuperPackages = async (req, res) => {
  const finalPackages = [];
  const estoreid = req.headers.estoreid;
  const packDefault = req.params.packDefault;
  try {
    let packages = [];
    if (packDefault === "all") {
      packages = await Package.find().exec();
    } else {
      packages = await Package.find({
        defaultPackage: packDefault,
      }).exec();
    }
    const estore = await Estore.findOne({
      _id: new ObjectId(estoreid),
    }).exec();
    for (let i = 0; i < packages.length; i++) {
      const payments = await Payment.find({
        estoreid: new ObjectId(estoreid),
        purpose: packages[i].defaultPackage,
      }).exec();
      finalPackages.push({
        ...packages[i]._doc,
        payments,
        reseller: estore.reseller,
      });
    }
    res.json(finalPackages);
  } catch (error) {
    res.json({ err: "Getting packages fails. " + error.message });
  }
};
