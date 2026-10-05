const ObjectId = require("mongoose").Types.ObjectId;

const User = require("../models/user");
const Withdraw = require("../models/withdraw");

exports.getDashboard = async (req, res) => {
  const email = req.user.email;
  const estoreid = req.headers.estoreid;

  try {
    const user = await User.findOne({
      email,
      estoreid: new ObjectId(estoreid),
    }).exec();
    const countReferral = await User.find({
      refid: new ObjectId(user._id),
      role: "admin",
    }).exec();
    const earnings = await User.aggregate([
      { $match: { refid: new ObjectId(user._id) } },
      { $group: { _id: null, amount: { $sum: "$refCommission" } } },
    ]);
    const withdraw = await Withdraw.aggregate([
      {
        $match: {
          userid: new ObjectId(user._id),
          $or: [{ status: "Pending" }, { status: "Approved" }],
        },
      },
      { $group: { _id: null, amount: { $sum: "$amount" } } },
    ]);
    res.json({ earnings, withdraw, count: countReferral.length });
  } catch (error) {
    res.json({ err: "Fetching top raffle entries fails. " + error.message });
  }
};

exports.getUserToAffiliate = async (req, res) => {
  const email = req.user.email;
  const refEmail = req.params.email;

  try {
    const user = await User.findOne({
      email,
    }).exec();
    const referral = await User.findOne({
      email: refEmail,
      role: "admin",
    })
      .populate({
        path: "estoreid",
        populate: {
          path: "country",
        },
      })
      .exec();
    if (referral) {
      if (
        (referral && referral.refid) ||
        (referral.estoreid &&
          referral.estoreid.upStatus &&
          referral.estoreid &&
          referral.estoreid.upStatus === "Active")
      ) {
        res.json({
          err: "Sorry, the user under this email is already a referral of somebody else or is already a paid user.",
        });
      } else {
        delete referral.estoreid;
        await User.findOneAndUpdate(
          { _id: new ObjectId(referral._id) },
          { refid: user._id },
          {
            new: true,
          }
        );
        res.json(referral);
      }
    } else {
      res.json({ err: "No user found under this email" });
    }
  } catch (error) {
    res.json({
      err: "Fetching user information by email fails. " + error.message,
    });
  }
};

exports.getAffiliates = async (req, res) => {
  const email = req.user.email;
  const estoreid = req.headers.estoreid;

  try {
    const { sortkey, sort, currentPage, pageSize } = req.body;
    const user = await User.findOne({
      email,
      estoreid: new ObjectId(estoreid),
    }).exec();
    const referrals = await User.find({
      refid: new ObjectId(user._id),
      role: "admin",
    })
      .skip((currentPage - 1) * pageSize)
      .sort({ [sortkey]: sort })
      .limit(pageSize)
      .exec();
    const countReferral = await User.find({
      refid: new ObjectId(user._id),
      role: "admin",
    }).exec();
    res.json({ referrals, count: countReferral.length });
  } catch (error) {
    res.json({ err: "Fetching top raffle entries fails. " + error.message });
  }
};

exports.getWithdrawals = async (req, res) => {
  const email = req.user.email;
  const estoreid = req.headers.estoreid;

  try {
    const { sortkey, sort, currentPage, pageSize } = req.body;
    const user = await User.findOne({
      email,
      estoreid: new ObjectId(estoreid),
    }).exec();
    const withdrawal = await Withdraw.find({
      userid: user._id,
      estoreid: new ObjectId(estoreid),
    })
      .skip((currentPage - 1) * pageSize)
      .sort({ [sortkey]: sort })
      .limit(pageSize)
      .exec();
    res.json(withdrawal);
  } catch (error) {
    res.json({ err: "Saving withdrawal fails. " + error.message });
  }
};

exports.saveWithdrawal = async (req, res) => {
  const email = req.user.email;
  const estoreid = req.headers.estoreid;

  try {
    const user = await User.findOne({
      email,
      estoreid: new ObjectId(estoreid),
    }).exec();

    const earnings = await User.aggregate([
      { $match: { refid: new ObjectId(user._id) } },
      { $group: { _id: null, amount: { $sum: "$refCommission" } } },
    ]);
    const withdrawal = await Withdraw.aggregate([
      {
        $match: {
          userid: new ObjectId(user._id),
          $or: [{ status: "Pending" }, { status: "Approved" }],
        },
      },
      { $group: { _id: null, amount: { $sum: "$amount" } } },
    ]);

    const balance =
      parseFloat(earnings && earnings[0] ? earnings[0].amount : 0) -
      parseFloat(withdrawal && withdrawal[0] ? withdrawal[0].amount : 0);

    if (balance >= parseFloat(req.body.amount)) {
      const withdraw = new Withdraw({
        userid: user._id,
        estoreid: new ObjectId(estoreid),
        bank: req.body.bank,
        accountName: req.body.accountName,
        accountNumber: req.body.accountNumber,
        amount: parseFloat(req.body.amount),
        details: req.body.details,
      });
      await withdraw.save();

      if (withdraw) {
        res.json(withdraw);
      } else {
        res.json({
          err: "User cannot be found",
        });
      }
    } else {
      res.json({
        err: `Sorry, you have insufficient balance to withdraw. Actual balance is only ${balance}.`,
      });
    }
  } catch (error) {
    res.json({ err: "Saving withdrawal fails. " + error.message });
  }
};

exports.approveWithdraw = async (req, res) => {
  const withid = req.body.withid;
  try {
    await Withdraw.findOneAndUpdate(
      { _id: new ObjectId(withid) },
      { status: "Approved" },
      {
        new: true,
      }
    );
    res.json({ ok: true });
  } catch (error) {
    res.json({ err: "Saving withdrawal fails. " + error.message });
  }
};
