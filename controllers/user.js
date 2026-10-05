const ObjectId = require("mongoose").Types.ObjectId;
const jwt = require("jsonwebtoken");
const md5 = require("md5");
const SibApiV3Sdk = require("sib-api-v3-sdk");

const User = require("../models/user");
const Points = require("../models/points");
const Estore = require("../models/estore");
const Product = require("../models/product");
const Order = require("../models/order");
const Raffle = require("../models/raffle");
const Notification = require("../models/notification");
const Salesnotify = require("../models/salesnotify");

const { redisClient } = require("../config/redis");
const { getUserByEmail } = require("./auth");
const { clearOneItemCache, clearMultiItemsCache } = require("./redis/clearing");

const {
  populateRaffle,
  populateWishlist,
  populateAddress,
} = require("./common");

const getAccountCounts = async (estoreid) => {
  try {
    const estore = await Estore.findById(estoreid).select("createdAt");
    if (!estore || !estore.createdAt) return null;
    const createdDate = new Date(estore.createdAt);
    const now = new Date();
    const diffTime = now - createdDate;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    const [productCount, orderCount, userCount] = await Promise.all([
      Product.countDocuments({ estoreid: new ObjectId(estoreid) }),
      Order.countDocuments({ estoreid: new ObjectId(estoreid) }),
      User.countDocuments({ estoreid: new ObjectId(estoreid) }),
    ]);

    return {
      products: productCount,
      orders: orderCount,
      users: userCount,
      estore: diffDays,
    };
  } catch (error) {
    return {};
  }
};

const addUserPointTotals = async (userGroups) => {
  const allUsers = userGroups.flat();
  const userScopes = allUsers
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

  if (!userScopes.length) return userGroups;

  const totals = await Points.aggregate([
    {
      $match: {
        $or: userScopes,
      },
    },
    {
      $group: {
        _id: { userid: "$userid", estoreid: "$estoreid" },
        totalPoints: { $sum: "$points" },
        totalRedeem: { $sum: "$redeem" },
      },
    },
  ]);

  const totalsByUserId = new Map(
    totals.map((total) => [
      `${total._id.userid.toString()}:${total._id.estoreid.toString()}`,
      total,
    ]),
  );

  return userGroups.map((group) =>
    group.map((user) => {
      const plainUser =
        typeof user.toObject === "function" ? user.toObject() : user;
      const estoreValue = plainUser.estoreid?._id || plainUser.estoreid;
      const total = totalsByUserId.get(
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
    }),
  );
};

exports.getUserDetails = async (req, res) => {
  const email = req.user.email;
  const estoreid = req.headers.estoreid;
  const resellid = req.params.resellid;
  const resellslug = req.headers.resellslug;

  let wishlist = [];
  let addiv3 = {};

  const ensurePromoStart = async (userData) => {
    if (!userData) return userData;

    const hasPromoStart = userData.promoStart || userData._doc?.promoStart;

    if (hasPromoStart) return userData;

    const today = new Date();
    const userId = userData._id || userData._doc?._id;

    if (userId) {
      await User.updateOne(
        { _id: new ObjectId(userId) },
        { $set: { promoStart: today } },
      ).exec();
    }

    if (userData._doc) {
      userData._doc.promoStart = today;
    } else {
      userData.promoStart = today;
    }

    return userData;
  };

  try {
    const accountCounts = await getAccountCounts(estoreid);

    const cacheKey = `users:${estoreid}`;

    let user = null;

    const cachedUser = await redisClient.get(cacheKey);

    if (cachedUser) {
      const cachedUsers = JSON.parse(cachedUser);

      user = cachedUsers.find((item) => {
        return (
          item.email === email &&
          item.estoreid &&
          item.estoreid._id?.toString() === estoreid.toString() &&
          item.resellid?.toString() === resellid.toString()
        );
      });
    }

    if (!user) {
      user = await User.findOne({
        email,
        estoreid: new ObjectId(estoreid),
        resellid: new ObjectId(resellid),
      })
        .populate({
          path: "estoreid",
          populate: {
            path: "country",
          },
        })
        .select("-password -showPass -verifyCode")
        .lean()
        .exec();

      if (user) {
        let usersToCache = [];

        if (cachedUser) {
          usersToCache = JSON.parse(cachedUser);
        }

        const existingIndex = usersToCache.findIndex(
          (item) =>
            item.email === email &&
            item.estoreid?._id?.toString() === estoreid.toString() &&
            item.resellid?.toString() === resellid.toString(),
        );

        if (existingIndex >= 0) {
          usersToCache[existingIndex] = user;
        } else {
          usersToCache.push(user);
        }

        await redisClient.set(cacheKey, JSON.stringify(usersToCache), {
          EX: 259200,
        });
      }
    }

    if (user) {
      user = await ensurePromoStart(user);
      [[user]] = await addUserPointTotals([[user]]);

      if (user.wishlist && user.wishlist.length > 0) {
        wishlist = await populateWishlist(user.wishlist, estoreid);
      }

      if (user.address && user.address.addiv3 && user.address.addiv3._id) {
        addiv3 = await populateAddress(user.address.addiv3, estoreid);

        return res.json({
          ...user,
          wishlist,
          address: {
            ...user.address,
            addiv3,
          },
          accountCounts,
        });
      }

      return res.json({
        ...user,
        wishlist,
        accountCounts,
      });
    }

    if (resellslug !== "branch") {
      let userWithReseller = await User.findOne({
        email,
        resellid: new ObjectId(resellid),
      })
        .populate({
          path: "estoreid",
          populate: {
            path: "country",
          },
        })
        .select("-password -showPass -verifyCode")
        .lean()
        .exec();

      if (
        userWithReseller &&
        !userWithReseller.estoreid &&
        process.env.ESTORE_TYPE === "dedicated"
      ) {
        const oldEstore = await Estore.findOne({
          _id: new ObjectId(resellid),
        })
          .lean()
          .exec();

        if (oldEstore) {
          await User.updateOne(
            { email },
            {
              $set: {
                estoreid: oldEstore._id,
              },
            },
          ).exec();

          userWithReseller.estoreid = oldEstore;
        }
      }

      if (userWithReseller) {
        userWithReseller = await ensurePromoStart(userWithReseller);
        [[userWithReseller]] = await addUserPointTotals([[userWithReseller]]);

        if (userWithReseller.wishlist && userWithReseller.wishlist.length > 0) {
          wishlist = await populateWishlist(
            userWithReseller.wishlist,
            estoreid,
          );
        }

        if (
          userWithReseller.address &&
          userWithReseller.address.addiv3 &&
          userWithReseller.address.addiv3._id
        ) {
          addiv3 = await populateAddress(
            userWithReseller.address.addiv3,
            estoreid,
          );

          return res.json({
            ...userWithReseller,
            wishlist,
            address: {
              ...userWithReseller.address,
              addiv3,
            },
            accountCounts,
          });
        }

        return res.json({
          ...userWithReseller,
          wishlist,
          accountCounts,
        });
      }

      let userWithEmail = null;

      const cachedUsersForEmail = await redisClient.get(cacheKey);

      if (cachedUsersForEmail) {
        const cachedUsers = JSON.parse(cachedUsersForEmail);

        userWithEmail = cachedUsers.find((item) => {
          return (
            item.email === email &&
            item.estoreid &&
            item.estoreid._id?.toString() === estoreid.toString()
          );
        });
      }

      if (!userWithEmail) {
        userWithEmail = await User.findOne({
          email,
          estoreid: new ObjectId(estoreid),
        })
          .populate({
            path: "estoreid",
            populate: {
              path: "country",
            },
          })
          .select("-password -showPass -verifyCode")
          .lean()
          .exec();

        if (userWithEmail) {
          let usersToCache = [];

          if (cachedUsersForEmail) {
            usersToCache = JSON.parse(cachedUsersForEmail);
          }

          const existingIndex = usersToCache.findIndex(
            (item) =>
              item.email === email &&
              item.estoreid?._id?.toString() === estoreid.toString(),
          );

          if (existingIndex >= 0) {
            usersToCache[existingIndex] = userWithEmail;
          } else {
            usersToCache.push(userWithEmail);
          }

          await redisClient.set(cacheKey, JSON.stringify(usersToCache), {
            EX: 259200,
          });
        }
      }

      if (userWithEmail) {
        userWithEmail = await ensurePromoStart(userWithEmail);

        if (userWithEmail.wishlist && userWithEmail.wishlist.length > 0) {
          wishlist = await populateWishlist(userWithEmail.wishlist, estoreid);
        }

        if (
          userWithEmail.address &&
          userWithEmail.address.addiv3 &&
          userWithEmail.address.addiv3._id
        ) {
          addiv3 = await populateAddress(
            userWithEmail.address.addiv3,
            estoreid,
          );

          return res.json({
            ...userWithEmail,
            wishlist,
            address: {
              ...userWithEmail.address,
              addiv3,
            },
            accountCounts,
          });
        }

        return res.json({
          ...userWithEmail,
          wishlist,
          accountCounts,
        });
      }

      return res.json({
        err: "The email doesn't exist in this store.",
      });
    }

    return res.json({
      err: "User is not found on this site",
    });
  } catch (error) {
    return res.json({
      err: "Fetching user information fails. " + error.message,
    });
  }
};

exports.getRaffleEntries = async (req, res) => {
  const email = req.user.email;
  const estoreid = req.headers.estoreid;

  try {
    const user = await getUserByEmail(email, estoreid);

    const raffles = await Raffle.find({
      owner: user._id,
      estoreid: new ObjectId(estoreid),
    })
      .populate("orderid")
      .exec();

    res.json(raffles);
  } catch (error) {
    res.json({ err: "Fetching raffle entries fails. " + error.message });
  }
};

exports.getTopEntries = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const count = req.params.count;

  try {
    let entries = await Raffle.aggregate([
      { $match: { estoreid: new ObjectId(estoreid) } },
      { $sample: { size: parseInt(count) } },
    ]).exec();
    entries = await populateRaffle(entries);
    res.json(entries);
  } catch (error) {
    res.json({ err: "Fetching top raffle entries fails. " + error.message });
  }
};

exports.getNotification = async (req, res) => {
  const day = req.params.day;

  try {
    const notify = await Notification.find({ day: { $lte: day - 1 } })
      .limit(2)
      .sort({ day: -1 })
      .exec();
    const sales = await Salesnotify.find({ day: { $lte: day - 1 } })
      .limit(2)
      .sort({ day: -1 })
      .exec();
    res.json([...notify, ...sales]);
  } catch (error) {
    res.json({ err: "Fetching notifications fails. " + error.message });
  }
};

exports.getAllUsers = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const email = req.user.email;

  try {
    const { sortkey, sort, currentPage, pageSize, searchQuery } = req.body;

    const page = Number(currentPage) || 1;
    const limit = Number(pageSize) || 20;
    const sortField = sortkey || "createdAt";
    const sortOrder = Number(sort) || 1;
    const search = searchQuery || "";

    const checkUser = await User.findOne({
      email,
      estoreid: new ObjectId(estoreid),
    })
      .select("superAdmin")
      .lean()
      .exec();

    const adminCacheKey = `users:${estoreid}:admin`;
    const moderatorCacheKey = `users:${estoreid}:moderator`;
    const cashierCacheKey = `users:${estoreid}:cashier`;
    const customerCacheKey = `users:${estoreid}:customer:${page}:${limit}:${sortField}:${sortOrder}:${search}`;

    let admins;

    if (checkUser && checkUser.superAdmin) {
      const estoreids = await Estore.aggregate([
        {
          $match: {
            status: "active",
            upgradeType: "2",
            upStatus2: "Active",
          },
        },
        {
          $group: {
            _id: "$_id",
          },
        },
      ]);

      admins = await User.find({
        estoreid: {
          $in: estoreids.map((data) => data._id),
        },
        role: "admin",
      })
        .select("-password -showPass -verifyCode")
        .sort({ createdAt: -1 })
        .lean()
        .exec();
    } else {
      const cachedAdmins = await redisClient.get(adminCacheKey);

      if (cachedAdmins) {
        admins = JSON.parse(cachedAdmins);
      } else {
        admins = await User.find({
          estoreid: new ObjectId(estoreid),
          role: "admin",
        })
          .select("-password -showPass -verifyCode")
          .sort({ createdAt: -1 })
          .lean()
          .exec();

        await redisClient.set(adminCacheKey, JSON.stringify(admins), {
          EX: 259200,
        });
      }
    }

    let moderators;

    const cachedModerators = await redisClient.get(moderatorCacheKey);

    if (cachedModerators) {
      moderators = JSON.parse(cachedModerators);
    } else {
      moderators = await User.find({
        estoreid: new ObjectId(estoreid),
        role: "moderator",
      })
        .select("-password -showPass -verifyCode")
        .sort({ createdAt: -1 })
        .lean()
        .exec();

      await redisClient.set(moderatorCacheKey, JSON.stringify(moderators), {
        EX: 259200,
      });
    }

    let cashiers;

    const cachedCashiers = await redisClient.get(cashierCacheKey);

    if (cachedCashiers) {
      cashiers = JSON.parse(cachedCashiers);
    } else {
      cashiers = await User.find({
        estoreid: new ObjectId(estoreid),
        role: "cashier",
      })
        .select("-password -showPass -verifyCode")
        .sort({ createdAt: -1 })
        .lean()
        .exec();

      await redisClient.set(cashierCacheKey, JSON.stringify(cashiers), {
        EX: 259200,
      });
    }

    let customers;
    let countCustomers;

    const cachedCustomers = await redisClient.get(customerCacheKey);

    if (cachedCustomers) {
      const cachedData = JSON.parse(cachedCustomers);

      customers = cachedData.customers;
      countCustomers = cachedData.count;
    } else {
      const searchObj = {
        estoreid: new ObjectId(estoreid),
        role: "customer",
      };

      if (search) {
        searchObj.$or = [
          {
            name: {
              $regex: search,
              $options: "i",
            },
          },
          {
            email: {
              $regex: search,
              $options: "i",
            },
          },
          {
            phone: {
              $regex: search,
              $options: "i",
            },
          },
          {
            address: {
              $regex: search,
              $options: "i",
            },
          },
        ];
      }

      customers = await User.find(searchObj)
        .skip((page - 1) * limit)
        .sort({
          [sortField]: sortOrder,
        })
        .limit(limit)
        .select("-password -showPass -verifyCode")
        .lean()
        .exec();

      if (customers.length < 1 && search) {
        customers = await User.find({
          name: {
            $regex: search,
            $options: "i",
          },
          estoreid: new ObjectId(estoreid),
          role: "customer",
        })
          .skip((page - 1) * limit)
          .sort({
            [sortField]: sortOrder,
          })
          .limit(limit)
          .select("-password -showPass -verifyCode")
          .lean()
          .exec();
      }

      countCustomers = await User.countDocuments(searchObj);

      await redisClient.set(
        customerCacheKey,
        JSON.stringify({
          customers,
          count: countCustomers,
        }),
        {
          EX: 259200,
        },
      );
    }

    const [
      usersWithPoints,
      usersWithPointsModerators,
      usersWithPointsCashiers,
      usersWithPointsCustomers,
    ] = await addUserPointTotals([admins, moderators, cashiers, customers]);

    return res.json({
      admins: usersWithPoints,
      moderators: usersWithPointsModerators,
      cashiers: usersWithPointsCashiers,
      customers: usersWithPointsCustomers,
      count: countCustomers,
    });
  } catch (error) {
    return res.json({
      err: "Fetching users fails. " + error.message,
    });
  }
};

exports.createNewUser = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const resellid = req.params.resellid;

  try {
    const cacheKey = `users:${estoreid}`;
    let checkUser = null;
    const cachedUsers = await redisClient.get(cacheKey);

    if (cachedUsers) {
      const users = JSON.parse(cachedUsers);

      checkUser = users.find((user) => {
        return (
          user.email === req.body.email &&
          user.estoreid?.toString() === estoreid.toString() &&
          user.resellid?.toString() === resellid.toString()
        );
      });
    }

    if (!checkUser) {
      checkUser = await User.findOne({
        email: req.body.email,
        estoreid: new ObjectId(estoreid),
        resellid: new ObjectId(resellid),
      }).exec();
    }

    if (checkUser) {
      return res.json({
        err: "The email address is already existing on this store",
      });
    }

    const userData = req.body.refid
      ? {
          refid: new ObjectId(req.body.refid),
          name: req.body.owner,
          phone: req.body.phone,
          email: req.body.email,
          password: md5(req.body.password),
          showPass: req.body.password,
          role: req.body.role,
          image: req.body.image,
          address: req.body.address,
          estoreid: new ObjectId(estoreid),
          resellid: new ObjectId(resellid),
        }
      : {
          name: req.body.owner,
          phone: req.body.phone,
          email: req.body.email,
          password: md5(req.body.password),
          showPass: req.body.password,
          role: req.body.role,
          image: req.body.image,
          address: req.body.address,
          estoreid: new ObjectId(estoreid),
          resellid: new ObjectId(resellid),
        };

    const user = new User(userData);

    await user.save();

    const latestCachedUsers = await redisClient.get(cacheKey);

    if (latestCachedUsers) {
      let users = JSON.parse(latestCachedUsers);

      const newUser = user.toObject();

      delete newUser.password;
      delete newUser.showPass;
      delete newUser.verifyCode;

      users.push(newUser);

      await redisClient.set(cacheKey, JSON.stringify(users), {
        EX: 259200,
      });

      clearMultiItemsCache(estoreid, "users");
    }

    const token = jwt.sign(
      {
        email: req.body.email,
      },
      process.env.JWT_PRIVATE_KEY,
    );

    let refUser = {};

    if (req.body.refid) {
      refUser = await User.findOne({
        _id: new ObjectId(req.body.refid),
        role: "admin",
      })
        .select("-password -showPass -verifyCode")
        .lean()
        .exec();
    }

    return res.json({
      user,
      token,
      refUser,
    });
  } catch (error) {
    return res.json({
      err: "Creating new user fails. " + error.message,
    });
  }
};

exports.sendEmail = async (req, res) => {
  const email = req.body.email;
  const name = req.body.name;
  const templateId = req.body.templateId;
  const defaultClient = SibApiV3Sdk.ApiClient.instance;

  let apiKey = defaultClient.authentications["api-key"];
  apiKey.apiKey = process.env.BREVO_APIKEY;

  let apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

  let sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail(); // SendSmtpEmail | Values to send a transactional email

  sendSmtpEmail = {
    to: [
      {
        email,
        name,
      },
    ],
    templateId,
    headers: {
      "X-Mailin-custom":
        "custom_header_1:custom_value_1|custom_header_2:custom_value_2",
    },
  };

  apiInstance.sendTransacEmail(sendSmtpEmail).then(
    function (data) {
      res.json({ ok: true });
    },
    function (error) {
      res.json({ err: "Sending welcome email fails. " + error.message });
    },
  );
};

exports.addToWishlist = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const prodid = req.body.prodid;
  const email = req.user.email;

  try {
    const user = await User.findOneAndUpdate(
      { email, estoreid: new ObjectId(estoreid) },
      { $addToSet: { wishlist: prodid } },
      {
        new: true,
      },
    );

    if (!user) {
      return res.json({
        err: "Adding wishlist fails. User is not found on this store.",
      });
    }

    const wishlist = await populateWishlist(user.wishlist, estoreid);

    res.json(wishlist);

    clearOneItemCache(estoreid, "users");
    clearMultiItemsCache(estoreid, "users");
  } catch (error) {
    res.json({ err: "Adding wishlist fails. " + error.message });
  }
};

exports.handleWorkflow1 = async (req, res) => {
  try {
    const response = await fetch("https://api.sender.net/v2/subscribers", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SENDER_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();

    res.json(data);
  } catch (err) {
    console.error(err);
  }
};

exports.sendVerificationCode = async (req, res) => {
  try {
    const senderToken = process.env.SENDER_TOKEN;

    const fromEmail = req.body.fromEmail;
    const fromName = req.body.fromName;
    const email = req.body.email;
    const toName = req.body.toName;
    const storeName = req.body.storeName;
    const verificationCode = req.body.verificationCode;

    const url = new URL("https://api.sender.net/v2/message/send");

    const headers = {
      Authorization: `Bearer ${senderToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    const bodyContent = {
      from: {
        email: fromEmail,
        name: fromName,
      },
      to: {
        email,
        name: toName,
      },
      subject: `${storeName} Verification Code`,
      text: `Your verification code is: ${verificationCode}`,
      html: `Hello from <b>${storeName}</b>.<br/><br/>Your verification code is: <b>${verificationCode}</b>.`,
      headers: {
        charset: "utf-8",
      },
      variables: {
        verification_code: verificationCode,
        store_name: storeName,
      },
    };

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(bodyContent),
    });

    res.json(response);
  } catch (err) {
    console.error(err);
  }
};

exports.updateUser = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const email = req.user.email;
  let objValues = req.body;

  if (email !== req.body.email) {
    objValues = { ...req.body, emailConfirm: false };
  }

  if (objValues.wishlist) {
    objValues.wishlist = objValues.wishlist
      .map((item) => {
        if (!item) return null;
        return item._id ? item._id : item;
      })
      .filter((id) => id && ObjectId.isValid(id))
      .map((id) => new ObjectId(id));
  }

  try {
    const checkUser = await User.findOne({
      email,
      estoreid: new ObjectId(estoreid),
    });
    if (checkUser && checkUser.verifyCode && checkUser.verifyCode.length > 0) {
      objValues = { ...req.body, verifyCode: checkUser.verifyCode };
    }
    if (
      checkUser &&
      checkUser.estoreid.toString() !== estoreid &&
      !checkUser.superAdmin &&
      !checkUser.changeStore
    ) {
      res.json({ err: "Admin does not allowed you to change store" });
      return;
    }

    const user = await User.findOneAndUpdate(
      { email, estoreid: new ObjectId(estoreid) },
      objValues,
      {
        new: true,
      },
    )
      .populate({
        path: "estoreid",
        populate: {
          path: "country",
        },
      })
      .select("-password -showPass");

    res.json(user);

    clearOneItemCache(estoreid, "users");
    clearMultiItemsCache(estoreid, "users");
  } catch (error) {
    res.json({ err: "Updating user fails. " + error.message });
  }
};

exports.updateCustomer = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const email = req.user.email;
  const userid = req.params.userid;
  try {
    const checkUser = await User.findOne({
      email,
      estoreid: new ObjectId(estoreid),
    });
    if (checkUser && checkUser.superAdmin) {
      await User.findOneAndUpdate({ _id: new ObjectId(userid) }, req.body, {
        new: true,
      });
    } else {
      await User.findOneAndUpdate(
        { _id: new ObjectId(userid), estoreid: new ObjectId(estoreid) },
        req.body,
        {
          new: true,
        },
      );
    }

    res.json({ ok: true });

    clearOneItemCache(estoreid, "users");
    clearMultiItemsCache(estoreid, "users");
  } catch (error) {
    res.json({ err: "Updating customer fails. " + error.message });
  }
};

exports.verifyUserEmail = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const email = req.user.email;
  const code = req.body.code;

  try {
    const user = await User.findOneAndUpdate(
      { email, estoreid: new ObjectId(estoreid), verifyCode: code },
      { verifyCode: "", emailConfirm: true },
      {
        new: true,
      },
    )
      .populate({
        path: "estoreid",
        populate: {
          path: "country",
        },
      })
      .select("-password -showPass -verifyCode");
    if (user) {
      if (user.role === "admin") {
        await Estore.findOneAndUpdate(
          { _id: new ObjectId(estoreid) },
          { status: "active" },
          {
            new: true,
          },
        );
      }
      res.json(user);

      clearOneItemCache(estoreid, "users");
    } else {
      res.json({
        err: "Sorry, the verification code you submitted is either incorrect or expired!",
      });
    }
  } catch (error) {
    res.json({ err: "Verifying user email fails. " + error.message });
  }
};

exports.changePassword = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const email = req.user.email;
  const oldpassword = req.body.oldpassword;
  const newpassword = req.body.newpassword;

  try {
    const user = await User.findOneAndUpdate(
      {
        email,
        estoreid: new ObjectId(estoreid),
        password: md5(oldpassword),
      },
      {
        password: md5(newpassword),
      },
      { new: true },
    );
    if (user) {
      res.json(user);

      clearOneItemCache(estoreid, "users");
    } else {
      res.json({ err: "The old password you have entered is not correct" });
    }
  } catch (error) {
    res.json({ err: "Change password fails. " + error.message });
  }
};

exports.resetPassword = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const userid = req.params.userid;

  try {
    const user = await User.findOneAndUpdate(
      {
        _id: new ObjectId(userid),
        estoreid: new ObjectId(estoreid),
      },
      {
        password: md5("Grocery@2000"),
      },
      { new: true },
    );
    res.json(user);

    clearOneItemCache(estoreid, "users");
  } catch (error) {
    res.json({ err: "Reseting password for a user fails. " + error.message });
  }
};

exports.forgotPassword = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const email = req.body.email;
  const newpassword = req.body.newpassword;
  let user = {};

  try {
    if (estoreid) {
      user = await User.findOneAndUpdate(
        {
          email,
          estoreid: new ObjectId(estoreid),
        },
        {
          password: md5(newpassword),
          showPass: newpassword,
        },
        { new: true },
      );
      if (!user) {
        user = await User.findOneAndUpdate(
          {
            email,
            role: "admin",
          },
          {
            password: md5(newpassword),
            showPass: newpassword,
          },
          { new: true },
        );
      }
    } else {
      user = await User.findOneAndUpdate(
        {
          email,
          role: "admin",
        },
        {
          password: md5(newpassword),
          showPass: newpassword,
        },
        { new: true },
      );
    }
    if (user) {
      res.json(user);

      clearOneItemCache(estoreid, "users");
    } else {
      res.json({ err: "Change user password fails. No user was found" });
    }
  } catch (error) {
    res.json({ err: "Change user password fails. " + error.message });
  }
};

exports.deleteAccountRequest = async (req, res) => {
  const email = req.body.email;
  const reasons = req.body.reasons;
  try {
    const user = await User.findOneAndUpdate(
      {
        email,
      },
      { deleteAccount: { request: true, reasons } },
      { new: true },
    );
    if (user) {
      res.json(user);
    } else {
      res.json({
        err: "Sorry, there is no user registered under the email" + email,
      });
    }
  } catch (error) {
    res.json({ err: "Request for Account Deletion fails. " + error.message });
  }
};

exports.importUsers = async (req, res) => {
  const estoreid = req.headers.estoreid;
  try {
    const users = req.body.users;
    for (let i = 0; i < users.length; i++) {
      if (users[i]._id && ObjectId.isValid(users[i]._id)) {
        await User.findOneAndUpdate(
          {
            _id: new ObjectId(users[i]._id),
            estoreid: new ObjectId(estoreid),
          },
          users[i],
          { new: true },
        );
      } else {
        const checkExist = await User.findOne({
          email: users[i].email,
          estoreid: new ObjectId(estoreid),
        });
        if (checkExist) {
          await User.findOneAndUpdate(
            {
              email: users[i].email,
              estoreid: new ObjectId(estoreid),
            },
            users[i],
            { new: true },
          );
        } else {
          const user = new User({
            ...users[i],
            estoreid: new ObjectId(estoreid),
          });
          await user.save();
        }
      }
    }
    res.json({ ok: true });

    clearOneItemCache(estoreid, "users");
    clearMultiItemsCache(estoreid, "users");
  } catch (error) {
    res.json({ err: "Importing users failed. " + error.message });
  }
};

exports.deleteUser = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const userid = req.params.userid;

  try {
    const user = await User.findOneAndDelete({
      _id: new ObjectId(userid),
      estoreid: new ObjectId(estoreid),
    });
    res.json(user);

    clearOneItemCache(estoreid, "users");
    clearMultiItemsCache(estoreid, "users");
  } catch (error) {
    res.json({ err: "Deleting user fails. " + error.message });
  }
};

exports.deleteAllRaffles = async (req, res) => {
  const estoreid = req.headers.estoreid;

  try {
    const raffles = await Raffle.deleteMany({
      estoreid: new ObjectId(estoreid),
    });
    res.json(raffles);
  } catch (error) {
    res.json({ err: "Deleting all raffles fails. " + error.message });
  }
};
