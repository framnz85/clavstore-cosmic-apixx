const ObjectId = require("mongoose").Types.ObjectId;
const Category = require("../models/category");
const Brand = require("../models/brand");
const Raffle = require("../models/raffle");
const User = require("../models/user");
const Product = require("../models/product");
const Estore = require("../models/estore");
const MyAddiv3 = require("../models/myAddiv3");

const { redisClient } = require("../config/redis");
const { clearOneItemCache, clearMultiItemsCache } = require("./redis/clearing");

exports.populateProduct = async (products, estoreid) => {
  let categories = [];
  let brands = [];
  let newProducts = [];

  products = products.map((product) => {
    if (product.category) {
      categories.push(product.category);
    }

    if (product.brand) {
      brands.push(product.brand);
    }

    return product;
  });

  categories = [
    ...new Set(
      categories
        .filter((id) => id && ObjectId.isValid(id))
        .map((id) => id.toString()),
    ),
  ];

  brands = [
    ...new Set(
      brands
        .filter((id) => id && ObjectId.isValid(id))
        .map((id) => id.toString()),
    ),
  ];

  const categoryCacheKey = `categories:${estoreid}`;
  const brandCacheKey = `brands:${estoreid}`;

  let categoryList = [];
  let brandList = [];

  const cachedCategories = await redisClient.get(categoryCacheKey);

  if (cachedCategories) {
    const parsedCategories = JSON.parse(cachedCategories);

    categoryList = Array.isArray(parsedCategories) ? parsedCategories : [];
  } else {
    categoryList = await Category.find({
      estoreid: new ObjectId(estoreid),
    })
      .lean()
      .exec();

    await redisClient.set(categoryCacheKey, JSON.stringify(categoryList), {
      EX: 604800,
    });
  }

  const cachedBrands = await redisClient.get(brandCacheKey);

  if (cachedBrands) {
    const parsedBrands = JSON.parse(cachedBrands);

    brandList = Array.isArray(parsedBrands) ? parsedBrands : [];
  } else {
    brandList = await Brand.find({
      estoreid: new ObjectId(estoreid),
    })
      .lean()
      .exec();

    await redisClient.set(brandCacheKey, JSON.stringify(brandList), {
      EX: 604800,
    });
  }

  if (categories.length > 0) {
    const categoryIds = new Set(categories);

    categoryList = categoryList.filter(
      (category) =>
        category && category._id && categoryIds.has(category._id.toString()),
    );
  } else {
    categoryList = [];
  }

  if (brands.length > 0) {
    const brandIds = new Set(brands);

    brandList = brandList.filter(
      (brand) => brand && brand._id && brandIds.has(brand._id.toString()),
    );
  } else {
    brandList = [];
  }

  products = products.map((product) => {
    const productData = product._doc ? product._doc : product;

    const category = categoryList.find(
      (cat) =>
        cat &&
        cat._id &&
        product.category &&
        cat._id.toString() === product.category.toString(),
    );

    const brand = brandList.find(
      (bra) =>
        bra &&
        bra._id &&
        product.brand &&
        bra._id.toString() === product.brand.toString(),
    );

    if (product.brand) {
      return {
        ...productData,
        category,
        brand,
      };
    }

    return {
      ...productData,
      category,
    };
  });

  for (let i = 0; i < products.length; i++) {
    let variants = [];

    if (
      products[i]._id &&
      products[i].brand &&
      products[i].brand._id &&
      ObjectId.isValid(products[i].brand._id)
    ) {
      const productId = products[i]._id.toString();
      const variantsCacheKey = `variants:${estoreid}:${productId}`;

      const cachedVariants = await redisClient.get(variantsCacheKey);

      if (cachedVariants) {
        try {
          variants = JSON.parse(cachedVariants);
        } catch (error) {
          variants = [];
        }
      } else {
        variants = await Product.find({
          brand: new ObjectId(products[i].brand._id),
          estoreid: new ObjectId(estoreid),
        })
          .select("_id slug variantName")
          .lean()
          .exec();

        await redisClient.set(variantsCacheKey, JSON.stringify(variants), {
          EX: 259200, // 7 days
        });
      }
    }

    newProducts.push({
      ...products[i],
      variants,
    });
  }

  return newProducts;
};

exports.createRaffle = async (estoreid, user, order) => {
  try {
    const estore = await Estore.findOne({
      _id: new ObjectId(estoreid),
    }).exec();

    const date1 = new Date(estore.raffleDate);
    const date2 = new Date();
    const timeDifference = date1.getTime() - date2.getTime();
    const daysDifference = Math.round(timeDifference / (1000 * 3600 * 24));

    if (
      user.role === "customer" &&
      estore.raffleActivation &&
      daysDifference > 0
    ) {
      const raffleInsert = {
        estoreid,
        owner: user._id,
        orderid: order._id,
        raffleDate: estore.raffleDate,
      };
      const raffleCount = Math.floor(
        parseFloat(order.cartTotal) / parseFloat(estore.raffleEntryAmount),
      );

      const raffleEntries = Array(raffleCount).fill(raffleInsert);

      Raffle.insertMany(raffleEntries);
    }
  } catch (error) {
    res.json({ err: "Deleting an estore failed. " + error.message });
  }
};

exports.populateRaffle = async (entries) => {
  let owners = [];

  entries = entries.map((entry) => {
    owners.push(entry.owner);
    return entry;
  });

  const ownerList = await User.find({ _id: { $in: owners } }).exec();

  entries = entries.map((entry) => {
    return {
      ...(entry._doc ? entry._doc : entry),
      owner: ownerList.find(
        (owner) =>
          owner._id &&
          entry.owner &&
          owner._id.toString() === entry.owner.toString(),
      ),
    };
  });

  return entries;
};

exports.populateEstore = async (estores) => {
  let estoreids = [];

  estores = estores.map((estore) => {
    estoreids.push(estore._id);
    return estore;
  });

  const ownerList = await User.find({
    estoreid: { $in: estoreids },
    role: "admin",
  }).exec();

  estores = estores.map((estore) => {
    return {
      ...(estore._doc ? estore._doc : estore),
      owner: ownerList.find(
        (owner) =>
          estore._id &&
          owner.estoreid &&
          owner.estoreid.toString() === estore._id.toString(),
      ),
    };
  });

  return estores;
};

exports.checkOrderedProd = async (products, estoreid) => {
  let errorProduct = {};
  for (i = 0; i < products.length; i++) {
    let finalMarkup = 0;
    let finalDiscount = 0;

    const productId = products[i].product;
    const productCacheKey = `products:${estoreid}`;

    let checkProduct = null;

    const cachedProductsData = await redisClient.get(productCacheKey);

    if (cachedProductsData) {
      const parsedData = JSON.parse(cachedProductsData);

      const cachedProducts = Array.isArray(parsedData.products)
        ? parsedData.products
        : [];

      checkProduct = cachedProducts.find(
        (product) =>
          product &&
          product._id &&
          product._id.toString() === productId.toString(),
      );
    }

    if (!checkProduct) {
      if (!ObjectId.isValid(productId)) {
        checkProduct = null;
      } else {
        checkProduct = await Product.findOne({
          _id: new ObjectId(productId),
          estoreid: new ObjectId(estoreid),
        }).exec();
      }
    }

    if (!products[i].excess && checkProduct) {
      if (
        parseFloat(products[i].count) > parseFloat(checkProduct.quantity) &&
        !checkProduct.segregate
      ) {
        errorProduct = checkProduct;
      }
    }
    const newQuantity =
      checkProduct && checkProduct.waiting && checkProduct.waiting.newQuantity
        ? checkProduct.waiting.newQuantity
        : 0;

    const newSupplierPrice =
      checkProduct &&
      checkProduct.waiting &&
      checkProduct.waiting.newSupplierPrice
        ? checkProduct.waiting.newSupplierPrice
        : checkProduct.supplierPrice;

    if (parseFloat(checkProduct.markup) > 0) {
      if (checkProduct.markupType === "percent") {
        finalMarkup =
          (parseFloat(checkProduct.markup) * parseFloat(newSupplierPrice)) /
          100;
      } else {
        finalMarkup = parseFloat(checkProduct.markup);
      }
    }

    if (parseFloat(checkProduct.discount) > 0) {
      if (checkProduct.discounttype === "percent") {
        finalDiscount =
          (parseFloat(checkProduct.discount) * parseFloat(newSupplierPrice)) /
          100;
      } else {
        finalDiscount = parseFloat(checkProduct.discount);
      }
    }

    const newPrice = newSupplierPrice + finalMarkup - finalDiscount;

    if (
      products[i].excess &&
      !checkProduct.segregate &&
      newQuantity < products[i].count
    ) {
      errorProduct = {
        ...checkProduct._doc,
        price: newPrice,
        quantity: newQuantity,
      };
    }
  }
  if (errorProduct && errorProduct._id) {
    return {
      err: `Sorry, the remaining quantity for ${errorProduct.title} priced @ ${errorProduct.price} is now only ${errorProduct.quantity}`,
    };
  }
};

const handleUpdateProd = async (product, estoreid, updateType) => {
  const productId = product.product;
  const productCacheKey = `products:${estoreid}`;

  let checkProduct = null;

  const cachedProductsData = await redisClient.get(productCacheKey);

  if (cachedProductsData) {
    const parsedData = JSON.parse(cachedProductsData);

    const cachedProducts = Array.isArray(parsedData.products)
      ? parsedData.products
      : [];

    checkProduct = cachedProducts.find(
      (product) =>
        product &&
        product._id &&
        product._id.toString() === productId.toString(),
    );
  }

  if (!checkProduct) {
    if (!ObjectId.isValid(productId)) {
      checkProduct = null;
    } else {
      checkProduct = await Product.findOne({
        _id: new ObjectId(productId),
        estoreid: new ObjectId(estoreid),
      }).exec();
    }
  }

  if (checkProduct) {
    let finalQty = 0;
    let finalSold = 0;
    let finalMarkup = 0;
    let finalDiscount = 0;

    if (updateType) {
      finalQty = parseFloat(checkProduct.quantity) - parseFloat(product.count);
      finalSold = parseFloat(checkProduct.sold) + parseFloat(product.count);
    } else {
      finalQty = parseFloat(checkProduct.quantity) + parseFloat(product.count);
      finalSold = parseFloat(checkProduct.sold) - parseFloat(product.count);
    }

    const result = await Product.findOneAndUpdate(
      {
        _id: new ObjectId(product.product),
        estoreid: new ObjectId(estoreid),
      },
      {
        quantity: parseFloat(finalQty) > 0 ? parseFloat(finalQty) : 0,
        sold: parseFloat(finalSold) > 0 ? parseFloat(finalSold) : 0,
      },
      { new: true },
    );

    if (
      updateType &&
      result &&
      result.waiting &&
      result.waiting.newQuantity &&
      result.quantity <= 0
    ) {
      let newQuantity =
        result && result.waiting && result.waiting.newQuantity
          ? parseFloat(result.waiting.newQuantity)
          : 0;

      if (product.excess) {
        newQuantity = parseFloat(newQuantity) - parseFloat(product.count);
      }

      const newSupplierPrice =
        result && result.waiting && result.waiting.newSupplierPrice
          ? parseFloat(result.waiting.newSupplierPrice)
          : parseFloat(result.supplierPrice);

      if (parseFloat(checkProduct.markup) > 0) {
        if (checkProduct.markupType === "percent") {
          finalMarkup =
            (parseFloat(checkProduct.markup) * parseFloat(newSupplierPrice)) /
            100;
        } else {
          finalMarkup = parseFloat(checkProduct.markup);
        }
      }

      if (parseFloat(checkProduct.discount) > 0) {
        if (checkProduct.discounttype === "percent") {
          finalDiscount =
            (parseFloat(checkProduct.discount) * parseFloat(newSupplierPrice)) /
            100;
        } else {
          finalDiscount = parseFloat(checkProduct.discount);
        }
      }

      const newPrice = newSupplierPrice + finalMarkup - finalDiscount;

      await Product.findOneAndUpdate(
        {
          _id: new ObjectId(product.product),
          estoreid: new ObjectId(estoreid),
        },
        {
          quantity: newQuantity,
          supplierPrice: newSupplierPrice,
          price: newPrice,
          waiting: {},
        },
        { new: true },
      );
    }
  }
};

exports.updateOrderedProd = async (products, estoreid, updateType) => {
  let remainingProds = products;
  const listOfExcess = products.filter((prod) => prod.excess);

  if (updateType) {
    for (i = 0; i < listOfExcess.length; i++) {
      let mainExcess = products.filter(
        (prod) =>
          prod.product.toString() === listOfExcess[i].product.toString() &&
          prod._id.toString() !== listOfExcess[i]._id.toString(),
      );
      if (mainExcess[0] && mainExcess[0]._id) {
        await handleUpdateProd(mainExcess[0], estoreid, updateType);
        remainingProds = remainingProds.filter(
          (prod) => prod._id.toString() !== mainExcess[0]._id.toString(),
        );
        await handleUpdateProd(listOfExcess[i], estoreid, updateType);
        remainingProds = remainingProds.filter(
          (prod) => prod._id.toString() !== listOfExcess[i]._id.toString(),
        );
      }
    }
  }

  for (i = 0; i < remainingProds.length; i++) {
    await handleUpdateProd(remainingProds[i], estoreid, updateType);
  }

  await clearOneItemCache(estoreid, "products");
  await clearMultiItemsCache(estoreid, "adminItems");
  await clearMultiItemsCache(estoreid, "searchProduct");
  await clearMultiItemsCache(estoreid, "product");
};

exports.populateWishlist = async (wishlist, estoreid) => {
  const prodId = (Array.isArray(wishlist) ? wishlist : [])
    .map((wish) => {
      if (!wish) return null;
      return wish._id ? wish._id : wish;
    })
    .filter((id) => id && ObjectId.isValid(id))
    .map((id) => new ObjectId(id));

  if (prodId.length < 1) return [];

  const result = await Product.find({
    _id: { $in: prodId },
    estoreid: new ObjectId(estoreid),
  }).exec();

  return result;
};

exports.populateAddress = async (addiv3, estoreid) => {
  const result = await MyAddiv3.findOne({
    _id: new ObjectId(addiv3._id),
    estoreid: new ObjectId(estoreid),
  }).exec();
  if (result) {
    return result;
  } else {
    return addiv3;
  }
};

const handleUpdateToProd = async (
  product,
  frmestoreid,
  toestoreid,
  updateType,
) => {
  const orConditions = [];
  const searchObj = {};

  const checkProduct = await Product.findOne({
    _id: new ObjectId(product.product),
    estoreid: new ObjectId(frmestoreid),
  });

  if (checkProduct._id) {
    orConditions.push({ _id: new ObjectId(checkProduct._id) });
    orConditions.push({ prod_code: new ObjectId(checkProduct._id) });
  }

  if (checkProduct.prod_code) {
    orConditions.push({ _id: new ObjectId(checkProduct.prod_code) });
    orConditions.push({ prod_code: new ObjectId(checkProduct.prod_code) });
  }

  if (checkProduct.barcode) {
    orConditions.push({ barcode: checkProduct.barcode });
  }

  if (orConditions.length > 0) {
    searchObj.$or = orConditions;
  }

  searchObj.estoreid = new ObjectId(toestoreid);

  const checkToProduct = await Product.findOne(searchObj);

  if (checkToProduct) {
    let finalQty = 0;

    if (updateType) {
      finalQty =
        parseFloat(checkToProduct.quantity) + parseFloat(product.count);
    } else {
      finalQty =
        parseFloat(checkToProduct.quantity) - parseFloat(product.count);
    }

    await Product.findOneAndUpdate(
      {
        _id: new ObjectId(checkToProduct._id),
        estoreid: new ObjectId(toestoreid),
      },
      {
        quantity: parseFloat(finalQty) > 0 ? parseFloat(finalQty) : 0,
      },
      { new: true },
    );
  }
};

exports.updateOrderedWareProd = async (
  products,
  frmestoreid,
  toestoreid,
  updateType,
) => {
  let remainingProds = products;
  const listOfExcess = products.filter((prod) => prod.excess);

  if (updateType) {
    for (i = 0; i < listOfExcess.length; i++) {
      let mainExcess = products.filter(
        (prod) =>
          prod.product.toString() === listOfExcess[i].product.toString() &&
          prod._id.toString() !== listOfExcess[i]._id.toString(),
      );
      if (mainExcess[0] && mainExcess[0]._id) {
        await handleUpdateProd(mainExcess[0], frmestoreid, updateType);
        await handleUpdateToProd(
          mainExcess[0],
          frmestoreid,
          toestoreid,
          updateType,
        );
        remainingProds = remainingProds.filter(
          (prod) => prod._id.toString() !== mainExcess[0]._id.toString(),
        );
        await handleUpdateProd(listOfExcess[i], frmestoreid, updateType);
        await handleUpdateToProd(
          listOfExcess[i],
          frmestoreid,
          toestoreid,
          updateType,
        );
        remainingProds = remainingProds.filter(
          (prod) => prod._id.toString() !== listOfExcess[i]._id.toString(),
        );
      }
    }
  }

  for (i = 0; i < remainingProds.length; i++) {
    await handleUpdateProd(remainingProds[i], frmestoreid, updateType);
    await handleUpdateToProd(
      remainingProds[i],
      frmestoreid,
      toestoreid,
      updateType,
    );
  }
  await clearOneItemCache(frmestoreid, "products");
  await clearOneItemCache(toestoreid, "products");
  await clearMultiItemsCache(frmestoreid, "adminItems");
  await clearMultiItemsCache(toestoreid, "adminItems");
  await clearMultiItemsCache(frmestoreid, "searchProduct");
  await clearMultiItemsCache(toestoreid, "searchProduct");
  await clearMultiItemsCache(frmestoreid, "product");
  await clearMultiItemsCache(toestoreid, "product");
};
