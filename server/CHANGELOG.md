# Changelog

## 2026-02-18

### Venue seats terminology clarification

- UI (`client/src/components/AdminManager.jsx`)
  - Venue input placeholder updated to `Capacity (number of seats)`.
  - Helper text added: `Enter total seats for this venue.`
  - Venue list label updated from `Cap:` to `Seats:`.

- API (`server/index.js`)
  - `POST /api/admin/venues` and `PUT /api/admin/venues/:id` now accept `seats` (preferred) and `capacity` (legacy).
  - If both `seats` and `capacity` are provided, `seats` is used.
  - `GET /api/admin/venues` and `GET /api/options` now include `seats` in venue records while preserving `capacity` for backward compatibility.

- Documentation
  - Compatibility note added to `server/SUPABASE_STAGING_RUNBOOK.md`.
  - Compatibility note added to `server/SUPABASE_MIGRATION_BLUEPRINT.md`.
