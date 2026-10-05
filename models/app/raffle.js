const mongoose = require("mongoose");
const { ObjectId } = mongoose.Schema;
const conn = require("../../dbconnect/gratis");

const raffleSchema = new mongoose.Schema(
  {
    estoreid: ObjectId,
    owner: { type: ObjectId, ref: "GratisUser" },
    orderid: { type: ObjectId, ref: "GratisOrder" },
    raffleDate: Date,
  },
  { timestamps: true }
);

const Raffle = conn.model("GratisRaffle", raffleSchema);

module.exports = Raffle;
