const { redisClient } = require("../../config/redis");

exports.clearOneItemCache = async (estoreid, cacheName) => {
  await redisClient.del(`${cacheName}:${estoreid}`);
};

exports.clearSubItemCache = async (subid, estoreid, cacheName) => {
  await redisClient.del(`${cacheName}:${estoreid}:${subid}`);
};

exports.clearMultiItemsCache = async (estoreid, cacheName) => {
  const pattern = `${cacheName}:${estoreid}:*`;

  let cursor = "0";

  try {
    do {
      const result = await redisClient.scan(cursor, {
        MATCH: pattern,
        COUNT: 100,
      });

      cursor = String(result.cursor);

      if (result.keys && result.keys.length > 0) {
        await redisClient.del(result.keys);
      }
    } while (cursor !== "0");
  } catch (error) {
    console.error(`Failed to clear Redis cache for ${pattern}:`, error.message);
  }
};

exports.clearSubItemsCache = async (subid, estoreid, cacheName) => {
  const pattern = `${cacheName}:${estoreid}:${subid}:*`;

  let cursor = "0";

  try {
    do {
      const result = await redisClient.scan(cursor, {
        MATCH: pattern,
        COUNT: 100,
      });

      cursor = String(result.cursor);

      if (result.keys && result.keys.length > 0) {
        await redisClient.del(result.keys);
      }
    } while (cursor !== "0");
  } catch (error) {
    console.error("Failed to clear Redis sub-items cache:", error);
  }
};
