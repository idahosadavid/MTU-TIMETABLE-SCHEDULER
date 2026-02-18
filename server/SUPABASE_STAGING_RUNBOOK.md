# Supabase Staging Runbook

Planning context: see `server/SUPABASE_MIGRATION_BLUEPRINT.md` for migration status, scope, and decision log.

Recent changes: see `server/CHANGELOG.md`.

## Purpose

Execute a safe staging validation before production cutover from SQLite to Supabase.

## Preconditions

- Supabase project is created and reachable.
- `server/database/supabase_schema.sql` has been applied in Supabase SQL Editor.
- Server dependencies installed (`npm install` in `server/`).
- Staging environment variables are available.

## Environment Setup (Staging)

Create/update `server/.env` for staging:

- `DB_PROVIDER=supabase`
- `SUPABASE_URL=<your-supabase-url>`
- `SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>`
- `PORT=<staging-port>` (optional)

For MTU portal integration staging:

- `MTU_STUDENT_AUTH_MODE=portal-token`
- `MTU_PORTAL_SHARED_SECRET=<shared secret used by MTU portal backend>`
- `MTU_PORTAL_SESSION_SECRET=<HMAC signing secret for portal session tokens>`
- `MTU_PORTAL_CODE_TTL_SECONDS=120`

## Step 1: Repository Smoke Tests (Order)

From `server/` run:

1. `npm run smoke:supabase:admin`
2. `npm run smoke:supabase:admin-writes`
3. `npm run smoke:supabase:timetables`
4. `npm run smoke:supabase:courses-customfields`
5. `npm run smoke:supabase:students`

Expected: each command ends with `*_SMOKE_OK` and exits `0`.

## Step 2: Start Staging API

From `server/` run:

- `npm start`

Expected startup signal:

- `Database provider: supabase`
- `Connected to Supabase (client initialized)...`

## Step 3: API Parity Checks (Manual/Automated)

Recommended automated probe first:

- `npm run parity:staging`

Optional probe inputs:

- `PARITY_STUDENT_MATRIC=<known_matric_number> npm run parity:staging`
- `PARITY_EXPORT_TIMETABLE_ID=<known_timetable_id> npm run parity:staging`
- `PARITY_ENABLE_WRITES=true npm run parity:staging` (creates/deletes a temporary custom field)

Expected: summary shows `failed: 0` and command exits `0`.

Validate these routes against expected behavior:

- Admin reads/writes:
  - `GET/POST/PUT/DELETE /api/admin/colleges`
  - `GET/POST/PUT/DELETE /api/admin/departments`
  - `GET/POST/PUT/DELETE /api/admin/lecturers`
  - `GET/POST/PUT/DELETE /api/admin/venues`
  - `GET/PUT /api/admin/rules`
- Supporting:
  - `GET/POST/DELETE /api/custom-fields`
  - `GET /api/options`
- Timetables:
  - `GET/POST /api/timetables`
  - `GET/PUT/DELETE /api/timetables/:id`
  - `POST /api/timetables/:id/duplicate`
  - `POST /api/timetables/:type/save`
  - `POST /api/timetables/:id/save`
  - `POST /api/timetables/:id/clear-unscheduled`
  - `GET /api/timetables/latest/:type`
- Courses and generation:
  - `POST /api/courses`
  - `GET /api/courses`
  - `POST /api/upload`
  - `POST /api/generate/lectures`
  - `POST /api/generate/exams`
  - `POST /api/generate/tests`
- Student:
  - `POST /api/student/login`
  - `POST /api/student/portal/authorize`
  - `POST /api/student/portal/exchange`
  - `GET /api/student/:matric_number/timetable`
  - `POST /api/student/portal/session`
- Export:
  - `GET /api/timetables/:id/export?format=excel|pdf|word`

Venue payload compatibility note (admin + options APIs):

- Preferred field name: `seats`
- Legacy compatible field name: `capacity`
- `POST /api/admin/venues` and `PUT /api/admin/venues/:id` accept either field (if both are sent, `seats` is used)
- `GET /api/admin/venues` and `GET /api/options` include `seats` while preserving `capacity` for backward compatibility

Portal-token personalized carryover verification:

- Run `npm run verify:portal-student` from `server/`
- Expected: command ends with `PORTAL_STUDENT_CARRYOVER_OK` and exits `0`
- If `MTU_STUDENT_AUTH_MODE` is not `portal-token` (for example `legacy`), command exits `0` with `PORTAL_STUDENT_CARRYOVER_SKIPPED`.
- Validates:
  - one-time portal code issuance for known student
  - one-time code exchange into short-lived student session token
  - token-authorized personalized timetable retrieval
  - carryover course inclusion (`is_carryover=true`) in returned schedule

## Step 4: Data Dry-Run Validation

After loading a representative SQLite snapshot into Supabase staging, verify:

- Run `npm run import:sqlite-to-supabase`
- Run `npm run verify:data-dry-run`
- Optional SQLite source override: `MIGRATION_SQLITE_PATH=<path-to-snapshot.db> npm run verify:data-dry-run`
- Expected: `DATA_DRY_RUN_VERIFICATION_SUMMARY` shows `ok: true`

- Row-count parity per table:
  - `courses`, `timetables`, `custom_fields`, `colleges`, `departments`, `lecturers`, `venues`, `scheduling_rules`, `students`, `student_courses`, `student_results`
- JSON field integrity spot checks:
  - `courses.lecturers` is valid array JSON
  - `courses.custom_data` is valid object JSON
  - `timetables.data` contains `scheduled`/`unscheduled`
- Functional spot checks:
  - Generate timetable on migrated data
  - Student timetable response for known student
  - One export in each format

## Step 5: Cutover Plan (Production)

1. Announce maintenance window.
2. Freeze writes on old environment.
3. Run final SQLite export.
4. Import into Supabase production.
5. Switch production env to:
   - `DB_PROVIDER=supabase`
   - production Supabase credentials
6. Restart server.
7. Run quick post-cutover smoke checks (admin reads, student login, generate, export).
  - If `MTU_STUDENT_AUTH_MODE=portal-token`, run `npm run verify:portal-student` instead of direct student login check.
8. Monitor logs/errors for 30–60 minutes.

## Production Cutover Checklist (Pre-filled)

Use this as the execution checklist during go-live.

### Already Completed (Staging Evidence)

- [x] Supabase schema applied in staging (`server/database/supabase_schema.sql`)
- [x] Repository smoke suite passed (`smoke:supabase:*`)
- [x] API parity probe passed with `failed: 0` (latest: `13/13`)
- [x] Write-path parity probe validated (`PARITY_ENABLE_WRITES=true`)
- [x] Student flow parity validated with known matric (`PARITY_STUDENT_MATRIC`)

### Must Complete Before Production Switch

- [ ] Rotate Supabase service-role key and replace in all server environments
- [ ] Confirm production `.env` has `DB_PROVIDER=supabase` and correct production Supabase URL/key
- [ ] Execute final SQLite export at start of maintenance window
- [ ] Import final snapshot into Supabase production
- [ ] Run row-count parity checks across all core tables
- [ ] Spot-check JSON integrity (`courses.lecturers`, `courses.custom_data`, `timetables.data`)
- [ ] Confirm rollback env values are prepared (`DB_PROVIDER=sqlite`) and restart procedure is verified

### Cutover Execution

- [ ] Announce maintenance start and freeze writes
- [ ] Switch production environment to Supabase values
- [ ] Restart API service
- [ ] Run quick health checks (`/api/health`, admin reads, student flow, generate route, one export)
- [ ] If portal-token mode is enabled, run `npm run verify:portal-student`
- [ ] Monitor logs and error rates for 30–60 minutes

### Completion / Rollback Decision

- [ ] Mark cutover complete only if no critical errors observed
- [ ] If critical issue appears, execute rollback steps immediately from this runbook

## Rollback Plan

If severe issue appears post-cutover:

1. Revert env to `DB_PROVIDER=sqlite`.
2. Restart server.
3. Re-enable writes on SQLite environment.
4. Capture incident notes (endpoint, payload, error, timestamp).
5. Fix in staging, then reattempt cutover in a new window.

## Exit Criteria

Proceed to production only when all are true:

- All `smoke:supabase:*` scripts pass.
- API parity checks pass for critical routes.
- Dry-run row counts and JSON integrity checks pass.
- Team confirms rollback path is tested and documented.
