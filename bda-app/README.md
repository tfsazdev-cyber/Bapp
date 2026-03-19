# 🚀 BDA Portal — Complete Docker Stack

A production-ready Business Data Analytics portal, fully containerised with
automatic HTTPS, subdomains, and a real PostgreSQL database.

---

## 🗂️ Project Structure

```
bda-app/
├── frontend/
│   ├── index.html         ← Login + Register
│   ├── dashboard.html     ← Dashboard + charts
│   ├── users.html         ← User management (CRUD)
│   ├── nginx.conf         ← Serves pages, proxies /api → backend
│   └── Dockerfile
├── backend/
│   ├── server.js          ← Express REST API + PostgreSQL
│   ├── package.json
│   └── Dockerfile
├── database/
│   └── init.sql           ← Schema + seed data (auto-runs on first boot)
├── traefik/
│   ├── traefik.yml        ← Entrypoints, HTTPS, Let's Encrypt
│   └── dynamic.yml        ← Middlewares: headers, auth, rate limit
├── docker-compose.yml     ← All 5 containers wired together
├── .env.example           ← Copy to .env — fill in your secrets
├── .gitignore
├── DEPLOY.md              ← Full step-by-step deployment guide
└── README.md
```

---

## 🐳 Containers

| Container      | Image              | URL                        | Purpose              |
|----------------|--------------------|----------------------------|----------------------|
| bda_traefik    | traefik:v3.0       | :80 / :443                 | Reverse proxy + SSL  |
| bda_frontend   | nginx:alpine       | app.yourdomain.com         | HTML pages           |
| bda_backend    | node:20-alpine     | api.yourdomain.com         | REST API             |
| bda_database   | postgres:16-alpine | internal only              | PostgreSQL           |
| bda_pgadmin    | dpage/pgadmin4     | db.yourdomain.com          | DB admin UI          |

---

## ⚡ Local Development

```bash
cp .env.example .env        # fill in your values
docker compose up --build   # start all containers
```

| URL                        | Service        |
|----------------------------|----------------|
| http://localhost           | App (login)    |
| http://localhost/dashboard | Dashboard      |
| http://localhost:3000/health| API health    |
| http://localhost:5050      | pgAdmin        |

Default login: **admin@bda.com** / **Admin@123**

---

## 🌐 Production Deployment

See **DEPLOY.md** for the full step-by-step guide. Summary:

```bash
# 1. Point DNS A records to your server IP
# 2. SSH into your server
# 3. Upload project + fill in .env
# 4. Generate htpasswd hashes for traefik/dynamic.yml
docker compose up -d --build
```

Your subdomains after deployment:

```
https://yourdomain.com          → Login / App
https://app.yourdomain.com      → Login / App (alias)
https://api.yourdomain.com      → REST API
https://db.yourdomain.com       → pgAdmin (password protected)
https://traefik.yourdomain.com  → Traefik dashboard (password protected)
```

---

## ✅ Feature Checklist

### Pages
- [x] Login page (email + password, JWT)
- [x] Register page (all 6 fields + password strength)
- [x] Dashboard (stat cards, line chart, donut chart, recent users)
- [x] User Management (search, filter, sort, paginate, CRUD, bulk, CSV export)

### Backend API
- [x] POST /register — create user
- [x] POST /login — JWT auth
- [x] GET  /me — my profile
- [x] GET  /users — list all (Admin/Manager)
- [x] PATCH /users/:id — edit user
- [x] DELETE /users/:id — delete (Admin)
- [x] GET /stats — live dashboard numbers
- [x] GET /audit-logs — full audit trail

### Database
- [x] PostgreSQL 16 with persistent volume
- [x] Schema: users, sessions, audit_logs
- [x] ENUM types for role and status
- [x] Auto-updated_at trigger
- [x] Seed data with 10 users
- [x] Graceful fallback to in-memory if DB not ready

### Infrastructure
- [x] Traefik v3 reverse proxy
- [x] Auto HTTPS via Let's Encrypt (HTTP-01 challenge)
- [x] HTTP → HTTPS redirect (301)
- [x] HSTS preload (2 years)
- [x] Security headers on all responses
- [x] API rate limiting (100 req/s)
- [x] Traefik dashboard behind basic auth
- [x] pgAdmin behind basic auth
- [x] Database NOT exposed to internet
- [x] Named Docker volumes (data survives restarts)
- [x] Health checks on backend and database
- [x] Secrets via .env (never in code)
