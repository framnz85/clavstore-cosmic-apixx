/**
 * Backend Routes for Customer Management
 * Use this with Express.js
 *
 * Usage in your Express server:
 * const customerRoutes = require('./customerRoutes');
 * app.use('/api', customerRoutes);
 */

const express = require("express");
const crypto = require("crypto");
const router = express.Router();

// Mock database functions - replace with your actual database
// const { db } = require('./database');

/**
 * POST /api/customers
 * Create new customer record
 */
router.post("/customers", async (req, res) => {
  try {
    const {
      email,
      name,
      phone,
      address,
      paymentId,
      sourceId,
      amount,
      paymentStatus,
      accessType,
    } = req.body;

    // Validate required fields
    if (!email || !name || !paymentId) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
      });
    }

    // Check if customer already exists
    // const existingCustomer = await db.customers.findOne({ email });
    // if (existingCustomer) {
    //   return res.status(400).json({
    //     success: false,
    //     error: "Customer already exists",
    //   });
    // }

    // Create customer record
    const customer = {
      id: `cust_${Date.now()}`,
      email,
      name,
      phone,
      address,
      paymentId,
      sourceId,
      amount,
      paymentStatus,
      accessType,
      createdAt: new Date(),
      updatedAt: new Date(),
      active: true,
    };

    // Save to database
    // await db.customers.insertOne(customer);

    console.log("Customer created:", customer);

    res.json({
      success: true,
      customer,
    });
  } catch (error) {
    console.error("Customer creation error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/license-keys
 * Generate license key for customer
 */
router.post("/license-keys", async (req, res) => {
  try {
    const { customerId, licenseType, expiresAt } = req.body;

    if (!customerId || !licenseType) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
      });
    }

    // Generate unique license key
    const licenseKey = `LIC-${crypto.randomBytes(16).toString("hex").toUpperCase()}`;

    const license = {
      id: `lic_${Date.now()}`,
      customerId,
      licenseKey,
      licenseType,
      expiresAt: expiresAt || null,
      createdAt: new Date(),
      activated: false,
      activatedAt: null,
    };

    // Save to database
    // await db.licenseKeys.insertOne(license);

    console.log("License key generated:", license);

    res.json({
      success: true,
      licenseKey,
      license,
    });
  } catch (error) {
    console.error("License generation error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/verify-license
 * Verify license key validity
 */
router.post("/verify-license", async (req, res) => {
  try {
    const { licenseKey } = req.body;

    if (!licenseKey) {
      return res.status(400).json({
        success: false,
        error: "License key is required",
      });
    }

    // Check license in database
    // const license = await db.licenseKeys.findOne({ licenseKey });

    // Mock response
    const license = {
      valid: true,
      licenseKey,
      licenseType: "lifetime",
      expiresAt: null,
      activated: true,
    };

    if (!license) {
      return res.json({
        success: false,
        valid: false,
        error: "License key not found",
      });
    }

    // Check if expired
    if (license.expiresAt && new Date(license.expiresAt) < new Date()) {
      return res.json({
        success: false,
        valid: false,
        error: "License has expired",
      });
    }

    res.json({
      success: true,
      valid: true,
      license,
    });
  } catch (error) {
    console.error("License verification error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/customers/email/:email
 * Get customer by email
 */
router.get("/customers/email/:email", async (req, res) => {
  try {
    const { email } = req.params;

    // Get customer from database
    // const customer = await db.customers.findOne({ email });

    // Mock response
    const customer = {
      id: "cust_123",
      email,
      name: "Test Customer",
      accessType: "lifetime",
      active: true,
    };

    if (!customer) {
      return res.status(404).json({
        success: false,
        error: "Customer not found",
      });
    }

    res.json({
      success: true,
      customer,
    });
  } catch (error) {
    console.error("Error fetching customer:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * PUT /api/customers/:customerId/access
 * Update customer access
 */
router.put("/customers/:customerId/access", async (req, res) => {
  try {
    const { customerId } = req.params;
    const { accessType, features, expiresAt } = req.body;

    const updateData = {
      updatedAt: new Date(),
      ...(accessType && { accessType }),
      ...(features && { features }),
      ...(expiresAt && { expiresAt }),
    };

    // Update in database
    // await db.customers.updateOne(
    //   { id: customerId },
    //   { $set: updateData }
    // );

    console.log("Customer access updated:", customerId, updateData);

    res.json({
      success: true,
      message: "Access updated successfully",
      customerId,
      updates: updateData,
    });
  } catch (error) {
    console.error("Error updating access:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/send-welcome-email
 * Send welcome email with license key
 */
router.post("/send-welcome-email", async (req, res) => {
  try {
    const { email, name, licenseKey } = req.body;

    if (!email || !licenseKey) {
      return res.status(400).json({
        success: false,
        error: "Missing email or license key",
      });
    }

    // Send email using your email service (SendGrid, AWS SES, etc.)
    // Example using nodemailer:
    // await transporter.sendMail({
    //   from: 'noreply@clavstore.com',
    //   to: email,
    //   subject: 'Welcome to Cosmic Clavstore - Your License Key',
    //   html: `
    //     <h1>Welcome, ${name}!</h1>
    //     <p>Thank you for purchasing Cosmic Clavstore Lifetime Access.</p>
    //     <p><strong>Your License Key:</strong></p>
    //     <p style="font-size: 16px; background: #f0f0f0; padding: 10px;">
    //       ${licenseKey}
    //     </p>
    //     <p>Use this key to activate your account.</p>
    //   `
    // });

    console.log(`Welcome email sent to ${email}`);

    res.json({
      success: true,
      message: "Welcome email sent successfully",
    });
  } catch (error) {
    console.error("Error sending welcome email:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/transactions
 * Log payment transaction
 */
router.post("/transactions", async (req, res) => {
  try {
    const {
      customerId,
      paymentId,
      amount,
      currency,
      status,
      paymentMethod,
      metadata,
    } = req.body;

    const transaction = {
      id: `txn_${Date.now()}`,
      customerId,
      paymentId,
      amount,
      currency,
      status,
      paymentMethod,
      metadata,
      createdAt: new Date(),
    };

    // Save to database
    // await db.transactions.insertOne(transaction);

    console.log("Transaction logged:", transaction);

    res.json({
      success: true,
      transaction,
    });
  } catch (error) {
    console.error("Error logging transaction:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/refunds
 * Process refund
 */
router.post("/refunds", async (req, res) => {
  try {
    const { paymentId, reason } = req.body;

    const refund = {
      id: `ref_${Date.now()}`,
      paymentId,
      reason,
      status: "pending",
      processedAt: new Date(),
      amount: 99000, // Default refund amount
    };

    // Process refund through PayMongo API
    // await processPaymongoRefund(paymentId);

    // Save to database
    // await db.refunds.insertOne(refund);

    console.log("Refund initiated:", refund);

    res.json({
      success: true,
      refund,
      message: "Refund initiated successfully",
    });
  } catch (error) {
    console.error("Error processing refund:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/stats/customers
 * Get customer statistics
 */
router.get("/stats/customers", async (req, res) => {
  try {
    // Get stats from database
    // const totalCustomers = await db.customers.countDocuments();
    // const totalRevenue = await db.customers.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]);
    // const activeCustomers = await db.customers.countDocuments({ active: true });

    const stats = {
      totalCustomers: 0,
      activeCustomers: 0,
      totalRevenue: 0,
      averageOrderValue: 990,
      monthlySignups: 0,
      conversionRate: "0%",
    };

    // Calculate actual stats...

    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/customers/export
 * Export customers list
 */
router.get("/customers/export", async (req, res) => {
  try {
    const { format = "csv" } = req.query;

    // Get all customers from database
    // const customers = await db.customers.find().toArray();

    if (format === "csv") {
      // Generate CSV
      const csv = "Email,Name,Phone,Amount,Status,Created At\n";
      // Add customer data...

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        "attachment; filename=customers.csv",
      );
      res.send(csv);
    } else if (format === "json") {
      res.json({
        success: true,
        customers: [], // Mock data
      });
    }
  } catch (error) {
    console.error("Error exporting customers:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
