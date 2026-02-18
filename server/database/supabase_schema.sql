-- MTU Timetable App - Initial Supabase/Postgres Schema
-- Apply this in Supabase SQL Editor before setting DB_PROVIDER=supabase

create table if not exists public.colleges (
    id bigint generated always as identity primary key,
    code text not null unique,
    name text not null,
    is_active boolean not null default true,
    created_at timestamptz not null default now()
);

create table if not exists public.departments (
    id bigint generated always as identity primary key,
    code text not null unique,
    name text not null,
    college_code text not null references public.colleges(code) on delete cascade,
    is_active boolean not null default true,
    created_at timestamptz not null default now()
);

create table if not exists public.lecturers (
    id bigint generated always as identity primary key,
    name text not null,
    department_code text references public.departments(code) on delete set null,
    email text,
    created_at timestamptz not null default now()
);

create table if not exists public.venues (
    id bigint generated always as identity primary key,
    name text not null unique,
    college_code text references public.colleges(code) on delete set null,
    capacity integer not null default 0,
    created_at timestamptz not null default now()
);

create table if not exists public.scheduling_rules (
    id bigint generated always as identity primary key,
    name text not null,
    rule_key text not null unique,
    rule_value text not null,
    is_active boolean not null default true,
    created_at timestamptz not null default now()
);

create table if not exists public.timetables (
    id bigint generated always as identity primary key,
    type text not null,
    name text,
    academic_session text,
    semester text,
    status text not null default 'Draft',
    data jsonb not null default '{"scheduled":[],"unscheduled":[]}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    college text
);

create table if not exists public.courses (
    id bigint generated always as identity primary key,
    code text not null,
    title text not null,
    college text,
    department text not null,
    level integer not null,
    lecturers jsonb not null default '[]'::jsonb,
    units integer not null,
    semester text not null,
    type text not null,
    is_compulsory boolean not null default false,
    preferred_day text,
    preferred_time text,
    venue text,
    duration integer,
    student_count integer,
    custom_data jsonb not null default '{}'::jsonb,
    timetable_id bigint references public.timetables(id) on delete cascade
);

alter table public.courses
    add column if not exists is_compulsory boolean not null default false;

create table if not exists public.custom_fields (
    id bigint generated always as identity primary key,
    name text not null unique,
    label text not null,
    type text not null,
    required boolean not null default false
);

create table if not exists public.students (
    id bigint generated always as identity primary key,
    matric_number text not null unique,
    name text not null,
    department text not null,
    level integer not null
);

create table if not exists public.student_courses (
    id bigint generated always as identity primary key,
    student_matric text not null references public.students(matric_number) on delete cascade,
    course_code text not null,
    status text not null
);

create table if not exists public.student_results (
    id bigint generated always as identity primary key,
    student_matric text not null references public.students(matric_number) on delete cascade,
    course_code text not null,
    score integer,
    grade text,
    remarks text,
    session text
);

create index if not exists idx_courses_timetable_id on public.courses (timetable_id);
create index if not exists idx_courses_code on public.courses (code);
create index if not exists idx_courses_scope on public.courses (college, department, level, semester, type);
create index if not exists idx_timetables_type_updated on public.timetables (type, updated_at desc);
create index if not exists idx_timetables_college_updated on public.timetables (college, updated_at desc);
create index if not exists idx_student_courses_lookup on public.student_courses (student_matric, status);
create index if not exists idx_student_results_lookup on public.student_results (student_matric);
create index if not exists idx_departments_college_code on public.departments (college_code);
create index if not exists idx_venues_college_code on public.venues (college_code);

insert into public.colleges (code, name)
values
    ('CBAS', 'College of Basic and Applied Sciences'),
    ('CHMS', 'College of Humanities and Management Sciences'),
    ('CAHS', 'College of Allied Health Sciences')
on conflict (code) do nothing;

insert into public.departments (code, name, college_code)
values
    ('CSC', 'Computer Science', 'CBAS'),
    ('MTH', 'Mathematics', 'CBAS'),
    ('STA', 'Statistics', 'CBAS')
on conflict (code) do nothing;

insert into public.scheduling_rules (name, rule_key, rule_value, is_active)
values
    ('Maximum Daily Hours Per Level', 'max_daily_hours_per_level', '6', true),
    ('Default Start Hour', 'default_start_hour', '9', true),
    ('Default End Hour', 'default_end_hour', '18', true),
    ('Prefer Compulsory Courses First', 'prioritize_core_courses', 'true', true)
on conflict (rule_key) do nothing;
