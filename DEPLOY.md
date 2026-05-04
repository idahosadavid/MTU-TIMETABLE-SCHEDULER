# Deployment Guide: Vercel + Fly.io + Supabase

## Architecture
- **Frontend**: Vercel (free tier)
- **Backend**: Fly.io (free tier - 3 VMs, stays running)
- **Database**: Supabase (free tier - 500MB)

---

## Step 1: Database Setup (Supabase)

1. Go to [supabase.com](https://supabase.com) and create an account
2. Create a new project
3. In Project Settings → API, copy:
   - `Project URL` → `SUPABASE_URL`
   - `service_role key` → `SUPABASE_SERVICE_ROLE_KEY` (keep this secret!)
4. Go to SQL Editor and run the schema from `server/database/supabase_schema.sql`

---

## Step 2: Migrate Local SQLite Data to Supabase

```bash
cd server

# Add your Supabase credentials to .env
# SUPABASE_URL=your_url
# SUPABASE_SERVICE_ROLE_KEY=your_key

# Run the migration
npm run import:sqlite-to-supabase
```

---

## Step 3: Deploy Backend to Fly.io

### Install Fly CLI
```bash
# Windows (PowerShell)
iwr https://fly.io/install.ps1 -useb | iex

# Or download from https://fly.io/docs/hands-on/install-flyctl/
```

### Deploy
```bash
cd server

# Login to Fly.io
fly auth login

# Create the app (only first time)
fly launch --no-deploy

# Set environment secrets
fly secrets set SUPABASE_URL="your_supabase_url"
fly secrets set SUPABASE_SERVICE_ROLE_KEY="your_service_role_key"
fly secrets set ADMIN_API_KEY="your_strong_admin_key"
fly secrets set MTU_STUDENT_AUTH_MODE="portal-token"
fly secrets set MTU_PORTAL_SHARED_SECRET="your_portal_secret"
fly secrets set MTU_PORTAL_SESSION_SECRET="your_session_secret"
fly secrets set MTU_PORTAL_CODE_TTL_SECONDS="120"
fly secrets set MTU_PORTAL_API_URL="https://studentportal.mtu.edu.ng/api/v1"
fly secrets set MTU_PORTAL_API_KEY="your_portal_api_key"

# Deploy
fly deploy
```

Your API will be at: `https://mtu-timetable-api.fly.dev`

---

## Step 4: Deploy Frontend to Vercel

### Install Vercel CLI
```bash
npm i -g vercel
```

### Deploy
```bash
cd client

# Create .env.production
VITE_API_BASE_URL=https://mtu-timetable-api.fly.dev/api

# Deploy
vercel --prod
```

Or use the Vercel Dashboard:
1. Import your GitHub repo
2. Set framework preset to "Vite"
3. Set root directory to `client`
4. Add environment variable: `VITE_API_BASE_URL=https://mtu-timetable-api.fly.dev/api`
5. Deploy

---

## Environment Variables Reference

### Backend (Fly.io Secrets)
| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | ✅ | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service role key |
| `ADMIN_API_KEY` | ✅ | Strong secret for admin auth |
| `MTU_STUDENT_AUTH_MODE` | ✅ | Use `portal-token` |
| `MTU_PORTAL_SHARED_SECRET` | ✅ | Shared secret with MTU Portal |
| `MTU_PORTAL_SESSION_SECRET` | ✅ | JWT signing secret |
| `MTU_PORTAL_API_URL` | ✅ | MTU Portal API URL |
| `MTU_PORTAL_API_KEY` | Optional | Portal API key |

### Frontend (Vercel)
| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_BASE_URL` | ✅ | Backend URL + `/api` |

---

## Free Tier Limits

### Fly.io
- 3 shared-cpu-1x VMs (256MB RAM each) → **512MB for your app**
- 3GB persistent volumes
- 160GB outbound data transfer

### Vercel
- Unlimited static site hosting
- 100GB bandwidth
- 6,000 execution hours for functions

### Supabase
- 500MB database
- 2GB file storage
- 50,000 monthly active users
- 200MB egress/day

---

## Troubleshooting

### Backend not connecting to Supabase
Check logs: `fly logs`
Verify secrets: `fly secrets list`

### Frontend API calls failing
Check CORS is configured in backend
Verify `VITE_API_BASE_URL` ends with `/api`

### Database migration failing
Ensure Supabase schema is created first
Check `SUPABASE_SERVICE_ROLE_KEY` has full permissions

---

## Updates & Redeploys

### Backend
```bash
cd server
fly deploy
```

### Frontend
```bash
cd client
vercel --prod
```
