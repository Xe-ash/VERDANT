/**
 * VERDANT — Organic Plant Nursery
 * Native Node.js HTTP server + JSON API. No dependencies, no frameworks.
 *
 *   node server.js
 *   http://localhost:3000          customer store
 *   http://localhost:3000/admin.html  administration panel
 *
 * Modules used: http, fs, path, url, crypto — nothing else.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const url = require('url');
const crypto = require('crypto');

/* ============================================================
   01. CONFIGURATION
   ============================================================ */
const ROOT = __dirname;
// Hosted platforms often mount a separate volume for writable files.
// Set VERDANT_DATA_DIR (e.g. /var/data) to keep orders across redeploys.
const DATA_DIR = process.env.VERDANT_DATA_DIR
  ? path.resolve(process.env.VERDANT_DATA_DIR)
  : path.join(ROOT, 'data');
const PUBLIC_DIR = ROOT;
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const MAX_BODY_BYTES = 64 * 1024;          // request body cap
const SESSION_TTL_MS = 1000 * 60 * 60 * 2; // 2 hours
const LOGIN_WINDOW_MS = 1000 * 60 * 10;    // 10 min window for throttling
const LOGIN_MAX_ATTEMPTS = 8;

const SESSION_COOKIE = 'verdant_admin_session';

/** Business rules — the server is the single source of truth for pricing. */
const RULES = {
  currency: '₹',
  freeDeliveryThreshold: 999,
  deliveryFee: 79,
  discountThreshold: 1500,
  discountRate: 0.10,
  discountCap: 200,
  maxQty: 10,
  maxLineItems: 40,
  orderPrefix: 'VER',
  orderStart: 1001
};

const ORDER_STATUSES = ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
const CONTACT_STATUSES = ['New', 'Reviewed', 'Resolved'];
const PAYMENT_METHODS = { cod: 'Cash on Delivery (demo)', upi: 'UPI (demo)', card: 'Card payment (demo)' };

const STATES = ['Punjab', 'Chandigarh', 'Delhi', 'Haryana', 'Himachal Pradesh', 'Jammu & Kashmir', 'Ladakh',
  'Uttar Pradesh', 'Uttarakhand', 'Rajasthan', 'Gujarat', 'Maharashtra', 'Goa', 'Karnataka', 'Kerala', 'Tamil Nadu',
  'Telangana', 'Andhra Pradesh', 'Madhya Pradesh', 'Chhattisgarh', 'Odisha', 'West Bengal', 'Bihar', 'Jharkhand',
  'Assam', 'Sikkim', 'Meghalaya', 'Tripura', 'Manipur', 'Mizoram', 'Nagaland', 'Arunachal Pradesh', 'Puducherry',
  'Andaman & Nicobar Islands', 'Lakshadweep', 'Dadra & Nagar Haveli and Daman & Diu'];

/* ============================================================
   02. SMALL HELPERS
   ============================================================ */
const nowISO = () => new Date().toISOString();
const uid = (prefix) => `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`;
const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Strip control characters and collapse whitespace; used on every string input. */
function clean(value, maxLen) {
  if (typeof value !== 'string') return '';
  const stripped = value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
  return maxLen ? stripped.slice(0, maxLen) : stripped;
}

function isEmail(value) {
  return typeof value === 'string' && value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

function isIndianPhone(value) {
  return /^[6-9]\d{9}$/.test(String(value).replace(/[\s-]/g, ''));
}

/* ============================================================
   03. SAFE JSON STORAGE
   Writes are serialised through a per-file promise chain so two
   concurrent requests can never interleave and corrupt a file.
   Every write goes to a temp file first, then is renamed into
   place — a crash mid-write leaves the previous file intact.
   ============================================================ */
const writeChains = new Map();

function defaultData() {
  return {
    'products.json': { products: [] },
    'orders.json': { orders: [], lastOrderNumber: RULES.orderStart - 1 },
    'contacts.json': { contacts: [] },
    'subscribers.json': { subscribers: [] }
  };
}

async function ensureDataFiles() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  const defaults = defaultData();
  for (const [file, fallback] of Object.entries(defaults)) {
    const full = path.join(DATA_DIR, file);
    try {
      await fsp.access(full);
    } catch {
      // Products are seeded from the shipped catalogue if the file is absent.
      // The seed may live in DATA_DIR (local run) or in the app directory
      // (hosted run, where DATA_DIR is an empty mounted volume).
      let seed = fallback;
      if (file === 'products.json') {
        const candidates = [
          path.join(DATA_DIR, 'products.seed.json'),
          path.join(ROOT, 'data', 'products.seed.json'),
          path.join(ROOT, 'products.seed.json'),
          path.join(ROOT, 'data', 'products.json')
        ];
        seed = { products: [] };
        for (const candidate of candidates) {
          try {
            const parsed = JSON.parse(await fsp.readFile(candidate, 'utf8'));
            if (Array.isArray(parsed.products) && parsed.products.length) {
              seed = parsed;
              break;
            }
          } catch {
            /* try the next candidate */
          }
        }
        if (!seed.products.length) {
          log('products.seed.json not found — the catalogue will be empty.', 'warn');
        }
      }
      await fsp.writeFile(full, JSON.stringify(seed, null, 2), 'utf8');
      log(`created ${file}`);
    }
  }
}

async function readJSON(file, fallback) {
  const full = path.join(DATA_DIR, file);
  try {
    const raw = await fsp.readFile(full, 'utf8');
    if (!raw.trim()) return fallback;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch (err) {
    if (err.code !== 'ENOENT') log(`warning: ${file} could not be parsed (${err.message}) — using empty set`, 'warn');
    return fallback;
  }
}

/** Serialised, atomic write. Returns a promise that resolves once durable. */
function writeJSON(file, data) {
  const full = path.join(DATA_DIR, file);
  const previous = writeChains.get(file) || Promise.resolve();
  const next = previous
    .catch(() => {}) // one failed write must not poison the chain
    .then(async () => {
      const tmp = `${full}.${process.pid}.${Date.now()}.tmp`;
      const payload = JSON.stringify(data, null, 2);
      await fsp.writeFile(tmp, payload, 'utf8');
      await fsp.rename(tmp, full);
    });
  writeChains.set(file, next);
  return next;
}

async function readProducts() {
  const doc = await readJSON('products.json', { products: [] });
  return Array.isArray(doc.products) ? doc.products : [];
}

/* ============================================================
   04. PRICING — computed on the server, never trusted from the client
   ============================================================ */
function totalsFor(lines) {
  const subtotal = lines.reduce((sum, l) => sum + l.price * l.qty, 0);
  const delivery = lines.length === 0 || subtotal >= RULES.freeDeliveryThreshold ? 0 : RULES.deliveryFee;
  const discount = subtotal >= RULES.discountThreshold
    ? Math.min(Math.round(subtotal * RULES.discountRate), RULES.discountCap)
    : 0;
  const total = Math.max(0, subtotal + delivery - discount);
  return { subtotal, delivery, discount, total };
}

/* ============================================================
   05. VALIDATION
   ============================================================ */
function validateOrderInput(body, products) {
  const errors = {};
  const byId = new Map(products.map((p) => [p.id, p]));

  const c = body && typeof body.customer === 'object' && body.customer ? body.customer : {};

  const name = clean(c.name, 80);
  if (name.length < 2) errors.name = 'Please enter your full name (at least 2 characters).';

  const email = clean(c.email, 254).toLowerCase();
  if (!isEmail(email)) errors.email = 'Enter a valid email address.';

  const phoneRaw = clean(c.phone, 20);
  if (!isIndianPhone(phoneRaw)) errors.phone = 'Enter a valid 10-digit Indian mobile number.';
  const phone = phoneRaw.replace(/[\s-]/g, '');

  const street = clean(c.street, 160);
  if (street.length < 5) errors.street = 'Please enter your house number and street.';

  const city = clean(c.city, 60);
  if (city.length < 2) errors.city = 'Please enter your city.';

  const state = clean(c.state, 60);
  if (!STATES.includes(state)) errors.state = 'Please select a valid state.';

  const pin = clean(c.pin, 6);
  if (!/^[1-9]\d{5}$/.test(pin)) errors.pin = 'Enter a valid 6-digit PIN code.';

  const notes = clean(c.notes, 500);

  // ----- line items -----
  const rawItems = body && Array.isArray(body.items) ? body.items : [];
  if (rawItems.length === 0) errors.items = 'Your cart is empty.';
  if (rawItems.length > RULES.maxLineItems) errors.items = 'Too many distinct items in one order.';

  const lines = [];
  const seen = new Set();
  for (const raw of rawItems) {
    const id = clean(raw && raw.id, 60);
    const product = byId.get(id);
    if (!product) {
      errors.items = `One of the products in your cart is no longer available (${id || 'unknown'}).`;
      continue;
    }
    if (seen.has(id)) {
      errors.items = 'Duplicate product lines are not allowed.';
      continue;
    }
    seen.add(id);

    const qty = Number(raw && raw.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > RULES.maxQty) {
      errors.items = `Quantity for ${product.name} must be between 1 and ${RULES.maxQty}.`;
      continue;
    }
    if (product.inStock === false) {
      errors.items = `${product.name} is currently unavailable.`;
      continue;
    }
    if (Number.isFinite(product.stock) && qty > product.stock) {
      errors.items = `Only ${product.stock} × ${product.name} left in stock.`;
      continue;
    }

    lines.push({
      id: product.id,
      name: product.name,
      sci: product.sci || '',
      img: product.img || '',
      qty,
      // Price is taken from the database, never from the request body.
      price: round2(product.price),
      lineTotal: round2(product.price * qty)
    });
  }

  // ----- payment method -----
  const paymentKey = clean(body && body.paymentMethod, 12).toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(PAYMENT_METHODS, paymentKey)) {
    errors.paymentMethod = 'Please choose a valid payment method.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    customer: { name, email, phone, street, city, state, pin, notes },
    lines,
    paymentKey
  };
}

function validateContactInput(body) {
  const errors = {};
  const name = clean(body && body.name, 80);
  if (name.length < 2) errors.name = 'Please enter your name.';

  const email = clean(body && body.email, 254).toLowerCase();
  if (!isEmail(email)) errors.email = 'Enter a valid email address.';

  const phoneRaw = clean(body && body.phone, 20);
  const phone = phoneRaw.replace(/[\s-]/g, '');
  if (phoneRaw && !isIndianPhone(phone)) errors.phone = 'Enter a valid 10-digit mobile number, or leave it blank.';

  const subject = clean(body && body.subject, 120);
  if (!subject) errors.subject = 'Please choose a subject.';

  const message = clean(body && body.message, 2000);
  if (message.length < 10) errors.message = 'Please add a little more detail (at least 10 characters).';

  return { valid: Object.keys(errors).length === 0, errors, value: { name, email, phone, subject, message } };
}

/* ============================================================
   06. HTTP PLUMBING
   ============================================================ */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8'
};

function sendJSON(res, status, payload, extraHeaders) {
  const body = JSON.stringify(payload);
  const headers = Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  }, extraHeaders || {});
  res.writeHead(status, headers);
  res.end(body);
}

function sendError(res, status, message, extra) {
  sendJSON(res, status, Object.assign({ success: false, message }, extra || {}));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let aborted = false;
    const chunks = [];
    req.on('data', (chunk) => {
      if (aborted) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        aborted = true;
        // Stop reading but let the handler answer with a clean 413 — do not
        // destroy the socket, or the client sees a dropped connection instead.
        req.pause();
        chunks.length = 0;
        reject(Object.assign(new Error('Request body is too large (64 KB maximum).'), { statusCode: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) return resolve({});
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return reject(Object.assign(new Error('Body must be a JSON object'), { statusCode: 400 }));
        }
        resolve(parsed);
      } catch {
        reject(Object.assign(new Error('Invalid JSON'), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx < 0) return;
    out[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
  });
  return out;
}

/* ============================================================
   07. AUTHENTICATION — scrypt password check + opaque session tokens
   The password never leaves the server: the administrator supplies it
   through ADMIN_USERNAME / ADMIN_PASSWORD environment variables, and it
   is compared with crypto.timingSafeEqual against a freshly derived hash.
   ============================================================ */
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const CREDENTIALS_READY = ADMIN_USERNAME.length > 0 && ADMIN_PASSWORD.length >= 8;

const sessions = new Map();   // token -> { username, expiresAt, createdAt }
const loginAttempts = new Map(); // ip -> { count, first }

function scryptHash(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, derived) => {
      if (err) reject(err); else resolve(derived);
    });
  });
}

/** Constant-time comparison of the submitted password against the configured one. */
async function verifyPassword(submitted) {
  if (!CREDENTIALS_READY) return false;
  const salt = crypto.randomBytes(16);
  // Derive both sides with the same salt so timingSafeEqual can compare equal lengths.
  const [submittedHash, expectedHash] = await Promise.all([
    scryptHash(String(submitted), salt),
    scryptHash(ADMIN_PASSWORD, salt)
  ]);
  return crypto.timingSafeEqual(submittedHash, expectedHash);
}

function verifyUsername(submitted) {
  const a = Buffer.from(String(submitted));
  const b = Buffer.from(ADMIN_USERNAME);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function createSession(username) {
  const token = crypto.randomBytes(32).toString('base64url');
  const record = {
    username,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS
  };
  sessions.set(token, record);
  return { token, record };
}

function getSession(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const record = sessions.get(token);
  if (!record) return null;
  if (record.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return { token, record };
}

/** True when the browser reached us over HTTPS (directly or via a PaaS proxy). */
function isHttps(req) {
  const proto = String((req && req.headers && req.headers['x-forwarded-proto']) || '').split(',')[0].trim();
  if (proto) return proto === 'https';
  return Boolean(req && req.socket && req.socket.encrypted);
}

function sessionCookie(token, maxAgeSeconds, secure) {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAgeSeconds}`
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function clearCookie() {
  const secure = arguments.length > 1 && arguments[1] ? '; Secure' : '';
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

/** Origin check for state-changing admin requests — blocks cross-site form posts. */
function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // same-origin fetch in some browsers omits Origin on GET
  try {
    const parsed = new URL(origin);
    const host = req.headers.host || `localhost:${PORT}`;
    return parsed.host === host;
  } catch {
    return false;
  }
}

function requireAdmin(req, res) {
  const session = getSession(req);
  if (!session) {
    sendError(res, 401, 'Authentication required.');
    return null;
  }
  return session;
}

function loginThrottled(ip) {
  const entry = loginAttempts.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.first > LOGIN_WINDOW_MS) {
    loginAttempts.delete(ip);
    return false;
  }
  return entry.count >= LOGIN_MAX_ATTEMPTS;
}

function noteLoginFailure(ip) {
  const entry = loginAttempts.get(ip);
  if (!entry || Date.now() - entry.first > LOGIN_WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, first: Date.now() });
  } else {
    entry.count += 1;
  }
}

// Periodic sweep so expired sessions and stale throttle entries do not accumulate.
setInterval(() => {
  const now = Date.now();
  for (const [token, record] of sessions) if (record.expiresAt <= now) sessions.delete(token);
  for (const [ip, entry] of loginAttempts) if (now - entry.first > LOGIN_WINDOW_MS) loginAttempts.delete(ip);
}, 60 * 1000).unref();

/* ============================================================
   08. API HANDLERS — public
   ============================================================ */
async function handleProductsList(req, res) {
  const products = await readProducts();
  sendJSON(res, 200, {
    success: true,
    count: products.length,
    rules: RULES,
    products
  });
}

async function handleProductOne(req, res, id) {
  const products = await readProducts();
  const product = products.find((p) => p.id === id);
  if (!product) return sendError(res, 404, 'Product not found.');
  sendJSON(res, 200, { success: true, product });
}

async function handleCreateOrder(req, res) {
  let body;
  try {
    body = await readBody(req);
  } catch (err) {
    return sendError(res, err.statusCode || 400, err.message || 'Could not read request body.');
  }

  const products = await readProducts();
  if (!products.length) return sendError(res, 503, 'The catalogue is unavailable. Please try again shortly.');

  const check = validateOrderInput(body, products);
  if (!check.valid) {
    return sendJSON(res, 422, {
      success: false,
      message: 'Please check the highlighted fields.',
      errors: check.errors
    });
  }

  const totals = totalsFor(check.lines);

  // Order number: persisted counter, so restarts never reuse an ID.
  const store = await readJSON('orders.json', { orders: [], lastOrderNumber: RULES.orderStart - 1 });
  const orders = Array.isArray(store.orders) ? store.orders : [];
  const nextNumber = Math.max(
    Number(store.lastOrderNumber) || RULES.orderStart - 1,
    RULES.orderStart - 1
  ) + 1;
  const year = new Date().getFullYear();
  const orderId = `${RULES.orderPrefix}-${year}-${nextNumber}`;

  const order = {
    orderId,
    orderNumber: nextNumber,
    customer: check.customer,
    items: check.lines,
    itemCount: check.lines.reduce((n, l) => n + l.qty, 0),
    totals,
    payment: {
      method: check.paymentKey,
      label: PAYMENT_METHODS[check.paymentKey],
      status: 'Demonstration only — no payment was taken',
      cardStored: false
    },
    status: 'Pending',
    createdAt: nowISO(),
    updatedAt: nowISO(),
    statusHistory: [{ status: 'Pending', at: nowISO(), by: 'system' }],
    source: 'website'
  };

  // A stable customer id derived from the email, so repeat buyers group together.
  order.customerId = 'CUS-' + crypto.createHash('sha256')
    .update(check.customer.email).digest('hex').slice(0, 8).toUpperCase();

  // Recompute the last order number from existing records as a safety net.
  const existingMax = orders.reduce((max, o) => Math.max(max, Number(o.orderNumber) || 0), 0);
  const finalNumber = Math.max(nextNumber, existingMax + 1);
  if (finalNumber !== nextNumber) {
    order.orderNumber = finalNumber;
    order.orderId = `${RULES.orderPrefix}-${year}-${finalNumber}`;
  }

  const nextOrders = [order, ...orders];
  try {
    await writeJSON('orders.json', { orders: nextOrders, lastOrderNumber: order.orderNumber });
  } catch (err) {
    log(`failed to persist order: ${err.message}`, 'error');
    return sendError(res, 500, 'We could not save your order. Please try again.');
  }

  log(`order ${order.orderId} saved · ${check.lines.length} line(s) · ${RULES.currency}${totals.total}`);
  sendJSON(res, 201, {
    success: true,
    message: 'Order placed successfully',
    orderId: order.orderId,
    order: {
      orderId: order.orderId,
      createdAt: order.createdAt,
      status: order.status,
      items: order.items,
      totals: order.totals,
      payment: order.payment,
      customer: {
        name: order.customer.name,
        email: order.customer.email,
        phone: order.customer.phone,
        street: order.customer.street,
        city: order.customer.city,
        state: order.customer.state,
        pin: order.customer.pin,
        notes: order.customer.notes
      }
    }
  });
}

async function handleContactSubmit(req, res) {
  let body;
  try {
    body = await readBody(req);
  } catch (err) {
    return sendError(res, err.statusCode || 400, err.message || 'Could not read request body.');
  }

  const check = validateContactInput(body);
  if (!check.valid) {
    return sendJSON(res, 422, {
      success: false,
      message: 'Please check the highlighted fields.',
      errors: check.errors
    });
  }

  const store = await readJSON('contacts.json', { contacts: [] });
  const contacts = Array.isArray(store.contacts) ? store.contacts : [];
  const entry = {
    id: uid('msg'),
    ...check.value,
    status: 'New',
    createdAt: nowISO(),
    updatedAt: nowISO()
  };
  contacts.unshift(entry);

  try {
    await writeJSON('contacts.json', { contacts });
  } catch (err) {
    log(`failed to save contact message: ${err.message}`, 'error');
    return sendError(res, 500, 'We could not save your message. Please try again.');
  }

  log(`contact message saved from ${entry.email}`);
  sendJSON(res, 201, {
    success: true,
    message: 'Your message was saved. This is a demonstration store, so no email was sent.',
    id: entry.id
  });
}

async function handleNewsletterSubmit(req, res) {
  let body;
  try {
    body = await readBody(req);
  } catch (err) {
    return sendError(res, err.statusCode || 400, err.message || 'Could not read request body.');
  }

  const email = clean(body && body.email, 254).toLowerCase();
  if (!isEmail(email)) {
    return sendJSON(res, 422, {
      success: false,
      message: 'Enter a valid email address.',
      errors: { email: 'Enter a valid email address.' }
    });
  }

  const store = await readJSON('subscribers.json', { subscribers: [] });
  const subscribers = Array.isArray(store.subscribers) ? store.subscribers : [];

  if (subscribers.some((s) => s.email === email)) {
    return sendJSON(res, 409, {
      success: false,
      duplicate: true,
      message: 'That email is already subscribed.'
    });
  }

  const entry = { id: uid('sub'), email, createdAt: nowISO() };
  subscribers.unshift(entry);

  try {
    await writeJSON('subscribers.json', { subscribers });
  } catch (err) {
    log(`failed to save subscriber: ${err.message}`, 'error');
    return sendError(res, 500, 'We could not save your subscription. Please try again.');
  }

  log(`newsletter subscriber saved: ${email}`);
  sendJSON(res, 201, {
    success: true,
    message: 'You are on the list. This is a demonstration store, so no emails will be sent.',
    subscriber: { email: entry.email, createdAt: entry.createdAt }
  });
}

/* ============================================================
   09. API HANDLERS — admin authentication
   ============================================================ */
async function handleAdminLogin(req, res) {
  if (!originAllowed(req)) return sendError(res, 403, 'Origin not allowed.');
  if (!CREDENTIALS_READY) {
    return sendError(res, 503,
      'Administrator credentials are not configured. Set ADMIN_USERNAME and ADMIN_PASSWORD, then restart the server.');
  }

  const ip = req.socket.remoteAddress || 'unknown';
  if (loginThrottled(ip)) {
    return sendError(res, 429, 'Too many attempts. Please wait a few minutes and try again.');
  }

  let body;
  try {
    body = await readBody(req);
  } catch (err) {
    return sendError(res, err.statusCode || 400, err.message || 'Could not read request body.');
  }

  const username = clean(body && body.username, 120);
  const password = typeof (body && body.password) === 'string' ? body.password : '';

  if (!username || !password) {
    noteLoginFailure(ip);
    // Deliberately generic: never reveal which half was wrong.
    return sendError(res, 401, 'Invalid username or password.');
  }

  const userOk = verifyUsername(username);
  const passOk = await verifyPassword(password);
  if (!userOk || !passOk) {
    noteLoginFailure(ip);
    return sendError(res, 401, 'Invalid username or password.');
  }

  loginAttempts.delete(ip);
  const { token, record } = createSession(username);
  sendJSON(res, 200, {
    success: true,
    message: 'Signed in.',
    user: { username: record.username, expiresAt: new Date(record.expiresAt).toISOString() }
  }, { 'Set-Cookie': sessionCookie(token, Math.floor(SESSION_TTL_MS / 1000), isHttps(req)) });
}

async function handleAdminLogout(req, res) {
  if (!originAllowed(req)) return sendError(res, 403, 'Origin not allowed.');
  const token = parseCookies(req)[SESSION_COOKIE];
  if (token) sessions.delete(token);
  sendJSON(res, 200, { success: true, message: 'Signed out.' }, { 'Set-Cookie': clearCookie(isHttps(req)) });
}

async function handleAdminSession(req, res) {
  const session = getSession(req);
  if (!session) return sendJSON(res, 200, { success: true, authenticated: false });
  sendJSON(res, 200, {
    success: true,
    authenticated: true,
    user: {
      username: session.record.username,
      expiresAt: new Date(session.record.expiresAt).toISOString()
    }
  });
}

/* ============================================================
   10. API HANDLERS — admin dashboard & orders
   ============================================================ */
async function handleAdminDashboard(req, res) {
  const [orderStore, contactStore, subStore, products] = await Promise.all([
    readJSON('orders.json', { orders: [] }),
    readJSON('contacts.json', { contacts: [] }),
    readJSON('subscribers.json', { subscribers: [] }),
    readProducts()
  ]);

  const orders = Array.isArray(orderStore.orders) ? orderStore.orders : [];
  const contacts = Array.isArray(contactStore.contacts) ? contactStore.contacts : [];
  const subscribers = Array.isArray(subStore.subscribers) ? subStore.subscribers : [];

  const customers = new Set(orders.map((o) => (o.customer && o.customer.email) || '').filter(Boolean));
  const revenue = orders
    .filter((o) => o.status !== 'Cancelled')
    .reduce((sum, o) => sum + (Number(o.totals && o.totals.total) || 0), 0);

  const byStatus = {};
  ORDER_STATUSES.forEach((s) => { byStatus[s] = 0; });
  orders.forEach((o) => { byStatus[o.status] = (byStatus[o.status] || 0) + 1; });

  const recent = orders.slice(0, 5).map((o) => ({
    orderId: o.orderId,
    name: o.customer.name,
    total: o.totals.total,
    status: o.status,
    createdAt: o.createdAt
  }));

  sendJSON(res, 200, {
    success: true,
    stats: {
      totalOrders: orders.length,
      totalCustomers: customers.size,
      totalProducts: products.length,
      totalMessages: contacts.length,
      newMessages: contacts.filter((c) => c.status === 'New').length,
      totalSubscribers: subscribers.length,
      totalOrderValue: round2(revenue),
      currency: RULES.currency
    },
    byStatus,
    recent
  });
}

function publicAdminOrder(o) {
  return {
    orderId: o.orderId,
    orderNumber: o.orderNumber,
    customerId: o.customerId,
    customer: o.customer,
    items: o.items,
    itemCount: o.itemCount,
    totals: o.totals,
    payment: o.payment,
    status: o.status,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    statusHistory: o.statusHistory || []
  };
}

async function handleAdminOrders(req, res, query) {
  const store = await readJSON('orders.json', { orders: [] });
  let orders = (Array.isArray(store.orders) ? store.orders : []).map(publicAdminOrder);

  const status = clean(query.get('status'), 20);
  if (status && status !== 'all' && ORDER_STATUSES.includes(status)) {
    orders = orders.filter((o) => o.status === status);
  }

  const search = clean(query.get('q'), 80).toLowerCase();
  if (search) {
    orders = orders.filter((o) => {
      const c = o.customer || {};
      return [o.orderId, c.name, c.email, c.phone]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(search));
    });
  }

  const from = clean(query.get('from'), 10);
  const to = clean(query.get('to'), 10);
  if (from) orders = orders.filter((o) => o.createdAt.slice(0, 10) >= from);
  if (to) orders = orders.filter((o) => o.createdAt.slice(0, 10) <= to);

  const sort = clean(query.get('sort'), 20) || 'newest';
  if (sort === 'value') orders.sort((a, b) => b.totals.total - a.totals.total);
  else if (sort === 'oldest') orders.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  else orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  sendJSON(res, 200, { success: true, count: orders.length, orders });
}

async function handleAdminOrderOne(req, res, orderId) {
  const store = await readJSON('orders.json', { orders: [] });
  const orders = Array.isArray(store.orders) ? store.orders : [];
  const order = orders.find((o) => o.orderId === orderId);
  if (!order) return sendError(res, 404, 'Order not found.');

  // Purchase history for the same customer, newest first, excluding this order.
  const history = orders
    .filter((o) => o.customerId === order.customerId && o.orderId !== order.orderId)
    .map((o) => ({
      orderId: o.orderId,
      createdAt: o.createdAt,
      total: o.totals.total,
      status: o.status,
      itemCount: o.itemCount
    }));

  sendJSON(res, 200, { success: true, order: publicAdminOrder(order), history });
}

async function handleAdminOrderStatus(req, res, orderId) {
  if (!originAllowed(req)) return sendError(res, 403, 'Origin not allowed.');

  let body;
  try {
    body = await readBody(req);
  } catch (err) {
    return sendError(res, err.statusCode || 400, err.message || 'Could not read request body.');
  }

  const status = clean(body && body.status, 20);
  if (!ORDER_STATUSES.includes(status)) {
    return sendError(res, 422, `Status must be one of: ${ORDER_STATUSES.join(', ')}.`);
  }

  const store = await readJSON('orders.json', { orders: [] });
  const orders = Array.isArray(store.orders) ? store.orders : [];
  const index = orders.findIndex((o) => o.orderId === orderId);
  if (index === -1) return sendError(res, 404, 'Order not found.');

  const order = orders[index];
  if (order.status === status) {
    return sendJSON(res, 200, { success: true, message: 'Status unchanged.', order: publicAdminOrder(order) });
  }

  order.status = status;
  order.updatedAt = nowISO();
  order.statusHistory = Array.isArray(order.statusHistory) ? order.statusHistory : [];
  order.statusHistory.push({ status, at: order.updatedAt, by: 'admin' });
  orders[index] = order;

  try {
    await writeJSON('orders.json', { orders, lastOrderNumber: store.lastOrderNumber });
  } catch (err) {
    log(`failed to update order status: ${err.message}`, 'error');
    return sendError(res, 500, 'Could not save the status change.');
  }

  log(`order ${orderId} → ${status}`);
  sendJSON(res, 200, { success: true, message: `Order marked ${status}.`, order: publicAdminOrder(order) });
}

/* ============================================================
   11. API HANDLERS — contacts & subscribers
   ============================================================ */
async function handleAdminContacts(req, res) {
  const store = await readJSON('contacts.json', { contacts: [] });
  const contacts = Array.isArray(store.contacts) ? store.contacts : [];
  const counts = { New: 0, Reviewed: 0, Resolved: 0 };
  contacts.forEach((c) => { counts[c.status] = (counts[c.status] || 0) + 1; });
  sendJSON(res, 200, { success: true, count: contacts.length, counts, contacts });
}

async function handleAdminContactStatus(req, res, contactId) {
  if (!originAllowed(req)) return sendError(res, 403, 'Origin not allowed.');

  let body;
  try {
    body = await readBody(req);
  } catch (err) {
    return sendError(res, err.statusCode || 400, err.message || 'Could not read request body.');
  }

  const status = clean(body && body.status, 20);
  if (!CONTACT_STATUSES.includes(status)) {
    return sendError(res, 422, `Status must be one of: ${CONTACT_STATUSES.join(', ')}.`);
  }

  const store = await readJSON('contacts.json', { contacts: [] });
  const contacts = Array.isArray(store.contacts) ? store.contacts : [];
  const index = contacts.findIndex((c) => c.id === contactId);
  if (index === -1) return sendError(res, 404, 'Message not found.');

  contacts[index].status = status;
  contacts[index].updatedAt = nowISO();

  try {
    await writeJSON('contacts.json', { contacts });
  } catch (err) {
    log(`failed to update contact status: ${err.message}`, 'error');
    return sendError(res, 500, 'Could not save the status change.');
  }

  sendJSON(res, 200, { success: true, message: `Message marked ${status}.`, contact: contacts[index] });
}

async function handleAdminSubscribers(req, res) {
  const store = await readJSON('subscribers.json', { subscribers: [] });
  const subscribers = Array.isArray(store.subscribers) ? store.subscribers : [];
  sendJSON(res, 200, { success: true, count: subscribers.length, subscribers });
}

/* ============================================================
   12. API HANDLERS — product management
   ============================================================ */
const PRODUCT_REQUIRED = ['id', 'name', 'category', 'price'];

function slugify(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

function validateProductInput(body, existing) {
  const errors = {};
  const name = clean(body && body.name, 120);
  if (name.length < 2) errors.name = 'Product name is required.';

  const price = Number(body && body.price);
  if (!Number.isFinite(price) || price <= 0 || price > 500000) errors.price = 'Price must be a positive number.';

  const originalPrice = body && body.originalPrice !== undefined && body.originalPrice !== ''
    ? Number(body.originalPrice) : price;
  if (!Number.isFinite(originalPrice) || originalPrice < price) {
    errors.originalPrice = 'Original price cannot be lower than the selling price.';
  }

  const category = clean(body && body.category, 40);
  if (!category) errors.category = 'Category is required.';

  const stock = body && body.stock !== undefined && body.stock !== '' ? Number(body.stock) : 0;
  if (!Number.isInteger(stock) || stock < 0 || stock > 100000) errors.stock = 'Stock must be a whole number of 0 or more.';

  const id = existing ? existing.id : (clean(body && body.id, 60) ? slugify(body.id) : slugify(name));
  if (!id) errors.id = 'A product id could not be generated from that name.';

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    id,
    value: {
      name,
      category,
      price: round2(price),
      originalPrice: round2(originalPrice),
      stock,
      inStock: body && body.inStock !== undefined ? Boolean(body.inStock) : stock > 0,
      desc: clean(body && body.desc, 500),
      sci: clean(body && body.sci, 120),
      img: clean(body && body.img, 300),
      difficulty: clean(body && body.difficulty, 30) || 'Easy',
      maintenance: clean(body && body.maintenance, 30) || 'Low',
      water: clean(body && body.water, 20) || 'weekly',
      size: clean(body && body.size, 20) || 'Medium',
      kind: clean(body && body.kind, 20) || 'plant',
      organic: clean(body && body.organic, 40) || 'Organic-inspired',
      bestseller: Boolean(body && body.bestseller),
      featured: Boolean(body && body.featured)
    }
  };
}

async function handleAdminProductsList(req, res) {
  const products = await readProducts();
  sendJSON(res, 200, { success: true, count: products.length, products });
}

async function handleAdminProductCreate(req, res) {
  if (!originAllowed(req)) return sendError(res, 403, 'Origin not allowed.');

  let body;
  try {
    body = await readBody(req);
  } catch (err) {
    return sendError(res, err.statusCode || 400, err.message || 'Could not read request body.');
  }

  const check = validateProductInput(body, null);
  if (!check.valid) {
    return sendJSON(res, 422, { success: false, message: 'Please check the product fields.', errors: check.errors });
  }

  const products = await readProducts();
  if (products.some((p) => p.id === check.id)) {
    return sendError(res, 409, 'A product with that id already exists.');
  }

  const product = Object.assign({ id: check.id, rating: 0, reviews: 0, collections: [], tags: [] }, check.value);
  products.push(product);

  try {
    await writeJSON('products.json', { products });
  } catch (err) {
    log(`failed to create product: ${err.message}`, 'error');
    return sendError(res, 500, 'Could not save the product.');
  }

  log(`product created: ${check.id}`);
  sendJSON(res, 201, { success: true, message: 'Product created.', product });
}

async function handleAdminProductUpdate(req, res, productId) {
  if (!originAllowed(req)) return sendError(res, 403, 'Origin not allowed.');

  let body;
  try {
    body = await readBody(req);
  } catch (err) {
    return sendError(res, err.statusCode || 400, err.message || 'Could not read request body.');
  }

  const products = await readProducts();
  const index = products.findIndex((p) => p.id === productId);
  if (index === -1) return sendError(res, 404, 'Product not found.');

  const existing = products[index];
  // Partial update: merge incoming values over the existing record before validating.
  const merged = Object.assign({}, existing, body);
  const check = validateProductInput(merged, existing);
  if (!check.valid) {
    return sendJSON(res, 422, { success: false, message: 'Please check the product fields.', errors: check.errors });
  }

  products[index] = Object.assign({}, existing, check.value);
  try {
    await writeJSON('products.json', { products });
  } catch (err) {
    log(`failed to update product: ${err.message}`, 'error');
    return sendError(res, 500, 'Could not save the product.');
  }

  log(`product updated: ${productId}`);
  sendJSON(res, 200, { success: true, message: 'Product updated.', product: products[index] });
}

async function handleAdminProductDelete(req, res, productId) {
  if (!originAllowed(req)) return sendError(res, 403, 'Origin not allowed.');

  const products = await readProducts();
  const index = products.findIndex((p) => p.id === productId);
  if (index === -1) return sendError(res, 404, 'Product not found.');

  const [removed] = products.splice(index, 1);
  try {
    await writeJSON('products.json', { products });
  } catch (err) {
    log(`failed to delete product: ${err.message}`, 'error');
    return sendError(res, 500, 'Could not remove the product.');
  }

  log(`product removed: ${productId}`);
  sendJSON(res, 200, { success: true, message: `Removed ${removed.name}.`, id: productId });
}

/* ============================================================
   13. STATIC FILE SERVING — restricted, traversal-safe
   Only an explicit allowlist of extensions is served, and only from
   within the project root. data/, server.js and dotfiles are never
   reachable, even by guessing a path.
   ============================================================ */
const STATIC_ALLOW_EXT = new Set(['.html', '.css', '.js', '.json', '.jpg', '.jpeg', '.png', '.svg', '.webp', '.ico', '.txt', '.md']);
const STATIC_DENY_PREFIX = ['/data/', '/node_modules/', '/.git/'];
const STATIC_DENY_FILES = new Set(['/server.js', '/.gitignore', '/.env', '/package.json', '/package-lock.json']);

/** Resolve a URL path to a real file inside ROOT, or return null. */
function resolveStatic(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null; // malformed percent-encoding
  }
  if (decoded.includes('\0')) return null;
  if (decoded.startsWith('/data/') || decoded === '/data') return null;

  const normalised = path.posix.normalize(decoded);
  if (normalised.startsWith('/..') || normalised.includes('/../')) return null;

  const rel = normalised === '/' ? '/index.html' : normalised;
  if (STATIC_DENY_FILES.has(rel)) return null;
  if (STATIC_DENY_PREFIX.some((p) => rel.startsWith(p))) return null;
  if (rel.split('/').some((seg) => seg.startsWith('.') && seg !== '')) return null; // dotfiles

  const ext = path.extname(rel).toLowerCase();
  if (!STATIC_ALLOW_EXT.has(ext)) return null;

  const full = path.join(ROOT, rel);
  // Final guard: the resolved path must still live inside ROOT.
  const relative = path.relative(ROOT, full);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;

  return full;
}

async function serveStatic(req, res, urlPath) {
  const full = resolveStatic(urlPath);
  if (!full) return sendError(res, 404, 'Not found.');

  try {
    const stat = await fsp.stat(full);
    if (!stat.isFile()) return sendError(res, 404, 'Not found.');

    const ext = path.extname(full).toLowerCase();
    const etag = `W/"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`;
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, { ETag: etag });
      return res.end();
    }

    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
      'ETag': etag,
      'X-Content-Type-Options': 'nosniff'
    };
    if (ext === '.html') {
      headers['X-Frame-Options'] = 'SAMEORIGIN';
      headers['Referrer-Policy'] = 'same-origin';
    }
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();

    const stream = fs.createReadStream(full);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'EISDIR') return sendError(res, 404, 'Not found.');
    log(`static error for ${urlPath}: ${err.message}`, 'error');
    sendError(res, 500, 'Could not read that file.');
  }
}

async function dataFilesStatus() {
  const out = {};
  for (const file of ['products.json', 'orders.json', 'contacts.json', 'subscribers.json']) {
    try {
      const stat = await fsp.stat(path.join(DATA_DIR, file));
      out[file] = { exists: true, bytes: stat.size };
    } catch {
      out[file] = { exists: false };
    }
  }
  return out;
}

/* ============================================================
   14. ROUTER
   ============================================================ */
async function route(req, res) {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname || '/';
  const query = new URLSearchParams(parsed.query || {});
  const method = req.method.toUpperCase();

  res.setHeader('X-Content-Type-Options', 'nosniff');

  /* ---- public API ---- */
  if (pathname === '/api/health' && (method === 'GET' || method === 'HEAD')) {
    return sendJSON(res, 200, {
      success: true,
      status: 'ok',
      service: 'verdant-api',
      time: nowISO(),
      uptimeSeconds: Math.round(process.uptime()),
      credentialsConfigured: CREDENTIALS_READY,
      dataFiles: await dataFilesStatus()
    });
  }

  if (pathname === '/api/products' && method === 'GET') return handleProductsList(req, res);

  const productMatch = pathname.match(/^\/api\/products\/([^/]+)$/);
  if (productMatch && method === 'GET') {
    return handleProductOne(req, res, decodeURIComponent(productMatch[1]));
  }

  if (pathname === '/api/orders' && method === 'POST') return handleCreateOrder(req, res);
  if (pathname === '/api/contact' && method === 'POST') return handleContactSubmit(req, res);
  if (pathname === '/api/newsletter' && method === 'POST') return handleNewsletterSubmit(req, res);
  if (pathname === '/api/config' && method === 'GET') return sendJSON(res, 200, { success: true, rules: RULES });

  /* ---- admin authentication ---- */
  if (pathname === '/api/admin/login' && method === 'POST') return handleAdminLogin(req, res);
  if (pathname === '/api/admin/logout' && method === 'POST') return handleAdminLogout(req, res);
  if (pathname === '/api/admin/session' && method === 'GET') return handleAdminSession(req, res);

  /* ---- everything below requires a valid session ---- */
  if (pathname.startsWith('/api/admin/')) {
    if (method !== 'GET' && method !== 'HEAD' && !originAllowed(req)) {
      return sendError(res, 403, 'Origin not allowed.');
    }
    const session = requireAdmin(req, res);
    if (!session) return;

    if (pathname === '/api/admin/dashboard' && method === 'GET') return handleAdminDashboard(req, res);
    if (pathname === '/api/admin/orders' && method === 'GET') return handleAdminOrders(req, res, query);

    const orderMatch = pathname.match(/^\/api\/admin\/orders\/([^/]+)$/);
    if (orderMatch && method === 'GET') return handleAdminOrderOne(req, res, decodeURIComponent(orderMatch[1]));

    const statusMatch = pathname.match(/^\/api\/admin\/orders\/([^/]+)\/status$/);
    if (statusMatch && method === 'PATCH') return handleAdminOrderStatus(req, res, decodeURIComponent(statusMatch[1]));

    if (pathname === '/api/admin/contacts' && method === 'GET') return handleAdminContacts(req, res);

    const contactMatch = pathname.match(/^\/api\/admin\/contacts\/([^/]+)\/status$/);
    if (contactMatch && method === 'PATCH') return handleAdminContactStatus(req, res, decodeURIComponent(contactMatch[1]));

    if (pathname === '/api/admin/subscribers' && method === 'GET') return handleAdminSubscribers(req, res);
    if (pathname === '/api/admin/products' && method === 'GET') return handleAdminProductsList(req, res);
    if (pathname === '/api/admin/products' && method === 'POST') return handleAdminProductCreate(req, res);

    const adminProductMatch = pathname.match(/^\/api\/admin\/products\/([^/]+)$/);
    if (adminProductMatch) {
      const id = decodeURIComponent(adminProductMatch[1]);
      if (method === 'PATCH') return handleAdminProductUpdate(req, res, id);
      if (method === 'DELETE') return handleAdminProductDelete(req, res, id);
    }

    if (pathname === '/api/admin/dashboard' || pathname === '/api/admin/orders') {
      return sendError(res, 405, 'Method not allowed.');
    }
    return sendError(res, 404, 'Admin endpoint not found.');
  }

  if (pathname.startsWith('/api/')) {
    return sendError(res, 404, 'Endpoint not found.');
  }

  /* ---- static assets & pages ---- */
  if (method === 'GET' || method === 'HEAD') {
    return serveStatic(req, res, pathname);
  }

  return sendError(res, 405, 'Method not allowed.');
}

/* ============================================================
   15. LOGGING & BOOT
   ============================================================ */
function log(message, level) {
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const tag = level === 'error' ? 'ERR ' : level === 'warn' ? 'WARN' : 'INFO';
  console.log(`[${stamp}] ${tag} ${message}`);
}

async function start() {
  await ensureDataFiles();

  const server = http.createServer((req, res) => {
    const started = Date.now();
    res.on('finish', () => {
      if (req.url.startsWith('/api/')) {
        log(`${req.method} ${req.url} → ${res.statusCode} (${Date.now() - started}ms)`);
      }
    });
    route(req, res).catch((err) => {
      log(`unhandled error on ${req.method} ${req.url}: ${err && err.stack ? err.stack : err}`, 'error');
      if (!res.headersSent) sendError(res, 500, 'Internal server error.');
      else res.destroy();
    });
  });

  server.on('clientError', (err, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      log(`port ${PORT} is already in use. Set PORT to another value, e.g.  $env:PORT="3001"`, 'error');
      process.exit(1);
    }
    log(`server error: ${err.message}`, 'error');
    process.exit(1);
  });

  server.listen(PORT, HOST, () => {
    console.log('');
    console.log('  VERDANT — Organic Plant Nursery');
    console.log('  ─────────────────────────────────────────────');
    console.log(`  Store      http://localhost:${PORT}`);
    console.log(`  Admin      http://localhost:${PORT}/admin.html`);
    console.log(`  API health http://localhost:${PORT}/api/health`);
    console.log(`  Data       ${DATA_DIR}`);
    console.log(`  Admin user ${ADMIN_USERNAME || '(not configured)'}`);
    if (!CREDENTIALS_READY) {
      log('ADMIN_USERNAME / ADMIN_PASSWORD are not set — the admin panel will refuse sign-in.', 'warn');
      log('PowerShell:  $env:ADMIN_USERNAME="admin";  $env:ADMIN_PASSWORD="a-strong-password";  node server.js', 'warn');
    }
    console.log('  ─────────────────────────────────────────────');
    console.log('  Demonstration system — no real payments or shipping.');
    console.log('');
  });

  const shutdown = (signal) => {
    log(`${signal} received — shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

if (require.main === module) {
  start().catch((err) => {
    log(`failed to start: ${err.message}`, 'error');
    process.exit(1);
  });
}

module.exports = { start, route, RULES, validateOrderInput, totalsFor };
