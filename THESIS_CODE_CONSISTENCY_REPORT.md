# Thesis ↔ Codebase Consistency Report

**Document reviewed:** MTU_Thesis_COMPLETE.docx
**Codebase reviewed:** MTU-TIMETABLE-SCHEDULER (client + server)
**Date:** 5 July 2026

## Verdict

The thesis describes an **earlier version** of the system. The codebase has since evolved substantially, and several central technical claims in the thesis no longer match the code. The most serious mismatch is the scheduling algorithm itself (Chapter 3.4, Chapter 4.1.2, Appendix B), which describes an algorithm that no longer exists in the code.

---

## CRITICAL inconsistencies

### 1. The scheduling algorithm is completely different
**Thesis says** (Abstract, 1.1, 2.1, 3.4, 4.1.2, 4.2.1, 5.1, Appendix B): a *deterministic constructive greedy heuristic with selective backtracking* — courses sorted by compulsory status and units, preferred-slot attempt, random day scan, `tryRearrangeForCourse` backtracking, `hasConflict` as the innermost loop rejecting every violating placement.

**Code actually implements** (`server/ai/scheduler.js`, header comment says so explicitly): **Adaptive Large Neighborhood Search (ALNS)**:
- Greedy warm-start builds an initial *complete* assignment (courses may initially be placed with conflicts).
- 5 destroy operators (random, lecturer-based, dept+level-based, conflict-targeted, day-based) and 3 repair operators (greedy, regret-2, random) selected by adaptive roulette-wheel weights.
- **Simulated-annealing acceptance criterion** (temperature 60, cooling 0.997), up to `max(3000, n×30)` iterations, **multi-start with 4 independent runs**.
- A weighted **cost function** (room/lecturer/level conflict = 1000, daily-hours excess = 500, plus soft costs: preferred day/time miss, compulsory-late, unassigned/undersized room, workload imbalance).
- A post-processing step (`separateUnscheduled`) moves any entries still in hard conflict into the `unscheduled` pool.

Consequences for the thesis text:
- `tryPreferredSlot` and `tryRearrangeForCourse` (Steps 3–5 of 3.4.2, Appendix B listing) **do not exist** in the code. The Appendix B source listing is not the real source code.
- `hasConflict` still exists but only as a **legacy export**, used by the manual-move validation endpoint — it is *not* the inner loop of the schedulers.
- Section 4.1.2's argument that "zero hard constraint violations are guaranteed because hasConflict rejects every violating placement" does not describe the actual mechanism. In the real code, hard constraints are enforced via heavy cost penalties plus the final `separateUnscheduled` sweep.
- **Internal contradiction:** Section 2.1 justifies rejecting meta-heuristics (GA/SA) for their computational overhead — yet the implemented ALNS uses simulated-annealing acceptance and *is* a meta-heuristic. Recommendation 2 (5.2) proposes adding a meta-heuristic post-processing phase, which the system effectively already has.
- The exam scheduler uses slot times `'9:00-12:00' / '12:00-15:00' / '15:00-18:00'` (not `'9:00' / '12:00' / '15:00'` as in Appendix B), defaults venue to `'Exam Hall'`, and checks lecturer conflicts too (thesis 3.4.3 says only venue + level clashes). The test scheduler runs full ALNS with a 6-hour daily cap and real course durations — the thesis says it "omits the preferred-slot and daily-workload machinery" and treats tests as one-hour events.

### 2. Frontend stack versions are wrong
- **Thesis:** React 18, React Router v6 (Abstract, 1.1, 3.2.1, Table 3.1, 3.5.3, 4.1, 4.1.4, 5.1).
- **Code:** `react` **^19.2.0**, `react-router-dom` **^7.13.0**, Vite 8, Tailwind CSS 4 (`client/package.json`).

### 3. The SQLite/Supabase switchable Repository Pattern no longer exists
**Thesis** (Abstract, Objective 6/FR6/NFR3, 2.3, 3.3, Table 3.3, 3.9, 4.1.6, 5.1): the backend switches between a local SQLite database and Supabase "by modifying a single environment variable"; parity probes compare the two adapters.

**Code:** `server/database/schema.js` hard-codes `DB_PROVIDER = 'supabase'`. There is **no SQLite adapter** in the codebase; the legacy `db` shim throws "not available with DB_PROVIDER=supabase" for every call. All 8 repositories are Supabase-only. A one-time migration script (`import_sqlite_to_supabase.js`) and docs (`SUPABASE_MIGRATION_BLUEPRINT.md`) show SQLite support was removed after migration. The only env-switchable repository is `studentsRepo` (`MTU_STUDENT_DATA_SOURCE=db|api` — DB vs live MTU-portal API), which the thesis does mention (end of 3.6.3). The parity probe (`parity_probe_staging.js`) targets a Supabase staging instance — it is not an SQLite-vs-Supabase comparison in the current code.

RO6, FR6, NFR3, Section 4.1.6's claims ("switching the environment variable and restarting resulted in transparent transition") and Table 3.3's "Database (Development): SQLite" cannot be validated against this codebase.

### 4. Drag-and-drop conflict detection is server-side, plus an undocumented ALNS re-optimization
**Thesis** (3.5.2, 4.1.3, Figure 4.2): drop validation happens **in-browser**, "eliminating the need for a server round-trip"; the notification identifies "the nature of the violation and the conflicting course".

**Code** (`TimetableView.jsx` `handleDrop`): every drop triggers **`POST /api/timetables/validate`** (server-side `hasConflict`). If valid, the client then calls **`POST /api/timetables/:id/reoptimize`**, which locks the moved course and re-runs ALNS on the affected subset (`reoptimizeAround`) — "Course moved and schedule re-optimised." If invalid, the notification is generic ("Conflict detected. Cannot move course here.") and does not name the conflicting course. The automatic re-optimization around a manually moved course is a headline feature the thesis never mentions.

### 5. SSO mechanics are misdescribed
- **Thesis** (3.6.3, Fig 3.4, 4.1.4): the portal's server-to-server request is "signed with an HMAC-SHA256 **signature**" over matric number + timestamp; invalid signatures get **403**.
- **Code** (`index.js` `/api/student/portal/authorize|session`): authentication is a **static shared secret** sent in the `x-mtu-portal-secret` header, compared with a timing-safe hash comparison. There is no per-request HMAC signature or timestamp signing. Invalid secrets get **401**, not 403.
- **"JWT" claim:** the session token (`security/studentSession.js`) is a **custom two-part HMAC-SHA256 token** (`base64url(payload).signature` with `sub/iat/exp`) — JWT-like, but not a standard three-part JWT, and no JWT library is used. Default TTL 30 minutes.
- The one-time portal code store matches the thesis well (in-memory, crypto-random, consumed on exchange, default TTL 120 s ✓, replay → 401 ✓).
- Undocumented: a second integration endpoint `POST /api/student/portal/session` (direct token minting with TTL cap of 24 h), and `MTU_STUDENT_AUTH_MODE` (`legacy` vs `portal-token`) — in the default `legacy` mode, the student timetable endpoint does **not** require a session token at all.

### 6. Appendix A DDL does not match the real schema (`server/database/supabase_schema.sql`)
| Thesis Appendix A / Table 3.2 | Actual schema |
|---|---|
| `course_catalogue` table in DDL | **Not in the schema file at all**; the code uses a table named **`course_catalog`** |
| `courses.shared_session_key` column | **No such column** — the shared session key lives inside `custom_data` JSONB |
| `venues.seats` column ("preferred alias") | No `seats` column — `seats` is an **API-level alias** computed from `capacity` in `index.js` |
| `custom_fields (field_key, label, field_type)` | Actual columns: `name, label, type, required` |
| `students.portal_uid` | No such column; `name/department/level` are NOT NULL |
| `student_courses (matric_number)` | Actual: `student_matric` + a `status` column |
| `audit_log (entity, details jsonb, performed_at)` | Actual: `entity_type`, **`detail` is TEXT (not JSONB)**, `ip_address`, `created_at` |
| — | **`student_results` table** (carryover courses) exists but is absent from the thesis |
| `lecturers.department` | Actual: `department_code` (FK to departments) |
| — | `timetables` also has `college` and `created_at`; `scheduling_rules` also has `name`, `is_active`; `colleges/departments/venues/lecturers` have `created_at` |
| — | Seeded scheduling rule `prioritize_core_courses` and seed data (CBAS/CHMS/CAHS, CSC/MTH/STA) not shown |

Section 3.3 ("JSONB … structured audit log detail records") and 4.1.8 ("structured JSONB detail payload") are wrong — audit details are plain strings like `code=CSC101 name=…`, and the log also records the **client IP address** (never mentioned in the thesis).

### 7. Student portal filtering is server-side (and richer than described)
**Thesis** (3.5.3, 3.3.1, 4.1.4): the portal "fetches the full timetable document … and applies client-side filtering" via the `student_courses` junction table.

**Code** (`getStudentTimetablePayload` in `index.js`): filtering happens **on the server** — it merges registered courses **and carryover courses** (from `student_results`), flags `is_carryover`, computes `clash_warning` flags for overlapping personal courses, and **JIT-provisions** unknown students from the MTU Portal API (`portalStudentProvisioner.js`). Only the pre-filtered personal schedule is returned. None of the carryover/JIT/clash-warning behaviour appears in the thesis.

---

## MODERATE inconsistencies

### 8. No route-level code splitting and no Context API
- **Thesis** (3.2.1, Table 3.1, NFR4): route-level `lazy()`/`Suspense` code splitting; admin and student bundles load independently; global state via **React Context API**.
- **Code** (`App.jsx`): all components are **statically imported** — no `lazy()`, no `Suspense`, single bundle. There is **no Context API usage anywhere**; auth state uses a small custom pub-sub module (`adminAuth.js`) + component-local state. (Table 3.1's "reactive auth-change subscription" is accurate; the Context claim is not.)

### 9. Course Catalogue and Custom Fields Manager UIs are orphaned
`Dashboard.jsx` — the only component containing the Course Catalogue import UI and the `CustomFieldsManager` — is **not imported or routed anywhere** in `App.jsx`. The routed admin surface is: TimetableList (`/`), TimetableView (`/timetable/:id`), AdminManager (`/admin`), AuditLog (`/audit-log`), AdminLogin, StudentPortal. The backend endpoints (`/api/course-catalog`, `/api/custom-fields`) exist and work, but:
- 3.2.1's "seven principal frontend modules" (including a Custom Fields Manager) doesn't match the routed app.
- 4.1.1's claim that the Courses form renders dynamic custom fields does not hold in `AdminManager.jsx` (no custom-fields code there).
- 4.1.7 / C.6 describe a catalogue UI a user cannot currently reach.

### 10. Audit log UI is searchable but not paginated
**Thesis** (FR8, 3.3.3, 3.5.1, 4.1.8, C.7): "paginated, searchable interface". **Code** (`AuditLog.jsx`): fetches the latest **200** entries in one request and filters them client-side; there are no pagination controls (the backend `limit/offset` support exists but is unused).

### 11. Not every admin action/route matches the security claims
- The **timetable export endpoint (`GET /api/timetables/:id/export`) and several read endpoints (timetables, courses, custom-fields, course-catalog lists) are public** — no admin key required. The thesis (3.2.2, Figure 3.1, 3.6.1) implies all administrative routes are API-key-protected; writes are, reads and exports largely are not.
- Undocumented audit actions exist (`BULK_CREATE` from CSV bulk import); the thesis lists only create/update/delete/generate.

---

## MINOR inaccuracies / omissions

- **Undocumented features** the thesis could claim credit for: unscheduled-reason explanations (`attachUnscheduledReasons` — "lecturer unavailable on X/50 slots…"), the schedule **quality report** (`generateQualityReport`: hard conflicts, overloaded days, back-to-back lecturer sessions, workload distribution), conflict-check endpoint + UI panel, timetable duplication and course-copy endpoints, CSV bulk import of entities, 15-second polling refresh of the grid with concurrent-edit notice, college-scoped timetables, notice banner system, admin logout, `/api/admin/ping` key validation.
- **Landing page description** (Fig 4.3, C.5) ✓ matches `StudentPortal.jsx` exactly ("Access your personalized class schedule securely through the MTU Student Portal", two numbered steps).
- **Verified accurate claims:** Express 5 ✓ (^5.1.0); rate limits ✓ (200 general / 20 auth per 15 min, applied to `/api`, login, authorize, exchange, admin ping); timing-safe SHA-256 admin key comparison via custom `x-admin-key` header ✓; ExcelJS + PDFKit (landscape A4) + docx, all in-memory buffers, no temp files ✓; 8 repository modules ✓; DAYS Mon–Fri and hourly TIMES 9:00–18:00 with configurable `default_start_hour`/`default_end_hour` ✓; `max_daily_hours_per_level` default 6 ✓; smallest-adequate-venue selection ✓; compulsory detection across `custom_data` key variants ✓; lecturer-array normalization (JSON array / JSON string / comma string) ✓; unscheduled pool returned alongside scheduled ✓; department scoping with aliases, level/semester/college filters ✓; Vercel + Render + Supabase deployment ✓ (DEPLOY.md, vercel.json); GitHub URL ✓ (`github.com/idahosadavid/MTU-TIMETABLE-SCHEDULER`); GENERATE actions audit-logged ✓; smoke-test scripts ✓ (`npm run smoke:supabase:*`).

---

## Recommended fixes (in priority order)

1. **Rewrite 3.4 + 4.1.2 + 4.2.1 + Appendix B around ALNS.** This is the "core intellectual contribution" chapter and currently describes a different algorithm. Positively, ALNS is a *stronger* story: warm start + adaptive destroy/repair + simulated annealing + multi-start + regret-2 insertion is genuinely state-of-the-art relative to the surveyed literature (Ceschia et al. 2023 explicitly benchmarks ALNS-family methods). Chapter 2.1's rationale must also be inverted (a meta-heuristic *was* adopted), and Recommendation 2 replaced (e.g., recommend hybrid GA or parallelization instead).
2. **Update stack versions**: React 19, React Router v7 (and drop the lazy/Suspense + Context API claims or implement them).
3. **Reframe RO6/FR6**: from "switchable SQLite/Supabase" to "Repository Pattern with a Supabase adapter; SQLite was used in development and migrated to Supabase via a documented migration path; the students repository remains source-switchable (DB vs live portal API)". Update 3.9/4.1.6 parity-probe description accordingly.
4. **Replace Appendix A** with the real `supabase_schema.sql` (incl. `student_results`, correct `audit_log`/`custom_fields`/`students` columns, `course_catalog` name) and fix Table 3.2.
5. **Correct 3.5.2/4.1.3** (server-side validate + ALNS re-optimization around the locked course — worth featuring, not hiding) and **3.5.3/4.1.4** (server-side personal filtering, carryover flagging, JIT provisioning; shared-secret header rather than per-request HMAC signature; 401 not 403; HMAC-signed session token rather than "JWT" — or say "JWT-style HMAC-SHA256 token").
6. **Fix the audit log description**: TEXT detail + IP address; searchable but currently non-paginated UI (or add pagination to the UI).
7. **Decide on Dashboard.jsx**: either route it (restoring the Course Catalogue + Custom Fields UIs to match the thesis) or soften the thesis claims about those two modules. Routing it is the smaller change and makes the thesis honest.
8. Update the exam/test scheduler descriptions (3.4.3) and EXAM_SLOTS format.
