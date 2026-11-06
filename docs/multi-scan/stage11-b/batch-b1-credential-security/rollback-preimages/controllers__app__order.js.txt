const ObjectId = require("mongoose").Types.ObjectId;

const Order = require("../../models/order");
const User = require("../../models/user");
const Estore = require("../../models/estore");
const Product = require("../../models/product");
const Cart = require("../../models/cart");

const {
  createRaffle,
  checkOrderedProd,
  updateOrderedProd,
} = require("./common");
const { redisClient } = require("../../config/redis");

exports.getPosOrders = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const page = req.body.page;
  const limit = req.body.limit;
  const email = req.user.email;
  let orders = [];

  try {
    const user = await User.findOne({ email }).exec();
    if (user.role === "cashier") {
      orders = await Order.find({
        estoreid: new ObjectId(estoreid),
        createdBy: user._id,
      })
        .skip(page * limit)
        .limit(limit)
        .exec();
    } else {
      orders = await Order.find({
        estoreid: new ObjectId(estoreid),
      })
        .skip(page * limit)
        .limit(limit)
        .exec();
    }

    res.json(orders);
  } catch (error) {
    res.json({ err: "Getting all orders failed." + error.message });
  }
};

exports.updateCart = async (req, res) => {
  const { cart } = req.body;
  const estoreid = req.headers.estoreid;
  const email = req.user.email;

  let products = [];

  try {
    const user = await User.findOne({ email }).exec();

    if (!user) {
      return res.json({
        err: "Cannot fetch the cart details.",
      });
    }

    let showWaiting = false;

    let waitingProduct = {
      title: "",
      quantity: 0,
    };

    for (let i = 0; i < cart.length; i++) {
      let object = {};

      object.product = cart[i].product;
      object.count = cart[i].count;
      object.excess = cart[i].excess ? true : false;

      const productId = cart[i].product;

      const cacheKey = `products:${estoreid}`;

      let productFromDb = null;

      const cachedData = await redisClient.get(cacheKey);

      if (cachedData) {
        try {
          const parsedCache = JSON.parse(cachedData);

          const cachedProducts = parsedCache.products || [];

          productFromDb = cachedProducts.find(
            (product) =>
              product &&
              product._id &&
              productId &&
              product._id.toString() === productId.toString(),
          );
        } catch (redisParseError) {
          console.log(
            "Redis product cache parse error:",
            redisParseError.message,
          );
        }
      }

      if (!productFromDb && ObjectId.isValid(productId)) {
        productFromDb = await Product.findOne({
          _id: new ObjectId(productId),
          estoreid: new ObjectId(estoreid),
        }).exec();
      }

      if (!productFromDb) {
        console.log("Product not found:", {
          productId,
          estoreid,
          cartItem: cart[i],
        });

        return res.json({
          err: `Product ${productId} could not be found.`,
          productId,
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
          productFromDb.wprice &&
          productFromDb.wprice > 0 &&
          cart[i].count >= productFromDb.wcount
        ) {
          price = productFromDb.wprice;
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
          parseFloat(object.count) - parseFloat(productFromDb.quantity || 0);
      }

      products.push(productFromDb);

      if (
        !cart[i].excess &&
        !productFromDb.segregate &&
        (!productFromDb.quantity || productFromDb.quantity < object.count)
      ) {
        waitingProduct = {
          ...productFromDb._doc,
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
          ...productFromDb._doc,
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
      return res.json({
        cart,
        products,
      });
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
    console.error("updateCart error:", error);

    return res.json({
      err: "Fetching cart fails. " + error.message,
    });
  }
};

exports.saveOrder = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const email = req.user.email;

  const orderStatus = req.body.orderStatus;
  const cartTotal = req.body.cartTotal;
  const discount = req.body.discount;
  const addDiscount = req.body.addDiscount;
  const cash = req.body.cash;
  const products = req.body.products;

  const orderedBy = req.body.orderedBy;
  const customerName = req.body.customerName;
  const customerPhone = req.body.customerPhone;
  const customerEmail = req.body.customerEmail;
  const orderNotes = req.body.orderNotes;

  try {
    let user = await User.findOne({ email }).exec();
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

    const checkProdQty = await checkOrderedProd(products, estoreid);

    if (checkProdQty && checkProdQty.err) {
      res.json({ err: checkProdQty.err, backToCart: true });
    } else {
      const newOrder = new Order({
        orderType: "pos",
        orderStatus,
        statusHistory: [
          {
            status: orderStatus,
            remarks: "Order was created.",
            date: new Date(),
          },
        ],
        cartTotal,
        discount,
        addDiscount,
        cash,
        createdBy: user._id,
        orderedBy: checkUser && checkUser._id ? checkUser._id : user._id,
        orderedName: customerName || user.name,
        estoreid: new ObjectId(estoreid),
        orderNotes,
        products,
      });

      const order = await newOrder.save();

      if (order) {
        let newProducts = [];

        const updatedOrder = await Order.findOneAndUpdate(
          {
            _id: new ObjectId(order._id),
            estoreid: new ObjectId(estoreid),
          },
          { orderCode: order._id.toString().slice(-12) },
          { new: true },
        );

        await updateOrderedProd(order.products, estoreid, true);
        createRaffle(estoreid, user, order);

        const orderProducts = order.products;

        for (i = 0; i < orderProducts.length; i++) {
          const productId = orderProducts[i].product;
          const cacheKey = `products:${estoreid}`;

          let result = null;

          const cachedData = await redisClient.get(cacheKey);

          if (cachedData) {
            const parsedData = JSON.parse(cachedData);

            const cachedProducts = Array.isArray(parsedData.products)
              ? parsedData.products
              : [];

            result = cachedProducts.find(
              (product) =>
                product &&
                product._id &&
                product._id.toString() === productId.toString(),
            );
          }

          if (!result && ObjectId.isValid(productId)) {
            result = await Product.findOne({
              _id: new ObjectId(productId),
              estoreid: new ObjectId(estoreid),
            }).exec();
          }

          if (result && result._id) {
            newProducts.push(result);
          }
        }

        await Estore.findOneAndUpdate(
          {
            _id: new ObjectId(estoreid),
          },
          {
            productChange: new Date().valueOf(),
            orderChange: new Date().valueOf(),
          },
          { new: true },
        );

        res.json({ order: updatedOrder, newProducts });
      } else {
        res.json({ err: "Cannot save the order." });
      }
    }
  } catch (error) {
    res.json({ err: "Saving cart to order fails. " + error.message });
  }
};

exports.submitEditOrder = async (req, res) => {
  const orderid = req.params.orderid;
  const cartTotal = req.body.cartTotal;
  const products = req.body.products;
  const estoreid = req.headers.estoreid;
  const email = req.user.email;

  try {
    const user = await User.findOne({ email }).exec();
    if (user) {
      await Order.findOneAndUpdate(
        {
          _id: new ObjectId(orderid),
          estoreid: Object(estoreid),
        },
        {
          products,
          cartTotal,
        },
        { new: true },
      );

      await Estore.findOneAndUpdate(
        {
          _id: new ObjectId(estoreid),
        },
        { orderChange: new Date().valueOf() },
        { new: true },
      );

      res.json({ ok: true });
    } else {
      res.json({ err: "Cannot fetch the cart details." });
    }
  } catch (error) {
    res.json({ err: "Saving edit order fails. " + error.message });
  }
};

exports.sendOrder = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const email = req.user.email;
  const mongoid = req.body.mongoid;
  const orderCode = req.body.orderCode;

  const orderType = req.body.orderType;
  const orderStatus = req.body.orderStatus;
  const cartTotal = req.body.cartTotal;
  const delfee = req.body.delfee;
  const discount = req.body.discount;
  const servefee = req.body.servefee;
  const addDiscount = req.body.addDiscount;
  const cash = req.body.cash;
  const products = req.body.products;

  const orderedBy = req.body.orderedBy;
  const customerName = req.body.customerName;
  const customerPhone = req.body.customerPhone;
  const customerEmail = req.body.customerEmail;
  const orderNotes = req.body.orderNotes;

  try {
    let user = await User.findOne({ email }).exec();
    let checkUser = {};
    let checkOrder = {};
    let order = {};

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

    if (mongoid && ObjectId.isValid(mongoid)) {
      checkOrder = await Order.findOne({
        _id: new ObjectId(mongoid),
        orderCode,
      }).exec();
    }

    if (checkOrder && checkOrder._id) {
      order = await Order.findOneAndUpdate(
        {
          _id: new ObjectId(mongoid),
          orderCode,
        },
        {
          orderType,
          orderStatus,
          cartTotal,
          delfee,
          discount,
          servefee,
          addDiscount,
          cash,
          createdBy: user._id,
          orderedBy: checkUser && checkUser._id ? checkUser._id : user._id,
          orderedName: customerName || user.name,
          estoreid: new ObjectId(estoreid),
          orderNotes,
          products,
        },
        { new: true },
      );
    } else {
      const newOrder = new Order({
        orderType,
        orderStatus,
        cartTotal,
        delfee,
        discount,
        servefee,
        addDiscount,
        cash,
        createdBy: user._id,
        orderedBy: checkUser && checkUser._id ? checkUser._id : user._id,
        orderedName: customerName || user.name,
        estoreid: new ObjectId(estoreid),
        orderNotes,
        products,
      });

      order = await newOrder.save();

      await Order.findByIdAndUpdate(order._id, {
        orderCode: order._id.toString().slice(-12),
      }).exec();
    }

    if (order) {
      await Estore.findByIdAndUpdate(estoreid, {
        orderChange: new Date().valueOf(),
        productChange: new Date().valueOf(),
      }).exec();

      res.json(order);
    }
  } catch (error) {
    res.json({ err: "Saving cart to order fails. " + error.message });
  }
};

exports.updateOrder = async (req, res) => {
  const estoreid = req.headers.estoreid;

  const orderid = req.body.orderid;
  const orderStatus = req.body.orderStatus;
  const remarks = req.body.remarks;

  try {
    const order = await Order.findOne({
      _id: new ObjectId(orderid),
      estoreid: new ObjectId(estoreid),
    }).exec();
    const statusHistory = order.statusHistory;

    statusHistory.push({
      status: orderStatus,
      remarks,
      date: new Date(),
    });

    const updatedOrder = await Order.findOneAndUpdate(
      {
        _id: new ObjectId(orderid),
        estoreid: new ObjectId(estoreid),
      },
      { orderStatus, statusHistory },
      { new: true },
    );

    await Estore.findOneAndUpdate(
      {
        _id: new ObjectId(estoreid),
      },
      { orderChange: new Date().valueOf() },
      { new: true },
    );

    res.json(updatedOrder);
  } catch (error) {
    res.json({ err: "Updating order status fails. " + error.message });
  }
};

exports.deleteOrder = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const email = req.user.email;
  const orderid = req.params.orderid;

  try {
    const user = await User.findOne({ email }).exec();
    if (user) {
      const order = await Order.findOneAndDelete({
        _id: new ObjectId(orderid),
        orderedBy: user._id,
        estoreid: Object(estoreid),
      });

      await Estore.findOneAndUpdate(
        {
          _id: new ObjectId(estoreid),
        },
        { orderChange: new Date().valueOf() },
        { new: true },
      );

      if (order) {
        res.json(order);
      } else {
        res.json({ err: "Order not found." });
      }
    } else {
      res.json({ err: "Cannot delete the order." });
    }
  } catch (error) {
    res.json({ err: "Deleting order fails. " + error.message });
  }
};
