const mongoose = require("mongoose");

let conn;

try {
  conn = mongoose.createConnection(process.env.SUPER_DATABASE);
  console.log(`DB CONNECTED TO ${process.env.SUPER_DATABASE}`);
} catch (err) {
  console.log(`DB CONNECTION ERR ${err}`);
}

module.exports = conn;
