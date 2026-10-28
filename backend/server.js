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

  app.get("/api/admin/products", async (req, res) => {
  if (!req.session.admin) {
    return res.status(401).json({
      success: false,
      message: "Not logged in."
    });
  }

  app.post("/api/admin/products", async (req, res) => {
  if (!req.session.admin) {
    return res.status(401).json({
      success: false,
      message: "Not logged in."
    });
  }

  app.get("/api/admin/orders", async (req, res) => {
  if (!req.session.admin) {
    return res.status(401).json({
      success: false,
      message: "Please log in as an administrator."
    });
  }

  try {
    const [orders] = await pool.query(`
      SELECT
        id,
        order_code,
        customer_name,
        email,
        phone,
        address,
        subtotal,
        discount,
        delivery_fee,
        total,
        payment_method,
        payment_status,
        order_status,
        created_at
      FROM orders
      ORDER BY created_at DESC, id DESC
    `);

    res.json({
      success: true,
      orders
    });
  } catch (error) {
    console.error("Admin orders loading error:", error);

    res.status(500).json({
      success: false,
      message: "Could not load orders."
    });
  }
});

  const {
    product_code,
    name,
    category,
    brand,
    price,
    original_price,
    stock,
    description,
    image_url
  } = req.body;

  if (
    typeof product_code !== "string" ||
    typeof name !== "string" ||
    typeof category !== "string" ||
    !product_code.trim() ||
    !name.trim() ||
    !category.trim()
  ) {
    return res.status(400).json({
      success: false,
      message: "Product code, name, and category are required."
    });
  }

  const validPrice = (value) =>
    value !== "" &&
    value !== null &&
    value !== undefined &&
    Number.isFinite(Number(value)) &&
    Number(value) >= 0;

  if (!validPrice(price)) {
    return res.status(400).json({
      success: false,
      message: "Enter a valid selling price."
    });
  }

  const originalPriceProvided =
    original_price !== "" &&
    original_price !== null &&
    original_price !== undefined;

  if (
    originalPriceProvided &&
    (!validPrice(original_price) ||
      Number(original_price) < Number(price))
  ) {
    return res.status(400).json({
      success: false,
      message: "Original price must be valid and at least the selling price."
    });
  }

  if (
    stock === "" ||
    stock === null ||
    stock === undefined ||
    !Number.isSafeInteger(Number(stock)) ||
    Number(stock) < 0
  ) {
    return res.status(400).json({
      success: false,
      message: "Stock must be a whole number of zero or more."
    });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO products
        (product_code, name, category, brand, price, original_price,
         stock, description, image_url, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        product_code.trim(),
        name.trim(),
        category.trim(),
        typeof brand === "string" && brand.trim()
          ? brand.trim()
          : null,
        Number(price),
        originalPriceProvided ? Number(original_price) : null,
        Number(stock),
        typeof description === "string" && description.trim()
          ? description.trim()
          : null,
        typeof image_url === "string" && image_url.trim()
          ? image_url.trim()
          : null
      ]
    );

    res.status(201).json({
      success: true,
      message: "Product added successfully.",
      productId: result.insertId
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "That product code already exists. Please use a different code."
      });
    }

    console.error("Add product error:", error.message);

    res.status(500).json({
      success: false,
      message: "Could not add the product. Please check the server logs."
    });
  }
});

  try {
    const [products] = await pool.query(`
      SELECT
        id,
        product_code,
        name,
        category,
        brand,
        price,
        original_price,
        stock,
        description,
        image_url,
        active
      FROM products
      ORDER BY id DESC
    `);

    res.json({
      success: true,
      products
    });
  } catch (error) {
    console.error("Admin products error:", error.message);

    res.status(500).json({
      success: false,
      message: "Could not load products."
    });
  }
});

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

// ================= ADMIN ORDER MANAGEMENT =================

// Get all orders with search and status filters
app.get("/api/admin/orders", async (req, res) => {
  if (!req.session.admin) {
    return res.status(401).json({
      success: false,
      message: "Please log in as admin."
    });
  }

  try {
    const search = String(req.query.search || "").trim();
    const status = String(req.query.status || "").trim();
    const payment = String(req.query.payment || "").trim();

    const conditions = [];
    const params = [];

    if (search) {
      conditions.push(`(
        order_code LIKE ? OR
        customer_name LIKE ? OR
        email LIKE ? OR
        phone LIKE ?
      )`);

      const term = `%${search}%`;
      params.push(term, term, term, term);
    }

    const allowedStatuses = [
      "placed",
      "confirmed",
      "processing",
      "shipped",
      "delivered",
      "cancelled"
    ];

    if (status && allowedStatuses.includes(status)) {
      conditions.push("order_status = ?");
      params.push(status);
    }

    const allowedPayments = [
      "pending",
      "paid",
      "failed",
      "refunded"
    ];

    if (payment && allowedPayments.includes(payment)) {
      conditions.push("payment_status = ?");
      params.push(payment);
    }

    const where = conditions.length
      ? "WHERE " + conditions.join(" AND ")
      : "";

    const [orders] = await pool.query(
      `SELECT
        id,
        order_code,
        customer_name,
        email,
        phone,
        address,
        subtotal,
        discount,
        delivery_fee,
        total,
        payment_method,
        payment_status,
        order_status
       FROM orders
       ${where}
       ORDER BY id DESC`,
      params
    );

    res.json({
      success: true,
      count: orders.length,
      orders
    });
  } catch (error) {
    console.error("Admin orders error:", error.message);

    res.status(500).json({
      success: false,
      message: "Could not load orders."
    });
  }
});


// Update an order's delivery/order status
app.patch("/api/admin/orders/:id/status", async (req, res) => {
  if (!req.session.admin) {
    return res.status(401).json({
      success: false,
      message: "Please log in as admin."
    });
  }

  const allowedStatuses = [
    "placed",
    "confirmed",
    "processing",
    "shipped",
    "delivered",
    "cancelled"
  ];

  const { status } = req.body;
  const id = Number(req.params.id);

  if (
    !Number.isSafeInteger(id) ||
    id < 1 ||
    !allowedStatuses.includes(status)
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid order ID or order status."
    });
  }

  try {
    const [result] = await pool.query(
      "UPDATE orders SET order_status = ? WHERE id = ?",
      [status, id]
    );

    if (result.affectedRows === 0) {
      const [rows] = await pool.query(
        "SELECT id FROM orders WHERE id = ?",
        [id]
      );

      if (!rows.length) {
        return res.status(404).json({
          success: false,
          message: "Order not found."
        });
      }
    }

    res.json({
      success: true,
      message: "Order status updated successfully."
    });
  } catch (error) {
    console.error("Update order status error:", error.message);

    res.status(500).json({
      success: false,
      message: "Could not update order status."
    });
  }
});


/* ========== ADMIN COUPON MANAGEMENT ========== */

// 1. View existing coupons
app.get("/api/admin/coupons", async (req, res) => {
  if (!req.session.admin) {
    return res.status(401).json({
      success: false,
      message: "Please log in as admin."
    });
  }

  try {
    const [coupons] = await pool.query(`
      SELECT id, code, discount_percent, minimum_order,
             usage_limit, used_count, expires_at, active
      FROM coupons
      ORDER BY id DESC
    `);

    res.json({ success: true, coupons });
  } catch (error) {
    console.error("Admin coupons error:", error.message);
    res.status(500).json({
      success: false,
      message: "Could not load coupons."
    });
  }
});


// 2. Create a new coupon from the admin panel
app.post("/api/admin/coupons", async (req, res) => {
  if (!req.session.admin) {
    return res.status(401).json({
      success: false,
      message: "Please log in as admin."
    });
  }

  try {
    const code = String(req.body.code || "").trim().toUpperCase();
    const discount = Number(req.body.discount_percent);
    const minimum = Number(req.body.minimum_order);
    const limit = Number(req.body.usage_limit);
    const expiry = req.body.expires_at || null;

    if (
      !/^[A-Z0-9_-]{3,30}$/.test(code) ||
      !Number.isFinite(discount) || discount <= 0 || discount > 100 ||
      !Number.isFinite(minimum) || minimum < 0 ||
      !Number.isSafeInteger(limit) || limit < 1
    ) {
      return res.status(400).json({
        success: false,
        message: "Please enter valid coupon details."
      });
    }

    const [result] = await pool.query(
      `INSERT INTO coupons
       (code, discount_percent, minimum_order, usage_limit,
        used_count, expires_at, active)
       VALUES (?, ?, ?, ?, 0, ?, 1)`,
      [code, discount, minimum, limit, expiry]
    );

    res.status(201).json({
      success: true,
      message: "Coupon created successfully.",
      id: result.insertId
    });
  } catch (error) {
    console.error("Create coupon error:", error.message);

    res.status(error.code === "ER_DUP_ENTRY" ? 409 : 500).json({
      success: false,
      message: error.code === "ER_DUP_ENTRY"
        ? "This coupon code already exists."
        : "Could not create coupon."
    });
  }
});


// 3. Activate or deactivate an existing coupon
app.patch("/api/admin/coupons/:id/active", async (req, res) => {
  if (!req.session.admin) {
    return res.status(401).json({
      success: false,
      message: "Please log in as admin."
    });
  }

  const id = Number(req.params.id);
  const active = Number(req.body.active);

  if (!Number.isSafeInteger(id) || id < 1 || ![0, 1].includes(active)) {
    return res.status(400).json({
      success: false,
      message: "Invalid coupon ID or status."
    });
  }

  try {
    const [result] = await pool.query(
      "UPDATE coupons SET active = ? WHERE id = ?",
      [active, id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found."
      });
    }

    res.json({
      success: true,
      message: "Coupon status updated."
    });
  } catch (error) {
    console.error("Coupon status error:", error.message);
    res.status(500).json({
      success: false,
      message: "Could not update coupon status."
    });
  }
});


// 4. Delete a coupon
app.delete("/api/admin/coupons/:id", async (req, res) => {
  if (!req.session.admin) {
    return res.status(401).json({
      success: false,
      message: "Please log in as admin."
    });
  }

  try {
    const [result] = await pool.query(
      "DELETE FROM coupons WHERE id = ?",
      [req.params.id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found."
      });
    }

    res.json({
      success: true,
      message: "Coupon deleted successfully."
    });
  } catch (error) {
    console.error("Delete coupon error:", error.message);
    res.status(500).json({
      success: false,
      message: "Could not delete coupon."
    });
  }
});


app.get("/admin/coupons", (req, res) => {
  res.sendFile(
    path.join(__dirname, "..", "public", "admin", "coupons.html")
  );
});



/* ========== ADMIN CUSTOMER MANAGEMENT ========== */

app.get("/api/admin/customers", async (req, res) => {
  // Only logged-in administrators can view customer data.
  if (!req.session.admin) {
    return res.status(401).json({
      success: false,
      message: "Please log in as admin."
    });
  }

  try {
    const [customers] = await pool.query(`
      SELECT
        customer_name,
        email,
        phone,
        COUNT(*) AS total_orders,
        COALESCE(SUM(total), 0) AS total_spent,
        MAX(created_at) AS last_order
      FROM orders
      GROUP BY customer_name, email, phone
      ORDER BY last_order DESC
    `);

    res.json({
      success: true,
      count: customers.length,
      customers
    });
  } catch (error) {
    console.error("Admin customers error:", error.message);

    res.status(500).json({
      success: false,
      message: "Could not load customers."
    });
  }
});


/* ========== APPOINTMENT MANAGEMENT ========== */

// 1. Customer books an appointment
app.post("/api/appointments", async (req, res) => {
  try {
    const {
      customerName,
      phone,
      appointmentDate,
      appointmentTime
    } = req.body;

    if (
      typeof customerName !== "string" ||
      !customerName.trim() ||
      customerName.trim().length > 100 ||
      typeof phone !== "string" ||
      !/^\d{10}$/.test(phone.trim()) ||
      typeof appointmentDate !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(appointmentDate) ||
      typeof appointmentTime !== "string" ||
      !appointmentTime.trim() ||
      appointmentTime.trim().length > 30
    ) {
      return res.status(400).json({
        success: false,
        message: "Please enter valid appointment details."
      });
    }

   
const dateParts = appointmentDate.split("-").map(Number);
const [year, month, day] = dateParts;

const selectedDate = new Date(Date.UTC(year, month - 1, day));

const validDate =
  dateParts.length === 3 &&
  selectedDate.getUTCFullYear() === year &&
  selectedDate.getUTCMonth() === month - 1 &&
  selectedDate.getUTCDate() === day;

const now = new Date();
const today =
  now.getFullYear() + "-" +
  String(now.getMonth() + 1).padStart(2, "0") + "-" +
  String(now.getDate()).padStart(2, "0");

if (!validDate || appointmentDate < today) {
  return res.status(400).json({
    success: false,
    message: "Please select a valid date from today onward."
  });
}


    if (
      Number.isNaN(selectedDate.getTime()) ||
      selectedDate.toISOString().slice(0, 10) !== appointmentDate ||
      selectedDate < today
    ) {
      return res.status(400).json({
        success: false,
        message: "Please select a valid date from today onward."
      });
    }

    const appointmentCode =
      "APT-" +
      Date.now().toString(36).toUpperCase() +
      "-" +
      Math.random().toString(36).slice(2, 7).toUpperCase();

    const [result] = await pool.query(
      `INSERT INTO appointments
        (appointment_code, customer_name, phone,
         appointment_date, appointment_time, status)
       VALUES (?, ?, ?, ?, ?, 'requested')`,
      [
        appointmentCode,
        customerName.trim(),
        phone.trim(),
        appointmentDate,
        appointmentTime.trim()
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Appointment requested successfully.",
      appointment: {
        id: result.insertId,
        appointmentCode,
        customerName: customerName.trim(),
        phone: phone.trim(),
        appointmentDate,
        appointmentTime,
        status: "requested"
      }
    });
  } catch (error) {
    console.error("Create appointment error:", error);

    return res.status(500).json({
      success: false,
      message: "Could not book your appointment."
    });
  }
});


// 2. Admin views all appointments
app.get("/api/admin/appointments", async (req, res) => {
  if (!req.session.admin) {
    return res.status(401).json({
      success: false,
      message: "Please log in as admin."
    });
  }

  try {
    const [appointments] = await pool.query(`
      SELECT
        id,
        appointment_code,
        customer_name,
        phone,
        appointment_date,
        appointment_time,
        status,
        created_at
      FROM appointments
      ORDER BY appointment_date DESC, id DESC
    `);

    return res.json({
      success: true,
      count: appointments.length,
      appointments
    });
  } catch (error) {
    console.error("Admin appointments error:", error);

    return res.status(500).json({
      success: false,
      message: "Could not load appointments."
    });
  }
});


// 3. Admin updates appointment status
app.patch("/api/admin/appointments/:id/status", async (req, res) => {
  if (!req.session.admin) {
    return res.status(401).json({
      success: false,
      message: "Please log in as admin."
    });
  }

  const id = Number(req.params.id);
  const { status } = req.body;

  const allowedStatuses = [
    "requested",
    "confirmed",
    "completed",
    "cancelled"
  ];

  if (
    !Number.isSafeInteger(id) ||
    id < 1 ||
    !allowedStatuses.includes(status)
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid appointment ID or status."
    });
  }

  try {
    const [result] = await pool.query(
      "UPDATE appointments SET status = ? WHERE id = ?",
      [status, id]
    );

    if (result.affectedRows === 0) {
      const [rows] = await pool.query(
        "SELECT id FROM appointments WHERE id = ?",
        [id]
      );

      if (rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Appointment not found."
        });
      }
    }

    return res.json({
      success: true,
      message: "Appointment status updated successfully."
    });
  } catch (error) {
    console.error("Update appointment status error:", error);

    return res.status(500).json({
      success: false,
      message: "Could not update appointment status."
    });
  }
});

/* ---------- Admin: product image upload (file from computer, no URL) ---------- */
const imgFs = require("fs");
const imgUploadDir = path.join(__dirname, "..", "public", "uploads");
imgFs.mkdirSync(imgUploadDir, { recursive: true });

function imgDetectExt(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.slice(0, 4).toString("ascii") === "RIFF" && buf.slice(8, 12).toString("ascii") === "WEBP") return "webp";
  return null;
}

app.post(
  "/api/admin/products/:code/image",
  express.raw({ type: "image/*", limit: "5mb" }),
  async (req, res) => {
    if (!req.session.admin) {
      return res.status(401).json({ success: false, message: "Not logged in." });
    }
    try {
      const code = String(req.params.code);
      const body = req.body;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        return res.status(400).json({ success: false, message: "Please choose a JPG, PNG or WEBP image (max 5 MB)." });
      }
      const ext = imgDetectExt(body);
      if (!ext) {
        return res.status(400).json({ success: false, message: "Only JPG, PNG or WEBP images are allowed." });
      }
      const [rows] = await pool.query(
        "SELECT id, image_url FROM products WHERE product_code = ?", [code]
      );
      if (!rows[0]) {
        return res.status(404).json({ success: false, message: "Product not found." });
      }
      const fileName = `${code.replace(/[^a-zA-Z0-9_-]/g, "_")}-${Date.now()}.${ext}`;
      await imgFs.promises.writeFile(path.join(imgUploadDir, fileName), body);
      const imageUrl = `/uploads/${fileName}`;
      await pool.query("UPDATE products SET image_url = ? WHERE id = ?", [imageUrl, rows[0].id]);

      // delete the old uploaded file, if there was one
      const old = rows[0].image_url;
      if (typeof old === "string" && old.startsWith("/uploads/")) {
        imgFs.unlink(path.join(imgUploadDir, path.basename(old)), () => {});
      }
      res.json({ success: true, imageUrl });
    } catch (error) {
      console.error("Image upload error:", error.message);
      res.status(500).json({ success: false, message: "Could not upload the image." });
    }
  }
);

/* ========== RAZORPAY ONLINE PAYMENT ========== */
const rzCrypto = require("crypto");

// Step 1: create a Razorpay order for an already-saved (unpaid) website order
app.post("/api/payments/create", async (req, res) => {
  try {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      return res.status(500).json({ success: false, message: "Online payment is not configured." });
    }

    const orderCode = String(req.body.orderCode || "").trim();
    const [rows] = await pool.query(
      "SELECT id, order_code, total, payment_method, payment_status FROM orders WHERE order_code = ?",
      [orderCode]
    );
    const order = rows[0];

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found." });
    }
    if (order.payment_method === "cod") {
      return res.status(400).json({ success: false, message: "This is a cash on delivery order." });
    }
    if (order.payment_status !== "pending") {
      return res.status(400).json({ success: false, message: "This order is already paid or closed." });
    }

    const amountInPaise = Math.round(Number(order.total) * 100);

    const rzResponse = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Basic " + Buffer.from(keyId + ":" + keySecret).toString("base64")
      },
      body: JSON.stringify({
        amount: amountInPaise,
        currency: "INR",
        receipt: order.order_code
      })
    });

    const rzOrder = await rzResponse.json();

    if (!rzResponse.ok || !rzOrder.id) {
      console.error("Razorpay create order error:", JSON.stringify(rzOrder));
      return res.status(502).json({ success: false, message: "Could not start the payment. Please try again." });
    }

    await pool.query("UPDATE orders SET razorpay_order_id = ? WHERE id = ?", [rzOrder.id, order.id]);

    res.json({
      success: true,
      keyId,
      razorpayOrderId: rzOrder.id,
      amount: rzOrder.amount,
      currency: rzOrder.currency
    });
  } catch (error) {
    console.error("Payment create error:", error.message);
    res.status(500).json({ success: false, message: "Could not start the payment." });
  }
});

// Step 2: verify the payment signature and mark the order as paid
app.post("/api/payments/verify", async (req, res) => {
  try {
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) {
      return res.status(500).json({ success: false, message: "Online payment is not configured." });
    }

    const orderCode = String(req.body.orderCode || "").trim();
    const razorpayOrderId = String(req.body.razorpay_order_id || "");
    const razorpayPaymentId = String(req.body.razorpay_payment_id || "");
    const razorpaySignature = String(req.body.razorpay_signature || "");

    const [rows] = await pool.query(
      "SELECT id, payment_status, razorpay_order_id FROM orders WHERE order_code = ?",
      [orderCode]
    );
    const order = rows[0];

    if (!order || !order.razorpay_order_id || order.razorpay_order_id !== razorpayOrderId) {
      return res.status(400).json({ success: false, message: "Payment details do not match this order." });
    }

    const expected = rzCrypto
      .createHmac("sha256", keySecret)
      .update(order.razorpay_order_id + "|" + razorpayPaymentId)
      .digest("hex");

    const a = Buffer.from(expected);
    const b = Buffer.from(razorpaySignature);

    if (a.length !== b.length || !rzCrypto.timingSafeEqual(a, b)) {
      return res.status(400).json({ success: false, message: "Payment verification failed." });
    }

    await pool.query(
      `UPDATE orders
       SET payment_status = 'paid', razorpay_payment_id = ?
       WHERE id = ? AND payment_status = 'pending'`,
      [razorpayPaymentId, order.id]
    );

    res.json({ success: true, message: "Payment verified successfully." });
  } catch (error) {
    console.error("Payment verify error:", error.message);
    res.status(500).json({ success: false, message: "Could not verify the payment." });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});