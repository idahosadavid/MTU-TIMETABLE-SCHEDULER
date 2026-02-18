# MTU Production Integration (studentportal.mtu.edu.ng)

This is the exact production integration sequence for studentportal.mtu.edu.ng.

Recent changes: see `server/CHANGELOG.md`.

## 1) Architecture at MTU

- MTU portal keeps primary authentication and session management.
- Timetable app receives only a secure handoff from MTU portal backend.
- Browser never receives MTU shared secret.

Recommended hosting paths:

- Frontend: https://studentportal.mtu.edu.ng/timetable
- API: https://studentportal.mtu.edu.ng/timetable-api/api

## 2) Request Flow (Exact)

1. Student logs in at https://studentportal.mtu.edu.ng
2. Student clicks View Timetable on MTU portal
3. MTU portal backend calls:
   - POST /student/portal/authorize on timetable API
   - header x-mtu-portal-secret
   - body with matric_number from MTU session
4. Timetable API returns one-time portal_code
5. MTU backend redirects student browser to:
   - /timetable/student?portal_code=<one_time_code>
6. Frontend exchanges code at:
   - POST /student/portal/exchange
7. Frontend receives short-lived bearer token and calls:
   - GET /student/:matric_number/timetable
8. API verifies token+matric and returns personalized schedule with carryovers (is_carryover=true)

## 3) Timetable API Environment

In server .env (timetable backend):

- DB_PROVIDER=supabase
- SUPABASE_URL=...
- SUPABASE_SERVICE_ROLE_KEY=...
- MTU_STUDENT_AUTH_MODE=portal-token
- MTU_PORTAL_SHARED_SECRET=<same value used by MTU portal backend>
- MTU_PORTAL_SESSION_SECRET=<strong signing secret>
- MTU_PORTAL_CODE_TTL_SECONDS=120

## 4) MTU Portal Backend Environment

In MTU portal backend env:

- TIMETABLE_API_BASE_URL=https://studentportal.mtu.edu.ng/timetable-api/api
- MTU_PORTAL_SHARED_SECRET=<same value as timetable backend>
- PORTAL_BASE_URL=https://studentportal.mtu.edu.ng

## 5) Backend Handler Example

Use this file as a direct template:

- server/examples/mtu_portal_express_handler.example.js

Required adaptation in MTU codebase:

- Replace req.user.matricNumber with your real MTU session user field.
- Wire route to the UI action behind View Timetable button.

## 6) Security Rules

- Use HTTPS only.
- Keep MTU_PORTAL_SHARED_SECRET on backend only.
- Rotate shared secret periodically.
- Keep portal code TTL short (60-180 seconds).
- Keep timetable token TTL short (already enforced by timetable backend).

## 7) Validation Before Go-Live

From timetable server:

- npm run verify:portal-student
- Expected output includes PORTAL_STUDENT_CARRYOVER_OK

From MTU portal staging:

- Login as student with known carryover course
- Click View Timetable
- Confirm redirect URL shape uses portal_code only
- Confirm returned timetable includes carryover row(s)

## 8) Failure Handling on MTU Portal

If authorize API returns non-200:

- Do not redirect
- Show user message: Timetable service temporarily unavailable
- Log response status/body in MTU backend logs for support
