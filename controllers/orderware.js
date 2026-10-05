const ObjectId = require("mongoose").Types.ObjectId;

const Estore = require("../models/estore");
const User = require("../models/user");
const Cart = require("../models/cart");
const OrderWare = require("../models/orderWare");
const {
  createRaffle,
  checkOrderedProd,
  updateOrderedWareProd,
} = require("./common");

exports.adminWarehouseOrder = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const orderid = req.params.orderid;

  try {
    const order = await OrderWare.findOne({
      _id: new ObjectId(orderid),
      estoreid: Object(estoreid),
    })
      .populate("estoreid", "_id name storeAddress")
      .populate("products.product")
      .populate("orderedBy")
      .populate("paymentOption")
      .exec();
    if (order) {
      res.json(order);
    } else {
      res.json({ err: "Sorry, there is no data on this order." });
    }
  } catch (error) {
    res.json({ err: "Fetching an order failed. " + error.message });
  }
};

exports.adminWarehouseOrders = async (req, res) => {
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
    } = req.body;

    const user = await User.findOne({ email }).exec();
    const searchObj = {};

    if (user.role === "cashier") {
      searchObj.estoreid = new ObjectId(estoreid);
      searchObj.createdBy = user._id;
      if (searchQuery) {
        searchObj.$or = [
          { orderCode: { $regex: searchQuery, $options: "i" } },
          { orderedName: { $regex: searchQuery, $options: "i" } },
        ];
      }
      if (status !== "All Status") searchObj.orderStatus = status;
      if (orderedBy) searchObj.orderedBy = new ObjectId(orderedBy);

      if (sales && sales.type && sales.type === "sales") {
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
          $gte: new Date(new Date(startDate).setHours(16, 0o0, 0o0)),
          $lte: new Date(new Date(endDate).setHours(15, 59, 59)),
        };
      }
      orders = await OrderWare.find(searchObj)
        .skip((currentPage - 1) * pageSize)
        .sort({ [sortkey]: sort })
        .limit(pageSize)
        .select(
          "_id orderCode orderedBy orderedName cartTotal delfee servefee discount addDiscount orderType orderStatus deliveryPrefer deliverInstruct estoreid delAddress duedate createdAt",
        )
        .populate("estoreid", "_id name storeAddress")
        .populate("orderedBy")
        .populate("paymentOption")
        .exec();
    } else {
      searchObj.estoreid = new ObjectId(estoreid);
      if (searchQuery) {
        searchObj.$or = [
          { orderCode: { $regex: searchQuery, $options: "i" } },
          { orderedName: { $regex: searchQuery, $options: "i" } },
        ];
      }
      if (status !== "All Status") searchObj.orderStatus = status;
      if (orderedBy) searchObj.orderedBy = new ObjectId(orderedBy);

      if (sales && sales.type && sales.type === "sales") {
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
          $gte: new Date(new Date(startDate).setHours(16, 0o0, 0o0)),
          $lte: new Date(new Date(endDate).setHours(15, 59, 59)),
        };
      }
      orders = await OrderWare.find(searchObj)
        .skip((currentPage - 1) * pageSize)
        .sort({ [sortkey]: sort })
        .limit(pageSize)
        .select(
          "_id orderCode orderedBy orderedName cartTotal delfee servefee discount addDiscount orderType orderStatus deliveryPrefer deliverInstruct estoreid delAddress duedate createdAt",
        )
        .populate("estoreid", "_id name storeAddress")
        .populate("orderedBy")
        .populate("paymentOption")
        .exec();
    }

    const countOrder = await OrderWare.countDocuments(searchObj).exec();

    if (status === "Credit") {
      totalCredit = await OrderWare.aggregate([
        { $match: searchObj },
        {
          $group: {
            _id: null,
            sum_cartTotal: { $sum: "$cartTotal" },
            sum_delfee: { $sum: "$delfee" },
            sum_discount: { $sum: "$discount" },
            sum_addDiscount: { $sum: "$addDiscount" },
          },
        },
      ]);
      if (totalCredit && totalCredit[0]) {
        collectibles =
          parseFloat(totalCredit[0].sum_cartTotal) +
          parseFloat(totalCredit[0].sum_delfee) +
          parseFloat(totalCredit[0].sum_discount) +
          parseFloat(totalCredit[0].sum_addDiscount);
      }
    }

    res.json({ orders, count: countOrder, collectibles });
  } catch (error) {
    res.json({ err: "Fetching orders failed. " + error.message });
  }
};

exports.saveCartWarehouseOrder = async (req, res) => {
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

  try {
    let user = await User.findOne({ email }).exec();

    const cart = await Cart.findOne({
      orderedBy: new ObjectId(user._id),
      estoreid: new ObjectId(estoreid),
    });

    const checkProdQty = await checkOrderedProd(cart.products, estoreid);

    if (checkProdQty && checkProdQty.err) {
      res.json({ err: checkProdQty.err, backToCart: true });
    } else {
      const estore = await Estore.findOne({
        _id: new ObjectId(estoreid),
      });

      if (!estore.orderInitStat) estore.orderInitStat = "Not Processed";
      if (!estore.orderInitRemarks)
        estore.orderInitRemarks = "Order was created.";

      const statusHistory = [
        {
          status:
            orderStatus === "Completed" || orderStatus === "Credit"
              ? orderStatus
              : estore.orderInitStat,
          remarks: estore.orderInitRemarks,
          date: new Date(),
        },
      ];

      if (orderType === "pos" && orderStatus !== "Credit") {
        statusHistory.push({
          status: "Completed",
          remarks: "Order was completed.",
          date: new Date(),
        });
      }

      const newOrder = new OrderWare({
        orderCode: cart._id.toString().slice(-12),
        orderType,
        products: cart.products,
        paymentOption: new ObjectId(paymentOption),
        orderStatus:
          orderType === "pos"
            ? orderStatus === "Credit"
              ? "Credit"
              : "Completed"
            : estore.orderInitStat,
        statusHistory,
        cartTotal: cart.cartTotal,
        delfee,
        discount,
        servefee,
        addDiscount,
        cash,
        duedate,
        createdBy: new ObjectId(user._id),
        orderedBy: new ObjectId(orderedBy),
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
          orderedBy: new ObjectId(user._id),
          estoreid: new ObjectId(estoreid),
        });

        if (
          orderType === "pos" &&
          (order.orderStatus === "Credit" || order.orderStatus === "Completed")
        ) {
          await updateOrderedWareProd(
            order.products,
            estoreid,
            orderedBy,
            true,
          );

          createRaffle(estoreid, user, order);
        }
        if (
          orderType === "web" &&
          estore &&
          estore.orderStatus &&
          estore.orderStatus === estore.orderInitStat
        ) {
          await updateOrderedWareProd(
            order.products,
            estoreid,
            orderedBy,
            true,
          );
        }
      } else {
        res.json({ err: "Cannot save the order." });
      }
    }
  } catch (error) {
    res.json({ err: "Saving cart to order fails. " + error.message });
  }
};
