const mongoose = require("mongoose");
const { ObjectId } = mongoose.Schema;
const conn = require("../../dbconnect/gratis");
const Estore = require("../../models/estore");

const productSchema = new mongoose.Schema(
  {
    estoreid: {
      type: ObjectId,
      ref: Estore,
    },
    title: {
      type: String,
      trim: true,
      required: true,
      maxlength: 128,
      text: true,
    },
    slug: {
      type: String,
      lowercase: true,
    },
    description: {
      type: String,
      maxlength: 2000,
      text: true,
    },
    supplierPrice: {
      type: Number,
      trim: true,
      maxlength: 32,
    },
    markup: {
      type: Number,
      trim: true,
      maxlength: 32,
      default: 0,
    },
    markupType: {
      type: String,
      enum: ["percent", "number"],
      default: "percent",
    },
    discount: {
      type: Number,
      trim: true,
      maxlength: 32,
      default: 0,
    },
    discounttype: {
      type: String,
      enum: ["percent", "number"],
      default: "percent",
    },
    price: {
      type: Number,
      required: true,
      trim: true,
      maxlength: 32,
    },
    wprice: Number,
    wcount: Number,
    category: {
      type: ObjectId,
      ref: "GratisCategory",
    },
    barcode: {
      type: String,
      maxlength: 32,
      unique: true,
    },
    quantity: {
      type: Number,
      default: 0,
    },
    segregate: {
      type: Boolean,
      default: false,
    },
    sold: {
      type: Number,
      default: 0,
    },
    images: {
      type: Array,
    },
    activate: {
      type: Boolean,
      default: true,
    },
    waiting: Object,
  },
  { timestamps: true },
);

productSchema.index(
  { title: "text", description: "text", slug: "text " },
  {
    weights: {
      title: 5,
      description: 3,
      slug: 1,
    },
  },
);

const Product = conn.model("GratisProduct", productSchema);

module.exports = Product;
