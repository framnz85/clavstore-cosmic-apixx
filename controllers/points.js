const ObjectId = require("mongoose").Types.ObjectId;

const Points = require("../models/points");
const Estore = require("../models/estore");
const { redisClient } = require("../config/redis");
const {
  clearOneItemCache,
  clearMultiItemsCache,
  clearSubItemCache,
} = require("./redis/clearing");

const pointsCacheKey = (estoreid) => `points:v2:${estoreid}`;
const pointCacheKey = (estoreid, pointid) => `points:v2:${estoreid}:${pointid}`;

const validateObjectId = (value, name) => {
  if (!ObjectId.isValid(value)) {
    throw new Error(`Invalid ${name}`);
  }

  return new ObjectId(value);
};

const normalizePoints = (value) => {
  const numericPoints = Number(value);

  if (!Number.isFinite(numericPoints) || numericPoints < 0) {
    return 0;
  }

  return Math.floor(numericPoints);
};

const buildPointPayload = (body = {}) => {
  const payload = {
    points: normalizePoints(body.points),
  };

  if (body.userid !== undefined) {
    payload.userid = validateObjectId(body.userid, "userid");
  }

  if (
    body.orderid !== undefined &&
    body.orderid !== null &&
    body.orderid !== ""
  ) {
    payload.orderid = validateObjectId(body.orderid, "orderid");
  }

  return payload;
};

// Create points from order creation
exports.createPoint = async ({ estoreid, userid, amount, orderid }) => {
  const estoreObjectId = validateObjectId(estoreid, "estoreid");
  const userObjectId = validateObjectId(userid, "userid");
  const orderObjectId = validateObjectId(orderid, "orderid");
  const estore = await Estore.findById(estoreObjectId).select("rewards").exec();
  const rewards = estore && estore.rewards;

  if (!rewards || rewards.active !== true) {
    return null;
  }

  const orderAmount = Number(amount);
  const rewardAmount = Number(rewards.amount);
  const rewardPoints = Number(rewards.points);

  if (
    !Number.isFinite(orderAmount) ||
    !Number.isFinite(rewardAmount) ||
    rewardAmount <= 0 ||
    !Number.isFinite(rewardPoints) ||
    rewardPoints < 0
  ) {
    return null;
  }

  const points = Math.floor((orderAmount / rewardAmount) * rewardPoints);

  const point = await Points.create({
    points: normalizePoints(points),
    userid: userObjectId,
    orderid: orderObjectId,
    estoreid: estoreObjectId,
  });

  await clearOneItemCache(estoreObjectId.toString(), "points:v2");
  await clearOneItemCache(estoreObjectId.toString(), "users");
  await clearMultiItemsCache(estoreObjectId.toString(), "users");
  return point;
};

// Get all points for an estore
exports.getPoints = async (req, res) => {
  try {
    const estoreid = validateObjectId(req.headers.estoreid, "estoreid");
    const cacheKey = pointsCacheKey(estoreid.toString());
    const cachedPoints = await redisClient.get(cacheKey);

    if (cachedPoints) {
      return res.json(JSON.parse(cachedPoints));
    }

    const points = await Points.find({ estoreid })
      .populate("userid")
      .populate("orderid", "orderCode")
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    await redisClient.set(cacheKey, JSON.stringify(points), { EX: 604800 });

    return res.json(points);
  } catch (error) {
    return res
      .status(400)
      .json({ err: "Getting points failed. " + error.message });
  }
};

// Get one points record
exports.getPoint = async (req, res) => {
  try {
    const estoreid = validateObjectId(req.headers.estoreid, "estoreid");
    const pointid = validateObjectId(req.params.pointid, "pointid");
    const cacheKey = pointCacheKey(estoreid.toString(), pointid.toString());
    const cachedPoint = await redisClient.get(cacheKey);

    if (cachedPoint) {
      return res.json(JSON.parse(cachedPoint));
    }

    const point = await Points.findOne({ _id: pointid, estoreid })
      .populate("userid")
      .populate("orderid", "orderCode")
      .lean()
      .exec();

    if (!point) {
      return res.status(404).json({ err: "Points record not found" });
    }

    await redisClient.set(cacheKey, JSON.stringify(point), { EX: 604800 });

    return res.json(point);
  } catch (error) {
    return res
      .status(400)
      .json({ err: "Getting points failed. " + error.message });
  }
};

// Update points
exports.updatePoint = async (req, res) => {
  try {
    const estoreid = validateObjectId(req.headers.estoreid, "estoreid");
    const pointid = validateObjectId(req.params.pointid, "pointid");
    const payload = buildPointPayload(req.body);

    const point = await Points.findOneAndUpdate(
      { _id: pointid, estoreid },
      payload,
      { new: true, runValidators: true },
    )
      .populate("userid")
      .exec();

    if (!point) {
      return res.status(404).json({ err: "Points record not found" });
    }

    await clearOneItemCache(estoreid.toString(), "points:v2");
    await clearSubItemCache(
      pointid.toString(),
      estoreid.toString(),
      "points:v2",
    );

    return res.json(point);
  } catch (error) {
    return res
      .status(400)
      .json({ err: "Updating points failed. " + error.message });
  }
};

// Delete points
exports.deletePoint = async (req, res) => {
  try {
    const estoreid = validateObjectId(req.headers.estoreid, "estoreid");
    const pointid = validateObjectId(req.params.pointid, "pointid");
    const result = await Points.deleteOne({ _id: pointid, estoreid });

    if (!result.deletedCount) {
      return res.status(404).json({ err: "Points record not found" });
    }

    await clearOneItemCache(estoreid.toString(), "points:v2");
    await clearSubItemCache(
      pointid.toString(),
      estoreid.toString(),
      "points:v2",
    );

    return res.json({ success: true, deletedCount: result.deletedCount });
  } catch (error) {
    return res
      .status(400)
      .json({ err: "Deleting points failed. " + error.message });
  }
};
