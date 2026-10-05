const mongoose = require("mongoose");
const { ObjectId } = mongoose.Schema;
const conn = require("../dbconnect/gratis");

const cartSchema = new mongoose.Schema(
  {
    estoreid: ObjectId,
    orderType: {
      type: String,
      default: "checkout",
      enum: ["checkout", "pos"],
    },
    products: [
      {
        product: {
          type: ObjectId,
          ref: "GratisProduct",
        },
        supplierPrice: Number,
        price: Number,
        count: Number,
        excessCount: { type: Number, default: 0 },
        excess: { type: Boolean, default: false },
      },
    ],
    cartTotal: Number,
    discount: Number,
    servefee: Number,
    grandTotal: Number,
    orderedBy: { type: ObjectId, ref: "GratisUser" },
  },
  { timestamps: true }
);

const Cart = conn.model("GratisCart", cartSchema);

module.exports = Cart;
