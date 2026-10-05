const mongoose = require("mongoose");
const { ObjectId } = mongoose.Schema;
const conn = require("../../dbconnect/gratis");
const Estore = require("../../models/estore");

const userSchema = new mongoose.Schema(
  {
    refid: ObjectId,
    refCommission: Number,
    estoreid: {
      type: ObjectId,
      ref: Estore,
    },
    name: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      index: true,
      unique: true,
    },
    emailConfirm: {
      type: Boolean,
      default: false,
    },
    password: {
      type: String,
      required: true,
    },
    showPass: String,
    picture: String,
    role: {
      type: String,
      default: "customer",
      enum: ["admin", "moderator", "cashier", "customer"],
    },
    address: {
      details: String,
      country: {},
      addiv1: {},
      addiv2: {},
      addiv3: {},
    },
    homeAddress: {
      details: String,
      country: {},
      addiv1: {},
      addiv2: {},
      addiv3: {},
    },
    addInstruct: String,
    verifyCode: String,
    nextSteps: {
      type: Number,
      default: 0,
    },
    endPoint: [
      {
        type: String,
      },
    ],
    dayNotify: {
      type: Number,
      default: 0,
    },
    daySales: {
      type: Number,
      default: 0,
    },
    superAdmin: Boolean,
    resellid: ObjectId,
    withdraw: [
      {
        bank: String,
        accountName: String,
        accountNumber: String,
        amount: Number,
        date: Date,
      },
    ],
    deleteAccount: { request: Boolean, reasons: Array },
  },
  { timestamps: true },
);

userSchema.index(
  {
    name: "text",
    email: "text",
    phone: "text",
    address: "text",
  },
  {
    weights: {
      name: 5,
      email: 3,
      phone: 2,
      address: 1,
    },
  },
);

const User = conn.model("GratisUser", userSchema);

module.exports = User;
