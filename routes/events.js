const express = require("express");
const router = express.Router();
const { sendPurchase, sendAnyEvent } = require("../controllers/events");

router.post("/facebook/purchase", sendPurchase);
router.post("/facebook/anyevent", sendAnyEvent);

module.exports = router;
