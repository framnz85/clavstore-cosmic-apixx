const mongoose = require("mongoose");
const conn = require("../dbconnect/address");

const addiv1Schema = new mongoose.Schema({
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
});

addiv1Schema.index({ name: "text" });

module.exports = conn.model("addiv1", addiv1Schema);
