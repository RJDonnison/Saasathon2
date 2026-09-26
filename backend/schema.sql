-- Run in the Supabase SQL editor. It is safe to reapply for the current model.
-- Upgrade from the original hackathon schema: this script preserves users, modules
-- and module progress, creates memberships from legacy user classroom/role values,
-- and replaces legacy module comments (they cannot be truthfully retargeted to a
-- submission). Back up comments first if that historical data matters.

create table if not exists classrooms (id text primary key, name text not null);
-- Join codes are gone: teachers create classrooms and invite students, who accept.
alter table classrooms drop column if exists room_code;
create table if not exists users (id text primary key, name text not null, created_at timestamptz not null default now());
alter table users add column if not exists email text;
create index if not exists users_email_idx on users (email);

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

-- Teacher invitations, addressed to a Google email. Inviting enrols nobody: the student sees the invitation after
-- signing in and accepts (creates the student membership) or declines. One row per (classroom, email).
create table if not exists classroom_invitations (
  id text primary key,
  classroom_id text not null references classrooms(id) on delete cascade,
  email text not null,
  student_name text,
  invited_by text not null references users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  user_id text references users(id) on delete set null,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (classroom_id, email)
);
create index if not exists classroom_invitations_email_idx on classroom_invitations (email, status);

-- One-time upgrade from the former auto-enrolling email roster (classroom_assignments): already-enrolled students
-- become accepted invitations and unclaimed emails become pending ones. The old table is then unused; drop it
-- yourself once you are happy with the result.
do $$ begin
  if to_regclass('public.classroom_assignments') is not null then
    insert into classroom_invitations (id, classroom_id, email, student_name, invited_by, status, user_id, created_at, responded_at)
    select id, classroom_id, email, student_name, assigned_by,
           case when student_id is null then 'pending' else 'accepted' end,
           student_id, created_at, case when student_id is null then null else created_at end
    from classroom_assignments
    on conflict (classroom_id, email) do nothing;
  end if;
end $$;

-- Teacher notes to the class, shown to students on their dashboard and class page.
create table if not exists classroom_announcements (
  id text primary key,
  classroom_id text not null references classrooms(id) on delete cascade,
  author_id text not null references users(id) on delete cascade,
  text text not null check (length(text) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists classroom_announcements_classroom_idx on classroom_announcements (classroom_id, created_at desc);

-- The live lesson: a teacher starts a lesson for the class, moves it on, and ends it. One live session per classroom.
create table if not exists lesson_sessions (
  id text primary key,
  classroom_id text not null references classrooms(id) on delete cascade,
  module_id text not null references modules(id) on delete cascade,
  phase text not null default 'teach' check (phase in ('teach','work')),
  started_by text not null references users(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create unique index if not exists lesson_sessions_one_live on lesson_sessions (classroom_id) where ended_at is null;

create table if not exists modules (
  id text primary key, classroom_id text not null references classrooms(id) on delete cascade,
  title text not null, content text not null default '', position integer not null default 0,
  created_at timestamptz not null default now(), status text not null default 'published' check (status in ('draft','published')),
  revision integer not null default 0
);
-- Earlier deployed versions named this column publication_status and required revisions to start at 1.
-- The builder contract uses status and creates documents at revision 0.
do $$ begin
  if not exists (select 1 from information_schema.columns where table_name = 'modules' and column_name = 'status')
    and exists (select 1 from information_schema.columns where table_name = 'modules' and column_name = 'publication_status') then
    alter table modules rename column publication_status to status;
  end if;
end $$;
alter table modules add column if not exists position integer not null default 0;
alter table modules alter column content set default '';
alter table modules add column if not exists status text not null default 'published' check (status in ('draft','published'));
alter table modules add column if not exists revision integer not null default 0;
alter table modules alter column status set default 'published';
alter table modules alter column revision set default 0;
alter table modules drop constraint if exists modules_revision_check;
alter table modules add constraint modules_revision_check check (revision >= 0);

-- Classroom collaboration tables already present in the deployed project.
create table if not exists classroom_invitations (
  id text primary key, classroom_id text not null references classrooms(id) on delete cascade,
  email text not null, student_name text, invited_by text not null references users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  user_id text references users(id) on delete set null, created_at timestamptz not null default now(),
  responded_at timestamptz, unique (classroom_id, email)
);
create index if not exists classroom_invitations_email_idx on classroom_invitations (email, status);

create table if not exists classroom_announcements (
  id text primary key, classroom_id text not null references classrooms(id) on delete cascade,
  author_id text not null references users(id) on delete cascade,
  text text not null check (length(text) between 1 and 1000), created_at timestamptz not null default now()
);
create index if not exists classroom_announcements_classroom_idx on classroom_announcements (classroom_id, created_at desc);

create table if not exists lesson_sessions (
  id text primary key, classroom_id text not null references classrooms(id) on delete cascade,
  module_id text not null references modules(id) on delete cascade,
  phase text not null default 'teach' check (phase in ('teach','work')),
  started_by text not null references users(id) on delete cascade,
  started_at timestamptz not null default now(), ended_at timestamptz
);
create unique index if not exists lesson_sessions_one_live on lesson_sessions (classroom_id) where ended_at is null;

create table if not exists help_requests (
  id text primary key, classroom_id text not null references classrooms(id) on delete cascade,
  student_id text not null references users(id) on delete cascade,
  module_id text not null references modules(id) on delete cascade,
  message text not null default '' check (char_length(message) <= 500),
  raised_at timestamptz not null default now(), cleared_at timestamptz,
  cleared_by text references users(id)
);
create unique index if not exists help_requests_one_active_per_student
  on help_requests (classroom_id, student_id) where cleared_at is null;
create index if not exists help_requests_active_classroom
  on help_requests (classroom_id, raised_at desc) where cleared_at is null;
create index if not exists help_requests_module_idx on help_requests (module_id);
create index if not exists help_requests_cleared_by_idx on help_requests (cleared_by) where cleared_by is not null;

create table if not exists classroom_event_cursors (
  classroom_id text primary key references classrooms(id) on delete cascade,
  next_cursor bigint not null default 1 check (next_cursor > 0)
);
create table if not exists classroom_events (
  classroom_id text not null references classrooms(id) on delete cascade,
  cursor bigint not null, event_type text not null, payload jsonb not null,
  created_at timestamptz not null default now(), primary key (classroom_id, cursor)
);
create index if not exists classroom_events_replay_idx on classroom_events (classroom_id, cursor);
create index if not exists classroom_events_retention_idx on classroom_events (created_at);

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
  prompt text not null, kind text not null check (kind in ('mcq','short','code','math')),
  answer_key text, math_expected_result double precision, math_tolerance double precision, position integer not null default 0
);
-- This is the canonical sequence used by new module-builder reads. It allows blocks and
-- questions to be truly interleaved while leaving the old per-table positions compatible.
create table if not exists section_items (
  id text primary key, section_id text not null references sections(id) on delete cascade,
  item_type text not null check (item_type in ('block','question')), item_id text not null,
  position integer not null, unique(section_id, item_type, item_id), unique(section_id, position)
);
-- Convert the original typed foreign-key representation to the generic item reference used by the builder.
do $$
declare constraint_name text;
begin
  if exists (select 1 from information_schema.columns where table_name = 'section_items' and column_name = 'kind') then
    alter table section_items add column if not exists item_type text;
    alter table section_items add column if not exists item_id text;
    update section_items
      set item_type = kind,
          item_id = case when kind = 'block' then block_id else question_id end
      where item_type is null or item_id is null;
    alter table section_items alter column item_type set not null;
    alter table section_items alter column item_id set not null;
    for constraint_name in
      select conname
      from pg_constraint
      where conrelid = 'section_items'::regclass
        and (contype = 'c' or conkey && array[
          (select attnum from pg_attribute where attrelid = 'section_items'::regclass and attname = 'kind'),
          (select attnum from pg_attribute where attrelid = 'section_items'::regclass and attname = 'block_id'),
          (select attnum from pg_attribute where attrelid = 'section_items'::regclass and attname = 'question_id')
        ]::smallint[])
    loop
      execute format('alter table section_items drop constraint %I', constraint_name);
    end loop;
    alter table section_items drop column kind, drop column block_id, drop column question_id;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'section_items'::regclass and conname = 'section_items_item_type_check') then
    alter table section_items add constraint section_items_item_type_check check (item_type in ('block','question'));
  end if;
end $$;
create unique index if not exists section_items_section_item_key on section_items (section_id, item_type, item_id);
create unique index if not exists section_items_section_position_key on section_items (section_id, position);
-- Deterministic legacy backfill: old blocks first, then old questions, each by legacy position/id.
insert into section_items (id, section_id, item_type, item_id, position)
select 'legacy-block-' || b.id, b.section_id, 'block', b.id,
       row_number() over (partition by b.section_id order by b.position, b.id) - 1
from section_blocks b on conflict (section_id, item_type, item_id) do nothing;
insert into section_items (id, section_id, item_type, item_id, position)
select 'legacy-question-' || q.id, q.section_id, 'question', q.id,
       coalesce((select max(position) + 1 from section_items i where i.section_id=q.section_id), 0) +
       row_number() over (partition by q.section_id order by q.position, q.id) - 1
from questions q on conflict (section_id, item_type, item_id) do nothing;
-- Upgrade the original kind check and add the math configuration constraints.
alter table questions drop constraint if exists questions_kind_check;
alter table questions add column if not exists math_expected_result double precision;
alter table questions add column if not exists math_tolerance double precision;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'questions_kind_check') then
    alter table questions add constraint questions_kind_check check (kind in ('mcq','short','code','math'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'questions_math_configuration_check') then
    alter table questions add constraint questions_math_configuration_check check (
      (kind = 'math' and math_expected_result is not null and math_tolerance is not null and math_tolerance >= 0)
      or (kind <> 'math' and math_expected_result is null and math_tolerance is null)
    );
  end if;
end $$;
create table if not exists question_options (
  id text primary key, question_id text not null references questions(id) on delete cascade,
  text text not null, position integer not null default 0
);
create table if not exists code_exercises (
  id text primary key, question_id text not null unique references questions(id) on delete cascade,
  language text not null, starter_code text not null default '', instructions text not null default '',
  function_name text not null default '', hidden_code text not null default ''
);
alter table code_exercises add column if not exists function_name text not null default '';
create table if not exists code_tests (
  id text primary key, code_exercise_id text not null references code_exercises(id) on delete cascade,
  name text not null default 'Untitled check', args jsonb not null, expected jsonb not null, position integer not null default 0
);
alter table code_tests add column if not exists name text not null default 'Untitled check';
create index if not exists code_tests_exercise_position_idx on code_tests (code_exercise_id, position, id);
-- Existing projects have this table already, so the additive upgrade must follow the create statement.
alter table code_exercises add column if not exists hidden_code text not null default '';
create table if not exists code_checks (
  id text primary key, code_exercise_id text not null references code_exercises(id) on delete cascade,
  name text not null, description text not null, position integer not null default 0
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
-- Persistent drafts and live location/activity let teachers see progress across reloads and reconnects.
create table if not exists student_work (
  id text primary key, student_id text not null references users(id) on delete cascade,
  question_id text not null references questions(id) on delete cascade,
  answer text, code text, is_correct boolean, checked_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(student_id, question_id), check (answer is not null or code is not null)
);
alter table student_work add column if not exists is_correct boolean;
alter table student_work add column if not exists checked_at timestamptz;
create table if not exists student_activities (
  id text primary key, student_id text not null references users(id) on delete cascade,
  classroom_id text not null references classrooms(id) on delete cascade,
  module_id text not null references modules(id) on delete cascade,
  section_id text references sections(id) on delete cascade,
  question_id text references questions(id) on delete cascade,
  type text not null check (type in ('viewing_lesson','answering_question','checking_answer','writing_code','running_code','checking_code')),
  created_at timestamptz not null default now()
);
create index if not exists student_activities_student_created_idx on student_activities (student_id, created_at desc);
create table if not exists student_activity_state (
  student_id text primary key references users(id) on delete cascade,
  classroom_id text not null references classrooms(id) on delete cascade,
  module_id text not null references modules(id) on delete cascade,
  section_id text references sections(id) on delete cascade,
  question_id text references questions(id) on delete cascade,
  type text not null check (type in ('viewing_lesson','answering_question','checking_answer','writing_code','running_code','checking_code')),
  updated_at timestamptz not null default now()
);
create table if not exists comments (
  id text primary key, submission_id text not null references code_submissions(id) on delete cascade,
  author_id text not null references users(id), text text not null,
  line_start integer, line_end integer, created_at timestamptz not null default now(),
  check (line_start is null or line_start > 0), check (line_end is null or line_end >= line_start)
);
create table if not exists question_comments (
  id text primary key, question_id text not null references questions(id) on delete cascade,
  student_id text not null references users(id) on delete cascade,
  author_id text not null references users(id) on delete cascade, text text not null,
  created_at timestamptz not null default now()
);
create index if not exists question_comments_question_created_idx on question_comments (question_id, created_at);

alter table classrooms enable row level security; alter table users enable row level security;
alter table memberships enable row level security; alter table modules enable row level security;
alter table classroom_invitations enable row level security; alter table classroom_announcements enable row level security;
alter table lesson_sessions enable row level security; alter table help_requests enable row level security;
alter table classroom_event_cursors enable row level security; alter table classroom_events enable row level security;
alter table sections enable row level security; alter table section_blocks enable row level security;
alter table section_items enable row level security;
alter table questions enable row level security; alter table question_options enable row level security;
alter table code_exercises enable row level security;
alter table code_checks enable row level security; alter table module_progress enable row level security;
alter table code_tests enable row level security;
alter table section_progress enable row level security; alter table attempts enable row level security;
alter table code_submissions enable row level security; alter table comments enable row level security;
alter table question_comments enable row level security;
alter table student_work enable row level security; alter table student_activities enable row level security;
alter table student_activity_state enable row level security;

-- Demo: a complete small lesson with authored checks and student activity.
insert into classrooms (id, name) values ('classroom-demo','Demo Classroom') on conflict do nothing;
insert into users (id,name) values ('teacher-1','Ms. Rivera'),('student-1','Alex'),('student-2','Sam') on conflict do nothing;
insert into memberships (id,user_id,classroom_id,role) values
 ('membership-teacher-1','teacher-1','classroom-demo','teacher'),('membership-student-1','student-1','classroom-demo','student'),('membership-student-2','student-2','classroom-demo','student') on conflict do nothing;
insert into modules (id,classroom_id,title,content,position) values ('module-1','classroom-demo','Variables and Types','An introduction to JavaScript variables.',1) on conflict do nothing;
insert into sections values ('section-1','module-1','Variables',1),('section-2','module-1','Practice',2) on conflict do nothing;
insert into section_blocks values ('block-1','section-1','markdown','"Use const for values that do not change."',1) on conflict do nothing;
insert into questions values ('question-1','section-1','Which keyword declares a block-scoped variable?','mcq','let',1),('question-2','section-1','What is the type of true?','short','boolean',2),('question-3','section-2','Write a function that adds two numbers.','code',null,1) on conflict do nothing;
insert into question_options values ('option-1','question-1','var',1),('option-2','question-1','let',2),('option-3','question-1','goto',3) on conflict do nothing;
insert into code_exercises values ('exercise-1','question-3','javascript','function add(a, b) {\n  // your code\n}','Return the sum of a and b.','') on conflict do nothing;
insert into code_checks values ('check-1','exercise-1','Adds positives','add(2, 3) returns 5',1),('check-2','exercise-1','Adds negatives','add(-2, 3) returns 1',2) on conflict do nothing;
insert into module_progress values ('module-progress-1','student-1','module-1','in_progress',now()) on conflict do nothing;
insert into section_progress values ('section-progress-1','student-1','section-1','completed',now()) on conflict do nothing;
insert into attempts values ('attempt-1','student-1','question-1','let',true,now()) on conflict do nothing;
insert into code_submissions values ('submission-1','student-1','exercise-1','function add(a, b) { return a + b; }','5\n','',true,now()) on conflict do nothing;
insert into comments values ('comment-1','submission-1','teacher-1','Nice use of a direct return.',1,1,now()) on conflict do nothing;

-- ============================================================================
-- Example curriculum: Introduction to JavaScript (modules 2-6; module-1 is above).
-- Safe to reapply: every row is "on conflict do nothing", so teacher edits are never overwritten.
-- ============================================================================
-- Math MVP: a re-runnable authored lesson with inline and display LaTex.
insert into modules (id, classroom_id, title, content, position) values
  ('module-7', 'classroom-demo', 'Math expressions', 'Use arithmetic expressions to calculate a value.', 7)
on conflict do nothing;
insert into sections (id, module_id, title, position) values
  ('math-s1', 'module-7', 'Order of operations', 1)
on conflict do nothing;
insert into section_blocks (id, section_id, type, content, position) values
  ('math-b1', 'math-s1', 'markdown', '"Use parentheses to group an expression. For example, $2(3 + 4)$ means multiply 2 by the grouped result.\n\n$$\n2 \times (3 + 4) = 14\n$$"'::jsonb, 1)
on conflict do nothing;
insert into questions (id, section_id, prompt, kind, answer_key, math_expected_result, math_tolerance, position) values
  ('math-q1', 'math-s1', 'Evaluate $2 \times (3 + 4)$.', 'math', null, 14, 1e-9, 1)
on conflict do nothing;
insert into sections (id, module_id, title, position) values
  ('math-s2', 'module-7', 'What parentheses change', 2),
  ('math-s3', 'module-7', 'Your challenge', 3)
on conflict do nothing;
insert into section_blocks (id, section_id, type, content, position) values
  ('math-b2', 'math-s2', 'markdown', '"## Work from left to right\n\nMultiplication and division happen before addition and subtraction. Parentheses tell us to do the grouped part first.\n\n- $5 \times 4 + 2 = 22$ because $5 \times 4$ happens first.\n- $5 \times (4 + 2) = 30$ because the parentheses happen first."'::jsonb, 1),
  ('math-b3', 'math-s3', 'markdown', '"Take your time. Use parentheses to keep the steps clear."'::jsonb, 1)
on conflict do nothing;
insert into questions (id, section_id, prompt, kind, answer_key, math_expected_result, math_tolerance, position) values
  ('math-q2', 'math-s1', 'Evaluate $18 \div (3 + 3)$.', 'math', null, 3, 1e-9, 2),
  ('math-q3', 'math-s2', 'Evaluate $5 \times 4 + 2$.', 'math', null, 22, 1e-9, 1),
  ('math-q4', 'math-s2', 'Evaluate $5 \times (4 + 2)$.', 'math', null, 30, 1e-9, 2),
  ('math-q5', 'math-s3', 'Evaluate $(24 \div 6) \times (7 - 2)$.', 'math', null, 20, 1e-9, 1)
on conflict do nothing;

insert into modules (id, classroom_id, title, content, position) values
  ('module-2', 'classroom-demo', 'Functions', 'Functions let you name a piece of code so you can reuse it. In this module you will write functions that take inputs (parameters) and give back a result (a return value).', 2),
  ('module-3', 'classroom-demo', 'Making Decisions', 'Programs need to make choices. You will use comparisons and if / else statements to run different code in different situations.', 3),
  ('module-4', 'classroom-demo', 'Loops', 'Loops let the computer repeat work for you. You will learn for and while loops, and how to build up a result as you repeat.', 4),
  ('module-5', 'classroom-demo', 'Arrays', 'An array holds an ordered list of values. You will read and change arrays and loop over them to solve everyday problems.', 5),
  ('module-6', 'classroom-demo', 'Objects', 'Objects group related information under names. You will create objects, read and update their properties, and work with arrays of objects.', 6)
on conflict do nothing;
insert into sections (id, module_id, title, position) values
  ('fn-s1', 'module-2', 'Writing functions', 1),
  ('fn-s2', 'module-2', 'Practice', 2),
  ('cond-s1', 'module-3', 'Comparing and choosing', 1),
  ('cond-s2', 'module-3', 'Practice', 2),
  ('loop-s1', 'module-4', 'Repeating code', 1),
  ('loop-s2', 'module-4', 'Practice', 2),
  ('arr-s1', 'module-5', 'Lists of things', 1),
  ('arr-s2', 'module-5', 'Practice', 2),
  ('obj-s1', 'module-6', 'Grouping data', 1),
  ('obj-s2', 'module-6', 'Practice', 2)
on conflict do nothing;
insert into section_blocks (id, section_id, type, content, position) values
  ('fn-b1', 'fn-s1', 'markdown', '"## What is a function?\n\nA **function** is a named, reusable set of instructions. You *define* it once and *call* it whenever you need it.\n\n```js\nfunction greet(name) {\n  return \"Hello, \" + name + \"!\";\n}\n\nconsole.log(greet(\"Sam\"));  // Hello, Sam!\nconsole.log(greet(\"Alex\")); // Hello, Alex!\n```\n\n- `name` is a **parameter**: a placeholder for the input.\n- `\"Sam\"` is an **argument**: the actual value you pass in when you call the function.\n- `return` sends a value back to the code that called the function. A function that reaches the end without a `return` gives back `undefined`."'::jsonb, 1),
  ('fn-b2', 'fn-s1', 'markdown', '"## A shorter way: arrow functions\n\nJavaScript has a compact syntax for small functions:\n\n```js\nconst double = (n) => n * 2;\n\nconsole.log(double(4)); // 8\n```\n\nThis does exactly the same thing as `function double(n) { return n * 2; }`. When the body is a single expression, the `return` is implied."'::jsonb, 2),
  ('cond-b1', 'cond-s1', 'markdown', '"## Comparisons\n\nA comparison produces a boolean (`true` or `false`):\n\n| Operator | Meaning |\n| --- | --- |\n| `===` | equal (same value **and** same type) |\n| `!==` | not equal |\n| `<`, `<=` | less than, less than or equal to |\n| `>`, `>=` | greater than, greater than or equal to |\n\n```js\nconsole.log(5 === 5);   // true\nconsole.log(5 === \"5\"); // false: a number is not a string\nconsole.log(3 >= 4);    // false\n```\n\nPrefer `===` over `==`. The double-equals version converts types behind the scenes, which can surprise you."'::jsonb, 1),
  ('cond-b2', 'cond-s1', 'markdown', '"## if / else\n\n```js\nconst age = 15;\n\nif (age >= 18) {\n  console.log(\"Adult\");\n} else if (age >= 13) {\n  console.log(\"Teenager\");\n} else {\n  console.log(\"Child\");\n}\n// Teenager\n```\n\nJavaScript checks each condition from top to bottom and runs the **first** block whose condition is true. If none match, the `else` block runs.\n\nCombine conditions with `&&` (and), `||` (or) and `!` (not):\n\n```js\nconst score = 85;\nif (score >= 80 && score < 90) {\n  console.log(\"B\");\n}\n```"'::jsonb, 2),
  ('loop-b1', 'loop-s1', 'markdown', '"## The for loop\n\nUse a `for` loop when you know how many times to repeat.\n\n```js\nfor (let i = 0; i < 3; i++) {\n  console.log(\"Round \" + i);\n}\n// Round 0\n// Round 1\n// Round 2\n```\n\nA `for` loop has three parts inside the parentheses:\n\n1. **Start**: `let i = 0` runs once before the loop begins.\n2. **Condition**: `i < 3` is checked before every round. The loop stops when it is false.\n3. **Step**: `i++` runs after every round (it adds 1 to `i`)."'::jsonb, 1),
  ('loop-b2', 'loop-s1', 'markdown', '"## The while loop, and stopping early\n\nA `while` loop repeats for as long as its condition stays true.\n\n```js\nlet n = 1;\nwhile (n < 100) {\n  n = n * 2;\n}\nconsole.log(n); // 128\n```\n\nMake sure something inside the loop changes the condition, or it will run forever! Use `break` to leave a loop early.\n\n## Building up a result\n\nA common pattern is an **accumulator**: a variable that collects a result as the loop runs.\n\n```js\nlet total = 0;\nfor (let i = 1; i <= 4; i++) {\n  total = total + i;\n}\nconsole.log(total); // 10  (1 + 2 + 3 + 4)\n```"'::jsonb, 2),
  ('arr-b1', 'arr-s1', 'markdown', '"## Arrays\n\nAn **array** is an ordered list. Create one with square brackets:\n\n```js\nconst fruits = [\"apple\", \"banana\", \"cherry\"];\n\nconsole.log(fruits[0]);     // \"apple\"  (counting starts at 0!)\nconsole.log(fruits[2]);     // \"cherry\"\nconsole.log(fruits.length); // 3\n```\n\nEach item has an **index**, and the first index is `0`. The last item is at index `length - 1`."'::jsonb, 1),
  ('arr-b2', 'arr-s1', 'markdown', '"## Changing and looping\n\n```js\nconst scores = [10, 20];\nscores.push(30);  // add to the end -> [10, 20, 30]\nscores[0] = 15;   // replace an item -> [15, 20, 30]\n\nfor (const score of scores) {\n  console.log(score); // 15, then 20, then 30\n}\n\nconsole.log(scores.includes(20)); // true\n```\n\n`for...of` visits every item in order, which is often simpler than an index-based `for` loop.\n\nYou can change the *contents* of a `const` array. `const` only stops you from reassigning the variable itself."'::jsonb, 2),
  ('obj-b1', 'obj-s1', 'markdown', '"## Objects\n\nAn **object** stores related values as **key: value** pairs. Each pair is called a *property*:\n\n```js\nconst student = {\n  name: \"Alex\",\n  age: 12,\n  hobbies: [\"chess\", \"coding\"],\n};\n\nconsole.log(student.name);       // \"Alex\"\nconsole.log(student[\"age\"]);     // 12\nconsole.log(student.hobbies[1]); // \"coding\"\n```\n\nRead a property with **dot notation** (`student.name`) or **bracket notation** (`student[\"name\"]`). Use brackets when the key is stored in a variable or has unusual characters."'::jsonb, 1),
  ('obj-b2', 'obj-s1', 'markdown', '"## Changing objects\n\n```js\nstudent.age = 13;       // update a property\nstudent.grade = \"7th\";  // add a new property\ndelete student.hobbies; // remove a property\n\nconsole.log(student);\n// { name: \"Alex\", age: 13, grade: \"7th\" }\n```\n\nObjects and arrays combine naturally. A very common shape is an **array of objects**:\n\n```js\nconst pets = [\n  { name: \"Rex\", legs: 4 },\n  { name: \"Tweety\", legs: 2 },\n];\n\nfor (const pet of pets) {\n  console.log(pet.name + \" has \" + pet.legs + \" legs\");\n}\n```"'::jsonb, 2)
on conflict do nothing;
insert into questions (id, section_id, prompt, kind, answer_key, position) values
  ('fn-q1', 'fn-s1', 'Which keyword sends a value back from a function to the code that called it?', 'mcq', 'return', 1),
  ('fn-q2', 'fn-s1', 'In `function greet(name) { ... }`, what is the word `name` called? (one word)', 'short', 'parameter', 2),
  ('fn-q3', 'fn-s1', 'What does a function give back if it never reaches a `return` statement?', 'mcq', 'undefined', 3),
  ('fn-q4', 'fn-s2', 'Write a function `double(n)` that returns `n` multiplied by 2.', 'code', null, 1),
  ('fn-q5', 'fn-s2', 'Write a function `isEven(n)` that returns `true` if `n` is even and `false` if it is odd.', 'code', null, 2),
  ('fn-q6', 'fn-s2', 'Write a function `greet(name)` that returns the text `Hello, ` followed by the name and an exclamation mark.', 'code', null, 3),
  ('cond-q1', 'cond-s1', 'Which operator checks that two values are equal AND have the same type?', 'mcq', '===', 1),
  ('cond-q2', 'cond-s1', 'What does `5 > 3 && 2 > 4` evaluate to?', 'mcq', 'false', 2),
  ('cond-q3', 'cond-s1', 'Which keyword starts the block that runs when an `if` condition is false?', 'short', 'else', 3),
  ('cond-q4', 'cond-s2', 'Write a function `sign(n)` that returns "negative", "zero" or "positive" depending on the number.', 'code', null, 1),
  ('cond-q5', 'cond-s2', 'Write a function `grade(score)` that turns a score into a letter grade.', 'code', null, 2),
  ('cond-q6', 'cond-s2', 'Write a function `canRide(height, hasAdult)` for a theme-park ride.', 'code', null, 3),
  ('loop-q1', 'loop-s1', 'How many times does the body of `for (let i = 0; i < 3; i++)` run?', 'mcq', '3', 1),
  ('loop-q2', 'loop-s1', 'Which keyword leaves a loop early?', 'short', 'break', 2),
  ('loop-q3', 'loop-s1', 'What is wrong with `let n = 1; while (n > 0) { n = n + 1; }`?', 'mcq', 'It never stops', 3),
  ('loop-q4', 'loop-s2', 'Write a function `sumTo(n)` that adds up all the whole numbers from 1 to `n`.', 'code', null, 1),
  ('loop-q5', 'loop-s2', 'Write a function `factorial(n)` that multiplies all the whole numbers from 1 to `n`.', 'code', null, 2),
  ('loop-q6', 'loop-s2', 'Write a function `countEvens(limit)` that counts the even numbers from 1 up to and including `limit`.', 'code', null, 3),
  ('arr-q1', 'arr-s1', 'What is the index of the first item in an array?', 'mcq', '0', 1),
  ('arr-q2', 'arr-s1', 'What does `["a", "b", "c"].length` evaluate to?', 'mcq', '3', 2),
  ('arr-q3', 'arr-s1', 'Which array method adds an item to the end of an array? (just the method name)', 'short', 'push', 3),
  ('arr-q4', 'arr-s2', 'Write a function `sumArray(numbers)` that adds up every number in an array.', 'code', null, 1),
  ('arr-q5', 'arr-s2', 'Write a function `largest(numbers)` that returns the biggest number in an array.', 'code', null, 2),
  ('arr-q6', 'arr-s2', 'Write a function `evens(numbers)` that returns a NEW array containing only the even numbers, in the same order.', 'code', null, 3),
  ('obj-q1', 'obj-s1', 'How do you read the `name` property of an object called `student`?', 'mcq', 'student.name', 1),
  ('obj-q2', 'obj-s1', 'In `{ age: 12 }`, what is `age` called?', 'mcq', 'a key (property name)', 2),
  ('obj-q3', 'obj-s1', 'After running `const p = { x: 1 }; p.y = 2;` what does `p` contain?', 'mcq', '{ x: 1, y: 2 }', 3),
  ('obj-q4', 'obj-s2', 'Write a function `makeStudent(name, age)` that returns an object with `name` and `age` properties.', 'code', null, 1),
  ('obj-q5', 'obj-s2', 'Write a function `oldest(people)` that takes an array of `{ name, age }` objects and returns the NAME of the oldest person.', 'code', null, 2),
  ('obj-q6', 'obj-s2', 'Write a function `totalLegs(pets)` that adds up the `legs` of every pet in an array of `{ name, legs }` objects.', 'code', null, 3)
on conflict do nothing;
insert into question_options (id, question_id, text, position) values
  ('fn-q1-o1', 'fn-q1', 'return', 1),
  ('fn-q1-o2', 'fn-q1', 'break', 2),
  ('fn-q1-o3', 'fn-q1', 'output', 3),
  ('fn-q1-o4', 'fn-q1', 'exit', 4),
  ('fn-q3-o1', 'fn-q3', 'undefined', 1),
  ('fn-q3-o2', 'fn-q3', 'null', 2),
  ('fn-q3-o3', 'fn-q3', '0', 3),
  ('fn-q3-o4', 'fn-q3', 'an error', 4),
  ('cond-q1-o1', 'cond-q1', '===', 1),
  ('cond-q1-o2', 'cond-q1', '==', 2),
  ('cond-q1-o3', 'cond-q1', '=', 3),
  ('cond-q1-o4', 'cond-q1', '!==', 4),
  ('cond-q2-o1', 'cond-q2', 'true', 1),
  ('cond-q2-o2', 'cond-q2', 'false', 2),
  ('cond-q2-o3', 'cond-q2', 'undefined', 3),
  ('cond-q2-o4', 'cond-q2', '5', 4),
  ('loop-q1-o1', 'loop-q1', '2', 1),
  ('loop-q1-o2', 'loop-q1', '3', 2),
  ('loop-q1-o3', 'loop-q1', '4', 3),
  ('loop-q1-o4', 'loop-q1', 'forever', 4),
  ('loop-q3-o1', 'loop-q3', 'It never stops', 1),
  ('loop-q3-o2', 'loop-q3', 'It never runs', 2),
  ('loop-q3-o3', 'loop-q3', 'It has a syntax error', 3),
  ('loop-q3-o4', 'loop-q3', 'n cannot be changed', 4),
  ('arr-q1-o1', 'arr-q1', '0', 1),
  ('arr-q1-o2', 'arr-q1', '1', 2),
  ('arr-q1-o3', 'arr-q1', '-1', 3),
  ('arr-q1-o4', 'arr-q1', 'first', 4),
  ('arr-q2-o1', 'arr-q2', '2', 1),
  ('arr-q2-o2', 'arr-q2', '3', 2),
  ('arr-q2-o3', 'arr-q2', '4', 3),
  ('arr-q2-o4', 'arr-q2', '"c"', 4),
  ('obj-q1-o1', 'obj-q1', 'student.name', 1),
  ('obj-q1-o2', 'obj-q1', 'student->name', 2),
  ('obj-q1-o3', 'obj-q1', 'student(name)', 3),
  ('obj-q1-o4', 'obj-q1', 'name.student', 4),
  ('obj-q2-o1', 'obj-q2', 'a key (property name)', 1),
  ('obj-q2-o2', 'obj-q2', 'a value', 2),
  ('obj-q2-o3', 'obj-q2', 'a parameter', 3),
  ('obj-q2-o4', 'obj-q2', 'a function', 4),
  ('obj-q3-o1', 'obj-q3', '{ x: 1, y: 2 }', 1),
  ('obj-q3-o2', 'obj-q3', '{ x: 1 }', 2),
  ('obj-q3-o3', 'obj-q3', '{ y: 2 }', 3),
  ('obj-q3-o4', 'obj-q3', 'nothing: it is an error because p is const', 4)
on conflict do nothing;
insert into code_exercises (id, question_id, language, starter_code, instructions) values
  ('fn-x4', 'fn-q4', 'javascript', 'function double(n) {
  // your code here
}', 'Return the argument multiplied by 2. Return the value rather than printing it with console.log.'),
  ('fn-x5', 'fn-q5', 'javascript', 'function isEven(n) {
  // your code here
}', 'Use the remainder operator `%`. An even number leaves a remainder of 0 when divided by 2.'),
  ('fn-x6', 'fn-q6', 'javascript', 'function greet(name) {
  // your code here
}', 'greet("Sam") should return the string "Hello, Sam!". Return the string; do not print it.'),
  ('cond-x4', 'cond-q4', 'javascript', 'function sign(n) {
  // your code here
}', 'Return exactly one of the strings "negative", "zero" or "positive".'),
  ('cond-x5', 'cond-q5', 'javascript', 'function grade(score) {
  // your code here
}', 'Return "A" for 90 or above, "B" for 80 to 89, "C" for 70 to 79, and "F" for anything below 70.'),
  ('cond-x6', 'cond-q6', 'javascript', 'function canRide(height, hasAdult) {
  // your code here
}', 'A child can ride if their height is at least 120 OR they are with an adult (hasAdult is true). Return true or false.'),
  ('loop-x4', 'loop-q4', 'javascript', 'function sumTo(n) {
  let total = 0;
  // your code here
  return total;
}', 'sumTo(4) should return 10, because 1 + 2 + 3 + 4 = 10. Use a loop and an accumulator.'),
  ('loop-x5', 'loop-q5', 'javascript', 'function factorial(n) {
  let result = 1;
  // your code here
  return result;
}', 'factorial(5) is 5 * 4 * 3 * 2 * 1 = 120. By convention, factorial(0) is 1. You may assume n is 0 or more.'),
  ('loop-x6', 'loop-q6', 'javascript', 'function countEvens(limit) {
  let count = 0;
  // your code here
  return count;
}', 'countEvens(10) should return 5 (the numbers 2, 4, 6, 8 and 10). Combine a loop with an if statement.'),
  ('arr-x4', 'arr-q4', 'javascript', 'function sumArray(numbers) {
  let total = 0;
  // your code here
  return total;
}', 'sumArray([1, 2, 3]) should return 6. An empty array adds up to 0.'),
  ('arr-x5', 'arr-q5', 'javascript', 'function largest(numbers) {
  // your code here
}', 'The array always has at least one number. Practise with a loop, so do not use Math.max. Be careful: the array might contain only negative numbers.'),
  ('arr-x6', 'arr-q6', 'javascript', 'function evens(numbers) {
  const result = [];
  // your code here
  return result;
}', 'evens([1, 2, 3, 4]) should return [2, 4]. Use push to add matching numbers to result.'),
  ('obj-x4', 'obj-q4', 'javascript', 'function makeStudent(name, age) {
  // your code here
}', 'makeStudent("Alex", 12) should return { name: "Alex", age: 12 }.'),
  ('obj-x5', 'obj-q5', 'javascript', 'function oldest(people) {
  // your code here
}', 'The array always has at least one person. If two people share the oldest age, return the one who comes first.'),
  ('obj-x6', 'obj-q6', 'javascript', 'function totalLegs(pets) {
  let total = 0;
  // your code here
  return total;
}', 'totalLegs([{ name: "Rex", legs: 4 }, { name: "Tweety", legs: 2 }]) should return 6.')
on conflict do nothing;
insert into code_checks (id, code_exercise_id, name, description, position) values
  ('fn-x4-c1', 'fn-x4', 'Doubles a positive number', 'double(4) returns 8', 1),
  ('fn-x4-c2', 'fn-x4', 'Handles zero', 'double(0) returns 0', 2),
  ('fn-x4-c3', 'fn-x4', 'Doubles a negative number', 'double(-3) returns -6', 3),
  ('fn-x5-c1', 'fn-x5', 'Even number', 'isEven(4) returns true', 1),
  ('fn-x5-c2', 'fn-x5', 'Odd number', 'isEven(7) returns false', 2),
  ('fn-x5-c3', 'fn-x5', 'Zero is even', 'isEven(0) returns true', 3),
  ('fn-x5-c4', 'fn-x5', 'Negative odd number', 'isEven(-3) returns false', 4),
  ('fn-x6-c1', 'fn-x6', 'Greets a name', 'greet("Sam") returns "Hello, Sam!"', 1),
  ('fn-x6-c2', 'fn-x6', 'Empty name', 'greet("") returns "Hello, !"', 2),
  ('cond-x4-c1', 'cond-x4', 'Negative', 'sign(-5) returns "negative"', 1),
  ('cond-x4-c2', 'cond-x4', 'Zero', 'sign(0) returns "zero"', 2),
  ('cond-x4-c3', 'cond-x4', 'Positive', 'sign(12) returns "positive"', 3),
  ('cond-x5-c1', 'cond-x5', 'Top grade', 'grade(95) returns "A"', 1),
  ('cond-x5-c2', 'cond-x5', 'Boundary at 90', 'grade(90) returns "A"', 2),
  ('cond-x5-c3', 'cond-x5', 'Middle grade', 'grade(85) returns "B"', 3),
  ('cond-x5-c4', 'cond-x5', 'Boundary at 70', 'grade(70) returns "C"', 4),
  ('cond-x5-c5', 'cond-x5', 'Failing', 'grade(69) returns "F"', 5),
  ('cond-x6-c1', 'cond-x6', 'Tall enough', 'canRide(130, false) returns true', 1),
  ('cond-x6-c2', 'cond-x6', 'Short but with an adult', 'canRide(100, true) returns true', 2),
  ('cond-x6-c3', 'cond-x6', 'Short and alone', 'canRide(100, false) returns false', 3),
  ('loop-x4-c1', 'loop-x4', 'Smallest case', 'sumTo(1) returns 1', 1),
  ('loop-x4-c2', 'loop-x4', 'Small number', 'sumTo(5) returns 15', 2),
  ('loop-x4-c3', 'loop-x4', 'Larger number', 'sumTo(10) returns 55', 3),
  ('loop-x5-c1', 'loop-x5', 'Zero', 'factorial(0) returns 1', 1),
  ('loop-x5-c2', 'loop-x5', 'One', 'factorial(1) returns 1', 2),
  ('loop-x5-c3', 'loop-x5', 'Five', 'factorial(5) returns 120', 3),
  ('loop-x6-c1', 'loop-x6', 'Ten', 'countEvens(10) returns 5', 1),
  ('loop-x6-c2', 'loop-x6', 'One', 'countEvens(1) returns 0', 2),
  ('loop-x6-c3', 'loop-x6', 'Odd limit', 'countEvens(7) returns 3', 3),
  ('arr-x4-c1', 'arr-x4', 'Simple list', 'sumArray([1, 2, 3]) returns 6', 1),
  ('arr-x4-c2', 'arr-x4', 'Empty array', 'sumArray([]) returns 0', 2),
  ('arr-x4-c3', 'arr-x4', 'Cancels out', 'sumArray([-1, 1]) returns 0', 3),
  ('arr-x5-c1', 'arr-x5', 'Positive numbers', 'largest([3, 9, 2]) returns 9', 1),
  ('arr-x5-c2', 'arr-x5', 'All negative numbers', 'largest([-5, -1, -8]) returns -1', 2),
  ('arr-x5-c3', 'arr-x5', 'Single item', 'largest([7]) returns 7', 3),
  ('arr-x6-c1', 'arr-x6', 'Mixed numbers', 'evens([1, 2, 3, 4]) returns [2, 4]', 1),
  ('arr-x6-c2', 'arr-x6', 'No evens', 'evens([1, 3, 5]) returns []', 2),
  ('arr-x6-c3', 'arr-x6', 'Empty array', 'evens([]) returns []', 3),
  ('obj-x4-c1', 'obj-x4', 'Builds the object', 'makeStudent("Alex", 12) returns { name: "Alex", age: 12 }', 1),
  ('obj-x4-c2', 'obj-x4', 'Zero age', 'makeStudent("Baby", 0) returns { name: "Baby", age: 0 }', 2),
  ('obj-x5-c1', 'obj-x5', 'Picks the oldest', 'oldest([{ name: "Ana", age: 10 }, { name: "Bo", age: 12 }]) returns "Bo"', 1),
  ('obj-x5-c2', 'obj-x5', 'Single person', 'oldest([{ name: "Cy", age: 9 }]) returns "Cy"', 2),
  ('obj-x5-c3', 'obj-x5', 'Tie goes to the first', 'oldest([{ name: "Di", age: 11 }, { name: "Ed", age: 11 }]) returns "Di"', 3),
  ('obj-x6-c1', 'obj-x6', 'Two pets', 'totalLegs([{ name: "Rex", legs: 4 }, { name: "Tweety", legs: 2 }]) returns 6', 1),
  ('obj-x6-c2', 'obj-x6', 'No pets', 'totalLegs([]) returns 0', 2)
on conflict do nothing;

-- ============================================================================
-- Example curriculum: Python Foundations.
-- This is a separate introductory module so its exercises run with the Python
-- interpreter rather than the JavaScript one used by the earlier curriculum.
-- ============================================================================
insert into modules (id, classroom_id, title, content, position) values
  ('module-python-1', 'classroom-demo', 'Python Foundations', 'Python is designed to be readable. In this module you will use variables, strings and functions, then practise making decisions and repeating work with Python.', 7)
on conflict do nothing;

insert into sections (id, module_id, title, position) values
  ('py-s1', 'module-python-1', 'Python essentials', 1),
  ('py-s2', 'module-python-1', 'Practice', 2)
on conflict do nothing;

insert into section_blocks (id, section_id, type, content, position) values
  ('py-b1', 'py-s1', 'markdown', '"## Values and output\n\nUse `=` to store a value in a variable. Python does not use `const` or `let`, and indentation matters.\n\n```python\nname = \"Alex\"\nscore = 12\nprint(name)\nprint(score + 3)\n```\n\n`print()` displays a value in the output area. Strings use quotes; numbers do not. You can join strings with `+`, but both sides need to be strings."'::jsonb, 1),
  ('py-b2', 'py-s1', 'markdown', '"## Functions and decisions\n\nA function is defined with `def`. Its indented body runs when you call the function. Use `return` to send a value back.\n\n```python\ndef greet(name):\n    if name == \"\":\n        return \"Hello!\"\n    return \"Hello, \" + name + \"!\"\n\nprint(greet(\"Sam\"))\n```\n\nPython uses `==` to compare values. A colon starts an indented block after `def`, `if`, `else`, `for` and `while`."'::jsonb, 2),
  ('py-b3', 'py-s1', 'markdown', '"## Repeating with `for`\n\n`range(start, stop)` produces numbers from `start` up to, but not including, `stop`.\n\n```python\ntotal = 0\nfor number in range(1, 5):\n    total = total + number\n\nprint(total)  # 10\n```\n\nThe loop above visits `1`, `2`, `3` and `4`. The variable `total` is an **accumulator**: it stores the result built up during the loop."'::jsonb, 3)
on conflict do nothing;

insert into questions (id, section_id, prompt, kind, answer_key, position) values
  ('py-q1', 'py-s1', 'Which function displays a value in Python?', 'mcq', 'print', 1),
  ('py-q2', 'py-s1', 'Which operator compares two values for equality in Python?', 'mcq', '==', 2),
  ('py-q3', 'py-s1', 'What keyword begins a Python function definition?', 'short', 'def', 3),
  ('py-q4', 'py-s2', 'Write a function `double(number)` that returns the number multiplied by 2.', 'code', null, 1),
  ('py-q5', 'py-s2', 'Write a function `is_even(number)` that returns `True` for even numbers and `False` for odd numbers.', 'code', null, 2),
  ('py-q6', 'py-s2', 'Write a function `sum_to(limit)` that adds every whole number from 1 through `limit`.', 'code', null, 3)
on conflict do nothing;

insert into question_options (id, question_id, text, position) values
  ('py-q1-o1', 'py-q1', 'show()', 1),
  ('py-q1-o2', 'py-q1', 'print', 2),
  ('py-q1-o3', 'py-q1', 'console.log', 3),
  ('py-q1-o4', 'py-q1', 'display', 4),
  ('py-q2-o1', 'py-q2', '=', 1),
  ('py-q2-o2', 'py-q2', '===', 2),
  ('py-q2-o3', 'py-q2', '==', 3),
  ('py-q2-o4', 'py-q2', '!=', 4)
on conflict do nothing;

insert into code_exercises (id, question_id, language, starter_code, instructions) values
  ('py-x4', 'py-q4', 'python', 'def double(number):\n    # Write your code here\n    pass', 'Return the argument multiplied by 2. Return the value instead of printing it.'),
  ('py-x5', 'py-q5', 'python', 'def is_even(number):\n    # Write your code here\n    pass', 'Use the remainder operator `%`. An even number leaves a remainder of 0 when divided by 2.'),
  ('py-x6', 'py-q6', 'python', 'def sum_to(limit):\n    total = 0\n    # Write your code here\n    return total', 'Use `range` and an accumulator. For example, `sum_to(4)` should return 10.')
on conflict do nothing;


insert into code_checks (id, code_exercise_id, name, description, position) values
  ('py-x4-c1', 'py-x4', 'Doubles a positive number', 'double(4) returns 8', 1),
  ('py-x4-c2', 'py-x4', 'Handles zero', 'double(0) returns 0', 2),
  ('py-x5-c1', 'py-x5', 'Even number', 'is_even(4) returns True', 1),
  ('py-x5-c2', 'py-x5', 'Odd number', 'is_even(7) returns False', 2),
  ('py-x6-c1', 'py-x6', 'Small limit', 'sum_to(4) returns 10', 1),
  ('py-x6-c2', 'py-x6', 'One', 'sum_to(1) returns 1', 2),
  ('py-x6-c3', 'py-x6', 'Zero', 'sum_to(0) returns 0', 3)
on conflict do nothing;

-- A runnable example for the Functions module. Preserve any teacher-selected function name.
update code_exercises
set function_name = 'double'
where id = 'fn-x4' and function_name = '';
insert into code_tests (id, code_exercise_id, args, expected, position) values
  ('fn-x4-t1', 'fn-x4', '[4]'::jsonb, '8'::jsonb, 1),
  ('fn-x4-t2', 'fn-x4', '[0]'::jsonb, '0'::jsonb, 2),
  ('fn-x4-t3', 'fn-x4', '[-3]'::jsonb, '-6'::jsonb, 3)
on conflict do nothing;
update code_tests
set name = case id
  when 'fn-x4-t1' then 'Positive number'
  when 'fn-x4-t2' then 'Zero'
  when 'fn-x4-t3' then 'Negative number'
  else name
end
where id in ('fn-x4-t1', 'fn-x4-t2', 'fn-x4-t3') and name = 'Untitled check';

drop table if exists reference_answers;

-- ============================================================================
-- WYSIWYG rollout foundation. Run this script only after the backend containing
-- the matching RPC call has been deployed. The reset is deliberately opt-in:
-- call `select full_dev_wysiwyg_reset()` once in a development project.
-- ============================================================================
create table if not exists schema_migration_ledger (
  name text primary key,
  applied_at timestamptz not null default now()
);

create or replace function full_dev_wysiwyg_reset()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The lock and ledger make concurrent/repeated dashboard calls harmless.
  perform pg_advisory_xact_lock(hashtext('full-dev-wysiwyg-reset-v1'));
  if exists (select 1 from schema_migration_ledger where name = 'full-dev-wysiwyg-reset-v1') then
    return false;
  end if;

  -- section_items has no FK to its polymorphic item_id, so it must be cleared first.
  delete from section_items where item_type = 'block';
  delete from section_blocks;
  update modules set content = '';

  -- Replacement sample material is intentionally restricted to fixed demo rows.
  update modules
  set content = 'This lesson uses the rich-text lesson format.'
  where id = 'module-1' and classroom_id = 'classroom-demo';
  insert into section_blocks (id, section_id, type, content, position)
  select 'wysiwyg-demo-block-1', 'section-1', 'markdown',
         to_jsonb('## Variables\n\nUse `const` for values that do not change.'::text), 0
  where exists (select 1 from sections where id = 'section-1' and module_id = 'module-1')
  on conflict (id) do nothing;
  insert into section_items (id, section_id, item_type, item_id, position)
  select 'wysiwyg-demo-item-1', 'section-1', 'block', 'wysiwyg-demo-block-1', 0
  where exists (select 1 from section_blocks where id = 'wysiwyg-demo-block-1')
  on conflict (section_id, item_type, item_id) do update set position = excluded.position;

  insert into schema_migration_ledger (name) values ('full-dev-wysiwyg-reset-v1');
  return true;
end;
$$;

-- Reconciles one complete builder document atomically. Existing IDs are updated
-- in place; omitted IDs are explicit removals. It never cascades student work.
create or replace function save_module_builder(
  p_module_id text,
  p_classroom_id text,
  p_revision integer,
  p_document jsonb
)
returns setof modules
language plpgsql
security definer
set search_path = public
as $$
declare
  v_section jsonb;
  v_item jsonb;
  v_section_id text;
  v_item_id text;
  v_section_position integer;
  v_item_position integer;
  v_exercise_id text;
  v_check jsonb;
  v_test jsonb;
  v_check_position integer;
  v_test_position integer;
  v_check_ids text[];
  v_test_ids text[];
  v_sections text[] := '{}';
  v_blocks text[] := '{}';
  v_questions text[] := '{}';
  v_module modules%rowtype;
begin
  select * into v_module from modules
  where id = p_module_id and classroom_id = p_classroom_id and revision = p_revision
  for update;
  if not found then return; end if;

  -- Gather IDs first so every supplied existing record can be class-scoped.
  for v_section in select value from jsonb_array_elements(coalesce(p_document->'sections', '[]'::jsonb)) loop
    v_section_id := v_section->>'id';
    if v_section_id is null or v_section_id = '' then raise exception 'A section id is required'; end if;
    v_sections := array_append(v_sections, v_section_id);
    for v_item in select value from jsonb_array_elements(coalesce(v_section->'items', '[]'::jsonb)) loop
      v_item_id := v_item->>'id';
      if v_item_id is null or v_item_id = '' then raise exception 'An item id is required'; end if;
      if v_item->>'type' = 'block' then v_blocks := array_append(v_blocks, v_item_id);
      elsif v_item->>'type' = 'question' then v_questions := array_append(v_questions, v_item_id);
      else raise exception 'Unknown section item type'; end if;
    end loop;
  end loop;
  if cardinality(v_sections) <> cardinality(array(select distinct unnest(v_sections)))
     or cardinality(v_blocks) <> cardinality(array(select distinct unnest(v_blocks)))
     or cardinality(v_questions) <> cardinality(array(select distinct unnest(v_questions))) then
    raise exception 'Builder document contains duplicate ids';
  end if;
  if exists (select 1 from sections where id = any(v_sections) and module_id <> p_module_id)
     or exists (select 1 from section_blocks b join sections s on s.id=b.section_id where b.id = any(v_blocks) and s.module_id <> p_module_id)
     or exists (select 1 from questions q join sections s on s.id=q.section_id where q.id = any(v_questions) and s.module_id <> p_module_id) then
    raise exception 'Builder document contains an item from another module';
  end if;

  -- Refuse removals that would cause FK cascades into immutable student history.
  if exists (
    select 1 from questions q join sections s on s.id=q.section_id
    where s.module_id=p_module_id and not (q.id = any(v_questions))
      and (exists (select 1 from attempts a where a.question_id=q.id)
        or exists (select 1 from code_exercises e join code_submissions cs on cs.code_exercise_id=e.id where e.question_id=q.id))
  ) then raise exception 'Cannot remove questions with student attempts or submissions'; end if;

  -- Remove only IDs omitted from the document, in polymorphic/FK-safe order.
  delete from section_items i using sections s
  where i.section_id=s.id and s.module_id=p_module_id
    and ((i.item_type='block' and not (i.item_id = any(v_blocks)))
      or (i.item_type='question' and not (i.item_id = any(v_questions))));
  delete from section_blocks b using sections s
  where b.section_id=s.id and s.module_id=p_module_id and not (b.id = any(v_blocks));
  delete from questions q using sections s
  where q.section_id=s.id and s.module_id=p_module_id and not (q.id = any(v_questions));
  delete from sections where module_id=p_module_id and not (id = any(v_sections));

  -- Move positions out of the unique range before reconciling the mixed sequence.
  update section_items i set position = -i.position - 1 from sections s
  where i.section_id=s.id and s.module_id=p_module_id;
  v_section_position := 0;
  for v_section in select value from jsonb_array_elements(coalesce(p_document->'sections', '[]'::jsonb)) loop
    v_section_id := v_section->>'id';
    insert into sections (id, module_id, title, position)
    values (v_section_id, p_module_id, coalesce(nullif(trim(v_section->>'title'), ''), 'Untitled section'), v_section_position)
    on conflict (id) do update set title=excluded.title, position=excluded.position;
    v_item_position := 0;
    for v_item in select value from jsonb_array_elements(coalesce(v_section->'items', '[]'::jsonb)) loop
      v_item_id := v_item->>'id';
      if v_item->>'type' = 'block' then
        update section_items set section_id=v_section_id, position=v_item_position
        where item_type='block' and item_id=v_item_id;
        insert into section_blocks (id, section_id, type, content, position)
        values (v_item_id, v_section_id, v_item->>'blockType', v_item->'content', v_item_position)
        on conflict (id) do update set section_id=excluded.section_id, type=excluded.type, content=excluded.content, position=excluded.position;
        insert into section_items (id, section_id, item_type, item_id, position)
        values ('builder-item-' || v_item_id, v_section_id, 'block', v_item_id, v_item_position)
        on conflict (section_id, item_type, item_id) do update set position=excluded.position;
      else
        update section_items set section_id=v_section_id, position=v_item_position
        where item_type='question' and item_id=v_item_id;
        insert into questions (id, section_id, prompt, kind, answer_key, math_expected_result, math_tolerance, position)
        values (v_item_id, v_section_id, v_item->>'prompt', v_item->>'kind', v_item->>'answerKey',
                case when v_item ? 'mathExpectedResult' then (v_item->>'mathExpectedResult')::double precision end,
                case when v_item ? 'mathTolerance' then (v_item->>'mathTolerance')::double precision end, v_item_position)
        on conflict (id) do update set section_id=excluded.section_id, prompt=excluded.prompt, kind=excluded.kind,
          answer_key=excluded.answer_key, math_expected_result=excluded.math_expected_result,
          math_tolerance=excluded.math_tolerance, position=excluded.position;
        insert into section_items (id, section_id, item_type, item_id, position)
        values ('builder-item-' || v_item_id, v_section_id, 'question', v_item_id, v_item_position)
        on conflict (section_id, item_type, item_id) do update set position=excluded.position;
        if v_item->>'kind' = 'code' then
          insert into code_exercises (id, question_id, language, starter_code, instructions, function_name, hidden_code)
          values ('exercise-' || v_item_id, v_item_id, coalesce(v_item->>'language', 'javascript'),
                  coalesce(v_item->>'starterCode', ''), coalesce(v_item->>'instructions', ''),
                  coalesce(v_item->>'functionName', 'solution'), coalesce(v_item->>'hiddenCode', ''))
          on conflict (question_id) do update set language=excluded.language, starter_code=excluded.starter_code,
            instructions=excluded.instructions, function_name=excluded.function_name, hidden_code=excluded.hidden_code;
          select id into v_exercise_id from code_exercises where question_id=v_item_id;

          -- Checks and tests expose stable IDs in the builder contract, so their
          -- omission is an explicit removal rather than a delete/recreate save.
          v_check_ids := '{}';
          v_check_position := 0;
          for v_check in select value from jsonb_array_elements(coalesce(v_item->'checks', '[]'::jsonb)) loop
            if coalesce(v_check->>'id', '') = '' then raise exception 'A code check id is required'; end if;
            if exists (select 1 from code_checks c join code_exercises e on e.id=c.code_exercise_id join questions q on q.id=e.question_id join sections s on s.id=q.section_id where c.id=v_check->>'id' and s.module_id<>p_module_id) then
              raise exception 'Builder document contains a check from another module';
            end if;
            v_check_ids := array_append(v_check_ids, v_check->>'id');
            insert into code_checks (id, code_exercise_id, name, description, position)
            values (v_check->>'id', v_exercise_id, v_check->>'name', v_check->>'description', v_check_position)
            on conflict (id) do update set code_exercise_id=excluded.code_exercise_id, name=excluded.name,
              description=excluded.description, position=excluded.position;
            v_check_position := v_check_position + 1;
          end loop;
          delete from code_checks where code_exercise_id=v_exercise_id and not (id = any(v_check_ids));

          v_test_ids := '{}';
          v_test_position := 0;
          for v_test in select value from jsonb_array_elements(coalesce(v_item->'tests', '[]'::jsonb)) loop
            if coalesce(v_test->>'id', '') = '' then raise exception 'A code test id is required'; end if;
            if exists (select 1 from code_tests t join code_exercises e on e.id=t.code_exercise_id join questions q on q.id=e.question_id join sections s on s.id=q.section_id where t.id=v_test->>'id' and s.module_id<>p_module_id) then
              raise exception 'Builder document contains a test from another module';
            end if;
            v_test_ids := array_append(v_test_ids, v_test->>'id');
            insert into code_tests (id, code_exercise_id, name, args, expected, position)
            values (v_test->>'id', v_exercise_id, v_test->>'name', v_test->'args', v_test->'expected', v_test_position)
            on conflict (id) do update set code_exercise_id=excluded.code_exercise_id, name=excluded.name,
              args=excluded.args, expected=excluded.expected, position=excluded.position;
            v_test_position := v_test_position + 1;
          end loop;
          delete from code_tests where code_exercise_id=v_exercise_id and not (id = any(v_test_ids));
        end if;
      end if;
      v_item_position := v_item_position + 1;
    end loop;
    v_section_position := v_section_position + 1;
  end loop;

  update modules set title=trim(p_document->>'title'), content=p_document->>'content',
    status=p_document->>'status', revision=revision+1 where id=p_module_id;
  return query select * from modules where id=p_module_id;
end;
$$;
