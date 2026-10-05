const mongoose = require("mongoose");
const conn = require("../dbconnect/gratis");

const myCountrySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    minlength: 2,
    maxlength: 255,
  },
  countryCode: {
    type: String,
    required: true,
    minlength: 2,
    maxlength: 3,
  },
  currency: {
    type: String,
    required: true,
    minlength: 1,
    maxlength: 3,
  },
  adDivName1: {
    type: String,
    minlength: 2,
    maxlength: 255,
  },
  adDivName2: {
    type: String,
    minlength: 2,
    maxlength: 255,
  },
  adDivName3: {
    type: String,
    minlength: 2,
    maxlength: 255,
  },
  estoreid: {
    type: Object,
    required: true,
  },
});

myCountrySchema.index({ name: "text" });

module.exports = conn.model("GratisMyCountry", myCountrySchema);
