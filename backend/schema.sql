-- Run this ONCE in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Creates the tables and seeds the demo classroom (room code DEMO123). Safe to re-run:
-- tables use IF NOT EXISTS and the seed rows use ON CONFLICT DO NOTHING.
--
-- The backend talks to Supabase with the service-role key, which bypasses row level security.
-- RLS is enabled with no policies so the public anon key can read/write nothing.

create table if not exists classrooms (
  id        text primary key,
  name      text not null,
  room_code text not null unique
);

create table if not exists users (
  id           text primary key,
  name         text not null,
  role         text not null check (role in ('student', 'teacher')),
  classroom_id text not null references classrooms(id),
  created_at   timestamptz not null default now()
);
-- One user per (classroom, name, role); names compare case-insensitively.
create unique index if not exists users_classroom_name_role_key
  on users (classroom_id, lower(name), role);

create table if not exists modules (
  id           text primary key,
  classroom_id text not null references classrooms(id),
  title        text not null,
  content      text not null,
  created_at   timestamptz not null default now()  -- list order
);

create table if not exists progress (
  id         text primary key,
  student_id text not null references users(id),
  module_id  text not null references modules(id) on delete cascade,
  status     text not null check (status in ('not_started', 'in_progress', 'completed')),
  unique (student_id, module_id)
);

create table if not exists comments (
  id         text primary key,
  student_id text not null references users(id),
  module_id  text not null references modules(id) on delete cascade,
  text       text not null,
  created_at timestamptz not null default now()
);

alter table classrooms enable row level security;
alter table users      enable row level security;
alter table modules    enable row level security;
alter table progress   enable row level security;
alter table comments   enable row level security;

-- ---------- Seed: 1 classroom, 1 teacher, 2 students, 2 modules ----------

insert into classrooms (id, name, room_code)
values ('classroom-demo', 'Demo Classroom', 'DEMO123')
on conflict do nothing;

insert into users (id, name, role, classroom_id) values
  ('teacher-1', 'Ms. Rivera', 'teacher', 'classroom-demo'),
  ('student-1', 'Alex',       'student', 'classroom-demo'),
  ('student-2', 'Sam',        'student', 'classroom-demo')
on conflict do nothing;

insert into modules (id, classroom_id, title, content, created_at) values
  ('module-1', 'classroom-demo', 'Variables and Types',
   E'# Variables and Types\n\nDeclare a variable with `let` or `const`. Try printing the sum of two numbers.',
   now()),
  ('module-2', 'classroom-demo', 'Loops',
   E'# Loops\n\nUse a `for` loop to print the numbers 1 through 5.',
   now() + interval '1 second')
on conflict do nothing;
