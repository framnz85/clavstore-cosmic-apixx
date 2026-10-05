const mongoose = require("mongoose");
const { ObjectId } = mongoose.Schema;
const conn = require("../dbconnect/gratis");

const jobOrderSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      index: true,
      uppercase: true,
      trim: true,
    },
    customerId: {
      type: ObjectId,
      ref: "GratisUser",
    },
    customerName: {
      type: String,
      trim: true,
      index: true,
    },
    customerPhone: {
      type: String,
      trim: true,
    },
    customerEmail: {
      type: String,
      trim: true,
    },
    jobs: [
      {
        jobId: {
          type: ObjectId,
          ref: "GratisJobList",
        },
        jobTitle: {
          type: String,
          trim: true,
        },
        quantity: {
          type: Number,
          default: 1,
          min: 1,
        },
        price: {
          type: Number,
          default: 0,
        },
        status: {
          type: String,
          default: "Not Processed",
          enum: ["Not Processed", "Processing", "Completed", "Cancelled"],
        },
        notes: {
          type: String,
          trim: true,
        },
      },
    ],
    totalAmount: {
      type: Number,
      default: 0,
    },
    paymentOption: {
      type: ObjectId,
      ref: "GratisPayment",
    },
    orderStatus: {
      type: String,
      default: "Not Processed",
      enum: ["Not Processed", "Processing", "Completed", "Cancelled"],
    },
    date: {
      type: Date,
      default: Date.now,
    },
    dueDate: {
      type: Date,
    },
    createdBy: {
      type: ObjectId,
      ref: "GratisUser",
    },
    estoreid: {
      type: ObjectId,
      ref: "GratisEstore",
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true },
);

jobOrderSchema.index(
  {
    code: "text",
    customerName: "text",
    "jobs.jobTitle": "text",
  },
  {
    weights: {
      code: 5,
      customerName: 3,
      "jobs.jobTitle": 4,
    },
  },
);

const JobOrder = conn.model("GratisJobOrder", jobOrderSchema);

module.exports = JobOrder;
