const mongoose = require("mongoose");
const conn = require("../dbconnect/gratis");

const myAddiv2Schema = new mongoose.Schema({
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
  adDivId1: {
    type: Object,
    required: true,
  },
});

myAddiv2Schema.index({ name: "text" });

module.exports = conn.model("GratisMyaddiv2", myAddiv2Schema);
