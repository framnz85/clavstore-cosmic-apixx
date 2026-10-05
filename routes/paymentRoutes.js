/**
 * Backend API Routes for PayMongo Payment Processing
 * Use this with Express.js or similar Node.js framework
 *
 * Installation:
 * npm install express cors dotenv axios body-parser
 *
 * Usage in your Express server:
 * const paymentRoutes = require('./paymentRoutes');
 * app.use('/api', paymentRoutes);
 */

const express = require("express");
const axios = require("axios");
const router = express.Router();

// Initialize PayMongo API base URL
const PAYMONGO_API_URL = "https://api.paymongo.com/v1";
const PAYMONGO_API_KEY = process.env.PAYMONGO_API_KEY;

// Helper function to create Basic Auth header
const getAuthHeader = () => {
  const auth = Buffer.from(`${PAYMONGO_API_KEY}:`).toString("base64");
  return {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json",
  };
};

/**
 * POST /api/create-payment-intent
 * Create a payment intent and return checkout session
 */
router.post("/create-payment-intent", async (req, res) => {
  try {
    const { name, email, phone, address, amount } = req.body;

    // Validate required fields
    if (!name || !email || !phone || !amount) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
      });
    }

    const auth = Buffer.from(`${PAYMONGO_API_KEY}:`).toString("base64");

    // Create a payment intent
    const paymentIntentResponse = await axios.post(
      `${PAYMONGO_API_URL}/payment_intents`,
      {
        data: {
          attributes: {
            amount: parseInt(amount), // amount in centavos
            payment_method_options: {
              card: {
                request_three_d_secure: "optional",
              },
            },
            description: `Cosmic Clavstore Lifetime Access - ${name}`,
            statement_descriptor: "COSMIC CLAVSTORE",
            metadata: {
              customer_name: name,
              customer_email: email,
              customer_phone: phone,
              customer_address: address,
              order_id: `ORDER-${Date.now()}`,
            },
          },
        },
      },
      {
        headers: getAuthHeader(),
      },
    );

    const paymentIntentId = paymentIntentResponse.data.data.id;
    const clientKey = paymentIntentResponse.data.data.attributes.client_key;

    // Optionally create a source for card payments
    const sourceResponse = await axios.post(
      `${PAYMONGO_API_URL}/sources`,
      {
        data: {
          attributes: {
            type: "card",
            amount: parseInt(amount),
            currency: "PHP",
            redirect: {
              success: `${process.env.FRONTEND_URL || "http://localhost:3000"}/checkout-success?email=${encodeURIComponent(email)}`,
              failed: `${process.env.FRONTEND_URL || "http://localhost:3000"}/checkout?error=payment_failed`,
            },
            billing: {
              address: {
                line1: address,
                country: "PH",
              },
              name: name,
              email: email,
              phone: phone,
            },
            metadata: {
              customer_name: name,
              customer_email: email,
              customer_phone: phone,
              product: "Cosmic Clavstore Lifetime",
            },
          },
        },
      },
      {
        headers: getAuthHeader(),
      },
    );

    const sourceId = sourceResponse.data.data.id;
    const checkoutUrl =
      sourceResponse.data.data.attributes.redirect.checkout_url;

    // Store payment intent info in database (optional)
    // await savePaymentIntent(paymentIntentId, sourceId, email, amount);

    return res.json({
      success: true,
      paymentIntentId,
      sourceId,
      clientKey,
      checkoutUrl,
    });
  } catch (error) {
    console.error(
      "Payment intent error:",
      error.response?.data || error.message,
    );
    return res.status(500).json({
      success: false,
      error: error.response?.data?.errors || error.message,
    });
  }
});

/**
 * GET /api/payment-status/:paymentIntentId
 * Check status of a payment
 */
router.get("/payment-status/:paymentIntentId", async (req, res) => {
  try {
    const { paymentIntentId } = req.params;

    const response = await axios.get(
      `${PAYMONGO_API_URL}/payment_intents/${paymentIntentId}`,
      {
        headers: getAuthHeader(),
      },
    );

    return res.json({
      success: true,
      status: response.data.data.attributes.status,
      paymentData: response.data.data,
    });
  } catch (error) {
    console.error(
      "Payment status error:",
      error.response?.data || error.message,
    );
    return res.status(500).json({
      success: false,
      error: error.response?.data?.errors || error.message,
    });
  }
});

/**
 * POST /api/verify-payment
 * Verify a payment source
 */
router.post("/verify-payment", async (req, res) => {
  try {
    const { sourceId } = req.body;

    if (!sourceId) {
      return res.status(400).json({
        success: false,
        error: "Source ID is required",
      });
    }

    const response = await axios.get(
      `${PAYMONGO_API_URL}/sources/${sourceId}`,
      {
        headers: getAuthHeader(),
      },
    );

    const paymentStatus = response.data.data.attributes.status;
    const amount = response.data.data.attributes.amount;
    const currency = response.data.data.attributes.currency;
    const metadata = response.data.data.attributes.metadata;

    // Update user access if payment is successful
    if (paymentStatus === "chargeable" || paymentStatus === "paid") {
      // Call your function to grant lifetime access to user
      // Example: grantLifetimeAccess(metadata.customer_email, metadata.customer_name);
    }

    return res.json({
      success: true,
      status: paymentStatus,
      amount,
      currency,
      metadata,
    });
  } catch (error) {
    console.error(
      "Payment verification error:",
      error.response?.data || error.message,
    );
    return res.status(500).json({
      success: false,
      error: error.response?.data?.errors || error.message,
    });
  }
});

/**
 * POST /api/webhook/paymongo
 * Handle PayMongo webhooks
 */
router.post("/webhook/paymongo", express.json(), async (req, res) => {
  try {
    const event = req.body;

    console.log("PayMongo Webhook received:", event.type);

    // Verify the webhook is from PayMongo
    // In production, verify the signature using PAYMONGO_WEBHOOK_SECRET

    switch (event.type) {
      case "payment.paid":
        // Handle successful payment
        const paymentData = event.data.attributes;
        console.log("Payment completed:", paymentData);

        // Grant user lifetime access
        // Example: grantLifetimeAccess(paymentData.metadata.customer_email);

        break;

      case "payment.failed":
        // Handle failed payment
        console.log("Payment failed:", event.data);
        break;

      case "source.chargeable":
        // Handle chargeable source
        console.log("Source is chargeable:", event.data);
        break;

      default:
        console.log("Unhandled event type:", event.type);
    }

    // Acknowledge receipt of webhook
    res.json({ success: true });
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
