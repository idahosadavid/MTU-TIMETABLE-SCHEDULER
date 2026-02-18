# Supabase Migration Blueprint (for MTU Timetable App)

## Bottom-line Recommendation

Move to Supabase **only if** you now need reliable cloud multi-user access, automated backups, and easier production hosting.

For this codebase, migration is reasonable and valuable, but should be done in phases because the server currently uses direct SQLite queries in many endpoints.

Execution guide: see `server/SUPABASE_STAGING_RUNBOOK.md` for step-by-step staging validation, cutover, and rollback commands.

Recent changes: see `server/CHANGELOG.md`.

## Progress Update (Feb 17, 2026)

Completed:

- Added provider switch + adapters (`DB_PROVIDER=sqlite|supabase`) in `server/database/*`
- Added Supabase schema script: `server/database/supabase_schema.sql`
- Introduced repository layer (`server/data/repositories/*`) with sqlite implementations
- Migrated server routes in `server/index.js` to repository calls
- Removed direct `db.get/db.all/db.run` usage from `server/index.js`
- Implemented Supabase repositories for `adminRepo` (reads), `timetablesRepo`, `coursesRepo`, `customFieldsRepo`, `studentsRepo`
- Added Supabase smoke scripts for repository verification:
  - `npm run smoke:supabase:admin`
  - `npm run smoke:supabase:admin-writes`
  - `npm run smoke:supabase:timetables`
  - `npm run smoke:supabase:courses-customfields`
  - `npm run smoke:supabase:students`

Outstanding:

- Run data migration dry-run from SQLite to Supabase and validate parity
- Execute controlled cutover and post-cutover verification

## Progress Update (Feb 18, 2026)

Completed since previous update:

- Staging API parity probe passed end-to-end with Supabase (`PARITY_PROBE_SUMMARY` = `13 passed, 0 failed`)
- Write-path parity probe validated create/delete flow for temporary custom field (`PARITY_ENABLE_WRITES=true`)
- Student parity flow validated with deterministic seeded student (`PARITY_STUDENT_MATRIC`)

Outstanding:

- Run production-grade SQLite -> Supabase data dry-run and record table-by-table row-count parity evidence
- Perform production cutover in maintenance window and complete post-cutover verification + monitoring
- Rotate Supabase service-role key before production go-live (credential was previously exposed in terminal/session history)

## Current State (Observed)

- Database engine: local SQLite (`server/database/mtu_timetable.db`)
- Access pattern: repository layer with adapter-based DB provider switching
- Core tables: `courses`, `timetables`, `custom_fields`, `colleges`, `departments`, `lecturers`, `venues`, `scheduling_rules`, `students`, `student_courses`, `student_results`
- Data shape note: `timetables.data` and some fields (`courses.lecturers`, `courses.custom_data`) are JSON strings
- API note: route-level repository migration is complete; SQLite remains active default provider
- Supabase coverage note: repository methods required by current runtime paths are implemented

## Recommended Target Architecture

### Phase-1 target (lowest risk)

- Keep Express API as the only backend entrypoint
- Replace SQLite calls with Supabase Postgres access inside server routes
- Keep business logic in Node (`scheduler.js`) unchanged
- Keep frontend API contract unchanged

This gives cloud DB benefits without a full auth/API rewrite.

### Phase-2 target (optional)

- Introduce Supabase Auth + Row Level Security (RLS)
- Optionally move selected read endpoints to direct Supabase client usage
- Optionally move heavy operations to Edge Functions

## Schema Mapping (SQLite -> Supabase Postgres)

Use these mapping rules:

- `INTEGER PRIMARY KEY AUTOINCREMENT` -> `bigint generated always as identity primary key`
- `DATETIME DEFAULT CURRENT_TIMESTAMP` -> `timestamptz default now()`
- Boolean flags (`is_active`) -> `boolean`
- JSON string columns -> `jsonb`

### Table-by-table mapping

1. `courses`
- Keep all columns
- Convert `lecturers` from TEXT(JSON string) -> `jsonb`
- Convert `custom_data` from TEXT(JSON string) -> `jsonb`
- Keep `duration` in minutes as `integer`
- FK: `timetable_id` -> `timetables.id on delete cascade`

2. `timetables`
- Keep metadata columns
- Convert `data` TEXT(JSON string) -> `jsonb`
- `created_at`, `updated_at` -> `timestamptz`

3. Admin tables: `colleges`, `departments`, `lecturers`, `venues`, `scheduling_rules`
- Keep structure
- Convert `is_active` to `boolean`

4. Student tables: `students`, `student_courses`, `student_results`
- Keep structure
- Add useful indexes for student lookups and carryover queries

## Indexes to Add Early

- `courses(timetable_id)`
- `courses(code)`
- `courses(college, department, level, semester, type)`
- `timetables(type, updated_at desc)`
- `timetables(college, updated_at desc)`
- `student_courses(student_matric, status)`
- `student_results(student_matric)`
- `departments(college_code)`
- `venues(college_code)`

## API Migration Plan (Endpoint Order)

Migrate in this order to reduce blast radius:

1. Read-only admin/options endpoints
- `/api/admin/colleges`, `/api/admin/departments`, `/api/admin/lecturers`, `/api/admin/venues`, `/api/options`, `/api/admin/rules`

2. Write admin endpoints
- CRUD for colleges/departments/lecturers/venues/rules/custom-fields

3. Timetable CRUD + listing
- `/api/timetables`, `/api/timetables/:id`, create/update/delete/duplicate

4. Course ingest paths
- `/api/courses`, `/api/upload`

5. Generation & save flows
- `/api/generate/*`, `/api/timetables/:id/save`, `/api/timetables/:id/clear-unscheduled`

6. Student-facing endpoints
- `/api/student/login`, `/api/student/:matric_number/timetable`

7. Export endpoint
- `/api/timetables/:id/export`

Venue payload compatibility (admin + options):

- Preferred field name: `seats`
- Legacy compatible field name: `capacity`
- `POST /api/admin/venues` and `PUT /api/admin/venues/:id` accept either field (if both are sent, `seats` is used)
- `GET /api/admin/venues` and `GET /api/options` include `seats` while preserving `capacity` for backward compatibility

### Migration status

- ✅ Step 1 through Step 7 complete for route-level migration to repositories
- ✅ `server/index.js` no longer performs direct SQL calls
- ✅ Supabase repository coverage implemented for timetable, courses, custom-fields, students, and admin reads/writes
- ⏭️ Next phase is staging switch, parity testing, and cutover

## Supabase Repository Coverage (Current)

- ✅ `adminRepo` reads: `list*`, `getOptions`, `getActiveCollegeByCode`
- ✅ `adminRepo` writes: `create/update/delete` (colleges/departments/lecturers/venues), `updateRule`
- ✅ `timetablesRepo`: full methods used by current server routes
- ✅ `coursesRepo`: list/create + generation-friendly normalization
- ✅ `customFieldsRepo`: list/create/delete
- ✅ `studentsRepo`: all methods used by student login/timetable flow

## Refactor Strategy (Important)

Before mass migration, create a data-access layer:

- `server/data/repositories/*.js` for each domain (`coursesRepo`, `timetablesRepo`, etc.)
- Keep route handlers thin; move SQL/data calls into repositories
- Implement a DB adapter interface:
  - `sqliteAdapter` (existing behavior)
  - `supabaseAdapter` (new)

Then switch endpoint-by-endpoint using the same repository contract.

This is the safest way to avoid breaking many routes at once.

Status: ✅ Completed in current codebase.

## Data Migration Approach

1. Freeze writes briefly (maintenance window)
2. Export SQLite tables to JSON/CSV
3. Transform JSON-string fields to real JSON objects (`lecturers`, `custom_data`, `timetables.data`)
4. Import into Supabase Postgres
5. Run parity checks:
   - row counts per table
   - sampled record checks
   - generation endpoint output sanity check
6. Enable writes on Supabase-backed server

## Auth + Security Model

### Minimum for Phase-1

- Keep existing server-managed auth pattern
- Use Supabase service role key **only on server**
- Do not expose service role key to client
- Lock network/CORS to known origins

### Recommended for Phase-2

- Move admin/student identity to Supabase Auth
- Add RLS policies by role (`admin`, `student`)
- Restrict student access to own timetable data

## Estimated Effort (Single Developer)

- Setup Supabase project + schema + indexes: **1-2 days** (mostly completed)
- Repository layer refactor in Node server: **2-4 days** (completed)
- Endpoint migration + testing: **3-5 days** (route migration completed; broader integration testing pending)
- Data migration scripts + dry-run + cutover: **1-2 days**
- Supabase repository implementation + staging verification: **2-4 days**
- Auth/RLS hardening (if included now): **2-4 days**

### Total

- **Without Auth/RLS overhaul:** ~**7-13 working days**
- **With Auth/RLS overhaul now:** ~**9-17 working days**

## Risks and Mitigations

1. JSON parsing differences (string vs jsonb)
- Mitigation: normalize at repository boundary and add validation

2. Behavior drift in timetable generation inputs
- Mitigation: snapshot test a sample timetable before/after migration

3. Partial migration instability
- Mitigation: feature flag (`DB_PROVIDER=sqlite|supabase`) and migrate endpoint groups sequentially

4. Security misconfiguration (service role leakage / weak RLS)
- Mitigation: keep service key server-only; add policy tests before go-live

## Go/No-Go Rule

Proceed now if at least one is true:

- Multiple admins need concurrent reliable access
- You need automated backups and cloud durability
- You are deploying beyond one local machine

Defer if all are true:

- Single-machine use is acceptable
- Downtime/data-loss risk is currently tolerable
- Team cannot allocate ~2 weeks for safe migration

## Immediate Next Steps (Concrete)

1. Run SQLite -> Supabase data dry-run and validate row counts plus spot-check JSON fields
  - For portal-specific validation, run `npm run verify:portal-student` only when `MTU_STUDENT_AUTH_MODE=portal-token`.
  - In `legacy` mode, `verify:portal-student` returns `PORTAL_STUDENT_CARRYOVER_SKIPPED` and exits `0` by design.
2. Rotate Supabase service-role key and update all server environments
3. Perform cutover window, monitor errors, and keep rollback path to `DB_PROVIDER=sqlite`
