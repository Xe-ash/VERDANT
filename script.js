/* ============================================================
   VERDANT — Organic Plant Nursery & Houseplant Care Recommender
   script.js  ·  Vanilla JavaScript (ES6+), no libraries
   ------------------------------------------------------------
   SECTIONS
    01. Constants & configuration
    02. Safe utilities (DOM, formatting, dates, escaping)
    03. LocalStorage layer
    04. Application state
    05. Data — categories & product catalogue
    06. Data — care topics, care guides, symptoms
    07. Data — recommender configuration
    08. Data — testimonials, articles, legal copy
    09. Router (hash based views)
    10. Header, navigation, search, toasts, modal shell
    11. Product cards & grids (shared)
    12. Home view rendering
    13. Shop view — filters, sorting, search
    14. Product detail modal
    15. Wishlist
    16. Cart & totals
    17. Checkout & demo order confirmation
    18. Plant recommender engine & results
    19. Plant care centre & problem identifier
    20. Personal plant dashboard (watering + feeding)
    21. Forms (newsletter, contact) & misc
    22. Boot
   ============================================================ */
'use strict';

/* ============ 01. CONSTANTS & CONFIGURATION ============ */
const STORE_KEYS = {
  cart: 'verdant.cart.v1',
  wishlist: 'verdant.wishlist.v1',
  plants: 'verdant.plants.v1',
  journal: 'verdant.journal.v1',
  shopFilters: 'verdant.shopFilters.v1',
  newsletter: 'verdant.newsletter.v1',
  messages: 'verdant.messages.v1',
  orders: 'verdant.orders.v1',
  reco: 'verdant.reco.v1',
  lastOrder: 'verdant.lastOrder.v1',
  checkoutDraft: 'verdant.checkoutDraft.v1'
};

const CONFIG = {
  currency: '₹',
  freeDeliveryThreshold: 999,      // ₹ — free delivery at or above this subtotal
  deliveryFee: 79,                 // ₹ — standard delivery fee
  discountThreshold: 1500,         // ₹ — "Grow More" bundle discount kicks in
  discountRate: 0.10,              // 10% off
  discountCap: 200,                // ₹ — maximum discount
  maxQty: 10,
  recoResultCount: 5,
  recoMinScore: 42,
  lowStockAt: 5
};

/* Ordinal scales used by the recommender (higher = more light / more water / harder) */
const SUN_LEVELS = ['very-low', 'low', 'medium', 'bright', 'direct'];
const SUN_LABELS = {
  'very-low': 'Very low light',
  low: 'Low light',
  medium: 'Medium / indirect light',
  bright: 'Bright indirect light',
  direct: 'Direct sunlight'
};
const WATER_LABELS = {
  frequent: 'Water every 2–3 days',
  weekly: 'Water about once a week',
  biweekly: 'Water every 2 weeks',
  low: 'Very little water'
};
const PLANT_TYPE_TAGS = {
  decorative: ['decorative'],
  flowering: ['flowering'],
  air: ['air-purifying'],
  medicinal: ['medicinal'],
  succulents: ['succulent'],
  climbing: ['climbing']
};
const PLACEMENTS = ['Bedroom', 'Living room', 'Office', 'Balcony', 'Kitchen', 'Bathroom', 'Outdoor garden'];
const ROOM_ICONS = {
  Bedroom: 'i-leaf', 'Living room': 'i-pot', Office: 'i-desk' /* fallback below */,
  Balcony: 'i-sun', Kitchen: 'i-soil', Bathroom: 'i-drop', 'Outdoor garden': 'i-leaf'
};

/* ============ 02. SAFE UTILITIES ============ */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Escape text for safe insertion into innerHTML templates. */
function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Currency formatter — Indian Rupee with Indian digit grouping. */
function money(amount) {
  const n = Number(amount) || 0;
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

function debounce(fn, wait = 220) {
  let timer;
  return function debounced(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  };
}

/** Local YYYY-MM-DD (avoids UTC off-by-one from toISOString). */
function toISODate(date) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function todayISO() { return toISODate(new Date()); }
function parseDate(iso) {
  if (!iso) return null;
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}
function addDays(iso, days) {
  const base = parseDate(iso);
  if (!base) return null;
  const next = new Date(base.getFullYear(), base.getMonth(), base.getDate() + Number(days || 0));
  return toISODate(next);
}
function daysBetween(fromISO, toISOStr) {
  const a = parseDate(fromISO), b = parseDate(toISOStr);
  if (!a || !b) return 0;
  return Math.round((b - a) / 86400000);
}
function formatDate(iso, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  const d = parseDate(iso);
  if (!d) return '—';
  return d.toLocaleDateString('en-IN', opts);
}
function relativeDays(n) {
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  if (n > 1) return `in ${n} days`;
  return `${Math.abs(n)} days ago`;
}
function uid(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
function pluralize(n, singular, plural) {
  return `${n} ${n === 1 ? singular : (plural || singular + 's')}`;
}

/** Build an SVG icon referencing the inline sprite. */
function icon(name, cls = '') {
  return `<svg class="icon ${cls}" aria-hidden="true"><use href="#${name}"></use></svg>`;
}

function starsHTML(rating, size = '') {
  const rounded = Math.round(Number(rating) || 0);
  let out = '<span class="stars' + (size ? ' ' + size : '') + '" aria-hidden="true">';
  for (let i = 1; i <= 5; i++) {
    out += `<svg class="icon${i > rounded ? ' icon--empty' : ''}"><use href="#i-star"></use></svg>`;
  }
  return out + '</span>';
}

function ratingBlock(p) {
  return `<div class="product-card__rating">${starsHTML(p.rating)}
    <span class="rating-text">${Number(p.rating).toFixed(1)} (${p.reviews})</span></div>`;
}

/* ============ 03. LOCALSTORAGE LAYER (fails soft) ============ */
const storage = {
  available() {
    try {
      const k = '__verdant_test__';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return true;
    } catch (err) { return false; }
  },
  read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch (err) {
      console.warn('[Verdant] Could not read', key, err);
      return fallback;
    }
  },
  write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.warn('[Verdant] Could not save', key, err);
      toast('Could not save locally', 'Your browser may be blocking storage or is full.', 'error');
      return false;
    }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch (err) { /* ignore */ }
  }
};

/* ============ 04. APPLICATION STATE ============ */
const state = {
  cart: [],          // [{ id, qty }]
  wishlist: [],      // [productId]
  plants: [],        // personal collection
  journal: [],       // [{ id, text, ts }]
  orders: [],        // demo order history
  foodSubs: [],      // newsletter emails (demo)
  messages: [],      // contact form messages (demo)
  reco: null,        // saved questionnaire answers
  recoStep: 0,
  lastOrder: null,
  filters: {
    q: '', categories: [], priceMin: 0, priceMax: 2000,
    maintenance: [], sun: [], difficulty: [], inStock: false, rating: 0, sort: 'recommended'
  },
  currentView: 'home',
  activeProductId: null,
  modalReturnFocus: null
};

/* ============ 05. DATA — CATEGORIES & PRODUCTS ============ */
const CATEGORIES = [
  { id: 'indoor', name: 'Indoor Plants', desc: 'Leafy houseplants for living rooms, bedrooms and offices.',
    img: 'assets/img/monstera.jpg', icon: 'i-pot', blurb: 'Filtered light, steady warmth' },
  { id: 'outdoor', name: 'Outdoor Plants', desc: 'Sun-loving plants for balconies, patios and gardens.',
    img: 'assets/img/garden-path.jpg', icon: 'i-sun', blurb: 'Full sun and fresh air' },
  { id: 'succulents', name: 'Succulents & Cacti', desc: 'Water-wise rosettes and desert cacti that shrug off neglect.',
    img: 'assets/img/echeveria.jpg', icon: 'i-drop', blurb: 'Dry soil, bright light' },
  { id: 'flowering', name: 'Flowering Plants', desc: 'Blooms that bring colour and fragrance to your home.',
    img: 'assets/img/hibiscus.jpg', icon: 'i-sparkle', blurb: 'Colour and fragrance' },
  { id: 'air', name: 'Air-Purifying Plants', desc: 'Species often chosen for their air-purifying qualities.',
    img: 'assets/img/snake-plant.jpg', icon: 'i-leaf', blurb: 'Cleaner-feeling rooms' },
  { id: 'lowmaintenance', name: 'Low-Maintenance Plants', desc: 'Forgiving plants for busy weeks and forgetful waterers.',
    img: 'assets/img/zz-plant.jpg', icon: 'i-clock', blurb: 'Happy with less' },
  { id: 'medicinal', name: 'Medicinal & Herb Plants', desc: 'Kitchen herbs and traditional wellness plants.',
    img: 'assets/img/tulsi.jpg', icon: 'i-soil', blurb: 'Grow your own' },
  { id: 'essentials', name: 'Gardening Essentials', desc: 'Organic-inspired compost, feed, neem oil and tools.',
    img: 'assets/img/vermicompost.jpg', icon: 'i-toolkit', blurb: 'Soil, feed and tools' }
];
const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

/**
 * PRODUCT CATALOGUE (29 items)
 * kind: 'plant' | 'essential'
 * pet: { dogs, cats } each 'safe' | 'toxic' | 'caution'
 * organic: only descriptive, non-certified wording — see organicNote
 */
const PRODUCTS = [
  {
    id: 'pothos', name: 'Money Plant', sci: 'Epipremnum aureum', category: 'indoor',
    collections: ['air', 'lowmaintenance'], kind: 'plant', price: 249, originalPrice: 349,
    desc: 'A trailing classic with heart-shaped, marbled leaves. Forgiving, fast-growing and happy in most rooms.',
    img: 'assets/img/pothos.jpg', rating: 4.8, reviews: 412, inStock: true, stock: 24,
    difficulty: 'Easy', sunlight: ['low', 'medium', 'bright'], water: 'weekly', maintenance: 'Low',
    pet: { dogs: 'toxic', cats: 'toxic' },
    soil: 'Free-draining potting mix with cocopeat and a little compost.',
    temp: '18–29°C · keep away from cold draughts',
    humidity: 'Average home humidity; enjoys occasional misting',
    fertilizer: 'Balanced organic feed every 4–6 weeks in spring and summer',
    repotting: 'Repot every 1–2 years when roots circle the pot',
    pruning: 'Trim leggy vines just above a node to encourage bushier growth',
    size: 'Medium', leaf: 'Patterned', purpose: ['Decoration', 'Learning'], placement: ['Living room', 'Office', 'Bedroom', 'Kitchen'],
    tags: ['Bestseller', 'Beginner Friendly', 'Air-Purifying'], bestseller: true, featured: true,
    newArrival: false, popularity: 98, organic: 'Organic-inspired',
    problems: ['Yellowing leaves usually mean overwatering', 'Brown tips from dry air or inconsistent watering'],
    careId: 'pothos'
  },
  {
    id: 'snake-plant', name: 'Snake Plant', sci: 'Dracaena trifasciata', category: 'indoor',
    collections: ['air', 'lowmaintenance'], kind: 'plant', price: 399, originalPrice: 499,
    desc: 'Upright, architectural and famously tolerant. Thrives on neglect and looks sharp in any corner.',
    img: 'assets/img/snake-plant-2.jpg', rating: 4.9, reviews: 528, inStock: true, stock: 31,
    difficulty: 'Easy', sunlight: ['very-low', 'low', 'medium', 'bright'], water: 'biweekly', maintenance: 'Low',
    pet: { dogs: 'toxic', cats: 'toxic' },
    soil: 'Gritty, fast-draining cactus or succulent mix.',
    temp: '18–30°C · tolerates dry indoor air',
    humidity: 'Low to average humidity is fine',
    fertilizer: 'Half-strength feed twice in the growing season',
    repotting: 'Only when tightly pot-bound — every 2–3 years',
    pruning: 'Remove damaged leaves at the base with clean snips',
    size: 'Medium', leaf: 'Patterned', purpose: ['Decoration', 'Learning'], placement: ['Bedroom', 'Living room', 'Office'],
    tags: ['Bestseller', 'Low Maintenance', 'Beginner Friendly'], bestseller: true, featured: true,
    newArrival: false, popularity: 96, organic: 'Organic-inspired',
    problems: ['Soft, mushy base indicates overwatering', 'Wrinkled leaves suggest long dry spells'],
    careId: 'snake-plant'
  },
  {
    id: 'peace-lily', name: 'Peace Lily', sci: 'Spathiphyllum wallisii', category: 'indoor',
    collections: ['flowering', 'air'], kind: 'plant', price: 449, originalPrice: 549,
    desc: 'Glossy leaves and elegant white spathes. It politely droops when thirsty, which makes it easy to read.',
    img: 'assets/img/peace-lily.jpg', rating: 4.7, reviews: 366, inStock: true, stock: 18,
    difficulty: 'Easy', sunlight: ['low', 'medium'], water: 'weekly', maintenance: 'Medium',
    pet: { dogs: 'toxic', cats: 'toxic' },
    soil: 'Rich, moisture-retentive mix with good drainage.',
    temp: '18–27°C · avoid cold windowsills',
    humidity: 'Prefers higher humidity — group plants or use a pebble tray',
    fertilizer: 'Organic liquid feed every 6 weeks in spring and summer',
    repotting: 'Every 2 years, in spring, one pot size up',
    pruning: 'Cut spent flowers at the base; remove yellowing leaves',
    size: 'Medium', leaf: 'Green', purpose: ['Decoration', 'Wellness'], placement: ['Living room', 'Bedroom', 'Office'],
    tags: ['Bestseller', 'Air-Purifying', 'Flowering'], bestseller: true, featured: true,
    newArrival: false, popularity: 92, organic: 'Organic-inspired',
    problems: ['Brown tips from dry air or fertilizer buildup', 'No flowers in very low light'],
    careId: 'peace-lily'
  },
  {
    id: 'monstera', name: 'Monstera Deliciosa', sci: 'Monstera deliciosa', category: 'indoor',
    collections: ['air'], kind: 'plant', price: 899, originalPrice: 1099,
    desc: 'The statement plant: broad, split leaves that make a room feel instantly lush and tropical.',
    img: 'assets/img/monstera.jpg', rating: 4.8, reviews: 604, inStock: true, stock: 12,
    difficulty: 'Moderate', sunlight: ['medium', 'bright'], water: 'weekly', maintenance: 'Medium',
    pet: { dogs: 'toxic', cats: 'toxic' },
    soil: 'Chunky, airy mix — cocopeat, bark and compost.',
    temp: '18–29°C · protect from cold draughts',
    humidity: 'Enjoys 50%+ humidity; misting helps new leaves unfurl',
    fertilizer: 'Organic feed monthly through spring and summer',
    repotting: 'Every 1–2 years; provide a moss pole for support',
    pruning: 'Remove old lower leaves; wipe leaves monthly',
    size: 'Large', leaf: 'Green', purpose: ['Decoration', 'Learning'], placement: ['Living room', 'Bedroom', 'Office'],
    tags: ['Bestseller', 'Statement Plant'], bestseller: true, featured: true,
    newArrival: false, popularity: 95, organic: 'Organic-inspired',
    problems: ['No leaf splits without enough light', 'Yellow edges from overwatering'],
    careId: 'monstera'
  },
  {
    id: 'spider-plant', name: 'Spider Plant', sci: 'Chlorophytum comosum', category: 'indoor',
    collections: ['air', 'lowmaintenance'], kind: 'plant', price: 249, originalPrice: null,
    desc: 'Arching striped leaves and baby plantlets on runners — one of the friendliest plants for beginners.',
    img: 'assets/img/spider-plant.jpg', rating: 4.6, reviews: 289, inStock: true, stock: 27,
    difficulty: 'Easy', sunlight: ['low', 'medium', 'bright'], water: 'weekly', maintenance: 'Low',
    pet: { dogs: 'safe', cats: 'safe' },
    soil: 'General potting mix with a little perlite or cocopeat.',
    temp: '16–27°C · happy in most homes',
    humidity: 'Adaptable; appreciate occasional misting',
    fertilizer: 'Diluted organic feed monthly in spring and summer',
    repotting: 'Every 1–2 years; roots are chunky and quick to fill pots',
    pruning: 'Trim brown tips diagonally; remove old outer leaves',
    size: 'Small', leaf: 'Patterned', purpose: ['Decoration', 'Learning'], placement: ['Kitchen', 'Bathroom', 'Office', 'Living room'],
    tags: ['Pet Friendly', 'Beginner Friendly', 'Air-Purifying'], bestseller: false, featured: true,
    newArrival: false, popularity: 88, organic: 'Organic-inspired',
    problems: ['Brown tips from fluoride or dry air', 'Pale leaves in very low light'],
    careId: 'spider-plant'
  },
  {
    id: 'zz-plant', name: 'ZZ Plant', sci: 'Zamioculcas zamiifolia', category: 'indoor',
    collections: ['lowmaintenance', 'air'], kind: 'plant', price: 499, originalPrice: 599,
    desc: 'Glossy, waxy foliage on upright stems. Stores water in its rhizomes, so it forgives missed waterings.',
    img: 'assets/img/zz-plant.jpg', rating: 4.8, reviews: 341, inStock: true, stock: 16,
    difficulty: 'Easy', sunlight: ['very-low', 'low', 'medium'], water: 'biweekly', maintenance: 'Low',
    pet: { dogs: 'toxic', cats: 'toxic' },
    soil: 'Well-draining mix; a succulent blend works well.',
    temp: '18–28°C · avoid cold below 12°C',
    humidity: 'Average home humidity',
    fertilizer: 'Feed twice a year — it is not a heavy feeder',
    repotting: 'Every 2–3 years when rhizomes crowd the pot',
    pruning: 'Remove older stems at the base to keep it tidy',
    size: 'Medium', leaf: 'Green', purpose: ['Decoration', 'Learning'], placement: ['Office', 'Bedroom', 'Living room'],
    tags: ['Low Maintenance', 'Low Light', 'Beginner Friendly'], bestseller: true, featured: true,
    newArrival: false, popularity: 91, organic: 'Organic-inspired',
    problems: ['Yellowing from too much water', 'Leggy growth in deep shade'],
    careId: 'zz-plant'
  },
  {
    id: 'areca-palm', name: 'Areca Palm', sci: 'Dypsis lutescens', category: 'indoor',
    collections: ['air'], kind: 'plant', price: 849, originalPrice: 999,
    desc: 'Feathery fronds that soften a room. A generous, tropical presence that is non-toxic to pets.',
    img: 'assets/img/areca-palm.jpg', rating: 4.5, reviews: 198, inStock: true, stock: 9,
    difficulty: 'Moderate', sunlight: ['medium', 'bright'], water: 'weekly', maintenance: 'Medium',
    pet: { dogs: 'safe', cats: 'safe' },
    soil: 'Moisture-retentive but free-draining potting mix.',
    temp: '18–30°C · keep away from AC draughts',
    humidity: 'Appreciates humidity; brown tips signal dry air',
    fertilizer: 'Organic feed every 6 weeks in the growing season',
    repotting: 'Every 2 years in spring',
    pruning: 'Cut brown fronds at the base; never cut the crown',
    size: 'Large', leaf: 'Green', purpose: ['Decoration', 'Wellness'], placement: ['Living room', 'Office', 'Balcony'],
    tags: ['Pet Friendly', 'Air-Purifying'], bestseller: false, featured: true,
    newArrival: false, popularity: 82, organic: 'Organic-inspired',
    problems: ['Brown tips from dry air', 'Mites love dry, dusty fronds'],
    careId: 'areca-palm'
  },
  {
    id: 'rubber-plant', name: 'Rubber Plant', sci: 'Ficus elastica', category: 'indoor',
    collections: [], kind: 'plant', price: 649, originalPrice: 749,
    desc: 'Broad, burgundy-tinged leaves that shine. A sculptural indoor tree that grows with you.',
    img: 'assets/img/rubber-plant.jpg', rating: 4.6, reviews: 223, inStock: true, stock: 11,
    difficulty: 'Easy', sunlight: ['medium', 'bright'], water: 'weekly', maintenance: 'Medium',
    pet: { dogs: 'toxic', cats: 'toxic' },
    soil: 'Well-draining, compost-rich mix.',
    temp: '18–28°C · dislikes cold and draughts',
    humidity: 'Average humidity; wipe leaves monthly',
    fertilizer: 'Organic feed monthly in spring and summer',
    repotting: 'Every 2 years, in spring',
    pruning: 'Prune in spring to control height and encourage branching',
    size: 'Large', leaf: 'Colorful', purpose: ['Decoration'], placement: ['Living room', 'Office'],
    tags: ['Statement Plant'], bestseller: false, featured: false,
    newArrival: false, popularity: 78, organic: 'Organic-inspired',
    problems: ['Dropping lower leaves after drafts', 'White sap when pruned — wear gloves'],
    careId: 'rubber-plant'
  },
  {
    id: 'calathea', name: 'Calathea Orbifolia', sci: 'Calathea orbifolia', category: 'indoor',
    collections: [], kind: 'plant', price: 549, originalPrice: 649,
    desc: 'Striped, silver-green leaves that fold at dusk. Rewarding for patient plant parents who love patterns.',
    img: 'assets/img/calathea.jpg', rating: 4.3, reviews: 156, inStock: true, stock: 7,
    difficulty: 'Challenging', sunlight: ['low', 'medium'], water: 'frequent', maintenance: 'High',
    pet: { dogs: 'safe', cats: 'safe' },
    soil: 'Light, moisture-retentive mix; avoid heavy compost.',
    temp: '18–27°C · no cold draughts, no radiators',
    humidity: 'High humidity (60%+) is key',
    fertilizer: 'Very diluted organic feed monthly in summer',
    repotting: 'Every 1–2 years in spring',
    pruning: 'Remove crisped leaves at soil level',
    size: 'Medium', leaf: 'Patterned', purpose: ['Decoration', 'Learning'], placement: ['Bathroom', 'Bedroom', 'Living room'],
    tags: ['Pet Friendly', 'Patterned Leaves'], bestseller: false, featured: false,
    newArrival: false, popularity: 71, organic: 'Organic-inspired',
    problems: ['Crispy edges from dry air', 'Leaf curl from tap water minerals'],
    careId: 'calathea'
  },
  {
    id: 'fern', name: 'Boston Fern', sci: 'Nephrolepis exaltata', category: 'indoor',
    collections: ['air'], kind: 'plant', price: 349, originalPrice: null,
    desc: 'Soft, feathered fronds that bring a cool, woodland feel — ideal for bathrooms and shaded corners.',
    img: 'assets/img/fern.jpg', rating: 4.4, reviews: 142, inStock: true, stock: 14,
    difficulty: 'Moderate', sunlight: ['low', 'medium'], water: 'frequent', maintenance: 'High',
    pet: { dogs: 'safe', cats: 'safe' },
    soil: 'Peat-free, moisture-retentive mix with cocopeat.',
    temp: '16–26°C · thrives in cooler rooms',
    humidity: 'High humidity — bathrooms suit it best',
    fertilizer: 'Half-strength organic feed monthly in summer',
    repotting: 'Every 1–2 years or when the root ball fills the pot',
    pruning: 'Snip spent fronds at the base to keep it dense',
    size: 'Medium', leaf: 'Green', purpose: ['Decoration', 'Wellness'], placement: ['Bathroom', 'Bedroom', 'Living room'],
    tags: ['Pet Friendly', 'Air-Purifying'], bestseller: false, featured: false,
    newArrival: false, popularity: 69, organic: 'Organic-inspired',
    problems: ['Crispy fronds in dry air', 'Shedding leaflets when under-watered'],
    careId: 'fern'
  },
  {
    id: 'anthurium', name: 'Anthurium', sci: 'Anthurium andraeanum', category: 'indoor',
    collections: ['flowering'], kind: 'plant', price: 699, originalPrice: 799,
    desc: 'Waxy red spathes that last for weeks at a time. A tropical bloomer that performs in bright rooms.',
    img: 'assets/img/anthurium.jpg', rating: 4.5, reviews: 174, inStock: true, stock: 8,
    difficulty: 'Moderate', sunlight: ['medium', 'bright'], water: 'weekly', maintenance: 'Medium',
    pet: { dogs: 'toxic', cats: 'toxic' },
    soil: 'Chunky, orchid-style mix with excellent drainage.',
    temp: '20–29°C · loves warmth',
    humidity: 'High humidity; mist the aerial roots',
    fertilizer: 'Organic feed every 6 weeks in spring and summer',
    repotting: 'Every 2 years in spring',
    pruning: 'Remove faded spathes so energy goes to new blooms',
    size: 'Medium', leaf: 'Colorful', purpose: ['Decoration', 'Learning'], placement: ['Living room', 'Office', 'Bedroom'],
    tags: ['Flowering'], bestseller: false, featured: false,
    newArrival: false, popularity: 74, organic: 'Organic-inspired',
    problems: ['Brown leaf edges from low humidity', 'No flowers in low light'],
    careId: 'anthurium'
  },
  {
    id: 'hibiscus', name: 'Hibiscus', sci: 'Hibiscus rosa-sinensis', category: 'outdoor',
    collections: ['flowering'], kind: 'plant', price: 449, originalPrice: 549,
    desc: 'Big, bold blooms that open fresh each morning. A sun-lover for balconies and sunny patios.',
    img: 'assets/img/hibiscus.jpg', rating: 4.4, reviews: 132, inStock: true, stock: 13,
    difficulty: 'Moderate', sunlight: ['bright', 'direct'], water: 'frequent', maintenance: 'Medium',
    pet: { dogs: 'safe', cats: 'safe' },
    soil: 'Rich, well-draining mix; top-dress with compost monthly.',
    temp: '20–35°C · protect below 10°C',
    humidity: 'Tolerates Indian humidity well',
    fertilizer: 'Organic feed fortnightly in the flowering season',
    repotting: 'Every 1–2 years in spring',
    pruning: 'Prune lightly after each flush of flowers',
    size: 'Large', leaf: 'Colorful', purpose: ['Decoration', 'Gardening'], placement: ['Balcony', 'Outdoor garden'],
    tags: ['Flowering', 'Sun Lover', 'Pet Friendly'], bestseller: true, featured: false,
    newArrival: false, popularity: 84, organic: 'Organic-inspired',
    problems: ['Bud drop from inconsistent watering', 'Aphids on new shoots'],
    careId: 'hibiscus'
  },
  {
    id: 'jasmine', name: 'Arabian Jasmine', sci: 'Jasminum sambac', category: 'outdoor',
    collections: ['flowering'], kind: 'plant', price: 399, originalPrice: null,
    desc: 'Small white flowers with an unforgettable evening fragrance. A traditional balcony favourite.',
    img: 'assets/img/jasmine.jpg', rating: 4.6, reviews: 187, inStock: true, stock: 15,
    difficulty: 'Moderate', sunlight: ['bright', 'direct'], water: 'weekly', maintenance: 'Medium',
    pet: { dogs: 'caution', cats: 'caution' },
    soil: 'Well-draining, slightly acidic mix.',
    temp: '20–35°C · frost sensitive',
    humidity: 'Average to high humidity',
    fertilizer: 'Organic feed every 3–4 weeks in the growing season',
    repotting: 'Every 2 years or when roots fill the pot',
    pruning: 'Prune after flowering to encourage new flowering shoots',
    size: 'Medium', leaf: 'Green', purpose: ['Decoration', 'Wellness'], placement: ['Balcony', 'Outdoor garden', 'Living room'],
    tags: ['Flowering', 'Fragrant'], bestseller: false, featured: false,
    newArrival: false, popularity: 76, organic: 'Organic-inspired',
    problems: ['Few flowers in shade', 'Spider mites in dry indoor air'],
    careId: 'jasmine'
  },
  {
    id: 'bonsai', name: 'Ficus Bonsai', sci: 'Ficus retusa', category: 'indoor',
    collections: [], kind: 'plant', price: 1499, originalPrice: 1799,
    desc: 'A living sculpture in a shallow tray. Requires patience and regular shaping — deeply rewarding.',
    img: 'assets/img/bonsai.jpg', rating: 4.7, reviews: 96, inStock: true, stock: 4,
    difficulty: 'Challenging', sunlight: ['bright', 'medium'], water: 'frequent', maintenance: 'High',
    pet: { dogs: 'toxic', cats: 'toxic' },
    soil: 'Free-draining bonsai substrate: grit, cocopeat and compost.',
    temp: '18–30°C · avoid cold draughts',
    humidity: 'Moderate; a humidity tray helps',
    fertilizer: 'Specialist bonsai feed every 2 weeks in the growing season',
    repotting: 'Every 2–3 years with root pruning in spring',
    pruning: 'Regular pinching and wiring to maintain shape',
    size: 'Small', leaf: 'Green', purpose: ['Learning', 'Decoration'], placement: ['Living room', 'Office', 'Balcony'],
    tags: ['New Arrival', 'Collector'], bestseller: false, featured: false,
    newArrival: true, popularity: 67, organic: 'Organic-inspired',
    problems: ['Leaf drop when moved suddenly', 'Dry soil for a day can scorch foliage'],
    careId: 'bonsai'
  },
  {
    id: 'eucalyptus', name: 'Silver Eucalyptus', sci: 'Eucalyptus cinerea', category: 'outdoor',
    collections: [], kind: 'plant', price: 599, originalPrice: null,
    desc: 'Silvery, rounded leaves with a clean scent. Beautiful in bright windows and on sunny balconies.',
    img: 'assets/img/eucalyptus.jpg', rating: 4.2, reviews: 78, inStock: true, stock: 6,
    difficulty: 'Moderate', sunlight: ['bright', 'direct'], water: 'weekly', maintenance: 'Medium',
    pet: { dogs: 'toxic', cats: 'toxic' },
    soil: 'Gritty, free-draining mix.',
    temp: '15–30°C · needs good airflow',
    humidity: 'Low to average; dislikes stuffy rooms',
    fertilizer: 'Light organic feed monthly in the growing season',
    repotting: 'Repot annually; it grows quickly',
    pruning: 'Pinch tips for a bushier shape and harvest stems regularly',
    size: 'Medium', leaf: 'Colorful', purpose: ['Decoration', 'Wellness'], placement: ['Balcony', 'Outdoor garden'],
    tags: ['New Arrival', 'Fragrant'], bestseller: false, featured: false,
    newArrival: true, popularity: 61, organic: 'Organic-inspired',
    problems: ['Leggy growth in shade', 'Drooping after dry spells'],
    careId: 'eucalyptus'
  },
  {
    id: 'aloe-vera', name: 'Aloe Vera', sci: 'Aloe vera', category: 'succulents',
    collections: ['medicinal', 'lowmaintenance'], kind: 'plant', price: 299, originalPrice: 379,
    desc: 'Thick, gel-filled leaves that love sun and dry air. Under-watering is kinder to it than over-watering.',
    img: 'assets/img/aloe-vera.jpg', rating: 4.7, reviews: 388, inStock: true, stock: 22,
    difficulty: 'Easy', sunlight: ['bright', 'direct'], water: 'biweekly', maintenance: 'Low',
    pet: { dogs: 'toxic', cats: 'toxic' },
    soil: 'Gritty cactus mix with pumice or coarse sand.',
    temp: '18–32°C · protect from frost',
    humidity: 'Low humidity — dry air is fine',
    fertilizer: 'Rarely needed; once in spring if repotted',
    repotting: 'Every 2–3 years or when pups crowd the pot',
    pruning: 'Harvest outer leaves at the base when needed',
    size: 'Medium', leaf: 'Green', purpose: ['Wellness', 'Decoration'], placement: ['Balcony', 'Kitchen', 'Living room'],
    tags: ['Low Maintenance', 'Medicinal', 'Sun Lover'], bestseller: true, featured: true,
    newArrival: false, popularity: 90, organic: 'Organic-inspired',
    problems: ['Mushy stem from overwatering', 'Thin, curled leaves when very thirsty'],
    careId: 'aloe-vera'
  },
  {
    id: 'jade-plant', name: 'Jade Plant', sci: 'Crassula ovata', category: 'succulents',
    collections: ['lowmaintenance'], kind: 'plant', price: 329, originalPrice: null,
    desc: 'A tiny tree with plump jade-green leaves. Slow, steady and famously long-lived.',
    img: 'assets/img/jade-plant.jpg', rating: 4.6, reviews: 254, inStock: true, stock: 19,
    difficulty: 'Easy', sunlight: ['bright', 'direct'], water: 'biweekly', maintenance: 'Low',
    pet: { dogs: 'toxic', cats: 'toxic' },
    soil: 'Free-draining succulent mix.',
    temp: '16–28°C · cool winter rest is beneficial',
    humidity: 'Low humidity',
    fertilizer: 'Succulent feed twice in the growing season',
    repotting: 'Every 2–3 years',
    pruning: 'Pinch growing tips to keep a compact shape',
    size: 'Small', leaf: 'Green', purpose: ['Decoration', 'Wellness'], placement: ['Living room', 'Office', 'Balcony'],
    tags: ['Low Maintenance', 'Beginner Friendly'], bestseller: false, featured: false,
    newArrival: false, popularity: 80, organic: 'Organic-inspired',
    problems: ['Leaf drop from overwatering', 'Stretching toward weak light'],
    careId: 'jade-plant'
  },
  {
    id: 'echeveria', name: 'Echeveria Rosette', sci: 'Echeveria elegans', category: 'succulents',
    collections: ['lowmaintenance'], kind: 'plant', price: 199, originalPrice: 249,
    desc: 'A perfectly geometric rosette in soft blue-green. Looks lovely in small pots and shallow bowls.',
    img: 'assets/img/echeveria.jpg', rating: 4.5, reviews: 167, inStock: true, stock: 26,
    difficulty: 'Easy', sunlight: ['bright', 'direct'], water: 'biweekly', maintenance: 'Low',
    pet: { dogs: 'safe', cats: 'safe' },
    soil: 'Gritty, quick-draining succulent mix.',
    temp: '15–28°C · protect from frost and scorching',
    humidity: 'Low humidity',
    fertilizer: 'Diluted succulent feed 2–3 times in spring and summer',
    repotting: 'Every 2 years or when offsets crowd the pot',
    pruning: 'Remove dried lower leaves; separate offsets to propagate',
    size: 'Small', leaf: 'Colorful', purpose: ['Decoration'], placement: ['Office', 'Living room', 'Balcony'],
    tags: ['Pet Friendly', 'Low Maintenance', 'Beginner Friendly'], bestseller: true, featured: false,
    newArrival: false, popularity: 86, organic: 'Organic-inspired',
    problems: ['Stretching in low light', 'Rotting from water sitting in the rosette'],
    careId: 'echeveria'
  },
  {
    id: 'haworthia', name: 'Zebra Haworthia', sci: 'Haworthiopsis fasciata', category: 'succulents',
    collections: ['lowmaintenance'], kind: 'plant', price: 249, originalPrice: null,
    desc: 'Compact, striped rosettes that handle low light better than most succulents — great for desks.',
    img: 'assets/img/haworthia.jpg', rating: 4.4, reviews: 121, inStock: true, stock: 21,
    difficulty: 'Easy', sunlight: ['low', 'medium', 'bright'], water: 'biweekly', maintenance: 'Low',
    pet: { dogs: 'safe', cats: 'safe' },
    soil: 'Gritty succulent mix with excellent drainage.',
    temp: '16–28°C',
    humidity: 'Low humidity',
    fertilizer: 'Feed sparingly — twice a year is plenty',
    repotting: 'Every 2 years or when offsets appear',
    pruning: 'Remove dry leaves from the base',
    size: 'Small', leaf: 'Patterned', purpose: ['Decoration', 'Learning'], placement: ['Office', 'Bedroom', 'Living room'],
    tags: ['Pet Friendly', 'Low Light', 'Low Maintenance'], bestseller: false, featured: false,
    newArrival: false, popularity: 72, organic: 'Organic-inspired',
    problems: ['Soft leaves from overwatering', 'Fading stripes in deep shade'],
    careId: 'haworthia'
  },
  {
    id: 'golden-barrel-cactus', name: 'Golden Barrel Cactus', sci: 'Echinocactus grusonii', category: 'succulents',
    collections: ['lowmaintenance'], kind: 'plant', price: 449, originalPrice: 529,
    desc: 'A ribbed globe of golden spines. Sculptural, water-wise and almost comically easy to keep.',
    img: 'assets/img/golden-barrel-cactus.jpg', rating: 4.6, reviews: 133, inStock: true, stock: 10,
    difficulty: 'Easy', sunlight: ['direct', 'bright'], water: 'low', maintenance: 'Low',
    pet: { dogs: 'safe', cats: 'safe' },
    soil: 'Very gritty cactus mix; a terracotta pot helps.',
    temp: '18–35°C · keep dry and bright in winter',
    humidity: 'Low humidity',
    fertilizer: 'Cactus feed once in spring',
    repotting: 'Every 3 years — use gloves and tongs',
    pruning: 'No pruning needed; remove spent flowers if any',
    size: 'Small', leaf: 'Green', purpose: ['Decoration'], placement: ['Balcony', 'Living room', 'Office'],
    tags: ['Low Maintenance', 'Sun Lover'], bestseller: false, featured: false,
    newArrival: false, popularity: 75, organic: 'Organic-inspired',
    problems: ['Base rot from excess water', 'Spines are sharp — keep away from curious pets and toddlers'],
    careId: 'golden-barrel-cactus'
  },
  {
    id: 'tulsi', name: 'Tulsi (Holy Basil)', sci: 'Ocimum tenuiflorum', category: 'medicinal',
    collections: ['outdoor'], kind: 'plant', price: 149, originalPrice: 199,
    desc: 'Aromatic, sacred and useful. Pinch regularly for a bushy plant and a steady supply of leaves.',
    img: 'assets/img/tulsi.jpg', rating: 4.8, reviews: 442, inStock: true, stock: 34,
    difficulty: 'Easy', sunlight: ['bright', 'direct'], water: 'frequent', maintenance: 'Medium',
    pet: { dogs: 'safe', cats: 'safe' },
    soil: 'Rich, well-draining mix with compost.',
    temp: '20–35°C · loves warmth',
    humidity: 'Tolerates humid summers',
    fertilizer: 'Compost top-dress monthly; feed lightly',
    repotting: 'Annual — repot or replant each spring',
    pruning: 'Pinch flower buds and tips to keep leaves tender',
    size: 'Small', leaf: 'Green', purpose: ['Wellness', 'Gardening'], placement: ['Balcony', 'Kitchen', 'Outdoor garden'],
    tags: ['Medicinal', 'Bestseller', 'Sun Lover'], bestseller: true, featured: true,
    newArrival: false, popularity: 94, organic: 'Organic-inspired',
    problems: ['Leggy stems without pinching', 'Wilting in a small pot on hot days'],
    careId: 'tulsi'
  },
  {
    id: 'mint', name: 'Mint', sci: 'Mentha spicata', category: 'medicinal',
    collections: [], kind: 'plant', price: 129, originalPrice: 159,
    desc: 'Vigorous, fragrant and endlessly useful in the kitchen. Keep it in its own pot — it spreads.',
    img: 'assets/img/mint.jpg', rating: 4.5, reviews: 208, inStock: true, stock: 29,
    difficulty: 'Easy', sunlight: ['medium', 'bright'], water: 'frequent', maintenance: 'Medium',
    pet: { dogs: 'caution', cats: 'caution' },
    soil: 'Moisture-retentive mix with compost.',
    temp: '15–28°C',
    humidity: 'Average to high',
    fertilizer: 'Light organic feed every 4 weeks',
    repotting: 'Every year — divide the clump in spring',
    pruning: 'Harvest tips often to keep growth soft and bushy',
    size: 'Small', leaf: 'Green', purpose: ['Gardening', 'Wellness'], placement: ['Kitchen', 'Balcony', 'Bathroom'],
    tags: ['Medicinal', 'Kitchen Garden'], bestseller: false, featured: false,
    newArrival: false, popularity: 77, organic: 'Organic-inspired',
    problems: ['Wilting from dry soil', 'Rust spots in poor airflow'],
    careId: 'mint'
  },
  {
    id: 'rosemary', name: 'Rosemary', sci: 'Salvia rosmarinus', category: 'medicinal',
    collections: ['outdoor'], kind: 'plant', price: 249, originalPrice: null,
    desc: 'A woody, needle-leaved herb that prefers to dry out between waterings. Excellent on sunny balconies.',
    img: 'assets/img/rosemary.jpg', rating: 4.4, reviews: 156, inStock: true, stock: 17,
    difficulty: 'Moderate', sunlight: ['bright', 'direct'], water: 'weekly', maintenance: 'Medium',
    pet: { dogs: 'safe', cats: 'safe' },
    soil: 'Gritty, free-draining mix; hates soggy roots.',
    temp: '15–30°C · good airflow essential',
    humidity: 'Low humidity',
    fertilizer: 'Light organic feed twice in the growing season',
    repotting: 'Every 2 years, in spring',
    pruning: 'Trim after flowering to keep it bushy; never cut into old wood',
    size: 'Medium', leaf: 'Green', purpose: ['Gardening', 'Wellness'], placement: ['Balcony', 'Outdoor garden', 'Kitchen'],
    tags: ['Medicinal', 'Sun Lover', 'Pet Friendly'], bestseller: false, featured: false,
    newArrival: false, popularity: 70, organic: 'Organic-inspired',
    problems: ['Powdery mildew in still, humid air', 'Root rot in heavy soil'],
    careId: 'rosemary'
  },
  /* ---------- Gardening essentials ---------- */
  {
    id: 'vermicompost', name: 'Organic Vermicompost 5 kg', sci: 'Earthworm castings · soil amendment', category: 'essentials',
    collections: [], kind: 'essential', price: 299, originalPrice: 399,
    desc: 'Rich, crumbly worm castings to feed soil life. Mix into potting soil or top-dress established plants.',
    img: 'assets/img/vermicompost.jpg', rating: 4.7, reviews: 512, inStock: true, stock: 60,
    difficulty: 'Easy', sunlight: [], water: '', maintenance: 'Low',
    pet: { dogs: 'safe', cats: 'safe' },
    soil: 'Use 20–30% vermicompost in potting mixes.',
    temp: 'Store cool and dry, out of direct sun',
    humidity: 'Keep sealed to retain moisture',
    fertilizer: 'Apply monthly during the growing season',
    repotting: '', pruning: '',
    size: '—', leaf: '—', purpose: ['Gardening'], placement: [],
    tags: ['Organic-Inspired', 'Soil Health'], bestseller: true, featured: false,
    newArrival: false, popularity: 89, organic: 'Naturally formulated',
    problems: [], careId: null
  },
  {
    id: 'neem-oil', name: 'Neem Oil Concentrate 250 ml', sci: 'Azadirachta indica · plant care', category: 'essentials',
    collections: [], kind: 'essential', price: 349, originalPrice: null,
    desc: 'A traditional botanical spray for common garden pests. Always dilute and patch-test before spraying.',
    img: 'assets/img/neem-oil.jpg', rating: 4.6, reviews: 298, inStock: true, stock: 42,
    difficulty: 'Easy', sunlight: [], water: '', maintenance: 'Low',
    pet: { dogs: 'caution', cats: 'caution' },
    soil: '',
    temp: 'Store away from direct sunlight',
    humidity: 'Keep the bottle sealed',
    fertilizer: 'Spray at dusk to avoid leaf burn',
    repotting: '', pruning: '',
    size: '—', leaf: '—', purpose: ['Gardening'], placement: [],
    tags: ['Organic-Inspired', 'Pest Care'], bestseller: false, featured: false,
    newArrival: false, popularity: 73, organic: 'Naturally formulated',
    problems: [], careId: null
  },
  {
    id: 'cocopeat', name: 'Cocopeat Block 5 kg', sci: 'Coir pith · potting medium', category: 'essentials',
    collections: [], kind: 'essential', price: 199, originalPrice: 249,
    desc: 'A renewable, peat-free base for potting mixes. Expands to roughly 70 litres when soaked.',
    img: 'assets/img/cocopeat.jpg', rating: 4.5, reviews: 341, inStock: true, stock: 55,
    difficulty: 'Easy', sunlight: [], water: '', maintenance: 'Low',
    pet: { dogs: 'safe', cats: 'safe' },
    soil: 'Blend with compost and grit for a balanced mix.',
    temp: 'Store dry until use',
    humidity: 'Rehydrate with clean water before planting',
    fertilizer: 'Cocopeat holds water, not nutrients — feed regularly',
    repotting: '', pruning: '',
    size: '—', leaf: '—', purpose: ['Gardening'], placement: [],
    tags: ['Peat-Free', 'Organic-Inspired'], bestseller: false, featured: false,
    newArrival: false, popularity: 79, organic: 'Naturally formulated',
    problems: [], careId: null
  },
  {
    id: 'fertilizer', name: 'Organic Plant Fertilizer 500 ml', sci: 'Plant-based liquid feed', category: 'essentials',
    collections: [], kind: 'essential', price: 399, originalPrice: 479,
    desc: 'A gentle, naturally formulated liquid feed for houseplants and herbs during the growing season.',
    img: 'assets/img/fertilizer.jpg', rating: 4.7, reviews: 276, inStock: true, stock: 38,
    difficulty: 'Easy', sunlight: [], water: '', maintenance: 'Low',
    pet: { dogs: 'caution', cats: 'caution' },
    soil: '',
    temp: 'Store at room temperature',
    humidity: 'Close the cap after use',
    fertilizer: 'Dilute per label — less is more with houseplants',
    repotting: '', pruning: '',
    size: '—', leaf: '—', purpose: ['Gardening'], placement: [],
    tags: ['Organic-Inspired', 'Plant Food'], bestseller: false, featured: true,
    newArrival: false, popularity: 81, organic: 'Naturally formulated',
    problems: [], careId: null
  },
  {
    id: 'toolkit', name: 'Gardening Tool Kit', sci: 'Trowel · fork · snips', category: 'essentials',
    collections: [], kind: 'essential', price: 899, originalPrice: 1199,
    desc: 'Three solid-handled hand tools for repotting, loosening soil and light pruning. Built to last.',
    img: 'assets/img/toolkit.jpg', rating: 4.8, reviews: 189, inStock: true, stock: 15,
    difficulty: 'Easy', sunlight: [], water: '', maintenance: 'Low',
    pet: { dogs: 'safe', cats: 'safe' },
    soil: '',
    temp: 'Store dry; oil wooden handles occasionally',
    humidity: 'Dry after use to prevent rust',
    fertilizer: '',
    repotting: '', pruning: 'Snips are ideal for soft stems and spent blooms',
    size: '—', leaf: '—', purpose: ['Gardening'], placement: [],
    tags: ['Bestseller', 'Gift Idea'], bestseller: true, featured: false,
    newArrival: false, popularity: 85, organic: null,
    problems: [], careId: null
  },
  {
    id: 'pots', name: 'Terracotta Pot Set (3)', sci: 'Breathable clay pots with saucers', category: 'essentials',
    collections: [], kind: 'essential', price: 499, originalPrice: 649,
    desc: 'Classic terracotta in three sizes. Porous walls help roots breathe and reduce overwatering risk.',
    img: 'assets/img/pots.jpg', rating: 4.6, reviews: 231, inStock: true, stock: 20,
    difficulty: 'Easy', sunlight: [], water: '', maintenance: 'Low',
    pet: { dogs: 'safe', cats: 'safe' },
    soil: '',
    temp: 'Soak new pots before first use',
    humidity: 'Terracotta dries faster — check soil more often',
    fertilizer: '',
    repotting: 'Choose a pot 2–3 cm wider than the current one',
    pruning: '',
    size: '—', leaf: '—', purpose: ['Gardening', 'Decoration'], placement: [],
    tags: ['Beginner Friendly'], bestseller: false, featured: false,
    newArrival: true, popularity: 74, organic: null,
    problems: [], careId: null
  }
];
const PRODUCT_BY_ID = Object.fromEntries(PRODUCTS.map(p => [p.id, p]));
const PLANTS_ONLY = PRODUCTS.filter(p => p.kind === 'plant');

/* ============ 06. DATA — CARE TOPICS, GUIDES & SYMPTOMS ============ */
const CARE_TOPICS = [
  { id: 'watering', title: 'Watering', icon: 'i-drop',
    summary: 'How to judge soil moisture and water deeply, not often.',
    body: [
      'Water when the top 2–4 cm of soil feels dry to the touch — not on a fixed calendar. Pot size, drainage, light, temperature and season all change how quickly soil dries.',
      'Water thoroughly until a little runs out of the drainage holes, then empty the saucer. Repeated small sips leave dry pockets and salt buildup around the roots.',
      'Most houseplants do better slightly under-watered than constantly soggy. If in doubt, wait a day and check again.'
    ],
    beginner: 'Use your finger as a moisture meter. If soil clings to your fingertip at 3 cm depth, wait a few more days.',
    advanced: 'Weigh the pot before and after watering. The difference is roughly how much water the root ball holds — useful for consistent large collections.'
  },
  { id: 'sunlight', title: 'Sunlight', icon: 'i-sun',
    summary: 'Read your room’s light and match it to the right plant.',
    body: [
      '“Bright indirect light” means a spot close to a window that never receives harsh midday sun directly on the leaves. “Direct light” means sunbeams actually touch the plant.',
      'Light falls off quickly with distance from a window: a spot two metres into a room may receive a fraction of the light available at the glass.',
      'Rotate pots a quarter-turn each week so growth stays even, and move plants gradually — sudden full sun can scorch shade-adapted leaves.'
    ],
    beginner: 'A free phone light-meter app is enough: aim for indirect-bright plants around 2,000–10,000 lux during the day.',
    advanced: 'South and west exposures in India can be intense. Sheer curtains diffuse light without blocking photosynthesis; a light meter reading at noon is the truest measure.'
  },
  { id: 'soil-fertilizer', title: 'Soil & Fertilizer', icon: 'i-soil',
    summary: 'Choose a free-draining mix and feed lightly.',
    body: [
      'Most houseplant problems start below the soil line. Use a mix that holds moisture but drains freely: cocopeat for water retention, compost for nutrition, and grit or perlite for airflow.',
      'Organic feeds are gentle but still salts. Dilute liquid feeds more than the label suggests for indoor plants, and never feed dry or dormant plants.',
      'Top-dressing with vermicompost in spring refreshes soil life and slowly releases nutrients through the season.'
    ],
    beginner: 'A working houseplant mix: 50% cocopeat, 30% compost or vermicompost, 20% perlite or coarse sand.',
    advanced: 'Watch for fertilizer burn — crisped leaf margins and a white crust on the soil surface. Flush the pot with plain water and pause feeding for four to six weeks.'
  },
  { id: 'pruning', title: 'Pruning', icon: 'i-scissors',
    summary: 'Trim with purpose to shape growth and remove problems.',
    body: [
      'Use clean, sharp snips. Cut just above a node (the point where a leaf joins the stem) to encourage branching.',
      'Remove yellowing, damaged or diseased leaves promptly — they waste energy and can harbour pests.',
      'The best time for structural pruning is late winter or early spring, just before new growth begins.'
    ],
    beginner: 'Start small: snip one or two leggy stems and watch where new growth appears over the next two weeks.',
    advanced: 'For flowering species, prune immediately after a flush so the next flowering shoots have time to mature before the season ends.'
  },
  { id: 'repotting', title: 'Repotting', icon: 'i-pot',
    summary: 'When, how, and how not to size up.',
    body: [
      'Roots circling the surface, water running straight through, or visibly crowded drainage holes all signal it is time to repot.',
      'Choose a pot only 2–3 cm wider. Moving to a much larger pot keeps soil wet for too long and risks root rot.',
      'Water the plant the day before, loosen the root ball gently, and keep the new soil line at the same height as before.'
    ],
    beginner: 'Spring is the safest season to repot. Wait a week after repotting before feeding.',
    advanced: 'For root-bound plants, gently comb out the outer roots and trim no more than 10–15% of the root mass on vigorous species such as Monstera.'
  },
  { id: 'pest-management', title: 'Pest Management', icon: 'i-bug',
    summary: 'Spot pests early and respond with the gentlest effective step.',
    body: [
      'Inspect leaf undersides and stem joints weekly. Sticky residue, fine webbing, or tiny insects near new growth are early warnings.',
      'Isolate an affected plant immediately. A shower with plain water removes many pests before any treatment is needed.',
      'Diluted neem oil or insecticidal soap can help with light infestations. Always patch-test and apply at dusk to protect beneficial insects.'
    ],
    beginner: 'Sticky yellow traps are an inexpensive early-warning system for fungus gnats and flying pests.',
    advanced: 'For persistent infestations, treat on a 5–7 day cycle to interrupt the life cycle. Rotate products to prevent resistance.'
  },
  { id: 'leaf-care', title: 'Leaf Care', icon: 'i-leaf',
    summary: 'Clean, inspect and support healthy foliage.',
    body: [
      'Dust blocks light. Wipe smooth leaves monthly with a damp cloth or give them a gentle shower in the bathroom.',
      'Fuzzy or textured leaves (such as African violets) should stay dry — use a soft brush instead of a wet cloth.',
      'Support heavy stems with a moss pole or stake; check ties monthly so they never cut into growing stems.'
    ],
    beginner: 'A weekly leaf inspection while you water is the best habit in plant care.',
    advanced: 'For variegated plants, extra light supports variegation. Revert-and-prune all-green stems promptly — they usually outgrow variegated growth.'
  },
  { id: 'seasonal-care', title: 'Seasonal Care', icon: 'i-calendar',
    summary: 'Adjust for heat, monsoon and cooler months.',
    body: [
      'Growth slows in winter — reduce watering and stop feeding most houseplants until spring.',
      'In hot Indian summers, plants near windows may need more frequent checks and extra humidity.',
      'During monsoon, airflow matters more than watering: move plants to brighter, breezier spots and check saucers for standing water.'
    ],
    beginner: 'Make small seasonal adjustments rather than sudden changes. Observe the plant for a week after any move.',
    advanced: 'Track your humidity and temperature so you can anticipate stress — 45–65% RH and 18–29°C suits most tropical houseplants.'
  }
];
const CARE_TOPIC_BY_ID = Object.fromEntries(CARE_TOPICS.map(t => [t.id, t]));

/**
 * PLANT CARE GUIDES (22 species)
 * Each entry is used by the care centre and product detail modals.
 */
const CARE_GUIDES = [
  {
    id: 'pothos', name: 'Money Plant', sci: 'Epipremnum aureum', img: 'assets/img/pothos.jpg', diff: 'Easy',
    intro: 'The money plant is a trailing tropical vine with glossy, heart-shaped leaves. It adapts to a wide range of light and is one of the most forgiving houseplants you can own.',
    sun: 'Low to bright indirect light. Variegation fades in deep shade; direct sun can scorch leaves.',
    water: 'Water when the top 2–3 cm of soil is dry — typically about once a week indoors. Reduce watering in winter.',
    soil: 'Free-draining mix of cocopeat, compost and perlite.',
    humidity: 'Average home humidity is fine; mist occasionally in dry weather.',
    temp: '18–29°C; avoid cold windows and draughts.',
    fertilizer: 'Balanced organic feed every 4–6 weeks in spring and summer.',
    repot: 'Repot every 1–2 years, or when roots circle the pot.',
    prune: 'Trim vines just above a leaf node to encourage branching; use cuttings to propagate.',
    problems: ['Yellow leaves — usually overwatering.', 'Brown tips — dry air or inconsistent watering.', 'Leggy growth — too little light.'],
    difficulty: 'Easy', pet: 'Toxic to dogs and cats if chewed.',
    beginner: 'Let it trail from a shelf, then pinch the longest vine monthly to keep it full.',
    advanced: 'Propagate in water with a node submerged; roots appear in 10–21 days.'
  },
  {
    id: 'snake-plant', name: 'Snake Plant', sci: 'Dracaena trifasciata', img: 'assets/img/snake-plant-2.jpg', diff: 'Easy',
    intro: 'The snake plant stores water in thick leaves and tolerates low light, dry air and forgetful watering better than almost any other houseplant.',
    sun: 'Very low light to bright indirect light. Avoid harsh midday sun on new growth.',
    water: 'Every 2–3 weeks; in winter, as little as once a month. Always let the soil dry completely.',
    soil: 'Gritty, fast-draining cactus or succulent mix.',
    humidity: 'Tolerates dry indoor air.',
    temp: '18–30°C; protect from cold below 10°C.',
    fertilizer: 'Half-strength feed twice in the growing season — it is not a heavy feeder.',
    repot: 'Only when tightly pot-bound, every 2–3 years.',
    prune: 'Cut damaged leaves at the base with clean snips.',
    problems: ['Mushy base — overwatering.', 'Wrinkled leaves — long dry spell.', 'Leaning leaves — top-heavy or low light.'],
    difficulty: 'Easy', pet: 'Toxic to dogs and cats if ingested.',
    beginner: 'Water only when you cannot remember the last time you watered it. Terracotta helps prevent soggy soil.',
    advanced: 'Divide crowded clumps in spring; each division needs at least two rhizomes to establish.'
  },
  {
    id: 'peace-lily', name: 'Peace Lily', sci: 'Spathiphyllum wallisii', img: 'assets/img/peace-lily.jpg', diff: 'Easy',
    intro: 'A tropical understorey plant with glossy leaves and white spathes. It communicates clearly — drooping when thirsty and perking up within hours of watering.',
    sun: 'Low to medium indirect light. Direct sun scorches leaves.',
    water: 'When the top 2–3 cm is dry, usually weekly. Keep evenly moist but never waterlogged.',
    soil: 'Rich, moisture-retentive mix with good drainage.',
    humidity: 'Higher humidity preferred; brown tips often signal dry air.',
    temp: '18–27°C; avoid cold windowsills.',
    fertilizer: 'Organic liquid feed every 6 weeks in spring and summer.',
    repot: 'Every 2 years in spring.',
    prune: 'Cut spent flowers at the base and remove yellowing leaves.',
    problems: ['Brown tips — low humidity or fertilizer buildup.', 'No flowers — too little light.', 'Drooping — thirsty, or too wet repeatedly.'],
    difficulty: 'Easy', pet: 'Toxic to dogs and cats. Wash hands after handling sap.',
    beginner: 'If it droops dramatically, check the soil. Water only if it is dry — otherwise suspect overwatering.',
    advanced: 'Flush the pot with plain water every few months to remove fertilizer salts that cause tip burn.'
  },
  {
    id: 'monstera', name: 'Monstera Deliciosa', sci: 'Monstera deliciosa', img: 'assets/img/monstera.jpg', diff: 'Moderate',
    intro: 'A climbing tropical with dramatic split leaves. Mature plants develop the fenestrations it is famous for when given good light and support.',
    sun: 'Bright indirect light. A little morning sun is welcome; harsh afternoon sun is not.',
    water: 'Weekly when the top 3–4 cm of soil is dry. Water deeply and let it drain fully.',
    soil: 'Chunky aroid mix — cocopeat, bark, compost and perlite.',
    humidity: '50%+ humidity helps new leaves unfurl cleanly.',
    temp: '18–29°C.',
    fertilizer: 'Organic feed monthly through spring and summer.',
    repot: 'Every 1–2 years; provide a moss pole or stake for support.',
    prune: 'Remove old lower leaves; wipe leaves monthly to keep them glossy.',
    problems: ['No leaf splits — young plant or low light.', 'Yellow edges — overwatering.', 'Brown crispy patches — sunburn or dry air.'],
    difficulty: 'Moderate', pet: 'Toxic to dogs and cats if chewed.',
    beginner: 'A moss pole looks decorative but is functional — roots grip it and leaves grow larger.',
    advanced: 'Air-layer aerial roots into moist sphagnum to encourage larger foliage and a sturdier plant.'
  },
  {
    id: 'spider-plant', name: 'Spider Plant', sci: 'Chlorophytum comosum', img: 'assets/img/spider-plant.jpg', diff: 'Easy',
    intro: 'Arching striped leaves and baby plantlets make the spider plant one of the friendliest houseplants, and it is safe for pets.',
    sun: 'Low to bright indirect light. Best colour in bright, filtered light.',
    water: 'About once a week — when the top 2 cm of soil is dry. Sensitive to fluoride in tap water.',
    soil: 'General-purpose mix with perlite or cocopeat.',
    humidity: 'Adaptable; appreciates occasional misting.',
    temp: '16–27°C.',
    fertilizer: 'Diluted organic feed monthly in spring and summer.',
    repot: 'Every 1–2 years; it has chunky roots that fill pots quickly.',
    prune: 'Trim brown tips diagonally; remove old outer leaves.',
    problems: ['Brown tips — fluoride or dry air.', 'Pale leaves — too little light.', 'Few plantlets — a young or pot-bound plant.'],
    difficulty: 'Easy', pet: 'Non-toxic to dogs and cats.',
    beginner: 'Snip off a plantlet with a little runner and place it in water — it roots in weeks.',
    advanced: 'Water with filtered or rainwater if your tap supply is heavily fluoridated.'
  },
  {
    id: 'zz-plant', name: 'ZZ Plant', sci: 'Zamioculcas zamiifolia', img: 'assets/img/zz-plant.jpg', diff: 'Easy',
    intro: 'The ZZ plant stores water in rhizomes beneath the soil, which makes it unusually tolerant of low light and missed waterings.',
    sun: 'Very low to medium indirect light. Bright light speeds growth.',
    water: 'Every 2–3 weeks; let the soil dry completely between waterings.',
    soil: 'Well-draining mix, ideally with added grit.',
    humidity: 'Average home humidity.',
    temp: '18–28°C; never below 12°C.',
    fertilizer: 'Feed twice a year.',
    repot: 'Every 2–3 years when rhizomes crowd the pot.',
    prune: 'Remove older stems at the base to tidy the shape.',
    problems: ['Yellowing — too much water.', 'Leggy growth — deep shade.', 'Wrinkled stems — extended drought.'],
    difficulty: 'Easy', pet: 'Toxic to dogs and cats if chewed.',
    beginner: 'Err on the side of dry. Standing water in the saucer is the most common cause of failure.',
    advanced: 'Propagate from a single leaflet — slow (months), but reliable at warm temperatures.'
  },
  {
    id: 'areca-palm', name: 'Areca Palm', sci: 'Dypsis lutescens', img: 'assets/img/areca-palm.jpg', diff: 'Moderate',
    intro: 'A clumping palm with feathery fronds, often chosen for its air-purifying reputation. Non-toxic to pets and generous in size.',
    sun: 'Bright indirect light; tolerates some morning sun.',
    water: 'When the top 3 cm is dry — roughly weekly, more in summer.',
    soil: 'Moisture-retentive but free-draining mix.',
    humidity: 'High humidity preferred; brown tips indicate dry air.',
    temp: '18–30°C; avoid AC draughts.',
    fertilizer: 'Organic feed every 6 weeks in the growing season.',
    repot: 'Every 2 years in spring.',
    prune: 'Remove brown fronds at the base; never cut into the crown.',
    problems: ['Brown tips — dry air or inconsistent watering.', 'Yellow fronds — overwatering.', 'Spider mites — dry, dusty conditions.'],
    difficulty: 'Moderate', pet: 'Non-toxic to dogs and cats.',
    beginner: 'Group it with other plants or place it in a humid room to keep frond tips green.',
    advanced: 'Shower the fronds monthly to dislodge dust and mites, then let it dry in a shaded spot.'
  },
  {
    id: 'rubber-plant', name: 'Rubber Plant', sci: 'Ficus elastica', img: 'assets/img/rubber-plant.jpg', diff: 'Easy',
    intro: 'A bold indoor tree with thick, glossy leaves. It responds well to consistent light and a predictable watering rhythm.',
    sun: 'Bright indirect light; some morning sun brings out leaf colour.',
    water: 'Weekly when the top 3 cm is dry. Dislikes both drought and soggy roots.',
    soil: 'Well-draining, compost-rich mix.',
    humidity: 'Average; wipe leaves to keep them glossy.',
    temp: '18–28°C; avoid cold draughts and radiators.',
    fertilizer: 'Monthly organic feed in spring and summer.',
    repot: 'Every 2 years.',
    prune: 'Prune in spring to control height; sap is irritating — wear gloves.',
    problems: ['Dropping lower leaves — cold, draught or sudden change.', 'Yellow leaves — overwatering.', 'Sticky residue — scale insects.'],
    difficulty: 'Easy', pet: 'Toxic to dogs and cats. Sap irritates skin.',
    beginner: 'Keep its position stable — this ficus dislikes being moved around.',
    advanced: 'Notch the stem above a node in spring to encourage branching on a single-stem plant.'
  },
  {
    id: 'calathea', name: 'Calathea Orbifolia', sci: 'Calathea orbifolia', img: 'assets/img/calathea.jpg', diff: 'Challenging',
    intro: 'A patterned prayer plant that folds its leaves at dusk. Beautiful but sensitive — it is a rewarding plant for attentive growers.',
    sun: 'Low to medium indirect light. Direct sun bleaches and curls leaves.',
    water: 'Keep evenly moist; water when the top 1–2 cm dries. Use filtered water.',
    soil: 'Light, airy mix that holds moisture without compacting.',
    humidity: 'High humidity (60%+) is essential.',
    temp: '18–27°C; no cold draughts.',
    fertilizer: 'Very diluted organic feed monthly in summer.',
    repot: 'Every 1–2 years in spring.',
    prune: 'Remove crisped leaves at soil level.',
    problems: ['Crispy edges — dry air.', 'Curl and brown tips — hard tap water.', 'Fading pattern — too little light.'],
    difficulty: 'Challenging', pet: 'Non-toxic to dogs and cats.',
    beginner: 'Start with a bathroom if it has a window — humidity matters more than perfection.',
    advanced: 'Collect rainwater for the most consistent results; avoid letting the mix dry out completely.'
  },
  {
    id: 'fern', name: 'Boston Fern', sci: 'Nephrolepis exaltata', img: 'assets/img/fern.jpg', diff: 'Moderate',
    intro: 'Soft, feathered fronds that love humidity. A bathroom or shaded balcony can be the perfect home.',
    sun: 'Low to medium indirect light.',
    water: 'Keep consistently moist — check every 2–3 days in warm weather.',
    soil: 'Peat-free, moisture-retentive mix.',
    humidity: 'High humidity essential.',
    temp: '16–26°C.',
    fertilizer: 'Half-strength organic feed monthly in summer.',
    repot: 'Every 1–2 years.',
    prune: 'Snip spent fronds at the base.',
    problems: ['Crispy fronds — dry air.', 'Shedding leaflets — under-watering.', 'Yellowing — waterlogged roots.'],
    difficulty: 'Moderate', pet: 'Non-toxic to dogs and cats.',
    beginner: 'Hang it in the bathroom — steam from showers does most of the work.',
    advanced: 'Divide overcrowded crowns in spring to refresh vigour and share plants.'
  },
  {
    id: 'anthurium', name: 'Anthurium', sci: 'Anthurium andraeanum', img: 'assets/img/anthurium.jpg', diff: 'Moderate',
    intro: 'A tropical bloomer with waxy red spathes and glossy heart-shaped leaves. Long-lasting flowers make it a favourite gift plant.',
    sun: 'Medium to bright indirect light. Direct sun bleaches the spathes.',
    water: 'Weekly when the top 2–3 cm of soil is dry.',
    soil: 'Chunky, orchid-style mix with excellent drainage.',
    humidity: 'High humidity; mist aerial roots.',
    temp: '20–29°C.',
    fertilizer: 'Organic feed every 6 weeks in spring and summer.',
    repot: 'Every 2 years in spring.',
    prune: 'Remove faded spathes to redirect energy to new blooms.',
    problems: ['Brown edges — low humidity.', 'No flowers — insufficient light.', 'Yellow leaves — soggy soil.'],
    difficulty: 'Moderate', pet: 'Toxic to dogs and cats.',
    beginner: 'Keep the pot snug — anthuriums flower better slightly root-bound.',
    advanced: 'A 2:1 mix of bark and cocopeat with a spoonful of compost mimics their epiphytic roots best.'
  },
  {
    id: 'hibiscus', name: 'Hibiscus', sci: 'Hibiscus rosa-sinensis', img: 'assets/img/hibiscus.jpg', diff: 'Moderate',
    intro: 'A sun-loving shrub with large, short-lived blooms. With warmth, feeding and consistent water, it flowers almost year-round in India.',
    sun: 'Bright light with several hours of direct sun.',
    water: 'Frequent in summer — daily in peak heat if in a small pot; when the top 2 cm dries.',
    soil: 'Rich, well-draining mix; top-dress with compost monthly.',
    humidity: 'Tolerates humidity well; airflow matters.',
    temp: '20–35°C; protect below 10°C.',
    fertilizer: 'Organic feed fortnightly during the flowering season.',
    repot: 'Every 1–2 years in spring.',
    prune: 'Prune lightly after each flush of flowers.',
    problems: ['Bud drop — inconsistent watering or heat stress.', 'Aphids on new shoots.', 'Yellow leaves — poor drainage.'],
    difficulty: 'Moderate', pet: 'Non-toxic to dogs and cats.',
    beginner: 'Deadhead spent flowers daily — it triggers the next flush.',
    advanced: 'A high-potash organic feed during bud formation supports larger, longer-lasting blooms.'
  },
  {
    id: 'jasmine', name: 'Arabian Jasmine', sci: 'Jasminum sambac', img: 'assets/img/jasmine.jpg', diff: 'Moderate',
    intro: 'The fragrant mogra with small white blooms that scent the evening air. A traditional Indian balcony plant.',
    sun: 'Bright light with direct morning sun.',
    water: 'When the top 2–3 cm is dry — often daily in summer for potted plants.',
    soil: 'Well-draining, slightly acidic mix.',
    humidity: 'Average to high humidity.',
    temp: '20–35°C.',
    fertilizer: 'Organic feed every 3–4 weeks in the growing season.',
    repot: 'Every 2 years.',
    prune: 'Prune after flowering to encourage new flowering shoots.',
    problems: ['Few flowers — too much shade.', 'Spider mites — dry indoor air.', 'Yellow leaves — waterlogging.'],
    difficulty: 'Moderate', pet: 'Mildly toxic if ingested — keep out of reach of pets.',
    beginner: 'More sun equals more flowers. South-facing balconies are ideal.',
    advanced: 'Pinch long new shoots at 2–3 leaf pairs to build flowering spurs rather than vine growth.'
  },
  {
    id: 'bonsai', name: 'Ficus Bonsai', sci: 'Ficus retusa', img: 'assets/img/bonsai.jpg', diff: 'Challenging',
    intro: 'A miniature tree shaped over years. Bonsai care is about rhythm — steady light, precise watering and patient shaping.',
    sun: 'Bright indirect light with some direct morning sun.',
    water: 'Check daily in summer; water when the top 1 cm dries.',
    soil: 'Coarse bonsai substrate that drains fast but holds some moisture.',
    humidity: 'Moderate humidity; a pebble tray helps.',
    temp: '18–30°C.',
    fertilizer: 'Bonsai feed every 2 weeks in the growing season.',
    repot: 'Every 2–3 years with root pruning in spring.',
    prune: 'Regular pinching and wiring to maintain silhouette.',
    problems: ['Leaf drop — sudden changes in position or water.', 'Dry soil for a day can scorch foliage.', 'Wire scarring — remove wire before it bites.'],
    difficulty: 'Challenging', pet: 'Toxic to dogs and cats.',
    beginner: 'Watering is the whole craft. Test the surface twice a day in summer and never let it dry completely.',
    advanced: 'Defoliate in early summer to reduce leaf size and increase ramification on vigorous ficus cultivars.'
  },
  {
    id: 'eucalyptus', name: 'Silver Eucalyptus', sci: 'Eucalyptus cinerea', img: 'assets/img/eucalyptus.jpg', diff: 'Moderate',
    intro: 'Silvery-blue rounded leaves with a clean, medicinal scent. It needs light and airflow — stuffy rooms cause trouble.',
    sun: 'Bright light with several hours of direct sun.',
    water: 'When the top 2–3 cm is dry — typically weekly.',
    soil: 'Gritty, fast-draining mix.',
    humidity: 'Low to average; dislikes enclosed, humid spaces.',
    temp: '15–30°C.',
    fertilizer: 'Light organic feed monthly in the growing season.',
    repot: 'Annually — it grows fast.',
    prune: 'Pinch tips for bushiness; harvest stems regularly.',
    problems: ['Leggy growth — insufficient light.', 'Drooping — dry roots.', 'Leaf drop — poor airflow or abrupt changes.'],
    difficulty: 'Moderate', pet: 'Toxic to dogs and cats if ingested.',
    beginner: 'Treat it like a sun-loving shrub, not a rainforest plant.',
    advanced: 'Coppice stems back hard in spring for fresh juvenile foliage with the strongest scent.'
  },
  {
    id: 'aloe-vera', name: 'Aloe Vera', sci: 'Aloe vera', img: 'assets/img/aloe-vera.jpg', diff: 'Easy',
    intro: 'A medicinal succulent with gel-filled leaves. It usually fails from too much care rather than too little.',
    sun: 'Bright light with some direct sun; acclimatise gradually.',
    water: 'Every 2–3 weeks; let the soil dry completely between waterings.',
    soil: 'Gritty cactus mix with pumice or coarse sand.',
    humidity: 'Low humidity.',
    temp: '18–32°C; protect from frost.',
    fertilizer: 'Rarely needed — once in spring if repotting.',
    repot: 'Every 2–3 years, or when pups crowd the pot.',
    prune: 'Harvest outer leaves at the base.',
    problems: ['Mushy stem — overwatering.', 'Thin, curled leaves — very dry.', 'Yellow-brown patches — sunburn after sudden exposure.'],
    difficulty: 'Easy', pet: 'Toxic to dogs and cats if ingested.',
    beginner: 'Terracotta pot + gritty mix + morning sun = a happy aloe.',
    advanced: 'Separate pups when they are at least a third of the parent size — they root quickly in dry conditions.'
  },
  {
    id: 'jade-plant', name: 'Jade Plant', sci: 'Crassula ovata', img: 'assets/img/jade-plant.jpg', diff: 'Easy',
    intro: 'A slow-growing succulent shrub with plump leaves. In time it forms a small tree with a thick trunk.',
    sun: 'Bright light with several hours of direct sun.',
    water: 'Every 2–3 weeks; dry soil between waterings.',
    soil: 'Free-draining succulent mix.',
    humidity: 'Low humidity.',
    temp: '16–28°C; a cool, dry winter rest encourages flowering.',
    fertilizer: 'Succulent feed twice in the growing season.',
    repot: 'Every 2–3 years.',
    prune: 'Pinch growing tips for a compact shape.',
    problems: ['Leaf drop — overwatering.', 'Stretching — weak light.', 'Soft black stems — rot.'],
    difficulty: 'Easy', pet: 'Toxic to dogs and cats.',
    beginner: 'Avoid watering on a schedule — wait until the soil and pot feel light.',
    advanced: 'Prune in spring to develop a trunk. Cuttings callus for 2–3 days before potting in dry grit.'
  },
  {
    id: 'echeveria', name: 'Echeveria Rosette', sci: 'Echeveria elegans', img: 'assets/img/echeveria.jpg', diff: 'Easy',
    intro: 'A geometric, powder-blue rosette. Compact and pet-safe, it looks best in a bright spot with dry air.',
    sun: 'Bright light with direct sun for compact form.',
    water: 'Every 2 weeks; never let water sit in the rosette.',
    soil: 'Quick-draining succulent mix.',
    humidity: 'Low humidity.',
    temp: '15–28°C.',
    fertilizer: 'Diluted succulent feed 2–3 times in spring and summer.',
    repot: 'Every 2 years.',
    prune: 'Remove dried lower leaves; separate offsets to propagate.',
    problems: ['Stretching — low light.', 'Rot — water in the crown.', 'Powdery farina loss — handling the leaves.'],
    difficulty: 'Easy', pet: 'Non-toxic to dogs and cats.',
    beginner: 'Water the soil, never the plant. Use a narrow spout.',
    advanced: 'Leaf propagation: twist off a clean leaf, let it callus, lay it on dry mix and wait for a tiny rosette.'
  },
  {
    id: 'haworthia', name: 'Zebra Haworthia', sci: 'Haworthiopsis fasciata', img: 'assets/img/haworthia.jpg', diff: 'Easy',
    intro: 'A compact, striped rosette that copes with more shade than most succulents. Ideal for desks and north-facing rooms.',
    sun: 'Low to bright indirect light.',
    water: 'Every 2–3 weeks; dry soil between waterings.',
    soil: 'Gritty mix with excellent drainage.',
    humidity: 'Low humidity.',
    temp: '16–28°C.',
    fertilizer: 'Twice a year is plenty.',
    repot: 'Every 2 years or when offsets appear.',
    prune: 'Remove dry leaves from the base.',
    problems: ['Soft leaves — overwatering.', 'Fading stripes — deep shade.', 'Slow growth — normal; it is a slow species.'],
    difficulty: 'Easy', pet: 'Non-toxic to dogs and cats.',
    beginner: 'A very forgiving first succulent for low-light rooms.',
    advanced: 'Offsets can be separated with a clean knife once they have visible roots of their own.'
  },
  {
    id: 'golden-barrel-cactus', name: 'Golden Barrel Cactus', sci: 'Echinocactus grusonii', img: 'assets/img/golden-barrel-cactus.jpg', diff: 'Easy',
    intro: 'A ribbed globe of golden spines. It grows slowly, needs almost nothing, and makes a sculptural statement.',
    sun: 'Direct sunlight — the more the better.',
    water: 'Every 3–4 weeks in summer; barely at all in winter.',
    soil: 'Very gritty cactus mix; terracotta helps.',
    humidity: 'Low humidity.',
    temp: '18–35°C.',
    fertilizer: 'Cactus feed once in spring.',
    repot: 'Every 3 years; use gloves and tongs.',
    prune: 'None needed.',
    problems: ['Base rot — excess water.', 'Spines are sharp — keep away from pets and children.'],
    difficulty: 'Easy', pet: 'Non-toxic, but spines are a physical hazard.',
    beginner: 'Place it where you will not brush past it — the spines are unforgiving.',
    advanced: 'In a warm, bright spot with careful watering it eventually produces small yellow flowers at the crown.'
  },
  {
    id: 'tulsi', name: 'Tulsi (Holy Basil)', sci: 'Ocimum tenuiflorum', img: 'assets/img/tulsi.jpg', diff: 'Easy',
    intro: 'A sacred, aromatic herb with medicinal tradition. Fast-growing, generous with leaves, and easy to keep in a sunny balcony pot.',
    sun: 'Bright light with 4–6 hours of direct sun.',
    water: 'Daily in summer for small pots; when the top 2 cm dries otherwise.',
    soil: 'Rich, well-draining mix with compost.',
    humidity: 'Tolerates humid weather; airflow is important.',
    temp: '20–35°C.',
    fertilizer: 'Compost top-dress monthly; light organic feed occasionally.',
    repot: 'Replant annually in fresh mix.',
    prune: 'Pinch flower buds and tips to keep leaves tender.',
    problems: ['Leggy stems — no pinching.', 'Wilting in hot afternoons — small pot, thirsty roots.', 'Aphids on new growth.'],
    difficulty: 'Easy', pet: 'Non-toxic to dogs and cats.',
    beginner: 'The more you harvest, the bushier it becomes.',
    advanced: 'Remove flower spikes immediately for the sweetest leaves; allow only a few to set seed at season’s end.'
  },
  {
    id: 'mint', name: 'Mint', sci: 'Mentha spicata', img: 'assets/img/mint.jpg', diff: 'Easy',
    intro: 'Vigorous and fragrant, mint is best kept in its own pot — it spreads aggressively by underground runners.',
    sun: 'Medium to bright light; tolerates morning sun.',
    water: 'Frequent — check every 1–2 days in summer.',
    soil: 'Moisture-retentive mix with compost.',
    humidity: 'Average to high.',
    temp: '15–28°C.',
    fertilizer: 'Light organic feed every 4 weeks.',
    repot: 'Divide and refresh every year.',
    prune: 'Harvest tips often to keep growth soft and bushy.',
    problems: ['Wilting — dry soil.', 'Rust spots — poor airflow.', 'Tasteless leaves — flowering stems.'],
    difficulty: 'Easy', pet: 'Generally safe, though large amounts can upset pets — keep out of reach.',
    beginner: 'Keep it separate from other herbs; it will happily take over a shared pot.',
    advanced: 'Runners root readily in water — a steady supply of fresh plants from one pot.'
  },
  {
    id: 'rosemary', name: 'Rosemary', sci: 'Salvia rosmarinus', img: 'assets/img/rosemary.jpg', diff: 'Moderate',
    intro: 'A woody Mediterranean herb that wants sun, grit and air around its roots. It suffers most from overwatering and still air.',
    sun: 'Bright light with several hours of direct sun.',
    water: 'When the top 3 cm is dry — roughly weekly.',
    soil: 'Gritty, free-draining mix that never stays soggy.',
    humidity: 'Low humidity.',
    temp: '15–30°C.',
    fertilizer: 'Light organic feed twice in the growing season.',
    repot: 'Every 2 years in spring.',
    prune: 'Trim after flowering; never cut into bare old wood.',
    problems: ['Powdery mildew — still, humid air.', 'Root rot — heavy soil.', 'Brown needles — drought.'],
    difficulty: 'Moderate', pet: 'Non-toxic to dogs and cats.',
    beginner: 'Water less than you think. Let the pot dry out between waterings.',
    advanced: 'A 30% grit mix and a clay pot give the root zone the drainage this species demands.'
  }
];
const CARE_GUIDE_BY_PLANT = Object.fromEntries(CARE_GUIDES.map(g => [g.id, g]));

/* Short, chip-sized light/water labels for the care cards (full sentences live in the modal) */
const CARE_SHORT = {
  pothos: { sun: 'Low–bright indirect', water: 'Weekly' },
  'snake-plant': { sun: 'Very low–bright', water: 'Every 2–3 weeks' },
  'peace-lily': { sun: 'Low–medium', water: 'Weekly' },
  monstera: { sun: 'Bright indirect', water: 'Weekly' },
  'spider-plant': { sun: 'Low–bright indirect', water: 'Weekly' },
  'zz-plant': { sun: 'Very low–medium', water: 'Every 2–3 weeks' },
  'areca-palm': { sun: 'Bright indirect', water: 'Weekly' },
  'rubber-plant': { sun: 'Bright indirect', water: 'Weekly' },
  calathea: { sun: 'Low–medium', water: 'Keep evenly moist' },
  fern: { sun: 'Low–medium', water: 'Every 2–3 days' },
  anthurium: { sun: 'Medium–bright', water: 'Weekly' },
  hibiscus: { sun: 'Full sun', water: 'Daily in summer' },
  jasmine: { sun: 'Full sun', water: 'Daily in summer' },
  bonsai: { sun: 'Bright indirect', water: 'Check daily' },
  eucalyptus: { sun: 'Full sun', water: 'Weekly' },
  'aloe-vera': { sun: 'Bright, some direct', water: 'Every 2–3 weeks' },
  'jade-plant': { sun: 'Bright, direct', water: 'Every 2–3 weeks' },
  echeveria: { sun: 'Bright, direct', water: 'Every 2 weeks' },
  haworthia: { sun: 'Low–bright indirect', water: 'Every 2–3 weeks' },
  'golden-barrel-cactus': { sun: 'Direct sunlight', water: 'Every 3–4 weeks' },
  tulsi: { sun: 'Full sun', water: 'Daily in summer' },
  mint: { sun: 'Medium–bright', water: 'Every 1–2 days' },
  rosemary: { sun: 'Full sun', water: 'Weekly' }
};

/* Symptom rules for the plant problem identifier */
const SYMPTOMS = [
  { id: 'yellow', label: 'Yellow leaves', causes: [
    { title: 'Overwatering', likelihood: 'common', inspect: 'Check if the soil is wet several centimetres down and whether the saucer holds water. Look for soft, dark stems at the base.',
      action: 'Stop watering until the top 3–4 cm dries. Empty the saucer, move the plant to a brighter spot, and ensure the pot drains freely.',
      prevent: 'Water based on soil moisture, not a calendar. Use a pot with drainage and a free-draining mix.' },
    { title: 'Underwatering', likelihood: 'possible', inspect: 'Is the soil dry all the way through? Do leaves feel thin and papery before turning yellow and crisp?',
      action: 'Water thoroughly until it runs from the drainage holes. Soak the root ball in a basin for 15 minutes if the soil has become water-repellent.',
      prevent: 'Check moisture weekly; use a saucer and water deeply rather than little and often.' },
    { title: 'Nutrient deficiency', likelihood: 'possible', inspect: 'Are older, lower leaves yellowing while new growth is pale? Has the plant gone a long time without feeding or repotting?',
      action: 'Feed with a diluted organic fertilizer and top-dress with compost. Refresh the potting mix if it has been two or more years.',
      prevent: 'Feed lightly during the growing season and refresh soil every one to two years.' },
    { title: 'Natural ageing of older leaves', likelihood: 'common', inspect: 'Is it just the lowest one or two leaves, with healthy new growth above?',
      action: 'No action needed. Gently remove the spent leaves.',
      prevent: 'Keep conditions consistent so the plant is not shedding leaves due to stress.' }
  ] },
  { id: 'brown-tips', label: 'Brown leaf tips', causes: [
    { title: 'Low humidity', likelihood: 'common', inspect: 'Is the air dry — near AC, a heater, or in summer heat? Do tips feel crisp rather than soft?',
      action: 'Group plants together, use a pebble tray, or place in a naturally humid room such as a bathroom.',
      prevent: 'Maintain moderate humidity and keep plants away from direct draughts from AC or heaters.' },
    { title: 'Fertilizer buildup', likelihood: 'possible', inspect: 'Is there a white crust on the soil surface or the pot rim? Have you been feeding more than monthly?',
      action: 'Flush the pot several times with plain water and let it drain completely. Pause feeding for four to six weeks.',
      prevent: 'Dilute feeds more than the label suggests, and flush occasionally.' },
    { title: 'Inconsistent watering', likelihood: 'possible', inspect: 'Does the plant swing between bone dry and soaked? Are tips brown on several leaves at once?',
      action: 'Settle into a moisture-based routine and check the soil every 3–4 days rather than weekly.',
      prevent: 'Water deeply, then wait for the top few centimetres to dry before the next watering.' }
  ] },
  { id: 'drooping', label: 'Drooping leaves', causes: [
    { title: 'Underwatering', likelihood: 'common', inspect: 'Is the soil dry and the pot light? Do leaves recover a few hours after watering?',
      action: 'Water thoroughly and let it drain. Expect recovery within 24 hours for most species.',
      prevent: 'Check moisture more often in hot weather; larger pots hold water longer than small ones.' },
    { title: 'Overwatering / root stress', likelihood: 'common', inspect: 'Is the soil wet and heavy, with soft stems? Does the plant droop even after watering?',
      action: 'Stop watering and let the soil dry down. Check for root rot — brown, mushy roots — and repot in fresh mix if needed.',
      prevent: 'Use draining pots and a porous mix, and never leave the pot standing in water.' },
    { title: 'Heat or transplant shock', likelihood: 'possible', inspect: 'Was the plant just moved, repotted, or placed in strong sun?',
      action: 'Move it to bright indirect light and keep conditions steady for a week or two.',
      prevent: 'Acclimatise plants gradually to new positions, especially after repotting.' }
  ] },
  { id: 'curling', label: 'Curling leaves', causes: [
    { title: 'Thirst or heat stress', likelihood: 'common', inspect: 'Are the leaves curling inward with dry soil and high temperatures?',
      action: 'Water thoroughly and move away from harsh direct sun while it recovers.',
      prevent: 'Protect from peak afternoon sun and water in the morning.' },
    { title: 'Humidity too low', likelihood: 'possible', inspect: 'Is the air conditioning running? Do the leaf edges feel thin and crisp?',
      action: 'Raise local humidity with a pebble tray or by grouping plants.',
      prevent: 'Avoid placing humidity-loving plants near AC vents.' },
    { title: 'Pests (mites or aphids)', likelihood: 'possible', inspect: 'Look closely at leaf undersides and new growth for tiny specks, webbing or distorted tips.',
      action: 'Isolate the plant, wash leaves with plain water, and treat with diluted neem oil at dusk if pests are confirmed.',
      prevent: 'Inspect new plants before adding them to your collection and check leaves weekly.' }
  ] },
  { id: 'white-patches', label: 'White patches', causes: [
    { title: 'Mealybugs', likelihood: 'common', inspect: 'Are the white patches fuzzy or cotton-like, especially in leaf joints?',
      action: 'Remove with a cotton swab dipped in diluted rubbing alcohol, then treat with neem oil. Repeat weekly for 3 weeks.',
      prevent: 'Isolate new plants and inspect joints and undersides regularly.' },
    { title: 'Powdery mildew', likelihood: 'common', inspect: 'Is there a dusting of white powder on leaf surfaces, often in still, humid air?',
      action: 'Improve airflow, remove the worst-affected leaves, and avoid wetting foliage in the evening.',
      prevent: 'Space plants apart and water the soil, not the leaves.' },
    { title: 'Hard water or spray residue', likelihood: 'possible', inspect: 'Do patches wipe off easily, or appear only where mist landed?',
      action: 'Wipe leaves with a damp cloth and switch to filtered or rainwater for misting.',
      prevent: 'Avoid misting species that dislike wet leaves; use filtered water.' }
  ] },
  { id: 'black-spots', label: 'Black spots', causes: [
    { title: 'Fungal leaf spot', likelihood: 'common', inspect: 'Are the spots expanding, with yellow halos, in a humid environment with poor airflow?',
      action: 'Remove affected leaves with clean scissors, increase airflow, and avoid overhead watering.',
      prevent: 'Water at soil level, space plants apart, and clean tools between plants.' },
    { title: 'Cold damage', likelihood: 'possible', inspect: 'Did the plant touch a cold windowpane or sit in a draught?',
      action: 'Remove damaged leaves and move the plant to a stable, warmer position.',
      prevent: 'Keep foliage away from cold glass and draughty doors in winter.' },
    { title: 'Bacterial infection', likelihood: 'possible', inspect: 'Are spots spreading rapidly with a soft, mushy texture and a bad smell?',
      action: 'Isolate immediately, remove affected parts, and discard severely affected plants — bacteria can spread between plants.',
      prevent: 'Sterilise tools, avoid overhead watering, and keep good air circulation.' }
  ] },
  { id: 'slow-growth', label: 'Slow growth', causes: [
    { title: 'Low light', likelihood: 'common', inspect: 'Is the plant in a dim corner several metres from any window?',
      action: 'Move gradually to a brighter spot, a little closer to the window each week.',
      prevent: 'Match light-loving plants to bright positions and rotate pots weekly.' },
    { title: 'Seasonal dormancy', likelihood: 'common', inspect: 'Is it winter or a cool spell? Has the plant simply paused?',
      action: 'Nothing — expect slower growth. Reduce watering and stop feeding until spring.',
      prevent: 'Track seasonal patterns so slow growth does not prompt over-watering.' },
    { title: 'Root-bound or exhausted soil', likelihood: 'possible', inspect: 'Are roots visible at drainage holes? Has it been in the same soil for over two years?',
      action: 'Repot in fresh mix one pot size larger in spring, adding compost.',
      prevent: 'Refresh soil every one to two years and feed during the growing season.' }
  ] },
  { id: 'root-rot', label: 'Root rot', causes: [
    { title: 'Chronic overwatering', likelihood: 'common', inspect: 'Lift the plant: are roots brown and mushy with a sour smell, and the base of the stem soft?',
      action: 'Remove the plant, trim mushy roots with sterilised scissors, and repot in fresh, free-draining soil. Water very sparingly until new growth appears.',
      prevent: 'Always use draining pots, discard saucer water, and water only when the soil indicates it.' },
    { title: 'Poor drainage / no drainage holes', likelihood: 'common', inspect: 'Does the pot lack drainage holes, or is it sitting in a decorative cover that traps water?',
      action: 'Move to a pot with drainage holes; if using a cover pot, empty it after each watering.',
      prevent: 'Choose pots with drainage and a porous potting mix with grit or perlite.' }
  ] },
  { id: 'pests', label: 'Pests visible', causes: [
    { title: 'Aphids, mealybugs or scale', likelihood: 'common', inspect: 'Are there clusters of small insects on new growth, sticky residue, or bumps on stems?',
      action: 'Isolate the plant, wash with plain water and a mild soap solution, then apply diluted neem oil weekly until clear.',
      prevent: 'Inspect new plants and check leaf undersides and joints weekly.' },
    { title: 'Spider mites', likelihood: 'common', inspect: 'Is there fine webbing between leaves, or a speckled, stippled look on the foliage?',
      action: 'Shower the plant thoroughly, raise humidity (mites dislike it), and treat with neem oil at dusk.',
      prevent: 'Avoid very dry, dusty air; mist or group plants that enjoy humidity.' },
    { title: 'Fungus gnats', likelihood: 'possible', inspect: 'Are tiny black flies rising from the soil when you water?',
      action: 'Let the top of the soil dry out and use sticky yellow traps. Improve drainage and reduce watering.',
      prevent: 'Avoid constantly moist soil and organic matter sitting on the surface.' }
  ] },
  { id: 'dry-leaves', label: 'Dry leaves', causes: [
    { title: 'Underwatering', likelihood: 'common', inspect: 'Is the soil pulling away from the sides of the pot? Do leaves feel papery throughout?',
      action: 'Soak the root ball in a basin for 15–20 minutes, then water normally afterwards.',
      prevent: 'Check soil moisture twice a week in warm weather and water deeply.' },
    { title: 'Low humidity', likelihood: 'common', inspect: 'Are only the tips and edges dry while the centre of the leaf is fine?',
      action: 'Raise humidity with a pebble tray or grouping, and move away from AC vents.',
      prevent: 'Maintain moderate humidity, especially for tropical species.' },
    { title: 'Sunburn', likelihood: 'possible', inspect: 'Are the dry patches on the side facing the window, pale and bleached?',
      action: 'Move out of direct sun and remove severely scorched leaves.',
      prevent: 'Acclimatise plants to sun gradually and use a sheer curtain in harsh summers.' }
  ] }
];
const SYMPTOM_BY_ID = Object.fromEntries(SYMPTOMS.map(s => [s.id, s]));

/* ============ 07. DATA — RECOMMENDER CONFIGURATION ============ */
const RECO_QUESTIONS = [
  {
    id: 'location', title: 'Where in the world are you growing?', kicker: 'Location',
    help: 'Optional, and used only as a soft environmental preference — we never claim live weather data.',
    type: 'location'
  },
  {
    id: 'placement', title: 'Where will the plant live?', kicker: 'Placement',
    help: 'This helps us judge light and humidity conditions typical of that room.',
    options: [
      { v: 'Bedroom', icon: 'i-leaf', hint: 'Low light, low traffic' },
      { v: 'Living room', icon: 'i-pot', hint: 'Bright, social spaces' },
      { v: 'Office', icon: 'i-dashboard', hint: 'Indirect light, AC air' },
      { v: 'Balcony', icon: 'i-sun', hint: 'Outdoor light, breeze' },
      { v: 'Kitchen', icon: 'i-soil', hint: 'Humid, warm' },
      { v: 'Bathroom', icon: 'i-drop', hint: 'Highest humidity' },
      { v: 'Outdoor garden', icon: 'i-leaf', hint: 'Full sun, weather' }
    ]
  },
  {
    id: 'sunlight', title: 'How much sunlight does that spot get?', kicker: 'Light',
    help: 'Read your room at midday. “Bright indirect” means near a window without harsh direct beams.',
    options: [
      { v: 'very-low', icon: 'i-drop', hint: 'No natural light, or a small distant window' },
      { v: 'low', icon: 'i-book', hint: 'A north window, or a dim corner' },
      { v: 'medium', icon: 'i-sun', hint: 'Near a window with soft filtered light' },
      { v: 'bright', icon: 'i-sun', hint: 'Close to a sunny window, no direct beams' },
      { v: 'direct', icon: 'i-sparkle', hint: 'Sunbeams actually land on the leaves' }
    ]
  },
  {
    id: 'water', title: 'How often can you realistically water?', kicker: 'Watering',
    help: 'Be honest — plants tolerate irregular watering better than being drowned.',
    options: [
      { v: 'frequent', label: 'Water every day', icon: 'i-drop', hint: 'Thirsty, moisture-loving plants' },
      { v: 'daily2', label: 'Water every 2–3 days', icon: 'i-drop', hint: 'A regular, attentive routine' },
      { v: 'weekly', label: 'Water about once a week', icon: 'i-calendar', hint: 'The most common routine' },
      { v: 'biweekly', label: 'Water every 2 weeks', icon: 'i-clock', hint: 'A relaxed schedule' },
      { v: 'low', label: 'Very little watering', icon: 'i-leaf', hint: 'Only when soil is thoroughly dry' }
    ]
  },
  {
    id: 'experience', title: 'What is your gardening experience?', kicker: 'Experience',
    help: 'No judgement — we match plants to your confidence level.',
    options: [
      { v: 'beginner0', label: 'Complete beginner', icon: 'i-leaf', hint: 'This is my first plant' },
      { v: 'beginner', label: 'Beginner', icon: 'i-pot', hint: 'A few plants so far' },
      { v: 'intermediate', label: 'Intermediate', icon: 'i-book', hint: 'A collection is growing' },
      { v: 'experienced', label: 'Experienced', icon: 'i-scissors', hint: 'I enjoy a challenge' }
    ]
  },
  {
    id: 'maintenance', title: 'How much time can you give each week?', kicker: 'Routine',
    help: 'Daily attention includes checking soil, misting and rotating pots.',
    options: [
      { v: 'minimal', label: 'Less than 5 minutes daily', icon: 'i-clock', hint: 'Set and forget' },
      { v: 'moderate', label: '5–10 minutes daily', icon: 'i-calendar', hint: 'A small routine' },
      { v: 'active', label: '15–20 minutes daily', icon: 'i-drop', hint: 'Enjoying the process' },
      { v: 'devoted', label: 'I love spending time gardening', icon: 'i-scissors', hint: 'Care as a hobby' }
    ]
  },
  {
    id: 'type', title: 'Which plants appeal to you?', kicker: 'Plant type',
    help: 'Choose the style you would enjoy looking at every day.',
    options: [
      { v: 'decorative', label: 'Decorative foliage', icon: 'i-leaf', hint: 'Statement leaves and forms' },
      { v: 'flowering', label: 'Flowering plants', icon: 'i-sparkle', hint: 'Colour and fragrance' },
      { v: 'air', label: 'Air-purifying', icon: 'i-potted', hint: 'Known air-purifying species' },
      { v: 'medicinal', label: 'Medicinal & herbs', icon: 'i-soil', hint: 'Useful, aromatic plants' },
      { v: 'succulents', label: 'Succulents & cacti', icon: 'i-drop', hint: 'Water-wise and sculptural' },
      { v: 'climbing', label: 'Climbing / trailing', icon: 'i-leaf', hint: 'Vines for shelves' },
      { v: 'none', label: 'No preference', icon: 'i-sparkle', hint: 'Surprise me' }
    ]
  },
  {
    id: 'budget', title: 'What is your budget?', kicker: 'Budget',
    help: 'All prices are in Indian Rupees, before delivery.',
    options: [
      { v: 'under200', label: 'Under ₹200', icon: 'i-cart', hint: 'Small starts, herbs and succulents' },
      { v: '200-500', label: '₹200 – ₹500', icon: 'i-cart', hint: 'Most houseplants' },
      { v: '500-1000', label: '₹500 – ₹1,000', icon: 'i-cart', hint: 'Larger plants' },
      { v: '1000-2000', label: '₹1,000 – ₹2,000', icon: 'i-cart', hint: 'Statement plants and bonsai' },
      { v: 'above2000', label: 'Above ₹2,000', icon: 'i-cart', hint: 'A considered collection' }
    ]
  },
  {
    id: 'pets', title: 'Do you have pets at home?', kicker: 'Pet safety',
    help: 'This is a hard filter. Plants known to be toxic to your pets will be excluded, not just down-ranked.',
    options: [
      { v: 'dogs', label: 'Yes, dogs', icon: 'i-paw', hint: 'Toxic plants are excluded' },
      { v: 'cats', label: 'Yes, cats', icon: 'i-paw', hint: 'Toxic plants are excluded' },
      { v: 'both', label: 'Both dogs and cats', icon: 'i-paw', hint: 'Strictest filter applied' },
      { v: 'none', label: 'No pets', icon: 'i-leaf', hint: 'All plants considered' }
    ]
  },
  {
    id: 'size', title: 'What plant size suits your space?', kicker: 'Size',
    help: 'Small fits shelves and desks; large plants anchor a corner.',
    options: [
      { v: 'Small', label: 'Small', icon: 'i-pot', hint: 'Desks and shelves' },
      { v: 'Medium', label: 'Medium', icon: 'i-pot', hint: 'Floor or a sturdy stand' },
      { v: 'Large', label: 'Large', icon: 'i-leaf', hint: 'A statement corner' }
    ]
  },
  {
    id: 'leaf', title: 'What leaf look do you prefer?', kicker: 'Foliage',
    help: 'Colour and pattern are aesthetic preferences — the light and water filters still apply.',
    options: [
      { v: 'Green', label: 'Rich green', icon: 'i-leaf', hint: 'Classic, calming foliage' },
      { v: 'Colorful', label: 'Colourful', icon: 'i-sparkle', hint: 'Burgundy, silver, blooms' },
      { v: 'Patterned', label: 'Patterned / striped', icon: 'i-pot', hint: 'Variegation and stripes' },
      { v: 'Any', label: 'Any', icon: 'i-leaf', hint: 'No preference' }
    ]
  },
  {
    id: 'purpose', title: 'What is the main purpose?', kicker: 'Purpose',
    help: 'This shapes the final ranking — decoration, wellness or simply learning.',
    options: [
      { v: 'Decoration', label: 'Decoration', icon: 'i-pot', hint: 'Beautiful interior greenery' },
      { v: 'Gardening', label: 'Gardening', icon: 'i-soil', hint: 'Hands-on growing' },
      { v: 'Wellness', label: 'Wellness', icon: 'i-heart', hint: 'Calming, useful plants' },
      { v: 'Learning', label: 'Learning', icon: 'i-book', hint: 'Building experience' }
    ]
  }
];

/* ============ 08. DATA — TESTIMONIALS, ARTICLES, LEGAL ============ */
const TESTIMONIALS = [
  { name: 'Ananya Rao', city: 'Bengaluru', rating: 5, product: 'Monstera Deliciosa',
    text: 'The recommender suggested a Monstera for my bright living room and it has been thriving for four months. The care guide answered every nervous first-plant question I had.' },
  { name: 'Rohit Menon', city: 'Kochi', rating: 5, product: 'Snake Plant + Vermicompost',
    text: 'I travel a lot, so the low-maintenance filter mattered. My snake plant has survived three missed waterings without complaint, and the vermicompost was genuinely good quality.' },
  { name: 'Priya Sharma', city: 'Chandigarh', rating: 4, product: 'Peace Lily',
    text: 'I love that it tells me when it is thirsty. The dashboard reminders helped me notice I was watering too often — the yellow-leaf checklist was spot on.' },
  { name: 'Kabir Singh', city: 'Jaipur', rating: 5, product: 'Tulsi + Terracotta Pots',
    text: 'Ordered tulsi for my balcony and it arrived beautifully packed. The guide on pinching flower buds has kept my leaves tender and the plant bushy all summer.' },
  { name: 'Meera Iyer', city: 'Chennai', rating: 4, product: 'Calathea Orbifolia',
    text: 'Honest advice — the care guide was upfront that calatheas are fussy. That honesty is exactly why I trusted the product pages.' },
  { name: 'Arjun Patel', city: 'Ahmedabad', rating: 5, product: 'ZZ Plant',
    text: 'The pet-safety filter excluded exactly the plants my vet warned me about. That single feature sold me on the whole store.' }
];

const ARTICLES = {
  watering: {
    title: 'How to water indoor plants',
    body: [
      'Watering is the skill most new plant parents worry about, and the one where fixed schedules cause the most damage. A plant that is watered every Sunday in winter may be sitting in waterlogged soil, while the same plant in summer may be dry by Wednesday.',
      '**Test before you water.** Push a finger 2–4 cm into the soil. If it feels damp, wait. If it feels dry at that depth, water thoroughly until a little runs from the drainage holes, then empty the saucer.',
      '**Water deeply, not often.** A thorough soak encourages deep roots. Repeated small splashes keep only the surface moist and leave salts accumulating around the root ball.',
      '**Match the plant to the routine.** Succulents and snake plants want to dry out completely between waterings. Ferns, calatheas and peace lilies prefer soil that stays lightly moist. Size matters too: a small terracotta pot dries far faster than a large glazed one.',
      '**Season changes everything.** Growth slows in winter, so most houseplants need noticeably less water — sometimes half. In an Indian summer, pots near sunny windows may need checking every other day.'
    ],
    tips: ['Water in the morning so excess moisture can evaporate during the day.', 'Let tap water stand overnight if you want to reduce chlorine.', 'When in doubt, wait a day — overwatering kills far more houseplants than underwatering.']
  },
  sunlight: {
    title: 'Understanding sunlight requirements',
    body: [
      '“Bright indirect light” is the phrase that confuses everyone. It simply means a position near a window where the plant receives plenty of ambient light, but the sun’s rays never land directly on the leaves for long.',
      '**Read your room.** Direct light means sunbeams visibly hit the plant. Bright indirect means it is close to a window but shaded — by a sheer curtain, a wall, or the angle of the sun. Medium light is a couple of metres in. Low light is a corner where you would struggle to read a book at midday.',
      '**Light drops fast with distance.** Move a plant two metres back from a window and it may receive a small fraction of the light available at the glass. This is why a “sunny room” can still have a very dim corner.',
      '**Match species to exposure.** Snake plants and ZZ plants cope with low light. Monstera, rubber plants and palms want bright indirect light. Succulents, hibiscus and tulsi need real direct sun.',
      '**Acclimatise gradually.** Moving a shade-loving plant straight into harsh sun scorches leaves. Shift it a little closer to the light each week instead.'
    ],
    tips: ['Rotate pots a quarter turn weekly for even growth.', 'Wipe dusty leaves — dust can cut the light reaching the leaf by a surprising amount.', 'In harsh summers, a sheer curtain can diffuse intense window sun.']
  },
  problems: {
    title: 'Common houseplant problems',
    body: [
      'Almost every houseplant problem announces itself in the leaves — but the same symptom can have several causes. The trick is to look at the whole plant: the soil, the pot, the light, and the pattern of damage.',
      '**Yellow leaves** are the classic cry for help. Consistently wet soil points to overwatering. Bone-dry soil points to underwatering. Yellowing only on the oldest leaves is often just natural ageing.',
      '**Brown, crispy tips** usually mean dry air or erratic watering. A white crust on the soil suggests fertilizer buildup — flush the pot with plain water and pause feeding.',
      '**Pests** hide on leaf undersides and in the joints where leaves meet stems. Sticky residue, fine webbing or cottony patches mean it is time to isolate the plant and act.',
      '**Drooping** is ambiguous: plants droop when thirsty and also when waterlogged. Check the soil before watering — it is the single most useful diagnostic habit you can build.'
    ],
    tips: ['Inspect plants weekly while you water — early detection is everything.', 'Isolate any plant with pests immediately.', 'Use the problem identifier in the Plant Care Centre to explore possible causes.']
  }
};

const LEGAL_CONTENT = {
  privacy: {
    title: 'Privacy policy (demonstration)',
    body: `<div class="prose">
      <p>This is a demonstration store. It runs on a Node.js server that stores orders, contact messages and newsletter sign-ups in local JSON files. There is no analytics and no third-party tracking script.</p>
      <h3>What this site stores</h3>
      <ul>
        <li><strong>What lives where.</strong> Your cart, wishlist, questionnaire answers, saved plants, journal notes and order confirmations stay in your browser’s LocalStorage. Orders you place, contact messages and newsletter sign-ups are sent to the Verdant server and stored in its <code>data/</code> folder so the administrator can review them.</li>
        <li><strong>Nothing is transmitted.</strong> No data is sent to a server, because there is no server. Refreshing or reopening the page keeps your data; clearing site data removes it.</li>
        <li><strong>No payment data.</strong> The checkout is a simulation. Do not enter real card numbers, UPI IDs or PINs anywhere on this site.</li>
      </ul>
      <h3>Third-party resources</h3>
      <p>Google Fonts may be requested to display the typefaces. All photographs are served from this project folder.</p>
      <div class="callout">To delete everything this site has stored, open your browser settings → site data → remove data for this page.</div>
    </div>`
  },
  terms: {
    title: 'Terms & conditions (demonstration)',
    body: `<div class="prose">
      <p>This website is a demonstration project built with HTML, CSS and vanilla JavaScript. It is not a real commercial store.</p>
      <h3>No real transactions</h3>
      <ul>
        <li>Prices, stock levels and reviews are sample data created for demonstration purposes.</li>
        <li>Placing an order generates a demo order ID locally. No payment is taken, no order is shipped and no confirmation email is sent.</li>
        <li>Newsletter and contact forms validate input and store it locally; they do not send messages anywhere.</li>
      </ul>
      <h3>Plant care information</h3>
      <p>Care guidance is general and educational. Plant performance depends on species, local climate, light, pot size, soil and water quality. Always verify pet toxicity information for your specific animals before purchase, and consult a qualified horticulturist for serious plant health issues.</p>
      <h3>Availability</h3>
      <p>Since data lives in your browser, clearing site data permanently removes your cart, wishlist, saved plants and demo order history.</p>
    </div>`
  },
  shipping: {
    title: 'Delivery & returns (demonstration)',
    body: `<div class="prose">
      <p>These policies describe how the demonstration store is designed to behave.</p>
      <h3>Delivery</h3>
      <ul>
        <li>Free delivery is applied to demo carts of ₹999 or more.</li>
        <li>Below that threshold a flat ₹79 delivery fee is shown in the cart and checkout summaries.</li>
        <li>A “Grow More” discount of 10% (maximum ₹200) is applied to carts of ₹1,500 or more.</li>
      </ul>
      <h3>Returns</h3>
      <p>Real nurseries usually offer a short live-plant guarantee. Here, no orders are fulfilled, so no returns process exists — this text simply shows where such a policy would appear.</p>
      <div class="callout">Because nothing is actually shipped, no refunds, replacements or courier tracking apply to demo orders.</div>
    </div>`
  },
  accessibility: {
    title: 'Accessibility statement',
    body: `<div class="prose">
      <p>This demonstration site is designed with accessibility in mind.</p>
      <ul>
        <li><strong>Semantic HTML</strong> with a logical heading order, landmarks and a skip-to-content link.</li>
        <li><strong>Keyboard support</strong> for all controls, including a focus trap in dialogs and Escape-to-close.</li>
        <li><strong>Visible focus states</strong> and generous hit areas on interactive elements.</li>
        <li><strong>Labelled form fields</strong> with inline error messages and required-field indicators.</li>
        <li><strong>Reduced-motion support</strong> via the <code>prefers-reduced-motion</code> media query.</li>
        <li><strong>Colour contrast</strong> checked for body text and interface elements.</li>
      </ul>
      <p>If you encounter a barrier while using this demo, the contact form is the place to record it locally.</p>
    </div>`
  }
};

const CARE_TIPS = {
  pothos: 'Money plants root readily from stem cuttings — a healthy vine can become five new plants within a month.',
  'snake-plant': 'Snake plants open their pores at night, releasing oxygen — a welcome bedroom companion.',
  monstera: 'New Monstera leaves emerge closed. Do not unfurl them by hand — a torn leaf will not repair.',
  'zz-plant': 'The ZZ plant grows rhizomes underground that store water, which is why overwatering is its main risk.',
  'peace-lily': 'A peace lily that droops and then perks up within hours of watering is telling you about its watering routine.',
  'spider-plant': 'Spider plantlets can be rooted in water while still attached to the mother plant — an easy natural experiment.',
  tulsi: 'Pinching tulsi flower buds keeps the leaves sweet and the plant bushy through the season.',
  'aloe-vera': 'Aloe gel is most potent in the outer, mature leaves. Harvest from the base rather than the tips.'
};

/* ============ 09. ROUTER (hash based) ============ */
const VIEWS = ['home', 'shop', 'categories', 'care', 'recommender', 'about', 'contact', 'wishlist', 'cart', 'checkout', 'confirmation', 'dashboard'];

function parseRoute() {
  const raw = (location.hash || '#/home').replace(/^#\/?/, '');
  const [pathPart, queryPart] = raw.split('?');
  const segments = pathPart.split('/').filter(Boolean);
  const view = VIEWS.includes(segments[0]) ? segments[0] : 'home';
  const params = new URLSearchParams(queryPart || '');
  return { view, params, hashTarget: segments[1] || '' };
}

/** Normalise any route input ('/shop', '#/shop', 'shop', '#//shop') to a single '#/path'. */
function navigate(path) {
  const clean = String(path || '').replace(/^#+/, '').replace(/^\/+/, '');
  const next = '#/' + clean;
  if (location.hash === next) { handleRoute(); return; }
  location.hash = next;
}

function showView(view) {
  $$('.view').forEach(section => {
    section.hidden = section.dataset.view !== view;
  });
  $$('.nav__link').forEach(link => {
    const target = link.dataset.nav;
    const active = target === view ||
      (view === 'shop' && target === 'shop') ||
      (view === 'categories' && target === 'categories');
    link.classList.toggle('is-active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  document.title = viewTitles[view] || 'Verdant — Organic Plant Nursery';
  state.currentView = view;

  // Suppress entrance animations for one frame after a view switch so the page
  // settles instantly and clicks land on the element the user actually sees.
  const main = $('#main');
  if (main) {
    main.classList.add('is-switching');
    setTimeout(() => main.classList.remove('is-switching'), 260);
  }
}

const viewTitles = {
  home: 'Verdant — Organic Plant Nursery & Houseplant Care',
  shop: 'Shop plants & gardening essentials — Verdant',
  categories: 'Plant categories — Verdant',
  care: 'Plant Care Centre — Verdant',
  recommender: 'Find your perfect plant — Verdant Recommender',
  about: 'About Verdant — Organic Plant Nursery',
  contact: 'Contact the nursery — Verdant',
  wishlist: 'Your wishlist — Verdant',
  cart: 'Shopping cart — Verdant',
  checkout: 'Checkout (demo) — Verdant',
  confirmation: 'Order confirmed (demo) — Verdant',
  dashboard: 'My plant dashboard — Verdant'
};

function handleRoute() {
  const { view, params, hashTarget } = parseRoute();
  closeMobileNav();
  closeHeaderSearch();

  if (view === 'checkout' && state.cart.length === 0) {
    navigate('/cart');
    toast('Your cart is empty', 'Add a plant before checking out.', 'warn');
    return;
  }

  showView(view);

  if (view === 'shop') {
    if (params.get('category')) {
      const cat = params.get('category');
      if (CATEGORY_BY_ID[cat]) {
        state.filters.categories = [cat];
        syncFilterUI();
      }
    }
    if (params.get('q') !== null) {
      state.filters.q = params.get('q') || '';
      const input = $('#shopSearch');
      if (input) input.value = state.filters.q;
    }
    renderShop();
  }
  if (view === 'home') renderHome();
  if (view === 'categories') renderCategoryCards($('#allCategoryGrid'), 'large');
  if (view === 'care') { renderCareTopics(); renderCareGuides(); }
  if (view === 'recommender') initRecommender();
  if (view === 'wishlist') renderWishlist();
  if (view === 'cart') renderCart();
  if (view === 'checkout') renderCheckout();
  if (view === 'confirmation') renderConfirmation();
  if (view === 'dashboard') renderDashboard();

  // Opportunistically refresh prices/stock so admin edits show up without a hard reload.
  refreshCatalogueSoon();

  window.scrollTo({ top: 0, behavior: 'instant' in document.documentElement.style ? 'instant' : 'auto' });
  if (hashTarget) {
    const el = document.getElementById(hashTarget);
    if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }
}

/* ============ 10. HEADER · NAV · TOASTS · MODAL SHELL ============ */
function closeMobileNav() {
  const nav = $('#primaryNav');
  const toggle = $('#menuToggle');
  const scrim = $('#navScrim');
  if (!nav) return;
  nav.classList.remove('is-open');
  if (toggle) { toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-label', 'Open menu'); }
  if (scrim) scrim.hidden = true;
  document.body.classList.remove('is-locked');
}
function openMobileNav() {
  const nav = $('#primaryNav');
  const toggle = $('#menuToggle');
  const scrim = $('#navScrim');
  nav.classList.add('is-open');
  toggle.setAttribute('aria-expanded', 'true');
  toggle.setAttribute('aria-label', 'Close menu');
  scrim.hidden = false;
  document.body.classList.add('is-locked');
  const firstLink = nav.querySelector('.nav__link');
  if (firstLink) setTimeout(() => firstLink.focus({ preventScroll: true }), 120);
}
function closeHeaderSearch() {
  const panel = $('#headerSearch');
  const toggle = $('#searchToggle');
  if (!panel || panel.hidden) return;
  panel.hidden = true;
  toggle.setAttribute('aria-expanded', 'false');
}
function openHeaderSearch() {
  const panel = $('#headerSearch');
  const toggle = $('#searchToggle');
  panel.hidden = false;
  toggle.setAttribute('aria-expanded', 'true');
  $('#headerSearchInput').focus();
  if (state.filters.q) $('#headerSearchInput').value = state.filters.q;
}

function toast(title, message = '', type = 'success', timeout = 4200) {
  const region = $('#toastRegion');
  if (!region) return;
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  const iconName = type === 'error' ? 'i-alert' : type === 'warn' ? 'i-info' : type === 'info' ? 'i-info' : 'i-check';
  el.innerHTML = `${icon(iconName, 'toast__icon')}
    <div class="toast__body"><span class="toast__title">${esc(title)}</span>${message ? `<span class="toast__msg">${esc(message)}</span>` : ''}</div>
    <button class="toast__close" type="button" aria-label="Dismiss notification">${icon('i-close')}</button>`;
  const remove = () => {
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 240);
  };
  el.querySelector('.toast__close').addEventListener('click', remove);
  region.appendChild(el);
  if (timeout) setTimeout(remove, timeout);
  while (region.children.length > 4) region.firstElementChild.remove();
}

/* --- Modal shell: focus trap, escape, restore focus --- */
function openModal({ title, bodyHTML, footHTML = '', wide = false, onMount = null, labelledBy = 'modalTitle' }) {
  const modal = $('#modal');
  const body = $('#modalBody');
  const foot = $('#modalFoot');
  state.modalReturnFocus = document.activeElement;
  $('#modalTitle').textContent = title;
  body.innerHTML = bodyHTML;
  foot.innerHTML = footHTML;
  foot.hidden = !footHTML;
  modal.hidden = false;
  modal.classList.toggle('modal--wide', wide);
  modal.querySelector('.modal__dialog').setAttribute('aria-labelledby', labelledBy);
  document.body.classList.add('is-locked');
  const dialog = modal.querySelector('.modal__dialog');
  if (onMount) onMount(dialog);
  setTimeout(() => {
    const focusable = dialog.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    (focusable || dialog).focus({ preventScroll: true });
    dialog.scrollTop = 0;
    body.scrollTop = 0;
  }, 40);
}
function closeModal() {
  const modal = $('#modal');
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  $('#modalBody').innerHTML = '';
  $('#modalFoot').innerHTML = '';
  document.body.classList.remove('is-locked');
  hideMobileBuyBar();
  if (state.modalReturnFocus && document.contains(state.modalReturnFocus)) {
    state.modalReturnFocus.focus({ preventScroll: true });
  }
  state.modalReturnFocus = null;
}
function trapFocus(e) {
  const modal = $('#modal');
  if (!modal || modal.hidden || e.key !== 'Tab') return;
  const dialog = modal.querySelector('.modal__dialog');
  const focusables = $$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', dialog)
    .filter(el => !el.disabled && el.offsetParent !== null);
  if (!focusables.length) return;
  const first = focusables[0], last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

function hideMobileBuyBar() {
  const bar = $('#mobileBuyBar');
  if (bar) { bar.hidden = true; bar.innerHTML = ''; }
}

/* ============ 11. PRODUCT CARDS (shared renderer) ============ */
function badgeList(p, max = 1) {
  const badges = [];
  if (p.bestseller) badges.push('<span class="pill pill--best">Bestseller</span>');
  if (p.originalPrice) {
    const off = Math.round((1 - p.price / p.originalPrice) * 100);
    if (off > 0) badges.push(`<span class="pill pill--sale">−${off}%</span>`);
  }
  if (p.newArrival) badges.push('<span class="pill pill--new">New Arrival</span>');
  if (p.kind === 'plant' && p.maintenance === 'Low') badges.push('<span class="pill">Low Maintenance</span>');
  if (p.kind === 'essential' && p.organic) badges.push(`<span class="pill">${esc(p.organic)}</span>`);
  return badges.slice(0, max).join('');
}

/** Stock label plus a compact pet-safety indicator, so cards stay one line tall. */
function stockLabel(p) {
  const petSafe = p.kind === 'plant' && p.pet.dogs === 'safe' && p.pet.cats === 'safe';
  const pet = petSafe ? `<span class="stock-pet">${icon('i-paw')}Pet safe</span>` : '';
  if (!p.inStock || p.stock <= 0) return `<span class="stock-line"><span class="product-card__stock product-card__stock--out"><span class="dot"></span> Out of stock</span>${pet}</span>`;
  if (p.stock <= CONFIG.lowStockAt) return `<span class="stock-line"><span class="product-card__stock product-card__stock--low"><span class="dot"></span> Only ${p.stock} left</span>${pet}</span>`;
  return `<span class="stock-line"><span class="product-card__stock"><span class="dot"></span> In stock</span>${pet}</span>`;
}

/**
 * Render a product card.
 * All product data is internal and trusted, but strings still pass through esc().
 */
function productCardHTML(p, opts = {}) {
  const inWishlist = state.wishlist.includes(p.id);
  const off = p.originalPrice ? Math.round((1 - p.price / p.originalPrice) * 100) : 0;
  const shortSun = {
    'very-low': 'Very low light', low: 'Low light', medium: 'Indirect light',
    bright: 'Bright indirect', direct: 'Direct sun'
  };
  const shortWater = { frequent: 'Thirsty', weekly: 'Weekly', biweekly: 'Every 2 wks', low: 'Very little water' };
  const meta = p.kind === 'plant'
    ? `<span class="tag-mini">${icon('i-sun')}${esc(shortSun[p.sunlight[p.sunlight.length - 1]] || 'Flexible light')}</span>
       <span class="tag-mini">${icon('i-drop')}${esc(shortWater[p.water] || 'See care guide')}</span>`
    : `<span class="tag-mini">${icon('i-soil')}Essentials</span>
       <span class="tag-mini">${icon('i-leaf')}${esc(p.category === 'essentials' ? 'Nursery grade' : (p.organic || 'Nursery grade'))}</span>`;
  return `
  <article class="product-card" data-product-id="${esc(p.id)}">
    <a class="product-card__media" href="#/shop" data-open-product="${esc(p.id)}" aria-label="View details for ${esc(p.name)}">
      <img src="${esc(p.img)}" alt="${esc(p.name)} (${esc(p.sci)})" width="640" height="640" loading="lazy" decoding="async">
      <span class="product-card__badges">${badgeList(p)}</span>
    </a>
    <button class="product-card__wish${inWishlist ? ' is-active' : ''}" type="button"
      data-wishlist-toggle="${esc(p.id)}" aria-pressed="${inWishlist}"
      aria-label="${inWishlist ? 'Remove' : 'Save'} ${esc(p.name)} ${inWishlist ? 'from' : 'to'} wishlist">
      ${icon(inWishlist ? 'i-heart-fill' : 'i-heart')}
    </button>
    <div class="product-card__body">
      <p class="product-card__sci">${esc(p.sci)}</p>
      <h3 class="product-card__name"><a href="#/shop" data-open-product="${esc(p.id)}">${esc(p.name)}</a></h3>
      ${ratingBlock(p)}
      ${opts.showDesc !== false ? `<p class="product-card__desc">${esc(p.desc)}</p>` : ''}
      <div class="product-card__meta">${meta}</div>
      <div class="product-card__price">
        <span class="price-now">${money(p.price)}</span>
        ${p.originalPrice ? `<span class="price-was">${money(p.originalPrice)}</span><span class="price-off">${off}% off</span>` : ''}
      </div>
      ${stockLabel(p)}
      <div class="product-card__actions">
        <button class="btn btn--primary btn--add" type="button" data-add-to-cart="${esc(p.id)}"
          ${(!p.inStock || p.stock <= 0) ? 'disabled aria-disabled="true"' : ''}>
          ${icon('i-cart')} ${p.inStock ? 'Add to Cart' : 'Sold out'}
        </button>
        <button class="btn btn--outline" type="button" data-open-product="${esc(p.id)}">Details</button>
      </div>
      <button class="product-card__details" type="button" data-open-product="${esc(p.id)}">View full details ${icon('i-arrow')}</button>
    </div>
  </article>`;
}

/**
 * Delegated listeners for every product control on the page.
 * Bound to <body> so the product modal (which lives outside <main>) is covered too.
 */
function bindProductGridEvents() {
  if (document.body.dataset.cardsBound === 'true') return;
  document.body.dataset.cardsBound = 'true';
  document.body.addEventListener('click', (e) => {
    const wishBtn = e.target.closest('[data-wishlist-toggle]');
    if (wishBtn) {
      e.preventDefault();
      e.stopPropagation();
      toggleWishlist(wishBtn.dataset.wishlistToggle);
      return;
    }
    const addBtn = e.target.closest('[data-add-to-cart]');
    if (addBtn) {
      e.preventDefault();
      const id = addBtn.dataset.addToCart;
      const card = addBtn.closest('.product-card, .reco-match, .pd');
      let qty = 1;
      const qtyInput = card && card.querySelector('.qty input');
      if (qtyInput) qty = Number(qtyInput.value) || 1;
      addToCart(id, qty);
      return;
    }
    const openEl = e.target.closest('[data-open-product]');
    if (openEl) {
      e.preventDefault();
      openProductDetail(openEl.dataset.openProduct);
    }
  });
}

/* ============ 12. HOME VIEW ============ */
function renderCategoryCards(container, variant = '') {
  if (!container) return;
  container.innerHTML = CATEGORIES.map(cat => {
    const count = PRODUCTS.filter(p => p.category === cat.id || (p.collections || []).includes(cat.id)).length;
    return `
    <a class="category-card" href="#/shop?category=${esc(cat.id)}" data-category-link="${esc(cat.id)}">
      <div class="category-card__media">
        <img src="${esc(cat.img)}" alt="${esc(cat.name)} collection" width="640" height="640" loading="lazy" decoding="async">
        <span class="category-card__count">${count} ${count === 1 ? 'product' : 'products'}</span>
      </div>
      <div class="category-card__body">
        <h3 class="category-card__title">${esc(cat.name)}</h3>
        <p class="category-card__desc">${esc(cat.desc)}</p>
        <span class="category-card__cta">Explore ${icon('i-arrow')}</span>
      </div>
    </a>`;
  }).join('');
}

function renderBestsellers() {
  const grid = $('#bestsellerGrid');
  if (!grid) return;
  const featured = PRODUCTS.filter(p => p.featured || p.bestseller)
    .sort((a, b) => (b.bestseller - a.bestseller) || (b.popularity - a.popularity))
    .slice(0, 8);
  grid.innerHTML = featured.map(p => productCardHTML(p)).join('');
}

function renderTestimonials() {
  const grid = $('#testimonialGrid');
  if (!grid) return;
  const avatars = ['', 'avatar--b', 'avatar--c', 'avatar--d'];
  grid.innerHTML = TESTIMONIALS.slice(0, 4).map((t, i) => `
    <article class="testimonial-card">
      ${starsHTML(t.rating)}
      <blockquote>“${esc(t.text)}”</blockquote>
      <div class="testimonial-card__foot">
        <span class="avatar ${avatars[i % avatars.length]}" aria-hidden="true">${esc(t.name.charAt(0))}</span>
        <div>
          <span class="testimonial-card__name">${esc(t.name)} <span class="muted">· ${esc(t.city)}</span></span>
          <span class="testimonial-card__buy">Purchased: ${esc(t.product)}</span>
        </div>
      </div>
    </article>`).join('');
}

let homeRendered = false;
function renderHome() {
  renderCategoryCards($('#homeCategoryGrid'));
  renderBestsellers();
  if (!homeRendered) { renderTestimonials(); homeRendered = true; }
}

/* ============ 13. SHOP — FILTERS, SORTING, SEARCH ============ */
function renderCategoryFilters() {
  const wrap = $('#categoryFilters');
  if (!wrap) return;
  wrap.innerHTML = CATEGORIES.map(cat => {
    const count = PRODUCTS.filter(p => p.category === cat.id || (p.collections || []).includes(cat.id)).length;
    return `<label><input type="checkbox" value="${esc(cat.id)}" data-category-filter> <span>${esc(cat.name)}</span><span class="count">${count}</span></label>`;
  }).join('');
}

function loadShopFilters() {
  const saved = storage.read(STORE_KEYS.shopFilters, null);
  if (saved && typeof saved === 'object') {
    state.filters = Object.assign(state.filters, saved, { q: saved.q || '' });
  }
}
function saveShopFilters() {
  storage.write(STORE_KEYS.shopFilters, state.filters);
}

function syncFilterUI() {
  const f = state.filters;
  const search = $('#shopSearch');
  if (search) search.value = f.q || '';
  $$('[data-category-filter]').forEach(input => { input.checked = f.categories.includes(input.value); });
  $$('[data-filter="maintenance"] input').forEach(i => { i.checked = f.maintenance.includes(i.value); });
  $$('[data-filter="sun"] input').forEach(i => { i.checked = f.sun.includes(i.value); });
  $$('[data-filter="difficulty"] input').forEach(i => { i.checked = f.difficulty.includes(i.value); });
  const inStock = $('#inStockOnly'); if (inStock) inStock.checked = !!f.inStock;
  const minR = $('#priceMin'), maxR = $('#priceMax');
  if (minR) minR.value = String(f.priceMin);
  if (maxR) maxR.value = String(f.priceMax);
  const minOut = $('#priceMinOut'), maxOut = $('#priceMaxOut');
  if (minOut) minOut.textContent = money(f.priceMin);
  if (maxOut) maxOut.textContent = money(f.priceMax);
  const ratingInput = $(`#ratingFilter input[value="${f.rating}"]`);
  if (ratingInput) ratingInput.checked = true;
  const sort = $('#sortSelect'); if (sort) sort.value = f.sort;
}

function countActiveFilters() {
  const f = state.filters;
  return f.categories.length + f.maintenance.length + f.sun.length + f.difficulty.length +
    (f.inStock ? 1 : 0) + (f.rating > 0 ? 1 : 0) + (f.q ? 1 : 0) +
    (f.priceMin > 0 || f.priceMax < 2000 ? 1 : 0);
}

/** Does a product match the sun filter? A plant matches if any of its requirements is selected. */
function matchesSun(p, selected) {
  if (!selected.length) return true;
  if (p.kind !== 'plant') return false;
  return p.sunlight.some(s => selected.includes(s));
}

function getFilteredProducts() {
  const f = state.filters;
  const q = f.q.trim().toLowerCase();
  let list = PRODUCTS.filter(p => {
    const categoryIds = [p.category, ...(p.collections || [])];
    if (f.categories.length && !f.categories.some(c => categoryIds.includes(c))) return false;
    const price = p.price;
    if (price < f.priceMin || price > f.priceMax) return false;
    if (f.maintenance.length && !f.maintenance.includes(p.maintenance)) return false;
    if (f.sun.length && !matchesSun(p, f.sun)) return false;
    if (f.difficulty.length && !f.difficulty.includes(p.difficulty)) return false;
    if (f.inStock && (!p.inStock || p.stock <= 0)) return false;
    if (f.rating > 0 && p.rating < f.rating) return false;
    if (q) {
      const haystack = [p.name, p.sci, p.desc, p.category, (p.tags || []).join(' '), (p.collections || []).join(' '),
        CATEGORY_BY_ID[p.category] ? CATEGORY_BY_ID[p.category].name : '',
        ...(p.collections || []).map(c => CATEGORY_BY_ID[c] ? CATEGORY_BY_ID[c].name : '')]
        .join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
  return sortProducts(list, f.sort);
}

function sortProducts(list, sort) {
  const arr = list.slice();
  switch (sort) {
    case 'price-asc': return arr.sort((a, b) => a.price - b.price);
    case 'price-desc': return arr.sort((a, b) => b.price - a.price);
    case 'rating': return arr.sort((a, b) => b.rating - a.rating || b.reviews - a.reviews);
    case 'new': return arr.sort((a, b) => (b.newArrival - a.newArrival) || (b.popularity - a.popularity));
    case 'popular': return arr.sort((a, b) => b.reviews - a.reviews || b.popularity - a.popularity);
    default:
      return arr.sort((a, b) =>
        (b.featured - a.featured) || (b.bestseller - a.bestseller) ||
        (b.popularity - a.popularity) || (a.price - b.price));
  }
}

function renderActiveFilterTags() {
  const wrap = $('#activeFilters');
  if (!wrap) return;
  const f = state.filters;
  const tags = [];
  if (f.q) tags.push({ key: 'q', label: `“${f.q}”` });
  f.categories.forEach(c => tags.push({ key: 'cat:' + c, label: CATEGORY_BY_ID[c] ? CATEGORY_BY_ID[c].name : c }));
  f.maintenance.forEach(v => tags.push({ key: 'maintenance:' + v, label: v + ' maintenance' }));
  f.sun.forEach(v => tags.push({ key: 'sun:' + v, label: SUN_LABELS[v] }));
  f.difficulty.forEach(v => tags.push({ key: 'difficulty:' + v, label: v + ' difficulty' }));
  if (f.inStock) tags.push({ key: 'stock', label: 'In stock only' });
  if (f.rating > 0) tags.push({ key: 'rating', label: `${f.rating}★ & up` });
  if (f.priceMin > 0 || f.priceMax < 2000) tags.push({ key: 'price', label: `${money(f.priceMin)} – ${money(f.priceMax)}` });

  wrap.innerHTML = tags.map(t => `<span class="filter-tag">${esc(t.label)}
    <button type="button" data-remove-filter="${esc(t.key)}" aria-label="Remove filter ${esc(t.label)}">${icon('i-close')}</button></span>`).join('');

  const countBadge = $('#activeFilterCount');
  if (countBadge) {
    const n = countActiveFilters();
    countBadge.textContent = String(n);
    countBadge.hidden = n === 0;
  }
}

function removeFilter(key) {
  const f = state.filters;
  if (key === 'q') f.q = '';
  else if (key === 'stock') f.inStock = false;
  else if (key === 'rating') f.rating = 0;
  else if (key === 'price') { f.priceMin = 0; f.priceMax = 2000; }
  else if (key.startsWith('cat:')) f.categories = f.categories.filter(c => c !== key.slice(4));
  else if (key.startsWith('maintenance:')) f.maintenance = f.maintenance.filter(v => v !== key.slice(12));
  else if (key.startsWith('sun:')) f.sun = f.sun.filter(v => v !== key.slice(4));
  else if (key.startsWith('difficulty:')) f.difficulty = f.difficulty.filter(v => v !== key.slice(11));
  syncFilterUI();
  saveShopFilters();
  renderShop();
}

function renderShop() {
  const grid = $('#shopGrid');
  if (!grid) return;
  const results = getFilteredProducts();
  grid.innerHTML = results.map(p => productCardHTML(p)).join('');
  const empty = $('#shopEmpty');
  if (empty) empty.hidden = results.length > 0;
  grid.hidden = results.length === 0;
  const count = $('#resultsCount');
  if (count) {
    count.innerHTML = results.length === PRODUCTS.length
      ? `Showing all <strong>${PRODUCTS.length}</strong> products`
      : `Showing <strong>${results.length}</strong> of ${PRODUCTS.length} products`;
  }
  renderActiveFilterTags();
}

function resetAllFilters() {
  state.filters = Object.assign({}, state.filters, {
    q: '', categories: [], priceMin: 0, priceMax: 2000,
    maintenance: [], sun: [], difficulty: [], inStock: false, rating: 0, sort: 'recommended'
  });
  syncFilterUI();
  saveShopFilters();
  renderShop();
}

/* ============ 14. PRODUCT DETAIL MODAL ============ */
function petLine(p) {
  const label = (v) => v === 'safe' ? 'Non-toxic' : v === 'toxic' ? 'Toxic if chewed' : 'Mildly toxic / caution';
  if (p.kind !== 'plant') {
    return { safe: p.pet.dogs === 'safe' && p.pet.cats === 'safe', html: `Dogs: <strong>${label(p.pet.dogs)}</strong> · Cats: <strong>${label(p.pet.cats)}</strong>` };
  }
  return {
    safe: p.pet.dogs === 'safe' && p.pet.cats === 'safe',
    html: `Dogs: <strong>${label(p.pet.dogs)}</strong> · Cats: <strong>${label(p.pet.cats)}</strong>`
  };
}

function openProductDetail(id) {
  const p = PRODUCT_BY_ID[id];
  if (!p) return;
  state.activeProductId = id;
  const off = p.originalPrice ? Math.round((1 - p.price / p.originalPrice) * 100) : 0;
  const inWishlist = state.wishlist.includes(id);
  const pet = petLine(p);
  const care = p.kind === 'plant' ? CARE_GUIDE_BY_PLANT[p.careId] : null;
  const tags = (p.tags || []).map(t => `<span class="pill">${esc(t)}</span>`).join('');

  const specs = p.kind === 'plant' ? [
    { icon: 'i-sun', label: 'Sunlight', value: p.sunlight.map(s => SUN_LABELS[s]).join(' · ') },
    { icon: 'i-drop', label: 'Watering', value: WATER_LABELS[p.water] || '—' },
    { icon: 'i-soil', label: 'Soil', value: p.soil },
    { icon: 'i-sun', label: 'Temperature', value: p.temp },
    { icon: 'i-leaf', label: 'Difficulty', value: p.difficulty },
    { icon: 'i-clock', label: 'Maintenance', value: p.maintenance },
    { icon: 'i-drop', label: 'Humidity', value: p.humidity },
    { icon: 'i-pot', label: 'Plant size', value: p.size }
  ] : [
    { icon: 'i-leaf', label: 'Type', value: 'Gardening essential' },
    { icon: 'i-soil', label: 'Use', value: p.soil || 'Follow the product label' },
    { icon: 'i-clock', label: 'Storage', value: p.temp }
  ];

  const bodyHTML = `
    <div class="pd">
      <div class="pd__media">
        <img src="${esc(p.img)}" alt="${esc(p.name)} — ${esc(p.sci)}" width="640" height="640" decoding="async">
        <div class="pd__media-tags">${badgeList(p)}</div>
      </div>
      <div class="pd__body">
        <p class="pd__sci">${esc(p.sci)}</p>
        <h3 class="pd__title" id="pdTitle">${esc(p.name)}</h3>
        <div class="pd__rating">${starsHTML(p.rating)} <span class="rating-text">${p.rating.toFixed(1)} · ${p.reviews} reviews</span></div>
        <div class="pd__price">
          <span class="price-now">${money(p.price)}</span>
          ${p.originalPrice ? `<span class="price-was">${money(p.originalPrice)}</span><span class="price-off">${off}% off</span>` : ''}
        </div>
        <p class="pd__stock ${p.stock <= CONFIG.lowStockAt ? 'pd__stock--low' : ''}"><span class="dot"></span>
          ${p.inStock ? (p.stock <= CONFIG.lowStockAt ? `Only ${p.stock} left in stock` : 'In stock — ships in 2–4 days') : 'Currently out of stock'}
        </p>
        <p class="pd__desc">${esc(p.desc)}</p>
        ${tags ? `<div class="product-card__meta" style="margin-top:.6rem">${tags}</div>` : ''}

        <dl class="pd__specs">
          ${specs.map(s => `<div class="pd__spec">${icon(s.icon)}<div><dt>${esc(s.label)}</dt><dd>${esc(s.value || '—')}</dd></div></div>`).join('')}
        </dl>

        ${care ? `<div class="pd__care">
          <div class="pd__care-item">${icon('i-book')}<div><strong>Care summary:</strong> ${esc(care.intro)}</div></div>
          <div class="pd__care-item">${icon('i-scissors')}<div><strong>Pruning:</strong> ${esc(care.prune)}</div></div>
          <div class="pd__care-item">${icon('i-pot')}<div><strong>Repotting:</strong> ${esc(care.repot)}</div></div>
        </div>` : ''}

        <div class="pd__pet ${pet.safe ? 'is-safe' : ''}">
          ${icon(pet.safe ? 'i-paw' : 'i-alert')}
          <div><strong>Pet safety — ${pet.safe ? 'generally non-toxic' : 'take care'}</strong>${pet.html}. Toxicity depends on the species and the level of exposure — always verify with your vet before bringing a plant home.</div>
        </div>

        ${p.organic ? `<p class="pd__note">${icon('i-leaf')} ${esc(p.organic)} · not a certified-organic claim</p>` : ''}

        <div class="pd__buy">
          <div class="qty" role="group" aria-label="Quantity">
            <button type="button" data-qty="minus" aria-label="Decrease quantity">${icon('i-minus')}</button>
            <label class="sr-only" for="pdQty">Quantity</label>
            <input type="number" id="pdQty" value="1" min="1" max="${CONFIG.maxQty}" inputmode="numeric">
            <button type="button" data-qty="plus" aria-label="Increase quantity">${icon('i-plus')}</button>
          </div>
          <button class="btn btn--primary btn--add" type="button" data-add-to-cart="${esc(p.id)}" ${p.inStock ? '' : 'disabled'}>
            ${icon('i-cart')} ${p.inStock ? 'Add to Cart' : 'Sold out'}
          </button>
          <button class="btn btn--outline pd__wish-btn${inWishlist ? ' is-active' : ''}" type="button"
            data-wishlist-toggle="${esc(p.id)}" aria-pressed="${inWishlist}">
            ${icon(inWishlist ? 'i-heart-fill' : 'i-heart')} ${inWishlist ? 'Saved' : 'Wishlist'}
          </button>
        </div>
        <p class="pd__note">${icon('i-truck')} Free delivery over ₹999 · ${icon('i-shield')} Demo checkout — no payment taken.</p>
        ${care ? `<button class="btn btn--ghost btn--sm" type="button" data-open-care="${esc(care.id)}">${icon('i-book')} Read the full ${esc(care.name)} care guide</button>` : ''}
      </div>
    </div>`;

  openModal({ title: 'Product details', bodyHTML, wide: true, onMount: (dialog) => {
    const qtyInput = dialog.querySelector('#pdQty');
    dialog.querySelectorAll('[data-qty]').forEach(btn => {
      btn.addEventListener('click', () => {
        const step = btn.dataset.qty === 'plus' ? 1 : -1;
        qtyInput.value = String(clamp((Number(qtyInput.value) || 1) + step, 1, CONFIG.maxQty));
      });
    });
    qtyInput.addEventListener('change', () => {
      qtyInput.value = String(clamp(Math.round(Number(qtyInput.value) || 1), 1, CONFIG.maxQty));
    });
    dialog.querySelectorAll('[data-open-care]').forEach(btn => {
      btn.addEventListener('click', () => { closeModal(); setTimeout(() => openCareGuide(btn.dataset.openCare), 120); });
    });
    updatePDWishButton(dialog, p.id);
  } });
}

function updatePDWishButton(root, id) {
  const btn = root.querySelector('.pd__wish-btn');
  if (!btn) return;
  const active = state.wishlist.includes(id);
  btn.classList.toggle('is-active', active);
  btn.setAttribute('aria-pressed', String(active));
  btn.innerHTML = `${icon(active ? 'i-heart-fill' : 'i-heart')} ${active ? 'Saved' : 'Wishlist'}`;
}

/* ============ 15. WISHLIST ============ */
function updateWishlistCounters() {
  const badges = $$('[data-count="wishlist"]');
  badges.forEach(badge => {
    const n = state.wishlist.length;
    badge.textContent = String(n);
    badge.hidden = n === 0;
    if (n > 0) { badge.classList.remove('is-bump'); void badge.offsetWidth; badge.classList.add('is-bump'); }
  });
}

function toggleWishlist(id) {
  const p = PRODUCT_BY_ID[id];
  if (!p) return;
  const idx = state.wishlist.indexOf(id);
  if (idx === -1) {
    state.wishlist.push(id);
    toast('Saved to your wishlist', p.name, 'success');
  } else {
    state.wishlist.splice(idx, 1);
    toast('Removed from your wishlist', p.name, 'info');
  }
  storage.write(STORE_KEYS.wishlist, state.wishlist);
  updateWishlistCounters();
  refreshWishlistButtons();
  if (state.currentView === 'wishlist') renderWishlist();
}

/** Update every wishlist control on the page without a full re-render. */
function refreshWishlistButtons() {
  $$('[data-wishlist-toggle]').forEach(btn => {
    const id = btn.dataset.wishlistToggle;
    const active = state.wishlist.includes(id);
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', String(active));
    const name = PRODUCT_BY_ID[id] ? PRODUCT_BY_ID[id].name : 'plant';
    btn.setAttribute('aria-label', `${active ? 'Remove' : 'Save'} ${name} ${active ? 'from' : 'to'} wishlist`);
    if (btn.classList.contains('product-card__wish')) {
      btn.innerHTML = icon(active ? 'i-heart-fill' : 'i-heart');
    } else if (btn.classList.contains('pd__wish-btn')) {
      btn.innerHTML = `${icon(active ? 'i-heart-fill' : 'i-heart')} ${active ? 'Saved' : 'Wishlist'}`;
    } else if (btn.classList.contains('reco-match__wish')) {
      btn.innerHTML = `${icon(active ? 'i-heart-fill' : 'i-heart')} ${active ? 'Saved' : 'Wishlist'}`;
    }
  });
}

function renderWishlist() {
  const grid = $('#wishlistGrid');
  const empty = $('#wishlistEmpty');
  const sub = $('#wishlistSub');
  if (!grid) return;
  const items = state.wishlist.map(id => PRODUCT_BY_ID[id]).filter(Boolean);
  grid.innerHTML = items.map(p => productCardHTML(p)).join('');
  grid.hidden = items.length === 0;
  if (empty) empty.hidden = items.length > 0;
  if (sub) sub.textContent = items.length
    ? `${pluralize(items.length, 'plant')} saved · move them to your cart whenever you’re ready.`
    : 'Plants you’re saving for later.';
}

/* ============ 16. CART & TOTALS ============ */
function cartCount() { return state.cart.reduce((sum, item) => sum + item.qty, 0); }

function cartSubtotal() {
  return state.cart.reduce((sum, item) => {
    const p = PRODUCT_BY_ID[item.id];
    return p ? sum + p.price * item.qty : sum;
  }, 0);
}

function calculateTotals() {
  const subtotal = cartSubtotal();
  const hasItems = state.cart.length > 0;
  const delivery = !hasItems || subtotal >= CONFIG.freeDeliveryThreshold ? 0 : CONFIG.deliveryFee;
  const discount = subtotal >= CONFIG.discountThreshold
    ? Math.min(Math.round(subtotal * CONFIG.discountRate), CONFIG.discountCap) : 0;
  const total = Math.max(0, subtotal + delivery - discount);
  return { subtotal, delivery, discount, total, hasItems };
}

function updateCartCounters() {
  $$('[data-count="cart"]').forEach(badge => {
    const n = cartCount();
    badge.textContent = String(n);
    badge.hidden = n === 0;
    if (n > 0) { badge.classList.remove('is-bump'); void badge.offsetWidth; badge.classList.add('is-bump'); }
  });
}

function addToCart(id, qty = 1) {
  const p = PRODUCT_BY_ID[id];
  if (!p) return;
  if (!p.inStock || p.stock <= 0) { toast('Out of stock', `${p.name} is not available right now.`, 'warn'); return; }
  const existing = state.cart.find(item => item.id === id);
  const currentQty = existing ? existing.qty : 0;
  const nextQty = Math.min(CONFIG.maxQty, currentQty + Number(qty || 1));
  if (existing) {
    if (nextQty === currentQty) { toast('Quantity limit reached', `Maximum ${CONFIG.maxQty} per item in this demo.`, 'warn'); return; }
    existing.qty = nextQty;
  } else {
    state.cart.push({ id, qty: clamp(Number(qty) || 1, 1, CONFIG.maxQty) });
  }
  storage.write(STORE_KEYS.cart, state.cart);
  updateCartCounters();
  toast('Added to cart', `${p.name} · ${money(p.price)}`, 'success');
  if (state.currentView === 'cart') renderCart();
  if (state.currentView === 'checkout') renderCheckout();
}

function setCartQty(id, qty) {
  const item = state.cart.find(i => i.id === id);
  if (!item) return;
  const next = clamp(Math.round(Number(qty) || 1), 1, CONFIG.maxQty);
  item.qty = next;
  storage.write(STORE_KEYS.cart, state.cart);
  updateCartCounters();
  renderCart();
}

function removeFromCart(id) {
  const p = PRODUCT_BY_ID[id];
  state.cart = state.cart.filter(item => item.id !== id);
  storage.write(STORE_KEYS.cart, state.cart);
  updateCartCounters();
  toast('Removed from cart', p ? p.name : '', 'info');
  renderCart();
}

function renderCart() {
  const wrap = $('#cartItems');
  const layout = $('#cartLayout');
  const empty = $('#cartEmpty');
  if (!wrap) return;
  const totals = calculateTotals();
  if (layout) layout.hidden = !totals.hasItems;
  if (empty) empty.hidden = totals.hasItems;

  wrap.innerHTML = state.cart.map(item => {
    const p = PRODUCT_BY_ID[item.id];
    if (!p) return '';
    const unavailable = !p.inStock || p.stock <= 0;
    return `
    <div class="cart-item${unavailable ? ' cart-item--unavailable' : ''}" data-cart-id="${esc(p.id)}">
      <div class="cart-item__media">
        <img src="${esc(p.img)}" alt="${esc(p.name)}" width="96" height="96" loading="lazy">
      </div>
      <div class="cart-item__info">
        <a class="cart-item__name" href="#/shop" data-open-product="${esc(p.id)}">${esc(p.name)}</a>
        <span class="cart-item__sci">${esc(p.sci)}</span>
        <span class="cart-item__price">${money(p.price)} each ${p.originalPrice ? `<span class="price-was">${money(p.originalPrice)}</span>` : ''}</span>
        <div class="cart-item__controls">
          <div class="qty" role="group" aria-label="Quantity for ${esc(p.name)}">
            <button type="button" data-cart-qty="minus" aria-label="Decrease quantity of ${esc(p.name)}">${icon('i-minus')}</button>
            <label class="sr-only" for="cq-${esc(p.id)}">Quantity</label>
            <input type="number" id="cq-${esc(p.id)}" value="${item.qty}" min="1" max="${CONFIG.maxQty}" data-cart-qty-input="${esc(p.id)}">
            <button type="button" data-cart-qty="plus" aria-label="Increase quantity of ${esc(p.name)}">${icon('i-plus')}</button>
          </div>
          <button class="cart-item__remove" type="button" data-cart-remove="${esc(p.id)}">${icon('i-trash')} Remove</button>
        </div>
      </div>
      <div class="cart-item__total" data-line-total="${esc(p.id)}">${money(p.price * item.qty)}</div>
    </div>`;
  }).join('');

  const clearBtn = $('#clearCartBtn');
  if (clearBtn) clearBtn.hidden = !totals.hasItems;
  const updateBtn = $('#updateCartBtn');
  if (updateBtn) updateBtn.disabled = !totals.hasItems;
  const checkoutBtn = $('#checkoutBtn');
  if (checkoutBtn) checkoutBtn.disabled = !totals.hasItems;
  const sub = $('#cartSub');
  if (sub) sub.textContent = totals.hasItems
    ? `${pluralize(cartCount(), 'item')} · ${pluralize(state.cart.length, 'product')} in your cart`
    : 'Review your plants and gardening essentials.';

  updateSummary(totals);
  renderFreeShipNote(totals);
  renderCartAddons();
  renderCartCareTip();
}

function updateSummary(totals) {
  const set = (sel, val) => { const el = $(sel); if (el) el.textContent = val; };
  set('#sumSubtotal', money(totals.subtotal));
  set('#sumDelivery', totals.delivery === 0 ? 'Free' : money(totals.delivery));
  set('#sumTotal', money(totals.total));
  const discountRow = $('#sumDiscountRow');
  if (discountRow) discountRow.hidden = totals.discount === 0;
  set('#sumDiscount', '−' + money(totals.discount));
  const tag = $('#sumDiscountTag');
  if (tag) tag.textContent = totals.discount ? 'Grow More 10%' : '';
  const note = $('#sumNote');
  if (note) {
    if (!totals.hasItems) note.innerHTML = `${icon('i-truck')} Free delivery on orders over ₹999.`;
    else if (totals.delivery > 0) {
      const gap = CONFIG.freeDeliveryThreshold - totals.subtotal;
      note.innerHTML = `${icon('i-truck')} Add ${money(gap)} more for free delivery.`;
    } else if (totals.discount === 0) {
      const gap = CONFIG.discountThreshold - totals.subtotal;
      note.innerHTML = `${icon('i-leaf')} Add ${money(gap)} more for 10% off (max ₹200).`;
    } else {
      note.innerHTML = `${icon('i-check')} Free delivery and 10% bundle discount applied.`;
    }
  }
}

function renderFreeShipNote(totals) {
  const el = $('#freeShipNote');
  if (!el) return;
  if (!totals.hasItems) { el.innerHTML = ''; return; }
  if (totals.delivery === 0) {
    el.innerHTML = `${icon('i-check')} <span><strong>Free delivery unlocked.</strong> Your plants ship in recyclable packaging.</span>`;
  } else {
    const gap = CONFIG.freeDeliveryThreshold - totals.subtotal;
    el.innerHTML = `${icon('i-truck')} <span><strong>${money(gap)}</strong> away from free delivery.</span>`;
  }
}

function renderCartAddons() {
  const wrap = $('#cartAddons');
  if (!wrap) return;
  const hasPlants = state.cart.some(i => PRODUCT_BY_ID[i.id] && PRODUCT_BY_ID[i.id].kind === 'plant');
  const suggestions = hasPlants
    ? ['vermicompost', 'fertilizer', 'pots']
    : ['pothos', 'snake-plant', 'tulsi'];
  wrap.innerHTML = suggestions
    .filter(id => !state.cart.some(i => i.id === id))
    .slice(0, 3)
    .map(id => {
      const p = PRODUCT_BY_ID[id];
      if (!p) return '';
      return `<div class="addon">
        <img src="${esc(p.img)}" alt="" width="44" height="44" loading="lazy">
        <span class="addon__text"><span class="addon__name">${esc(p.name)}</span><span class="addon__price">${money(p.price)}</span></span>
        <button type="button" data-add-to-cart="${esc(p.id)}" aria-label="Add ${esc(p.name)} to cart">${icon('i-plus')}</button>
      </div>`;
    }).join('') || '<p class="muted" style="font-size:.8rem">All the essentials are already in your cart.</p>';
}

function renderCartCareTip() {
  const el = $('#cartCareTip');
  if (!el) return;
  const plantIds = state.cart.map(i => i.id).filter(id => PRODUCT_BY_ID[id] && PRODUCT_BY_ID[id].kind === 'plant');
  const tip = plantIds.map(id => CARE_TIPS[id] || (CARE_GUIDE_BY_PLANT[id] && `Care tip: ${CARE_GUIDE_BY_PLANT[id].water}`)).find(Boolean)
    || 'A new plant’s first week is an adjustment period — expect a little leaf drop, and water only when the soil asks for it.';
  el.innerHTML = `${icon('i-book')}<div><strong>Care note for your cart</strong>${esc(tip)}</div>`;
}

/* ============ 16b. BACKEND API CLIENT ============ */
/**
 * Thin wrapper around fetch() for the Node.js backend.
 * Every call resolves to { ok, status, data } and never throws, so callers can
 * render a real message instead of guessing at network state.
 */
/** True once the server catalogue has been merged in, so views can re-sync cheaply. */
let CATALOGUE_SYNCED = false;

/** Re-fetch the catalogue when a view is shown, so admin changes appear without a hard reload. */
let catalogueRefreshTimer = null;
function refreshCatalogueSoon() {
  if (!CATALOGUE_SYNCED || catalogueRefreshTimer) return;
  catalogueRefreshTimer = setTimeout(async () => {
    catalogueRefreshTimer = null;
    const before = JSON.stringify(PRODUCTS.map(p => [p.id, p.price, p.inStock, p.stock]));
    const ok = await syncCatalogueFromServer();
    if (!ok) return;
    const after = JSON.stringify(PRODUCTS.map(p => [p.id, p.price, p.inStock, p.stock]));
    if (after !== before) {
      // Something changed server-side — repaint whatever the customer is looking at.
      renderHome();
      renderShop();
      renderCart();
      renderWishlist();
      if (location.hash.includes('confirmation')) renderConfirmation();
      toast('Catalogue updated', 'Prices and stock have been refreshed.', 'info', 3500);
    }
  }, 400);
}

const API = {
  base: '',
  async request(path, options = {}) {
    const config = {
      method: options.method || 'GET',
      headers: { 'Accept': 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store'
    };
    if (options.body !== undefined) {
      config.headers['Content-Type'] = 'application/json';
      config.body = JSON.stringify(options.body);
    }
    try {
      const response = await fetch(API.base + path, config);
      let data = null;
      let raw = "";
      try {
        raw = await response.text();
        try { data = JSON.parse(raw); } catch { data = null; }
      } catch { data = null; }
      return {
        ok: response.ok,
        status: response.status,
        data,
        snippet: data ? "" : String(raw || "").replace(/\s+/g, " ").trim().slice(0, 120)
      };
    } catch (err) {
      return { ok: false, status: 0, data: null, networkError: true };
    }
  },
  get(path) { return API.request(path); },
  post(path, body) { return API.request(path, { method: 'POST', body }); }
};

/** Human-readable failure text for a failed API call. */
function apiErrorMessage(res, fallback) {
  if (res && res.networkError) {
    return 'Could not reach the Verdant server. Make sure node server.js is running, then try again.';
  }
  if (res && res.data && res.data.message) return res.data.message;
  // The server gave us no message. Say what actually came back.
  const status = res && res.status ? res.status : 0;
  if (status === 405) return 'The server refused this request (method not allowed). Reload the page and try again.';
  if (status === 404) return 'The order endpoint was not found on the server. The page may be newer than the server.js that is running.';
  const snippet = res && res.snippet ? " — server said: " + res.snippet : "";
  const base = fallback || 'Something went wrong. Please try again.';
  return status ? base + " (HTTP " + status + snippet + ")" : base;
}

/**
 * Pull the live catalogue from GET /api/products and merge it over the built-in
 * defaults. Price, stock and availability always come from the server; any field
 * the backend does not manage keeps its front-end value so the UI stays intact.
 */
async function syncCatalogueFromServer() {
  const res = await API.get('/api/products');
  if (!res.ok || !res.data || !Array.isArray(res.data.products) || !res.data.products.length) {
    console.info('[Verdant] Catalogue API unavailable — using the built-in catalogue.');
    return false;
  }

  const serverProducts = res.data.products;
  const serverIds = new Set(serverProducts.map(p => p.id));

  serverProducts.forEach(remote => {
    const local = PRODUCT_BY_ID[remote.id];
    if (local) {
      // Managed by the backend:
      local.price = remote.price;
      local.originalPrice = remote.originalPrice;
      local.stock = remote.stock;
      local.inStock = remote.inStock !== false && remote.stock > 0;
      if (remote.name) local.name = remote.name;
      if (remote.desc) local.desc = remote.desc;
      if (remote.img) local.img = remote.img;
      if (remote.category) local.category = remote.category;
      if (remote.difficulty) local.difficulty = remote.difficulty;
      if (remote.maintenance) local.maintenance = remote.maintenance;
      if (remote.sci !== undefined) local.sci = remote.sci;
    } else {
      // A product added in the admin panel — give it the fields the UI expects.
      PRODUCTS.push(Object.assign({
        collections: [], tags: [], ratmgs: undefined, rating: 0, reviews: 0,
        difficulty: 'Easy', sunlight: ['medium'], water: 'weekly', maintenance: 'Low',
        pet: { dogs: 'caution', cats: 'caution' }, size: 'Medium', leaf: 'Any',
        purpose: ['Decoration'], placement: ['Living room'], kind: 'plant',
        bestseller: false, featured: false, newArrival: false, popularity: 50,
        organic: 'Organic-inspired', problems: [], careId: null,
        soil: 'Free-draining potting mix.', temp: '18–29°C',
        humidity: 'Average home humidity', fertilizer: 'Feed lightly in the growing season',
        repotting: 'Repot when root-bound', pruning: 'Trim damaged growth',
        desc: ''
      }, remote));
      PRODUCT_BY_ID[remote.id] = remote;
    }
  });

  // A product deleted server-side disappears from the storefront.
  const removed = PRODUCTS.filter(p => !serverIds.has(p.id)).map(p => p.id);
  if (removed.length) {
    for (let i = PRODUCTS.length - 1; i >= 0; i--) {
      if (!serverIds.has(PRODUCTS[i].id)) PRODUCTS.splice(i, 1);
    }
    removed.forEach(id => delete PRODUCT_BY_ID[id]);
    // Drop deleted lines from the cart and wishlist so totals stay truthful.
    state.cart = state.cart.filter(line => PRODUCT_BY_ID[line.id]);
    state.wishlist = state.wishlist.filter(id => PRODUCT_BY_ID[id]);
    storage.write(STORE_KEYS.cart, state.cart);
    storage.write(STORE_KEYS.wishlist, state.wishlist);
  }

  if (res.data.rules) {
    const r = res.data.rules;
    if (Number.isFinite(r.freeDeliveryThreshold)) CONFIG.freeDeliveryThreshold = r.freeDeliveryThreshold;
    if (Number.isFinite(r.deliveryFee)) CONFIG.deliveryFee = r.deliveryFee;
    if (Number.isFinite(r.discountThreshold)) CONFIG.discountThreshold = r.discountThreshold;
    if (Number.isFinite(r.discountRate)) CONFIG.discountRate = r.discountRate;
    if (Number.isFinite(r.discountCap)) CONFIG.discountCap = r.discountCap;
    if (Number.isFinite(r.maxQty)) CONFIG.maxQty = r.maxQty;
  }

  updateCartCounters();
  updateWishlistCounters();
  CATALOGUE_SYNCED = true;
  console.info(`[Verdant] Catalogue synced from server — ${serverProducts.length} products.`);
  return true;
}

/* ============ 17. CHECKOUT & DEMO ORDER ============ */
function stateListOptions() {
  return Array.from($$('#coState option')).map(o => o.value).filter(Boolean);
}
const INDIAN_STATES = ['Punjab', 'Chandigarh', 'Delhi', 'Haryana', 'Himachal Pradesh', 'Jammu & Kashmir', 'Ladakh',
  'Uttar Pradesh', 'Uttarakhand', 'Rajasthan', 'Gujarat', 'Maharashtra', 'Goa', 'Karnataka', 'Kerala', 'Tamil Nadu',
  'Telangana', 'Andhra Pradesh', 'Madhya Pradesh', 'Chhattisgarh', 'Odisha', 'West Bengal', 'Bihar', 'Jharkhand',
  'Assam', 'Sikkim', 'Meghalaya', 'Tripura', 'Manipur', 'Mizoram', 'Nagaland', 'Arunachal Pradesh', 'Puducherry',
  'Andaman & Nicobar Islands', 'Lakshadweep', 'Dadra & Nagar Haveli and Daman & Diu'];

function renderCheckout() {
  const form = $('#checkoutForm');
  const empty = $('#checkoutEmpty');
  const totals = calculateTotals();
  if (!form) return;
  form.hidden = !totals.hasItems;
  if (empty) empty.hidden = totals.hasItems;
  if (!totals.hasItems) return;

  const items = $('#checkoutItems');
  if (items) {
    items.innerHTML = state.cart.map(item => {
      const p = PRODUCT_BY_ID[item.id];
      if (!p) return '';
      return `<div class="checkout-item">
        <img src="${esc(p.img)}" alt="" width="44" height="44" loading="lazy">
        <span class="checkout-item__info"><span class="checkout-item__name">${esc(p.name)}</span><span class="checkout-item__qty">Qty ${item.qty} · ${money(p.price)}</span></span>
        <span class="checkout-item__price">${money(p.price * item.qty)}</span>
      </div>`;
    }).join('');
  }
  const set = (sel, val) => { const el = $(sel); if (el) el.textContent = val; };
  set('#coSubtotal', money(totals.subtotal));
  set('#coDelivery', totals.delivery === 0 ? 'Free' : money(totals.delivery));
  set('#coDiscount', '−' + money(totals.discount));
  const row = $('#coDiscountRow'); if (row) row.hidden = totals.discount === 0;
  set('#coTotal', money(totals.total));

  restoreCheckoutDraft();
}

function saveCheckoutDraft() {
  const form = $('#checkoutForm');
  if (!form) return;
  const draft = {};
  ['coName', 'coEmail', 'coPhone', 'coStreet', 'coCity', 'coState', 'coPin', 'coNotes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) draft[id] = el.value;
  });
  storage.write(STORE_KEYS.checkoutDraft, draft);
}
function restoreCheckoutDraft() {
  const draft = storage.read(STORE_KEYS.checkoutDraft, null);
  if (!draft) return;
  Object.entries(draft).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el && !el.value) el.value = value;
  });
}

const FIELD_RULES = {
  coName: { label: 'Full name', validate: v => v.trim().length >= 2 || 'Please enter your full name (at least 2 characters).' },
  coEmail: { label: 'Email address', validate: v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) || 'Enter a valid email address, e.g. you@example.com.' },
  coPhone: { label: 'Phone number', validate: v => /^[6-9]\d{9}$/.test(v.replace(/[\s-]/g, '')) || 'Enter a valid 10-digit Indian mobile number.' },
  coStreet: { label: 'Street address', validate: v => v.trim().length >= 5 || 'Please enter your house number and street.' },
  coCity: { label: 'City', validate: v => v.trim().length >= 2 || 'Please enter your city.' },
  coState: { label: 'State', validate: v => INDIAN_STATES.includes(v) || 'Please select your state.' },
  coPin: { label: 'PIN code', validate: v => /^[1-9]\d{5}$/.test(v.trim()) || 'Enter a valid 6-digit PIN code.' }
};

function validateField(id) {
  const el = document.getElementById(id);
  const errEl = document.getElementById(id + 'Err');
  if (!el || !FIELD_RULES[id]) return true;
  const result = FIELD_RULES[id].validate(el.value);
  const ok = result === true;
  if (errEl) {
    errEl.textContent = ok ? '' : result;
    errEl.setAttribute('role', 'alert');
  }
  el.setAttribute('aria-invalid', ok ? 'false' : 'true');
  return ok;
}

function validateCheckout() {
  const ids = Object.keys(FIELD_RULES);
  const invalid = ids.filter(id => !validateField(id));
  if (invalid.length) {
    const first = document.getElementById(invalid[0]);
    if (first) {
      first.focus({ preventScroll: false });
      first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    toast('Please check the highlighted fields', `${pluralize(invalid.length, 'field')} need attention.`, 'error');
    return false;
  }
  return true;
}

function generateOrderId() {
  const stamp = Date.now().toString(36).toUpperCase().slice(-5);
  const rand = Math.random().toString(36).toUpperCase().slice(2, 5);
  return `VRD-${stamp}${rand}`;
}

/**
 * Place a real order through POST /api/orders.
 * The server re-validates every field and recalculates all totals from its own
 * product database — the client's numbers are never trusted. The cart is only
 * cleared once the backend confirms the order was saved to disk.
 */
async function placeDemoOrder() {
  if (!state.cart.length) { toast('Your cart is empty', 'Add a plant before checking out.', 'warn'); return; }
  if (!validateCheckout()) return;

  const btn = $('#placeOrderBtn');
  const msg = $('#checkoutMsg');
  const payment = (document.querySelector('input[name="payment"]:checked') || {}).value || 'cod';

  const payload = {
    customer: {
      name: $('#coName').value.trim(),
      email: $('#coEmail').value.trim(),
      phone: $('#coPhone').value.trim(),
      street: $('#coStreet').value.trim(),
      city: $('#coCity').value.trim(),
      state: $('#coState').value,
      pin: $('#coPin').value.trim(),
      notes: $('#coNotes').value.trim()
    },
    items: state.cart.map(line => ({ id: line.id, qty: line.qty })),
    paymentMethod: payment
  };

  // ---- loading state ----
  if (msg) {
    msg.className = 'form-msg';
    msg.textContent = 'Placing your order…';
  }
  const originalLabel = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.classList.add('is-loading');
  }

  const res = await API.post('/api/orders', payload);

  if (btn) {
    btn.disabled = false;
    btn.classList.remove('is-loading');
    btn.innerHTML = originalLabel;
  }

  // ---- failure: keep the cart, show the real reason ----
  if (!res.ok) {
    const fieldErrors = (res.data && res.data.errors) || {};
    const fieldMap = {
      name: 'coName', email: 'coEmail', phone: 'coPhone', street: 'coStreet',
      city: 'coCity', state: 'coState', pin: 'coPin'
    };
    let firstBadField = null;
    Object.entries(fieldErrors).forEach(([field, text]) => {
      const id = fieldMap[field];
      if (!id) return;
      const errEl = document.getElementById(id + 'Err');
      const input = document.getElementById(id);
      if (errEl) { errEl.textContent = text; errEl.setAttribute('role', 'alert'); }
      if (input) input.setAttribute('aria-invalid', 'true');
      if (!firstBadField) firstBadField = input;
    });

    const reason = apiErrorMessage(res, 'We could not place your order. Please try again.');
    if (msg) {
      msg.className = 'form-msg is-error';
      msg.textContent = fieldErrors.items ? fieldErrors.items : reason;
    }
    toast('Order not placed', fieldErrors.items || reason, 'error', 6000);

    if (firstBadField) {
      firstBadField.focus({ preventScroll: false });
      firstBadField.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return; // cart and form are untouched, so the customer can retry
  }

  // ---- success: the order is on disk ----
  const order = res.data.order;
  state.lastOrder = order;
  storage.write(STORE_KEYS.lastOrder, order);

  // Mirror into the local order list purely for the "recent orders" convenience.
  state.orders = Array.isArray(state.orders) ? state.orders : [];
  state.orders.unshift(order);
  storage.write(STORE_KEYS.orders, state.orders.slice(0, 20));

  state.cart = [];
  storage.write(STORE_KEYS.cart, state.cart);
  updateCartCounters();
  storage.remove(STORE_KEYS.checkoutDraft);

  if (msg) { msg.className = 'form-msg is-success'; msg.textContent = 'Order placed — redirecting…'; }
  toast('Order placed', `${order.orderId} was saved on the server.`, 'success', 6000);
  navigate('/confirmation');
}

function renderConfirmation() {
  const wrap = $('#confirmWrap');
  if (!wrap) return;
  const order = state.lastOrder || storage.read(STORE_KEYS.lastOrder, null);
  if (!order) {
    wrap.innerHTML = `<div class="empty-state">
      <span class="empty-state__icon">${icon('i-cart')}</span>
      <h2>No order found</h2>
      <p>Once you place an order it is saved on the Verdant server and its confirmation appears here.</p>
      <a class="btn btn--primary" href="#/shop">Browse plants</a>
    </div>`;
    return;
  }

  const t = order.totals || { subtotal: 0, delivery: 0, discount: 0, total: 0 };
  const orderId = order.orderId || order.id || '—';
  const paymentLabel = (order.payment && order.payment.label) || order.payment || '—';
  const placed = order.createdAt ? formatDate(order.createdAt) : '';
  const first = (order.customer && order.customer.name ? order.customer.name : '').split(' ')[0] || 'plant parent';

  wrap.innerHTML = `
    <div class="confirm-hero">
      <span class="confirm-check">${icon('i-check')}</span>
      <h1>Thank you, ${esc(first)}!</h1>
      <p>Your order has been received and saved by the Verdant server. You can see it in the order record below — nothing was charged, nothing will be shipped, and no email was sent.</p>
      <div class="order-id">${icon('i-check')} Order ${esc(orderId)}</div>
      ${placed ? `<p class="dash-panel__note" style="margin-top:.3rem">Placed ${esc(placed)}</p>` : ''}
      <div class="confirm-note">${icon('i-alert')} <span><strong>Demonstration store.</strong> This order is stored securely on the Node.js server for the administrator to review. No payment was processed and no courier is involved.</span></div>
    </div>

    <div class="confirm-grid">
      <div class="confirm-card">
        <h2>Delivering to</h2>
        <dl class="confirm-list">
          <div><dt>Name</dt><dd>${esc(order.customer.name)}</dd></div>
          <div><dt>Address</dt><dd>${esc(order.customer.street)}</dd></div>
          <div><dt>City</dt><dd>${esc(order.customer.city)}</dd></div>
          <div><dt>State &amp; PIN</dt><dd>${esc(order.customer.state)} · ${esc(order.customer.pin)}</dd></div>
          <div><dt>Phone</dt><dd>${esc(order.customer.phone)}</dd></div>
          <div><dt>Email</dt><dd>${esc(order.customer.email)}</dd></div>
          <div><dt>Payment</dt><dd>${esc(paymentLabel)}</dd></div>
        </dl>
        ${order.customer.notes ? `<p class="dash-panel__note" style="margin-top:.8rem">Delivery note: ${esc(order.customer.notes)}</p>` : ''}
      </div>
      <div class="confirm-card">
        <h2>Order summary</h2>
        <div class="confirm-items">
          ${order.items.map(i => `<div class="confirm-item">
            ${i.img ? `<img src="${esc(i.img)}" alt="" width="46" height="46" loading="lazy">` : ''}
            <span class="checkout-item__info"><span class="confirm-item__name">${esc(i.name)}</span><span class="confirm-item__qty">Qty ${esc(i.qty)}</span></span>
            <span class="confirm-item__price">${money((i.lineTotal != null ? i.lineTotal : i.price * i.qty))}</span>
          </div>`).join('')}
        </div>
        <dl class="confirm-list">
          <div><dt>Subtotal</dt><dd>${money(t.subtotal)}</dd></div>
          <div><dt>Delivery</dt><dd>${t.delivery === 0 ? 'Free' : money(t.delivery)}</dd></div>
          ${t.discount ? `<div><dt>Discount</dt><dd>−${money(t.discount)}</dd></div>` : ''}
          <div><dt><strong>Total</strong></dt><dd><strong>${money(t.total)}</strong></dd></div>
        </dl>
      </div>
    </div>

    <div class="confirm-steps">
      <div class="confirm-step"><span class="confirm-step__num">1</span><h3>Save your order ID</h3><p>Quote <strong>${esc(orderId)}</strong> if you need to reference this order.</p></div>
      <div class="confirm-step"><span class="confirm-step__num">2</span><h3>Track your plants</h3><p>Add your new plants to the dashboard to set watering and feeding reminders.</p></div>
      <div class="confirm-step"><span class="confirm-step__num">3</span><h3>Read the care guide</h3><p>Each plant page links to its full species guide in the care centre.</p></div>
    </div>

    <div class="confirm-actions">
      <a class="btn btn--primary" href="#/dashboard">${icon('i-dashboard')} Track these plants</a>
      <a class="btn btn--outline" href="#/care">${icon('i-book')} Plant care centre</a>
      <a class="btn btn--ghost" href="#/shop">Continue shopping</a>
    </div>`;
}

/* ============================================================
   18. PLANT RECOMMENDER
   ------------------------------------------------------------
   Weights (total 100):
     sunlight 30 · watering 20 · maintenance 15 · experience 10
     budget 10 · plant preference 10 · placement 5
   Pet safety is a HARD constraint, never a score component.
   ============================================================ */

const RECO_WEIGHTS = { sun: 30, water: 20, maintenance: 15, experience: 10, budget: 10, type: 10, placement: 5 };

const WATER_CAPACITY = { frequent: 4, daily2: 3, weekly: 2, biweekly: 1, low: 0 }; // user's watering willingness
const WATER_NEED = { frequent: 4, weekly: 2, biweekly: 1, low: 0 };                 // plant's water requirement
const MAINT_CAPACITY = { minimal: 0, moderate: 1, active: 2, devoted: 3 };          // user's available time
const MAINT_NEED = { Low: 0, Medium: 1, High: 2 };                                  // plant's maintenance need
const EXP_LEVEL = { beginner0: 0, beginner: 1, intermediate: 2, experienced: 3 };
const DIFF_LEVEL = { Easy: 0, Moderate: 1, Challenging: 2 };

const BUDGET_RANGES = {
  under200: { min: 0, max: 200, label: 'Under ₹200' },
  '200-500': { min: 200, max: 500, label: '₹200 – ₹500' },
  '500-1000': { min: 500, max: 1000, label: '₹500 – ₹1,000' },
  '1000-2000': { min: 1000, max: 2000, label: '₹1,000 – ₹2,000' },
  above2000: { min: 2000, max: Infinity, label: 'Above ₹2,000' }
};

const HUMID_REGIONS = ['Kerala', 'Tamil Nadu', 'West Bengal', 'Assam', 'Meghalaya', 'Goa', 'Karnataka', 'Odisha', 'Tripura', 'Manipur', 'Mizoram', 'Nagaland', 'Sikkim', 'Andaman & Nicobar Islands'];
const DRY_REGIONS = ['Rajasthan', 'Gujarat', 'Haryana', 'Delhi', 'Punjab', 'Madhya Pradesh', 'Uttar Pradesh'];

/* ---------- Questionnaire state helpers ---------- */
function blankRecoAnswers() {
  return { country: 'India', state: '', city: '', placement: '', sunlight: '', water: '', experience: '',
    maintenance: '', type: '', budget: '', pets: '', size: '', leaf: '', purpose: '' };
}
function loadRecoAnswers() {
  const saved = storage.read(STORE_KEYS.reco, null);
  return saved && typeof saved === 'object' ? Object.assign(blankRecoAnswers(), saved) : blankRecoAnswers();
}
function saveRecoAnswers() {
  storage.write(STORE_KEYS.reco, state.reco);
}

function initRecommender() {
  if (!state.reco) state.reco = loadRecoAnswers();
  if (state.recoStep === undefined) state.recoStep = 'welcome';
  renderRecoStep();
}

function recoProgressMeta() {
  const total = RECO_QUESTIONS.length;
  if (state.recoStep === 'welcome') return { pct: 0, label: `Welcome · ${total} quick questions` };
  if (state.recoStep === 'results') return { pct: 100, label: 'Your personalised recommendations' };
  const n = state.recoStep;
  // Start the bar at 8% so step 1 is not empty, and land on 92% for the last
  // question — 100% is reserved for the results screen.
  const pct = Math.round(8 + (n / total) * 84);
  return { pct, label: `Question ${n + 1} of ${total} · ${RECO_QUESTIONS[n].kicker}` };
}

function setRecoProgress() {
  const meta = recoProgressMeta();
  const bar = $('#recoProgressBar');
  const label = $('#recoProgressLabel');
  if (bar) bar.style.width = meta.pct + '%';
  if (label) label.textContent = meta.label;
}

function renderRecoStep() {
  const card = $('#recoCard');
  if (!card) return;
  setRecoProgress();
  if (state.recoStep === 'welcome') { card.innerHTML = recoWelcomeHTML(); return; }
  if (state.recoStep === 'results') { card.innerHTML = recoResultsHTML(state.reco); return; }
  card.innerHTML = recoQuestionHTML(state.recoStep);
  const firstInput = card.querySelector('input, select, textarea');
  if (firstInput && window.innerWidth > 720) firstInput.focus({ preventScroll: true });
}

function recoWelcomeHTML() {
  const saved = state.reco && state.reco.pets && state.reco.sunlight;
  return `<div class="reco-step reco-welcome">
    <span class="reco-welcome__art" aria-hidden="true">
      <svg viewBox="0 0 96 96">
        <circle cx="48" cy="48" r="44" fill="#EDF7F1"/>
        <path d="M48 76c0-22 9-35 26-41-2 22-11 37-26 41Z" fill="#2D6A4F" opacity=".85"/>
        <path d="M48 76c0-16-8-28-23-33 2 16 8 27 23 33Z" fill="#95D5B2"/>
        <path d="M48 76c0-13 1-24 4-34" stroke="#1B4332" stroke-width="2.4" fill="none" stroke-linecap="round"/>
        <circle cx="70" cy="24" r="4" fill="#DDA15E"/>
      </svg>
    </span>
    <p class="reco-step__kicker">Personalised matching</p>
    <h2 class="reco-welcome__title">Let’s find your perfect plant!</h2>
    <p class="reco-welcome__text">Answer a few questions and discover plants that match your lifestyle and environment.</p>
    <ul class="reco-welcome__facts">
      <li>${icon('i-clock')} About 2 minutes</li>
      <li>${icon('i-paw')} Pet-safety aware</li>
      <li>${icon('i-lock')} No account needed</li>
    </ul>
    <button class="btn btn--primary" type="button" data-reco-start>
      ${saved ? 'Start again' : 'Start the questionnaire'} ${icon('i-arrow')}
    </button>
    ${saved ? `<button class="btn btn--ghost btn--sm" type="button" data-reco-last>${icon('i-dashboard')} View my last recommendations</button>` : ''}
    <p class="reco-disclaimer">${icon('i-info')} Matching uses our own rule-based compatibility scoring and general plant-care requirements — not live weather data or AI.</p>
  </div>`;
}

function recoQuestionHTML(stepIndex) {
  const q = RECO_QUESTIONS[stepIndex];
  const answers = state.reco;
  const current = answers[q.id];
  const isLast = stepIndex === RECO_QUESTIONS.length - 1;

  let fieldset = '';
  if (q.type === 'location') {
    fieldset = `<div class="reco-fields">
      <div class="field">
        <label for="recoCountry">Country</label>
        <select id="recoCountry">
          ${['India', 'Nepal', 'Sri Lanka', 'Bangladesh', 'United Arab Emirates', 'Singapore', 'Other'].map(c =>
            `<option value="${esc(c)}"${answers.country === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="recoState">State or region</label>
        <input type="text" id="recoState" list="stateList" placeholder="e.g. Punjab" value="${esc(answers.state || '')}" autocomplete="address-level1">
        <datalist id="stateList">${INDIAN_STATES.map(s => `<option value="${esc(s)}"></option>`).join('')}</datalist>
      </div>
      <div class="field field--wide">
        <label for="recoCity">City <span class="field-hint">(optional)</span></label>
        <input type="text" id="recoCity" placeholder="e.g. Chandigarh" value="${esc(answers.city || '')}" autocomplete="address-level2">
      </div>
    </div>
    <p class="reco-disclaimer">${icon('i-info')} Location is used only as a soft environmental hint — a hotter or more humid region may suit different plants. We do not access live weather data.</p>`;
  } else {
    fieldset = `<fieldset class="option-grid${q.options.length % 3 === 0 ? ' option-grid--3' : ''}" aria-label="${esc(q.title)}">
      <legend class="sr-only">${esc(q.title)}</legend>
      ${q.options.map((opt, i) => `
        <label class="reco-option">
          <input type="radio" name="reco-${esc(q.id)}" value="${esc(opt.v)}" ${current === opt.v ? 'checked' : ''} data-reco-option="${esc(q.id)}">
          <span class="reco-option__body">
            <span class="reco-option__icon">${icon(opt.icon || 'i-leaf')}</span>
            <span class="reco-option__text">
              <span class="reco-option__label">${esc(opt.label || opt.v)}</span>
              ${opt.hint ? `<span class="reco-option__hint">${esc(opt.hint)}</span>` : ''}
            </span>
          </span>
        </label>`).join('')}
    </fieldset>`;
  }

  return `<div class="reco-step">
    <p class="reco-step__kicker">${esc(q.kicker)} · ${stepIndex + 1}/${RECO_QUESTIONS.length}</p>
    <h2 class="reco-step__title">${esc(q.title)}</h2>
    <p class="reco-step__help">${esc(q.help)}</p>
    ${fieldset}
    <p class="reco-step__error" id="recoStepError" role="alert"></p>
    <div class="reco-nav">
      <button class="btn btn--ghost" type="button" data-reco-back>${icon('i-arrow')} Back</button>
      <div class="reco-nav__right">
        <span class="muted" style="font-size:.78rem">${q.type === 'location' ? 'Optional step' : 'Required'}</span>
        <button class="btn btn--primary" type="button" data-reco-next>${isLast ? 'See my matches' : 'Continue'} ${icon('i-arrow')}</button>
      </div>
    </div>
  </div>`;
}

/* ---------- Score individual plants ---------- */
function sunScore(plant, userLevel) {
  const target = SUN_LEVELS.indexOf(userLevel);
  const distances = plant.sunlight.map(s => Math.abs(SUN_LEVELS.indexOf(s) - target));
  const best = Math.min(...distances);
  const exact = plant.sunlight.includes(userLevel);
  if (exact) return { points: RECO_WEIGHTS.sun, distance: 0, label: SUN_LABELS[userLevel], exact: true };
  if (best === 1) return { points: 18, distance: 1, label: SUN_LABELS[plant.sunlight[0]], exact: false };
  return { points: 0, distance: best, label: SUN_LABELS[plant.sunlight[0]], exact: false };
}

function waterScore(plant, userCap) {
  const need = WATER_NEED[plant.water];
  const diff = need - userCap; // >0 → plant needs more water than the user gives
  if (diff <= 0 && diff >= -1) return { points: RECO_WEIGHTS.water, diff, label: WATER_LABELS[plant.water] };
  if (diff === -2) return { points: 15, diff, label: WATER_LABELS[plant.water] };
  if (diff < -2) return { points: 10, diff, label: WATER_LABELS[plant.water] };
  if (diff === 1) return { points: 10, diff, label: WATER_LABELS[plant.water] };
  return { points: 0, diff, label: WATER_LABELS[plant.water] };
}

function maintenanceScore(plant, userCap) {
  const need = MAINT_NEED[plant.maintenance];
  const diff = need - userCap;
  if (diff <= 0) return { points: RECO_WEIGHTS.maintenance, diff };
  if (diff === 1) return { points: 8, diff };
  return { points: 0, diff };
}

function experienceScore(plant, expKey) {
  const user = EXP_LEVEL[expKey];
  const need = DIFF_LEVEL[plant.difficulty];
  const diff = need - user;
  if (diff <= 0) return { points: RECO_WEIGHTS.experience, diff };
  if (diff === 1) return { points: 6, diff };
  return { points: 0, diff };
}

function budgetScore(plant, budgetKey) {
  const range = BUDGET_RANGES[budgetKey];
  if (!range) return { points: RECO_WEIGHTS.budget, over: 0 };
  if (plant.price <= range.max) return { points: RECO_WEIGHTS.budget, over: 0 };
  const over = plant.price - range.max;
  const ratio = over / range.max;
  if (ratio <= 0.25) return { points: 6, over };
  if (ratio <= 0.6) return { points: 3, over };
  return { points: 0, over };
}

function typeMatches(plant, type) {
  if (type === 'none') return true;
  const collections = plant.collections || [];
  switch (type) {
    case 'flowering': return plant.category === 'flowering' || collections.includes('flowering');
    case 'air': return collections.includes('air');
    case 'medicinal': return plant.category === 'medicinal';
    case 'succulents': return plant.category === 'succulents';
    case 'climbing': return ['pothos', 'fern', 'eucalyptus', 'calathea'].includes(plant.id);
    case 'decorative': return (plant.purpose || []).includes('Decoration');
    default: return true;
  }
}
function typeScore(plant, type) {
  if (!type || type === 'none') return { points: 8 };
  return { points: typeMatches(plant, type) ? RECO_WEIGHTS.type : 4 };
}
function placementScore(plant, placement) {
  if (!placement) return { points: 3 };
  if ((plant.placement || []).includes(placement)) return { points: RECO_WEIGHTS.placement };
  // Partial credit: both indoor-ish or both outdoor-ish
  const indoor = ['Bedroom', 'Living room', 'Office', 'Kitchen', 'Bathroom'];
  const outdoor = ['Balcony', 'Outdoor garden'];
  const sameGroup = (indoor.includes(placement) && (plant.placement || []).some(p => indoor.includes(p))) ||
                    (outdoor.includes(placement) && (plant.placement || []).some(p => outdoor.includes(p)));
  return { points: sameGroup ? 2 : 0 };
}

/** Hard pet filter — returns { ok, caution }. */
function petFilter(plant, pets) {
  if (pets === 'none' || !pets) return { ok: true, caution: false };
  const dogs = pets === 'dogs' || pets === 'both';
  const cats = pets === 'cats' || pets === 'both';
  const dogStatus = plant.pet.dogs, catStatus = plant.pet.cats;
  if (dogs && dogStatus === 'toxic') return { ok: false, reason: 'Known to be toxic to dogs' };
  if (cats && catStatus === 'toxic') return { ok: false, reason: 'Known to be toxic to cats' };
  const caution = (dogs && dogStatus === 'caution') || (cats && catStatus === 'caution');
  return { ok: true, caution };
}

/** Climate hint based on the optional location answer (informational only). */
function climateHint(answers, plant) {
  if (!answers.state) return null;
  const humid = HUMID_REGIONS.includes(answers.state);
  const dry = DRY_REGIONS.includes(answers.state);
  if (!humid && !dry) return null;
  if (humid && ['fern', 'calathea', 'peace-lily', 'anthurium', 'tulsi', 'jasmine'].includes(plant.id)) {
    return `A humid climate like ${answers.state}’s is well suited to this species.`;
  }
  if (dry && ['aloe-vera', 'jade-plant', 'echeveria', 'haworthia', 'golden-barrel-cactus', 'snake-plant', 'zz-plant', 'rosemary'].includes(plant.id)) {
    return `Dry conditions typical of ${answers.state} suit this water-wise species.`;
  }
  return null;
}

/** Score one plant. Returns null if a hard constraint fails. */
function scorePlant(plant, answers) {
  if (plant.kind !== 'plant') return null;
  if (!plant.inStock) return null;

  const pet = petFilter(plant, answers.pets);
  if (!pet.ok) return null;

  const sun = sunScore(plant, answers.sunlight);
  if (sun.distance >= 2) return null;

  const water = waterScore(plant, WATER_CAPACITY[answers.water] ?? 2);
  if (water.diff >= 2 || water.diff <= -3) return null;

  const maint = maintenanceScore(plant, MAINT_CAPACITY[answers.maintenance] ?? 1);
  if (maint.diff >= 2) return null;

  const exp = experienceScore(plant, answers.experience || 'beginner');
  if (exp.diff >= 2) return null;

  const budget = budgetScore(plant, answers.budget);
  if (budget.points === 0) return null;

  const type = typeScore(plant, answers.type);
  const place = placementScore(plant, answers.placement);

  const total = sun.points + water.points + maint.points + exp.points + budget.points + type.points + place.points;

  return {
    plant, total,
    breakdown: { sun: sun.points, water: water.points, maintenance: maint.points, experience: exp.points, budget: budget.points, type: type.points, placement: place.points },
    meta: { sun, water, maint, exp, budget, type, place, pet, overBudget: budget.over }
  };
}

/** Tie-breakers from aesthetic answers (not part of the 100-point score). */
function aestheticBonus(plant, answers) {
  let bonus = 0;
  if (answers.size && plant.size === answers.size) bonus += 2;
  if (answers.leaf && answers.leaf !== 'Any' && plant.leaf === answers.leaf) bonus += 2;
  if (answers.purpose && (plant.purpose || []).includes(answers.purpose)) bonus += 1;
  return bonus;
}

function getRecommendations(answers) {
  const scored = PLANTS_ONLY
    .map(p => {
      const result = scorePlant(p, answers);
      if (!result) return null;
      result.bonus = aestheticBonus(p, answers);
      return result;
    })
    .filter(Boolean);

  scored.sort((a, b) => (b.total - a.total) || (b.bonus - a.bonus) || (a.plant.price - b.plant.price));

  let picks = scored.filter(r => r.total >= CONFIG.recoMinScore);
  const relaxed = picks.length < 3;
  if (relaxed) picks = scored.filter(r => r.total >= 30);
  if (picks.length === 0) picks = scored.slice(0, Math.min(3, scored.length));

  return { picks: picks.slice(0, CONFIG.recoResultCount), relaxed, evaluated: scored.length };
}

/* ---------- Reasons & limitations ---------- */
function buildReasons(result, answers) {
  const { plant, meta } = result;
  const reasons = [];
  if (meta.sun.exact) reasons.push(`Matches your light exactly — ${meta.sun.label.toLowerCase()} is its ideal range.`);
  else reasons.push(`Tolerates your light level; this species is happiest in ${meta.sun.label.toLowerCase()}.`);

  if (meta.water.diff <= 0 && meta.water.diff >= -1) reasons.push(`Your watering routine suits it (${meta.water.label.toLowerCase()}).`);
  else if (meta.water.diff === 1) reasons.push(`Thirstier than your usual routine — expect to water a little more often.`);
  else reasons.push(`Needs less water than your routine, so you may need to hold back.`);

  if (meta.maint.points === RECO_WEIGHTS.maintenance) reasons.push(`${plant.maintenance}-maintenance care fits the time you have.`);
  if (meta.exp.points === RECO_WEIGHTS.experience) reasons.push(`${plant.difficulty} difficulty aligns with your experience level.`);
  if (meta.budget.points === RECO_WEIGHTS.budget) reasons.push(`Fits comfortably inside your ${BUDGET_RANGES[answers.budget] ? BUDGET_RANGES[answers.budget].label.toLowerCase() : 'stated'} budget.`);
  if (answers.type && answers.type !== 'none' && meta.type.points === RECO_WEIGHTS.type) reasons.push(`Matches your preference for ${answers.type === 'succulents' ? 'succulents and cacti' : answers.type === 'air' ? 'air-purifying plants' : answers.type === 'medicinal' ? 'medicinal and herb plants' : answers.type === 'climbing' ? 'climbing and trailing plants' : answers.type + ' plants'}.`);
  if (meta.place.points === RECO_WEIGHTS.placement) reasons.push(`Well suited to a ${answers.placement.toLowerCase()}.`);

  const climate = climateHint(answers, plant);
  if (climate) reasons.push(climate);
  return reasons.slice(0, 5);
}

function buildLimitations(result, answers) {
  const { plant, meta } = result;
  const limits = [];
  if (meta.pet.caution) limits.push(`Mildly toxic or irritating to some pets — position it out of reach of curious mouths.`);
  if (meta.sun.distance === 1 && !meta.sun.exact) limits.push(`Prefers ${meta.sun.label.toLowerCase()}; your spot is one step away from ideal.`);
  if (meta.water.diff === -2 || meta.water.diff < 0) limits.push(`You water more often than this species needs — let the soil dry first.`);
  if (meta.water.diff === 1) limits.push(`Will need more frequent watering than your stated routine.`);
  if (meta.maint.diff === 1) limits.push(`Slightly more care time than you have available each day.`);
  if (meta.exp.diff === 1) limits.push(`A step up in difficulty — read the care guide before you buy.`);
  if (meta.budget.over > 0) limits.push(`About ${money(meta.budget.over)} above your stated range.`);
  if (answers.size && plant.size !== answers.size) limits.push(`This one is ${plant.size.toLowerCase()} sized rather than ${answers.size.toLowerCase()}.`);
  if (answers.leaf && answers.leaf !== 'Any' && plant.leaf !== answers.leaf) limits.push(`Foliage is ${plant.leaf.toLowerCase()} rather than ${answers.leaf.toLowerCase()}.`);
  if (plant.stock <= CONFIG.lowStockAt) limits.push(`Only ${plant.stock} left in stock.`);
  return limits.slice(0, 4);
}

/* ---------- Results ---------- */
function ringHTML(pct) {
  const r = 25;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct / 100);
  return `<div class="reco-ring" role="img" aria-label="Compatibility ${pct} percent">
    <svg viewBox="0 0 58 58" aria-hidden="true">
      <circle class="reco-ring__bg" cx="29" cy="29" r="${r}"></circle>
      <circle class="reco-ring__fg" cx="29" cy="29" r="${r}"
        stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"></circle>
    </svg>
    <span class="reco-ring__label">${pct}%</span>
  </div>`;
}

function petSummary(plant) {
  const line = (v) => v === 'safe' ? 'Non-toxic' : v === 'toxic' ? 'Toxic' : 'Caution';
  return `Dogs: ${line(plant.pet.dogs)} · Cats: ${line(plant.pet.cats)}`;
}

function recoResultsHTML(answers) {
  const { picks, relaxed } = getRecommendations(answers);
  const petAnswer = answers.pets;
  const profileChips = [
    answers.placement, SUN_LABELS[answers.sunlight],
    RECO_QUESTIONS[3].options.find(o => o.v === answers.water)?.label,
    `Budget: ${BUDGET_RANGES[answers.budget]?.label || 'any'}`,
    answers.pets === 'none' ? 'No pets' : answers.pets === 'both' ? 'Dogs & cats' : answers.pets === 'dogs' ? 'Dogs' : 'Cats'
  ].filter(Boolean);

  if (!picks.length) {
    return `<div class="reco-results">
      <h2 class="reco-results__title">Your personalised plant recommendations</h2>
      <div class="reco-empty">
        <p class="section__sub" style="margin-inline:auto">No plants met all of your hard requirements — that can happen with a very specific combination of light, pets and budget. Try widening the budget, adjusting the light level, or choosing “no preference” for plant type.</p>
        <button class="btn btn--primary" type="button" data-reco-restart style="margin-top:1.2rem">${icon('i-sparkle')} Adjust my answers</button>
      </div>
      <p class="reco-disclaimer">${icon('i-info')} Recommendations are based on your submitted preferences and general plant-care requirements. Actual plant performance depends on local conditions.</p>
    </div>`;
  }

  return `<div class="reco-results">
    <div class="reco-results__head">
      <div>
        <h2 class="reco-results__title">Your personalised plant recommendations</h2>
        <p class="reco-results__sub">Ranked by how well each plant fits your light, routine, experience, budget and household.</p>
      </div>
      <div class="reco-results__actions">
        <button class="btn btn--outline btn--sm" type="button" data-reco-restart>${icon('i-sparkle')} Restart questionnaire</button>
      </div>
    </div>

    <div class="reco-profile" aria-label="Your answers">
      ${profileChips.map(c => `<span class="pill pill--plain">${esc(c)}</span>`).join('')}
    </div>

    ${petAnswer !== 'none' ? `<div class="reco-petwarn">${icon('i-paw')}
      <span><strong>Pet safety applied as a hard filter.</strong> Plants known to be toxic to your selected pets have been excluded entirely — they were not merely ranked lower. Mildly toxic species that remain are flagged below. Toxicity depends on the species and the amount of exposure, so always confirm with your vet before bringing a plant home.</span></div>` : ''}

    ${relaxed ? `<p class="reco-disclaimer">${icon('i-info')} Only a few plants matched every requirement, so the list below includes some broader matches. Items with lower scores are flagged with their trade-offs.</p>` : ''}

    ${picks.map((r, i) => {
      const p = r.plant;
      const pct = clamp(Math.round(r.total), 0, 100);
      const reasons = buildReasons(r, answers);
      const limits = buildLimitations(r, answers);
      const inWish = state.wishlist.includes(p.id);
      return `<article class="reco-match" style="animation-delay:${i * 70}ms">
        <div class="reco-match__media">
          <img src="${esc(p.img)}" alt="${esc(p.name)}" width="640" height="640" loading="lazy">
          <span class="reco-match__rank" aria-hidden="true">${i + 1}</span>
        </div>
        <div class="reco-match__body">
          <div class="reco-match__top">
            <div>
              <h3 class="reco-match__name">${esc(p.name)}</h3>
              <p class="reco-match__sci">${esc(p.sci)}</p>
            </div>
            <div class="reco-match__score">
              ${ringHTML(pct)}
            </div>
          </div>
          <div class="reco-match__meta">
            <span class="reco-match__price">${money(p.price)}</span>
            <span class="pill">${esc(p.difficulty)}</span>
            <span class="pill pill--plain">${esc(p.maintenance)} maintenance</span>
            ${(p.pet.dogs === 'safe' && p.pet.cats === 'safe') ? '<span class="pill">Pet friendly</span>' : '<span class="pill pill--warn">Pet caution</span>'}
          </div>
          <div class="reco-why">
            <h4>${icon('i-check')} Why this plant</h4>
            <ul>${reasons.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
          </div>
          <p class="reco-limit">${icon('i-info')} <span><strong>Care needs:</strong> ${esc(SUN_LABELS[p.sunlight[0]])} · ${esc(WATER_LABELS[p.water])} · ${esc(petSummary(p))}${limits.length ? `<br><strong>Trade-offs:</strong> ${limits.map(esc).join(' ')}` : ''}</span></p>
          <div class="reco-match__actions">
            <button class="btn btn--primary btn--sm" type="button" data-add-to-cart="${esc(p.id)}">${icon('i-cart')} Add to Cart</button>
            <button class="btn btn--outline btn--sm reco-match__wish${inWish ? ' is-active' : ''}" type="button"
              data-wishlist-toggle="${esc(p.id)}" aria-pressed="${inWish}">${icon(inWish ? 'i-heart-fill' : 'i-heart')} ${inWish ? 'Saved' : 'Wishlist'}</button>
            <button class="btn btn--ghost btn--sm" type="button" data-open-product="${esc(p.id)}">View details</button>
          </div>
        </div>
      </article>`;
    }).join('')}

    <p class="reco-disclaimer">${icon('i-info')} Recommendations are based on your submitted preferences and general plant-care requirements. Actual plant performance depends on local conditions — verify pet toxicity before purchase.</p>
  </div>`;
}

/* ---------- Questionnaire interactions ---------- */
function collectRecoStepAnswers(stepIndex) {
  const q = RECO_QUESTIONS[stepIndex];
  if (q.type === 'location') {
    state.reco.country = ($('#recoCountry') || {}).value || 'India';
    state.reco.state = ($('#recoState') || {}).value.trim();
    state.reco.city = ($('#recoCity') || {}).value.trim();
    return true;
  }
  const checked = document.querySelector(`input[name="reco-${q.id}"]:checked`);
  if (!checked) {
    const err = $('#recoStepError');
    if (err) { err.textContent = 'Please choose an option to continue.'; err.classList.add('is-visible'); }
    return false;
  }
  state.reco[q.id] = checked.value;
  return true;
}

function nextRecoStep() {
  const step = state.recoStep;
  if (typeof step !== 'number') return;
  if (!collectRecoStepAnswers(step)) return;
  saveRecoAnswers();
  if (step === RECO_QUESTIONS.length - 1) {
    state.recoStep = 'results';
    renderRecoStep();
    const card = $('#recoCard');
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  state.recoStep = step + 1;
  renderRecoStep();
}

function prevRecoStep() {
  if (typeof state.recoStep !== 'number') return;
  if (state.recoStep === 0) { state.recoStep = 'welcome'; }
  else state.recoStep -= 1;
  renderRecoStep();
}

function restartReco() {
  state.reco = blankRecoAnswers();
  saveRecoAnswers();
  state.recoStep = 0;
  renderRecoStep();
}

/* ============ 19. PLANT CARE CENTRE & PROBLEM IDENTIFIER ============ */
function renderCareTopics() {
  const grid = $('#careTopicGrid');
  if (!grid) return;
  grid.innerHTML = CARE_TOPICS.map(t => `
    <button class="topic-card" type="button" data-care-topic="${esc(t.id)}">
      <span class="topic-card__icon">${icon(t.icon)}</span>
      <h3>${esc(t.title)}</h3>
      <p>${esc(t.summary)}</p>
      <span class="topic-card__more">Read guide ${icon('i-arrow')}</span>
    </button>`).join('');
}

function renderCareGuides(query = '') {
  const grid = $('#careGuideGrid');
  const empty = $('#careEmpty');
  const countEl = $('#careSearchCount');
  if (!grid) return;
  const q = query.trim().toLowerCase();
  const list = CARE_GUIDES.filter(g => !q ||
    `${g.name} ${g.sci} ${g.intro} ${g.difficulty}`.toLowerCase().includes(q));
  grid.innerHTML = list.map(g => {
    const product = PRODUCTS.find(p => p.careId === g.id);
    const petSafe = product ? product.pet.dogs === 'safe' && product.pet.cats === 'safe' : false;
    return `<article class="care-card">
      <div class="care-card__media">
        <img src="${esc(g.img)}" alt="${esc(g.name)}" width="640" height="640" loading="lazy">
        <span class="care-card__diff care-card__diff--${esc(g.difficulty.toLowerCase())}">${esc(g.difficulty)}</span>
      </div>
      <div class="care-card__body">
        <h3>${esc(g.name)}</h3>
        <p class="care-card__sci">${esc(g.sci)}</p>
        <div class="care-card__icons">
          <span class="tag-mini">${icon('i-sun')}${esc((CARE_SHORT[g.id] || {}).sun || 'See guide')}</span>
          <span class="tag-mini">${icon('i-drop')}${esc((CARE_SHORT[g.id] || {}).water || 'See guide')}</span>
        </div>
        <p class="care-card__excerpt">${esc(g.intro)}</p>
        <div class="care-card__foot">
          <span class="care-card__pet${petSafe ? '' : ' care-card__pet--toxic'}">${icon('i-paw')}${petSafe ? 'Pet safe' : 'Pet caution'}</span>
          <button class="btn btn--primary btn--sm" type="button" data-open-care="${esc(g.id)}">Care guide</button>
        </div>
      </div>
    </article>`;
  }).join('');
  grid.hidden = list.length === 0;
  if (empty) empty.hidden = list.length > 0;
  if (countEl) countEl.textContent = q
    ? `${pluralize(list.length, 'guide')} found for “${query.trim()}”`
    : `${CARE_GUIDES.length} species guides`;
}

function openCareGuide(id) {
  const g = CARE_GUIDE_BY_PLANT[id];
  if (!g) return;
  const product = PRODUCTS.find(p => p.careId === id);
  const rows = [
    { icon: 'i-sun', label: 'Ideal sunlight', value: g.sun },
    { icon: 'i-drop', label: 'Watering', value: g.water },
    { icon: 'i-soil', label: 'Soil', value: g.soil },
    { icon: 'i-drop', label: 'Humidity', value: g.humidity },
    { icon: 'i-sun', label: 'Temperature', value: g.temp },
    { icon: 'i-soil', label: 'Fertilizer', value: g.fertilizer },
    { icon: 'i-pot', label: 'Repotting', value: g.repot },
    { icon: 'i-scissors', label: 'Pruning', value: g.prune }
  ];
  const bodyHTML = `<div class="care-modal">
    <div class="care-modal__head">
      <img src="${esc(g.img)}" alt="" width="76" height="76">
      <div>
        <h3>${esc(g.name)}</h3>
        <p>${esc(g.sci)} · ${esc(g.difficulty)} care</p>
      </div>
      <span class="pill" style="margin-left:auto">${icon('i-book')} Species guide</span>
    </div>
    <p class="care-modal__intro">${esc(g.intro)}</p>
    <div class="care-modal__grid">
      ${rows.map(r => `<div class="care-item">
        <h4>${icon(r.icon)}${esc(r.label)}</h4>
        <p>${esc(r.value)}</p></div>`).join('')}
      <div class="care-item care-item--wide">
        <h4>${icon('i-alert')}Common problems to watch for</h4>
        <ul class="care-problems">${g.problems.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
      </div>
    </div>
    <h4 class="care-modal__section-title">${icon('i-leaf')} Beginner &amp; advanced notes</h4>
    <div class="care-tips">
      <div class="care-tipbox care-tipbox--beginner"><h4>Start here</h4><p>${esc(g.beginner)}</p></div>
      <div class="care-tipbox care-tipbox--advanced"><h4>Going further</h4><p>${esc(g.advanced)}</p></div>
    </div>
    <div class="pd__pet ${product && product.pet.dogs === 'safe' && product.pet.cats === 'safe' ? 'is-safe' : ''}">
      ${icon('i-paw')}<div><strong>Pet safety</strong>${esc(g.pet)} Always confirm toxicity details for your own pets.</div>
    </div>
  </div>`;
  const footHTML = product
    ? `<a class="btn btn--primary btn--sm" href="#/shop" data-open-product="${esc(product.id)}">${icon('i-cart')} View ${esc(product.name)}</a>
       <button class="btn btn--outline btn--sm" type="button" data-close-modal>Close guide</button>`
    : `<button class="btn btn--primary btn--sm" type="button" data-close-modal>Close guide</button>`;
  openModal({ title: 'Plant care guide', bodyHTML, footHTML, wide: true, onMount: (dialog) => {
    const link = dialog.querySelector('[data-open-product]');
    if (link) {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const pid = link.dataset.openProduct;
        closeModal();
        setTimeout(() => openProductDetail(pid), 140);
      });
    }
  } });
}

function openCareTopic(id) {
  const t = CARE_TOPIC_BY_ID[id];
  if (!t) return;
  const bodyHTML = `<div class="prose">
    <p>${esc(t.summary)}</p>
    ${t.body.map(par => `<p>${esc(par)}</p>`).join('')}
    <div class="care-tips">
      <div class="care-tipbox care-tipbox--beginner"><h4>Beginner tip</h4><p>${esc(t.beginner)}</p></div>
      <div class="care-tipbox care-tipbox--advanced"><h4>Advanced note</h4><p>${esc(t.advanced)}</p></div>
    </div>
    <p class="disclaimer-box">${icon('i-info')} Guidance is general. Adjust for your species, climate and pot setup, and remember that fixed schedules are a starting point — not a rule.</p>
  </div>`;
  openModal({ title: `${t.title} — care fundamentals`, bodyHTML, footHTML: '<button class="btn btn--primary btn--sm" type="button" data-close-modal>Got it</button>' });
}

/* ---------- Symptom checker ---------- */
function renderSymptomGrid() {
  const grid = $('#symptomGrid');
  if (!grid) return;
  grid.innerHTML = SYMPTOMS.map(s => `
    <label class="symptom-chip">
      <input type="checkbox" value="${esc(s.id)}" data-symptom>
      <span>${esc(s.label)}</span>
    </label>`).join('');
}

function selectedSymptoms() {
  return $$('[data-symptom]:checked').map(i => i.value);
}

function runSymptomCheck() {
  const wrap = $('#problemResults');
  if (!wrap) return;
  const picked = selectedSymptoms();
  if (!picked.length) {
    wrap.innerHTML = `<div class="problem-card"><div class="problem-card__body">
      <p style="margin:0;font-size:.88rem;color:var(--muted)">Select at least one symptom above, then choose “Show possible causes”.</p>
    </div></div>`;
    toast('No symptoms selected', 'Tick one or more symptoms to see possible causes.', 'warn');
    return;
  }
  wrap.innerHTML = picked.map(id => {
    const s = SYMPTOM_BY_ID[id];
    if (!s) return '';
    return `<div class="problem-card">
      <div class="problem-card__head">${icon('i-alert')}<h3>${esc(s.label)}</h3>
        <span class="pill pill--plain">${pluralize(s.causes.length, 'possible cause')}</span></div>
      <div class="problem-card__body">
        ${s.causes.map(c => `<div class="cause-block">
          <h4>${esc(c.title)}
            <span class="likelihood${c.likelihood === 'common' ? ' likelihood--common' : ''}">${esc(c.likelihood || 'possible')}</span>
          </h4>
          <dl>
            <div class="cause-row"><dt>Inspect</dt><dd>${esc(c.inspect)}</dd></div>
            <div class="cause-row"><dt>Do this</dt><dd>${esc(c.action)}</dd></div>
            <div class="cause-row"><dt>Prevent</dt><dd>${esc(c.prevent)}</dd></div>
          </dl>
        </div>`).join('')}
      </div>
    </div>`;
  }).join('');
  const first = wrap.querySelector('.problem-card');
  if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function resetSymptoms() {
  $$('[data-symptom]').forEach(cb => { cb.checked = false; });
  const wrap = $('#problemResults');
  if (wrap) wrap.innerHTML = '';
}

/* ============ 20. PERSONAL PLANT DASHBOARD ============ */
const PLANT_TYPES = ['Indoor houseplant', 'Succulent / cactus', 'Herb / medicinal', 'Flowering plant', 'Outdoor plant', 'Other'];
const WATER_INTERVALS = [
  { v: 1, label: 'Every day' }, { v: 2, label: 'Every 2 days' }, { v: 3, label: 'Every 3 days' },
  { v: 7, label: 'Once a week' }, { v: 10, label: 'Every 10 days' },
  { v: 14, label: 'Every 2 weeks' }, { v: 30, label: 'Once a month' }
];
const FEED_INTERVALS = [
  { v: 14, label: 'Every 2 weeks' }, { v: 30, label: 'Monthly' },
  { v: 60, label: 'Every 2 months' }, { v: 90, label: 'Every 3 months' }, { v: 0, label: 'No feeding reminder' }
];

function savePlants() { storage.write(STORE_KEYS.plants, state.plants); }
function saveJournal() { storage.write(STORE_KEYS.journal, state.journal); }

function plantNextWater(plant) {
  if (!plant.lastWatered) return null;
  return addDays(plant.lastWatered, plant.waterInterval || 7);
}
function plantNextFeed(plant) {
  if (!plant.lastFed || !plant.feedInterval) return null;
  return addDays(plant.lastFed, plant.feedInterval);
}

function plantWaterStatus(plant) {
  const next = plantNextWater(plant);
  if (!next) return { status: 'unknown', days: null, next: null };
  const days = daysBetween(todayISO(), next);
  if (days < 0) return { status: 'overdue', days, next };
  if (days === 0) return { status: 'due', days, next };
  if (days <= 2) return { status: 'soon', days, next };
  return { status: 'ok', days, next };
}

function renderDashboard() {
  const list = $('#dashList');
  if (!list) return;

  // Stats
  let attention = 0, dueToday = 0, feedDue = 0;
  state.plants.forEach(p => {
    const ws = plantWaterStatus(p);
    if (ws.status === 'overdue' || ws.status === 'due') dueToday += 1;
    const feed = plantNextFeed(p);
    const feedDays = feed ? daysBetween(todayISO(), feed) : null;
    if (feedDays !== null && feedDays <= 0) attention += 1;
    if (feedDays !== null && feedDays <= 7) feedDue += 1;
    if (ws.status === 'overdue') attention += 1;
  });
  const set = (sel, val) => { const el = $(sel); if (el) el.textContent = String(val); };
  set('#statTotal', state.plants.length);
  set('#statAttention', attention);
  set('#statWaterToday', dueToday);
  set('#statFertDue', feedDue);

  const empty = $('#dashEmpty');
  if (empty) empty.hidden = state.plants.length > 0;

  // Sort
  const sortMode = ($('#dashSort') || {}).value || 'watering';
  const plants = state.plants.slice().sort((a, b) => {
    if (sortMode === 'name') return a.name.localeCompare(b.name);
    if (sortMode === 'added') return (b.added || '').localeCompare(a.added || '');
    const na = plantNextWater(a) || '9999-99-99';
    const nb = plantNextWater(b) || '9999-99-99';
    return na.localeCompare(nb);
  });

  list.innerHTML = plants.map(p => {
    const ws = plantWaterStatus(p);
    const feed = plantNextFeed(p);
    const feedDays = feed ? daysBetween(todayISO(), feed) : null;
    const statusPill = ws.status === 'overdue' ? `<span class="pill pill-due">Check soil now</span>`
      : ws.status === 'due' ? `<span class="pill pill-soon">Check today</span>`
      : ws.status === 'soon' ? `<span class="pill pill-soon">Check ${relativeDays(ws.days)}</span>`
      : ws.status === 'ok' ? `<span class="pill pill-ok">Check ${relativeDays(ws.days)}</span>` : '';
    const feedPill = feedDays === null ? '' : feedDays < 0
      ? `<span class="pill pill-due">Feed overdue</span>`
      : feedDays <= 7 ? `<span class="pill pill-soon">Feed ${relativeDays(feedDays)}</span>` : '';
    const avatar = p.img
      ? `<img src="${esc(p.img)}" alt="" width="64" height="64" loading="lazy">`
      : icon(p.type && p.type.includes('Succulent') ? 'i-drop' : 'i-pot');
    return `<div class="plant-row" data-plant-id="${esc(p.id)}">
      <div class="plant-row__avatar">${avatar}</div>
      <div class="plant-row__main">
        <div class="plant-row__title"><h3 class="plant-row__name">${esc(p.name)}</h3></div>
        <p class="plant-row__meta">
          <span class="meta-item">${icon('i-pot')}${esc(p.location || 'Home')}</span>
          <span class="meta-item">${icon('i-drop')}Last watered ${p.lastWatered ? formatDate(p.lastWatered) : '—'}</span>
          <span class="meta-item">${icon('i-calendar')}Next check ${ws.next ? formatDate(ws.next) : '—'}</span>
        </p>
        <div class="plant-row__badges">${statusPill}${feedPill}</div>
        ${p.notes ? `<p class="plant-row__notes is-open">${icon('i-edit')} ${esc(p.notes)}</p>` : ''}
        ${p.feedNotes ? `<p class="plant-row__notes is-open">${icon('i-soil')} Feed note: ${esc(p.feedNotes)}</p>` : ''}
      </div>
      <div class="plant-row__actions">
        <button class="icon-action icon-action--water" type="button" data-plant-water="${esc(p.id)}" title="Mark as watered today" aria-label="Mark ${esc(p.name)} as watered today">${icon('i-drop')}</button>
        <button class="icon-action" type="button" data-plant-feed="${esc(p.id)}" title="Mark as fed today" aria-label="Mark ${esc(p.name)} as fed today">${icon('i-soil')}</button>
        <button class="icon-action" type="button" data-plant-edit="${esc(p.id)}" title="Edit plant" aria-label="Edit ${esc(p.name)}">${icon('i-edit')}</button>
        <button class="icon-action icon-action--danger" type="button" data-plant-remove="${esc(p.id)}" title="Remove plant" aria-label="Remove ${esc(p.name)} from collection">${icon('i-trash')}</button>
      </div>
    </div>`;
  }).join('');

  renderUpcoming();
  renderJournal();
}

function renderUpcoming() {
  const wrap = $('#upcomingList');
  if (!wrap) return;
  const events = [];
  state.plants.forEach(p => {
    const next = plantNextWater(p);
    if (next) {
      const days = daysBetween(todayISO(), next);
      events.push({ type: 'water', name: p.name, date: next, days });
    }
    const feed = plantNextFeed(p);
    if (feed) {
      const days = daysBetween(todayISO(), feed);
      events.push({ type: 'feed', name: p.name, date: feed, days });
    }
  });
  events.sort((a, b) => a.date.localeCompare(b.date));
  if (!events.length) {
    wrap.innerHTML = '<p class="upcoming-empty">Add a plant to see upcoming watering and feeding reminders.</p>';
    return;
  }
  wrap.innerHTML = events.slice(0, 7).map(ev => {
    const cls = ev.days < 0 ? 'upcoming-item__dot--due' : ev.days <= 1 ? 'upcoming-item__dot--soon' : '';
    return `<div class="upcoming-item">
      <span class="upcoming-item__dot ${cls}"></span>
      <span class="upcoming-item__text"><strong>${esc(ev.name)}</strong>${ev.type === 'water' ? 'Check soil moisture' : 'Feed if in growing season'}</span>
      <span class="upcoming-item__when">${formatDate(ev.date, { day: 'numeric', month: 'short' })}${ev.days < 0 ? ' · overdue' : ev.days === 0 ? ' · today' : ''}</span>
    </div>`;
  }).join('');
}

function renderJournal() {
  const wrap = $('#journalList');
  if (!wrap) return;
  if (!state.journal.length) {
    wrap.innerHTML = '<li class="journal-empty">No journal notes yet — add your first observation above.</li>';
    return;
  }
  wrap.innerHTML = state.journal.map(entry => `<li class="journal-entry">
      <p>${esc(entry.text)}<time datetime="${esc(entry.ts)}">${formatDate(entry.ts.slice(0, 10), { day: 'numeric', month: 'short' })}</time></p>
      <button type="button" data-journal-remove="${esc(entry.id)}" aria-label="Delete journal note">${icon('i-trash')}</button>
    </li>`).join('');
}

function addJournalNote(text) {
  const clean = String(text || '').trim();
  if (clean.length < 3) { toast('Note too short', 'Add at least a few words so it is useful later.', 'warn'); return; }
  state.journal.unshift({ id: uid('note'), text: clean.slice(0, 240), ts: new Date().toISOString() });
  state.journal = state.journal.slice(0, 40);
  saveJournal();
  renderJournal();
  toast('Journal note added', '', 'success');
}

/* ---------- Add / edit plant modal ---------- */
function openPlantModal(plantId = null, preset = {}) {
  const existing = plantId ? state.plants.find(p => p.id === plantId) : null;
  const p = existing || Object.assign({
    name: '', type: 'Indoor houseplant', location: 'Living room', added: todayISO(),
    lastWatered: todayISO(), waterInterval: 7, lastFed: '', feedInterval: 30, feedNotes: '', notes: '', img: '', productId: ''
  }, preset);

  const bodyHTML = `<form class="form" id="plantForm" novalidate>
    <div class="form-row">
      <div class="field">
        <label for="plantName">Plant name <span class="req" aria-hidden="true">*</span></label>
        <input type="text" id="plantName" value="${esc(p.name)}" required aria-describedby="plantNameErr" autocomplete="off">
        <p class="field-error" id="plantNameErr"></p>
      </div>
      <div class="field">
        <label for="plantType">Plant type</label>
        <select id="plantType">${PLANT_TYPES.map(t => `<option${p.type === t ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>
      </div>
    </div>
    <div class="form-row">
      <div class="field">
        <label for="plantLocation">Location in your home</label>
        <select id="plantLocation">${PLACEMENTS.map(l => `<option${p.location === l ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>
      </div>
      <div class="field">
        <label for="plantAdded">Date added</label>
        <input type="date" id="plantAdded" value="${esc(p.added || todayISO())}" max="${todayISO()}">
      </div>
    </div>
    <div class="form-row">
      <div class="field">
        <label for="plantLastWatered">Last watered</label>
        <input type="date" id="plantLastWatered" value="${esc(p.lastWatered || todayISO())}" max="${todayISO()}">
      </div>
      <div class="field">
        <label for="plantWaterInterval">Watering reminder</label>
        <select id="plantWaterInterval">${WATER_INTERVALS.map(w => `<option value="${w.v}"${Number(p.waterInterval) === w.v ? ' selected' : ''}>${esc(w.label)}</option>`).join('')}</select>
        <p class="field-hint">A reminder to check the soil — not an instruction to water.</p>
      </div>
    </div>
    <div class="form-row">
      <div class="field">
        <label for="plantLastFed">Last fertilized <span class="field-hint">(optional)</span></label>
        <input type="date" id="plantLastFed" value="${esc(p.lastFed || '')}" max="${todayISO()}">
      </div>
      <div class="field">
        <label for="plantFeedInterval">Feeding reminder</label>
        <select id="plantFeedInterval">${FEED_INTERVALS.map(f => `<option value="${f.v}"${Number(p.feedInterval) === f.v ? ' selected' : ''}>${esc(f.label)}</option>`).join('')}</select>
      </div>
    </div>
    <div class="field">
      <label for="plantFeedNotes">Fertilizing notes</label>
      <input type="text" id="plantFeedNotes" value="${esc(p.feedNotes || '')}" maxlength="120" placeholder="e.g. Diluted organic feed, half strength">
    </div>
    <div class="field">
      <label for="plantNotes">Personal notes</label>
      <textarea id="plantNotes" rows="3" maxlength="300" placeholder="e.g. Moved to the east window, new leaf unfurling">${esc(p.notes || '')}</textarea>
    </div>
    <p class="field-error" id="plantFormErr"></p>
  </form>`;

  const footHTML = `<button class="btn btn--ghost btn--sm" type="button" data-close-modal>Cancel</button>
    <button class="btn btn--primary btn--sm" type="submit" form="plantForm">${existing ? 'Save changes' : 'Add to my collection'}</button>`;

  openModal({ title: existing ? 'Edit plant' : 'Add a plant to your collection', bodyHTML, footHTML, onMount: (dialog) => {
    const form = dialog.querySelector('#plantForm');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = dialog.querySelector('#plantName').value.trim();
      const errEl = dialog.querySelector('#plantNameErr');
      if (name.length < 2) {
        errEl.textContent = 'Please enter a plant name (at least 2 characters).';
        dialog.querySelector('#plantName').setAttribute('aria-invalid', 'true');
        dialog.querySelector('#plantName').focus();
        return;
      }
      errEl.textContent = '';
      const data = {
        name: name.slice(0, 60),
        type: dialog.querySelector('#plantType').value,
        location: dialog.querySelector('#plantLocation').value,
        added: dialog.querySelector('#plantAdded').value || todayISO(),
        lastWatered: dialog.querySelector('#plantLastWatered').value || todayISO(),
        waterInterval: Number(dialog.querySelector('#plantWaterInterval').value) || 7,
        lastFed: dialog.querySelector('#plantLastFed').value || '',
        feedInterval: Number(dialog.querySelector('#plantFeedInterval').value) || 0,
        feedNotes: dialog.querySelector('#plantFeedNotes').value.trim().slice(0, 120),
        notes: (dialog.querySelector('#plantNotes').value || '').trim().slice(0, 300)
      };
      if (existing) {
        Object.assign(existing, data);
        toast('Plant updated', existing.name, 'success');
      } else {
        state.plants.unshift(Object.assign({ id: uid('plant'), img: p.img || '', productId: p.productId || '' }, data));
        toast('Added to your collection', data.name, 'success');
      }
      savePlants();
      closeModal();
      renderDashboard();
    });
  } });
}

function markWatered(id) {
  const plant = state.plants.find(p => p.id === id);
  if (!plant) return;
  plant.lastWatered = todayISO();
  savePlants();
  renderDashboard();
  toast('Watering logged', `${plant.name} — check soil again ${formatDate(plantNextWater(plant), { day: 'numeric', month: 'short' })}.`, 'success');
}
function markFed(id) {
  const plant = state.plants.find(p => p.id === id);
  if (!plant) return;
  plant.lastFed = todayISO();
  if (!plant.feedInterval) plant.feedInterval = 30;
  savePlants();
  renderDashboard();
  toast('Feeding logged', plant.name, 'success');
}
function removePlant(id) {
  const plant = state.plants.find(p => p.id === id);
  if (!plant) return;
  openModal({
    title: 'Remove this plant?',
    bodyHTML: `<div class="prose"><p>This will permanently remove <strong>${esc(plant.name)}</strong> and its watering history from your collection in this browser.</p>
      <p class="muted" style="font-size:.85rem">Your journal notes are kept separately.</p></div>`,
    footHTML: `<button class="btn btn--ghost btn--sm" type="button" data-close-modal>Keep plant</button>
      <button class="btn btn--danger btn--sm" type="button" id="confirmRemovePlant">Remove plant</button>`,
    onMount: (dialog) => {
      dialog.querySelector('#confirmRemovePlant').addEventListener('click', () => {
        state.plants = state.plants.filter(p => p.id !== id);
        savePlants();
        closeModal();
        renderDashboard();
        toast('Plant removed', plant.name, 'info');
      });
    }
  });
}

/* ============ 21. FORMS & MISC ============ */
function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email).trim());
}

async function initNewsletter() {
  const form = $('#newsletterForm');
  if (!form) return;
  let submitting = false;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submitting) return;

    const input = $('#newsletterEmail');
    const msg = $('#newsletterMsg');
    const btn = form.querySelector('button[type="submit"]');
    const email = input.value.trim();

    const fail = (text) => {
      msg.textContent = text;
      msg.className = 'form-msg is-error';
      input.setAttribute('aria-invalid', 'true');
      input.focus();
    };

    if (!email) return fail('Please enter your email address.');
    if (!validateEmail(email)) return fail('That email doesn’t look right — check for a missing @ or domain.');

    input.setAttribute('aria-invalid', 'false');
    submitting = true;
    if (btn) { btn.disabled = true; btn.classList.add('is-loading'); }
    msg.textContent = 'Subscribing…';
    msg.className = 'form-msg';

    const res = await API.post('/api/newsletter', { email });

    if (btn) { btn.disabled = false; btn.classList.remove('is-loading'); }
    submitting = false;

    if (!res.ok) {
      // 409 = already subscribed: a friendly, non-error outcome.
      if (res.status === 409) {
        msg.textContent = 'You’re already on the list — that email is subscribed.';
        msg.className = 'form-msg is-success';
        form.reset();
        toast('Already subscribed', 'That email is already in the list.', 'info');
        return;
      }
      const reason = apiErrorMessage(res, 'We could not save your subscription. Please try again.');
      msg.textContent = reason;
      msg.className = 'form-msg is-error';
      toast('Subscription failed', reason, 'error');
      return;
    }

    // Keep a local mirror so the page works if the server is later offline.
    const subs = storage.read(STORE_KEYS.newsletter, []);
    const list = Array.isArray(subs) ? subs : [];
    if (!list.includes(email)) list.push(email);
    storage.write(STORE_KEYS.newsletter, list);

    msg.textContent = `Thanks! ${email} is subscribed. This is a demonstration store — no emails will be sent.`;
    msg.className = 'form-msg is-success';
    form.reset();
    toast('Subscribed', 'Saved on the Verdant server. No emails will be sent.', 'success');
  });
}

function initContactForm() {
  const form = $('#contactForm');
  if (!form) return;
  const message = $('#contactMessage');
  const counter = $('#contactCharCount');
  const msg = $('#contactFormMsg');
  let submitting = false;

  const rules = {
    contactName: v => v.trim().length >= 2 || 'Please enter your name.',
    contactEmail: v => validateEmail(v) || 'Enter a valid email address.',
    contactPhone: v => !v.trim() || /^[6-9]\d{9}$/.test(v.replace(/[\s-]/g, '')) || 'Enter a valid 10-digit mobile number, or leave it blank.',
    contactSubject: v => v.trim().length > 0 || 'Please choose a subject.',
    contactMessage: v => v.trim().length >= 10 || 'Please add a little more detail (at least 10 characters).'
  };

  function validate(id) {
    const el = document.getElementById(id);
    const errEl = document.getElementById(id + 'Err');
    const result = rules[id](el.value);
    const ok = result === true;
    if (errEl) errEl.textContent = ok ? '' : result;
    el.setAttribute('aria-invalid', ok ? 'false' : 'true');
    return ok;
  }

  Object.keys(rules).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('blur', () => validate(id));
  });

  if (message && counter) {
    message.addEventListener('input', () => {
      const len = message.value.length;
      counter.textContent = String(len);
      if (len > 600) {
        message.value = message.value.slice(0, 600);
        counter.textContent = '600';
      }
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submitting) return;

    const invalid = Object.keys(rules).filter(id => !validate(id));
    if (invalid.length) {
      msg.textContent = `Please fix ${pluralize(invalid.length, 'field')} before sending.`;
      msg.className = 'form-msg is-error';
      const first = document.getElementById(invalid[0]);
      if (first) first.focus();
      return;
    }

    const btn = form.querySelector('.form-actions button[type="submit"]');
    const payload = {
      name: $('#contactName').value.trim(),
      email: $('#contactEmail').value.trim(),
      phone: $('#contactPhone').value.trim(),
      subject: $('#contactSubject').value,
      message: $('#contactMessage').value.trim()
    };

    submitting = true;
    if (btn) { btn.disabled = true; btn.classList.add('is-loading'); }
    msg.textContent = 'Sending your message…';
    msg.className = 'form-msg';

    const res = await API.post('/api/contact', payload);

    if (btn) { btn.disabled = false; btn.classList.remove('is-loading'); }
    submitting = false;

    if (!res.ok) {
      const fieldErrors = (res.data && res.data.errors) || {};
      const fieldMap = { name: 'contactName', email: 'contactEmail', phone: 'contactPhone', subject: 'contactSubject', message: 'contactMessage' };
      Object.entries(fieldErrors).forEach(([field, text]) => {
        const id = fieldMap[field];
        if (!id) return;
        const errEl = document.getElementById(id + 'Err');
        const input = document.getElementById(id);
        if (errEl) errEl.textContent = text;
        if (input) input.setAttribute('aria-invalid', 'true');
      });
      const reason = apiErrorMessage(res, 'We could not save your message. Please try again.');
      msg.textContent = reason;
      msg.className = 'form-msg is-error';
      toast('Message not sent', reason, 'error');
      return;
    }

    // Server confirmed the save — only now clear the form and claim success.
    const firstName = payload.name.split(' ')[0];
    form.reset();
    if (counter) counter.textContent = '0';
    msg.textContent = `Thank you, ${firstName}! Your message was saved and the Verdant team can see it. This is a demonstration store, so no email was sent.`;
    msg.className = 'form-msg is-success';
    toast('Message saved', 'The administrator can now see it in the dashboard.', 'success', 5000);
  });

  form.addEventListener('reset', () => {
    ['contactNameErr', 'contactEmailErr', 'contactPhoneErr', 'contactSubjectErr', 'contactMessageErr'].forEach(id => {
      const el = document.getElementById(id); if (el) el.textContent = '';
    });
    ['contactName', 'contactEmail', 'contactPhone', 'contactSubject', 'contactMessage'].forEach(id => {
      const el = document.getElementById(id); if (el) el.setAttribute('aria-invalid', 'false');
    });
    if (counter) counter.textContent = '0';
    msg.textContent = '';
    msg.className = 'form-msg';
  });
}

/* ============ 22. EVENT WIRING ============ */
function wireHeader() {
  const menuToggle = $('#menuToggle');
  const scrim = $('#navScrim');
  if (menuToggle) {
    menuToggle.addEventListener('click', () => {
      const nav = $('#primaryNav');
      if (nav.classList.contains('is-open')) closeMobileNav(); else openMobileNav();
    });
  }
  if (scrim) scrim.addEventListener('click', closeMobileNav);

  const searchToggle = $('#searchToggle');
  if (searchToggle) {
    searchToggle.addEventListener('click', () => {
      const panel = $('#headerSearch');
      if (panel.hidden) openHeaderSearch(); else closeHeaderSearch();
    });
  }
  const searchClose = $('#searchClose');
  if (searchClose) searchClose.addEventListener('click', closeHeaderSearch);

  const searchForm = $('#headerSearchForm');
  if (searchForm) {
    searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = $('#headerSearchInput').value.trim();
      state.filters.q = q;
      saveShopFilters();
      const searchInput = $('#shopSearch');
      if (searchInput) searchInput.value = q;
      closeHeaderSearch();
      if (parseRoute().view !== 'shop') navigate('/shop');
      else renderShop();
      if (q) toast('Searching', `Results for “${q}”`, 'info', 2200);
    });
  }

  // Navigation: close the mobile menu when a link is followed
  $$('.nav a, .site-footer a').forEach(link => {
    link.addEventListener('click', () => closeMobileNav());
  });

  // Sticky header shadow + back to top
  const onScroll = () => {
    const header = $('#siteHeader');
    if (header) header.classList.toggle('is-stuck', window.scrollY > 8);
    const toTop = $('#toTop');
    if (toTop) toTop.hidden = window.scrollY < 500;
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const toTop = $('#toTop');
  if (toTop) toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!$('#modal').hidden) closeModal();
      else if ($('#primaryNav').classList.contains('is-open')) closeMobileNav();
      else if (!$('#headerSearch').hidden) closeHeaderSearch();
    }
    trapFocus(e);
  });
}

function wireModalShell() {
  const modal = $('#modal');
  if (!modal) return;
  modal.addEventListener('click', (e) => {
    if (e.target.closest('[data-close-modal]')) closeModal();
  });
}

function wireShop() {
  const form = $('#filterForm');
  if (form) {
    form.addEventListener('submit', (e) => e.preventDefault());
    const search = $('#shopSearch');
    if (search) {
      search.addEventListener('input', debounce(() => {
        state.filters.q = search.value;
        saveShopFilters();
        renderShop();
      }, 200));
    }
    form.addEventListener('change', (e) => {
      const t = e.target;
      if (t.matches('[data-category-filter]')) {
        state.filters.categories = $$('[data-category-filter]:checked').map(i => i.value);
      } else if (t.matches('[data-filter="maintenance"] input')) {
        state.filters.maintenance = $$('[data-filter="maintenance"] input:checked').map(i => i.value);
      } else if (t.matches('[data-filter="sun"] input')) {
        state.filters.sun = $$('[data-filter="sun"] input:checked').map(i => i.value);
      } else if (t.matches('[data-filter="difficulty"] input')) {
        state.filters.difficulty = $$('[data-filter="difficulty"] input:checked').map(i => i.value);
      } else if (t.id === 'inStockOnly') {
        state.filters.inStock = t.checked;
      } else if (t.name === 'rating') {
        state.filters.rating = Number(t.value) || 0;
      } else {
        return;
      }
      saveShopFilters();
      renderShop();
    });
  }

  const minR = $('#priceMin'), maxR = $('#priceMax');
  const onRange = () => {
    let min = Number(minR.value), max = Number(maxR.value);
    if (min > max) { const tmp = min; min = max; max = tmp; }
    state.filters.priceMin = min;
    state.filters.priceMax = max;
    const minOut = $('#priceMinOut'), maxOut = $('#priceMaxOut');
    if (minOut) minOut.textContent = money(min);
    if (maxOut) maxOut.textContent = money(max);
    saveShopFilters();
    renderShop();
  };
  if (minR) minR.addEventListener('input', debounce(onRange, 120));
  if (maxR) maxR.addEventListener('input', debounce(onRange, 120));

  const sort = $('#sortSelect');
  if (sort) sort.addEventListener('change', () => {
    state.filters.sort = sort.value;
    saveShopFilters();
    renderShop();
  });

  const clear = $('#clearFilters');
  if (clear) clear.addEventListener('click', () => { resetAllFilters(); toast('Filters cleared', 'Showing all products.', 'info', 2000); });
  const resetBtn = $('#resetSearchBtn');
  if (resetBtn) resetBtn.addEventListener('click', () => { resetAllFilters(); });

  const activeWrap = $('#activeFilters');
  if (activeWrap) {
    activeWrap.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-remove-filter]');
      if (btn) removeFilter(btn.dataset.removeFilter);
    });
  }

  const filtersToggle = $('#filtersToggle');
  if (filtersToggle) {
    filtersToggle.addEventListener('click', () => {
      const panel = $('.filters');
      const open = panel.classList.toggle('is-open');
      filtersToggle.setAttribute('aria-expanded', String(open));
    });
  }
}

function wireCartAndCheckout() {
  const cartItems = $('#cartItems');
  if (cartItems) {
    cartItems.addEventListener('click', (e) => {
      const qtyBtn = e.target.closest('[data-cart-qty]');
      if (qtyBtn) {
        const row = qtyBtn.closest('[data-cart-id]');
        const id = row.dataset.cartId;
        const input = row.querySelector('[data-cart-qty-input]');
        const step = qtyBtn.dataset.cartQty === 'plus' ? 1 : -1;
        setCartQty(id, (Number(input.value) || 1) + step);
        return;
      }
      const removeBtn = e.target.closest('[data-cart-remove]');
      if (removeBtn) removeFromCart(removeBtn.dataset.cartRemove);
    });
    cartItems.addEventListener('change', (e) => {
      const input = e.target.closest('[data-cart-qty-input]');
      if (input) setCartQty(input.dataset.cartQtyInput, input.value);
    });
  }

  const clearBtn = $('#clearCartBtn');
  if (clearBtn) clearBtn.addEventListener('click', () => {
    if (!state.cart.length) return;
    openModal({
      title: 'Clear your cart?',
      bodyHTML: `<div class="prose"><p>This removes all ${pluralize(cartCount(), 'item')} from your cart. Your wishlist and saved plants are not affected.</p></div>`,
      footHTML: `<button class="btn btn--ghost btn--sm" type="button" data-close-modal>Keep cart</button>
        <button class="btn btn--danger btn--sm" type="button" id="confirmClearCart">Clear cart</button>`,
      onMount: (dialog) => {
        dialog.querySelector('#confirmClearCart').addEventListener('click', () => {
          state.cart = [];
          storage.write(STORE_KEYS.cart, state.cart);
          updateCartCounters();
          closeModal();
          renderCart();
          toast('Cart cleared', 'Your cart is now empty.', 'info');
        });
      }
    });
  });

  const updateBtn = $('#updateCartBtn');
  if (updateBtn) updateBtn.addEventListener('click', () => {
    storage.write(STORE_KEYS.cart, state.cart);
    renderCart();
    toast('Cart updated', 'Totals recalculated from current quantities.', 'success', 2600);
  });

  const checkoutBtn = $('#checkoutBtn');
  if (checkoutBtn) checkoutBtn.addEventListener('click', () => {
    if (!state.cart.length) return;
    navigate('/checkout');
  });

  const checkoutForm = $('#checkoutForm');
  if (checkoutForm) {
    checkoutForm.addEventListener('submit', (e) => {
      e.preventDefault();
      // Validate first: invalid fields should be reported instantly, never behind a spinner.
      if (!validateCheckout()) return;
      const btn = $('#placeOrderBtn');
      if (btn) { btn.disabled = true; btn.textContent = 'Placing demo order…'; }
      // Brief simulated processing so the loading state is perceivable (no network involved).
      setTimeout(() => {
        if (btn) { btn.disabled = false; btn.innerHTML = 'Place demo order'; }
        placeDemoOrder();
      }, 550);
    });
    Object.keys(FIELD_RULES).forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('blur', () => { if (el.value) validateField(id); });
        el.addEventListener('input', () => { saveCheckoutDraft(); });
      }
    });
    checkoutForm.addEventListener('change', (e) => {
      if (e.target.name === 'payment') {
        const msg = $('#payDemoMsg');
        const labels = { cod: 'Cash on Delivery selected — no payment is taken in this demo.', upi: 'UPI selected (simulation). No UPI app will open and no payment is requested.', card: 'Card selected (simulation). No card fields exist in this demo and no payment is processed.' };
        if (msg) { msg.textContent = labels[e.target.value] || ''; msg.classList.add('is-visible'); }
      }
    });
  }
}

function wireWishlistPage() {
  // Wishlist rendering is handled by delegated listeners on #main
}

function wireRecommender() {
  const card = $('#recoCard');
  if (!card) return;
  card.addEventListener('click', (e) => {
    if (e.target.closest('[data-reco-start]')) {
      state.recoStep = 0;
      state.reco = state.reco && state.reco.pets ? state.reco : blankRecoAnswers();
      renderRecoStep();
      return;
    }
    if (e.target.closest('[data-reco-last]')) {
      if (state.reco && state.reco.sunlight) { state.recoStep = 'results'; renderRecoStep(); }
      return;
    }
    if (e.target.closest('[data-reco-next]')) { nextRecoStep(); return; }
    if (e.target.closest('[data-reco-back]')) { prevRecoStep(); return; }
    if (e.target.closest('[data-reco-restart]')) { restartReco(); return; }
  });
  card.addEventListener('change', (e) => {
    if (e.target.matches('[data-reco-option]')) {
      state.reco[e.target.dataset.recoOption] = e.target.value;
      saveRecoAnswers();
      const err = $('#recoStepError');
      if (err) err.classList.remove('is-visible');
    }
  });
}

function wireCare() {
  const topicGrid = $('#careTopicGrid');
  if (topicGrid) topicGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-care-topic]');
    if (btn) openCareTopic(btn.dataset.careTopic);
  });

  const guideGrid = $('#careGuideGrid');
  if (guideGrid) guideGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-open-care]');
    if (btn) openCareGuide(btn.dataset.openCare);
  });

  const careSearch = $('#careSearch');
  if (careSearch) {
    careSearch.addEventListener('input', debounce(() => renderCareGuides(careSearch.value), 180));
  }
  const careReset = $('#careResetBtn');
  if (careReset) careReset.addEventListener('click', () => {
    if (careSearch) careSearch.value = '';
    renderCareGuides('');
  });

  const checkBtn = $('#checkSymptomsBtn');
  if (checkBtn) checkBtn.addEventListener('click', runSymptomCheck);
  const resetBtn = $('#resetSymptomsBtn');
  if (resetBtn) resetBtn.addEventListener('click', resetSymptoms);
}

function wireDashboard() {
  const addBtn = $('#addPlantBtn');
  if (addBtn) addBtn.addEventListener('click', () => openPlantModal());
  const emptyAdd = $('#dashEmptyAdd');
  if (emptyAdd) emptyAdd.addEventListener('click', () => openPlantModal());

  const sort = $('#dashSort');
  if (sort) sort.addEventListener('change', renderDashboard);

  const list = $('#dashList');
  if (list) list.addEventListener('click', (e) => {
    const water = e.target.closest('[data-plant-water]');
    if (water) { markWatered(water.dataset.plantWater); return; }
    const feed = e.target.closest('[data-plant-feed]');
    if (feed) { markFed(feed.dataset.plantFeed); return; }
    const edit = e.target.closest('[data-plant-edit]');
    if (edit) { openPlantModal(edit.dataset.plantEdit); return; }
    const remove = e.target.closest('[data-plant-remove]');
    if (remove) removePlant(remove.dataset.plantRemove);
  });

  const journalForm = $('#journalForm');
  if (journalForm) journalForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#journalInput');
    addJournalNote(input.value);
    input.value = '';
  });

  const journalList = $('#journalList');
  if (journalList) journalList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-journal-remove]');
    if (btn) {
      state.journal = state.journal.filter(entry => entry.id !== btn.dataset.journalRemove);
      saveJournal();
      renderJournal();
    }
  });
}

function wireFooterAndArticles() {
  $$('[data-article]').forEach(btn => {
    btn.addEventListener('click', () => openArticle(btn.dataset.article));
  });
  $$('[data-legal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const content = LEGAL_CONTENT[btn.dataset.legal];
      if (!content) return;
      openModal({ title: content.title, bodyHTML: content.body, wide: false });
    });
  });
  const year = $('#year');
  if (year) year.textContent = String(new Date().getFullYear());

  // Service worker-free, but keep external demo links harmless
  $$('a[href^="http"]').forEach(a => a.setAttribute('rel', 'noopener noreferrer'));
}

function openArticle(key) {
  const article = ARTICLES[key];
  if (!article) return;
  const bodyHTML = `<div class="prose">
    ${article.body.map(par => {
      const html = esc(par).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      return `<p>${html}</p>`;
    }).join('')}
    <h3>Quick tips</h3>
    <ul>${article.tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
    <p class="disclaimer-box">${icon('i-info')} Fixed watering schedules are a starting point, not a rule. Watering depends on soil moisture, pot drainage, environmental conditions and species.</p>
  </div>`;
  openModal({ title: article.title, bodyHTML, footHTML: `<a class="btn btn--primary btn--sm" href="#/care">${icon('i-book')} Plant care centre</a>
    <button class="btn btn--ghost btn--sm" type="button" data-close-modal>Close</button>` });
}

/* ============ 23. BOOT ============ */
function loadPersistedState() {
  const cart = storage.read(STORE_KEYS.cart, []);
  state.cart = Array.isArray(cart) ? cart.filter(i => i && PRODUCT_BY_ID[i.id] && Number(i.qty) > 0) : [];

  const wish = storage.read(STORE_KEYS.wishlist, []);
  state.wishlist = Array.isArray(wish) ? wish.filter(id => PRODUCT_BY_ID[id]) : [];

  const plants = storage.read(STORE_KEYS.plants, []);
  state.plants = Array.isArray(plants) ? plants.filter(p => p && p.id && p.name) : [];

  const journal = storage.read(STORE_KEYS.journal, []);
  state.journal = Array.isArray(journal) ? journal.filter(e => e && e.text) : [];

  const orders = storage.read(STORE_KEYS.orders, []);
  state.orders = Array.isArray(orders) ? orders : [];

  state.lastOrder = storage.read(STORE_KEYS.lastOrder, null);
  loadShopFilters();
  state.reco = storage.read(STORE_KEYS.reco, null);
  state.recoStep = 'welcome';
}

function init() {
  if (!storage.available()) {
    console.warn('[Verdant] LocalStorage unavailable — data will not persist.');
  }
  loadPersistedState();

  renderCategoryFilters();
  syncFilterUI();
  bindProductGridEvents();
  wireHeader();
  wireModalShell();
  wireShop();
  wireCartAndCheckout();
  wireWishlistPage();
  wireRecommender();
  wireCare();
  wireDashboard();
  wireFooterAndArticles();
  initNewsletter();
  initContactForm();
  renderSymptomGrid();

  updateCartCounters();
  updateWishlistCounters();
  renderHome();
  handleRoute();

  window.addEventListener('hashchange', handleRoute);

  // Coming back to the tab is a natural moment to re-check the catalogue.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshCatalogueSoon();
  });

  // Pull the live catalogue from the Node.js backend once the page is interactive.
  // Prices, stock and availability are authoritative on the server; rendering
  // again afterwards keeps every view truthful without blocking first paint.
  syncCatalogueFromServer().then(synced => {
    if (!synced) return;
    renderCategoryFilters();
    syncFilterUI();
    renderHome();
    handleRoute();
    updateCartCounters();
    updateWishlistCounters();
    if (state.cart.length) {
      renderCheckout();
    }
  });

  console.info('%cVerdant', 'color:#2D6A4F;font-weight:700', '— store ready. Orders, messages and subscriptions are saved by the Node.js server.');
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
