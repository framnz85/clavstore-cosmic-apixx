const mongoose = require("mongoose");
const conn = require("../dbconnect/address");

const addiv2Schema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    minlength: 2,
    maxlength: 255,
  },
  couid: {
    type: Object,
    required: true,
  },
  adDivId1: {
    type: Object,
    required: true,
  },
});

addiv2Schema.index({ name: "text" });

module.exports = conn.model("addiv2", addiv2Schema);
