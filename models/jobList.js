const mongoose = require("mongoose");
const { ObjectId } = mongoose.Schema;
const conn = require("../dbconnect/gratis");

const jobListSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      index: true,
      uppercase: true,
      trim: true,
    },
    images: {
      type: Array,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
    },
    price: { type: Number, default: 0 },
    uom: {
      type: String,
      enum: [
        "each",
        "unit",
        "point",
        "hour",
        "hr",
        "h",
        "minute",
        "min",
        "day",
        "d",
        "week",
        "wk",
        "month",
        "mo",
        "session",
        "visit",
        "call",
        "ticket",
        "task",
        "job",
        "service",
        "project",
        "fixed",
        "flat",
        "package",
        "mile",
        "mi",
        "km",
      ],
      default: "each",
      trim: true,
    },
    isActive: { type: Boolean, default: true },
    createdBy: {
      type: ObjectId,
      ref: "GratisUser",
    },
    estoreid: {
      type: ObjectId,
      ref: "GratisEstore",
    },
  },
  { timestamps: true },
);

// unique only within the same estore
jobListSchema.index({ estoreid: 1, code: 1 }, { unique: true });

// text index for search
jobListSchema.index(
  { title: "text", description: "text", code: "text" },
  { weights: { title: 5, description: 2, code: 1 } },
);

const JobList = conn.model("GratisJobList", jobListSchema);

module.exports = JobList;
