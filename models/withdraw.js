const mongoose = require("mongoose");
const { ObjectId } = mongoose.Schema;
const conn = require("../dbconnect/gratis");
const User = require("./user");
const Estore = require("./estore");

const withdrawSchema = new mongoose.Schema(
  {
    userid: {
      type: ObjectId,
      ref: User,
    },
    estoreid: {
      type: ObjectId,
      ref: Estore,
    },
    bank: String,
    accountName: String,
    accountNumber: String,
    amount: Number,
    details: String,
    status: {
      type: String,
      enum: ["Disapproved", "Pending", "Approved"],
      default: "Pending",
    },
  },
  { timestamps: true }
);

withdrawSchema.index({ name: "text" });

const Withdraw = conn.model("GratisWithdraw", withdrawSchema);

module.exports = Withdraw;
