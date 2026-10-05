const ObjectId = require("mongoose").Types.ObjectId;
const Country = require("../models/country");
const Addiv1 = require("../models/addiv1");
const Addiv2 = require("../models/addiv2");
const Addiv3 = require("../models/addiv3");
const MyCountry = require("../models/myCountry");
const MyAddiv1 = require("../models/myAddiv1");
const MyAddiv2 = require("../models/myAddiv2");
const MyAddiv3 = require("../models/myAddiv3");

const { redisClient } = require("../config/redis");
const { clearMultiItemsCache } = require("./redis/clearing");

exports.listCountry = async (req, res) => {
  const cacheKey = "countries:all";

  try {
    const cachedCountries = await redisClient.get(cacheKey);

    if (cachedCountries) {
      return res.json(JSON.parse(cachedCountries));
    }

    const countries = await Country.find({}).lean().exec();

    await redisClient.set(cacheKey, JSON.stringify(countries), {
      EX: 604800,
    });

    return res.json(countries);
  } catch (error) {
    return res.json({
      err: "Getting countries failed. " + error.message,
    });
  }
};

exports.listAddiv1 = async (req, res) => {
  const { couid } = req.params;

  if (!ObjectId.isValid(couid)) {
    return res.json({
      err: "Unidentified Location. Please re-login your account.",
    });
  }

  try {
    const cacheKey = `addiv1:${couid}`;

    const cachedAddiv1 = await redisClient.get(cacheKey);

    if (cachedAddiv1) {
      return res.json(JSON.parse(cachedAddiv1));
    }

    const countryId = new ObjectId(couid);

    const addiv1 = await Addiv1.find({
      couid: countryId,
    })
      .sort({ name: 1 })
      .lean()
      .exec();

    await redisClient.set(cacheKey, JSON.stringify(addiv1), {
      EX: 604800,
    });

    return res.json(addiv1);
  } catch (error) {
    return res.json({
      err: "Getting administrative divisions failed. " + error.message,
    });
  }
};

exports.listAddiv2 = async (req, res) => {
  const { couid, addiv1 } = req.params;

  if (!ObjectId.isValid(couid) || !ObjectId.isValid(addiv1)) {
    return res.json({
      err: "Unidentified Location. Please re-login your account.",
    });
  }

  try {
    const cacheKey = `addiv2:${couid}:${addiv1}`;

    const cachedAddiv2 = await redisClient.get(cacheKey);

    if (cachedAddiv2) {
      return res.json(JSON.parse(cachedAddiv2));
    }

    const countryId = new ObjectId(couid);
    const addiv1Id = new ObjectId(addiv1);

    const addiv2 = await Addiv2.find({
      couid: countryId,
      adDivId1: addiv1Id,
    })
      .sort({ name: 1 })
      .lean()
      .exec();

    await redisClient.set(cacheKey, JSON.stringify(addiv2), {
      EX: 604800,
    });

    return res.json(addiv2);
  } catch (error) {
    return res.json({
      err: "Getting administrative divisions failed. " + error.message,
    });
  }
};

exports.listAddiv3 = async (req, res) => {
  const { couid, addiv1, addiv2 } = req.params;

  if (
    !ObjectId.isValid(couid) ||
    !ObjectId.isValid(addiv1) ||
    !ObjectId.isValid(addiv2)
  ) {
    return res.json({
      err: "Unidentified Location. Please re-login your account.",
    });
  }

  try {
    const cacheKey = `addiv3:${couid}:${addiv1}:${addiv2}`;

    const cachedAddiv3 = await redisClient.get(cacheKey);

    if (cachedAddiv3) {
      return res.json(JSON.parse(cachedAddiv3));
    }

    const countryId = new ObjectId(couid);
    const addiv1Id = new ObjectId(addiv1);
    const addiv2Id = new ObjectId(addiv2);

    const addiv3 = await Addiv3.find({
      couid: countryId,
      adDivId1: addiv1Id,
      adDivId2: addiv2Id,
    })
      .sort({ name: 1 })
      .lean()
      .exec();

    await redisClient.set(cacheKey, JSON.stringify(addiv3), {
      EX: 604800,
    });

    return res.json(addiv3);
  } catch (error) {
    return res.json({
      err: "Getting administrative divisions failed. " + error.message,
    });
  }
};

exports.copyAllAddiv1 = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const { country, details } = req.body;
  const origCouid = country._id;
  let couid = "";
  let addiv1 = "";
  let addiv2 = "";

  try {
    const countryExist = await MyCountry.findOne({
      estoreid: new ObjectId(estoreid),
    }).exec();

    if (countryExist) {
      couid = countryExist._id;
    } else {
      delete country._id;
      const newCountry = new MyCountry({
        ...country,
        estoreid: new ObjectId(estoreid),
      });
      await newCountry.save();
      couid = newCountry._id;
    }

    const addiv1s = await Addiv1.find({
      couid: new ObjectId(origCouid),
    }).exec();
    const newAddiv1s = [];

    for (i = 0; i < addiv1s.length; i++) {
      const origAddiv1 = addiv1s[i]._id;

      const addiv1Check = await MyAddiv1.findOne({
        estoreid: new ObjectId(estoreid),
        couid: new ObjectId(couid),
        name: addiv1s[i].name,
      }).exec();

      if (addiv1Check) {
        addiv1 = addiv1Check._id;
      } else {
        const newAddiv1 = new MyAddiv1({
          estoreid: new ObjectId(estoreid),
          couid: new ObjectId(couid),
          name: addiv1s[i].name,
        });
        await newAddiv1.save();
        addiv1 = newAddiv1._id;
      }
      newAddiv1s.push({
        oldAddiv1: origAddiv1.toString(),
        newAddiv1: addiv1.toString(),
      });
    }

    const addiv2s = await Addiv2.find({
      couid: new ObjectId(origCouid),
    }).exec();
    const newAddiv2s = [];

    for (i = 0; i < addiv2s.length; i++) {
      const origAddiv2 = addiv2s[i]._id;
      const oldAddiv1 = newAddiv1s.find(
        (data) => data.oldAddiv1.toString() === addiv2s[i].adDivId1.toString(),
      );

      if (oldAddiv1) {
        const addiv2Check = await MyAddiv2.findOne({
          estoreid: new ObjectId(estoreid),
          couid: new ObjectId(couid),
          adDivId1: new ObjectId(oldAddiv1.newAddiv1),
          name: addiv2s[i].name,
        }).exec();

        if (addiv2Check) {
          addiv2 = addiv2Check._id;
        } else {
          const newAddiv2 = new MyAddiv2({
            estoreid: new ObjectId(estoreid),
            couid: new ObjectId(couid),
            adDivId1: new ObjectId(oldAddiv1.newAddiv1),
            name: addiv2s[i].name,
          });
          await newAddiv2.save();
          addiv2 = newAddiv2._id;
        }
        newAddiv2s.push({
          oldAddiv2: origAddiv2.toString(),
          newAddiv2: addiv2.toString(),
        });
      }
    }

    const addiv3s = await Addiv3.find({
      couid: new ObjectId(origCouid),
    }).exec();
    for (i = 0; i < addiv3s.length; i++) {
      const oldAddiv1 = newAddiv1s.find(
        (data) => data.oldAddiv1.toString() === addiv3s[i].adDivId1.toString(),
      );
      const oldAddiv2 = newAddiv2s.find(
        (data) => data.oldAddiv2.toString() === addiv3s[i].adDivId2.toString(),
      );

      if (oldAddiv1 && oldAddiv2) {
        const addiv3Check = await MyAddiv3.findOne({
          estoreid: new ObjectId(estoreid),
          couid: new ObjectId(couid),
          adDivId1: new ObjectId(oldAddiv1.newAddiv1),
          adDivId2: new ObjectId(oldAddiv2.newAddiv2),
          name: addiv3s[i].name,
        }).exec();

        if (!addiv3Check) {
          const newAddiv3 = new MyAddiv3({
            ...details,
            estoreid: new ObjectId(estoreid),
            couid: new ObjectId(couid),
            adDivId1: new ObjectId(oldAddiv1.newAddiv1),
            adDivId2: new ObjectId(oldAddiv2.newAddiv2),
            name: addiv3s[i].name,
          });
          await newAddiv3.save();
        }
      }
    }

    res.json({ ok: true });

    await redisClient.del(`myNewAdded:${estoreid}`);
    clearMultiItemsCache(estoreid, "myAddiv1");
    clearMultiItemsCache(estoreid, "myAddiv2");
    clearMultiItemsCache(estoreid, "myAddiv3");
  } catch (error) {
    console.log(error.message);
  }
};

exports.saveCreatedLocation1 = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const { values, details } = req.body;
  const { country, addiv1, addiv2, addiv3 } = values;
  let couid = "";

  try {
    const countryExist = await MyCountry.findOne({
      estoreid: new ObjectId(estoreid),
    }).exec();

    if (countryExist) {
      couid = countryExist._id;
    } else {
      delete country._id;
      const newCountry = new MyCountry({
        ...country,
        estoreid: new ObjectId(estoreid),
      });
      await newCountry.save();
      couid = newCountry._id;
    }

    MyAddiv1.collection
      .insertOne({
        name: addiv1.name,
        estoreid: new ObjectId(estoreid),
        couid: new ObjectId(couid),
      })
      .then((result1) => {
        MyAddiv2.collection
          .insertOne({
            name: addiv2.name,
            estoreid: new ObjectId(estoreid),
            couid: new ObjectId(couid),
            adDivId1: new ObjectId(result1.insertedId),
          })
          .then((result2) => {
            MyAddiv3.collection.insertOne({
              name: addiv3.name,
              estoreid: new ObjectId(estoreid),
              couid: new ObjectId(couid),
              adDivId1: new ObjectId(result1.insertedId),
              adDivId2: new ObjectId(result2.insertedId),
              ...details,
            });
          });
      });

    res.json({ ok: true });

    await redisClient.del(`myNewAdded:${estoreid}`);
    clearMultiItemsCache(estoreid, "myAddiv1");
    clearMultiItemsCache(estoreid, "myAddiv2");
    clearMultiItemsCache(estoreid, "myAddiv3");
  } catch (error) {
    console.log(error.message);
  }
};

exports.copyAllAddiv2 = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const { country, addiv1: addiv1Body, details } = req.body;
  const origCouid = country._id;
  let couid = "";
  let addiv1 = "";
  let addiv2 = "";

  try {
    const countryExist = await MyCountry.findOne({
      estoreid: new ObjectId(estoreid),
    }).exec();

    if (countryExist) {
      couid = countryExist._id;
    } else {
      delete country._id;
      const newCountry = new MyCountry({
        ...country,
        estoreid: new ObjectId(estoreid),
      });
      await newCountry.save();
      couid = newCountry._id;
    }

    const addiv1Check = await MyAddiv1.findOne({
      estoreid: new ObjectId(estoreid),
      couid: new ObjectId(couid),
      name: addiv1Body.name,
    }).exec();

    if (addiv1Check) {
      addiv1 = addiv1Check._id;
    } else {
      const newAddiv1 = new MyAddiv1({
        estoreid: new ObjectId(estoreid),
        couid: new ObjectId(couid),
        name: addiv1Body.name,
      });
      await newAddiv1.save();
      addiv1 = newAddiv1._id;
    }

    const addiv2s = await Addiv2.find({
      couid: new ObjectId(origCouid),
      adDivId1: new ObjectId(addiv1Body._id),
    }).exec();
    const newAddiv2s = [];

    for (i = 0; i < addiv2s.length; i++) {
      const origAddiv2 = addiv2s[i]._id;

      if (addiv1) {
        const addiv2Check = await MyAddiv2.findOne({
          estoreid: new ObjectId(estoreid),
          couid: new ObjectId(couid),
          adDivId1: new ObjectId(addiv1),
          name: addiv2s[i].name,
        }).exec();

        if (addiv2Check) {
          addiv2 = addiv2Check._id;
        } else {
          const newAddiv2 = new MyAddiv2({
            estoreid: new ObjectId(estoreid),
            couid: new ObjectId(couid),
            adDivId1: new ObjectId(addiv1),
            name: addiv2s[i].name,
          });
          await newAddiv2.save();
          addiv2 = newAddiv2._id;
        }
        newAddiv2s.push({
          oldAddiv2: origAddiv2.toString(),
          newAddiv2: addiv2.toString(),
        });
      }
    }

    const addiv3s = await Addiv3.find({
      couid: new ObjectId(origCouid),
      adDivId1: new ObjectId(addiv1Body._id),
    }).exec();
    for (i = 0; i < addiv3s.length; i++) {
      const oldAddiv2 = newAddiv2s.find(
        (data) => data.oldAddiv2.toString() === addiv3s[i].adDivId2.toString(),
      );

      if (addiv1 && oldAddiv2) {
        const addiv3Check = await MyAddiv3.findOne({
          estoreid: new ObjectId(estoreid),
          couid: new ObjectId(couid),
          adDivId1: new ObjectId(addiv1),
          adDivId2: new ObjectId(oldAddiv2.newAddiv2),
          name: addiv3s[i].name,
        }).exec();

        if (!addiv3Check) {
          const newAddiv3 = new MyAddiv3({
            ...details,
            estoreid: new ObjectId(estoreid),
            couid: new ObjectId(couid),
            adDivId1: new ObjectId(addiv1),
            adDivId2: new ObjectId(oldAddiv2.newAddiv2),
            name: addiv3s[i].name,
          });
          await newAddiv3.save();
        }
      }
    }

    res.json({ ok: true });

    await redisClient.del(`myNewAdded:${estoreid}`);
    clearMultiItemsCache(estoreid, "myAddiv1");
    clearMultiItemsCache(estoreid, "myAddiv2");
    clearMultiItemsCache(estoreid, "myAddiv3");
  } catch (error) {
    console.log(error.message);
  }
};

exports.saveCreatedLocation2 = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const { values, details } = req.body;
  const { country, addiv1: addiv1Body, addiv2, addiv3 } = values;
  let couid = "";
  let addiv1 = "";

  try {
    const countryExist = await MyCountry.findOne({
      estoreid: new ObjectId(estoreid),
    }).exec();

    if (countryExist) {
      couid = countryExist._id;
    } else {
      delete country._id;
      const newCountry = new MyCountry({
        ...country,
        estoreid: new ObjectId(estoreid),
      });
      await newCountry.save();
      couid = newCountry._id;
    }

    const addiv1Check = await MyAddiv1.findOne({
      estoreid: new ObjectId(estoreid),
      couid: new ObjectId(couid),
      name: addiv1Body.name,
    }).exec();

    if (addiv1Check) {
      addiv1 = addiv1Check._id;
    } else {
      const newAddiv1 = new MyAddiv1({
        estoreid: new ObjectId(estoreid),
        couid: new ObjectId(couid),
        name: addiv1Body.name,
      });
      await newAddiv1.save();
      addiv1 = newAddiv1._id;
    }

    MyAddiv2.collection
      .insertOne({
        name: addiv2.name,
        estoreid: new ObjectId(estoreid),
        couid: new ObjectId(couid),
        adDivId1: new ObjectId(addiv1),
      })
      .then((result2) => {
        MyAddiv3.collection.insertOne({
          name: addiv3.name,
          estoreid: new ObjectId(estoreid),
          couid: new ObjectId(couid),
          adDivId1: new ObjectId(addiv1),
          adDivId2: new ObjectId(result2.insertedId),
          ...details,
        });
      });

    res.json({ ok: true });

    await redisClient.del(`myNewAdded:${estoreid}`);
    clearMultiItemsCache(estoreid, "myAddiv1");
    clearMultiItemsCache(estoreid, "myAddiv2");
    clearMultiItemsCache(estoreid, "myAddiv3");
  } catch (error) {
    console.log(error.message);
  }
};

exports.copyAllAddiv3 = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const { country, addiv1: addiv1Body, addiv2: addiv2Body, details } = req.body;
  const origCouid = country._id;
  let couid = "";
  let addiv1 = "";
  let addiv2 = "";

  try {
    const countryExist = await MyCountry.findOne({
      estoreid: new ObjectId(estoreid),
    }).exec();

    if (countryExist) {
      couid = countryExist._id;
    } else {
      delete country._id;
      const newCountry = new MyCountry({
        ...country,
        estoreid: new ObjectId(estoreid),
      });
      await newCountry.save();
      couid = newCountry._id;
    }

    const addiv1Check = await MyAddiv1.findOne({
      estoreid: new ObjectId(estoreid),
      couid: new ObjectId(couid),
      name: addiv1Body.name,
    }).exec();

    if (addiv1Check) {
      addiv1 = addiv1Check._id;
    } else {
      const newAddiv1 = new MyAddiv1({
        estoreid: new ObjectId(estoreid),
        couid: new ObjectId(couid),
        name: addiv1Body.name,
      });
      await newAddiv1.save();
      addiv1 = newAddiv1._id;
    }

    const addiv2Check = await MyAddiv2.findOne({
      estoreid: new ObjectId(estoreid),
      couid: new ObjectId(couid),
      adDivId1: new ObjectId(addiv1),
      name: addiv2Body.name,
    }).exec();

    if (addiv2Check) {
      addiv2 = addiv2Check._id;
    } else {
      const newAddiv2 = new MyAddiv2({
        estoreid: new ObjectId(estoreid),
        couid: new ObjectId(couid),
        adDivId1: new ObjectId(addiv1),
        name: addiv2Body.name,
      });
      await newAddiv2.save();
      addiv2 = newAddiv2._id;
    }

    const addiv3s = await Addiv3.find({
      couid: new ObjectId(origCouid),
      adDivId1: new ObjectId(addiv1Body._id),
      adDivId2: new ObjectId(addiv2Body._id),
    }).exec();
    for (i = 0; i < addiv3s.length; i++) {
      if (addiv1 && addiv2) {
        const addiv3Check = await MyAddiv3.findOne({
          estoreid: new ObjectId(estoreid),
          couid: new ObjectId(couid),
          adDivId1: new ObjectId(addiv1),
          adDivId2: new ObjectId(addiv2),
          name: addiv3s[i].name,
        }).exec();

        if (!addiv3Check) {
          const newAddiv3 = new MyAddiv3({
            ...details,
            estoreid: new ObjectId(estoreid),
            couid: new ObjectId(couid),
            adDivId1: new ObjectId(addiv1),
            adDivId2: new ObjectId(addiv2),
            name: addiv3s[i].name,
          });
          await newAddiv3.save();
        }
      }
    }

    res.json({ ok: true });

    await redisClient.del(`myNewAdded:${estoreid}`);
    clearMultiItemsCache(estoreid, "myAddiv1");
    clearMultiItemsCache(estoreid, "myAddiv2");
    clearMultiItemsCache(estoreid, "myAddiv3");
  } catch (error) {
    console.log(error.message);
  }
};

exports.saveCreatedLocation3 = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const { values, details } = req.body;
  const { country, addiv1: addiv1Body, addiv2: addiv2Body, addiv3 } = values;
  let couid = "";
  let addiv1 = "";
  let addiv2 = "";

  try {
    const countryExist = await MyCountry.findOne({
      estoreid: new ObjectId(estoreid),
    }).exec();

    if (countryExist) {
      couid = countryExist._id;
    } else {
      delete country._id;
      const newCountry = new MyCountry({
        ...country,
        estoreid: new ObjectId(estoreid),
      });
      await newCountry.save();
      couid = newCountry._id;
    }

    const addiv1Check = await MyAddiv1.findOne({
      estoreid: new ObjectId(estoreid),
      couid: new ObjectId(couid),
      name: addiv1Body.name,
    }).exec();

    if (addiv1Check) {
      addiv1 = addiv1Check._id;
    } else {
      const newAddiv1 = new MyAddiv1({
        estoreid: new ObjectId(estoreid),
        couid: new ObjectId(couid),
        name: addiv1Body.name,
      });
      await newAddiv1.save();
      addiv1 = newAddiv1._id;
    }

    const addiv2Check = await MyAddiv2.findOne({
      estoreid: new ObjectId(estoreid),
      couid: new ObjectId(couid),
      adDivId1: new ObjectId(addiv1),
      name: addiv2Body.name,
    }).exec();

    if (addiv2Check) {
      addiv2 = addiv2Check._id;
    } else {
      const newAddiv2 = new MyAddiv2({
        estoreid: new ObjectId(estoreid),
        couid: new ObjectId(couid),
        adDivId1: new ObjectId(addiv1),
        name: addiv2Body.name,
      });
      await newAddiv2.save();
      addiv2 = newAddiv2._id;
    }

    MyAddiv3.collection.insertOne({
      name: addiv3.name,
      estoreid: new ObjectId(estoreid),
      couid: new ObjectId(couid),
      adDivId1: new ObjectId(addiv1),
      adDivId2: new ObjectId(addiv2),
      ...details,
    });

    res.json({ ok: true });

    await redisClient.del(`myNewAdded:${estoreid}`);
    clearMultiItemsCache(estoreid, "myAddiv1");
    clearMultiItemsCache(estoreid, "myAddiv2");
    clearMultiItemsCache(estoreid, "myAddiv3");
  } catch (error) {
    console.log(error.message);
  }
};

exports.saveLocation3 = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const {
    country,
    addiv1: addiv1Body,
    addiv2: addiv2Body,
    addiv3,
    details,
  } = req.body;
  let couid = "";
  let addiv1 = "";
  let addiv2 = "";

  try {
    const countryExist = await MyCountry.findOne({
      estoreid: new ObjectId(estoreid),
    }).exec();

    if (countryExist) {
      couid = countryExist._id;
    } else {
      delete country._id;
      const newCountry = new MyCountry({
        ...country,
        estoreid: new ObjectId(estoreid),
      });
      await newCountry.save();
      couid = newCountry._id;
    }

    const addiv1Check = await MyAddiv1.findOne({
      estoreid: new ObjectId(estoreid),
      couid: new ObjectId(couid),
      name: addiv1Body.name,
    }).exec();

    if (addiv1Check) {
      addiv1 = addiv1Check._id;
    } else {
      const newAddiv1 = new MyAddiv1({
        estoreid: new ObjectId(estoreid),
        couid: new ObjectId(couid),
        name: addiv1Body.name,
      });
      await newAddiv1.save();
      addiv1 = newAddiv1._id;
    }

    const addiv2Check = await MyAddiv2.findOne({
      estoreid: new ObjectId(estoreid),
      couid: new ObjectId(couid),
      adDivId1: new ObjectId(addiv1),
      name: addiv2Body.name,
    }).exec();

    if (addiv2Check) {
      addiv2 = addiv2Check._id;
    } else {
      const newAddiv2 = new MyAddiv2({
        estoreid: new ObjectId(estoreid),
        couid: new ObjectId(couid),
        adDivId1: new ObjectId(addiv1),
        name: addiv2Body.name,
      });
      await newAddiv2.save();
      addiv2 = newAddiv2._id;
    }

    await MyAddiv3.collection.insertOne({
      name: addiv3.name,
      estoreid: new ObjectId(estoreid),
      couid: new ObjectId(couid),
      adDivId1: new ObjectId(addiv1),
      adDivId2: new ObjectId(addiv2),
      ...details,
    });

    res.json({ ok: true });

    await redisClient.del(`myNewAdded:${estoreid}`);
    clearMultiItemsCache(estoreid, "myAddiv1");
    clearMultiItemsCache(estoreid, "myAddiv2");
    clearMultiItemsCache(estoreid, "myAddiv3");
  } catch (error) {
    console.log(error.message);
  }
};

exports.listMyCountry = async (req, res) => {
  const estoreid = req.headers.estoreid;

  try {
    const cacheKey = `myCountry:${estoreid}`;
    const cachedCountries = await redisClient.get(cacheKey);

    if (cachedCountries && JSON.parse(cachedCountries).length > 0) {
      return res.json(JSON.parse(cachedCountries));
    }

    const countries = await MyCountry.find({
      estoreid: new ObjectId(estoreid),
    })
      .lean()
      .exec();

    await redisClient.set(cacheKey, JSON.stringify(countries), {
      EX: 604800,
    });

    return res.json(countries);
  } catch (error) {
    return res.json({
      err: "Getting countries failed. " + error.message,
    });
  }
};

exports.listNewAdded = async (req, res) => {
  const estoreid = req.headers.estoreid;

  try {
    const cacheKey = `myNewAdded:${estoreid}`;
    const cachedAddiv3 = await redisClient.get(cacheKey);

    if (cachedAddiv3) {
      return res.json(JSON.parse(cachedAddiv3));
    }

    const addiv2 = await MyAddiv2.find({
      estoreid: new ObjectId(estoreid),
    })
      .limit(10)
      .lean()
      .exec();

    const addiv3 = await MyAddiv3.find({
      adDivId2: {
        $in: addiv2.map((addiv) => addiv._id),
      },
      estoreid: new ObjectId(estoreid),
    })
      .sort({ createAt: -1 })
      .lean()
      .exec();

    await redisClient.set(cacheKey, JSON.stringify(addiv3), {
      EX: 604800,
    });

    return res.json(addiv3);
  } catch (error) {
    return res.json({
      err: "Getting newly added locations failed. " + error.message,
    });
  }
};

exports.listMyAddiv1 = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const couid = req.params.couid;

  try {
    const cacheKey = `myAddiv1:${estoreid}:${couid}`;
    const cachedAddiv1 = await redisClient.get(cacheKey);

    if (cachedAddiv1) {
      return res.json(JSON.parse(cachedAddiv1));
    }

    const addiv1 = await MyAddiv1.find({
      couid: new ObjectId(couid),
      estoreid: new ObjectId(estoreid),
    })
      .sort({ name: 1 })
      .lean()
      .exec();

    await redisClient.set(cacheKey, JSON.stringify(addiv1), {
      EX: 604800,
    });

    return res.json(addiv1);
  } catch (error) {
    return res.json({
      err: "Getting administrative divisions failed. " + error.message,
    });
  }
};

exports.listMyAddiv2 = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const couid = req.params.couid;
  const addiv1Param = req.params.addiv1;

  try {
    const cacheKey = `myAddiv2:${estoreid}:${couid}:${addiv1Param}`;
    const cachedAddiv2 = await redisClient.get(cacheKey);

    if (cachedAddiv2) {
      return res.json(JSON.parse(cachedAddiv2));
    }

    let addiv2 = [];

    if (addiv1Param === "all") {
      addiv2 = await MyAddiv2.find({
        couid: new ObjectId(couid),
        estoreid: new ObjectId(estoreid),
      })
        .sort({ name: 1 })
        .lean()
        .exec();
    } else {
      const addiv1 = new ObjectId(addiv1Param);

      addiv2 = await MyAddiv2.find({
        couid: new ObjectId(couid),
        estoreid: new ObjectId(estoreid),
        adDivId1: addiv1,
      })
        .sort({ name: 1 })
        .lean()
        .exec();
    }

    await redisClient.set(cacheKey, JSON.stringify(addiv2), {
      EX: 604800,
    });

    return res.json(addiv2);
  } catch (error) {
    return res.json({
      err: "Getting administrative divisions failed. " + error.message,
    });
  }
};

exports.listMyAddiv3 = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const couid = req.params.couid;
  const addiv1Param = req.params.addiv1;
  const addiv2Param = req.params.addiv2;

  try {
    const cacheKey = `myAddiv3:${estoreid}:${couid}:${addiv1Param}:${addiv2Param}`;
    const cachedAddiv3 = await redisClient.get(cacheKey);

    if (cachedAddiv3) {
      return res.json(JSON.parse(cachedAddiv3));
    }

    let addiv3 = [];

    if (addiv2Param === "all") {
      const addiv1 = new ObjectId(addiv1Param);

      addiv3 = await MyAddiv3.find({
        couid: new ObjectId(couid),
        estoreid: new ObjectId(estoreid),
        adDivId1: addiv1,
      })
        .sort({ name: 1 })
        .lean()
        .exec();
    } else {
      const addiv1 = new ObjectId(addiv1Param);
      const addiv2 = new ObjectId(addiv2Param);

      addiv3 = await MyAddiv3.find({
        couid: new ObjectId(couid),
        estoreid: new ObjectId(estoreid),
        adDivId1: addiv1,
        adDivId2: addiv2,
      })
        .sort({ name: 1 })
        .lean()
        .exec();
    }

    await redisClient.set(cacheKey, JSON.stringify(addiv3), {
      EX: 604800,
    });

    return res.json(addiv3);
  } catch (error) {
    return res.json({
      err: "Getting administrative divisions failed. " + error.message,
    });
  }
};

exports.getAddiv3 = async (req, res) => {
  const estoreid = req.headers.estoreid;
  try {
    const addiv3 = await MyAddiv3.findOne({
      _id: req.params.addiv3,
      estoreid: new ObjectId(estoreid),
    }).exec();
    res.json(addiv3);
  } catch (error) {
    res.status(400).send("Location search failed.");
  }
};

exports.updateMyAddiv3 = async (req, res) => {
  const estoreid = req.headers.estoreid;
  try {
    const updated = await MyAddiv3.findOneAndUpdate(
      { _id: req.params.addiv3, estoreid: new ObjectId(estoreid) },
      req.body,
      { new: true },
    );
    res.json(updated);

    await redisClient.del(`myNewAdded:${estoreid}`);
    clearMultiItemsCache(estoreid, "myAddiv1");
    clearMultiItemsCache(estoreid, "myAddiv2");
    clearMultiItemsCache(estoreid, "myAddiv3");
  } catch (error) {
    res.status(400).send("Updating location failed.");
  }
};

exports.deleteAddiv3 = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const addiv3 = req.query.addiv3;
  try {
    await MyAddiv3.findOneAndDelete({
      _id: addiv3,
      estoreid: new ObjectId(estoreid),
    }).exec();

    res.json({ ok: true });

    await redisClient.del(`myNewAdded:${estoreid}`);
    clearMultiItemsCache(estoreid, "myAddiv1");
    clearMultiItemsCache(estoreid, "myAddiv2");
    clearMultiItemsCache(estoreid, "myAddiv3");
  } catch (error) {
    res.status(400).send("Location delete failed.");
  }
};

exports.deleteAddiv2 = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const addiv2 = req.query.addiv2;
  try {
    await MyAddiv2.findOneAndDelete({
      _id: new ObjectId(addiv2),
      estoreid: new ObjectId(estoreid),
    }).exec();

    await MyAddiv3.deleteMany({
      adDivId2: new ObjectId(addiv2),
      estoreid: new ObjectId(estoreid),
    }).exec();

    res.json({ ok: true });

    await redisClient.del(`myNewAdded:${estoreid}`);
    clearMultiItemsCache(estoreid, "myAddiv1");
    clearMultiItemsCache(estoreid, "myAddiv2");
    clearMultiItemsCache(estoreid, "myAddiv3");
  } catch (error) {
    res.status(400).send("Location delete failed.");
  }
};

exports.deleteAddiv1 = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const addiv1 = req.query.addiv1;
  try {
    await MyAddiv1.findOneAndDelete({
      _id: new ObjectId(addiv1),
      estoreid: new ObjectId(estoreid),
    }).exec();

    await MyAddiv2.deleteMany({
      adDivId1: new ObjectId(addiv1),
      estoreid: new ObjectId(estoreid),
    }).exec();

    await MyAddiv3.deleteMany({
      adDivId1: new ObjectId(addiv1),
      estoreid: new ObjectId(estoreid),
    }).exec();

    res.json({ ok: true });

    await redisClient.del(`myNewAdded:${estoreid}`);
    clearMultiItemsCache(estoreid, "myAddiv1");
    clearMultiItemsCache(estoreid, "myAddiv2");
    clearMultiItemsCache(estoreid, "myAddiv3");
  } catch (error) {
    res.status(400).send("Location delete failed.");
  }
};
