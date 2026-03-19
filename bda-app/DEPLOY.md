# 🚀 BDA Portal — Deployment Guide
## Go Live with Your Domain + HTTPS

---

## 📋 What You Need

- A Linux VPS (Ubuntu 22.04 recommended) — DigitalOcean, AWS, Hetzner, etc.
- Your domain name (e.g. `yourdomain.com`)
- Docker + Docker Compose installed on the server
- Ports 80 and 443 open in your firewall

---

## Step 1 — Point Your DNS Records

At your domain registrar (GoDaddy, Namecheap, Cloudflare, etc.),
create these **A records** pointing to your server's IP:

```
Type  Name        Value
────  ──────────  ──────────────
A     @           YOUR_SERVER_IP      ← yourdomain.com
A     app         YOUR_SERVER_IP      ← app.yourdomain.com
A     api         YOUR_SERVER_IP      ← api.yourdomain.com
A     db          YOUR_SERVER_IP      ← db.yourdomain.com
A     traefik     YOUR_SERVER_IP      ← traefik.yourdomain.com (dashboard)
```

⏳ DNS can take 5–30 minutes to propagate.

---

## Step 2 — Install Docker on Your Server

```bash
# Connect to your server
ssh root@YOUR_SERVER_IP

# Install Docker
curl -fsSL https://get.docker.com | sh

# Install Docker Compose plugin
apt install docker-compose-plugin -y

# Verify
docker --version
docker compose version
```

---

## Step 3 — Upload Your Project

```bash
# On your local machine — upload the project
scp -r bda-app/ root@YOUR_SERVER_IP:/opt/bda-app

# OR clone from your Git repo
git clone https://github.com/youruser/bda-app.git /opt/bda-app
```

---

## Step 4 — Configure Environment

```bash
cd /opt/bda-app

# Copy and edit the env file
cp .env.example .env
nano .env
```

Fill in these values in `.env`:

```env
DOMAIN=yourdomain.com
ACME_EMAIL=you@yourdomain.com
JWT_SECRET=<output of: openssl rand -hex 32>
POSTGRES_DB=bda
POSTGRES_USER=bda_user
POSTGRES_PASSWORD=<strong password>
PGADMIN_EMAIL=admin@yourdomain.com
PGADMIN_PASSWORD=<strong password>
```

---

## Step 5 — Set Up Traefik Basic Auth

The Traefik dashboard and pgAdmin are protected by basic auth.
Generate a password hash:

```bash
# Install htpasswd (if not available)
apt install apache2-utils -y

# Generate hash for user "admin"
echo $(htpasswd -nb admin YOUR_CHOSEN_PASSWORD)
# Output example: admin:$apr1$abc$abc123...
```

Copy that output and paste it into `traefik/dynamic.yml`:

```yaml
traefik-auth:
  basicAuth:
    users:
      - "admin:$apr1$abc$abc123..."   # ← paste here

pgadmin-auth:
  basicAuth:
    users:
      - "admin:$apr1$abc$abc123..."   # ← same or different
```

---

## Step 6 — Create SSL Cert File with Right Permissions

Let's Encrypt requires the acme.json file to have strict permissions:

```bash
# Traefik volume handles this automatically, but if using a bind mount:
touch /opt/bda-app/traefik/acme.json
chmod 600 /opt/bda-app/traefik/acme.json
```

---

## Step 7 — Launch! 🚀

```bash
cd /opt/bda-app

# Start all containers (detached)
docker compose up -d --build

# Watch logs to confirm everything started
docker compose logs -f

# Check each container status
docker compose ps
```

Expected output:
```
NAME            STATUS          PORTS
bda_traefik     running         0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp
bda_frontend    running
bda_backend     running (healthy)
bda_database    running (healthy)
bda_pgadmin     running
```

---

## Step 8 — Verify Everything Works

| URL                              | Expected                        |
|----------------------------------|---------------------------------|
| https://yourdomain.com           | Login page (HTTPS ✅)           |
| https://app.yourdomain.com       | Login page (HTTPS ✅)           |
| https://api.yourdomain.com/health| `{"status":"ok","database":"connected"}` |
| https://db.yourdomain.com        | pgAdmin login (HTTPS ✅)        |
| https://traefik.yourdomain.com   | Traefik dashboard (with auth)   |

---

## 🔧 Useful Commands

```bash
# View logs for a specific container
docker compose logs -f backend
docker compose logs -f traefik

# Restart a single service
docker compose restart backend

# Stop everything
docker compose down

# Stop + remove volumes (WARNING: deletes all DB data!)
docker compose down -v

# Update after code changes
docker compose up -d --build frontend backend

# Connect to PostgreSQL directly
docker compose exec database psql -U bda_user -d bda

# Run a SQL query
docker compose exec database psql -U bda_user -d bda -c "SELECT * FROM users;"

# Check SSL certificate status
docker compose exec traefik cat /letsencrypt/acme.json | python3 -m json.tool
```

---

## 🌐 Subdomain Architecture — How It All Works

```
Internet
    │
    ▼
┌───────────────────────────────────┐
│  Traefik  :80 / :443              │  ← single entry point
│  • HTTP → HTTPS redirect          │
│  • Routes by subdomain            │
│  • Auto-SSL via Let's Encrypt     │
└─────┬────────┬───────┬────────────┘
      │        │       │
      ▼        ▼       ▼
  frontend  backend  pgadmin
  :80       :3000    :80
  (nginx)   (node)   (pgadmin4)
                |
                ▼
            database
            :5432
           (postgres)
           [internal only]
```

### Key Points:
- **Traefik reads Docker labels** — no manual nginx config needed
- **Let's Encrypt SSL** — certificates auto-renew every 90 days
- **Database is NEVER exposed** to the internet — only backend talks to it
- **One IP, many domains** — Traefik routes by `Host` header

---

## 🔒 Security Checklist

- [x] HTTPS enforced on all subdomains
- [x] HTTP auto-redirects to HTTPS (301)
- [x] HSTS enabled (2 year preload)
- [x] Security headers on all responses
- [x] API rate limiting (100 req/s)
- [x] Database not exposed to internet
- [x] pgAdmin behind basic auth
- [x] Traefik dashboard behind basic auth
- [x] Secrets in .env (not in code)
- [x] .env in .gitignore
- [ ] Change default passwords in .env
- [ ] Set up server firewall (ufw allow 80,443/tcp)
- [ ] Enable automatic server security updates

---

## 🔄 Adding More Subdomains Later

To add a new app (e.g. `monitor.yourdomain.com`):

1. Add DNS A record: `monitor → YOUR_SERVER_IP`
2. Add a new service to `docker-compose.yml`
3. Add these labels to it:

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.monitor.rule=Host(`monitor.${DOMAIN}`)"
  - "traefik.http.routers.monitor.entrypoints=websecure"
  - "traefik.http.routers.monitor.tls.certresolver=letsencrypt"
  - "traefik.http.services.monitor.loadbalancer.server.port=3000"
```

4. Run `docker compose up -d` — Traefik picks it up automatically. SSL issued within seconds.

---

## 📊 Your Complete Subdomain Map

| Subdomain                   | Container   | Purpose                |
|-----------------------------|-------------|------------------------|
| yourdomain.com              | frontend    | Main app               |
| app.yourdomain.com          | frontend    | Main app (alias)       |
| api.yourdomain.com          | backend     | REST API               |
| db.yourdomain.com           | pgadmin     | Database UI            |
| traefik.yourdomain.com      | traefik     | Proxy dashboard        |
| staging.yourdomain.com      | (future)    | Test environment       |
| monitor.yourdomain.com      | (future)    | Grafana / Uptime       |
| docs.yourdomain.com         | (future)    | Documentation          |
