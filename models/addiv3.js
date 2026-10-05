const mongoose = require("mongoose");
const conn = require("../dbconnect/address");

const addiv3Schema = new mongoose.Schema({
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
});

addiv3Schema.index({ name: "text" });

module.exports = conn.model("addiv3", addiv3Schema);
