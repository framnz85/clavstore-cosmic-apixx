const mongoose = require("mongoose");
const { ObjectId } = mongoose.Schema;
const conn = require("../dbconnect/gratis");
const Estore = require("./estore");
const User = require("./user");

const pointsSchema = new mongoose.Schema(
  {
    estoreid: {
      type: ObjectId,
      ref: Estore,
      required: true,
    },
    userid: {
      type: ObjectId,
      ref: User,
      required: true,
    },
    points: {
      type: Number,
      default: 0,
      min: 0,
    },
    redeem: {
      type: Number,
      default: 0,
      min: 0,
    },
    orderid: {
      type: ObjectId,
      ref: "GratisOrder",
    },
  },
  { timestamps: true },
);

const Points = conn.model("GratisPoints", pointsSchema);

module.exports = Points;
