/* ============================================================
   VISION CARE — app.js
   ============================================================ */

/* ---------------- storage helpers ---------------- */
function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.error("Storage read failed for", key, e);
    return fallback;
  }
}
function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error("Storage write failed for", key, e);
    toast("Could not save your data locally. Your browser storage may be full or disabled.");
  }
}

function randomSaltHex() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function hashPassword(password) {
  const salt = randomSaltHex();
  const hash = await sha256Hex(salt + ":" + password);
  return { salt, hash };
}
async function verifyPassword(password, salt, hash) {
  return (await sha256Hex(salt + ":" + password)) === hash;
}

/* ---------------- small utilities ---------------- */
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
let toastTimer = null;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 2600);
}
function waLink(message) {
  return "https://wa.me/919876543210?text=" + encodeURIComponent(message);
}

/* ============================================================
   GLOBAL STATE
   ============================================================ */
const state = {
  products: loadJSON("vc_products", null) || buildProducts(),
  orders: loadJSON("vc_orders", []),
  appointments: loadJSON("vc_appointments", []),
  coupons: loadJSON("vc_coupons", null) || buildCoupons(),
  customers: loadJSON("vc_customers", []),
  cart: loadJSON("vc_cart", []),
  wishlist: loadJSON("vc_wishlist", []),
  user: loadJSON("vc_user", null),
};
if (!loadJSON("vc_products", null)) saveJSON("vc_products", state.products);
if (!loadJSON("vc_coupons", null)) saveJSON("vc_coupons", state.coupons);

function persist(key) {
  const map = { products: "vc_products", orders: "vc_orders", appointments: "vc_appointments", coupons: "vc_coupons", customers: "vc_customers", cart: "vc_cart", wishlist: "vc_wishlist", user: "vc_user" };
  saveJSON(map[key], state[key]);
}

/* transient per-page UI state (reset when you navigate to that page) */
let pdState = null;      // product detail
let checkoutState = null;
let catalogState = { category: null, query: "", brand: [], shape: [], material: [], gender: [], priceMax: 4500, sort: "", discountOnly: false, mobileFiltersOpen: false };
let trackState = { orderId: "", phone: "", result: null, error: "" };
let authState = { mode: "login", form: { name: "", email: "", phone: "", password: "" }, error: "" };
let appointmentState = { form: { name: "", phone: "", date: "", time: "", reason: "" }, errors: {}, done: false };
let couponState = { applied: null, message: "" };

/* ============================================================
   ROUTER
   ============================================================ */
let currentRoute = { page: "home", params: {} };

function parseHash() {
  const hash = location.hash.replace(/^#\/?/, ""); // strip "#/"
  const parts = hash.split("/").filter(Boolean);
  if (parts.length === 0) return { page: "home", params: {} };
  const page = parts[0];
  if (page === "catalog") return { page: "catalog", params: { category: parts[1] || null } };
  if (page === "product") return { page: "product", params: { id: parts[1] } };
  if (page === "track") return { page: "track", params: { id: parts[1] ? decodeURIComponent(parts[1]) : "" } };
  if (page === "account") return { page: "account", params: { tab: parts[1] || "profile" } };
  if (page === "confirmation") return { page: "confirmation", params: { id: parts[1] ? decodeURIComponent(parts[1]) : null } };
  return { page, params: {} };
}

function go(hash) {
  // if we're already on this exact route, changing location.hash won't fire
  // a hashchange event — so re-render directly instead of silently doing nothing
  if (location.hash === hash) {
    currentRoute = parseHash();
    renderRoute();
  } else {
    location.hash = hash;
  }
}

window.addEventListener("hashchange", () => {
  currentRoute = parseHash();
  renderRoute();
  window.scrollTo({ top: 0, behavior: "smooth" });
  closeMobileMenu();
});

function rerender() { renderRoute(); }

function renderRoute() {
  const app = document.getElementById("app");
  const { page, params } = currentRoute;
  if (page === "home") app.innerHTML = renderHome();
  else if (page === "catalog") { if (params.category !== undefined && params.category !== catalogState._lastRouteCat) { catalogState.category = params.category; catalogState._lastRouteCat = params.category; } app.innerHTML = renderCatalog(); }
  else if (page === "product") { app.innerHTML = renderProduct(params.id); }
  else if (page === "cart") app.innerHTML = renderCart();
  else if (page === "checkout") app.innerHTML = renderCheckout();
  else if (page === "confirmation") app.innerHTML = renderConfirmation(params.id);
  else if (page === "track") { if (params.id && !trackState.orderId) trackState.orderId = params.id; app.innerHTML = renderTrack(); }
  else if (page === "appointment") app.innerHTML = renderAppointment();
  else if (page === "account") app.innerHTML = renderAccount(params.tab);
  else if (page === "about") app.innerHTML = renderAbout();
  else if (page === "contact") app.innerHTML = renderContact();
  else if (page === "policy") app.innerHTML = renderPolicy();
  else app.innerHTML = renderHome();
  updateHeaderCounts();
  highlightActiveNav();
}

function highlightActiveNav() {
  document.querySelectorAll(".main-nav a").forEach((a) => {
    a.style.color = a.getAttribute("href") === "#/" + (currentRoute.page === "home" ? "" : currentRoute.page) ? "var(--teal)" : "";
  });
}

/* ============================================================
   HEADER / CART / WISHLIST HELPERS
   ============================================================ */
function updateHeaderCounts() {
  const activeCartItems = state.cart.filter((c) => !c.saved);
  const cartCount = activeCartItems.reduce((s, i) => s + i.qty, 0);
  const cartBadge = document.getElementById("cartCount");
  cartBadge.textContent = cartCount;
  cartBadge.classList.toggle("hidden", cartCount === 0);

  const wishBadge = document.getElementById("wishlistCount");
  wishBadge.textContent = state.wishlist.length;
  wishBadge.classList.toggle("hidden", state.wishlist.length === 0);
}

function addToCart(productId, opts) {
  const product = state.products.find((p) => p.id === productId);
  if (!product || product.stock === 0) { toast("Sorry, that product is out of stock."); return; }
  const lens = opts.lens || LENS_OPTIONS[0];
  state.cart.push({
    productId,
    qty: opts.qty || 1,
    lens: product.prescriptionRequired ? lens : null,
    saved: false,
    prescription: opts.prescription || null,
  });
  persist("cart");
  updateHeaderCounts();
  toast(product.name + " added to cart");
}
function toggleWish(productId) {
  const idx = state.wishlist.indexOf(productId);
  if (idx === -1) { state.wishlist.push(productId); toast("Added to wishlist"); }
  else { state.wishlist.splice(idx, 1); toast("Removed from wishlist"); }
  persist("wishlist");
  updateHeaderCounts();
}
function cartItemUnitPrice(item) {
  const product = state.products.find((p) => p.id === item.productId);
  const lensPrice = item.lens ? item.lens.price : 0;
  return (product ? product.price : 0) + lensPrice;
}

/* ============================================================
   PRODUCT CARD (shared markup used on home / catalog / related)
   ============================================================ */
function productCardHtml(p) {
  const isWished = state.wishlist.includes(p.id);
  const stockHtml = p.stock === 0
    ? '<div class="product-stock out">Out of stock</div>'
    : p.stock <= 4 ? `<div class="product-stock low">Only ${p.stock} left</div>` : "";
  return `
  <div class="product-card">
    <div class="product-card-media">
      ${p.discount > 0 ? `<span class="badge badge-orange product-discount-badge">${p.discount}% OFF</span>` : ""}
      <button class="product-wish-btn ${isWished ? "active" : ""}" data-action="toggle-wish" data-id="${p.id}" aria-label="Toggle wishlist">${isWished ? "&#9829;" : "&#9825;"}</button>
      <img src="${p.images[0]}" alt="${escapeHtml(p.name)}" loading="lazy" data-action="open-product" data-id="${p.id}" />
      <button class="product-quickview-btn" data-action="open-product" data-id="${p.id}">&#128065; Quick view</button>
    </div>
    <div class="product-card-body">
      <div class="product-brand">${escapeHtml(p.brand)}</div>
      <div class="product-name" data-action="open-product" data-id="${p.id}">${escapeHtml(p.name)}</div>
      <div class="product-meta">${p.frameShape !== "-" ? `${p.frameShape} &middot; ${p.frameMaterial}` : "Contact lens"}</div>
      <div class="product-rating">${starsHtml(p.rating)} <span>${p.rating} (${p.reviewCount})</span></div>
      <div class="product-price-row">
        <span class="product-price">${currency(p.price)}</span>
        ${p.discount > 0 ? `<span class="product-price-original">${currency(p.originalPrice)}</span>` : ""}
      </div>
      ${stockHtml}
      <div style="margin-top:auto;padding-top:8px;">
        <button class="btn btn-sm btn-full" data-action="add-cart" data-id="${p.id}" ${p.stock === 0 ? "disabled" : ""}>&#128722; Add to cart</button>
      </div>
    </div>
  </div>`;
}

/* ============================================================
   HOME PAGE
   ============================================================ */
function renderHome() {
  const featured = state.products.slice(0, 8);
  const reviews = [
    { name: "Aarav Mehta", rating: 5, text: "Great fit and the anti-glare lens actually makes a difference on my laptop all day. Delivery was quick too." },
    { name: "Priya Nair", rating: 5, text: "Uploaded my prescription and the team called to confirm the numbers before making the glasses. Felt very trustworthy." },
    { name: "Rohan Kapoor", rating: 4, text: "Good quality frame for the price. Would've liked more colour options but overall happy with the purchase." },
  ];
  const catIcons = { eyeglasses: "Rectangle", sunglasses: "Aviator", "blue-light": "Round", "computer-glasses": "Square", kids: "Round", "reading-glasses": "Oval", "contact-lenses": "-" };

  return `
  <section class="hero">
    <div class="hero-inner">
      <div>
        <span class="badge badge-teal">See Better. Live Better.</span>
        <h1>Your perfect vision starts here</h1>
        <p>Premium eyewear, prescription glasses and expert eye care — all from your trusted local optical store.</p>
        <div class="hero-buttons">
          <button class="btn btn-lg" data-action="go-catalog" data-cat="eyeglasses">Shop eyeglasses &rarr;</button>
          <button class="btn btn-outline-light btn-lg" data-action="go" data-route="#/appointment">Book eye check-up</button>
        </div>
      </div>
       ${heroSliderHtml()}
      </div>
    </div>
  </section>

  <section class="container">
    <h2 class="section-title">Shop by category</h2>
    <div class="category-grid">
      ${CATEGORIES.map((c) => `
        <div class="category-card" data-action="go-catalog" data-cat="${c.id}">
          <div class="lens-frame"><img
  
src="${({
  eyeglasses: 'image/eyeglass.png',
  sunglasses: 'image/sunglass.png',
  'computer-glasses': 'image/computerglass.png',
  'contact-lenses': 'image/contactlens.png',
  'blue-light': 'image/bluelight.png',
  kids: 'image/kidswear.png',
  'reading-glasses': 'image/eyeglass.png'
})[c.id] || 'image/sunglass.png'}"

  alt="${c.label}"
  loading="lazy"
/>

        </div>

        <div class="category-card-label">${c.label}</div>
      </div>
    `).join("")}
  </div>
</section>


  <section class="container">
    <div class="catalog-header">
      <h2 class="section-title" style="margin-bottom:0;">Featured products</h2>
      <button class="btn btn-ghost" data-action="go-catalog">View all &rarr;</button>
    </div>
    <div class="product-grid">${featured.map(productCardHtml).join("")}</div>
  </section>

  <section class="info-section">
    <div class="container">
      <h2 class="section-title">Why choose Vision Care?</h2>
      <div class="info-grid">
        ${[
          ["&#128737;", "Genuine products", "Every frame is sourced and checked for quality"],
          ["&#128065;", "Prescription support", "Our opticians verify every prescription order"],
          ["&#128101;", "Local expert assistance", "Real people at our store, a call or message away"],
          ["&#128666;", "Fast delivery", "Most orders reach you within 3–5 days"],
          ["&#128230;", "Easy returns", "7-day hassle-free returns on unused frames"],
          ["&#128274;", "Secure payments", "UPI, cards and cash on delivery, all protected"],
        ].map(([icon, t, d]) => `
          <div class="info-card">
            <div class="info-icon">${icon}</div>
            <div class="info-card-title">${t}</div>
            <div class="info-card-desc">${d}</div>
          </div>`).join("")}
      </div>
    </div>
  </section>

  <section class="container">
    <div class="promo-banner">
      <h2 class="section-title">Not sure what glasses you need?</h2>
      <p style="color:var(--ink-soft);margin-bottom:20px;">Our opticians can help you pick the right lens and frame for your lifestyle.</p>
      <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
        <button class="btn" data-action="go" data-route="#/appointment">Book eye test</button>
        <a class="btn btn-outline" href="${waLink("Hi, I'd like to talk to an eyewear expert.")}" target="_blank" rel="noopener">Talk to an expert</a>
        <button class="btn btn-outline" data-action="go-catalog" data-cat="eyeglasses">Upload prescription</button>
      </div>
    </div>
  </section>

  <section class="container">
    <div class="offer-banner">
      <div>
        <div class="offer-banner-title">Flat 20% off on selected frames</div>
        <div style="font-size:13.5px;opacity:0.92;margin-top:4px;">Use code FRAME20 at checkout on orders above ₹1,499</div>
      </div>
      <button class="btn btn-navy" data-action="go-catalog" data-cat="offers">View offers</button>
    </div>
  </section>

  <section class="container">
    <h2 class="section-title">Customers speak</h2>
    <div class="review-grid">
      ${reviews.map((r) => `
        <div class="review-card">
          ${starsHtml(r.rating)}
          <p class="review-text">${escapeHtml(r.text)}</p>
          <div class="review-name">${escapeHtml(r.name)}</div>
        </div>`).join("")}
    </div>
  </section>`;
}

/* ============================================================
   CATALOG PAGE
   ============================================================ */
function filteredProducts() {
  const f = catalogState;
  let list = state.products.slice();
  if (f.category === "offers") list = list.filter((p) => p.discount >= 15);
  else if (f.category) list = list.filter((p) => p.category === f.category);
  if (f.query) {
    const q = f.query.toLowerCase();
    list = list.filter((p) => p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q) || p.category.includes(q));
  }
  if (f.brand.length) list = list.filter((p) => f.brand.includes(p.brand));
  if (f.shape.length) list = list.filter((p) => f.shape.includes(p.frameShape));
  if (f.material.length) list = list.filter((p) => f.material.includes(p.frameMaterial));
  if (f.gender.length) list = list.filter((p) => f.gender.includes(p.gender));
  if (f.discountOnly) list = list.filter((p) => p.discount >= 10);
  list = list.filter((p) => p.price <= f.priceMax);
  if (f.sort === "price-asc") list.sort((a, b) => a.price - b.price);
  else if (f.sort === "price-desc") list.sort((a, b) => b.price - a.price);
  else if (f.sort === "popularity") list.sort((a, b) => b.reviewCount - a.reviewCount);
  return list;
}
function checklistHtml(title, options, key) {
  return `
  <div class="filter-block">
    <div class="filter-block-title">${title}</div>
    ${options.map((o) => `
      <label class="filter-option">
        <input type="checkbox" data-action="toggle-filter" data-key="${key}" data-value="${escapeHtml(o)}" ${catalogState[key].includes(o) ? "checked" : ""}/>
        ${escapeHtml(o)}
      </label>`).join("")}
  </div>`;
}
function renderCatalog() {
  const list = filteredProducts();
  const titleText = catalogState.category === "offers" ? "Offers" : catalogState.category ? catalogState.category.replace("-", " ") : "All eyewear";
  return `
  <div class="container">
    <div class="catalog-header">
      <div>
        <h1 class="section-title" style="margin-bottom:0;text-transform:capitalize;">${titleText}</h1>
        <div class="catalog-count">${list.length} products</div>
      </div>
      <div style="display:flex;gap:10px;align-items:center;">
        <button class="filter-toggle-btn" data-action="toggle-filters-panel">&#128269; Filters</button>
        <select class="sort-select" data-action="set-sort">
          <option value="" ${catalogState.sort === "" ? "selected" : ""}>Sort: Featured</option>
          <option value="price-asc" ${catalogState.sort === "price-asc" ? "selected" : ""}>Price: Low to High</option>
          <option value="price-desc" ${catalogState.sort === "price-desc" ? "selected" : ""}>Price: High to Low</option>
          <option value="popularity" ${catalogState.sort === "popularity" ? "selected" : ""}>Popularity</option>
        </select>
      </div>
    </div>
    <div class="catalog-layout">
      <aside class="filters-panel ${catalogState.mobileFiltersOpen ? "open" : ""}">
        <div class="filter-block">
          <div class="filter-block-title">Price range</div>
          <input type="range" min="500" max="4500" step="100" value="${catalogState.priceMax}" data-action="set-price-range" style="width:100%;"/>
          <div style="font-size:12px;color:var(--ink-soft);">Up to ${currency(catalogState.priceMax)}</div>
        </div>
        ${checklistHtml("Brand", BRANDS, "brand")}
        ${checklistHtml("Frame shape", SHAPES, "shape")}
        ${checklistHtml("Frame material", MATERIALS, "material")}
        ${checklistHtml("Gender", GENDERS, "gender")}
        <label class="filter-option" style="margin-bottom:10px;">
          <input type="checkbox" data-action="toggle-discount-only" ${catalogState.discountOnly ? "checked" : ""}/> 10% off or more
        </label>
        <button class="clear-filters-btn" data-action="clear-filters">Clear filters</button>
      </aside>
      <div>
        ${list.length === 0 ? `
          <div class="empty-state">
            <div class="empty-icon">&#128269;</div>
            <div class="empty-state-title">No products match your filters</div>
            <div class="empty-state-body">Try adjusting or clearing some filters to see more results.</div>
            <button class="btn" data-action="clear-filters">Clear all filters</button>
          </div>` : `<div class="product-grid">${list.map(productCardHtml).join("")}</div>`}
      </div>
    </div>
  </div>`;
}

/* ============================================================
   PRODUCT DETAIL PAGE
   ============================================================ */
function ensurePdState(product) {
  if (!pdState || pdState.productId !== product.id) {
    pdState = {
      productId: product.id,
      activeImage: 0,
      lens: LENS_OPTIONS[0],
      rxMode: "later",
      rx: { rSph: "", rCyl: "", rAxis: "", lSph: "", lCyl: "", lAxis: "", pd: "", add: "" },
      rxFile: null,
      qty: 1,
      tryOnOpen: false,
    };
  }
}
function renderProduct(id) {
  const product = state.products.find((p) => p.id === id);
  if (!product) {
    return `<div class="container"><div class="empty-state"><div class="empty-state-title">Product not found</div><button class="btn" data-action="go-catalog">Browse products</button></div></div>`;
  }
  ensurePdState(product);
  const lensTotal = product.prescriptionRequired ? pdState.lens.price : 0;
  const totalPrice = (product.price + lensTotal) * pdState.qty;
  const related = state.products.filter((p) => p.category === product.category && p.id !== product.id).slice(0, 4);
  const waMsg = `Hi Vision Care, I'd like to order: ${product.name} — ${currency(product.price)}. Product ID: ${product.id}`;

  let rxBlock = "";
  if (product.prescriptionRequired) {
    rxBlock = `
    <div class="rx-box">
      <div class="rx-box-title">Select lens type</div>
      <div class="lens-options">
        ${LENS_OPTIONS.map((l) => `
          <label class="lens-option ${pdState.lens.id === l.id ? "selected" : ""}">
            <input type="radio" name="lens" data-action="select-lens" data-lens-id="${l.id}" ${pdState.lens.id === l.id ? "checked" : ""}/>
            <span>${l.label}</span>
            <span class="lens-option-price">${l.price ? "+" + currency(l.price) : "Free"}</span>
          </label>`).join("")}
      </div>

      <div class="rx-box-title" style="margin-top:16px;">Add prescription</div>
      <div class="rx-mode-row">
        ${[["manual", "Enter manually"], ["upload", "Upload image"], ["later", "Send later"]].map(([v, l]) => `
          <button class="rx-mode-btn ${pdState.rxMode === v ? "selected" : ""}" data-action="select-rx-mode" data-mode="${v}">${l}</button>`).join("")}
      </div>
      ${pdState.rxMode === "manual" ? `
        <div class="rx-grid">
          <div>
            <div style="font-size:12px;font-weight:700;margin-bottom:6px;">Right eye (OD)</div>
            <input placeholder="SPH" data-action="set-rx-field" data-field="rSph" value="${escapeHtml(pdState.rx.rSph)}"/>
            <input placeholder="CYL" data-action="set-rx-field" data-field="rCyl" value="${escapeHtml(pdState.rx.rCyl)}"/>
            <input placeholder="AXIS" data-action="set-rx-field" data-field="rAxis" value="${escapeHtml(pdState.rx.rAxis)}"/>
          </div>
          <div>
            <div style="font-size:12px;font-weight:700;margin-bottom:6px;">Left eye (OS)</div>
            <input placeholder="SPH" data-action="set-rx-field" data-field="lSph" value="${escapeHtml(pdState.rx.lSph)}"/>
            <input placeholder="CYL" data-action="set-rx-field" data-field="lCyl" value="${escapeHtml(pdState.rx.lCyl)}"/>
            <input placeholder="AXIS" data-action="set-rx-field" data-field="lAxis" value="${escapeHtml(pdState.rx.lAxis)}"/>
          </div>
        </div>
        <div class="rx-extra-row">
          <input placeholder="PD" data-action="set-rx-field" data-field="pd" value="${escapeHtml(pdState.rx.pd)}"/>
          <input placeholder="ADD" data-action="set-rx-field" data-field="add" value="${escapeHtml(pdState.rx.add)}"/>
        </div>` : ""}
      ${pdState.rxMode === "upload" ? `
        <label class="upload-box">
          &#128228; ${pdState.rxFile ? `Selected: ${escapeHtml(pdState.rxFile.name)}` : "Click to upload JPG, PNG or PDF (max 5MB)"}
          <input type="file" accept=".jpg,.jpeg,.png,.pdf" data-action="upload-rx-file" style="display:none;"/>
        </label>` : ""}
      <div class="rx-privacy-note">Your prescription information is kept private and is only used to prepare your order.</div>
    </div>`;
  }

  return `
  <div class="container">
    <button class="back-link" data-action="go-catalog" data-cat="${product.category}">&larr; Back to ${product.category.replace("-", " ")}</button>
    <div class="pd-grid">
      <div>
        <div class="pd-main-image"><img src="${product.images[pdState.activeImage]}" alt="${escapeHtml(product.name)}"/></div>
        <div class="pd-thumbs">
          ${product.images.map((im, i) => `<img src="${im}" class="${i === pdState.activeImage ? "active" : ""}" data-action="set-active-image" data-index="${i}"/>`).join("")}
        </div>
        <button class="btn btn-outline btn-full" style="margin-top:14px;" data-action="open-tryon">&#128247; Try on virtually</button>
      </div>
      <div>
        <div class="pd-brand">${escapeHtml(product.brand)}</div>
        <h1 class="pd-title">${escapeHtml(product.name)}</h1>
        <div class="pd-rating-row">${starsHtml(product.rating)} <span>${product.rating} &middot; ${product.reviewCount} reviews</span></div>
        <div class="pd-price-row">
          <span class="pd-price">${currency(product.price)}</span>
          ${product.discount > 0 ? `<span class="product-price-original">${currency(product.originalPrice)}</span><span class="badge badge-orange">${product.discount}% off</span>` : ""}
        </div>
        <div class="pd-stock ${product.stock === 0 ? "out" : "in"}">${product.stock === 0 ? "Out of stock" : product.stock <= 4 ? `Only ${product.stock} left in stock` : "In stock"}</div>
        <p class="pd-desc">${escapeHtml(product.description)}</p>
        <div class="pd-specs">
          ${product.frameShape !== "-" ? `<div class="label">Frame shape</div><div class="value">${product.frameShape}</div>` : ""}
          ${product.frameMaterial !== "-" ? `<div class="label">Frame material</div><div class="value">${product.frameMaterial}</div>` : ""}
          <div class="label">Frame colour</div><div class="value">${product.frameColor}</div>
          <div class="label">Size</div><div class="value">${product.size}</div>
          <div class="label">Gender</div><div class="value">${product.gender}</div>
        </div>
        ${rxBlock}
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
          <div class="qty-stepper">
            <button data-action="qty-dec">&minus;</button>
            <span>${pdState.qty}</span>
            <button data-action="qty-inc">+</button>
          </div>
          <div style="font-size:13.5px;color:var(--ink-soft);">Total: <strong style="color:var(--ink);">${currency(totalPrice)}</strong></div>
        </div>
        <div class="pd-actions">
          <button class="btn" data-action="pd-add-cart" ${product.stock === 0 ? "disabled" : ""}>&#128722; Add to cart</button>
          <button class="btn btn-navy" data-action="pd-buy-now" ${product.stock === 0 ? "disabled" : ""}>Buy now</button>
          <button class="btn btn-outline" data-action="toggle-wish" data-id="${product.id}">${state.wishlist.includes(product.id) ? "&#9829;" : "&#9825;"} Wishlist</button>
          <a class="btn btn-whatsapp" href="${waLink(waMsg)}" target="_blank" rel="noopener">&#128172; Order on WhatsApp</a>
        </div>
      </div>
    </div>

    ${related.length ? `
      <div class="related-section">
        <h2 class="section-title">You may also like</h2>
        <div class="product-grid">${related.map(productCardHtml).join("")}</div>
      </div>` : ""}
  </div>
  ${pdState.tryOnOpen ? `
    <div class="modal-overlay" data-action="close-tryon">
      <div class="modal-box" onclick="event.stopPropagation()">
        <div class="tryon-preview">
          <img class="face" src="${avatarSilhouetteUri()}" alt="Sample face"/>
          <img class="overlay-glasses" src="${product.images[0]}" alt="Glasses overlay"/>
        </div>
        <div style="font-weight:700;font-size:16px;margin-bottom:6px;">Virtual try-on coming soon</div>
        <p style="font-size:13px;color:var(--ink-soft);margin-bottom:16px;">Real camera-based try-on is on its way. This is a preview of ${escapeHtml(product.name)} on a sample face.</p>
        <button class="btn btn-full" data-action="close-tryon">Close preview</button>
      </div>
    </div>` : ""}`;
}

/* ============================================================
   CART PAGE
   ============================================================ */
function renderCart() {
  const active = state.cart.map((item, idx) => ({ item, idx })).filter((x) => !x.item.saved);
  const saved = state.cart.map((item, idx) => ({ item, idx })).filter((x) => x.item.saved);
  const subtotal = active.reduce((s, x) => s + cartItemUnitPrice(x.item) * x.item.qty, 0);
  let discount = 0;
  if (couponState.applied && subtotal >= couponState.applied.minOrder) discount = Math.round((subtotal * couponState.applied.percent) / 100);
  const delivery = subtotal > 0 && subtotal < 999 ? 79 : 0;
  const tax = Math.round((subtotal - discount) * 0.05);
  const total = subtotal - discount + delivery + tax;

  if (state.cart.length === 0) {
    return `<div class="container-md">
      <h1 class="section-title">Your cart</h1>
      <div class="empty-state">
        <div class="empty-icon">&#128722;</div>
        <div class="empty-state-title">Your cart is empty</div>
        <div class="empty-state-body">Browse our collection and add a few frames you like.</div>
        <button class="btn" data-action="go-catalog">Continue shopping</button>
      </div>
    </div>`;
  }

  function itemRow(x, savedRow) {
    const p = state.products.find((pp) => pp.id === x.item.productId);
    if (!p) return "";
    return `
    <div class="cart-item">
      <img src="${p.images[0]}" alt="${escapeHtml(p.name)}"/>
      <div style="flex:1;">
        <div class="cart-item-name">${escapeHtml(p.name)}</div>
        ${x.item.lens ? `<div class="cart-item-meta">Lens: ${x.item.lens.label}</div>` : ""}
        <div class="cart-item-actions">
          ${!savedRow ? `
            <div class="qty-stepper">
              <button data-action="cart-qty-dec" data-index="${x.idx}">&minus;</button>
              <span>${x.item.qty}</span>
              <button data-action="cart-qty-inc" data-index="${x.idx}">+</button>
            </div>
            <button class="link-teal" data-action="cart-save-later" data-index="${x.idx}">Save for later</button>
          ` : `<button class="link-teal" data-action="cart-save-later" data-index="${x.idx}">Move to cart</button>`}
          <button class="link-danger" data-action="cart-remove" data-index="${x.idx}">&#128465; Remove</button>
        </div>
      </div>
      ${!savedRow ? `<div class="cart-item-price">${currency(cartItemUnitPrice(x.item) * x.item.qty)}</div>` : ""}
    </div>`;
  }

  return `
  <div class="container-md">
    <h1 class="section-title">Your cart</h1>
    <div class="cart-layout">
      <div>
        ${active.map((x) => itemRow(x, false)).join("")}
        ${saved.length ? `<div style="margin-top:24px;"><div style="font-weight:700;font-size:14px;margin-bottom:10px;">Saved for later (${saved.length})</div>${saved.map((x) => itemRow(x, true)).join("")}</div>` : ""}
        <button class="btn btn-ghost" style="margin-top:10px;" data-action="go-catalog">&larr; Continue shopping</button>
      </div>
      <div>
        <div class="order-summary">
          <div style="font-weight:700;font-size:15px;margin-bottom:14px;">Order summary</div>
          <div class="coupon-row">
            <input id="couponInput" placeholder="Coupon code" value="${escapeHtml(couponState.applied ? couponState.applied.code : "")}"/>
            <button class="btn btn-sm btn-outline" data-action="apply-coupon">Apply</button>
          </div>
          ${couponState.message ? `<div class="coupon-msg ${couponState.applied ? "ok" : "err"}">${escapeHtml(couponState.message)}</div>` : ""}
          <div class="summary-row"><span>Subtotal</span><span>${currency(subtotal)}</span></div>
          <div class="summary-row"><span>Discount</span><span>${discount ? "-" + currency(discount) : currency(0)}</span></div>
          <div class="summary-row"><span>Delivery fee</span><span>${delivery === 0 ? "Free" : currency(delivery)}</span></div>
          <div class="summary-row"><span>Tax (5%)</span><span>${currency(tax)}</span></div>
          <div class="summary-total"><span>Total</span><span>${currency(total)}</span></div>
          <button class="btn btn-full" style="margin-top:16px;" data-action="go-checkout" ${active.length === 0 ? "disabled" : ""}>Proceed to checkout</button>
        </div>
      </div>
    </div>
  </div>`;
}

/* ============================================================
   CHECKOUT PAGE
   ============================================================ */
function ensureCheckoutState() {
  if (!checkoutState) {
    checkoutState = {
      step: 1,
      info: { name: "", phone: "", email: state.user ? state.user.email : "" },
      addr: { house: "", street: "", area: "", city: "", state: "", pin: "" },
      rxChoice: "skip",
      payment: "cod",
      terms: false,
      errors: {},
      placing: false,
    };
    if (state.user) checkoutState.info.name = state.user.name;
  }
}
function checkoutTotals() {
  const active = state.cart.filter((c) => !c.saved);
  const subtotal = active.reduce((s, item) => s + cartItemUnitPrice(item) * item.qty, 0);
  let discount = 0;
  if (couponState.applied && subtotal >= couponState.applied.minOrder) discount = Math.round((subtotal * couponState.applied.percent) / 100);
  const delivery = subtotal - discount < 999 ? 79 : 0;
  const tax = Math.round((subtotal - discount) * 0.05);
  const total = subtotal - discount + delivery + tax;
  return { active, subtotal, discount, delivery, tax, total };
}
function renderCheckout() {
  const active = state.cart.filter((c) => !c.saved);
  if (active.length === 0) {
    return `<div class="container-md"><div class="empty-state"><div class="empty-state-title">Nothing to check out</div><div class="empty-state-body">Add something to your cart first.</div><button class="btn" data-action="go-catalog">Shop now</button></div></div>`;
  }
  ensureCheckoutState();
  const cs = checkoutState;
  const t = checkoutTotals();
  const steps = ["Your details", "Delivery address", "Prescription", "Payment"];

  let stepBody = "";
  if (cs.step === 1) {
    stepBody = `
      <div style="font-weight:700;margin-bottom:14px;">Your details</div>
      ${formField("Full name", "name", "text", cs.info.name, "info")}
      ${formField("Mobile number", "phone", "tel", cs.info.phone, "info")}
      ${formField("Email", "email", "email", cs.info.email, "info")}`;
  } else if (cs.step === 2) {
    stepBody = `
      <div style="font-weight:700;margin-bottom:14px;">Delivery address</div>
      ${formField("House / flat no.", "house", "text", cs.addr.house, "addr")}
      ${formField("Street", "street", "text", cs.addr.street, "addr")}
      ${formField("Area (optional)", "area", "text", cs.addr.area, "addr")}
      <div class="form-row-3">
        ${formField("City", "city", "text", cs.addr.city, "addr")}
        ${formField("State", "state", "text", cs.addr.state, "addr")}
        ${formField("PIN code", "pin", "text", cs.addr.pin, "addr")}
      </div>`;
  } else if (cs.step === 3) {
    stepBody = `
      <div style="font-weight:700;margin-bottom:14px;">Prescription</div>
      <p style="font-size:13px;color:var(--ink-soft);margin-bottom:14px;">You've already set lens preferences on your product pages. Let us know how you'd like to finalise your prescription.</p>
      ${[["upload", "I'll upload my prescription now"], ["manual", "I entered it manually on the product page"], ["skip", "Skip — I'll send it later"]].map(([v, l]) => `
        <label class="radio-option ${cs.rxChoice === v ? "selected" : ""}">
          <input type="radio" name="rxChoice" data-action="set-rx-choice" data-value="${v}" ${cs.rxChoice === v ? "checked" : ""}/>
          <span>${l}</span>
        </label>`).join("")}
      ${cs.rxChoice === "upload" ? `
        <label class="upload-box">
          &#128228; ${cs.rxFile ? `Selected: ${escapeHtml(cs.rxFile.name)}` : "Click to upload JPG, PNG or PDF (max 5MB)"}
          <input type="file" accept=".jpg,.jpeg,.png,.pdf" data-action="upload-checkout-rx" style="display:none;"/>
        </label>` : ""}`;
  } else if (cs.step === 4) {
    stepBody = `
      <div style="font-weight:700;margin-bottom:14px;">Payment method</div>
      ${[["cod", "Cash on Delivery"], ["upi", "UPI"], ["card", "Credit / Debit Card"], ["online", "Online Payment"]].map(([v, l]) => `
        <label class="radio-option ${cs.payment === v ? "selected" : ""}">
          <input type="radio" name="payment" data-action="set-payment" data-value="${v}" ${cs.payment === v ? "checked" : ""}/>
          <span>${l}</span>
        </label>`).join("")}
      ${cs.payment !== "cod" ? `<div class="info-note">You will pay securely through Razorpay (UPI, cards or nit banking) after you place the order.</div>` : ""}
      <div class="checkbox-row">
        <input type="checkbox" id="termsCheck" data-action="toggle-terms" ${cs.terms ? "checked" : ""}/>
        <label for="termsCheck">I agree to the Terms &amp; Conditions and Refund Policy</label>
      </div>
      ${cs.errors.terms ? `<div class="form-error">${cs.errors.terms}</div>` : ""}`;
  }

  function formField(label, field, type, value, group) {
    const err = cs.errors[field];
    return `
      <div class="form-group ${err ? "error" : ""}">
        <label>${label}</label>
        <input type="${type}" data-action="set-checkout-field" data-group="${group}" data-field="${field}" value="${escapeHtml(value)}"/>
        ${err ? `<div class="form-error">${err}</div>` : ""}
      </div>`;
  }

  return `
  <div class="container-md">
    <h1 class="section-title">Checkout</h1>
    <div class="step-tracker">
      ${steps.map((s, i) => `
        <div class="step-chip ${cs.step === i + 1 ? "active" : ""}">
          <span class="step-num ${cs.step > i + 1 ? "done" : cs.step === i + 1 ? "current" : ""}">${cs.step > i + 1 ? "&#10003;" : i + 1}</span>
          ${s}${i < steps.length - 1 ? " &rsaquo;" : ""}
        </div>`).join("")}
    </div>
    <div class="checkout-layout">
      <div class="checkout-panel">
        ${stepBody}
        <div class="checkout-nav">
          ${cs.step > 1 ? `<button class="btn btn-outline" data-action="checkout-back">&larr; Back</button>` : "<span></span>"}
          ${cs.step < 4 ? `<button class="btn" data-action="checkout-next">Continue &rarr;</button>` : `<button class="btn btn-orange" data-action="place-order" ${cs.placing ? "disabled" : ""}>${cs.placing ? "Placing order..." : "Place order"}</button>`}
        </div>
      </div>
      <div>
        <div class="order-summary">
          <div style="font-weight:700;margin-bottom:12px;">Order summary</div>
          ${t.active.map((item) => {
            const p = state.products.find((pp) => pp.id === item.productId);
            return p ? `<div class="summary-row"><span>${escapeHtml(p.name)} &times; ${item.qty}</span><span>${currency(cartItemUnitPrice(item) * item.qty)}</span></div>` : "";
          }).join("")}
          <div style="border-top:1px solid var(--line);margin-top:10px;padding-top:10px;">
            <div class="summary-row"><span>Subtotal</span><span>${currency(t.subtotal)}</span></div>
            ${t.discount ? `<div class="summary-row"><span>Discount</span><span>-${currency(t.discount)}</span></div>` : ""}
            <div class="summary-row"><span>Delivery</span><span>${t.delivery === 0 ? "Free" : currency(t.delivery)}</span></div>
            <div class="summary-row"><span>Tax</span><span>${currency(t.tax)}</span></div>
            <div class="summary-total"><span>Total</span><span>${currency(t.total)}</span></div>
          </div>
          <div style="font-size:12px;color:var(--ink-soft);margin-top:12px;">&#128666; Estimated delivery: 3–5 business days</div>
        </div>
      </div>
    </div>
  </div>`;
}

function validateCheckoutStep() {
  const cs = checkoutState;
  const e = {};
  if (cs.step === 1) {
    if (!cs.info.name.trim()) e.name = "Enter your full name.";
    if (!/^\d{10}$/.test(cs.info.phone.trim())) e.phone = "Enter a valid 10-digit mobile number.";
    if (!/^\S+@\S+\.\S+$/.test(cs.info.email.trim())) e.email = "Enter a valid email address.";
  }
  if (cs.step === 2) {
    if (!cs.addr.house.trim()) e.house = "Required.";
    if (!cs.addr.street.trim()) e.street = "Required.";
    if (!cs.addr.city.trim()) e.city = "Required.";
    if (!cs.addr.state.trim()) e.state = "Required.";
    if (!/^\d{6}$/.test(cs.addr.pin.trim())) e.pin = "Enter a valid 6-digit PIN code.";
  }
  cs.errors = e;
  return Object.keys(e).length === 0;
}

/* server-side-style coupon re-validation (runs against the authoritative
   stored coupon list at the moment of payment, not just whatever was
   cached when it was first typed in the cart) */
function revalidateCoupon(subtotal) {
  const coupon = couponState.applied;

  // No coupon applied means no discount.
  if (!coupon) {
    return { ok: true, discount: 0, coupon: null };
  }

  // The applied coupon came from the backend API.
  if (!coupon.code || !Number.isFinite(Number(coupon.percent))) {
    return {
      ok: false,
      reason: "Please apply a valid coupon again."
    };
  }

  // Check the minimum order amount.
  if (subtotal < Number(coupon.minOrder)) {
    return {
      ok: false,
      reason: `Minimum order ${currency(coupon.minOrder)} required for ${coupon.code}.`
    };
  }

  // Calculate the discount using the coupon returned by the API.
  const discount = Math.round(
    (subtotal * Number(coupon.percent)) / 100
  );

  return {
    ok: true,
    discount,
    coupon
  };
}

// ---------- Razorpay online payment helpers ----------
function loadRazorpayScript() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Could not load the payment window. Please check your internet connection."));
    document.head.appendChild(script);
  });
}

// Returns { paid: true } or { paid: false, reason: "..." }
async function payWithRazorpay(orderCode, customer) {
  try {
    await loadRazorpayScript();

    const createRes = await fetch("/api/payments/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderCode })
    });
    const created = await createRes.json();
    if (!createRes.ok || !created.success) {
      throw new Error(created.message || "Could not start the payment.");
    }

    return await new Promise((resolve) => {
      const rzp = new window.Razorpay({
        key: created.keyId,
        amount: created.amount,
        currency: created.currency,
        name: "Vision Care",
        description: "Order " + orderCode,
        order_id: created.razorpayOrderId,
        prefill: {
          name: customer.name,
          email: customer.email,
          contact: customer.phone
        },
        theme: { color: "#0f766e" },
        handler: async (response) => {
          try {
            const verifyRes = await fetch("/api/payments/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                orderCode,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature
              })
            });
            const verified = await verifyRes.json();
            resolve(
              verifyRes.ok && verified.success
                ? { paid: true }
                : { paid: false, reason: verified.message || "Payment verification failed." }
            );
          } catch (e) {
            resolve({ paid: false, reason: "Could not verify the payment." });
          }
        },
        modal: {
          ondismiss: () => resolve({ paid: false, reason: "Payment was not completed." })
        }
      });
      rzp.open();
    });
  } catch (error) {
    return { paid: false, reason: error.message || "Payment failed." };
  }
}

// ---------- Hero image slider (auto-rolling) ----------
function heroSliderHtml() {
  // Put your images in public/images/hero/ and list their file names here
  const slides = [
    "image/hero1.png",
    "image/hero2.png",
    "image/hero3.jpg"
  ];
  const secondsPerSlide = 4;

  if (slides.length < 2) {
    return `<div class="hero-slider"><img src="${slides[0]}" alt="Vision Care eyewear" style="opacity:1"/></div>`;
  }

  const n = slides.length;
  const total = n * secondsPerSlide;
  const share = 100 / n;
  const fade = Math.min(share / 4, 5);

  return `
  <style>
    @keyframes heroFade {
      0% { opacity: 0; }
      ${fade}% { opacity: 1; }
      ${share}% { opacity: 1; }
      ${share + fade}% { opacity: 0; }
      100% { opacity: 0; }
    }
  </style>
  <div class="hero-slider">
    ${slides.map((src, i) => `<img src="${src}" alt="Vision Care eyewear" style="animation: heroFade ${total}s infinite; animation-delay: ${i * secondsPerSlide}s;"/>`).join("")}
  </div>`;
}

async function placeOrderFlow() {
  if (!validateCheckoutStepAll()) return;
  const cs = checkoutState;
  if (!cs.terms) { cs.errors = { terms: "Please accept the terms to continue." }; rerender(); return; }
  cs.placing = true;
  rerender();

  const t = checkoutTotals();
  const check = revalidateCoupon(t.subtotal);
  if (!check.ok) {
    toast(check.reason);
    couponState.applied = null;
    couponState.message = check.reason;
    cs.placing = false;
    rerender();
    return;
  }

  const order = {
    id: genOrderId(),
    info: { ...cs.info },
    addr: { ...cs.addr },
    rxChoice: cs.rxChoice,
    rxFile: cs.rxFile ? { name: cs.rxFile.name, type: cs.rxFile.type, size: cs.rxFile.size } : null,
    payment: cs.payment,
    items: t.active.map((item) => ({ productId: item.productId, qty: item.qty, lens: item.lens, prescription: item.prescription })),
    discount: check.discount,
    total: t.total - t.discount + check.discount, // reconcile against authoritative discount
    status: "Pending",
    date: new Date().toISOString().slice(0, 10),
    eta: new Date(Date.now() + 5 * 86400000).toDateString(),
  };
  let savedOrder;

  try {
    const fullAddress = [
      cs.addr.house,
      cs.addr.street,
      cs.addr.area,
      cs.addr.city,
      cs.addr.state,
      cs.addr.pin
    ].filter(Boolean).join(", ");

    const response = await fetch("/api/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        customerName: order.info.name,
        email: order.info.email,
        phone: order.info.phone,
        address: fullAddress,
        paymentMethod: order.payment,
        couponCode: check.coupon ? check.coupon.code : null,discount: check.discount,
        items: order.items.map((item) => ({
          productId: item.productId,
          qty: item.qty,
          lens: item.lens?.id || item.lens || "basic",
          prescription: item.prescription
        }))
      })
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(
        result.message || "The order could not be saved."
      );
    }

    savedOrder = result.order;
  } catch (error) {
    console.error("Checkout error:", error);

    cs.placing = false;
    toast(error.message || "Could not place your order. Please try again.");
    rerender();
    return;
  }

  // ---- Online payment (UPI / card / online) via Razorpay ----
  if (order.payment !== "cod") {
    const pay = await payWithRazorpay(savedOrder.orderCode, order.info);
    alert(
      pay.paid
        ? "Payment successful!"
        : (pay.reason || "Payment failed.") + " Your order is saved with payment pending."
    );
  }

  // ---- Online payment (UPI / card / online) via Razorpay ----
  if (order.payment !== "cod") {
    const pay = await payWithRazorpay(savedOrder.orderCode, order.info);
    alert(
      pay.paid
        ? "Payment successful!"
        : (pay.reason || "Payment failed.") + " Your order is saved with payment pending."
    );
  }

  order.id = savedOrder.orderCode;
  order.total = Number(savedOrder.total);
  order.discount = Number(savedOrder.discount);
  order.status = "Pending";

  state.orders.unshift(order);
  persist("orders");

  // decrement inventory
  order.items.forEach((it) => {
    const p = state.products.find((pp) => pp.id === it.productId);
    if (p) p.stock = Math.max(0, p.stock - it.qty);
  });
  persist("products");

  // bump coupon usage count on the authoritative record
  if (check.coupon) {
    check.coupon.used = (check.coupon.used || 0) + 1;
    persist("coupons");
  }

  // upsert customer record
  const ci = state.customers.findIndex((c) => c.email === order.info.email);
  if (ci === -1) state.customers.push({ name: order.info.name, email: order.info.email, phone: order.info.phone, orders: 1, spent: order.total, joined: new Date().toISOString().slice(0, 10) });
  else { state.customers[ci].orders = (state.customers[ci].orders || 0) + 1; state.customers[ci].spent = (state.customers[ci].spent || 0) + order.total; }
  persist("customers");

  // remove purchased items from cart (keep saved-for-later items)
  const purchasedIds = new Set(order.items.map((it) => it.productId));
  state.cart = state.cart.filter((c) => c.saved || !purchasedIds.has(c.productId));
  persist("cart");

  couponState = { applied: null, message: "" };
  checkoutState = null;
  lastOrderId = order.id;
  go("#/confirmation/" + order.id);
  toast("Order placed!");
}
function validateCheckoutStepAll() {
  const cs = checkoutState;
  const savedStep = cs.step;
  cs.step = 1; if (!validateCheckoutStep()) { cs.step = 1; rerender(); return false; }
  cs.step = 2; if (!validateCheckoutStep()) { cs.step = 2; rerender(); return false; }
  cs.step = savedStep;
  return true;
}

/* ============================================================
   CONFIRMATION PAGE
   ============================================================ */
let lastOrderId = null;
function renderConfirmation(id) {
  const order = (id && state.orders.find((o) => o.id === id)) || state.orders.find((o) => o.id === lastOrderId) || state.orders[0];
  if (!order) {
    return `<div class="empty-state"><div class="empty-icon">&#128230;</div><div class="empty-state-title">No recent order</div><div class="empty-state-body">Place an order to see confirmation details here.</div><button class="btn" data-action="go-catalog">Shop now</button></div>`;
  }
  const waMsg = `Hi Vision Care, I have a question about my order ${order.id}.`;
  return `
  <div class="container-sm">
    <div class="confirm-head">
      <div class="confirm-check">&#10003;</div>
      <h1 class="section-title" style="margin-bottom:0;">Order confirmed!</h1>
      <p style="color:var(--ink-soft);font-size:14px;margin-top:6px;">Order number <strong style="color:var(--navy);">${order.id}</strong></p>
    </div>
    <div class="confirm-box">
      <div class="confirm-grid">
        <div><div style="color:var(--ink-soft);">Customer</div><div style="font-weight:600;">${escapeHtml(order.info.name)}</div></div>
        <div><div style="color:var(--ink-soft);">Payment method</div><div style="font-weight:600;text-transform:uppercase;">${order.payment}</div></div>
        <div><div style="color:var(--ink-soft);">Delivery address</div><div style="font-weight:600;">${escapeHtml(order.addr.house)}, ${escapeHtml(order.addr.street)}, ${escapeHtml(order.addr.city)}, ${escapeHtml(order.addr.state)} ${escapeHtml(order.addr.pin)}</div></div>
        <div><div style="color:var(--ink-soft);">Estimated delivery</div><div style="font-weight:600;">${order.eta}</div></div>
      </div>
      <div style="border-top:1px solid var(--line);padding-top:14px;">
        ${order.items.map((it) => {
          const p = state.products.find((pp) => pp.id === it.productId);
          return p ? `<div class="summary-row"><span>${escapeHtml(p.name)} &times; ${it.qty}</span><span>${currency((p.price + (it.lens ? it.lens.price : 0)) * it.qty)}</span></div>` : "";
        }).join("")}
        <div class="summary-total"><span>Total</span><span>${currency(order.total)}</span></div>
      </div>
    </div>
    <div class="confirm-buttons">
      <button class="btn" data-action="go" data-route="#/track/${order.id}">Track order</button>
      <button class="btn btn-outline" data-action="go-catalog">Continue shopping</button>
      <a class="btn btn-whatsapp" href="${waLink(waMsg)}" target="_blank" rel="noopener">&#128172; Contact Vision Care</a>
    </div>
  </div>`;
}

/* ============================================================
   ORDER TRACKING
   ============================================================ */
function mapStatusToTrack(status) {
  const m = { Pending: "Order Placed", Confirmed: "Order Placed", "Prescription Verified": "Prescription Verified", Processing: "Lens Processing", Packed: "Packed", Shipped: "Out for Delivery", "Out for Delivery": "Out for Delivery", Delivered: "Delivered", Cancelled: "Order Placed" };
  return m[status] || "Order Placed";
}
function renderTrack() {
  const ts = trackState;
  let resultHtml = "";
  if (ts.result) {
    const idx = TRACK_FLOW.indexOf(mapStatusToTrack(ts.result.status));
    resultHtml = `
    <div class="track-panel">
      <div style="font-weight:700;margin-bottom:16px;">Order ${ts.result.id}</div>
      ${TRACK_FLOW.map((s, i) => `
        <div class="track-step">
          <div class="track-step-indicator">
            <div class="track-dot ${i <= idx ? "done" : ""}">${i <= idx ? "&#10003;" : i + 1}</div>
            ${i < TRACK_FLOW.length - 1 ? `<div class="track-line ${i < idx ? "done" : ""}"></div>` : ""}
          </div>
          <div class="track-step-label ${i <= idx ? "done" : ""}">${s}</div>
        </div>`).join("")}
    </div>`;
  }
  return `
  <div class="container-sm">
    <h1 class="section-title" style="text-align:center;">Track your order</h1>
    <div class="track-panel">
      <div class="form-group"><label>Order ID</label><input id="trackOrderId" placeholder="e.g. VC12345678" value="${escapeHtml(ts.orderId)}"/></div>
      <div class="form-group"><label>Mobile number</label><input id="trackPhone" placeholder="10-digit mobile number" value="${escapeHtml(ts.phone)}"/></div>
      <button class="btn btn-full" data-action="track-search">Track order</button>
      ${ts.error ? `<div class="form-error" style="margin-top:10px;">${escapeHtml(ts.error)}</div>` : ""}
    </div>
    ${resultHtml}
  </div>`;
}

/* ============================================================
   APPOINTMENT BOOKING
   ============================================================ */
function renderAppointment() {
  const as = appointmentState;
  if (as.done) {
    return `<div class="container-sm" style="text-align:center;">
      <div style="font-size:40px;color:var(--teal);">&#10003;</div>
      <h2 class="section-title">Check-up requested</h2>
      <p style="color:var(--ink-soft);margin-bottom:20px;">We'll call you to confirm your slot for ${escapeHtml(as.form.date)} at ${escapeHtml(as.form.time)}.</p>
      <button class="btn" data-action="go" data-route="#/">Back to home</button>
    </div>`;
  }
  const f = as.form, e = as.errors;
  return `
  <div class="container-sm">
    <h1 class="section-title" style="margin-bottom:4px;">Book an eye check-up</h1>
    <p style="color:var(--ink-soft);font-size:13.5px;margin-bottom:20px;">Free at our Andheri West store — pick a time that works for you.</p>
    <div class="auth-box" style="max-width:none;">
      <div class="form-group ${e.name ? "error" : ""}"><label>Full name</label><input data-action="apt-field" data-field="name" value="${escapeHtml(f.name)}"/>${e.name ? `<div class="form-error">${e.name}</div>` : ""}</div>
      <div class="form-group ${e.phone ? "error" : ""}"><label>Mobile number</label><input data-action="apt-field" data-field="phone" value="${escapeHtml(f.phone)}"/>${e.phone ? `<div class="form-error">${e.phone}</div>` : ""}</div>
      <div class="form-row-3">
        <div class="form-group ${e.date ? "error" : ""}"><label>Preferred date</label><input type="date" data-action="apt-field" data-field="date" value="${escapeHtml(f.date)}"/>${e.date ? `<div class="form-error">${e.date}</div>` : ""}</div>
        <div class="form-group ${e.time ? "error" : ""}"><label>Preferred time</label><input type="time" data-action="apt-field" data-field="time" value="${escapeHtml(f.time)}"/>${e.time ? `<div class="form-error">${e.time}</div>` : ""}</div>
        <div></div>
      </div>
      <div class="form-group"><label>Reason for visit</label><textarea rows="3" data-action="apt-field" data-field="reason">${escapeHtml(f.reason)}</textarea></div>
      <button class="btn btn-full" data-action="apt-submit">Request appointment</button>
    </div>
  </div>`;
}

/* ============================================================
   ACCOUNT PAGE
   ============================================================ */
function renderAccount(tab) {
  if (!state.user) {
    const as = authState;
    return `
    <div class="container-sm">
      <h1 class="section-title" style="text-align:center;">${as.mode === "login" ? "Log in" : "Create your account"}</h1>
      <div class="auth-box">
        ${as.mode === "signup" ? `<div class="form-group"><label>Full name</label><input data-action="auth-field" data-field="name" value="${escapeHtml(as.form.name)}"/></div>` : ""}
        <div class="form-group"><label>Email</label><input data-action="auth-field" data-field="email" value="${escapeHtml(as.form.email)}"/></div>
        ${as.mode === "signup" ? `<div class="form-group"><label>Phone</label><input data-action="auth-field" data-field="phone" value="${escapeHtml(as.form.phone)}"/></div>` : ""}
        <div class="form-group"><label>Password</label><input type="password" data-action="auth-field" data-field="password" value="${escapeHtml(as.form.password)}"/></div>
        ${as.error ? `<div class="form-error" style="margin-bottom:10px;">${escapeHtml(as.error)}</div>` : ""}
        <button class="btn btn-full" data-action="auth-submit">${as.mode === "login" ? "Log in" : "Create account"}</button>
        <div class="auth-switch">
          ${as.mode === "login" ? `New here? <button data-action="auth-switch-mode" data-mode="signup">Create an account</button>` : `Already registered? <button data-action="auth-switch-mode" data-mode="login">Log in</button>`}
        </div>
      </div>
    </div>`;
  }

  const myOrders = state.orders.filter((o) => o.info.email === state.user.email);
  const wished = state.products.filter((p) => state.wishlist.includes(p.id));
  const tabs = [["profile", "Profile"], ["orders", "My orders"], ["wishlist", "Wishlist"], ["addresses", "Saved addresses"], ["prescriptions", "Prescriptions"]];
  const activeTab = tabs.find((t) => t[0] === tab) ? tab : "profile";

  let body = "";
  if (activeTab === "profile") {
    body = `<div class="order-card">
      <div style="font-weight:700;margin-bottom:14px;">Account settings</div>
      <div class="profile-row"><span style="color:var(--ink-soft);">Name</span><span style="font-weight:600;">${escapeHtml(state.user.name)}</span></div>
      <div class="profile-row"><span style="color:var(--ink-soft);">Email</span><span style="font-weight:600;">${escapeHtml(state.user.email)}</span></div>
      <div class="profile-row"><span style="color:var(--ink-soft);">Phone</span><span style="font-weight:600;">${escapeHtml(state.user.phone || "—")}</span></div>
      <div class="profile-row"><span style="color:var(--ink-soft);">Member since</span><span style="font-weight:600;">${state.user.joined}</span></div>
    </div>`;
  } else if (activeTab === "orders") {
    body = myOrders.length === 0
      ? `<div class="empty-state"><div class="empty-icon">&#128230;</div><div class="empty-state-title">No orders yet</div><div class="empty-state-body">Your placed orders will show up here.</div><button class="btn" data-action="go-catalog">Shop now</button></div>`
      : myOrders.map((o) => `
        <div class="order-card">
          <div class="order-card-head"><div style="font-weight:700;font-size:13.5px;">${o.id}</div><span class="badge badge-teal">${o.status}</span></div>
          <div style="font-size:12.5px;color:var(--ink-soft);">${o.items.length} item(s) &middot; ${currency(o.total)}</div>
          <button class="btn btn-sm btn-outline" style="margin-top:10px;" data-action="go" data-route="#/track/${o.id}">Track order</button>
        </div>`).join("");
  } else if (activeTab === "wishlist") {
    body = wished.length === 0
      ? `<div class="empty-state"><div class="empty-icon">&#9825;</div><div class="empty-state-title">Your wishlist is empty</div><div class="empty-state-body">Tap the heart on any product to save it here.</div><button class="btn" data-action="go-catalog">Browse products</button></div>`
      : `<div class="wishlist-grid">${wished.map((p) => `
          <div class="wishlist-card" data-action="open-product" data-id="${p.id}">
            <img src="${p.images[0]}" alt="${escapeHtml(p.name)}"/>
            <div style="font-size:12.5px;font-weight:600;margin-top:6px;">${escapeHtml(p.name)}</div>
            <div style="font-size:13px;font-weight:700;color:var(--navy);">${currency(p.price)}</div>
          </div>`).join("")}</div>`;
  } else if (activeTab === "addresses") {
    body = `<div class="empty-state"><div class="empty-icon">&#128205;</div><div class="empty-state-title">No saved addresses</div><div class="empty-state-body">Addresses you use at checkout will be saved here for next time.</div></div>`;
  } else if (activeTab === "prescriptions") {
    body = `<div class="empty-state"><div class="empty-icon">&#128065;</div><div class="empty-state-title">No saved prescriptions</div><div class="empty-state-body">Prescriptions you add during checkout will appear here for easy reordering.</div></div>`;
  }

  return `
  <div class="container-md">
    <div class="account-layout">
      <div class="account-sidebar">
        <div style="font-weight:700;margin-bottom:4px;">${escapeHtml(state.user.name)}</div>
        <div style="font-size:12.5px;color:var(--ink-soft);margin-bottom:14px;">${escapeHtml(state.user.email)}</div>
        ${tabs.map(([id, label]) => `<button class="account-tab-btn ${activeTab === id ? "active" : ""}" data-action="go" data-route="#/account/${id}">${label}</button>`).join("")}
        <button class="account-tab-btn account-logout-btn" data-action="logout">&#8630; Log out</button>
      </div>
      <div>${body}</div>
    </div>
  </div>`;
}

/* ============================================================
   STATIC PAGES
   ============================================================ */
function renderAbout() {
  return `<div class="container-sm">
    <h1 class="section-title">About Vision Care</h1>
    <p style="color:var(--ink-soft);font-size:14.5px;line-height:1.8;margin-bottom:14px;">Vision Care has been fitting our neighbourhood with glasses for over a decade. What started as a single counter has grown into a full optical store — but we've kept the same promise: honest advice, genuine frames, and a team that knows your prescription by name.</p>
    <p style="color:var(--ink-soft);font-size:14.5px;line-height:1.8;">This online store brings that same local service to your phone — browse, order, and pick up or get delivered, with our opticians checking every prescription before it ships.</p>
  </div>`;
}
function renderContact() {
  return `<div class="container-sm">
    <h1 class="section-title">Contact us</h1>
    <div class="contact-box">
      <div>&#128205; 14 MG Road, Andheri West, Mumbai 400058</div>
      <div>&#128222; +91 98765 43210</div>
      <div>&#9993; hello@visioncare.example</div>
      <div>&#128337; Open daily, 10am – 9pm</div>
      <div class="map-placeholder">Google Maps location goes here</div>
    </div>
  </div>`;
}
function renderPolicy() {
  return `<div class="container-sm">
    <h1 class="section-title">Policies</h1>
    ${["Privacy Policy", "Terms & Conditions", "Refund Policy"].map((t) => `
      <div class="policy-block">
        <div class="policy-block-title">${t}</div>
        <p>Placeholder policy text for ${t.toLowerCase()}. Replace with your store's actual policy before launch.</p>
      </div>`).join("")}
  </div>`;
}

/* ============================================================
   EVENT DELEGATION — ONE listener per event type on #app
   ============================================================ */
function closestAction(el) {
  return el.closest ? el.closest("[data-action]") : null;
}

document.addEventListener("DOMContentLoaded", init);
async function loadProductsFromAPI() {
  try {
    const response = await fetch("/api/products");

    if (!response.ok) {
      throw new Error("Could not fetch products from the server.");
    }

    const data = await response.json();

    if (!data.success || !Array.isArray(data.products)) {
      throw new Error("The products API returned an invalid response.");
    }

    const databaseProducts = data.products.map((product, index) => {
      const categoryInfo = CATEGORIES.find(
        (category) => category.id === product.category
      );

      const price = Number(product.price);
      const originalPrice = Number(product.originalPrice ?? product.price);
      const frameShape = product.frameShape || "Rectangle";
      const frameColor = product.frameColor || "Black";

      return {
        ...product,
        id: product.id,
        price,
        originalPrice,
        discount: originalPrice > 0
          ? Math.round(((originalPrice - price) / originalPrice) * 100)
          : 0,
        frameShape,
        frameMaterial: product.frameMaterial || "Acetate",
        frameColor,
        gender: product.gender || "Unisex",
        rating: Number(product.rating || 4.0).toFixed(1),
        reviewCount: Number(product.reviewCount || 0),
        images: product.imageUrl
          ? [product.imageUrl, product.imageUrl, product.imageUrl]
          : buildProductImages(
              frameShape,
              frameColor,
              product.category
            ),
        prescriptionRequired: categoryInfo
          ? categoryInfo.rx
          : false,
        sku: `SKU-${1000 + index}`,
        size: product.size || "Medium",
      };
    });

    state.products = databaseProducts;
    saveJSON("vc_products", databaseProducts);

    console.log(
      `Loaded ${databaseProducts.length} products from MySQL.`
    );
  } catch (error) {
    console.error("Could not load database products:", error.message);
    console.log("Keeping the existing product list as a fallback.");
  }
}
async function init() {
  const app = document.getElementById("app");

  app.addEventListener("click", onAppClick);
  app.addEventListener("change", onAppChange);
  app.addEventListener("input", onAppInput);

  // header (static, outside #app)
  document.getElementById("hamburgerBtn").addEventListener("click", openMobileMenu);
  document.getElementById("closeMobileMenu").addEventListener("click", closeMobileMenu);
  document.getElementById("mobileMenuOverlay").addEventListener("click", (e) => { if (e.target.id === "mobileMenuOverlay") closeMobileMenu(); });
  document.getElementById("cartBtn").addEventListener("click", () => go("#/cart"));
  document.getElementById("wishlistBtn").addEventListener("click", () => go("#/account/wishlist"));
  document.getElementById("accountBtn").addEventListener("click", () => go("#/account"));
  document.getElementById("searchBtn").addEventListener("click", doHeaderSearch);
  document.getElementById("searchInput").addEventListener("keydown", (e) => { if (e.key === "Enter") doHeaderSearch(); });
  document.getElementById("mobileSearchInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { document.getElementById("searchInput").value = e.target.value; doHeaderSearch(); closeMobileMenu(); }
  });
  document.getElementById("floatingWhatsapp").href = waLink("Hi Vision Care, I'd like some help choosing eyewear.");

 await loadProductsFromAPI();

 currentRoute = parseHash();
 renderRoute();
}

function openMobileMenu() { document.getElementById("mobileMenuOverlay").classList.remove("hidden"); }
function closeMobileMenu() { document.getElementById("mobileMenuOverlay").classList.add("hidden"); }
function doHeaderSearch() {
  const q = document.getElementById("searchInput").value;
  catalogState.category = null;
  catalogState.query = q;
  go("#/catalog");
}

function onAppClick(e) {
  const el = closestAction(e.target);
  if (!el) return;
  const action = el.dataset.action;
  const id = el.dataset.id;

  switch (action) {
    case "open-product": go("#/product/" + id); break;
    case "go-catalog": {
      const cat = el.dataset.cat || null;
      catalogState.category = cat;
      catalogState.query = "";
      go("#/catalog" + (cat ? "/" + cat : ""));
      break;
    }
    case "go": go(el.dataset.route); break;
    case "go-checkout": go("#/checkout"); break;
    case "add-cart": addToCart(id, { qty: 1, lens: LENS_OPTIONS[0] }); break;
    case "toggle-wish": toggleWish(id); break;

    // catalog
    case "toggle-filters-panel": catalogState.mobileFiltersOpen = !catalogState.mobileFiltersOpen; rerender(); break;
    case "toggle-discount-only": catalogState.discountOnly = !catalogState.discountOnly; rerender(); break;
    case "clear-filters": catalogState = { category: catalogState.category, query: "", brand: [], shape: [], material: [], gender: [], priceMax: 4500, sort: "", discountOnly: false, mobileFiltersOpen: false }; rerender(); break;

    // product detail
    case "set-active-image": pdState.activeImage = Number(el.dataset.index); rerender(); break;
    case "select-lens": pdState.lens = LENS_OPTIONS.find((l) => l.id === el.dataset.lensId); rerender(); break;
    case "select-rx-mode": pdState.rxMode = el.dataset.mode; rerender(); break;
    case "qty-inc": pdState.qty += 1; rerender(); break;
    case "qty-dec": pdState.qty = Math.max(1, pdState.qty - 1); rerender(); break;
    case "pd-add-cart": doPdAddToCart(false); break;
    case "pd-buy-now": doPdAddToCart(true); break;
    case "open-tryon": pdState.tryOnOpen = true; rerender(); break;
    case "close-tryon": pdState.tryOnOpen = false; rerender(); break;

    // cart
    case "cart-qty-inc": state.cart[Number(el.dataset.index)].qty += 1; persist("cart"); rerender(); break;
    case "cart-qty-dec": { const it = state.cart[Number(el.dataset.index)]; it.qty = Math.max(1, it.qty - 1); persist("cart"); rerender(); break; }
    case "cart-remove": state.cart.splice(Number(el.dataset.index), 1); persist("cart"); rerender(); break;
    case "cart-save-later": { const it = state.cart[Number(el.dataset.index)]; it.saved = !it.saved; persist("cart"); rerender(); break; }
    case "apply-coupon": doApplyCoupon(); break;

    // checkout
    case "checkout-next": if (validateCheckoutStep()) { checkoutState.step = Math.min(4, checkoutState.step + 1); } rerender(); break;
    case "checkout-back": checkoutState.step = Math.max(1, checkoutState.step - 1); rerender(); break;
    case "set-rx-choice": checkoutState.rxChoice = el.dataset.value; rerender(); break;
    case "set-payment": checkoutState.payment = el.dataset.value; rerender(); break;
    case "toggle-terms": checkoutState.terms = !checkoutState.terms; checkoutState.errors = {}; rerender(); break;
    case "place-order": placeOrderFlow(); break;

    // tracking
    case "track-search": doTrackSearch(); break;

    // appointment
    case "apt-submit":
  console.log("Appointment button clicked!");
  doAppointmentSubmit();
  break;

    // account
    case "auth-switch-mode": authState.mode = el.dataset.mode; authState.error = ""; rerender(); break;
    case "auth-submit": doAuthSubmit(); break;
    case "logout": state.user = null; persist("user"); go("#/"); break;

    default: break;
  }
}

function onAppChange(e) {
  const el = closestAction(e.target);
  if (!el) return;
  const action = el.dataset.action;
  switch (action) {
    case "set-sort": catalogState.sort = el.value; rerender(); break;
    case "toggle-filter": {
      const key = el.dataset.key, val = el.dataset.value;
      const arr = catalogState[key];
      const i = arr.indexOf(val);
      if (i === -1) arr.push(val); else arr.splice(i, 1);
      rerender();
      break;
    }
    case "upload-rx-file": handleFileUpload(el.files[0], (f) => { pdState.rxFile = f; rerender(); }); break;
    case "upload-checkout-rx": handleFileUpload(el.files[0], (f) => { checkoutState.rxFile = f; rerender(); }); break;
    default: break;
  }
}

function onAppInput(e) {
  const el = closestAction(e.target);
  if (!el) return;
  const action = el.dataset.action;
  switch (action) {
    case "set-price-range": catalogState.priceMax = Number(el.value); rerender(); break;
    case "set-rx-field": pdState.rx[el.dataset.field] = el.value; break; // no rerender needed, avoids caret jump
    case "set-checkout-field": checkoutState[el.dataset.group][el.dataset.field] = el.value; break;
    case "apt-field": appointmentState.form[el.dataset.field] = el.value; break;
    case "auth-field": authState.form[el.dataset.field] = el.value; break;
    default: break;
  }
}

/* ---------------- action implementations ---------------- */
function doPdAddToCart(goToCart) {
  const product = state.products.find((p) => p.id === pdState.productId);
  addToCart(product.id, {
    qty: pdState.qty,
    lens: pdState.lens,
    prescription: product.prescriptionRequired ? { mode: pdState.rxMode, data: pdState.rxMode === "manual" ? pdState.rx : null, file: pdState.rxFile ? { name: pdState.rxFile.name, type: pdState.rxFile.type, size: pdState.rxFile.size } : null } : null,
  });
  if (goToCart) go("#/cart"); else rerender();
}

function handleFileUpload(file, cb) {
  if (!file) return;
  const okTypes = ["image/jpeg", "image/png", "application/pdf"];
  if (!okTypes.includes(file.type)) { toast("Please upload a JPG, PNG or PDF file."); return; }
  if (file.size > 5 * 1024 * 1024) { toast("File is too large — max size is 5MB."); return; }
  const reader = new FileReader();
  reader.onload = () => cb({ name: file.name, type: file.type, size: file.size, dataUrl: reader.result });
  reader.onerror = () => toast("Could not read that file. Please try again.");
  reader.readAsDataURL(file);
}

async function doApplyCoupon() {
  const code = document.getElementById("couponInput").value.trim();

  if (!code) {
    couponState = {
      applied: null,
      message: "Please enter a coupon code."
    };
    rerender();
    return;
  }

  const active = state.cart.filter((c) => !c.saved);
  const subtotal = active.reduce(
    (sum, item) => sum + cartItemUnitPrice(item) * item.qty,
    0
  );

  try {
    const response = await fetch(
      `/api/coupons/${encodeURIComponent(code)}`
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      couponState = {
        applied: null,
        message: data.message || "Invalid coupon code."
      };
      rerender();
      return;
    }

    const coupon = data.coupon;

    if (subtotal < coupon.minOrder) {
      couponState = {
        applied: null,
        message: `Minimum order ${currency(coupon.minOrder)} required for ${coupon.code}.`
      };
      rerender();
      return;
    }

    couponState = {
      applied: coupon,
      message: `${coupon.code} applied — ${coupon.percent}% off.`
    };

    rerender();
  } catch (error) {
    console.error("Coupon validation error:", error);

    couponState = {
      applied: null,
      message: "Could not validate the coupon. Please try again."
    };

    rerender();
  }
}

function doTrackSearch() {
  const orderId = document.getElementById("trackOrderId").value.trim();
  const phone = document.getElementById("trackPhone").value.trim();
  trackState.orderId = orderId;
  trackState.phone = phone;
  const o = state.orders.find((o) => o.id.toLowerCase() === orderId.toLowerCase());
  if (!o) { trackState.error = "We couldn't find an order with that ID."; trackState.result = null; rerender(); return; }
  if (phone && o.info.phone !== phone) { trackState.error = "Mobile number doesn't match this order."; trackState.result = null; rerender(); return; }
  trackState.error = "";
  trackState.result = o;
  rerender();
}

async function doAppointmentSubmit() {
  console.log("doAppointmentSubmit started!");

  const f = appointmentState.form;
  const e = {};

  if (!f.name.trim()) {
    e.name = "Enter your name.";
  }

  if (!/^\d{10}$/.test(f.phone.trim())) {
    e.phone = "Enter a valid 10-digit number.";
  }

  if (!f.date) {
    e.date = "Pick a date.";
  } else {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const selectedDate = new Date(f.date + "T00:00:00");

    if (
      Number.isNaN(selectedDate.getTime()) ||
      selectedDate < today
    ) {
      e.date = "Pick a valid date from today onward.";
    }
  }

  if (!f.time) {
    e.time = "Pick a time.";
  }

  appointmentState.errors = e;

  if (Object.keys(e).length > 0) {
    rerender();
    return;
  }

  try {
    console.log("Sending appointment to backend...", f);

    const response = await fetch("/api/appointments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        customerName: f.name.trim(),
        phone: f.phone.trim(),
        appointmentDate: f.date,
        appointmentTime: f.time
      })
    });

    console.log("Backend response status:", response.status);

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(
        result.message || "Could not book your appointment."
      );
    }

    state.appointments.unshift({
      ...f,
      id: result.appointment?.appointmentCode || result.appointmentCode,
      status: "Requested"
    });

    persist("appointments");

    appointmentState.done = true;
    rerender();

    toast("Appointment requested successfully!");

  } catch (error) {
    console.error("Appointment booking error:", error);
    toast(error.message || "Could not book appointment. Please try again.");
  }
}


async function doAuthSubmit() {
  const as = authState;
  const f = as.form;
  if (as.mode === "signup") {
    if (!f.name.trim() || !/^\S+@\S+\.\S+$/.test(f.email) || f.password.length < 4) { as.error = "Fill in all fields with a valid email and a password of at least 4 characters."; rerender(); return; }
    if (state.customers.find((c) => c.email === f.email)) { as.error = "An account with this email already exists."; rerender(); return; }
    const { salt, hash } = await hashPassword(f.password);
    const newC = { name: f.name, email: f.email, phone: f.phone, passwordSalt: salt, passwordHash: hash, orders: 0, spent: 0, joined: new Date().toISOString().slice(0, 10) };
    state.customers.push(newC);
    persist("customers");
    state.user = { name: newC.name, email: newC.email, phone: newC.phone, joined: newC.joined };
    persist("user");
  } else {
    const c = state.customers.find((c) => c.email === f.email);
    if (!c) { as.error = "No account found. Try signing up instead."; rerender(); return; }
    if (!c.passwordHash) { as.error = "This account has no password set. Please sign up again."; rerender(); return; }
    const ok = await verifyPassword(f.password, c.passwordSalt, c.passwordHash);
    if (!ok) { as.error = "Incorrect password."; rerender(); return; }
    state.user = { name: c.name, email: c.email, phone: c.phone, joined: c.joined };
    persist("user");
  }
  as.error = "";
  as.form = { name: "", email: "", phone: "", password: "" };
  go("#/account");
}