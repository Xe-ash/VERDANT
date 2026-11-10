/**
 * VERDANT — Administration Panel logic
 * Vanilla ES6. Talks to the Node.js backend over fetch(); every request is
 * credentialed with the HttpOnly session cookie set by /api/admin/login.
 */
'use strict';

/* ============================================================
   01. SMALL UTILITIES
   ============================================================ */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Escape every value that reaches innerHTML. */
function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function money(n) {
  const value = Number(n) || 0;
  return '₹' + value.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function formatDate(iso, withTime = true) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const date = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  if (!withTime) return date;
  return date + ', ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function timeAgo(iso) {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diff = Math.max(0, Date.now() - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return formatDate(iso, false);
}

function statusTag(status) {
  const map = {
    Pending: 'tag--sand', Confirmed: 'tag--blue', Processing: 'tag--blue',
    Shipped: 'tag--mint', Delivered: 'tag--green', Cancelled: 'tag--red',
    New: 'tag--sand', Reviewed: 'tag--blue', Resolved: 'tag--green'
  };
  return `<span class="tag ${map[status] || 'tag--grey'}">${esc(status)}</span>`;
}

function toast(title, detail, type) {
  const host = $('#toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ` toast--${type}` : '');
  el.innerHTML = `<div><strong>${esc(title)}</strong>${detail ? `<span>${esc(detail)}</span>` : ''}</div>`;
  host.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s, transform .3s';
    el.style.opacity = '0';
    el.style.transform = 'translateX(16px)';
    setTimeout(() => el.remove(), 320);
  }, 4200);
}

function setLoading(btn, loading) {
  if (!btn) return;
  btn.classList.toggle('is-loading', loading);
  btn.disabled = loading;
}

/* ============================================================
   02. API CLIENT
   ============================================================ */
async function api(path, options = {}) {
  const config = {
    method: options.method || 'GET',
    credentials: 'same-origin',
    headers: { 'Accept': 'application/json' },
    cache: 'no-store'
  };
  if (options.body !== undefined) {
    config.headers['Content-Type'] = 'application/json';
    config.body = JSON.stringify(options.body);
  }
  let response;
  try {
    response = await fetch(path, config);
  } catch {
    throw new Error('Could not reach the server. Is node server.js still running?');
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.status === 401 && !path.includes('/login')) {
    showLogin('Your session expired. Please sign in again.');
    throw new Error('Authentication required.');
  }

  if (!response.ok) {
    const message = (payload && payload.message) || `Request failed (${response.status}).`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

/* ============================================================
   03. APPLICATION STATE
   ============================================================ */
const state = {
  user: null,
  view: 'overview',
  stats: null,
  orders: [],
  messages: [],
  subscribers: [],
  products: [],
  msgFilter: 'all',
  orderFilters: { q: '', status: 'all', from: '', to: '', sort: 'newest' }
};

/* ============================================================
   04. AUTHENTICATION
   ============================================================ */
function showLogin(message) {
  $('#appShell').hidden = true;
  $('#loginScreen').hidden = false;
  $('#adminPassword').value = '';
  if (message) {
    const box = $('#loginError');
    box.textContent = message;
    box.classList.add('is-visible');
  }
  setTimeout(() => $('#adminUsername').focus(), 60);
}

function showApp() {
  $('#loginScreen').hidden = true;
  $('#appShell').hidden = false;
  $('#sideUser').textContent = state.user ? state.user.username : '—';
  if (state.user && state.user.expiresAt) {
    $('#sideExpiry').textContent = 'Session until ' + formatDate(state.user.expiresAt);
  }
}

async function checkSession() {
  try {
    const data = await api('/api/admin/session');
    if (data.authenticated) {
      state.user = data.user;
      showApp();
      await loadAll();
      return true;
    }
  } catch {
    /* fall through to the login screen */
  }
  showLogin();
  return false;
}

function initLogin() {
  $('#loginYear').textContent = String(new Date().getFullYear());

  // Show / hide password
  const toggle = $('#pwToggle');
  const pwInput = $('#adminPassword');
  toggle.addEventListener('click', () => {
    const showing = pwInput.type === 'text';
    pwInput.type = showing ? 'password' : 'text';
    toggle.textContent = showing ? 'SHOW' : 'HIDE';
    toggle.setAttribute('aria-pressed', String(!showing));
    toggle.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    pwInput.focus();
  });

  const form = $('#loginForm');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const username = $('#adminUsername').value.trim();
    const password = pwInput.value;
    const errBox = $('#loginError');
    errBox.classList.remove('is-visible');
    $('#usernameErr').textContent = '';
    $('#passwordErr').textContent = '';

    let invalid = false;
    if (!username) { $('#usernameErr').textContent = 'Enter your username.'; invalid = true; }
    if (!password) { $('#passwordErr').textContent = 'Enter your password.'; invalid = true; }
    if (invalid) return;

    const btn = $('#loginBtn');
    setLoading(btn, true);
    try {
      const data = await api('/api/admin/login', { method: 'POST', body: { username, password } });
      state.user = data.user;
      form.reset();
      showApp();
      await loadAll();
      toast('Signed in', 'Welcome back to the Verdant admin panel.');
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.add('is-visible');
      pwInput.value = '';
      pwInput.focus();
      if (err.status === 503) $('#loginConfigNote').hidden = false;
    } finally {
      setLoading(btn, false);
    }
  });

  $('#logoutBtn').addEventListener('click', async () => {
    try {
      await api('/api/admin/logout', { method: 'POST', body: {} });
    } catch {
      /* the session is cleared server-side either way */
    }
    state.user = null;
    state.orders = [];
    state.messages = [];
    state.subscribers = [];
    state.products = [];
    showLogin('You have been signed out.');
    toast('Signed out', 'Your session was invalidated on the server.');
  });
}

/* ============================================================
   05. DATA LOADING
   ============================================================ */
async function loadAll() {
  await Promise.all([loadOverview(), loadOrders(), loadMessages(), loadSubscribers(), loadProducts()]);
}

async function loadOverview() {
  try {
    const data = await api('/api/admin/dashboard');
    state.stats = data.stats;

    const s = data.stats;
    const cards = [
      { label: 'Total orders', value: s.totalOrders, foot: 'Placed through the storefront', accent: true },
      { label: 'Customers', value: s.totalCustomers, foot: 'Distinct email addresses' },
      { label: 'Products', value: s.totalProducts, foot: 'In the live catalogue' },
      { label: 'Contact messages', value: s.totalMessages, foot: `${s.newMessages} awaiting review` },
      { label: 'Subscribers', value: s.totalSubscribers, foot: 'Newsletter sign-ups' },
      { label: 'Order value', value: money(s.totalOrderValue), foot: 'Excludes cancelled orders' }
    ];
    $('#statGrid').innerHTML = cards.map((c) => `
      <div class="stat${c.accent ? ' stat--accent' : ''}">
        <p class="stat__label">${esc(c.label)}</p>
        <p class="stat__value">${esc(c.value)}</p>
        <p class="stat__foot">${esc(c.foot)}</p>
      </div>`).join('');

    const max = Math.max(1, ...Object.values(data.byStatus));
    $('#statusList').innerHTML = Object.entries(data.byStatus).map(([status, n]) => `
      <div class="status-row">
        <span style="min-width:82px">${esc(status)}</span>
        <span class="status-row__bar"><span class="status-row__fill" style="width:${Math.round((n / max) * 100)}%"></span></span>
        <span class="status-row__n">${n}</span>
      </div>`).join('');

    const recent = data.recent || [];
    $('#recentOrders').innerHTML = recent.length ? `
      <table>
        <thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Status</th></tr></thead>
        <tbody>${recent.map((o) => `
          <tr data-order="${esc(o.orderId)}" style="cursor:pointer" title="Open order details">
            <td class="mono">${esc(o.orderId)}</td>
            <td class="td-name">${esc(o.name)}</td>
            <td class="num">${money(o.total)}</td>
            <td>${statusTag(o.status)}</td>
          </tr>`).join('')}
        </tbody>
      </table>`
      : `<div class="empty"><strong>No orders yet</strong>Orders placed in the storefront will appear here.</div>`;

    const navCount = $('#navOrderCount');
    navCount.textContent = String(s.totalOrders);
    navCount.hidden = s.totalOrders === 0;
  } catch (err) {
    toast('Could not load the overview', err.message, 'error');
  }
}

async function loadOrders() {
  try {
    const params = new URLSearchParams();
    if (state.orderFilters.q) params.set('q', state.orderFilters.q);
    if (state.orderFilters.status !== 'all') params.set('status', state.orderFilters.status);
    if (state.orderFilters.from) params.set('from', state.orderFilters.from);
    if (state.orderFilters.to) params.set('to', state.orderFilters.to);
    params.set('sort', state.orderFilters.sort);

    const data = await api('/api/admin/orders?' + params.toString());
    state.orders = data.orders;
    renderOrders();
  } catch (err) {
    toast('Could not load orders', err.message, 'error');
  }
}

function renderOrders() {
  const orders = state.orders;
  $('#orderCountTag').textContent = `${orders.length} order${orders.length === 1 ? '' : 's'}`;

  if (!orders.length) {
    $('#ordersTable').innerHTML = `<div class="empty"><strong>No matching orders</strong>
      ${state.orderFilters.q || state.orderFilters.status !== 'all' || state.orderFilters.from || state.orderFilters.to
        ? 'Try clearing the search or filters.'
        : 'Orders placed through the storefront will appear here with full customer details.'}</div>`;
    return;
  }

  $('#ordersTable').innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Order ID</th><th>Customer</th><th>Email</th><th>Phone</th>
          <th>Date</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th><th></th>
        </tr>
      </thead>
      <tbody>
        ${orders.map((o) => `
          <tr>
            <td class="mono">${esc(o.orderId)}</td>
            <td class="td-name">${esc(o.customer.name)}</td>
            <td class="td-sub">${esc(o.customer.email)}</td>
            <td class="td-sub num">${esc(o.customer.phone)}</td>
            <td class="td-sub">${esc(formatDate(o.createdAt))}</td>
            <td class="num">${esc(o.itemCount)}</td>
            <td class="num"><strong>${money(o.totals.total)}</strong></td>
            <td class="td-sub">${esc(o.payment.label.replace(' (demo)', ''))}</td>
            <td>${statusTag(o.status)}</td>
            <td>
              <button class="btn btn--outline btn--sm" type="button" data-order="${esc(o.orderId)}">View details</button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

async function loadMessages() {
  try {
    const data = await api('/api/admin/contacts');
    state.messages = data.contacts;
    renderMessages();
    const navCount = $('#navMsgCount');
    navCount.textContent = String(data.counts.New || 0);
    navCount.hidden = (data.counts.New || 0) === 0;
  } catch (err) {
    toast('Could not load messages', err.message, 'error');
  }
}

function renderMessages() {
  const all = state.messages;
  const list = state.msgFilter === 'all' ? all : all.filter((m) => m.status === state.msgFilter);
  $('#msgCountTag').textContent = `${list.length} message${list.length === 1 ? '' : 's'}`;

  if (!list.length) {
    $('#messagesList').innerHTML = `<div class="empty"><strong>No messages</strong>
      Contact form submissions will appear here.</div>`;
    return;
  }

  $('#messagesList').innerHTML = list.map((m) => `
    <article class="panel" style="margin-bottom:.85rem">
      <div class="panel__head" style="border-bottom:0; padding-bottom:.4rem">
        <div>
          <div style="display:flex; gap:.5rem; align-items:center; flex-wrap:wrap">
            <h3 style="font-size:.98rem; font-family:var(--font-sans); font-weight:700">${esc(m.subject)}</h3>
            ${statusTag(m.status)}
          </div>
          <p class="td-sub" style="margin:.25rem 0 0">
            ${esc(m.name)} · <a href="mailto:${esc(m.email)}">${esc(m.email)}</a>
            ${m.phone ? ' · ' + esc(m.phone) : ''} · ${esc(timeAgo(m.createdAt))}
          </p>
        </div>
        <div class="table-actions">
          ${['New', 'Reviewed', 'Resolved'].map((s) => `
            <button class="btn ${m.status === s ? 'btn--primary' : 'btn--outline'} btn--sm"
              type="button" data-msg-id="${esc(m.id)}" data-msg-status="${s}"
              ${m.status === s ? 'disabled' : ''}>${s}</button>`).join('')}
        </div>
      </div>
      <div class="panel__body" style="padding-top:.2rem">
        <p style="margin:0; font-size:.87rem; color:#3C4A42; white-space:pre-wrap">${esc(m.message)}</p>
      </div>
    </article>`).join('');
}

async function loadSubscribers() {
  try {
    const data = await api('/api/admin/subscribers');
    state.subscribers = data.subscribers;
    $('#subCountTag').textContent = `${data.count} subscriber${data.count === 1 ? '' : 's'}`;

    if (!data.subscribers.length) {
      $('#subscribersTable').innerHTML = `<div class="empty"><strong>No subscribers yet</strong>
        Newsletter sign-ups from the storefront will appear here.</div>`;
      return;
    }

    $('#subscribersTable').innerHTML = `
      <table>
        <thead><tr><th>#</th><th>Email</th><th>Subscribed</th></tr></thead>
        <tbody>${data.subscribers.map((s, i) => `
          <tr>
            <td class="num td-sub">${i + 1}</td>
            <td class="td-name">${esc(s.email)}</td>
            <td class="td-sub">${esc(formatDate(s.createdAt))}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  } catch (err) {
    toast('Could not load subscribers', err.message, 'error');
  }
}

async function loadProducts() {
  try {
    const data = await api('/api/admin/products');
    state.products = data.products;
    renderProducts();
  } catch (err) {
    toast('Could not load products', err.message, 'error');
  }
}

function renderProducts() {
  const term = ($('#productSearch').value || '').toLowerCase().trim();
  const category = $('#productCategoryFilter').value;
  const stockFilter = $('#productStockFilter').value;

  // Populate the category filter once, from real data.
  const catSelect = $('#productCategoryFilter');
  if (catSelect.options.length <= 1) {
    const categories = Array.from(new Set(state.products.map((p) => p.category))).sort();
    categories.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c.charAt(0).toUpperCase() + c.slice(1);
      catSelect.appendChild(opt);
    });
  }

  let list = state.products.slice();
  if (term) {
    list = list.filter((p) => [p.name, p.id, p.category, p.sci]
      .filter(Boolean).some((v) => String(v).toLowerCase().includes(term)));
  }
  if (category !== 'all') list = list.filter((p) => p.category === category);
  if (stockFilter === 'available') list = list.filter((p) => p.inStock !== false);
  if (stockFilter === 'unavailable') list = list.filter((p) => p.inStock === false);

  $('#productCountTag').textContent = `${list.length} product${list.length === 1 ? '' : 's'}`;

  if (!list.length) {
    $('#productsTable').innerHTML = `<div class="empty"><strong>No products match</strong>Adjust the search or filters.</div>`;
    return;
  }

  $('#productsTable').innerHTML = `
    <table>
      <thead><tr><th></th><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${list.map((p) => `
          <tr>
            <td style="width:52px">
              ${p.img ? `<img src="${esc(p.img)}" alt="" width="38" height="38"
                style="border-radius:8px; object-fit:cover; background:var(--mint-100)"
                onerror="this.style.visibility='hidden'">` : ''}
            </td>
            <td>
              <div class="td-name">${esc(p.name)}</div>
              <div class="td-sub mono">${esc(p.id)}</div>
            </td>
            <td class="td-sub">${esc(p.category)}</td>
            <td class="num">
              <strong>${money(p.price)}</strong>
              ${p.originalPrice > p.price ? `<div class="td-sub" style="text-decoration:line-through">${money(p.originalPrice)}</div>` : ''}
            </td>
            <td class="num">${esc(p.stock == null ? '—' : p.stock)}</td>
            <td>${p.inStock === false ? '<span class="tag tag--red">Unavailable</span>' : '<span class="tag tag--green">Available</span>'}</td>
            <td>
              <div class="table-actions">
                <button class="btn btn--outline btn--sm" type="button" data-edit-product="${esc(p.id)}">Edit</button>
                <button class="btn btn--ghost btn--sm" type="button" data-delete-product="${esc(p.id)}">Delete</button>
              </div>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

/* ============================================================
   06. ORDER DETAIL MODAL
   ============================================================ */
async function openOrderModal(orderId) {
  const modal = $('#orderModal');
  const body = $('#orderModalBody');
  const foot = $('#orderModalFoot');
  body.innerHTML = `<div class="empty">Loading order…</div>`;
  foot.innerHTML = '';
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  $('#orderModalTitle').textContent = 'Order ' + orderId;

  try {
    const data = await api('/api/admin/orders/' + encodeURIComponent(orderId));
    const o = data.order;
    $('#orderModalSub').textContent = `${formatDate(o.createdAt)} · ${o.status}`;

    const c = o.customer;
    const history = data.history || [];

    body.innerHTML = `
      <div class="detail-grid">
        <div class="detail-card">
          <h3>Customer</h3>
          <dl class="dl">
            <div><dt>Name</dt><dd>${esc(c.name)}</dd></div>
            <div><dt>Email</dt><dd><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></dd></div>
            <div><dt>Phone</dt><dd><a href="tel:${esc(c.phone)}">${esc(c.phone)}</a></dd></div>
            <div><dt>Customer ID</dt><dd class="mono">${esc(o.customerId || '—')}</dd></div>
          </dl>
          ${history.length ? `
            <h3 style="margin-top:1rem">Previous orders</h3>
            <div class="history-list">
              ${history.map((h) => `
                <div class="history-item">
                  <span class="mono">${esc(h.orderId)}</span>
                  <span>${esc(formatDate(h.createdAt, false))}</span>
                  <strong>${money(h.total)}</strong>
                </div>`).join('')}
            </div>` : '<p class="td-sub" style="margin:.9rem 0 0">First order from this customer.</p>'}
        </div>

        <div class="detail-card">
          <h3>Delivery address</h3>
          <dl class="dl">
            <div><dt>Address</dt><dd>${esc(c.street)}</dd></div>
            <div><dt>City</dt><dd>${esc(c.city)}</dd></div>
            <div><dt>State</dt><dd>${esc(c.state)}</dd></div>
            <div><dt>PIN code</dt><dd class="mono">${esc(c.pin)}</dd></div>
            <div><dt>Instructions</dt><dd>${c.notes ? esc(c.notes) : '<span class="muted">None provided</span>'}</dd></div>
          </dl>
          <h3 style="margin-top:1rem">Payment</h3>
          <dl class="dl">
            <div><dt>Method</dt><dd>${esc(o.payment.label)}</dd></div>
            <div><dt>Status</dt><dd>${esc(o.payment.status)}</dd></div>
          </dl>
        </div>
      </div>

      <div class="detail-card" style="margin-top:1rem">
        <h3>Items ordered</h3>
        ${o.items.map((item) => `
          <div class="item-row">
            ${item.img ? `<img src="${esc(item.img)}" alt="" width="46" height="46" loading="lazy"
              onerror="this.style.visibility='hidden'">` : '<span style="width:46px"></span>'}
            <div class="item-row__main">
              <div class="item-row__name">${esc(item.name)}</div>
              <div class="item-row__meta">${esc(item.sci || '')}${item.sci ? ' · ' : ''}${money(item.price)} × ${item.qty}</div>
            </div>
            <div class="item-row__total">${money(item.lineTotal != null ? item.lineTotal : item.price * item.qty)}</div>
          </div>`).join('')}

        <div class="totals">
          <div><span>Subtotal</span><span class="num">${money(o.totals.subtotal)}</span></div>
          <div><span>Delivery</span><span class="num">${o.totals.delivery === 0 ? 'Free' : money(o.totals.delivery)}</span></div>
          ${o.totals.discount ? `<div><span>Bundle discount</span><span class="num">−${money(o.totals.discount)}</span></div>` : ''}
          <div class="totals__grand"><span>Order total</span><span class="num">${money(o.totals.total)}</span></div>
        </div>
      </div>

      <div class="detail-card" style="margin-top:1rem">
        <h3>Status timeline</h3>
        <ul class="timeline">
          ${(o.statusHistory || []).map((h) => `
            <li><strong>${esc(h.status)}</strong> — ${esc(formatDate(h.at))} <span class="muted">(${esc(h.by)})</span></li>`).join('')}
        </ul>
      </div>`;

    foot.innerHTML = `
      <span style="margin-right:auto; display:flex; align-items:center; gap:.5rem; font-size:.8rem">
        <label for="modalStatus" class="muted">Update status</label>
        <select id="modalStatus" class="status-select">
          ${['Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled']
            .map((s) => `<option${s === o.status ? ' selected' : ''}>${s}</option>`).join('')}
        </select>
      </span>
      <button class="btn btn--outline" type="button" data-close-modal>Close</button>
      <button class="btn btn--primary" type="button" id="saveStatusBtn">Save status</button>`;

    $('#saveStatusBtn').addEventListener('click', async (event) => {
      const btn = event.currentTarget;
      const status = $('#modalStatus').value;
      setLoading(btn, true);
      try {
        await api(`/api/admin/orders/${encodeURIComponent(o.orderId)}/status`, {
          method: 'PATCH',
          body: { status }
        });
        toast('Status updated', `${o.orderId} marked ${status}.`);
        closeOrderModal();
        await Promise.all([loadOrders(), loadOverview()]);
      } catch (err) {
        toast('Could not update status', err.message, 'error');
      } finally {
        setLoading(btn, false);
      }
    });
  } catch (err) {
    body.innerHTML = `<div class="empty"><strong>Order unavailable</strong>${esc(err.message)}</div>`;
  }
}

function closeOrderModal() {
  $('#orderModal').hidden = true;
  document.body.style.overflow = '';
}

/* ============================================================
   07. PRODUCT MODAL
   ============================================================ */
let editingProductId = null;

function openProductModal(product) {
  editingProductId = product ? product.id : null;
  $('#productModalTitle').textContent = product ? 'Edit product' : 'Add product';
  $('#pfName').value = product ? product.name : '';
  $('#pfPrice').value = product ? product.price : '';
  $('#pfOriginal').value = product ? (product.originalPrice || '') : '';
  $('#pfCategory').value = product ? product.category : 'indoor';
  $('#pfStock').value = product ? (product.stock == null ? 0 : product.stock) : 0;
  $('#pfDifficulty').value = product && product.difficulty ? product.difficulty : 'Easy';
  $('#pfMaintenance').value = product && product.maintenance ? product.maintenance : 'Low';
  $('#pfSci').value = product ? (product.sci || '') : '';
  $('#pfImg').value = product ? (product.img || '') : '';
  $('#pfDesc').value = product ? (product.desc || '') : '';
  ['pfNameErr', 'pfPriceErr', 'pfOriginalErr', 'pfStockErr'].forEach((id) => { $('#' + id).textContent = ''; });
  $('#productModal').hidden = false;
  document.body.style.overflow = 'hidden';
  setTimeout(() => $('#pfName').focus(), 60);
}

function closeProductModal() {
  $('#productModal').hidden = true;
  document.body.style.overflow = '';
}

async function saveProduct(event) {
  event.preventDefault();
  const errors = {};
  const name = $('#pfName').value.trim();
  const price = Number($('#pfPrice').value);
  const original = $('#pfOriginal').value === '' ? null : Number($('#pfOriginal').value);
  const stock = Number($('#pfStock').value);

  if (name.length < 2) errors.pfName = 'Enter a product name.';
  if (!Number.isFinite(price) || price <= 0) errors.pfPrice = 'Enter a positive price.';
  if (original !== null && (!Number.isFinite(original) || original < price)) {
    errors.pfOriginal = 'Original price must be at least the selling price.';
  }
  if (!Number.isInteger(stock) || stock < 0) errors.pfStock = 'Stock must be 0 or more.';

  ['pfNameErr', 'pfPriceErr', 'pfOriginalErr', 'pfStockErr'].forEach((id) => { $('#' + id).textContent = ''; });
  if (Object.keys(errors).length) {
    Object.entries(errors).forEach(([id, msg]) => { $('#' + id).textContent = msg; });
    return;
  }

  const payload = {
    name,
    price,
    originalPrice: original === null ? price : original,
    category: $('#pfCategory').value,
    stock,
    difficulty: $('#pfDifficulty').value,
    maintenance: $('#pfMaintenance').value,
    sci: $('#pfSci').value.trim(),
    img: $('#pfImg').value.trim(),
    desc: $('#pfDesc').value.trim()
  };

  const btn = $('#productSaveBtn');
  setLoading(btn, true);
  try {
    if (editingProductId) {
      await api('/api/admin/products/' + encodeURIComponent(editingProductId), { method: 'PATCH', body: payload });
      toast('Product updated', name + ' was saved. The storefront now reflects the change.');
    } else {
      await api('/api/admin/products', { method: 'POST', body: payload });
      toast('Product added', name + ' is now in the catalogue.');
    }
    closeProductModal();
    await Promise.all([loadProducts(), loadOverview()]);
  } catch (err) {
    if (err.payload && err.payload.errors) {
      const map = { name: 'pfName', price: 'pfPrice', originalPrice: 'pfOriginal', stock: 'pfStock' };
      Object.entries(err.payload.errors).forEach(([field, msg]) => {
        const target = map[field];
        if (target) $('#' + target + 'Err').textContent = msg;
      });
    }
    toast('Could not save the product', err.message, 'error');
  } finally {
    setLoading(btn, false);
  }
}

async function deleteProduct(id) {
  const product = state.products.find((p) => p.id === id);
  const label = product ? product.name : id;
  if (!window.confirm(`Remove “${label}” from the catalogue?\n\nThis deletes it from data/products.json and it will disappear from the storefront.`)) return;
  try {
    await api('/api/admin/products/' + encodeURIComponent(id), { method: 'DELETE' });
    toast('Product removed', label + ' was deleted.');
    await Promise.all([loadProducts(), loadOverview()]);
  } catch (err) {
    toast('Could not remove the product', err.message, 'error');
  }
}

/* ============================================================
   08. VIEW SWITCHING
   ============================================================ */
const VIEW_META = {
  overview: ['Dashboard overview', 'Live figures calculated by the Node.js server'],
  orders: ['Orders', 'Every order placed through the storefront, with customer and delivery details'],
  messages: ['Contact messages', 'Messages submitted through the storefront contact form'],
  subscribers: ['Newsletter subscribers', 'Email addresses collected by the storefront form'],
  products: ['Product catalogue', 'Edit prices, stock and availability — changes hit the live storefront']
};

function switchView(view) {
  if (!VIEW_META[view]) return;
  state.view = view;
  $$('.view').forEach((section) => { section.hidden = section.id !== 'view-' + view; });
  $$('.nav-btn[data-view]').forEach((btn) => {
    if (btn.dataset.view === view) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  });
  const [title, sub] = VIEW_META[view];
  $('#viewTitle').textContent = title;
  $('#viewSub').textContent = sub;
}

/* ============================================================
   09. EVENT WIRING
   ============================================================ */
function initDashboard() {
  // Sidebar + quick links
  $$('.nav-btn[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
  $$('[data-goto]').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.goto));
  });

  $('#refreshBtn').addEventListener('click', async (event) => {
    const btn = event.currentTarget;
    setLoading(btn, true);
    try {
      await loadAll();
      toast('Refreshed', 'All data reloaded from the server.');
    } finally {
      setLoading(btn, false);
    }
  });

  /* ---- orders ---- */
  const debouncedOrders = debounce(() => loadOrders(), 280);
  $('#orderSearch').addEventListener('input', (e) => {
    state.orderFilters.q = e.target.value.trim();
    debouncedOrders();
  });
  $('#orderStatusFilter').addEventListener('change', (e) => {
    state.orderFilters.status = e.target.value;
    loadOrders();
  });
  $('#orderFrom').addEventListener('change', (e) => {
    state.orderFilters.from = e.target.value;
    loadOrders();
  });
  $('#orderTo').addEventListener('change', (e) => {
    state.orderFilters.to = e.target.value;
    loadOrders();
  });
  $('#orderSort').addEventListener('change', (e) => {
    state.orderFilters.sort = e.target.value;
    loadOrders();
  });

  // Delegated: order detail buttons exist only after rendering.
  $('#ordersTable').addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-order]');
    if (trigger) openOrderModal(trigger.dataset.order);
  });
  $('#recentOrders').addEventListener('click', (event) => {
    const row = event.target.closest('[data-order]');
    if (row) openOrderModal(row.dataset.order);
  });

  /* ---- messages ---- */
  $('#msgFilters').addEventListener('click', (event) => {
    const chip = event.target.closest('[data-msg-filter]');
    if (!chip) return;
    state.msgFilter = chip.dataset.msgFilter;
    $$('#msgFilters .chip').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
    renderMessages();
  });

  $('#messagesList').addEventListener('click', async (event) => {
    const btn = event.target.closest('[data-msg-id]');
    if (!btn) return;
    const id = btn.dataset.msgId;
    const status = btn.dataset.msgStatus;
    setLoading(btn, true);
    try {
      await api(`/api/admin/contacts/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: { status } });
      toast('Message updated', `Marked ${status}.`);
      await Promise.all([loadMessages(), loadOverview()]);
    } catch (err) {
      toast('Could not update the message', err.message, 'error');
      setLoading(btn, false);
    }
  });

  /* ---- products ---- */
  const debouncedProducts = debounce(() => renderProducts(), 200);
  $('#productSearch').addEventListener('input', debouncedProducts);
  $('#productCategoryFilter').addEventListener('change', renderProducts);
  $('#productStockFilter').addEventListener('change', renderProducts);

  $('#productsTable').addEventListener('click', (event) => {
    const editBtn = event.target.closest('[data-edit-product]');
    if (editBtn) {
      const product = state.products.find((p) => p.id === editBtn.dataset.editProduct);
      if (product) openProductModal(product);
      return;
    }
    const delBtn = event.target.closest('[data-delete-product]');
    if (delBtn) deleteProduct(delBtn.dataset.deleteProduct);
  });

  $('#addProductBtn').addEventListener('click', () => openProductModal(null));
  $('#productForm').addEventListener('submit', saveProduct);

  /* ---- modals ---- */
  $$('[data-close-modal]').forEach((el) => el.addEventListener('click', closeOrderModal));
  $$('[data-close-product]').forEach((el) => el.addEventListener('click', closeProductModal));

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!$('#orderModal').hidden) closeOrderModal();
    if (!$('#productModal').hidden) closeProductModal();
  });
}

function debounce(fn, wait) {
  let timer = null;
  return function debounced(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  };
}

/* ============================================================
   10. BOOT
   ============================================================ */
document.addEventListener('DOMContentLoaded', async () => {
  initLogin();
  initDashboard();
  switchView('overview');
  await checkSession();
});
