const mongoose = require("mongoose");
const conn = require("../dbconnect/address");

const salesnotifySchema = new mongoose.Schema({
  image: String,
  link: String,
  alt: String,
  target: String,
  day: Number,
});

module.exports = conn.model("salesnotify", salesnotifySchema);
