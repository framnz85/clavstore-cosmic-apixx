const mongoose = require("mongoose");
const { ObjectId } = mongoose.Schema;
const conn = require("../dbconnect/gratis");

const cashflowSchema = new mongoose.Schema(
  {
    estoreid: {
      type: ObjectId,
      ref: "GratisEstore",
      required: true,
    },
    type: {
      type: String,
      enum: ["inflow", "outflow", "web", "pos", "jobs"],
      required: true,
    },
    description: {
      type: String,
    },
    referenceid: {
      type: ObjectId,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    bankid: {
      type: ObjectId,
      ref: "GratisPayment",
    },
    balanceInflow: {
      type: Number,
      default: 0,
    },
    balanceOutflow: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: ObjectId,
      ref: "GratisUser",
    },
  },
  { timestamps: true },
);

const Cashflow = conn.model("GratisCashflow", cashflowSchema);

module.exports = Cashflow;
