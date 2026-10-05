const mongoose = require("mongoose");
const { ObjectId } = mongoose.Schema;
const conn = require("../dbconnect/super");
const Package = require("./superPackage");
const Payment = require("./superPayment");

const billingSchema = new mongoose.Schema(
  {
    estoreid: ObjectId,
    package: {
      type: ObjectId,
      ref: Package,
    },
    userid: ObjectId,
    billType: {
      type: String,
      enum: ["downpayment", "monthly"],
      default: "downpayment",
    },
    packageDesc: String,
    totalAmount: Number,
    bank: {
      type: ObjectId,
      ref: Payment,
    },
    status: {
      type: String,
      enum: ["Unpaid", "Pending", "Paid"],
      default: "Unpaid",
    },
    payDeadline: Date,
    billStatus: {
      type: String,
      enum: ["Not Billed", "Pending", "Billed"],
      default: "Not Billed",
    },
    billDeadline: Date,
    referenceNum: String,
    datePaid: Date,
  },
  { timestamps: true }
);

billingSchema.index({ name: "text" });

const Billing = conn.model("GratisBilling", billingSchema);

module.exports = Billing;
