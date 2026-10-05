const ObjectId = require("mongoose").Types.ObjectId;
const Raffle = require("../../models/raffle");
const Product = require("../../models/product");
const Estore = require("../../models/estore");

const { redisClient } = require("../../config/redis");
const {
  clearOneItemCache,
  clearMultiItemsCache,
} = require("../redis/clearing");

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
        estoreid: Object(estoreid),
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
          estoreid: Object(estoreid),
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
