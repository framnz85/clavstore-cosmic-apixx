const ObjectId = require("mongoose").Types.ObjectId;
const jwt = require("jsonwebtoken");
const md5 = require("md5");

const User = require("../../models/user");
const Estore = require("../../models/estore");
const Points = require("../../models/points");

const addUserPointTotals = async (users) => {
  const userScopes = users
    .map((user) => {
      const plainUser =
        typeof user.toObject === "function" ? user.toObject() : user;
      const estoreValue = plainUser.estoreid?._id || plainUser.estoreid;

      return plainUser._id && estoreValue
        ? {
            userid: new ObjectId(plainUser._id),
            estoreid: new ObjectId(estoreValue),
          }
        : null;
    })
    .filter(Boolean);

  if (!userScopes.length) return users;

  const totals = await Points.aggregate([
    { $match: { $or: userScopes } },
    {
      $group: {
        _id: { userid: "$userid", estoreid: "$estoreid" },
        totalPoints: { $sum: "$points" },
        totalRedeem: { $sum: "$redeem" },
      },
    },
  ]);

  const totalsByUser = new Map(
    totals.map((total) => [
      `${total._id.userid.toString()}:${total._id.estoreid.toString()}`,
      total,
    ]),
  );

  return users.map((user) => {
    const plainUser =
      typeof user.toObject === "function" ? user.toObject() : user;
    const estoreValue = plainUser.estoreid?._id || plainUser.estoreid;
    const total = totalsByUser.get(
      `${plainUser._id.toString()}:${estoreValue.toString()}`,
    );
    const totalPoints = total ? total.totalPoints : 0;
    const totalRedeem = total ? total.totalRedeem : 0;

    return {
      ...plainUser,
      points: totalPoints,
      redeem: totalRedeem,
      totalPoints,
      totalRedeem,
    };
  });
};

exports.getUsers = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const page = req.body.page;
  const limit = req.body.limit;

  try {
    const users = await User.find({
      estoreid: new ObjectId(estoreid),
    })
      .skip(page * limit)
      .limit(limit)
      .select("-password -showPass -verifyCode")
      .lean()
      .exec();

    res.json(await addUserPointTotals(users));
  } catch (error) {
    res.json({ err: "Getting all users failed." + error.message });
  }
};

exports.getDefaultEstore = async (req, res) => {
  const estoreid = req.params.estoreid;

  try {
    const estore = await Estore.findOne({
      _id: new ObjectId(estoreid),
    }).exec();

    res.json(estore);
  } catch (error) {
    res.json({ err: "Getting main estore failed." + error.message });
  }
};

exports.loginUser = async (req, res) => {
  const email = req.body.email;
  const password = req.body.password;
  let tokenObj = { email };

  try {
    const user = await User.findOne({ email, password: md5(password) }).exec();
    if (user) {
      if (user && user.role === "admin" && user.emailConfirm) {
        tokenObj = {
          ...tokenObj,
          aud: "clavmall-estore",
          email_verified: true,
        };
      }
      token = jwt.sign(tokenObj, process.env.JWT_PRIVATE_KEY);
      res.json(token);
    } else {
      res.json({ err: "Invalid email or password." });
    }
  } catch (error) {
    res.json({ err: "Fetching user information fails. " + error.message });
  }
};

exports.getUserDetails = async (req, res) => {
  const email = req.user.email;
  const resellid = req.params.resellid;

  try {
    const users = await User.find({
      email,
      resellid: new ObjectId(resellid),
      role: { $in: ["admin", "moderator", "cashier"] },
    })
      .populate({
        path: "estoreid",
        populate: {
          path: "country",
        },
      })
      .select("-password -showPass -verifyCode")
      .exec();
    if (users) {
      res.json(await addUserPointTotals(users));
    }
  } catch (error) {
    res.json({ err: "Fetching user information fails. " + error.message });
  }
};

exports.updateUser = async (req, res) => {
  const resellid = req.headers.resellid;
  const email = req.user.email;
  let objValues = req.body;

  try {
    if (objValues && objValues.estoreid) {
      objValues = { ...objValues, estoreid: new ObjectId(objValues.estoreid) };
    }
    const user = await User.findOneAndUpdate(
      { email, resellid: new ObjectId(resellid) },
      objValues,
      {
        new: true,
      },
    );
    res.json((await addUserPointTotals([user]))[0]);
  } catch (error) {
    res.json({ err: "Updating user fails. " + error.message });
  }
};
