# 🌿 VERDANT — Organic Plant Nursery

A complete, production-style plant nursery storefront with a real Node.js REST API and a password-protected admin panel — built with **zero npm dependencies**.

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-3c873a?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen?style=flat-square)](#)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)

---

## What this is

| Part | What it does |
|---|---|
| **Storefront** (`index.html`, `script.js`, `style.css`) | 29 plants, filters, search, wishlist, cart, plant recommender, care guides, checkout |
| **REST API** (`server.js`) | Products, orders, contact messages, newsletter, admin auth — all hand-written on Node's `http` module |
| **Admin panel** (`admin.html`, `admin.js`) | Sign-in, dashboard, order management, messages, subscribers, product CRUD |

Everything runs on Node's standard library. **There is nothing to `npm install`.** That is deliberate: no supply-chain risk, no build step, no lockfile drift.

---

## Run it locally

```bash
git clone https://github.com/YOUR-USERNAME/verdant-plant-nursery.git
cd verdant-plant-nursery
```

Set the admin credentials, then start:

**Windows (PowerShell)**
```powershell
$env:ADMIN_USERNAME="admin"
$env:ADMIN_PASSWORD="a-long-password-at-least-8"
node server.js
```

**macOS / Linux**
```bash
ADMIN_USERNAME=admin ADMIN_PASSWORD=a-long-password-at-least-8 node server.js
```

Open **http://localhost:3000** — the shop. Admin panel at **http://localhost:3000/admin.html**.

> The password must be **8 characters or more**, otherwise the server refuses to enable sign-in and tells you so at startup.

---

## Deploy it online (free)

### Render — recommended, one click

1. Push this repo to GitHub (see below).
2. Go to **https://render.com** → **New** → **Blueprint**.
3. Pick your repo. Render reads `render.yaml` and configures everything.
4. It will prompt for `ADMIN_USERNAME` and `ADMIN_PASSWORD` — enter your own.
5. Wait for the build. You get a public URL like `https://verdant-plant-nursery.onrender.com`.

`render.yaml` already mounts a 1 GB persistent disk at `/var/data` and sets
`VERDANT_DATA_DIR=/var/data`, so **orders survive redeploys**.

> Free instances sleep after 15 minutes of inactivity. The first visit afterwards takes ~30 seconds to wake. That is normal.

### Railway

1. **https://railway.app** → **New Project** → **Deploy from GitHub repo**.
2. Add the same two environment variables (`ADMIN_USERNAME`, `ADMIN_PASSWORD`).
3. Railway sets `PORT` for you; the server already reads it.

### Any VPS / Docker

```bash
PORT=3000 ADMIN_USERNAME=admin ADMIN_PASSWORD=your-password node server.js
```

Put Nginx or Caddy in front for HTTPS. The server reads `X-Forwarded-Proto`, so session cookies are marked `Secure` automatically behind a proxy.

---

## Push to GitHub — step by step

If you have never done this before, run these in the project folder:

```bash
git init
git add .
git commit -m "VERDANT — full-stack plant nursery"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/verdant-plant-nursery.git
git push -u origin main
```

Create the empty repository first at **https://github.com/new** — name it `verdant-plant-nursery`, **do not** tick "Add a README" (you already have one).

### Check before you push

`.gitignore` already blocks customer data and credentials. Verify nothing sensitive is staged:

```bash
git status --short
```

You should see **no** `data/orders.json`, no `.env`, no `admin-login.json`. If you see them, run `git rm --cached <file>` before committing.

---

## Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `ADMIN_USERNAME` | **yes** | — | Admin sign-in user |
| `ADMIN_PASSWORD` | **yes** | — | Admin password, min 8 characters |
| `PORT` | no | `3000` | HTTP port |
| `HOST` | no | `0.0.0.0` | Bind address |
| `VERDANT_DATA_DIR` | no | `./data` | Where JSON data is written |

---

## API reference

Base URL: `http://localhost:3000`

### Public

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/health` | Server status, data-file sizes, `credentialsConfigured` |
| `GET` | `/api/products` | Full catalogue |
| `GET` | `/api/products/:id` | One product |
| `GET` | `/api/config` | Store rules (delivery fee, thresholds, limits) |
| `POST` | `/api/orders` | Place an order |
| `POST` | `/api/contact` | Send a message |
| `POST` | `/api/newsletter` | Subscribe |

### Admin (session cookie required)

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/admin/login` | Sign in |
| `POST` | `/api/admin/logout` | Sign out |
| `GET` | `/api/admin/session` | Am I signed in? |
| `GET` | `/api/admin/dashboard` | Counts and recent activity |
| `GET` | `/api/admin/orders` | List orders |
| `PATCH` | `/api/admin/orders/:id/status` | Update order status |
| `GET` | `/api/admin/contacts` | List messages |
| `GET` | `/api/admin/subscribers` | List subscribers |
| `POST` | `/api/admin/products` | Create product |
| `PATCH` | `/api/admin/products/:id` | Update product |
| `DELETE` | `/api/admin/products/:id` | Delete product |

### Place an order

```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customer": {
      "name": "Lucky Singh",
      "email": "lucky@example.com",
      "phone": "9876543210",
      "street": "123 Main Street",
      "city": "Ludhiana",
      "state": "Punjab",
      "pin": "141001"
    },
    "items": [{ "id": "pothos", "qty": 2 }],
    "paymentMethod": "cod"
  }'
```

**Validation rules the server enforces** (the client cannot bypass them):

| Field | Rule |
|---|---|
| `name` | 2+ characters |
| `email` | valid address |
| `phone` | 10 digits, **must start 6–9** |
| `street` | 5+ characters |
| `city` | 2+ characters |
| `state` | must match the supported list |
| `pin` | 6 digits, **cannot start with 0** |
| `items` | non-empty, quantity 1–10, no duplicates |
| `paymentMethod` | `cod`, `upi` or `card` |

Prices are **recalculated on the server** from its own catalogue — a tampered cart total is ignored.

---

## Security notes

- Admin password is held as a **scrypt hash**, never stored in plain text.
- Sessions use `crypto.randomBytes(32)` tokens, `HttpOnly` + `SameSite=Strict`, 2-hour TTL, `Secure` over HTTPS.
- Login is rate-limited to **8 attempts per 10 minutes** per IP.
- State-changing admin requests are rejected unless `Origin` matches the host (CSRF protection).
- Request bodies are capped at 64 KB.
- Path traversal is blocked; `/data/*`, `server.js` and dotfiles are never served.
- `.gitignore` excludes customer data, `.env` and `admin-login.json`.

**This is a demonstration store.** No payment is processed, no card data is stored, and no email is sent.

---

## Project structure

```
verdant-plant-nursery/
├── server.js              # HTTP server, routing, REST API, auth (no dependencies)
├── index.html             # Storefront
├── script.js              # Storefront logic: cart, filters, checkout
├── style.css              # Design system
├── admin.html             # Admin panel
├── admin.js               # Admin logic
├── data/
│   ├── products.json      # Live catalogue (29 products)
│   ├── products.seed.json # Pristine catalogue, used to re-seed
│   └── orders.json        # Created at runtime — git-ignored
├── assets/img/            # Product photography
├── render.yaml            # One-click Render blueprint
├── railway.json           # Railway config
├── .env.example           # Environment template
└── LICENSE                # MIT
```

---

## Troubleshooting

**Shop shows no products / orders fail with "The catalogue is unavailable"**

`data/products.json` got truncated. Restore it:

```bash
cp data/products.seed.json data/products.json
```

**"Invalid username or password" with the correct details**

Check the server console at startup — it prints the admin user it is running with. If it says `(not configured)`, the environment variables are not set in **that** terminal.

**Orders disappear after redeploy**

The platform's disk is ephemeral. Add a persistent disk and set `VERDANT_DATA_DIR` to its mount path.

**Port already in use**

```bash
# Windows
Get-Process node | Stop-Process -Force
# macOS / Linux
pkill -f "node server.js"
```

---

## License

MIT — see [LICENSE](LICENSE). Use it, fork it, ship it.

*Built as a demonstration project. Plant names and details are illustrative.*
