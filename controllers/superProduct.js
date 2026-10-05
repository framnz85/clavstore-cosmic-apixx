const Product = require("../models/superProduct");

exports.getMarketPrices = async (req, res) => {
  const barcode = req.params.barcode;
  try {
    const marketSupplierPrices = await Product.aggregate([
      {
        $match: { barcode },
      },
      {
        $group: {
          _id: "$barcode",
          minPrice: { $min: "$supplierPrice" },
          maxPrice: { $max: "$supplierPrice" },
          avgPrice: { $avg: "$supplierPrice" },
        },
      },
      {
        $project: {
          barcode: "$_id",
          minPrice: 1,
          maxPrice: 1,
          avgPrice: 1,
          _id: 0,
        },
      },
    ]);

    const marketRetailPrices = await Product.aggregate([
      {
        $match: { barcode },
      },
      {
        $group: {
          _id: "$barcode",
          minPrice: { $min: "$price" },
          maxPrice: { $max: "$price" },
          avgPrice: { $avg: "$price" },
        },
      },
      {
        $project: {
          barcode: "$_id",
          minPrice: 1,
          maxPrice: 1,
          avgPrice: 1,
          _id: 0,
        },
      },
    ]);

    res.json({
      minsprice:
        marketSupplierPrices && marketSupplierPrices[0]
          ? marketSupplierPrices[0].minPrice
          : 0,
      maxsprice:
        marketSupplierPrices && marketSupplierPrices[0]
          ? marketSupplierPrices[0].maxPrice
          : 0,
      avgsprice:
        marketSupplierPrices && marketSupplierPrices[0]
          ? marketSupplierPrices[0].avgPrice
          : 0,
      minrprice:
        marketRetailPrices && marketRetailPrices[0]
          ? marketRetailPrices[0].minPrice
          : 0,
      maxrprice:
        marketRetailPrices && marketRetailPrices[0]
          ? marketRetailPrices[0].maxPrice
          : 0,
      avgrprice:
        marketRetailPrices && marketRetailPrices[0]
          ? marketRetailPrices[0].avgPrice
          : 0,
    });
  } catch (error) {
    res.json({ err: "Getting market prices failed. " + error.message });
  }
};
