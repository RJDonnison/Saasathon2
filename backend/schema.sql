-- Run in the Supabase SQL editor. It is safe to reapply for the current model.
-- Upgrade from the original hackathon schema: this script preserves users, modules
-- and module progress, creates memberships from legacy user classroom/role values,
-- and replaces legacy module comments (they cannot be truthfully retargeted to a
-- submission). Back up comments first if that historical data matters.

create table if not exists classrooms (id text primary key, name text not null, room_code text not null unique);
create table if not exists users (id text primary key, name text not null, created_at timestamptz not null default now());

-- Compatibility upgrade from the former users(classroom_id, role) design.
create table if not exists memberships (
  id text primary key, user_id text not null references users(id) on delete cascade,
  classroom_id text not null references classrooms(id) on delete cascade,
  role text not null check (role in ('student','teacher')), created_at timestamptz not null default now(),
  unique (user_id, classroom_id)
);
do $$ begin
  if exists (select 1 from information_schema.columns where table_name='users' and column_name='classroom_id') then
    insert into memberships (id, user_id, classroom_id, role)
    select 'membership-' || id || '-' || classroom_id, id, classroom_id, role from users
    on conflict (user_id, classroom_id) do nothing;
    drop index if exists users_classroom_name_role_key;
    alter table users drop column if exists role;
    alter table users drop column if exists classroom_id;
  end if;
end $$;
create unique index if not exists memberships_classroom_name_role_key
  on memberships (classroom_id, role, user_id);

create table if not exists modules (
  id text primary key, classroom_id text not null references classrooms(id) on delete cascade,
  title text not null, content text not null default '', description text not null default '', overview text not null default '', state text not null default 'draft' check (state in ('draft','published')), position integer not null default 0,
  created_at timestamptz not null default now()
);
alter table modules add column if not exists position integer not null default 0;
alter table modules alter column content set default '';
alter table modules add column if not exists description text not null default '';
alter table modules add column if not exists overview text not null default '';
alter table modules add column if not exists state text not null default 'draft' check (state in ('draft','published'));

create table if not exists sections (
  id text primary key, module_id text not null references modules(id) on delete cascade,
  title text not null, position integer not null default 0
);
create table if not exists section_blocks (
  id text primary key, section_id text not null references sections(id) on delete cascade,
  type text not null, content jsonb not null, position integer not null default 0
);
create table if not exists questions (
  id text primary key, section_id text not null references sections(id) on delete cascade,
  prompt text not null, kind text not null check (kind in ('mcq','short','code')),
  answer_key text, position integer not null default 0
);
create table if not exists question_options (
  id text primary key, question_id text not null references questions(id) on delete cascade,
  text text not null, position integer not null default 0
);
create table if not exists code_exercises (
  id text primary key, question_id text not null unique references questions(id) on delete cascade,
  language text not null, starter_code text not null default '', instructions text not null default ''
);
create table if not exists reference_answers (
  id text primary key, code_exercise_id text not null references code_exercises(id) on delete cascade,
  title text not null, answer text not null, position integer not null default 0
);
create table if not exists code_checks (
  id text primary key, code_exercise_id text not null references code_exercises(id) on delete cascade,
  name text not null, description text not null, position integer not null default 0
);
create table if not exists code_hints (
  id text primary key, code_exercise_id text not null references code_exercises(id) on delete cascade,
  text text not null, position integer not null default 0
);

-- The old comments table has no submission target, so remove its rows during upgrade.
do $$ begin
  if exists (select 1 from information_schema.columns where table_name='comments' and column_name='module_id') then
    drop table comments;
  end if;
end $$;
create table if not exists module_progress (
  id text primary key, student_id text not null references users(id), module_id text not null references modules(id) on delete cascade,
  status text not null check (status in ('not_started','in_progress','completed')),
  updated_at timestamptz not null default now(), unique(student_id,module_id)
);
-- Preserve old progress rows when upgrading.
do $$ begin
  if exists (select 1 from information_schema.tables where table_name='progress') then
    insert into module_progress (id, student_id, module_id, status)
    select id, student_id, module_id, status from progress on conflict (student_id,module_id) do nothing;
    drop table progress;
  end if;
end $$;
create table if not exists section_progress (
  id text primary key, student_id text not null references users(id), section_id text not null references sections(id) on delete cascade,
  status text not null check (status in ('not_started','in_progress','completed')),
  updated_at timestamptz not null default now(), unique(student_id,section_id)
);
create table if not exists attempts (
  id text primary key, student_id text not null references users(id), question_id text not null references questions(id) on delete cascade,
  answer text not null, is_correct boolean, created_at timestamptz not null default now()
);
create table if not exists code_submissions (
  id text primary key, student_id text not null references users(id), code_exercise_id text not null references code_exercises(id) on delete cascade,
  code text not null, stdout text not null default '', stderr text not null default '', passed boolean, created_at timestamptz not null default now()
);
create table if not exists comments (
  id text primary key, submission_id text not null references code_submissions(id) on delete cascade,
  author_id text not null references users(id), text text not null,
  line_start integer, line_end integer, created_at timestamptz not null default now(),
  check (line_start is null or line_start > 0), check (line_end is null or line_end >= line_start)
);

alter table classrooms enable row level security; alter table users enable row level security;
alter table memberships enable row level security; alter table modules enable row level security;
alter table sections enable row level security; alter table section_blocks enable row level security;
alter table questions enable row level security; alter table question_options enable row level security;
alter table code_exercises enable row level security; alter table reference_answers enable row level security;
alter table code_checks enable row level security; alter table module_progress enable row level security;
alter table code_hints enable row level security;
alter table section_progress enable row level security; alter table attempts enable row level security;
alter table code_submissions enable row level security; alter table comments enable row level security;

-- Demo: a complete small lesson with authored answers/checks and student activity.
insert into classrooms values ('classroom-demo','Demo Classroom','DEMO123') on conflict do nothing;
insert into users (id,name) values ('teacher-1','Ms. Rivera'),('student-1','Alex'),('student-2','Sam') on conflict do nothing;
insert into memberships (id,user_id,classroom_id,role) values
 ('membership-teacher-1','teacher-1','classroom-demo','teacher'),('membership-student-1','student-1','classroom-demo','student'),('membership-student-2','student-2','classroom-demo','student') on conflict do nothing;
insert into modules (id,classroom_id,title,content,description,overview,state,position) values ('module-1','classroom-demo','Variables and Types','An introduction to JavaScript variables.','Learn JavaScript variables.','Read, practice, and submit an add function.','published',1) on conflict do nothing;
insert into sections values ('section-1','module-1','Variables',1),('section-2','module-1','Practice',2) on conflict do nothing;
insert into section_blocks values ('block-1','section-1','markdown','"Use const for values that do not change."',1) on conflict do nothing;
insert into questions values ('question-1','section-1','Which keyword declares a block-scoped variable?','mcq','let',1),('question-2','section-1','What is the type of true?','short','boolean',2),('question-3','section-2','Write a function that adds two numbers.','code',null,1) on conflict do nothing;
insert into question_options values ('option-1','question-1','var',1),('option-2','question-1','let',2),('option-3','question-1','goto',3) on conflict do nothing;
insert into code_exercises values ('exercise-1','question-3','javascript','function add(a, b) {\n  // your code\n}','Return the sum of a and b.') on conflict do nothing;
insert into reference_answers values ('reference-1','exercise-1','Concise solution','function add(a, b) { return a + b; }',1),('reference-2','exercise-1','Arrow function','const add = (a, b) => a + b;',2) on conflict do nothing;
insert into code_checks values ('check-1','exercise-1','Adds positives','add(2, 3) returns 5',1),('check-2','exercise-1','Adds negatives','add(-2, 3) returns 1',2) on conflict do nothing;
insert into code_hints values ('hint-1','exercise-1','Use the + operator.',1) on conflict do nothing;
insert into module_progress values ('module-progress-1','student-1','module-1','in_progress',now()) on conflict do nothing;
insert into section_progress values ('section-progress-1','student-1','section-1','completed',now()) on conflict do nothing;
insert into attempts values ('attempt-1','student-1','question-1','let',true,now()) on conflict do nothing;
insert into code_submissions values ('submission-1','student-1','exercise-1','function add(a, b) { return a + b; }','5\n','',true,now()) on conflict do nothing;
insert into comments values ('comment-1','submission-1','teacher-1','Nice use of a direct return.',1,1,now()) on conflict do nothing;
