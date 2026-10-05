const mongoose = require("mongoose");
const conn = require("../dbconnect/gratis");

const myAddiv1Schema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    minlength: 2,
    maxlength: 255,
  },
  estoreid: {
    type: Object,
    required: true,
  },
  couid: {
    type: Object,
    required: true,
  },
});

myAddiv1Schema.index({ name: "text" });

module.exports = conn.model("GratisMyaddiv1", myAddiv1Schema);
