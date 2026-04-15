# MTU Timetable Scheduler

A full-stack AI-assisted timetable scheduling and management system built for Mountain Top University (MTU). The system supports multiple timetable types (lecture and exam), manages institutional data (colleges, departments, lecturers, venues, courses), generates conflict-free schedules via an AI/constraint-based engine, and exposes a Student Portal with export capabilities.

---

## Table of Contents

1. [Features](#features)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [Prerequisites](#prerequisites)
5. [Setup](#setup)
6. [Environment Variables](#environment-variables)
7. [Running the Application](#running-the-application)
8. [Database Providers](#database-providers)
9. [Student Portal & Authentication Modes](#student-portal--authentication-modes)
10. [MTU Portal Integration](#mtu-portal-integration)
11. [Export (PDF, Excel, Word)](#export-pdf-excel-word)
12. [Admin Scripts & Smoke Tests](#admin-scripts--smoke-tests)
13. [Supabase Migration](#supabase-migration)
14. [Contributor Guidelines](#contributor-guidelines)

---

## Features

### Admin Dashboard
- Manage **Colleges**, **Departments**, **Lecturers**, and **Venues** (CRUD).
- Upload and manage **Courses** per timetable (CSV import supported).
- Create and manage multiple **Timetables** (Lecture / Exam types).
- Duplicate timetables and clear unscheduled courses.
- **Custom Fields** — define extra metadata fields on courses (text, number, select, checkbox).
- Manually drag-and-drop courses onto the timetable grid.
- **Sync courses from MTU Portal** (when API integration is configured).

### AI-Assisted Scheduling
- Generate conflict-free timetables using an AI/constraint-based engine.
- Respects lecturer availability, venue capacity, course duration, and scheduling rules.
- View unscheduled courses and manually place them.
- Time slots displayed in 12-hour AM/PM format.

### Student Portal
- Students log in with their matric number (legacy mode) or via a portal-issued token (portal-token mode).
- Personalized timetable view filtered by the student's courses based on college / department / level / semester.
- **Export** personal timetable to **PDF**, **Excel (.xlsx)**, or **Word (.docx)**.

### Database Flexibility
- Ships with **SQLite** (zero-config, default for local development).
- Switchable to **Supabase (Postgres)** via `DB_PROVIDER=supabase` env variable — no code change required.
- Repository-pattern data layer ensures consistent behavior across both providers.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Vanilla CSS |
| Backend | Node.js, Express 5 |
| Database (default) | SQLite 3 |
| Database (cloud) | Supabase (PostgreSQL) |
| AI Scheduler | Custom constraint-solver (`server/ai/`) |
| Export | PDFKit, xlsx, docx |
| Dev tooling | concurrently, nodemon |

---

## Project Structure

```
MTU-TIMETABLE-SCHEDULER/
├── client/                         # React + Vite frontend
│   └── src/
│       ├── components/
│       │   ├── AdminManager.jsx     # Manage colleges, departments, lecturers, venues
│       │   ├── CustomFieldsManager.jsx
│       │   ├── Dashboard.jsx        # Main admin dashboard + course management
│       │   ├── FloatingNotice.jsx
│       │   ├── NoticeBanner.jsx
│       │   ├── StudentPortal.jsx    # Student login, timetable view, export
│       │   ├── TimetableList.jsx    # Timetable listing and selection
│       │   └── TimetableView.jsx    # Timetable grid + drag-and-drop placement
│       └── App.jsx                  # Router (admin / student routes)
│
├── server/                          # Express API
│   ├── ai/                          # Constraint-based timetable generator
│   ├── data/repositories/           # Repository pattern (sqlite + supabase adapters)
│   ├── database/                    # SQLite adapter, Supabase schema SQL
│   ├── scripts/                     # Smoke tests, migration, and portal sample scripts
│   ├── security/                    # Auth middleware (portal-token verification)
│   ├── index.js                     # All API routes
│   ├── .env.example                 # Reference environment file
│   ├── CHANGELOG.md
│   ├── MTU_PORTAL_INTEGRATION.md    # Portal integration contract
│   ├── MTU_PORTAL_PRODUCTION_INTEGRATION.md
│   ├── SUPABASE_MIGRATION_BLUEPRINT.md
│   └── SUPABASE_STAGING_RUNBOOK.md
│
├── package.json                     # Root workspace (runs client + server concurrently)
└── README.md
```

---

## Prerequisites

- **Node.js 18** or higher
- **npm 9+**

---

## Setup

Install dependencies for the root workspace and both sub-packages:

```bash
npm install
npm install --prefix client
npm install --prefix server
```

Copy the environment template and fill in your values:

```bash
cp server/.env.example server/.env
```

---

## Environment Variables

All server environment variables live in `server/.env`. See `server/.env.example` for the full reference.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `5000` | Port the API server listens on |
| `DB_PROVIDER` | `sqlite` | Database backend: `sqlite` or `supabase` |
| `SUPABASE_URL` | _(empty)_ | Required when `DB_PROVIDER=supabase` |
| `SUPABASE_SERVICE_ROLE_KEY` | _(empty)_ | Required when `DB_PROVIDER=supabase` |
| `MTU_STUDENT_AUTH_MODE` | `legacy` | Student auth: `legacy` (matric login) or `portal-token` |
| `MTU_PORTAL_SHARED_SECRET` | _(empty)_ | Shared secret for portal-token mode |
| `MTU_PORTAL_SESSION_SECRET` | _(empty)_ | HMAC signing key for student session tokens |
| `MTU_PORTAL_CODE_TTL_SECONDS` | `120` | One-time portal code lifetime in seconds |
| `MTU_STUDENT_DATA_SOURCE` | `db` | `db` (local) or `api` (live MTU portal) |
| `MTU_PORTAL_API_URL` | _(empty)_ | Live portal API base URL (enables course sync) |
| `MTU_PORTAL_API_KEY` | _(empty)_ | API key sent as `x-api-key` to the portal |

The client reads one variable from `client/.env`:

| Variable | Default | Description |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:5000/api` | Backend API base URL |

---

## Running the Application

### Development (recommended)

Starts both server and client concurrently with hot-reload:

```bash
npm run dev
```

- Client: `http://localhost:5173` (or next available port)
- API server: `http://localhost:5000`

### Individual services

```bash
npm run dev:server   # server only (nodemon)
npm run dev:client   # client only (Vite HMR)
```

### Production

```bash
npm run prod
```

Builds the React client and serves it via Vite preview; starts the Express server in production mode.

---

## Database Providers

### SQLite (default)

No extra configuration needed. The database file is created automatically at `server/database/mtu_timetable.db` on first run.

### Supabase

1. Create a Supabase project and run the schema script found at `server/database/supabase_schema.sql` in the Supabase SQL editor.
2. Set in `server/.env`:
   ```env
   DB_PROVIDER=supabase
   SUPABASE_URL=https://<project>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
   ```
3. (Optional) Migrate existing SQLite data:
   ```bash
   npm run import:sqlite-to-supabase --prefix server
   ```

> **Security:** The Supabase service role key must **never** be exposed to the client. It is used server-side only.

---

## Student Portal & Authentication Modes

### Legacy mode (`MTU_STUDENT_AUTH_MODE=legacy`)

Students log in directly using their matric number at `/student`. No token or portal integration needed.

### Portal-token mode (`MTU_STUDENT_AUTH_MODE=portal-token`)

Direct matric-number login is **disabled**. Students must arrive via a redirect from the MTU student portal carrying a portal-issued code or token.

Required secrets:
```env
MTU_STUDENT_AUTH_MODE=portal-token
MTU_PORTAL_SHARED_SECRET=<shared with MTU portal backend>
MTU_PORTAL_SESSION_SECRET=<HMAC signing secret>
MTU_PORTAL_CODE_TTL_SECONDS=120
```

---

## MTU Portal Integration

The timetable app exposes three portal-facing API endpoints (called by the MTU portal **backend**, not the browser):

| Endpoint | Description |
|---|---|
| `POST /api/student/portal/authorize` | Issues a one-time portal code for a student (preferred) |
| `POST /api/student/portal/exchange` | Exchanges a one-time code for a signed session token (called by the browser) |
| `POST /api/student/portal/session` | Issues a signed session token directly (legacy fallback) |

All portal-backend requests must include the header:
```
x-mtu-portal-secret: <MTU_PORTAL_SHARED_SECRET>
```

### Preferred redirect pattern (hardened)

```
https://<timetable-app>/student?portal_code=<one_time_code>
```

### Legacy redirect pattern

```
https://<timetable-app>/student?matric=<matric_number>&mtu_token=<signed_token>
```

For full integration details see [`server/MTU_PORTAL_INTEGRATION.md`](server/MTU_PORTAL_INTEGRATION.md).

### Sample portal request scripts

Run from the `server/` directory:

```bash
MTU_PORTAL_SHARED_SECRET=<secret> npm run portal:sample-authorize
MTU_PORTAL_SHARED_SECRET=<secret> npm run portal:sample-session
```

---

## Export (PDF, Excel, Word)

Students can export their personalized timetable from the Student Portal.

Supported formats:

| Format | Endpoint |
|---|---|
| PDF | `GET /api/student/:matric/timetable/export?format=pdf` |
| Excel (.xlsx) | `GET /api/student/:matric/timetable/export?format=excel` |
| Word (.docx) | `GET /api/student/:matric/timetable/export?format=word` |

In `portal-token` mode, all export requests require a valid `Authorization: Bearer <token>` header with a token matching the requested matric number.

---

## Admin Scripts & Smoke Tests

All scripts are run from the **`server/`** directory (or using `--prefix server`).

### Supabase smoke tests

Validate each repository layer against a live Supabase instance:

```bash
npm run smoke:supabase:admin                  --prefix server
npm run smoke:supabase:admin-writes           --prefix server
npm run smoke:supabase:timetables             --prefix server
npm run smoke:supabase:courses-customfields   --prefix server
npm run smoke:supabase:students               --prefix server
```

### Parity & migration

```bash
npm run parity:staging                --prefix server   # API parity probe (sqlite vs supabase)
npm run verify:data-dry-run           --prefix server   # Dry-run row-count parity check
npm run import:sqlite-to-supabase     --prefix server   # Migrate SQLite data to Supabase
npm run seed:supabase:parity-student  --prefix server   # Seed deterministic test student
npm run verify:portal-student         --prefix server   # Verify portal-mode student carryover
```

---

## Supabase Migration

Detailed migration documentation is available in `server/`:

| Document | Purpose |
|---|---|
| [`SUPABASE_MIGRATION_BLUEPRINT.md`](server/SUPABASE_MIGRATION_BLUEPRINT.md) | Architecture decisions, schema mapping, risk analysis |
| [`SUPABASE_STAGING_RUNBOOK.md`](server/SUPABASE_STAGING_RUNBOOK.md) | Step-by-step staging validation, cutover, and rollback |
| [`CHANGELOG.md`](server/CHANGELOG.md) | History of data-layer changes |

**Current migration status:** Route-level migration to the repository layer is complete. Both SQLite and Supabase repositories are implemented. Switch between providers by changing `DB_PROVIDER` in `.env`.

---

## Contributor Guidelines

- Do not commit generated files or folders: `node_modules/`, `dist/`, `*.db`, log files.
- Keep all secrets in `.env` files (already in `.gitignore`). **Never commit credentials or API keys.**
- If dependencies are missing, reinstall locally with npm — do not commit `node_modules/` contents.
- Run smoke tests against Supabase before switching `DB_PROVIDER` in a shared environment.
- Time slots throughout the application use **12-hour AM/PM format**.
- The `is_compulsory` field on courses is stored via the `custom_data` JSONB column when the database schema does not include a dedicated column (Supabase fallback pattern).
