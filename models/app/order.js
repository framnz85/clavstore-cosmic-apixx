const mongoose = require("mongoose");
const { ObjectId } = mongoose.Schema;
const conn = require("../../dbconnect/gratis");

const orderSchema = new mongoose.Schema(
  {
    orderCode: {
      type: String,
    },
    orderType: {
      type: String,
      default: "web",
      enum: ["web", "pos", "void"],
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
        variant: ObjectId,
        rated: { type: Boolean, default: false },
        excess: { type: Boolean, default: false },
      },
    ],
    paymentOption: {
      type: ObjectId,
      ref: "GratisPayment",
    },
    orderStatus: {
      type: String,
      default: "Not Processed",
      enum: [
        "Not Processed",
        "Waiting Payment",
        "Processing",
        "For Purchase",
        "Delivering",
        "Pickup",
        "Cancelled",
        "Void",
        "Credit",
        "Completed",
        "Purchased",
        "Received",
      ],
    },
    deliveryPrefer: {
      type: String,
      default: "Deliver",
      enum: ["Deliver", "Pickup"],
    },
    deliverInstruct: {
      type: String,
    },
    statusHistory: [{ status: String, remarks: String, date: Date }],
    cartTotal: Number,
    delfee: Number,
    discount: Number,
    servefee: Number,
    addDiscount: Number,
    grandTotal: Number,
    cash: Number,
    duedate: Date,
    createdBy: { type: ObjectId, ref: "GratisUser" },
    orderedBy: { type: ObjectId, ref: "GratisUser" },
    orderedName: String,
    estoreid: { type: ObjectId, ref: "GratisEstore" },
    delAddress: String,
    orderNotes: String,
    customDetails: [
      {
        description: String,
        value: String,
      },
    ],
    customDetails2: [
      {
        description: String,
        value: String,
      },
    ],
    supplierid: { type: ObjectId, ref: "GratisEstore" },
    supplier: String,
    billTo: String,
    shipTo: String,
  },
  { timestamps: true },
);

orderSchema.index(
  {
    orderCode: "text",
    orderedName: "text",
  },
  {
    weights: {
      orderCode: 5,
      orderedName: 3,
    },
  },
);

const Order = conn.model("GratisOrder", orderSchema);

module.exports = Order;
