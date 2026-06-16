# Deployment Guide: Vercel + Render + Supabase

## Architecture
- **Frontend**: Vercel (free tier)
- **Backend**: Render (free tier - web service)
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

## Step 3: Deploy Backend to Render

1. Go to [render.com](https://render.com) and create an account
2. Click **New → Web Service**
3. Connect your GitHub repo and select the repository
4. Configure the service:
   - **Root Directory**: `server`
   - **Build Command**: `npm install`
   - **Start Command**: `node index.js` (or your entry point)
   - **Instance Type**: Free

### Set Environment Variables
In the Render dashboard under **Environment**, add:

| Key | Value |
|-----|-------|
| `SUPABASE_URL` | your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | your service role key |
| `ADMIN_API_KEY` | your strong admin key |
| `MTU_STUDENT_AUTH_MODE` | `portal-token` |
| `MTU_PORTAL_SHARED_SECRET` | your portal shared secret |
| `MTU_PORTAL_SESSION_SECRET` | your session secret |
| `MTU_PORTAL_CODE_TTL_SECONDS` | `120` |
| `MTU_PORTAL_API_URL` | `https://studentportal.mtu.edu.ng/api/v1` |
| `MTU_PORTAL_API_KEY` | your portal API key |

Your API will be at: `https://<your-service-name>.onrender.com`

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
VITE_API_BASE_URL=https://<your-service-name>.onrender.com/api

# Deploy
vercel --prod
```

Or use the Vercel Dashboard:
1. Import your GitHub repo
2. Set framework preset to "Vite"
3. Set root directory to `client`
4. Add environment variable: `VITE_API_BASE_URL=https://<your-service-name>.onrender.com/api`
5. Deploy

---

## Environment Variables Reference

### Backend (Render Environment)
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

### Render
- 1 free web service (512MB RAM)
- Spins down after 15 minutes of inactivity (cold starts ~30s)
- 750 hours/month

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
Check logs in the Render dashboard under **Logs**
Verify environment variables are set correctly

### Frontend API calls failing
Check CORS is configured in backend
Verify `VITE_API_BASE_URL` ends with `/api`

### Database migration failing
Ensure Supabase schema is created first
Check `SUPABASE_SERVICE_ROLE_KEY` has full permissions

---

## Updates & Redeploys

### Backend
Push to your connected GitHub branch — Render auto-deploys on push.
Or trigger a manual deploy from the Render dashboard.

### Frontend
```bash
cd client
vercel --prod
```
