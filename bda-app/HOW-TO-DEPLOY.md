# 🚀 BDA Portal — Exact Steps to Go Live
## From zip file → Docker Hub → Live on Your Domain

---

## THE ORDER  (do exactly this, top to bottom)

```
[ ] 1. Create Docker Hub account + repositories
[ ] 2. Create GitHub account + repository
[ ] 3. Upload your code to GitHub
[ ] 4. Add secrets to GitHub
[ ] 5. Push to main → images build automatically
[ ] 6. Set up your server
[ ] 7. Upload config files to server
[ ] 8. Run docker compose on server → live!
```

---

## STEP 1 — Create Docker Hub Account

1. Go to https://hub.docker.com → Sign up (free)
2. Choose a username, e.g. `johnsmith`
3. Create two repositories:
   - Click **Create Repository** → name: `bda-frontend` → Public → Create
   - Click **Create Repository** → name: `bda-backend`  → Public → Create
4. Create an Access Token (safer than password):
   - Click your avatar → **Account Settings** → **Security** → **New Access Token**
   - Name: `github-actions`  → Permission: `Read, Write, Delete`
   - **Copy and save the token** — you only see it once!

Your image names will be:
```
johnsmith/bda-frontend
johnsmith/bda-backend
```

---

## STEP 2 — Create GitHub Repository

1. Go to https://github.com → Sign up or log in (free)
2. Click **+** → **New repository**
3. Name: `bda-app`
4. Set to **Private** (recommended)
5. Click **Create repository**

---

## STEP 3 — Upload Your Code to GitHub

On your computer, open a terminal in the `bda-app` folder:

```bash
# Initialize git
git init
git add .
git commit -m "Initial BDA Portal commit"

# Connect to your GitHub repo (replace YOUR_USERNAME)
git remote add origin https://github.com/YOUR_USERNAME/bda-app.git

# Push to GitHub
git branch -M main
git push -u origin main
```

✅ Your code is now on GitHub.

---

## STEP 4 — Add Secrets to GitHub

Go to your repo on GitHub:
**Settings → Secrets and variables → Actions → New repository secret**

Add these one by one:

| Secret Name            | Value                                      |
|------------------------|--------------------------------------------|
| `DOCKERHUB_USERNAME`   | your Docker Hub username, e.g. `johnsmith` |
| `DOCKERHUB_TOKEN`      | the access token from Step 1               |
| `SERVER_HOST`          | your server IP, e.g. `123.45.67.89`        |
| `SERVER_USER`          | `root` or `ubuntu`                         |
| `SERVER_SSH_KEY`       | contents of your `~/.ssh/id_rsa` file      |
| `SERVER_DEPLOY_PATH`   | `/opt/bda-app`                             |

### How to get your SSH key:
```bash
# On your local machine
cat ~/.ssh/id_rsa
# Copy EVERYTHING including -----BEGIN and -----END lines
```

If you don't have an SSH key yet:
```bash
ssh-keygen -t rsa -b 4096 -C "you@email.com"
# Press Enter for all prompts
cat ~/.ssh/id_rsa       # ← this is your PRIVATE key (paste into GitHub secret)
cat ~/.ssh/id_rsa.pub   # ← this is your PUBLIC key (add to server)
```

---

## STEP 5 — Trigger the Build (push any change)

```bash
# Make a tiny change to trigger the pipeline
echo "# BDA Portal" >> README.md
git add README.md
git commit -m "Trigger first build"
git push
```

Go to GitHub → **Actions** tab → watch the pipeline run.

It will:
- ✅ Build `johnsmith/bda-frontend:latest`
- ✅ Build `johnsmith/bda-backend:latest`
- ✅ Push both to Docker Hub
- ⏳ Deploy step will fail until you set up the server (Step 6)

Check Docker Hub — you should see images there now!

---

## STEP 6 — Set Up Your Server

```bash
# SSH into your server
ssh root@YOUR_SERVER_IP

# Install Docker
curl -fsSL https://get.docker.com | sh

# Install Docker Compose plugin
apt install docker-compose-plugin -y

# Add your SSH public key (so GitHub Actions can deploy)
echo "YOUR_PUBLIC_KEY_CONTENTS" >> ~/.ssh/authorized_keys

# Create the project folder
mkdir -p /opt/bda-app
```

---

## STEP 7 — Upload Config Files to Server

These files DO NOT go into a Docker image — they stay on the server.
Upload them using `scp`:

```bash
# On your LOCAL machine, from inside the bda-app folder:

# Upload traefik config
scp -r traefik/ root@YOUR_SERVER_IP:/opt/bda-app/

# Upload database init SQL
scp -r database/ root@YOUR_SERVER_IP:/opt/bda-app/

# Upload the production compose file
scp docker-compose.prod.yml root@YOUR_SERVER_IP:/opt/bda-app/

# Upload env example, then edit it on the server
scp .env.example root@YOUR_SERVER_IP:/opt/bda-app/.env
```

Now on the server, edit `.env`:

```bash
ssh root@YOUR_SERVER_IP
nano /opt/bda-app/.env
```

Fill in every value:
```env
DOMAIN=yourdomain.com
ACME_EMAIL=you@yourdomain.com
JWT_SECRET=<run: openssl rand -hex 32>
POSTGRES_DB=bda
POSTGRES_USER=bda_user
POSTGRES_PASSWORD=YourStrongPassword123
PGADMIN_EMAIL=admin@yourdomain.com
PGADMIN_PASSWORD=YourStrongPassword456
DOCKERHUB_USERNAME=johnsmith
```

Also generate the htpasswd hash for Traefik dashboard auth:
```bash
apt install apache2-utils -y
echo $(htpasswd -nb admin YourChosenPassword)
# Copy the output, e.g.: admin:$apr1$abc$xyz...
nano /opt/bda-app/traefik/dynamic.yml
# Paste it into the traefik-auth and pgadmin-auth users: list
```

---

## STEP 8 — Start Everything on the Server

```bash
ssh root@YOUR_SERVER_IP
cd /opt/bda-app

# Pull the images from Docker Hub
docker compose -f docker-compose.prod.yml pull

# Start all containers
docker compose -f docker-compose.prod.yml up -d

# Check they're all running
docker compose -f docker-compose.prod.yml ps

# Watch logs
docker compose -f docker-compose.prod.yml logs -f
```

---

## ✅ DONE! Check Your Subdomains

| URL                          | Should show                    |
|------------------------------|-------------------------------|
| https://yourdomain.com       | BDA Login page                |
| https://app.yourdomain.com   | BDA Login page                |
| https://api.yourdomain.com/health | `{"status":"ok","database":"connected"}` |
| https://db.yourdomain.com    | pgAdmin login                 |

---

## AFTER STEP 8 — Every Future Deployment is Automatic

```bash
# On your laptop — change any code, then:
git add .
git commit -m "Fix something"
git push

# GitHub Actions automatically:
#   → Builds new Docker images
#   → Pushes to Docker Hub
#   → SSHes to your server
#   → Pulls new images
#   → Restarts containers
# Your site is updated in ~2-3 minutes with zero downtime
```

---

## Using Azure DevOps Instead of GitHub?

Use `azure-pipelines.yml` instead of `.github/workflows/docker-build.yml`.

1. Go to https://dev.azure.com
2. Create a project → **Pipelines** → **New Pipeline**
3. Choose **Azure Repos Git** or **GitHub**
4. Select your repo → it finds `azure-pipelines.yml` automatically
5. Add variables at: **Pipelines → Edit → Variables**
   (same names as the GitHub secrets table above)
6. Save and run

The pipeline does the same thing — build, push, deploy.

---

## Troubleshooting

```bash
# Image not found on Docker Hub?
docker pull johnsmith/bda-frontend:latest
# Should download the image

# Container not starting?
docker compose -f docker-compose.prod.yml logs backend

# SSL cert not issuing?
docker compose -f docker-compose.prod.yml logs traefik
# Look for "acme" in the logs

# Can't SSH from GitHub Actions?
# Make sure your PUBLIC key is in server's ~/.ssh/authorized_keys
cat ~/.ssh/authorized_keys

# Database not connecting?
docker compose -f docker-compose.prod.yml exec database \
  psql -U bda_user -d bda -c "\dt"
```
