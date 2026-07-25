-- Enable Row-Level Security on all public tables.
-- Run this in the Supabase SQL Editor for an existing project.
-- The server connects with the service_role key (see supabaseAdapter.js),
-- which bypasses RLS automatically, so no policies are required for the
-- app to keep working. This only blocks the anon/authenticated roles that
-- Supabase's advisor flagged as having unrestricted access.

alter table public.colleges enable row level security;
alter table public.departments enable row level security;
alter table public.lecturers enable row level security;
alter table public.venues enable row level security;
alter table public.scheduling_rules enable row level security;
alter table public.timetables enable row level security;
alter table public.courses enable row level security;
alter table public.custom_fields enable row level security;
alter table public.students enable row level security;
alter table public.student_courses enable row level security;
alter table public.student_results enable row level security;
alter table public.audit_log enable row level security;
alter table public.timetable_courses enable row level security;
