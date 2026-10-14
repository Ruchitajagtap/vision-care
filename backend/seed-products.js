require("dotenv").config();

const pool = require("./config/db");

const rows = [
  ["Vision Classic Black", "eyeglasses", "Rectangle", "Acetate", "Men", 1499, 2199],
  ["Vision Urban Blue", "eyeglasses", "Square", "TR90 Flex", "Unisex", 1699, 2399],
  ["Vision Pro Rectangle", "eyeglasses", "Rectangle", "Metal", "Men", 1899, 2599],
  ["Vision Flex Metal", "eyeglasses", "Round", "Metal", "Women", 1799, 2499],
  ["Vision Executive", "eyeglasses", "Rectangle", "Titanium", "Men", 2999, 3999],
  ["Vision Kids Smart", "kids", "Round", "TR90 Flex", "Kids", 999, 1499],
  ["Vision Round Classic", "eyeglasses", "Round", "Acetate", "Unisex", 1599, 2199],
  ["Vision Square Pro", "eyeglasses", "Square", "Acetate", "Men", 1699, 2299],
  ["Vision Aviator", "sunglasses", "Aviator", "Metal", "Men", 1999, 2799],
  ["Vision Premium Black", "eyeglasses", "Rectangle", "Acetate", "Women", 2199, 2999],
  ["Vision Coastal Wayfarer", "sunglasses", "Wayfarer", "Acetate", "Unisex", 1799, 2499],
  ["Vision Glare Guard", "sunglasses", "Round", "Polycarbonate", "Women", 1499, 1999],
  ["Vision Screen Shield", "computer-glasses", "Rectangle", "TR90 Flex", "Unisex", 1299, 1799],
  ["Vision Night Coder", "computer-glasses", "Square", "Acetate", "Men", 1399, 1899],
  ["Vision Glow Guard Kids", "blue-light", "Round", "TR90 Flex", "Kids", 899, 1299],
  ["Vision Focus Blue", "blue-light", "Square", "Acetate", "Unisex", 1349, 1899],
  ["Vision Study Light", "reading-glasses", "Round", "Acetate", "Unisex", 799, 1199],
  ["Vision Page Turner", "reading-glasses", "Oval", "Metal", "Women", 849, 1249],
  ["Vision Cat Muse", "eyeglasses", "Cat Eye", "Acetate", "Women", 1899, 2599],
  ["Vision Petite Round", "kids", "Round", "TR90 Flex", "Kids", 949, 1399],
  ["Vision Daily Clear Lens", "contact-lenses", "-", "-", "Unisex", 699, 999],
  ["Vision Monthly Hydra Lens", "contact-lenses", "-", "-", "Unisex", 1299, 1799],
  ["Vision Colour Pop Lens", "contact-lenses", "-", "-", "Unisex", 1099, 1499],
  ["Vision Titanium Flex", "eyeglasses", "Rectangle", "Titanium", "Men", 3299, 4299],
];

async function seedProducts() {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    for (let i = 0; i < rows.length; i++) {
      const [name, category, shape, material, gender, price, original] = rows[i];

      const productCode = `VC${String(i + 1).padStart(3, "0")}`;
      const brand = [
        "Vision Care Originals",
        "ClearVue",
        "UrbanFrame",
        "OptiWear",
        "Meridian",
      ][i % 5];

      const frameColor = [
        "Black",
        "Tortoise",
        "Navy",
        "Gunmetal",
        "Crystal",
      ][i % 5];

      const rating = Number((3.8 + ((i * 7) % 12) / 10).toFixed(1));
      const reviewCount = 12 + ((i * 13) % 180);
      const stockValues = [0, 6, 14];
      const stock = stockValues[i % 3] === 0 ? 3 : stockValues[i % 3];
      const size = ["Narrow", "Medium", "Wide"][i % 3];

      const description =
        category === "contact-lenses"
          ? "Comfortable, breathable lenses designed for all-day wear with a smooth, hydrating finish."
          : `A ${shape.toLowerCase()} frame in ${material.toLowerCase()}, built for everyday comfort and a clean, confident look. Includes a hard case and microfiber cloth.`;

      await connection.query(
        `INSERT INTO vision_care_db.products
          (product_code, name, category, brand, price, original_price,
           stock, description, image_url, active, frame_shape,
           frame_material, frame_color, gender, rating, review_count, size)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           category = VALUES(category),
           brand = VALUES(brand),
           price = VALUES(price),
           original_price = VALUES(original_price),
           stock = VALUES(stock),
           description = VALUES(description),
           active = 1,
           frame_shape = VALUES(frame_shape),
           frame_material = VALUES(frame_material),
           frame_color = VALUES(frame_color),
           gender = VALUES(gender),
           rating = VALUES(rating),
           review_count = VALUES(review_count),
           size = VALUES(size)`,
        [
          productCode, name, category, brand, price, original,
          stock, description, shape, material, frameColor, gender,
          rating, reviewCount, size,
        ]
      );
    }

    await connection.commit();
    console.log(`Success! Imported ${rows.length} products into MySQL.`);
  } catch (error) {
    await connection.rollback();
    console.error("Product import failed:", error.message);
    process.exitCode = 1;
  } finally {
    connection.release();
    await pool.end();
  }
}

seedProducts().catch((error) => {
  console.error("Could not import products:", error.message);
  process.exitCode = 1;
  pool.end();
});