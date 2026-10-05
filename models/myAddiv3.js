const mongoose = require("mongoose");
const conn = require("../dbconnect/gratis");

const myAddiv3Schema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    minlength: 2,
    maxlength: 255,
  },
  zipcode: {
    type: String,
    default: "",
  },
  estoreid: {
    type: Object,
    required: true,
  },
  couid: {
    type: Object,
    required: true,
  },
  adDivId1: {
    type: Object,
    required: true,
  },
  adDivId2: {
    type: Object,
    required: true,
  },
  minorder: String,
  maxorder: String,
  delfee: { type: String, default: "0" },
  delfeetype: {
    type: String,
    enum: ["percent", "number"],
    default: "percent",
  },
  discount: { type: String, default: "0" },
  discounttype: {
    type: String,
    enum: ["percent", "number"],
    default: "percent",
  },
  deltime: String,
  deltimetype: {
    type: String,
    enum: ["days", "hours"],
    default: "days",
  },
  servefee: String,
  servefeetype: {
    type: String,
    enum: ["percent", "number"],
    default: "percent",
  },
  referral: String,
  referraltype: {
    type: String,
    enum: ["percent", "number"],
    default: "percent",
  },
  maxMass: { type: Number, default: 9999999 },
  massPrice: { type: Number, default: 9999999 },
  maxVolume: { type: Number, default: 9999999 },
  volumePrice: { type: Number, default: 9999999 },
});

myAddiv3Schema.index({ name: "text" });

module.exports = conn.model("GratisMyaddiv3", myAddiv3Schema);
