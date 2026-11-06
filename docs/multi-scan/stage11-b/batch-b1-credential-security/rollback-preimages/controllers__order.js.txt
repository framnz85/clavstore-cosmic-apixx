const ObjectId = require("mongoose").Types.ObjectId;
const md5 = require("md5");
const jwt = require("jsonwebtoken");

const Estore = require("../models/estore");
const User = require("../models/user");
const Cart = require("../models/cart");
const Product = require("../models/product");
const Order = require("../models/order");
const Cashflow = require("../models/cashflow");

const {
  populateProduct,
  createRaffle,
  checkOrderedProd,
  updateOrderedProd,
} = require("./common");
const { createCashflowEntry } = require("./cashflow");
const { redisClient } = require("../config/redis");
const { getUserByEmail } = require("./auth");
const {
  clearSubItemCache,
  clearMultiItemsCache,
  clearSubItemsCache,
} = require("./redis/clearing");
const { createPoint } = require("./points");

exports.userOrder = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const email = req.user.email;
  const orderid = req.params.orderid;

  try {
    const user = await getUserByEmail(email, estoreid);

    if (!user) {
      return res.json({
        err: "Cannot fetch this order.",
      });
    }

    const cacheKey = `order:${estoreid}:${orderid}`;

    const cachedOrder = await redisClient.get(cacheKey);

    if (cachedOrder) {
      return res.json(JSON.parse(cachedOrder));
    }

    const order = await Order.findOne({
      _id: new ObjectId(orderid),
      orderedBy: user._id,
      estoreid: new ObjectId(estoreid),
    })
      .populate("estoreid", "_id name storeAddress")
      .populate("products.product")
      .populate("orderedBy")
      .populate("paymentOption")
      .lean()
      .exec();

    if (!order) {
      return res.json({
        err: "Sorry, there is no data on this order.",
      });
    }

    await redisClient.set(cacheKey, JSON.stringify(order), {
      EX: 86400,
    });

    res.json(order);
  } catch (error) {
    res.json({
      err: "Fetching an order failed. " + error.message,
    });
  }
};

exports.userAppOrder = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const orderid = req.params.orderid;

  try {
    const cacheKey = `order:${estoreid}:${orderid}`;

    let order = null;

    const cachedOrder = await redisClient.get(cacheKey);

    if (cachedOrder) {
      order = JSON.parse(cachedOrder);
    }

    if (!order) {
      if (!ObjectId.isValid(orderid)) {
        return res.json({
          err: "Sorry, there is no data on this order.",
        });
      }

      order = await Order.findOne({
        _id: new ObjectId(orderid),
        estoreid: new ObjectId(estoreid),
      })
        .populate("estoreid", "_id name storeAddress")
        .populate("products.product")
        .populate("orderedBy")
        .populate("paymentOption")
        .lean()
        .exec();

      if (!order) {
        return res.json({
          err: "Sorry, there is no data on this order.",
        });
      }

      await redisClient.set(cacheKey, JSON.stringify(order), {
        EX: 86400, // 24 hours
      });
    }

    const token = jwt.sign(
      { email: order.orderedBy.email },
      process.env.JWT_PRIVATE_KEY,
    );

    res.json({
      order,
      token,
    });
  } catch (error) {
    res.json({
      err: "Fetching an order failed. " + error.message,
    });
  }
};

exports.adminOrder = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const warehouse = req.headers.warehouse;
  const orderid = req.params.orderid;
  const email = req.user.email;

  try {
    const user = await getUserByEmail(email, estoreid);

    if (!user) {
      return res.json({
        err: "Cannot fetch this order.",
      });
    }

    const cacheKey = warehouse
      ? `order:supplier:${estoreid}:${orderid}`
      : `order:${estoreid}:${orderid}`;

    let order = null;

    const cachedOrder = await redisClient.get(cacheKey);

    if (cachedOrder) {
      order = JSON.parse(cachedOrder);
    }

    if (!order) {
      if (!ObjectId.isValid(orderid)) {
        return res.json({
          err: "Sorry, there is no data on this order.",
        });
      }

      const query = warehouse
        ? {
            _id: new ObjectId(orderid),
            supplierid: new ObjectId(estoreid),
          }
        : {
            _id: new ObjectId(orderid),
            estoreid: new ObjectId(estoreid),
          };

      order = await Order.findOne(query)
        .populate("estoreid", "_id name storeAddress")
        .populate("products.product")
        .populate("orderedBy")
        .populate("paymentOption")
        .lean()
        .exec();

      if (!order) {
        return res.json({
          err: "Sorry, there is no data on this order.",
        });
      }

      await redisClient.set(cacheKey, JSON.stringify(order), {
        EX: 86400,
      });
    }

    res.json(order);
  } catch (error) {
    res.json({
      err: "Fetching an order failed. " + error.message,
    });
  }
};

exports.userOrders = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const email = req.user.email;

  try {
    const { sortkey, sort, currentPage, pageSize, searchQuery } = req.body;

    const user = await getUserByEmail(email, estoreid);

    if (!user) {
      return res.json({
        err: "Cannot fetch user orders.",
      });
    }

    const cacheKey = [
      `userOrders:${estoreid}:${user._id.toString()}`,
      user._id.toString(),
      currentPage,
      pageSize,
      sortkey || "_default",
      sort || "_default",
      searchQuery || "_empty",
    ].join(":");

    const cachedData = await redisClient.get(cacheKey);

    if (cachedData) {
      return res.json(JSON.parse(cachedData));
    }

    const searchObj = {
      estoreid: new ObjectId(estoreid),
      orderedBy: user._id,
    };

    if (searchQuery) {
      searchObj.$or = [
        {
          orderCode: {
            $regex: searchQuery,
            $options: "i",
          },
        },
        {
          orderedName: {
            $regex: searchQuery,
            $options: "i",
          },
        },
      ];
    }

    const orders = await Order.find(searchObj)
      .skip((currentPage - 1) * pageSize)
      .sort({ [sortkey]: sort })
      .limit(pageSize)
      .populate("estoreid", "_id name storeAddress")
      .populate("orderedBy", "_id")
      .populate("paymentOption", "bankName")
      .select(
        "_id orderCode orderedName cartTotal delfee servefee discount addDiscount orderType orderStatus deliveryPrefer deliverInstruct estoreid duedate createdAt",
      )
      .lean()
      .exec();

    const countOrder = await Order.countDocuments(searchObj).exec();

    const result = {
      orders,
      count: countOrder,
    };

    await redisClient.set(cacheKey, JSON.stringify(result), {
      EX: 86400,
    });

    res.json(result);
  } catch (error) {
    res.json({
      err: "Fetching orders failed. " + error.message,
    });
  }
};

exports.adminOrders = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const email = req.user.email;

  let orders = [];
  let totalCredit = {};
  let collectibles = 0;

  try {
    const {
      sortkey,
      sort,
      currentPage,
      pageSize,
      searchQuery,
      status,
      orderedBy,
      sales,
      type,
    } = req.body;

    const user = await getUserByEmail(email, estoreid);

    if (!user) {
      return res.json({
        err: "Cannot fetch user information.",
      });
    }

    const cacheKey = [
      `adminOrders:${estoreid}`,
      user._id.toString(),
      user.role || "_norole",
      type || "_all",
      currentPage || 1,
      pageSize || 20,
      sortkey || "_default",
      sort ?? "_default",
      searchQuery || "_empty",
      status || "_allstatus",
      orderedBy || "_allusers",
      sales?.type || "_nosales",
      sales?.dateStart || "_nodate",
      sales?.endDate || "_nodate",
    ].join(":");

    const cachedData = await redisClient.get(cacheKey);

    if (cachedData) {
      return res.json(JSON.parse(cachedData));
    }

    const searchObj = {};

    if (user.role === "cashier") {
      if (type === "purchase") {
        searchObj.supplierid = new ObjectId(estoreid);
      } else {
        searchObj.estoreid = new ObjectId(estoreid);
      }

      searchObj.createdBy = user._id;

      if (searchQuery) {
        searchObj.$or = [
          {
            orderCode: {
              $regex: searchQuery,
              $options: "i",
            },
          },
          {
            orderedName: {
              $regex: searchQuery,
              $options: "i",
            },
          },
        ];
      }

      if (status !== "All Status") {
        searchObj.orderStatus = status;
      }

      if (orderedBy) {
        searchObj.orderedBy = new ObjectId(orderedBy);
      }

      if (sales && sales.type === "sales") {
        const startDate = new Date(
          new Date(sales.dateStart).setHours(
            new Date(sales.dateStart).getHours() + 8,
          ),
        );

        const endDate = new Date(
          new Date(sales.endDate).setHours(
            new Date(sales.endDate).getHours() + 8,
          ),
        );

        startDate.setDate(startDate.getDate() - 1);

        searchObj.createdAt = {
          $gte: new Date(new Date(startDate).setHours(16, 0, 0)),
          $lte: new Date(new Date(endDate).setHours(15, 59, 59)),
        };
      }

      orders = await Order.find(searchObj)
        .skip((currentPage - 1) * pageSize)
        .sort({ [sortkey]: sort })
        .limit(pageSize)
        .select(
          "_id orderCode orderedBy orderedName cartTotal delfee servefee discount addDiscount orderType orderStatus deliveryPrefer deliverInstruct estoreid delAddress duedate createdAt",
        )
        .populate("estoreid", "_id name storeAddress")
        .populate("orderedBy")
        .populate("paymentOption")
        .lean()
        .exec();
    } else {
      if (type === "purchase") {
        searchObj.supplierid = new ObjectId(estoreid);
      } else {
        searchObj.estoreid = new ObjectId(estoreid);
      }

      if (searchQuery) {
        searchObj.$or = [
          {
            orderCode: {
              $regex: searchQuery,
              $options: "i",
            },
          },
          {
            orderedName: {
              $regex: searchQuery,
              $options: "i",
            },
          },
        ];
      }

      if (status !== "All Status") {
        searchObj.orderStatus = status;
      }

      if (orderedBy) {
        searchObj.orderedBy = new ObjectId(orderedBy);
      }

      if (sales && sales.type === "sales") {
        const startDate = new Date(
          new Date(sales.dateStart).setHours(
            new Date(sales.dateStart).getHours() + 8,
          ),
        );

        const endDate = new Date(
          new Date(sales.endDate).setHours(
            new Date(sales.endDate).getHours() + 8,
          ),
        );

        startDate.setDate(startDate.getDate() - 1);

        searchObj.createdAt = {
          $gte: new Date(new Date(startDate).setHours(16, 0, 0)),
          $lte: new Date(new Date(endDate).setHours(15, 59, 59)),
        };
      }

      orders = await Order.find(searchObj)
        .skip((currentPage - 1) * pageSize)
        .sort({ [sortkey]: sort })
        .limit(pageSize)
        .select(
          "_id orderCode orderedBy orderedName cartTotal delfee servefee discount addDiscount orderType orderStatus deliveryPrefer deliverInstruct estoreid delAddress duedate createdAt",
        )
        .populate("orderedBy")
        .populate("estoreid", "_id name storeAddress")
        .populate("paymentOption")
        .lean()
        .exec();
    }

    const countOrder = await Order.countDocuments(searchObj).exec();

    if (status === "Credit") {
      totalCredit = await Order.aggregate([
        {
          $match: searchObj,
        },
        {
          $group: {
            _id: null,
            sum_cartTotal: {
              $sum: "$cartTotal",
            },
            sum_delfee: {
              $sum: "$delfee",
            },
            sum_discount: {
              $sum: "$discount",
            },
            sum_addDiscount: {
              $sum: "$addDiscount",
            },
          },
        },
      ]);

      if (totalCredit && totalCredit[0]) {
        collectibles =
          parseFloat(totalCredit[0].sum_cartTotal || 0) +
          parseFloat(totalCredit[0].sum_delfee || 0) +
          parseFloat(totalCredit[0].sum_discount || 0) +
          parseFloat(totalCredit[0].sum_addDiscount || 0);
      }
    }

    const result = {
      orders,
      count: countOrder,
      collectibles,
    };

    await redisClient.set(cacheKey, JSON.stringify(result), {
      EX: 86400,
    });

    res.json(result);
  } catch (error) {
    res.json({
      err: "Fetching orders failed. " + error.message,
    });
  }
};

exports.adminSales = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const email = req.user.email;
  const dates = req.body.dates;

  let capital = 0;
  let orders = [];

  try {
    const user = await getUserByEmail(email, estoreid);

    if (!user) {
      return res.json({
        err: "Cannot fetch user information.",
      });
    }

    const cacheKey = [
      `adminSales:${estoreid}`,
      user.role || "_norole",
      user.role === "cashier" ? user._id.toString() : "_allusers",
      dates?.dateStart || "_nodate",
      dates?.endDate || "_nodate",
    ].join(":");

    const cachedData = await redisClient.get(cacheKey);

    if (cachedData) {
      return res.json(JSON.parse(cachedData));
    }

    const startDate = new Date(
      new Date(dates.dateStart).setHours(
        new Date(dates.dateStart).getHours() + 8,
      ),
    );

    const endDate = new Date(
      new Date(dates.endDate).setHours(new Date(dates.endDate).getHours() + 8),
    );

    startDate.setDate(startDate.getDate() - 1);

    const buildDateKey = (dateValue) => {
      const year = dateValue.getUTCFullYear();
      const month = `${dateValue.getUTCMonth() + 1}`.padStart(2, "0");
      const day = `${dateValue.getUTCDate()}`.padStart(2, "0");

      return `${year}-${month}-${day}`;
    };

    const rangeDates = [];

    const dateCursor = new Date(
      new Date(dates.dateStart).setHours(new Date(dates.dateStart).getHours()),
    );

    const dateLimit = new Date(
      new Date(dates.endDate).setHours(new Date(dates.endDate).getHours()),
    );

    while (dateCursor <= dateLimit) {
      rangeDates.push(buildDateKey(dateCursor));

      dateCursor.setUTCDate(dateCursor.getUTCDate() + 1);
    }

    const dailySalesMap = rangeDates.reduce((accumulator, dateValue) => {
      accumulator[dateValue] = {
        date: dateValue,
        capital: 0,
        cartTotals: 0,
        delfees: 0,
        discounts: 0,
      };

      return accumulator;
    }, {});

    const orderQuery = {
      estoreid: new ObjectId(estoreid),
      orderStatus: "Completed",
      createdAt: {
        $gte: new Date(new Date(startDate).setHours(16, 0, 0)),
        $lte: new Date(new Date(endDate).setHours(15, 59, 59)),
      },
    };

    if (user.role === "cashier") {
      orderQuery.createdBy = user._id;
    }

    orders = await Order.find(orderQuery)
      .select(
        "products.supplierPrice products.count cartTotal delfee discount addDiscount createdAt",
      )
      .lean()
      .exec();

    let cartTotals = 0;
    let delfees = 0;
    let discounts = 0;

    orders.forEach((order) => {
      const orderCapital = order.products.reduce((accumulator, value) => {
        return (
          accumulator +
          (value.supplierPrice ? value.supplierPrice * value.count : 0)
        );
      }, 0);

      const orderCartTotal = order.cartTotal || 0;
      const orderDelfee = order.delfee || 0;
      const orderDiscount = order.discount || 0;
      const orderAddDiscount = order.addDiscount || 0;

      const orderTotalDiscount = orderDiscount + orderAddDiscount;

      capital += orderCapital;
      cartTotals += orderCartTotal;
      delfees += orderDelfee;
      discounts += orderTotalDiscount;

      const shiftedCreatedAt = new Date(
        new Date(order.createdAt).getTime() + 8 * 60 * 60 * 1000,
      );

      const dayKey = buildDateKey(shiftedCreatedAt);

      if (dailySalesMap[dayKey]) {
        dailySalesMap[dayKey].capital += orderCapital;

        dailySalesMap[dayKey].cartTotals += orderCartTotal;

        dailySalesMap[dayKey].delfees += orderDelfee;

        dailySalesMap[dayKey].discounts += orderTotalDiscount;
      }
    });

    const dailySales = rangeDates.map((dateValue) => {
      const daySales = dailySalesMap[dateValue] || {
        date: dateValue,
        capital: 0,
        cartTotals: 0,
        delfees: 0,
        discounts: 0,
      };

      const gross = daySales.cartTotals + daySales.delfees - daySales.discounts;

      return {
        ...daySales,
        gross,
        netProfit: gross - daySales.capital,
      };
    });

    const result = {
      capital,
      cartTotals,
      delfees,
      discounts,
      dailySales,
    };

    await redisClient.set(cacheKey, JSON.stringify(result), {
      EX: 86400,
    });

    res.json(result);
  } catch (error) {
    res.json({
      err: "Fetching orders failed. " + error.message,
    });
  }
};

exports.updateCart = async (req, res) => {
  const { cart } = req.body;
  const estoreid = req.headers.estoreid;
  const email = req.user.email;
  let products = [];

  try {
    const user = await getUserByEmail(email, estoreid);

    if (!user) {
      return res.json({
        err: "Cannot fetch the cart details.",
      });
    }

    const cacheKey = `products:${estoreid}`;
    const cachedData = await redisClient.get(cacheKey);
    let cachedProducts = [];

    if (cachedData) {
      cachedProducts = JSON.parse(cachedData).products || [];
    }

    const productMap = new Map(
      cachedProducts
        .filter((product) => product && product._id)
        .map((product) => [product._id.toString(), product]),
    );

    let showWaiting = false;

    let waitingProduct = {
      _id: "",
      title: "",
      quantity: 0,
    };

    for (let i = 0; i < cart.length; i++) {
      let object = {};

      object.product = cart[i]._id;
      object.count = cart[i].count;
      object.excess = cart[i].excess ? true : false;

      const productId = cart[i]._id;

      let productFromDb = productMap.get(productId.toString());

      if (!productFromDb && ObjectId.isValid(productId)) {
        productFromDb = await Product.findOne({
          _id: new ObjectId(productId),
          estoreid: new ObjectId(estoreid),
        }).exec();
      }

      if (!productFromDb) {
        return res.json({
          err: "One of the products in your cart no longer exists.",
        });
      }

      object.supplierPrice = cart[i].excess
        ? cart[i].supplierPrice
        : productFromDb.supplierPrice;

      let price = 0;

      if (cart[i].priceChange || cart[i].excess) {
        price = cart[i].price;
      } else {
        if (
          (user.role === "admin" || user.wholesale) &&
          productFromDb.wholesale &&
          productFromDb.wholesale.length > 0
        ) {
          const wholesales = productFromDb.wholesale.filter(
            (wsale) => wsale.wcount <= cart[i].count,
          );

          if (wholesales.length > 0) {
            const largestCount = Math.max(
              ...wholesales.map((large) => large.wcount),
            );

            const largestWholesale = wholesales.find(
              (wsale) => wsale.wcount === largestCount,
            );

            if (largestWholesale && largestWholesale.wprice) {
              price = largestWholesale.wprice;
            } else {
              price = productFromDb.price;
            }
          } else {
            price = productFromDb.price;
          }
        } else {
          price = productFromDb.price;
        }
      }

      object.price = price;

      cart[i] = {
        ...cart[i],
        price,
      };

      if (productFromDb.segregate && productFromDb.quantity < object.count) {
        object.excessCount =
          parseFloat(object.count) - parseFloat(productFromDb.quantity);
      }

      products.push(object);

      if (
        !cart[i].excess &&
        !productFromDb.segregate &&
        (!productFromDb.quantity || productFromDb.quantity < object.count)
      ) {
        waitingProduct = {
          ...(productFromDb._doc || productFromDb),
          excessCount:
            parseFloat(object.count) - parseFloat(productFromDb.quantity || 0),
        };

        showWaiting = true;
      }

      if (
        !cart[i].excess &&
        productFromDb.segregate &&
        productFromDb.waiting &&
        productFromDb.waiting._id &&
        (!productFromDb.quantity || productFromDb.quantity < object.count)
      ) {
        waitingProduct = {
          ...(productFromDb._doc || productFromDb),
          excessCount:
            parseFloat(object.count) - parseFloat(productFromDb.quantity || 0),
        };

        showWaiting = true;
      }

      const newQuantity =
        productFromDb.waiting && productFromDb.waiting.newQuantity
          ? productFromDb.waiting.newQuantity
          : 0;

      if (
        cart[i].excess &&
        !productFromDb.segregate &&
        newQuantity < object.count
      ) {
        waitingProduct = {
          ...cart[i],
          quantity: newQuantity,
        };

        showWaiting = false;
      }
    }

    if (!waitingProduct._id) {
      let cartTotal = 0;

      for (let i = 0; i < products.length; i++) {
        products[i].product = new ObjectId(products[i].product);

        cartTotal += products[i].price * products[i].count;
      }

      await Cart.deleteMany({
        orderedBy: user._id,
        estoreid: new ObjectId(estoreid),
      }).exec();

      await Cart.collection.insertOne({
        estoreid: new ObjectId(estoreid),
        products,
        cartTotal,
        orderedBy: new ObjectId(user._id),
        createdAt: new Date(),
        updatedAt: new Date(),
        __v: 0,
      });

      return res.json({ cart });
    }

    return res.json({
      err:
        waitingProduct.title +
        " with price @ " +
        waitingProduct.price +
        " has " +
        waitingProduct.quantity +
        " in stock only",

      waitingProduct: showWaiting ? waitingProduct : {},
    });
  } catch (error) {
    res.json({
      err: "Fetching cart fails. " + error.message,
    });
  }
};

exports.updateCartPurchase = async (req, res) => {
  const { cart } = req.body;
  const estoreid = req.headers.estoreid;
  const email = req.user.email;

  let products = [];

  try {
    const user = await getUserByEmail(email, estoreid);

    if (!user) {
      return res.json({
        err: "Cannot fetch the cart details.",
      });
    }

    const cacheKey = `products:${estoreid}`;

    const cachedData = await redisClient.get(cacheKey);

    let cachedProducts = [];

    if (cachedData) {
      cachedProducts = JSON.parse(cachedData).products || [];
    }

    const productMap = new Map(
      cachedProducts
        .filter((product) => product && product._id)
        .map((product) => [product._id.toString(), product]),
    );

    for (let i = 0; i < cart.length; i++) {
      const cartItem = cart[i];

      const productId = cartItem._id;

      let productFromDb = productMap.get(productId.toString());

      if (!productFromDb && ObjectId.isValid(productId)) {
        productFromDb = await Product.findOne({
          _id: new ObjectId(productId),
          estoreid: new ObjectId(estoreid),
        })
          .select("_id price supplierPrice wholesale quantity segregate")
          .lean()
          .exec();
      }

      if (!productFromDb) {
        return res.json({
          err: "One of the products in your cart no longer exists.",
        });
      }

      const object = {
        product: productId,
        count: cartItem.count,
        excess: cartItem.excess ? true : false,
      };

      object.supplierPrice = cartItem.excess
        ? cartItem.supplierPrice
        : productFromDb.supplierPrice;

      let price = 0;

      if (cartItem.priceChange || cartItem.excess) {
        price = cartItem.price;
      } else if (
        (user.role === "admin" || user.wholesale) &&
        productFromDb.wholesale &&
        productFromDb.wholesale.length > 0
      ) {
        let largestWholesale = null;

        for (const wholesale of productFromDb.wholesale) {
          if (wholesale.wcount <= cartItem.count) {
            if (
              !largestWholesale ||
              wholesale.wcount > largestWholesale.wcount
            ) {
              largestWholesale = wholesale;
            }
          }
        }

        if (largestWholesale && largestWholesale.wprice) {
          price = largestWholesale.wprice;
        } else {
          price = productFromDb.price;
        }
      } else {
        price = productFromDb.price;
      }

      object.price = price;

      cart[i] = {
        ...cartItem,
        price,
      };

      if (
        productFromDb.segregate &&
        Number(productFromDb.quantity) < Number(object.count)
      ) {
        object.excessCount =
          Number(object.count) - Number(productFromDb.quantity);
      }

      products.push(object);
    }

    const cartTotal = products.reduce((total, product) => {
      return total + Number(product.price || 0) * Number(product.count || 0);
    }, 0);

    products = products.map((product) => ({
      ...product,
      product: new ObjectId(product.product),
    }));

    await Cart.deleteMany({
      orderedBy: user._id,
      estoreid: new ObjectId(estoreid),
    }).exec();

    await Cart.collection.insertOne({
      estoreid: new ObjectId(estoreid),
      products,
      cartTotal,
      orderedBy: new ObjectId(user._id),
      createdAt: new Date(),
      updatedAt: new Date(),
      __v: 0,
    });

    return res.json({
      cart,
    });
  } catch (error) {
    return res.json({
      err: "Fetching cart fails. " + error.message,
    });
  }
};

const cashFlowEntry = async (order, estoreid, user, orderType) => {
  try {
    const paymentOptionId =
      order && order.paymentOption ? order.paymentOption : null;

    const estore = await Estore.findById(estoreid)
      .select("upStatus2 upgradeType enableCashflow")
      .lean();

    if (!estore.enableCashflow) return;

    if (
      paymentOptionId &&
      ObjectId.isValid(paymentOptionId) &&
      (!estore ||
        String(estore.upStatus2 || "") !== "Active" ||
        String(estore.upgradeType || "") !== "2")
    ) {
      return;
    }

    const cashflowAmount =
      (order.cartTotal ? order.cartTotal : 0) +
      (order.delfee ? order.delfee : 0) +
      (order.servefee ? order.servefee : 0) -
      (order.discount ? order.discount : 0) -
      (order.addDiscount ? order.addDiscount : 0);
    const orderCash = order && order.cash ? Number(order.cash) : 0;
    const posCashPaid = orderType === "pos" && orderCash > 0;
    const inflowAmount = posCashPaid ? orderCash : cashflowAmount;
    const changeAmount = posCashPaid
      ? Math.max(orderCash - cashflowAmount, 0)
      : 0;

    let finalBalanceInflow = inflowAmount;
    let finalBalanceOutflow = 0;

    const latestCashflowQuery = {
      estoreid: new ObjectId(estoreid),
      createdBy: new ObjectId(user._id),
    };

    if (paymentOptionId && ObjectId.isValid(paymentOptionId)) {
      latestCashflowQuery.bankid = new ObjectId(paymentOptionId);
    } else {
      latestCashflowQuery.$or = [
        { bankid: { $exists: false } },
        { bankid: null },
      ];
    }

    const latestCashflow = await Cashflow.findOne(latestCashflowQuery)
      .sort({ date: -1, createdAt: -1 })
      .select("balanceInflow balanceOutflow")
      .lean();

    const latestBalanceInflow = latestCashflow
      ? parseFloat(latestCashflow.balanceInflow) || 0
      : 0;
    const latestBalanceOutflow = latestCashflow
      ? parseFloat(latestCashflow.balanceOutflow) || 0
      : 0;

    finalBalanceInflow = latestBalanceInflow + inflowAmount;
    finalBalanceOutflow = latestBalanceOutflow + changeAmount;

    await createCashflowEntry({
      estoreid,
      createdBy: user._id,
      type: orderType,
      amount: cashflowAmount,
      referenceid: order._id,
      date: new Date(),
      bankid: paymentOptionId ? paymentOptionId : null,
      balanceInflow: finalBalanceInflow,
      balanceOutflow: finalBalanceOutflow,
    });
  } catch (cashflowError) {
    console.log("Create cashflow failed:", cashflowError.message);
  }
};

exports.saveCartOrder = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const email = req.user.email;

  const orderType = req.body.orderType;
  const delfee = req.body.delfee;
  const discount = req.body.discount;
  const servefee = req.body.servefee;
  const addDiscount = req.body.addDiscount;
  const cash = req.body.cash;
  const duedate = req.body.duedate;
  const paymentOption = req.body.paymentOption;
  const delAddress = req.body.delAddress;
  const orderNotes = req.body.orderNotes;
  const orderStatus = req.body.orderStatus;
  const deliveryPrefer = req.body.deliveryPrefer;
  const deliverInstruct = req.body.deliverInstruct;

  const orderedBy = req.body.orderedBy;
  const customerName = req.body.customerName;
  const customerPhone = req.body.customerPhone;
  const customerEmail = req.body.customerEmail;

  try {
    let user = await getUserByEmail(email, estoreid);
    let checkUser = {};

    if (customerName) {
      if (customerPhone) {
        checkUser = await User.findOne({
          phone: customerPhone,
          estoreid: new ObjectId(estoreid),
        });
      }
      if (customerEmail) {
        checkUser = await User.findOne({
          email: customerEmail,
          estoreid: new ObjectId(estoreid),
        });
      }
      if (orderedBy) {
        checkUser = await User.findOne({
          _id: new ObjectId(orderedBy),
          estoreid: new ObjectId(estoreid),
        });
      }
      if (!checkUser && (customerPhone || customerEmail)) {
        const newUser = new User({
          name: customerName,
          phone: customerPhone ? customerPhone : "09100000001",
          email: customerEmail ? customerEmail : "abc@xyz.com",
          password: md5("Grocery@2000"),
          showPass: "Grocery@2000",
          role: "customer",
          estoreid: new ObjectId(estoreid),
        });
        checkUser = await newUser.save();
      }
    }

    const cart = await Cart.findOne({
      orderedBy: user._id,
      estoreid: Object(estoreid),
    });

    const checkProdQty = await checkOrderedProd(cart.products, estoreid);

    if (checkProdQty && checkProdQty.err) {
      res.json({ err: checkProdQty.err, backToCart: true });
    } else {
      const estore = await Estore.findOne({
        _id: Object(estoreid),
      });

      if (!estore.orderInitStat) estore.orderInitStat = "Not Processed";
      if (!estore.orderInitRemarks)
        estore.orderInitRemarks = "Order was created.";

      const grandTotal =
        Number(cart.cartTotal || 0) +
        Number(delfee || 0) +
        Number(servefee || 0) -
        Number(discount || 0) -
        Number(addDiscount || 0);

      const newOrder = new Order({
        orderCode: cart._id.toString().slice(-12),
        orderType,
        products: cart.products,
        paymentOption: paymentOption ? new ObjectId(paymentOption) : null,
        orderStatus:
          orderType === "pos"
            ? orderStatus === "Credit"
              ? "Credit"
              : "Completed"
            : estore.orderInitStat,
        statusHistory: [
          {
            status:
              orderStatus === "Completed" || orderStatus === "Credit"
                ? orderStatus
                : estore.orderInitStat,
            remarks: estore.orderInitRemarks,
            date: new Date(),
          },
        ],
        cartTotal: cart.cartTotal,
        delfee,
        discount,
        servefee,
        addDiscount,
        cash,
        duedate,
        createdBy: user._id,
        orderedBy: checkUser && checkUser._id ? checkUser._id : user._id,
        orderedName: customerName || user.name,
        estoreid: new ObjectId(estoreid),
        delAddress,
        orderNotes,
        deliveryPrefer,
        deliverInstruct,
      });

      const order = await newOrder.save();

      if (order) {
        res.json(order);

        await Cart.deleteMany({
          orderedBy: user._id,
          estoreid: Object(estoreid),
        });

        if (
          orderType === "pos" &&
          (order.orderStatus === "Credit" || order.orderStatus === "Completed")
        ) {
          await updateOrderedProd(order.products, estoreid, true);

          createRaffle(estoreid, user, order);

          checkUser &&
            checkUser._id &&
            (await createPoint({
              estoreid,
              userid: checkUser._id,
              amount: grandTotal,
              orderid: order._id,
            }));

          order.orderStatus === "Completed" &&
            cashFlowEntry(order, estoreid, user, orderType);
        }
        if (
          orderType === "web" &&
          estore &&
          estore.orderStatus &&
          estore.orderStatus === estore.orderInitStat
        ) {
          await updateOrderedProd(order.products, estoreid, true);
        }

        clearMultiItemsCache(estoreid, "adminOrders");
        clearMultiItemsCache(estoreid, "adminSales");
        if (checkUser && checkUser._id)
          clearSubItemsCache(checkUser._id.toString(), estoreid, "userOrders");
        if (user && user._id)
          clearSubItemsCache(user._id.toString(), estoreid, "userOrders");
      } else {
        res.json({ err: "Cannot save the order." });
      }
    }
  } catch (error) {
    res.json({ err: "Saving cart to order fails. " + error.message });
  }
};

exports.saveCartPurchase = async (req, res) => {
  const estoreid = req.headers.estoreid || "";
  const email = (req.user && req.user.email) || "";

  const {
    orderType = "web",
    delfee = 0,
    discount = 0,
    servefee = 0,
    addDiscount = 0,
    cash = 0,
    duedate = "",
    paymentOption = "",
    delAddress = "",
    orderNotes = "",
    deliveryPrefer = "",
    deliverInstruct = "",
    supplierid = "",
    supplier = "",
    billTo = "",
    shipTo = "",
    orderedBy = "",
    customerName = "",
    customerPhone = "",
    customerEmail = "",
  } = req.body || {};

  const orderStatus = "For Purchase";

  try {
    let user = await getUserByEmail(email, estoreid);
    let checkUser = {};

    if (customerName) {
      if (customerPhone) {
        checkUser = await User.findOne({
          phone: customerPhone,
          estoreid: new ObjectId(estoreid),
        });
      }
      if (customerEmail) {
        checkUser = await User.findOne({
          email: customerEmail,
          estoreid: new ObjectId(estoreid),
        });
      }
      if (orderedBy) {
        checkUser = await User.findOne({
          _id: new ObjectId(orderedBy),
          estoreid: new ObjectId(estoreid),
        });
      }
      if (!checkUser && (customerPhone || customerEmail)) {
        const newUser = new User({
          name: customerName,
          phone: customerPhone ? customerPhone : "09100000001",
          email: customerEmail ? customerEmail : "abc@xyz.com",
          password: md5("Grocery@2000"),
          showPass: "Grocery@2000",
          role: "customer",
          estoreid: new ObjectId(estoreid),
        });
        checkUser = await newUser.save();
      }
    }

    const cart = await Cart.findOne({
      orderedBy: user._id,
      estoreid: Object(estoreid),
    });

    const estore = await Estore.findOne({
      _id: Object(estoreid),
    });

    if (!estore.orderInitRemarks)
      estore.orderInitRemarks = "Order was created.";

    const grandTotal =
      Number(cart.cartTotal || 0) +
      Number(delfee || 0) +
      Number(servefee || 0) -
      Number(discount || 0) -
      Number(addDiscount || 0);

    const newOrder = new Order({
      orderCode: cart._id.toString().slice(-12),
      orderType,
      products: cart.products,
      paymentOption: paymentOption ? new ObjectId(paymentOption) : undefined,
      orderStatus,
      statusHistory: [
        {
          status: orderStatus,
          remarks: estore.orderInitRemarks,
          date: new Date(),
        },
      ],
      cartTotal: cart.cartTotal,
      delfee,
      discount,
      servefee,
      addDiscount,
      cash,
      duedate,
      createdBy: user._id,
      orderedBy: checkUser && checkUser._id ? checkUser._id : user._id,
      orderedName: customerName || user.name,
      estoreid: new ObjectId(estoreid),
      delAddress,
      orderNotes,
      deliveryPrefer,
      deliverInstruct,
      supplierid: supplierid ? new ObjectId(supplierid) : undefined,
      supplier,
      billTo,
      shipTo,
    });

    const order = await newOrder.save();

    if (order) {
      res.json(order);

      await Cart.deleteMany({
        orderedBy: user._id,
        estoreid: Object(estoreid),
      });

      if (
        orderType === "pos" &&
        (order.orderStatus === "Credit" || order.orderStatus === "Completed")
      ) {
        await updateOrderedProd(order.products, estoreid, true);

        createRaffle(estoreid, user, order);

        checkUser &&
          checkUser._id &&
          (await createPoint({
            estoreid,
            userid: checkUser._id,
            amount: grandTotal,
            orderid: order._id,
          }));
      }
      if (
        orderType === "web" &&
        estore &&
        estore.orderStatus &&
        estore.orderStatus === estore.orderInitStat
      ) {
        await updateOrderedProd(order.products, estoreid, true);
      }

      clearMultiItemsCache(estoreid, "adminOrders");
      clearMultiItemsCache(estoreid, "adminSales");
      if (checkUser && checkUser._id)
        clearSubItemsCache(checkUser._id.toString(), estoreid, "userOrders");
      if (user && user._id)
        clearSubItemsCache(user._id.toString(), estoreid, "userOrders");
    } else {
      res.json({ err: "Cannot save the order." });
    }
  } catch (error) {
    res.json({ err: "Saving cart to order fails. " + error.message });
  }
};

const removeUpdates = async (
  estoreid,
  statusEstore,
  orderType,
  orderStatus,
  products,
) => {
  if (
    statusEstore === "For Purchase" ||
    statusEstore === "Purchased" ||
    statusEstore === "Received"
  ) {
    return;
  }

  if (statusEstore === "Not Processed") {
    if (orderType === "void") {
      await updateOrderedProd(products, estoreid, true);
    } else {
      await updateOrderedProd(products, estoreid, false);
    }
  } else if (statusEstore === "Waiting Payment") {
    if (orderStatus !== "Not Processed") {
      if (orderType === "void") {
        await updateOrderedProd(products, estoreid, true);
      } else {
        await updateOrderedProd(products, estoreid, false);
      }
    }
  } else if (statusEstore === "Processing") {
    if (orderStatus !== "Not Processed" && orderStatus !== "Waiting Payment") {
      if (orderType === "void") {
        await updateOrderedProd(products, estoreid, true);
      } else {
        await updateOrderedProd(products, estoreid, false);
      }
    }
  } else {
    if (
      orderStatus === "Delivering" ||
      orderStatus === "Completed" ||
      orderStatus === "Void"
    ) {
      if (orderType === "void") {
        await updateOrderedProd(products, estoreid, true);
      } else {
        await updateOrderedProd(products, estoreid, false);
      }
    }
  }
};

exports.updateOrderStatus = async (req, res) => {
  let checkProdQty = {};
  const estoreid = req.headers.estoreid;
  const email = req.user.email;
  const { orderid, orderStatus, statusHistory, orderType, orderedBy, type } =
    req.body;

  try {
    const user = await getUserByEmail(email, estoreid);
    const orderedUser = await User.findOne({
      _id: new ObjectId(orderedBy),
    }).exec();
    if (user) {
      const orderForChecking = await Order.findOne({
        _id: new ObjectId(orderid),
        orderedBy: new ObjectId(orderedBy),
        estoreid: Object(estoreid),
      });

      const estore = await Estore.findOne({
        _id: Object(estoreid),
      });

      const statusEstore =
        estore && estore.orderStatus ? estore.orderStatus : "Delivering";

      const skipQtyCheck =
        type === "warehouse"
          ? true
          : ["For Purchase", "Purchased", "Received"].includes(
              orderForChecking && orderForChecking.orderStatus,
            );

      if (!skipQtyCheck) {
        if (statusEstore === "Not Processed") {
          if (
            orderType === "web" &&
            orderStatus !== "Cancelled" &&
            orderStatus !== "Completed" &&
            orderStatus !== "Delivering" &&
            orderStatus !== "Processing" &&
            orderStatus !== "Waiting Payment" &&
            orderStatus !== "Not Processed"
          ) {
            checkProdQty = await checkOrderedProd(
              orderForChecking.products,
              estoreid,
            );
          }
        } else if (statusEstore === "Waiting Payment") {
          if (
            orderType === "web" &&
            orderStatus !== "Cancelled" &&
            orderStatus !== "Completed" &&
            orderStatus !== "Delivering" &&
            orderStatus !== "Processing" &&
            orderStatus !== "Waiting Payment"
          ) {
            checkProdQty = await checkOrderedProd(
              orderForChecking.products,
              estoreid,
            );
          }
        } else if (statusEstore === "Processing") {
          if (
            orderType === "web" &&
            orderStatus !== "Cancelled" &&
            orderStatus !== "Completed" &&
            orderStatus !== "Delivering" &&
            orderStatus !== "Processing"
          ) {
            checkProdQty = await checkOrderedProd(
              orderForChecking.products,
              estoreid,
            );
          }
        } else if (statusEstore === "Delivering") {
          if (
            orderType === "web" &&
            orderStatus !== "Cancelled" &&
            orderStatus !== "Completed" &&
            orderStatus !== "Delivering"
          ) {
            checkProdQty = await checkOrderedProd(
              orderForChecking.products,
              estoreid,
            );
          }
        } else {
          if (
            orderType === "web" &&
            orderStatus !== "Cancelled" &&
            orderStatus !== "Completed"
          ) {
            checkProdQty = await checkOrderedProd(
              orderForChecking.products,
              estoreid,
            );
          }
        }
      }

      if (checkProdQty && checkProdQty.err) {
        res.json({ err: checkProdQty.err, backToCart: true });
      } else {
        const order = await Order.findOneAndUpdate(
          {
            _id: new ObjectId(orderid),
            orderedBy: new ObjectId(orderedBy),
            ...(type === "warehouse"
              ? { supplierid: Object(estoreid) }
              : { estoreid: Object(estoreid) }),
          },
          {
            orderStatus,
            statusHistory,
          },
          { new: true },
        );

        const grandTotal =
          Number(order.cartTotal || 0) +
          Number(order.delfee || 0) +
          Number(order.servefee || 0) -
          Number(order.discount || 0) -
          Number(order.addDiscount || 0);

        if (order) {
          res.json(order);

          if (
            (orderType === "web" || orderType === "pos") &&
            orderStatus === "Completed" &&
            orderForChecking &&
            orderForChecking.orderStatus !== "Completed"
          ) {
            cashFlowEntry(order, estoreid, user, orderType);
          }

          if (orderType === "web" && orderStatus === statusEstore) {
            await updateOrderedProd(order.products, estoreid, true);
          }
          if (orderType === "web" && order.orderStatus === "Completed") {
            createRaffle(estoreid, orderedUser, order);

            orderedUser.createdBy &&
              (await createPoint({
                estoreid,
                userid: orderedUser.createdBy,
                amount: grandTotal,
                orderid: order._id,
              }));
          }
          if (orderStatus === "Cancelled") {
            removeUpdates(
              estoreid,
              statusEstore,
              orderType,
              orderStatus,
              order.products,
            );
          }

          clearMultiItemsCache(estoreid, "adminOrders");
          clearMultiItemsCache(estoreid, "adminSales");
          if (orderedBy) clearSubItemsCache(orderedBy, estoreid, "userOrders");
          clearSubItemCache(orderid, estoreid, "order");
          clearSubItemCache(orderid, estoreid, "order:supplier");
        } else {
          res.json({ err: "Order does not exist." });
        }
      }
    } else {
      res.json({ err: "Cannot update the order status." });
    }
  } catch (error) {
    res.json({ err: "Updating order status fails. " + error.message });
  }
};

exports.updatePaidOrder = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const email = req.user.email;
  const { orderid, orderStatus, statusHistory, creditHistory, cash } = req.body;

  try {
    const user = await getUserByEmail(email, estoreid);
    if (user) {
      const updatePayload = {
        orderStatus,
        statusHistory,
      };

      if (Array.isArray(creditHistory)) {
        updatePayload.creditHistory = creditHistory.map((entry) => ({
          amount: Number(entry?.amount) || 0,
          remarks: entry?.remarks || "",
          date: entry?.date ? new Date(entry.date) : new Date(),
        }));
      }

      if (cash !== undefined) {
        updatePayload.cash = Number(cash) || 0;
      }

      const order = await Order.findOneAndUpdate(
        {
          _id: new ObjectId(orderid),
          estoreid: Object(estoreid),
        },
        updatePayload,
        { new: true },
      );
      if (order) {
        res.json(order);

        clearMultiItemsCache(estoreid, "adminOrders");
        clearMultiItemsCache(estoreid, "adminSales");
        if (order && order.orderedBy)
          clearSubItemsCache(order.orderedBy, estoreid, "userOrders");
        clearSubItemCache(orderid, estoreid, "order");
        clearSubItemCache(orderid, estoreid, "order:supplier");
      } else {
        res.json({ err: "Order does not exist." });
      }
    }
  } catch (error) {
    res.json({ err: "Updating paid order status fails. " + error.message });
  }
};

exports.updateCustomDetails = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const email = req.user.email;
  const { orderid, customDetails, customDetails2 } = req.body;

  try {
    const user = await getUserByEmail(email, estoreid);
    if (user) {
      const order = await Order.findOneAndUpdate(
        {
          _id: new ObjectId(orderid),
          estoreid: new Object(estoreid),
        },
        {
          customDetails,
          customDetails2,
        },
        { new: true },
      );
      if (order) {
        res.json(order);

        clearMultiItemsCache(estoreid, "adminOrders");
        clearMultiItemsCache(estoreid, "adminSales");
        if (order && order.orderedBy)
          clearSubItemsCache(order.orderedBy, estoreid, "userOrders");
        clearSubItemCache(orderid, estoreid, "order");
        clearSubItemCache(orderid, estoreid, "order:supplier");
      } else {
        res.json({ err: "Order does not exist." });
      }
    } else {
      res.json({ err: "Cannot update the order custom details." });
    }
  } catch (error) {
    res.json({ err: "Updating order custom details fails. " + error.message });
  }
};

exports.updateProductRating = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const email = req.user.email;
  const { orderid, products } = req.body;

  try {
    const user = await getUserByEmail(email, estoreid);
    if (user) {
      const order = await Order.findOneAndUpdate(
        {
          _id: new ObjectId(orderid),
          estoreid: new Object(estoreid),
        },
        {
          products,
        },
        { new: true },
      );
      if (order) {
        res.json(order);

        clearMultiItemsCache(estoreid, "adminOrders");
        clearMultiItemsCache(estoreid, "adminSales");
        if (order && order.orderedBy)
          clearSubItemsCache(order.orderedBy, estoreid, "userOrders");
        clearSubItemCache(orderid, estoreid, "order");
        clearSubItemCache(orderid, estoreid, "order:supplier");
      } else {
        res.json({ err: "Order does not exist." });
      }
    } else {
      res.json({ err: "Cannot update the order product details." });
    }
  } catch (error) {
    res.json({ err: "Updating order product details fails. " + error.message });
  }
};

exports.voidProducts = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const email = req.user.email;
  const customer = req.body.customer;
  const voidName = req.body.voidName;
  const products = req.body.products;
  const total = req.body.total;

  try {
    const user = await getUserByEmail(email, estoreid);
    if (user) {
      const newOrder = new Order({
        orderType: "void",
        products: products.map((prod) => ({
          product: new ObjectId(prod._id),
          count: prod.quantity,
          supplierPrice: prod.supplierPrice,
          price: prod.price,
        })),
        orderStatus: "Void",
        cartTotal: total,
        createdBy: user._id,
        orderedBy: customer && customer._id ? customer._id : user._id,
        orderedName: customer.name || voidName || user.name,
        estoreid: new ObjectId(estoreid),
      });

      const order = await newOrder.save();
      if (order) {
        await Order.findByIdAndUpdate(order._id, {
          orderCode: order._id.toString().slice(-12),
        }).exec();

        await updateOrderedProd(order.products, estoreid, false);
      }

      res.json({ ok: true });

      clearMultiItemsCache(estoreid, "adminOrders");
      clearMultiItemsCache(estoreid, "adminSales");
      if (customer && customer._id)
        clearSubItemsCache(customer._id, estoreid, "userOrders");
      if (user && user._id)
        clearSubItemsCache(user._id, estoreid, "userOrders");
    }
  } catch (error) {
    res.json({ err: "Receiving product failed. " + error.message });
  }
};

exports.editOrder = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const email = req.user.email;
  const orderid = req.body.orderid;

  try {
    const user = await getUserByEmail(email, estoreid);

    if (!user) {
      return res.json({ err: "Cannot fetch the user." });
    }

    const order = await Order.findOne({
      _id: new ObjectId(orderid),
      estoreid: new ObjectId(estoreid),
    }).exec();

    if (!order) {
      return res.json({ err: "Cannot fetch the order." });
    }

    const productsForCart = order.products.map((prod) => ({
      product: prod.product,
      count: prod.count,
      excess: prod.excess,
      supplierPrice: prod.supplierPrice,
      price: prod.price,
    }));

    const cacheKey = `products:${estoreid}`;
    const cachedData = await redisClient.get(cacheKey);

    let cachedProducts = [];

    if (cachedData) {
      try {
        cachedProducts = JSON.parse(cachedData).products || [];
      } catch (error) {
        console.log("Invalid products Redis cache:", error.message);
        cachedProducts = [];
      }
    }

    let productsForRes = [];

    for (const orderProduct of order.products) {
      const productId = orderProduct.product?.toString();

      let product = cachedProducts.find(
        (item) => item && item._id?.toString() === productId,
      );

      if (!product && ObjectId.isValid(productId)) {
        const productFromDb = await Product.findOne({
          _id: new ObjectId(productId),
          estoreid: new ObjectId(estoreid),
        }).exec();

        if (productFromDb) {
          product = productFromDb;
          cachedProducts.push(
            productFromDb._doc ? productFromDb._doc : productFromDb,
          );
        }
      }

      if (product) {
        productsForRes.push({
          ...(product._doc ? product._doc : product),
          count: orderProduct.count,
        });
      }
    }

    productsForRes = await populateProduct(productsForRes, estoreid);

    await Cart.deleteMany({
      orderedBy: user._id,
      estoreid: new ObjectId(estoreid),
    }).exec();

    await Cart.collection.insertOne({
      estoreid: new ObjectId(estoreid),
      products: productsForCart,
      cartTotal: order.cartTotal,
      orderedBy: new ObjectId(user._id),
      createdAt: new Date(),
      updatedAt: new Date(),
      __v: 0,
    });

    res.json(productsForRes);
  } catch (error) {
    consoel.log(1);
    res.json({ err: "Editing order fails. " + error.message });
  }
};

exports.submitEditOrder = async (req, res) => {
  const orderid = req.body.orderid;
  const delfee = req.body.delfee;
  const discount = req.body.discount;
  const servefee = req.body.servefee;
  const paymentOption = req.body.paymentOption;
  const deliveryPrefer = req.body.deliveryPrefer;
  const deliverInstruct = req.body.deliverInstruct;
  const estoreid = req.headers.estoreid;
  const email = req.user.email;

  try {
    const user = await getUserByEmail(email, estoreid);
    if (user) {
      const cart = await Cart.findOne({
        orderedBy: user._id,
        estoreid: Object(estoreid),
      });
      const checkProdQty = await checkOrderedProd(cart.products, estoreid);

      if (checkProdQty && checkProdQty.err) {
        res.json({ err: checkProdQty.err, backToCart: true });
      } else {
        const order = await Order.findOneAndUpdate(
          {
            _id: new ObjectId(orderid),
            estoreid: Object(estoreid),
          },
          {
            products: cart.products,
            cartTotal: cart.cartTotal,
            delfee,
            discount,
            servefee,
            paymentOption: new ObjectId(paymentOption),
            deliveryPrefer,
            deliverInstruct,
          },
          { new: true },
        );
        if (order) {
          await Cart.deleteMany({
            orderedBy: user._id,
            estoreid: Object(estoreid),
          });
        }
        res.json({ ok: true });

        clearMultiItemsCache(estoreid, "adminOrders");
        clearMultiItemsCache(estoreid, "adminSales");
        if (user && user._id)
          clearSubItemsCache(user._id, estoreid, "userOrders");
        clearSubItemCache(orderid, estoreid, "order");
        clearSubItemCache(orderid, estoreid, "order:supplier");
      }
    } else {
      res.json({ err: "Cannot fetch the cart details." });
    }
  } catch (error) {
    res.json({ err: "Updating order fails. " + error.message });
  }
};

exports.deleteAdminOrder = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const orderid = req.params.orderid;

  try {
    const order = await Order.findOneAndDelete({
      _id: new ObjectId(orderid),
      estoreid: Object(estoreid),
    });
    if (order.orderStatus !== "Cancelled") {
      const estore = await Estore.findOne({
        _id: Object(estoreid),
      });
      const statusEstore =
        estore && estore.orderStatus ? estore.orderStatus : "Delivering";
      removeUpdates(
        estoreid,
        statusEstore,
        order.orderType,
        order.orderStatus,
        order.products,
      );
    }
    res.json(order);

    clearMultiItemsCache(estoreid, "adminOrders");
    clearMultiItemsCache(estoreid, "adminSales");
    if (order && order.orderedBy)
      clearSubItemsCache(order.orderedBy, estoreid, "userOrders");
    clearSubItemCache(orderid, estoreid, "order");
    clearSubItemCache(orderid, estoreid, "order:supplier");
  } catch (error) {
    res.json({ err: "Deleting order fails. " + error.message });
  }
};

exports.deleteOrder = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const email = req.user.email;
  const orderid = req.params.orderid;

  try {
    const user = await getUserByEmail(email, estoreid);
    if (user) {
      const order = await Order.findOneAndDelete({
        _id: new ObjectId(orderid),
        orderedBy: user._id,
        estoreid: Object(estoreid),
      });
      res.json(order);

      clearMultiItemsCache(estoreid, "adminOrders");
      clearMultiItemsCache(estoreid, "adminSales");
      if (user && user._id)
        clearSubItemsCache(user._id, estoreid, "userOrders");
      clearSubItemCache(orderid, estoreid, "order");
      clearSubItemCache(orderid, estoreid, "order:supplier");
    } else {
      res.json({ err: "Cannot delete the order." });
    }
  } catch (error) {
    res.json({ err: "Deleting order fails. " + error.message });
  }
};
