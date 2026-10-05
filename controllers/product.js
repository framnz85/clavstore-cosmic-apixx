const ObjectId = require("mongoose").Types.ObjectId;
const slugify = require("slugify");

const Product = require("../models/product");
const SuperProduct = require("../models/superProduct");
const Estore = require("../models/estore");
const User = require("../models/user");
const Category = require("../models/category");
const Brand = require("../models/brand");
const Order = require("../models/order");
const Rating = require("../models/rating");

const { populateProduct } = require("./common");

const { redisClient } = require("../config/redis");
const { getUserByEmail } = require("./auth");
const {
  clearOneItemCache,
  clearMultiItemsCache,
  clearSubItemCache,
} = require("./redis/clearing");

exports.randomItems = async (req, res) => {
  const count = parseInt(req.params.count);
  const estoreid = req.headers.estoreid;
  const nextpage = req.headers.nextpage;
  const maxRandNum = parseInt(nextpage * count);
  let countProduct = 0;
  let products = [];
  let result = {};

  try {
    const cacheKey = `products:${estoreid}`;
    const cachedData = await redisClient.get(cacheKey);
    const cachedProducts = cachedData ? JSON.parse(cachedData).products : [];

    countProduct = await Product.countDocuments({
      estoreid: new ObjectId(estoreid),
    }).exec();

    if (countProduct < 1) {
      countProduct = count;
    }

    if (
      cachedProducts.length < maxRandNum &&
      cachedProducts.length < countProduct
    ) {
      const freshProducts = await Product.aggregate([
        { $match: { activate: true, estoreid: new ObjectId(estoreid) } },
        { $sample: { size: count } },
      ]).exec();

      products = cachedProducts.concat(freshProducts).slice(0, maxRandNum);

      result = {
        products,
        count: countProduct,
      };

      await redisClient.set(cacheKey, JSON.stringify(result), {
        EX: 604800,
      });
    } else {
      products = cachedProducts.slice(0, maxRandNum);

      result = {
        products,
        count: countProduct,
      };
    }

    res.json(result);
  } catch (error) {
    res.json({ err: "Getting random product failed." + error.message });
  }
};

exports.getProductBySlug = async (req, res) => {
  const slug = req.params.slug;
  const prodid = req.params.prodid;
  const estoreid = req.headers.estoreid;

  try {
    const cacheKey = `product:${estoreid}:${slug || prodid.toString()}`;
    const cachedData = await redisClient.get(cacheKey);
    const cachedProducts = cachedData ? JSON.parse(cachedData).products : [];

    if (cachedProducts.length > 0) {
      const cachedProduct = cachedProducts.find(
        (p) => p.slug === slug || p._id === prodid,
      );
      if (cachedProduct) {
        return res.json([cachedProduct]);
      }
    }

    let product = [];

    if (slug) {
      product = await Product.find({
        slug,
        estoreid: new ObjectId(estoreid),
      }).exec();
    }
    if (product && ObjectId.isValid(prodid)) {
      product = await Product.find({
        _id: new ObjectId(prodid),
        estoreid: new ObjectId(estoreid),
      }).exec();
    }

    product = await populateProduct(product, estoreid);

    await redisClient.set(
      cacheKey,
      JSON.stringify({ ...{ products: cachedProducts.concat(product) } }),
      {
        EX: 604800,
      },
    );

    res.json(product);
  } catch (error) {
    res.json({ err: "Getting a single product failed." + error.message });
  }
};

exports.getProductReviews = async (req, res) => {
  const prodid = req.params.prodid;
  const estoreid = req.headers.estoreid;

  try {
    const cacheKey = `reviews:${estoreid}:${prodid.toString()}`;
    const cachedData = await redisClient.get(cacheKey);

    if (cachedData) {
      return res.json(JSON.parse(cachedData));
    }

    let ratings = await Rating.find({
      prodid: new ObjectId(prodid),
      estoreid: new ObjectId(estoreid),
    })
      .populate("userid")
      .exec();

    await redisClient.set(cacheKey, JSON.stringify(ratings), {
      EX: 604800,
    });

    res.json(ratings);
  } catch (error) {
    res.json({ err: "Getting product reviews failed." + error.message });
  }
};

exports.getProductById = async (req, res) => {
  const prodid = req.params.prodid;
  const estoreid = req.headers.estoreid;

  try {
    const cacheKey = `product:${estoreid}:${prodid}`;
    const cachedData = await redisClient.get(cacheKey);
    const cachedProducts = cachedData ? JSON.parse(cachedData).products : [];

    if (cachedProducts.length > 0) {
      const cachedProduct = cachedProducts.find((p) => p._id === prodid);
      if (cachedProduct) {
        return res.json([cachedProduct]);
      }
    }

    let product = await Product.find({
      _id: new ObjectId(prodid),
      estoreid: new ObjectId(estoreid),
    }).exec();

    product = await populateProduct(product, estoreid);

    await redisClient.set(
      cacheKey,
      JSON.stringify({ ...{ products: cachedProducts.concat(product) } }),
      {
        EX: 604800,
      },
    );
    res.json(product);
  } catch (error) {
    res.json({ err: "Getting a single product failed." + error.message });
  }
};

exports.itemsByBarcode = async (req, res) => {
  const barcode = req.params.barcode;
  const estoreid = req.headers.estoreid;
  const purpose = req.headers.purpose;

  try {
    const cacheKey = `product:${estoreid}:${barcode}`;
    const cachedData = await redisClient.get(cacheKey);
    const cachedProducts = cachedData ? JSON.parse(cachedData).products : [];

    if (cachedProducts.length > 0) {
      const cachedProduct = cachedProducts.find((p) => p.barcode === barcode);
      if (cachedProduct && (purpose === "read" || purpose === "inventory")) {
        return res.json([cachedProduct]);
      }
    }

    let products = [];

    if (purpose === "read" || purpose === "inventory") {
      products = await Product.find({
        barcode,
        estoreid: new ObjectId(estoreid),
      })
        .sort({ updatedAt: -1 })
        .limit(5)
        .exec();
    } else {
      products = await SuperProduct.find({
        barcode,
      })
        .sort({ updatedAt: -1 })
        .populate("estoreid")
        .limit(5)
        .exec();
    }

    products = await populateProduct(products, estoreid);

    if (purpose === "read" || purpose === "inventory") {
      await redisClient.set(
        cacheKey,
        JSON.stringify({ ...{ products: cachedProducts.concat(products) } }),
        {
          EX: 604800,
        },
      );
    }
    res.json(products);
  } catch (error) {
    res.json({ err: "Getting a product by barcode failed." + error.message });
  }
};

exports.loadInitProducts = async (req, res) => {
  const estoreidFrom = Object("613216389261e003d696cc65");
  const estoreid = new ObjectId(req.headers.estoreid);
  const count = req.params.count;
  const email = req.user.email;

  try {
    const user = await getUserByEmail(email, estoreid);

    if (user) {
      const products = await Product.find({
        estoreid: estoreidFrom,
        initial: 1,
      }).select(
        "-_id -discounttype -quantity -sold -createdAt -updatedAt -__v",
      );

      for (let i = products.length; i; i--) {
        let j = Math.floor(Math.random() * i);
        [products[i - 1], products[j]] = [products[j], products[i - 1]];
      }

      const copyingProducts = products.slice(0, count).map((product) => {
        const images = product.images.map((img) => {
          return {
            ...img,
            sourceid: estoreidFrom,
            fromid: estoreidFrom,
            copied: true,
          };
        });
        return { ...product._doc, images, estoreid };
      });
      const newProducts = await Product.insertMany(copyingProducts);

      const categoryIds = copyingProducts.map((prod) => prod.category);

      if (newProducts.length) {
        const categories = await Category.find({
          _id: { $in: categoryIds },
          estoreid: estoreidFrom,
          initial: 1,
        });

        categories.forEach(async (category) => {
          const images = category.images.map((img) => {
            return {
              ...img,
              sourceid: estoreidFrom,
              fromid: estoreidFrom,
              copied: true,
            };
          });
          const newCategory = new Category({
            name: category.name,
            slug: category.slug,
            images,
            estoreid,
          });
          await newCategory.save();
          await Product.updateMany(
            { category: new ObjectId(category._id), estoreid },
            { category: new ObjectId(newCategory._id) },
            { new: true },
          );
        });

        await clearOneItemCache(estoreid, "products");
        await clearMultiItemsCache(estoreid, "adminItems");
        await clearMultiItemsCache(estoreid, "searchProduct");
        await clearMultiItemsCache(estoreid, "product");
        await clearMultiItemsCache(estoreid, "products");

        await clearOneItemCache(estoreid, "categories");
        await clearOneItemCache(estoreid, "brands");

        res.json({ ok: true });
      }
    } else {
      res.json({ err: "Cannot fetch this order." });
    }
  } catch (error) {
    res.json({ err: "Getting products failed." + error.message });
  }
};

exports.getWaitingProducts = async (req, res) => {
  const estoreid = new ObjectId(req.headers.estoreid);
  const email = req.user.email;

  try {
    const user = await getUserByEmail(email, estoreid);
    if (user) {
      const products = await Product.find({
        estoreid: new ObjectId(estoreid),
        "waiting._id": { $exists: true },
      })
        .select("waiting")
        .exec();

      res.json(products);
    } else {
      res.json({ err: "Cannot fetch the user details." });
    }
  } catch (error) {
    res.json({ err: "Getting waiting products failed." + error.message });
  }
};

exports.getAdminItems = async (req, res) => {
  const estoreid = req.headers.estoreid;

  try {
    const {
      sortkey,
      sort,
      currentPage,
      pageSize,
      searchQuery,
      category,
      barcode,
      sales,
    } = req.body;

    const cacheKey = `adminItems:${estoreid}:${JSON.stringify({
      sortkey,
      sort,
      currentPage,
      pageSize,
      searchQuery: searchQuery || "",
      category: category || "",
      barcode: barcode || false,
      sales: sales || null,
    })}`;

    const cachedData = await redisClient.get(cacheKey);

    if (cachedData) {
      return res.json(JSON.parse(cachedData));
    }

    const searchObj = {
      estoreid: new ObjectId(estoreid),
    };

    if (searchQuery) {
      searchObj.$or = [
        {
          title: {
            $regex: searchQuery,
            $options: "i",
          },
        },
        {
          description: {
            $regex: searchQuery,
            $options: "i",
          },
        },
        {
          slug: {
            $regex: searchQuery,
            $options: "i",
          },
        },
      ];
    }

    if (category && category !== "1") {
      searchObj.category = new ObjectId(category);
    }

    if (barcode) {
      searchObj.barcode = { $ne: null };
    }

    let products = await Product.find(searchObj)
      .skip((currentPage - 1) * pageSize)
      .sort({ [sortkey]: sort })
      .limit(pageSize)
      .exec();

    if (products.length < 1 && searchQuery) {
      products = await Product.find({
        title: {
          $regex: searchQuery,
          $options: "i",
        },
        estoreid: new ObjectId(estoreid),
      })
        .skip((currentPage - 1) * pageSize)
        .sort({ [sortkey]: sort })
        .limit(pageSize)
        .exec();
    }

    const countProduct = await Product.countDocuments(searchObj).exec();

    if (sales && sales.type && sales.type === "sales") {
      const newProdSold = [];

      for (let i = 0; i < products.length; i++) {
        const result = await Order.find({
          estoreid: Object(estoreid),
          "products.product": new ObjectId(products[i]._id),
          createdAt: {
            $gte: new Date(new Date(sales.dateStart).setHours(0, 0, 0)),
            $lt: new Date(new Date(sales.endDate).setHours(23, 59, 59)),
          },
        })
          .select("products")
          .exec();

        if (result.length > 0) {
          let totalSold = 0;

          for (let j = 0; j < result.length; j++) {
            for (let k = 0; k < result[j].products.length; k++) {
              totalSold = totalSold + result[j].products[k].count;
            }
          }

          newProdSold.push({
            ...products[i]._doc,
            sold: totalSold,
          });
        } else {
          newProdSold.push({
            ...products[i]._doc,
            sold: 0,
          });
        }
      }

      products = [...newProdSold];
    }

    const responseData = {
      products,
      count: countProduct,
    };

    await redisClient.set(cacheKey, JSON.stringify(responseData), {
      EX: 604800,
    });

    res.json(responseData);
  } catch (error) {
    res.json({
      err: "Listing product failed. " + error.message,
    });
  }
};

exports.addProduct = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const platform = req.headers.platform;
  try {
    if (platform === "cosmic") {
      const checkExist = await Product.findOne({
        slug: slugify(req.body.title.toString().toLowerCase()),
        estoreid: new ObjectId(estoreid),
      });
      if (checkExist) {
        res.json({
          err: "Sorry, this product is already existing. Choose another tittle for the product.",
        });
      } else {
        let product = new Product({
          ...req.body,
          slug: slugify(req.body.title.toString().toLowerCase()),
          estoreid: new ObjectId(estoreid),
        });
        await product.save();
        product = await populateProduct([product], estoreid);

        await clearOneItemCache(estoreid, "products");
        await clearMultiItemsCache(estoreid, "adminItems");
        await clearMultiItemsCache(estoreid, "searchProduct");
        await clearMultiItemsCache(estoreid, "product");
        await clearMultiItemsCache(estoreid, "products");

        res.json(product[0]);
      }
    } else {
      res.json({
        err: `Sorry, your account is not a valid account.`,
      });
    }
  } catch (error) {
    res.json({ err: "Adding product failed. " + error.message });
  }
};

exports.searchProduct = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const text = req.body.text || "";
  const catSlug = req.body.catSlug || "all";
  const type = req.body.type || "";
  const price = req.body.price || null;
  const page = parseInt(req.body.page) || 1;

  const querySearch = {};
  const noResultSearch = {};
  let products = [];

  try {
    const cacheData = {
      estoreid,
      text,
      catSlug,
      type,
      price,
      page,
    };

    const cacheKey =
      `searchProduct:${estoreid}:` +
      Buffer.from(JSON.stringify(cacheData)).toString("base64url");

    const cachedProducts = await redisClient.get(cacheKey);

    if (cachedProducts) {
      return res.json(JSON.parse(cachedProducts));
    }

    if (text) {
      querySearch.$or = [
        {
          title: {
            $regex: text,
            $options: "i",
          },
        },
        {
          description: {
            $regex: text,
            $options: "i",
          },
        },
        {
          slug: {
            $regex: text,
            $options: "i",
          },
        },
      ];
    }

    if (type === "brand") {
      if (catSlug && catSlug !== "all") {
        const brand = await Brand.findOne({
          slug: catSlug,
          estoreid: new ObjectId(estoreid),
        });

        if (brand) {
          querySearch.brand = new ObjectId(brand._id);
          noResultSearch.brand = new ObjectId(brand._id);
        }
      }
    } else {
      if (catSlug && catSlug !== "all") {
        const category = await Category.findOne({
          slug: catSlug,
          estoreid: new ObjectId(estoreid),
        });

        if (category) {
          querySearch.category = new ObjectId(category._id);
          noResultSearch.category = new ObjectId(category._id);
        }
      }
    }

    if (price) {
      querySearch.price = {
        $gt: parseFloat(price[0]),
        $lt: parseFloat(price[1]),
      };

      noResultSearch.price = {
        $gt: parseFloat(price[0]),
        $lt: parseFloat(price[1]),
      };
    }

    if (Object.keys(querySearch).length) {
      products = await Product.find({
        ...querySearch,
        estoreid: new ObjectId(estoreid),
      })
        .skip((page - 1) * 30)
        .limit(30)
        .exec();

      if (products.length < 31 && text) {
        products = await Product.find({
          title: {
            $regex: text,
            $options: "i",
          },
          estoreid: new ObjectId(estoreid),
          ...noResultSearch,
        }).exec();
      }
    } else {
      products = await Product.find({
        estoreid: new ObjectId(estoreid),
      })
        .skip((page - 1) * 30)
        .limit(30)
        .exec();
    }

    await redisClient.set(cacheKey, JSON.stringify(products), {
      EX: 604800,
    });

    return res.json(products);
  } catch (error) {
    return res.json({
      err: "Searching products failed. " + error.message,
    });
  }
};

exports.submitRating = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const prodid = req.body.prodid;
  const rate = req.body.rate;
  const images = req.body.images;
  const review = req.body.review;
  const rateDefault = req.body.rateDefault;
  const email = req.user.email;

  try {
    const user = await User.findOne({ email }).exec();
    const checkRatingExist = await Rating.findOne({
      userid: new ObjectId(user._id),
      prodid: new ObjectId(prodid),
      estoreid: new ObjectId(estoreid),
    }).exec();
    if (checkRatingExist) {
      await Rating.findOneAndUpdate(
        {
          userid: new ObjectId(user._id),
          prodid: new ObjectId(prodid),
          estoreid: new ObjectId(estoreid),
        },
        { rate, images, review },
        { new: true },
      );
    } else {
      const newRating = new Rating({
        userid: new ObjectId(user._id),
        prodid: new ObjectId(prodid),
        estoreid: new ObjectId(estoreid),
        rate,
        images,
        review,
      });
      await newRating.save();
    }

    const ratings = await Rating.find({
      prodid: new ObjectId(prodid),
      estoreid: new ObjectId(estoreid),
    }).exec();

    const finalRatings =
      ratings.reduce((partialSum, a) => partialSum + a.rate, 0) +
      parseFloat(rateDefault.ratings) * parseFloat(rateDefault.ratingCount);
    const finalRatingCount =
      parseFloat(ratings.length) + parseFloat(rateDefault.ratingCount);
    const finalRating = finalRatings / finalRatingCount;

    await Product.findOneAndUpdate(
      {
        _id: new ObjectId(prodid),
        estoreid: new ObjectId(estoreid),
      },
      {
        rateGroup: {
          ratings: finalRating,
          ratingCount: finalRatingCount,
          rateDefault,
        },
      },
      { new: true },
    );

    await clearMultiItemsCache(estoreid, "reviews");

    res.json({
      ratings: finalRating,
      ratingCount: finalRatingCount,
      rateDefault,
    });
  } catch (error) {
    res.json({ err: "Submitting product rating failed. " + error.message });
  }
};

exports.updateProduct = async (req, res) => {
  const prodid = req.params.prodid;
  const estoreid = req.headers.estoreid;
  let values = req.body;
  const title = req.body.title;

  if (title) {
    values = {
      ...values,
      slug: slugify(title.toString().toLowerCase()),
    };
  }

  try {
    const estore = await Estore.findOne({
      _id: new ObjectId(estoreid),
    })
      .populate("upgradeType upStatus2")
      .exec();

    const countProduct = await Product.countDocuments({
      aiIndex: true,
      estoreid: new ObjectId(estoreid),
    }).exec();

    if (
      countProduct > 100 &&
      values.aiIndex === true &&
      (estore.upgradeType !== "2" || estore.upStatus2 !== "Active")
    ) {
      res.json({
        err: "Sorry, you have reached the maximum number of AI indexed products. You can only index up to 100 products.",
        upgrade: true,
      });
      return;
    }

    const ratings = await Rating.find({
      prodid: new ObjectId(prodid),
      estoreid: new ObjectId(estoreid),
    }).exec();

    const finalRatings =
      ratings.reduce((partialSum, a) => partialSum + a.rate, 0) +
      parseFloat(
        values.rateGroup &&
          values.rateGrouprateDefault &&
          values.rateGroup.rateDefault.ratings
          ? values.rateGroup.rateDefault.ratings
          : 0,
      ) *
        parseFloat(
          values.rateGroup &&
            values.rateGrouprateDefault &&
            values.rateGroup.rateDefault.ratingCount
            ? values.rateGroup.rateDefault.ratingCount
            : 0,
        );
    const finalRatingCount =
      parseFloat(ratings.length) +
      parseFloat(
        values.rateGroup &&
          values.rateGrouprateDefault &&
          values.rateGroup.rateDefault.ratingCount
          ? values.rateGroup.rateDefault.ratingCount
          : 0,
      );
    const finalRating = finalRatings / finalRatingCount;
    let product = await Product.findOneAndUpdate(
      {
        _id: new ObjectId(prodid),
        estoreid: new ObjectId(estoreid),
      },
      {
        ...values,
        rateGroup: {
          ratings: finalRating ? parseFloat(finalRating) : 0,
          ratingCount: finalRatingCount ? parseFloat(finalRatingCount) : 0,
          rateDefault:
            values.rateGroup && values.rateGroup.rateDefault
              ? values.rateGroup.rateDefault
              : { ratings: 0, ratingCount: 0 },
        },
      },
      { new: true },
    );

    product = await populateProduct([product], estoreid);

    await clearOneItemCache(estoreid, "products");
    await clearMultiItemsCache(estoreid, "adminItems");
    await clearMultiItemsCache(estoreid, "searchProduct");
    await clearMultiItemsCache(estoreid, "product");
    await clearMultiItemsCache(estoreid, "products");

    res.json(product[0]);
  } catch (error) {
    res.json({ err: "Updating product failed. " + error.message });
  }
};

exports.receiveProducts = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const products = req.body;

  try {
    for (let i = 0; i < products.length; i++) {
      if (products[i].supplierPrice === products[i].newSupplierPrice) {
        const checkProduct = await Product.findOne({
          _id: new ObjectId(products[i]._id),
          estoreid: new ObjectId(estoreid),
        })
          .select("quantity")
          .exec();
        await Product.findOneAndUpdate(
          {
            _id: new ObjectId(products[i]._id),
            estoreid: new ObjectId(estoreid),
          },
          {
            quantity: checkProduct.quantity
              ? parseFloat(checkProduct.quantity) +
                parseFloat(products[i].newQuantity)
              : parseFloat(products[i].newQuantity),
          },
          { new: true },
        );
      } else {
        await Product.findOneAndUpdate(
          {
            _id: new ObjectId(products[i]._id),
            estoreid: new ObjectId(estoreid),
          },
          { waiting: products[i] },
          { new: true },
        );
      }
    }

    await clearOneItemCache(estoreid, "products");
    await clearMultiItemsCache(estoreid, "adminItems");
    await clearMultiItemsCache(estoreid, "searchProduct");
    await clearMultiItemsCache(estoreid, "product");
    await clearMultiItemsCache(estoreid, "products");

    res.json({ ok: true });
  } catch (error) {
    res.json({ err: "Receiving product failed. " + error.message });
  }
};

exports.importProducts = async (req, res) => {
  const estoreid = req.headers.estoreid;
  try {
    const products = req.body.products;
    for (let i = 0; i < products.length; i++) {
      if (products[i].delete) {
        await Product.findOneAndDelete({
          _id: new ObjectId(products[i]._id),
          estoreid: new ObjectId(estoreid),
        });
      } else {
        if (products[i].category && ObjectId.isValid(products[i].category)) {
          const checkCategory = await Category.findOne({
            cat_code: new ObjectId(products[i].category),
            estoreid: new ObjectId(estoreid),
          }).exec();
          if (checkCategory) {
            products[i] = {
              ...products[i],
              category: new ObjectId(checkCategory._id),
            };
          } else {
            products[i] = {
              ...products[i],
              category: new ObjectId(products[i].category),
            };
          }
        } else {
          delete products[i].category;
        }

        if (products[i].brand && ObjectId.isValid(products[i].brand)) {
          const checkBrand = await Brand.findOne({
            bra_code: new ObjectId(products[i].brand),
            estoreid: new ObjectId(estoreid),
          }).exec();
          if (checkBrand) {
            products[i] = {
              ...products[i],
              brand: new ObjectId(checkBrand._id),
            };
          } else {
            products[i] = {
              ...products[i],
              brand: new ObjectId(products[i].brand),
            };
          }
        } else {
          delete products[i].brand;
        }

        if (
          products[i].markupType !== "percent" ||
          products[i].markupType !== "number"
        ) {
          products[i] = {
            ...products[i],
            markupType: "percent",
          };
        }

        if (
          products[i].discounttype !== "percent" ||
          products[i].discounttype !== "number"
        ) {
          products[i] = {
            ...products[i],
            discounttype: "percent",
          };
        }

        if (products[i]._id && ObjectId.isValid(products[i]._id)) {
          await Product.findOneAndUpdate(
            {
              _id: new ObjectId(products[i]._id),
              estoreid: new ObjectId(estoreid),
            },
            products[i],
            { new: true },
          );
        } else {
          const checkExist = await Product.findOne({
            slug: slugify(products[i].title.toString().toLowerCase()),
            estoreid: new ObjectId(estoreid),
          });
          if (checkExist) {
            await Product.findOneAndUpdate(
              {
                slug: slugify(products[i].title.toString().toLowerCase()),
                estoreid: new ObjectId(estoreid),
              },
              products[i],
              { new: true },
            );
          } else {
            const product = new Product({
              ...products[i],
              images: products[i].images
                ? products[i].images.map((img) => {
                    return {
                      ...img,
                      sourceid: img.sourceid ? img.sourceid : "",
                      fromid: img.fromid ? img.fromid : "",
                      copied: true,
                    };
                  })
                : [],
              slug: slugify(products[i].title.toString().toLowerCase()),
              estoreid: new ObjectId(estoreid),
            });
            await product.save();
          }
        }
      }
    }

    await clearOneItemCache(estoreid, "products");
    await clearMultiItemsCache(estoreid, "adminItems");
    await clearMultiItemsCache(estoreid, "searchProduct");
    await clearMultiItemsCache(estoreid, "product");
    await clearMultiItemsCache(estoreid, "products");

    res.json({ ok: true });
  } catch (error) {
    res.json({ err: "Importing product failed. " + error.message });
  }
};

exports.updateWaitingProduct = async (req, res) => {
  const estoreid = req.headers.estoreid;
  try {
    await Product.findOneAndUpdate(
      {
        _id: new ObjectId(req.body._id),
        estoreid: new ObjectId(estoreid),
      },
      { waiting: req.body },
      { new: true },
    );

    await clearOneItemCache(estoreid, "products");
    await clearMultiItemsCache(estoreid, "adminItems");
    await clearMultiItemsCache(estoreid, "searchProduct");
    await clearMultiItemsCache(estoreid, "product");
    await clearMultiItemsCache(estoreid, "products");

    res.json({ ok: true });
  } catch (error) {
    res.json({ err: "Updating the waiting product failed. " + error.message });
  }
};

exports.deleteProduct = async (req, res) => {
  const prodid = req.params.prodid;
  const estoreid = req.headers.estoreid;
  try {
    let product = await Product.findOneAndDelete({
      _id: new ObjectId(prodid),
      estoreid: new ObjectId(estoreid),
    }).exec();
    if (product) {
      product = await populateProduct([product], estoreid);

      await clearOneItemCache(estoreid, "products");
      await clearMultiItemsCache(estoreid, "adminItems");
      await clearMultiItemsCache(estoreid, "reviews");
      await clearMultiItemsCache(estoreid, "searchProduct");
      await clearMultiItemsCache(estoreid, "product");
      await clearMultiItemsCache(estoreid, "products");

      res.json(product[0]);
    } else {
      res.json({ err: "Product does not exist in the system." });
    }
  } catch (error) {
    res.json({ err: "Deleting product failed. " + error.message });
  }
};

exports.deleteWaitingProduct = async (req, res) => {
  const waitid = req.params.waitid;
  const estoreid = req.headers.estoreid;
  try {
    let product = await Product.findOneAndUpdate(
      {
        _id: new ObjectId(waitid),
        estoreid: new ObjectId(estoreid),
      },
      { waiting: {} },
      { new: true },
    );

    await clearOneItemCache(estoreid, "products");
    await clearMultiItemsCache(estoreid, "adminItems");
    await clearMultiItemsCache(estoreid, "reviews");
    await clearMultiItemsCache(estoreid, "searchProduct");
    await clearMultiItemsCache(estoreid, "product");
    await clearMultiItemsCache(estoreid, "products");

    res.json({ ok: true });
  } catch (error) {
    res.json({ err: "Updating the waiting product failed. " + error.message });
  }
};

exports.checkImageUser = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const publicid = req.params.publicid;

  try {
    let product = await Product.findOne({
      images: {
        $elemMatch: { public_id: publicid },
      },
      estoreid: { $ne: new ObjectId(estoreid) },
    }).exec();

    if (product) {
      res.json({ delete: false });
    } else {
      product = await Product.findOne({
        images: {
          $elemMatch: { public_id: publicid },
        },
        estoreid: new ObjectId(estoreid),
      }).exec();

      const theImage =
        product && product.images
          ? product.images.filter((img) => img.public_id === publicid)
          : [];

      if (
        theImage &&
        theImage[0] &&
        theImage[0].length &&
        theImage[0].length > 0 &&
        theImage[0].fromid
      ) {
        if (theImage[0].fromid === estoreid) {
          res.json({ delete: true });
        } else {
          res.json({ delete: false });
        }
      } else {
        res.json({ delete: true });
      }
    }
  } catch (error) {
    res.status(400).send("Checking image user failed.");
  }
};

exports.inventorySummary = async (req, res) => {
  const estoreid = req.headers.estoreid;

  try {
    const result = await Product.aggregate([
      {
        $match: {
          estoreid: new ObjectId(estoreid),
        },
      },
      {
        $group: {
          _id: null,

          cost: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $isNumber: "$quantity" },
                    { $isNumber: "$supplierPrice" },
                  ],
                },
                {
                  $multiply: ["$quantity", "$supplierPrice"],
                },
                0,
              ],
            },
          },

          price: {
            $sum: {
              $cond: [
                {
                  $and: [{ $isNumber: "$quantity" }, { $isNumber: "$price" }],
                },
                {
                  $multiply: ["$quantity", "$price"],
                },
                0,
              ],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          cost: 1,
          price: 1,
        },
      },
    ]);

    const summary = result[0] || {
      cost: 0,
      price: 0,
    };

    return res.json(summary);
  } catch (error) {
    return res.json({
      err: "Fetching inventory failed. " + error.message,
    });
  }
};
