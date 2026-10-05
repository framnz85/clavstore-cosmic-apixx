const ObjectId = require("mongoose").Types.ObjectId;
const { Xendit } = require("xendit-node");

const Payment = require("../models/payment");
const Order = require("../models/order");

exports.getPayment = async (req, res) => {
  const payid = req.params.payid;
  const estoreid = req.headers.estoreid;
  try {
    const payment = await Payment.findOne({
      _id: new ObjectId(payid),
      estoreid: new ObjectId(estoreid),
    });
    res.json(payment);
  } catch (error) {
    res.json({ err: "Getting payment fails. " + error.message });
  }
};

exports.getPayments = async (req, res) => {
  const estoreid = req.headers.estoreid;
  try {
    const payments = await Payment.find({
      estoreid: new ObjectId(estoreid),
      purpose: "basic",
    });
    res.json(payments);
  } catch (error) {
    res.json({ err: "Getting payments fails. " + error.message });
  }
};

exports.payXendit = async (req, res) => {
  const orderCode = req.body.orderCode;
  const grandTotal = req.body.grandTotal;
  const successUrl = req.body.successUrl;

  try {
    const order = await Order.findOne({ orderCode })
      .populate("_id paymentOption")
      .select("paymentOption")
      .exec();
    const { paymentOption = {} } = order;

    const xendit = new Xendit({ secretKey: paymentOption.accNumber });
    const { PaymentRequest } = xendit;

    const data = {
      referenceId: `order-${orderCode}`,
      currency: "PHP",
      amount: grandTotal.toFixed(2),
      country: "PH",
      paymentMethod: {
        type: "EWALLET",
        reusability: "ONE_TIME_USE",
        ewallet: {
          channelCode: "SHOPEEPAY",
          channelProperties: {
            successReturnUrl: successUrl + "/" + order._id + "?forprocess=1",
          },
        },
      },
    };

    const response = await PaymentRequest.createPaymentRequest({
      data,
    });
    res.json(response.actions[0].url);
  } catch (error) {
    res.json({ err: "Getting payments fails. " + error.message });
  }
};

exports.addPayment = async (req, res) => {
  const estoreid = req.headers.estoreid;
  try {
    const payment = new Payment({ ...req.body, estoreid });
    await payment.save();
    res.json(payment);
  } catch (error) {
    res.json({ err: "Adding payment fails. " + error.message });
  }
};

exports.updatePayment = async (req, res) => {
  const payid = req.params.payid;
  const estoreid = req.headers.estoreid;
  try {
    const payment = await Payment.findOneAndUpdate(
      {
        _id: new ObjectId(payid),
        estoreid: new ObjectId(estoreid),
      },
      req.body,
      {
        new: true,
      }
    ).exec();
    res.json(payment);
  } catch (error) {
    res.json({ err: "Updating payment fails. " + error.message });
  }
};

exports.removePayment = async (req, res) => {
  const payid = req.params.payid;
  const estoreid = req.headers.estoreid;
  try {
    const payment = await Payment.findOneAndDelete({
      _id: new ObjectId(payid),
      estoreid: new ObjectId(estoreid),
    }).exec();
    if (payment) {
      res.json(payment);
    } else {
      res.json({ ok: true });
    }
  } catch (error) {
    res.json({ err: "Deleting payment fails. " + error.message });
  }
};
