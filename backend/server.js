require("dotenv").config();

const express = require("express");
const path = require("path");
const session = require("express-session");
const bcrypt = require("bcrypt");
const pool = require("./config/db");

const app = express();
const LENS_PRICES = {
  basic: 0,
  bluelight: 400,
  antiglare: 350,
  thin: 900,
  photochromic: 1400,
  progressive: 2200
};
app.use(express.static(path.join(__dirname, "..", "public")));
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(
  session({
    name: "visioncare.admin.sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 60 * 1000
    }
  })
);
app.post("/api/admin/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (
      typeof username !== "string" ||
      typeof password !== "string" ||
      !username ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: "Enter your username and password."
      });
    }

    const expectedUsername = process.env.ADMIN_USERNAME;
    const passwordHash = process.env.ADMIN_PASSWORD_HASH;

    if (!expectedUsername || !passwordHash || !process.env.SESSION_SECRET) {
      return res.status(500).json({
        success: false,
        message: "Admin authentication is not configured."
      });
    }

    const usernameMatches = username === expectedUsername;
    const passwordMatches = await bcrypt.compare(password, passwordHash);

    if (!usernameMatches || !passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Incorrect username or password."
      });
    }

    req.session.regenerate((error) => {
      if (error) {
        console.error("Admin session error:", error.message);
        return res.status(500).json({
          success: false,
          message: "Could not start an admin session."
        });
      }

      req.session.admin = {
        username: expectedUsername
      };

      req.session.save((saveError) => {
        if (saveError) {
          console.error("Admin session save error:", saveError.message);
          return res.status(500).json({
            success: false,
            message: "Could not save the admin session."
          });
        }

        return res.json({
          success: true,
          message: "Admin login successful."
        });
      });
    });
  } catch (error) {
    console.error("Admin login error:", error.message);

    res.status(500).json({
      success: false,
      message: "Could not process admin login."
    });
  }
});

app.get("/api/admin/me", (req, res) => {
  if (!req.session.admin) {
    return res.status(401).json({
      success: false,
      message: "Not logged in."
    });
  }

  res.json({
    success: true,
    username: req.session.admin.username
  });
});

app.get("/api/admin/stats", async (req, res) => {
  if (!req.session.admin) {
    return res.status(401).json({
      success: false,
      message: "Not logged in."
    });
  }

  try {
    const [orderRows] = await pool.query(
      "SELECT COUNT(*) AS total FROM orders"
    );

    const [productRows] = await pool.query(
      "SELECT COUNT(*) AS total FROM products WHERE active = 1"
    );

    const [couponRows] = await pool.query(
      "SELECT COUNT(*) AS total FROM coupons WHERE active = 1"
    );

    res.json({
      success: true,
      stats: {
        totalOrders: orderRows[0].total,
        activeProducts: productRows[0].total,
        activeCoupons: couponRows[0].total
      }
    });
  } catch (error) {
    console.error("Admin stats error:", error.message);

    res.status(500).json({
      success: false,
      message: "Could not load dashboard statistics."
    });
  }
});

app.post("/api/admin/logout", (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      console.error("Admin logout error:", error.message);
      return res.status(500).json({
        success: false,
        message: "Could not log out."
      });
    }

    res.clearCookie("visioncare.admin.sid", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax"
    });

    res.json({
      success: true,
      message: "Logged out successfully."
    });
  });
});
app.post("/api/orders", async (req, res) => {
  let connection;

  try {
    connection = await pool.getConnection();
    const {
      customerName,
      email,
      phone,
      address,
      paymentMethod,
      items,
      couponCode = null,
      discount = 0
    } = req.body;

    if (
      !customerName?.trim() ||
      !email?.trim() ||
      !phone?.trim() ||
      !address?.trim() ||
      !paymentMethod ||
      !Array.isArray(items) ||
      items.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required order details."
      });
    }

    if (
      items.some(
        (item) =>
          !item.productId ||
          !Number.isInteger(Number(item.qty)) ||
          Number(item.qty) < 1
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "One or more order items are invalid."
      });
    }

    await connection.beginTransaction();

    const productCodes = [...new Set(items.map((item) => String(item.productId)))];

    const [products] = await connection.query(
      `SELECT id, product_code, name, price, stock
       FROM products
       WHERE product_code IN (?) AND active = 1
       FOR UPDATE`,
      [productCodes]
    );

    const productMap = new Map(
      products.map((product) => [product.product_code, product])
    );

    let subtotal = 0;
    const orderItems = [];

    for (const item of items) {
      const product = productMap.get(String(item.productId));
      const quantity = Number(item.qty);

      if (!product) {
        throw new Error(`Product ${item.productId} is unavailable.`);
      }

      if (product.stock < quantity) {
        throw new Error(`${product.name} does not have enough stock.`);
      }

     const lensId =
  typeof item.lens === "string"
    ? item.lens
    : item.lens?.id || "basic";

if (!Object.prototype.hasOwnProperty.call(LENS_PRICES, lensId)) {
  throw new Error("The selected lens option is invalid.");
}

  const lensPrice = LENS_PRICES[lensId];
    const unitPrice = Number(product.price) + lensPrice;
      subtotal += unitPrice * quantity;

      orderItems.push({
        product,
        quantity,
        unitPrice,
        lens: lensId || null,
        prescription: item.prescription || null
      });
    }

   let requestedDiscount = 0;
let coupon = null;

if (couponCode) {
  const normalizedCode = String(couponCode).trim().toUpperCase();

  const [coupons] = await connection.query(
    `SELECT id, code, discount_percent, minimum_order,
            usage_limit, used_count, expires_at, active
     FROM coupons
     WHERE UPPER(code) = ?
     FOR UPDATE`,
    [normalizedCode]
  );

  coupon = coupons[0];

  if (!coupon || !coupon.active) {
    throw new Error("This coupon is invalid or inactive.");
  }

  if (
    coupon.expires_at &&
    new Date(coupon.expires_at).getTime() < Date.now()
  ) {
    throw new Error("This coupon has expired.");
  }

  if (coupon.used_count >= coupon.usage_limit) {
    throw new Error("This coupon has reached its usage limit.");
  }

  if (subtotal < Number(coupon.minimum_order)) {
    throw new Error(
      `Minimum order ₹${Number(coupon.minimum_order).toFixed(2)} required for ${coupon.code}.`
    );
  }

  requestedDiscount = Math.round(
    (subtotal * Number(coupon.discount_percent)) / 100
  );
}

const taxableAmount = subtotal - requestedDiscount;
const deliveryFee = taxableAmount < 999 ? 79 : 0;
const tax = Math.round(taxableAmount * 0.05);
const total = taxableAmount + deliveryFee + tax;

    const orderCode =
      "VC-" + Date.now().toString(36).toUpperCase() +
      "-" + Math.random().toString(36).slice(2, 7).toUpperCase();

    const [orderResult] = await connection.query(
      `INSERT INTO orders
       (order_code, customer_name, email, phone, address,
        subtotal, discount, delivery_fee, total, payment_method,
        payment_status, order_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'placed')`,
      [
        orderCode,
        customerName.trim(),
        email.trim(),
        phone.trim(),
        address.trim(),
        subtotal,
        requestedDiscount,
        deliveryFee,
        total,
        String(paymentMethod).slice(0, 40)
      ]
    );

    for (const item of orderItems) {
      await connection.query(
        `INSERT INTO order_items
         (order_id, product_id, product_code, product_name,
          quantity, unit_price, lens_option, prescription_data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderResult.insertId,
          item.product.id,
          item.product.product_code,
          item.product.name,
          item.quantity,
          item.unitPrice,
          item.lens,
          item.prescription ? JSON.stringify(item.prescription) : null
        ]
      );

      await connection.query(
        `UPDATE products
         SET stock = stock - ?
         WHERE id = ?`,
        [item.quantity, item.product.id]
      );
    }
    
    if (coupon) {
  const [couponUpdate] = await connection.query(
    `UPDATE coupons
     SET used_count = used_count + 1
     WHERE id = ? AND used_count < usage_limit`,
    [coupon.id]
  );

  if (couponUpdate.affectedRows !== 1) {
    throw new Error("This coupon has reached its usage limit.");
  }
}

    await connection.commit();

    res.status(201).json({
      success: true,
      message: "Order saved successfully.",
      order: {
        id: orderResult.insertId,
        orderCode,
        subtotal,
        discount: requestedDiscount,
        deliveryFee,
        total,
        status: "placed"
      }
    });
  } catch (error) {
    await connection.rollback();

    console.error("Create order error:", error.message);

    res.status(400).json({
      success: false,
      message: error.message || "Could not save the order."
    });
  } finally {
    connection.release();
  }
});
app.get("/api/coupons/:code", async (req, res) => {
  try {
    const code = String(req.params.code || "").trim().toUpperCase();

    const [rows] = await pool.query(
      `SELECT
        code,
        discount_percent,
        minimum_order,
        usage_limit,
        used_count,
        expires_at,
        active
       FROM coupons
       WHERE UPPER(code) = ?
       LIMIT 1`,
      [code]
    );

    const coupon = rows[0];

    if (!coupon || !coupon.active) {
      return res.status(404).json({
        success: false,
        message: "Invalid coupon code."
      });
    }

    if (
      coupon.expires_at &&
      new Date(coupon.expires_at).getTime() < Date.now()
    ) {
      return res.status(400).json({
        success: false,
        message: "This coupon has expired."
      });
    }

    if (Number(coupon.used_count) >= Number(coupon.usage_limit)) {
      return res.status(400).json({
        success: false,
        message: "This coupon has reached its usage limit."
      });
    }

    res.json({
      success: true,
      coupon: {
        code: coupon.code,
        percent: Number(coupon.discount_percent),
        minOrder: Number(coupon.minimum_order),
        usageLimit: Number(coupon.usage_limit),
        used: Number(coupon.used_count),
        expiry: coupon.expires_at
      }
    });
  } catch (error) {
    console.error("Coupon validation error:", error.message);

    res.status(500).json({
      success: false,
      message: "Could not validate the coupon."
    });
  }
});
app.get("/api/products", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT
        product_code AS id,
        name,
        category,
        brand,
        price,
        original_price AS originalPrice,
        stock,
        description,
        image_url AS imageUrl,
        frame_shape AS frameShape,
        frame_material AS frameMaterial,
        frame_color AS frameColor,
        gender,
        rating,
        review_count AS reviewCount,
        size
      FROM products
      WHERE active = 1
      ORDER BY id`
    );

    res.json({
      success: true,
      count: rows.length,
      products: rows
    });
  } catch (error) {
    console.error("Products API error:", error.message);

    res.status(500).json({
      success: false,
      message: "Could not load products."
    });
  }
});
app.get("/api/health", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT DATABASE() AS databaseName"
    );

    res.json({
      success: true,
      message: "Backend connected to MySQL successfully!",
      database: rows[0].databaseName
    });
  } catch (error) {
    console.error("Database connection error:", error.message);

    res.status(500).json({
      success: false,
      message: "Could not connect to the database."
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});