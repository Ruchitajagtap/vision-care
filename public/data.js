/* ============================================================
   VISION CARE — data.js
   Product catalog, constants, and helper data used by app.js.
   Plain JavaScript, no build step, no framework.
   ============================================================ */

const CATEGORIES = [
  { id: "eyeglasses", label: "Eyeglasses", rx: true },
  { id: "sunglasses", label: "Sunglasses", rx: false },
  { id: "blue-light", label: "Blue Light", rx: true },
  { id: "computer-glasses", label: "Computer Glasses", rx: true },
  { id: "kids", label: "Kids Eyewear", rx: true },
  { id: "reading-glasses", label: "Reading Glasses", rx: true },
  { id: "contact-lenses", label: "Contact Lenses", rx: false },
];

const BRANDS = ["Vision Care Originals", "ClearVue", "UrbanFrame", "OptiWear", "Meridian"];
const SHAPES = ["Rectangle", "Round", "Square", "Aviator", "Cat Eye", "Oval", "Wayfarer"];
const MATERIALS = ["Acetate", "Metal", "TR90 Flex", "Titanium", "Polycarbonate"];
const GENDERS = ["Men", "Women", "Unisex", "Kids"];

const LENS_OPTIONS = [
  { id: "basic", label: "Basic Single Vision", price: 0 },
  { id: "bluelight", label: "Blue Light Protection", price: 400 },
  { id: "antiglare", label: "Anti-Glare", price: 350 },
  { id: "thin", label: "Premium Thin Lens", price: 900 },
  { id: "photochromic", label: "Photochromic", price: 1400 },
  { id: "progressive", label: "Progressive", price: 2200 },
];

const TRACK_FLOW = ["Order Placed", "Prescription Verified", "Lens Processing", "Quality Check", "Packed", "Out for Delivery", "Delivered"];

const FRAME_COLOR_HEX = { Black: "#20242A", Tortoise: "#6B4A2E", Navy: "#1B3A5C", Gunmetal: "#4B5560", Crystal: "#C9D3DA" };
const LENS_TINT = { eyeglasses: "#DCE7EE", "blue-light": "#D6E8F5", "computer-glasses": "#DCEAE3", "reading-glasses": "#E8EEF2", kids: "#E6F2E9", sunglasses: "#33404A", "contact-lenses": "#EAF4FA" };

/* ---------------- glasses artwork (inline SVG, no external images needed) ---------------- */
function glassesSVG(shape, colorHex, tint, kids) {
  const c = colorHex, lens = tint;
  const scale = kids ? 0.86 : 1;
  const cx1 = 68, cx2 = 132, cy = 55;
  let lensShape;
  if (shape === "Round" || shape === "Oval") {
    const rx = shape === "Oval" ? 30 : 26, ry = shape === "Oval" ? 24 : 26;
    lensShape = `<ellipse cx="${cx1}" cy="${cy}" rx="${rx * scale}" ry="${ry * scale}" fill="${lens}" stroke="${c}" stroke-width="6"/><ellipse cx="${cx2}" cy="${cy}" rx="${rx * scale}" ry="${ry * scale}" fill="${lens}" stroke="${c}" stroke-width="6"/>`;
  } else if (shape === "Aviator") {
    lensShape = `<path d="M46 44 Q68 24 90 44 Q94 78 68 82 Q42 78 46 44 Z" fill="${lens}" stroke="${c}" stroke-width="5"/><path d="M110 44 Q132 24 154 44 Q158 78 132 82 Q106 78 110 44 Z" fill="${lens}" stroke="${c}" stroke-width="5"/>`;
  } else if (shape === "Cat Eye") {
    lensShape = `<path d="M42 58 Q42 30 70 30 Q96 32 94 58 Q92 76 66 76 Q44 74 42 58 Z" fill="${lens}" stroke="${c}" stroke-width="6"/><path d="M106 58 Q106 30 134 30 Q160 32 158 58 Q156 76 130 76 Q108 74 106 58 Z" fill="${lens}" stroke="${c}" stroke-width="6"/>`;
  } else if (shape === "Wayfarer") {
    lensShape = `<rect x="40" y="32" width="56" height="42" rx="10" fill="${lens}" stroke="${c}" stroke-width="7"/><rect x="104" y="32" width="56" height="42" rx="10" fill="${lens}" stroke="${c}" stroke-width="7"/>`;
  } else if (shape === "Square") {
    lensShape = `<rect x="42" y="30" width="52" height="50" rx="6" fill="${lens}" stroke="${c}" stroke-width="6"/><rect x="106" y="30" width="52" height="50" rx="6" fill="${lens}" stroke="${c}" stroke-width="6"/>`;
  } else {
    lensShape = `<rect x="40" y="32" width="56" height="44" rx="14" fill="${lens}" stroke="${c}" stroke-width="6"/><rect x="104" y="32" width="56" height="44" rx="14" fill="${lens}" stroke="${c}" stroke-width="6"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 110">
    <line x1="4" y1="46" x2="30" y2="40" stroke="${c}" stroke-width="6" stroke-linecap="round"/>
    <line x1="170" y1="40" x2="196" y2="46" stroke="${c}" stroke-width="6" stroke-linecap="round"/>
    <path d="M96 50 Q100 44 104 50" fill="none" stroke="${c}" stroke-width="6" stroke-linecap="round"/>
    ${lensShape}
  </svg>`;
}
function contactLensSVG() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 110">
    <circle cx="100" cy="55" r="42" fill="#EAF4FA" stroke="#4FA3D1" stroke-width="5"/>
    <circle cx="100" cy="55" r="24" fill="#CDE7F4" stroke="#0E8C7F" stroke-width="3"/>
    <circle cx="88" cy="44" r="6" fill="#ffffff" opacity="0.8"/>
  </svg>`;
}
function svgToDataUri(svg) {
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}
function buildProductImages(shape, colorName, category) {
  if (category === "contact-lenses") {
    const uri = svgToDataUri(contactLensSVG());
    return [uri, uri, uri];
  }
  const uri = svgToDataUri(glassesSVG(shape, FRAME_COLOR_HEX[colorName] || "#20242A", LENS_TINT[category] || "#DCE7EE", category === "kids"));
  return [uri, uri, uri];
}
function avatarSilhouetteUri() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
    <rect width="200" height="200" fill="#EAF4FA"/>
    <circle cx="100" cy="82" r="40" fill="#C9D3DA"/>
    <path d="M40 190 Q100 130 160 190 Z" fill="#C9D3DA"/>
  </svg>`;
  return svgToDataUri(svg);
}

/* ---------------- product catalog ---------------- */
function buildProducts() {
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
  return rows.map((row, i) => {
    const [name, category, shape, material, gender, price, original] = row;
    const brand = BRANDS[i % BRANDS.length];
    const discount = Math.round(((original - price) / original) * 100);
    const rx = CATEGORIES.find((c) => c.id === category).rx;
    const frameColor = ["Black", "Tortoise", "Navy", "Gunmetal", "Crystal"][i % 5];
    return {
      id: `VC${String(i + 1).padStart(3, "0")}`,
      name, category, brand,
      frameShape: shape,
      frameMaterial: material,
      frameColor,
      gender, price,
      originalPrice: original,
      discount,
      rating: (3.8 + ((i * 7) % 12) / 10).toFixed(1),
      reviewCount: 12 + ((i * 13) % 180),
      images: buildProductImages(shape, frameColor, category),
      prescriptionRequired: rx,
      stock: [0, 6, 14][i % 3] === 0 ? 3 : [0, 6, 14][i % 3],
      sku: `SKU-${1000 + i}`,
      description: category === "contact-lenses"
        ? "Comfortable, breathable lenses designed for all-day wear with a smooth, hydrating finish."
        : `A ${shape.toLowerCase()} frame in ${material.toLowerCase()}, built for everyday comfort and a clean, confident look. Includes a hard case and microfiber cloth.`,
      size: ["Narrow", "Medium", "Wide"][i % 3],
    };
  });
}

function buildCoupons() {
  return [
    { code: "WELCOME10", percent: 10, minOrder: 999, expiry: "2026-12-31", usageLimit: 500, used: 34 },
    { code: "FRAME20", percent: 20, minOrder: 1499, expiry: "2026-10-31", usageLimit: 200, used: 61 },
  ];
}

/* ---------------- small formatting helpers ---------------- */
function currency(n) {
  return "\u20B9" + Math.round(n).toLocaleString("en-IN");
}
function genOrderId() {
  return "VC" + Date.now().toString().slice(-8) + Math.floor(Math.random() * 90 + 10);
}
function starsHtml(rating) {
  const r = Math.round(parseFloat(rating));
  let out = "";
  for (let i = 1; i <= 5; i++) out += i <= r ? "\u2605" : '<span class="empty">\u2605</span>';
  return `<span class="stars">${out}</span>`;
}