# MTU Portal Integration Contract

This document defines the current integration path between Mountain Top University student portal and the timetable app.

Recent changes: see `server/CHANGELOG.md`.

## Integration Modes

Set in server environment:

- `MTU_STUDENT_AUTH_MODE=legacy` (default): existing matric-number login remains enabled.
- `MTU_STUDENT_AUTH_MODE=portal-token`: direct student login is disabled; timetable access requires portal-issued token.

Required secrets for `portal-token` mode:

- `MTU_PORTAL_SHARED_SECRET`: shared secret used by MTU portal backend when requesting session tokens.
- `MTU_PORTAL_SESSION_SECRET`: HMAC signing secret for student session token generation/verification.

## Endpoints

### 1) Request One-Time Portal Code (Portal Backend Only, Recommended)

`POST /api/student/portal/authorize`

Headers:

- `Content-Type: application/json`
- `x-mtu-portal-secret: <MTU_PORTAL_SHARED_SECRET>`

Body:

```json
{
	"matric_number": "MTU/2023/001"
}
```

Response:

```json
{
	"data": {
		"matric_number": "MTU/2023/001",
		"portal_code": "<one_time_code>",
		"expires_at": 1760000000,
		"token_exchange_path": "/api/student/portal/exchange"
	}
}
```

### 2) Exchange One-Time Portal Code (Frontend)

`POST /api/student/portal/exchange`

Body:

```json
{
	"portal_code": "<one_time_code>"
}
```

Response:

```json
{
	"data": {
		"matric_number": "MTU/2023/001",
		"token": "<signed_token>",
		"token_type": "Bearer",
		"expires_at": 1760000000
	}
}
```

### 3) Create Student Session Token (Portal Backend Only, Legacy Fallback)

`POST /api/student/portal/session`

Headers:

- `Content-Type: application/json`
- `x-mtu-portal-secret: <MTU_PORTAL_SHARED_SECRET>`

Body:

```json
{
	"matric_number": "MTU/2023/001",
	"ttl_seconds": 1800
}
```

Response:

```json
{
	"data": {
		"matric_number": "MTU/2023/001",
		"token": "<signed_token>",
		"token_type": "Bearer",
		"expires_at": 1760000000
	}
}
```

### 4) Fetch Student Timetable

`GET /api/student/:matric_number/timetable`

- In `legacy` mode: behaves as before.
- In `portal-token` mode: requires `Authorization: Bearer <signed_token>` and token subject must match `:matric_number`.

Response shape (unchanged):

```json
{
	"student": { "matric_number": "MTU/2023/001", "name": "John Doe" },
	"timetable": {
		"id": 1,
		"type": "Lecture",
		"data": {
			"scheduled": [],
			"unscheduled": []
		}
	}
}
```

### 5) Direct Student Login (Legacy Only)

`POST /api/student/login`

- Enabled only when `MTU_STUDENT_AUTH_MODE=legacy`.
- Returns `403` when mode is `portal-token`.

## Portal Redirect Pattern

Preferred hardened redirect:

`/student?portal_code=<one_time_code>`

Legacy fallback redirect:

`/student?matric=<matric_number>&mtu_token=<signed_token>`

The app exchanges one-time code for a short-lived token, then auto-loads personalized timetable.

## Environment Templates

Use:

- `server/.env.example`
- `client/.env.example`

Minimum backend settings for portal integration:

- `MTU_STUDENT_AUTH_MODE=portal-token`
- `MTU_PORTAL_SHARED_SECRET=<shared secret between MTU portal backend and timetable API>`
- `MTU_PORTAL_SESSION_SECRET=<HMAC signing secret>`
- `MTU_PORTAL_CODE_TTL_SECONDS=120`

Frontend setting:

- `VITE_API_BASE_URL=http://localhost:5000/api` (or deployed API URL)

## Sample Portal Backend Request

Use included script:

- `server/scripts/sample_mtu_portal_session_request.js`
- `server/scripts/sample_mtu_portal_authorize_request.js`

Run from `server` folder:

```bash
MTU_PORTAL_SHARED_SECRET=<secret> npm run portal:sample-session
MTU_PORTAL_SHARED_SECRET=<secret> npm run portal:sample-authorize
```

Optional variables:

- `TIMETABLE_API_BASE_URL` (default: `http://localhost:5000/api`)
- `MTU_PORTAL_SAMPLE_MATRIC` (default: `MTU/2023/001`)
- `MTU_PORTAL_SAMPLE_TTL` (default: `1800`)

## Recommended Rollout

1. Deploy backend with `MTU_STUDENT_AUTH_MODE=legacy` and both secrets configured.
2. Integrate MTU portal backend to call `/api/student/portal/session`.
3. Integrate MTU portal backend to call `/api/student/portal/authorize` and redirect with `/student?portal_code=...`.
4. Verify hardened redirect flow in staging.
5. Keep `/api/student/portal/session` only as fallback during transition.
6. Switch to `MTU_STUDENT_AUTH_MODE=portal-token` after validation.