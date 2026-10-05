const mongoose = require("mongoose");

let conn;

try {
  conn = mongoose.createConnection(process.env.GRATIS_DATABASE);
  console.log(`DB CONNECTED TO ${process.env.GRATIS_DATABASE}`);
} catch (err) {
  console.log(`DB CONNECTION ERR ${err}`);
}

module.exports = conn;
