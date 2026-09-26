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
  title text not null, content text not null default '', position integer not null default 0,
  created_at timestamptz not null default now()
);
alter table modules add column if not exists position integer not null default 0;
alter table modules alter column content set default '';

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
alter table section_progress enable row level security; alter table attempts enable row level security;
alter table code_submissions enable row level security; alter table comments enable row level security;

-- Demo: a complete small lesson with authored answers/checks and student activity.
insert into classrooms values ('classroom-demo','Demo Classroom','DEMO123') on conflict do nothing;
insert into users (id,name) values ('teacher-1','Ms. Rivera'),('student-1','Alex'),('student-2','Sam') on conflict do nothing;
insert into memberships (id,user_id,classroom_id,role) values
 ('membership-teacher-1','teacher-1','classroom-demo','teacher'),('membership-student-1','student-1','classroom-demo','student'),('membership-student-2','student-2','classroom-demo','student') on conflict do nothing;
insert into modules (id,classroom_id,title,content,position) values ('module-1','classroom-demo','Variables and Types','An introduction to JavaScript variables.',1) on conflict do nothing;
insert into sections values ('section-1','module-1','Variables',1),('section-2','module-1','Practice',2) on conflict do nothing;
insert into section_blocks values ('block-1','section-1','markdown','"Use const for values that do not change."',1) on conflict do nothing;
insert into questions values ('question-1','section-1','Which keyword declares a block-scoped variable?','mcq','let',1),('question-2','section-1','What is the type of true?','short','boolean',2),('question-3','section-2','Write a function that adds two numbers.','code',null,1) on conflict do nothing;
insert into question_options values ('option-1','question-1','var',1),('option-2','question-1','let',2),('option-3','question-1','goto',3) on conflict do nothing;
insert into code_exercises values ('exercise-1','question-3','javascript','function add(a, b) {\n  // your code\n}','Return the sum of a and b.') on conflict do nothing;
insert into reference_answers values ('reference-1','exercise-1','Concise solution','function add(a, b) { return a + b; }',1),('reference-2','exercise-1','Arrow function','const add = (a, b) => a + b;',2) on conflict do nothing;
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
insert into reference_answers (id, code_exercise_id, title, answer, position) values
  ('fn-x4-r1', 'fn-x4', 'Concise solution', 'function double(n) {
  return n * 2;
}', 1),
  ('fn-x4-r2', 'fn-x4', 'Arrow function', 'const double = (n) => n * 2;', 2),
  ('fn-x5-r1', 'fn-x5', 'Comparison', 'function isEven(n) {
  return n % 2 === 0;
}', 1),
  ('fn-x5-r2', 'fn-x5', 'Arrow function', 'const isEven = (n) => n % 2 === 0;', 2),
  ('fn-x6-r1', 'fn-x6', 'String concatenation', 'function greet(name) {
  return "Hello, " + name + "!";
}', 1),
  ('fn-x6-r2', 'fn-x6', 'Template literal', 'function greet(name) {
  return `Hello, ${name}!`;
}', 2),
  ('cond-x4-r1', 'cond-x4', 'if / else if', 'function sign(n) {
  if (n < 0) {
    return "negative";
  } else if (n === 0) {
    return "zero";
  } else {
    return "positive";
  }
}', 1),
  ('cond-x5-r1', 'cond-x5', 'if / else if chain', 'function grade(score) {
  if (score >= 90) {
    return "A";
  } else if (score >= 80) {
    return "B";
  } else if (score >= 70) {
    return "C";
  }
  return "F";
}', 1),
  ('cond-x6-r1', 'cond-x6', 'Using ||', 'function canRide(height, hasAdult) {
  return height >= 120 || hasAdult;
}', 1),
  ('loop-x4-r1', 'loop-x4', 'for loop', 'function sumTo(n) {
  let total = 0;
  for (let i = 1; i <= n; i++) {
    total = total + i;
  }
  return total;
}', 1),
  ('loop-x4-r2', 'loop-x4', 'Formula (no loop)', 'function sumTo(n) {
  return (n * (n + 1)) / 2;
}', 2),
  ('loop-x5-r1', 'loop-x5', 'for loop', 'function factorial(n) {
  let result = 1;
  for (let i = 2; i <= n; i++) {
    result = result * i;
  }
  return result;
}', 1),
  ('loop-x5-r2', 'loop-x5', 'while loop', 'function factorial(n) {
  let result = 1;
  while (n > 1) {
    result = result * n;
    n--;
  }
  return result;
}', 2),
  ('loop-x6-r1', 'loop-x6', 'Loop and if', 'function countEvens(limit) {
  let count = 0;
  for (let i = 1; i <= limit; i++) {
    if (i % 2 === 0) {
      count++;
    }
  }
  return count;
}', 1),
  ('loop-x6-r2', 'loop-x6', 'Arithmetic (no loop)', 'function countEvens(limit) {
  return Math.floor(limit / 2);
}', 2),
  ('arr-x4-r1', 'arr-x4', 'for...of', 'function sumArray(numbers) {
  let total = 0;
  for (const n of numbers) {
    total = total + n;
  }
  return total;
}', 1),
  ('arr-x5-r1', 'arr-x5', 'Start from the first item', 'function largest(numbers) {
  let max = numbers[0];
  for (const n of numbers) {
    if (n > max) {
      max = n;
    }
  }
  return max;
}', 1),
  ('arr-x5-r2', 'arr-x5', 'Spread with Math.max', 'function largest(numbers) {
  return Math.max(...numbers);
}', 2),
  ('arr-x6-r1', 'arr-x6', 'Loop and push', 'function evens(numbers) {
  const result = [];
  for (const n of numbers) {
    if (n % 2 === 0) {
      result.push(n);
    }
  }
  return result;
}', 1),
  ('arr-x6-r2', 'arr-x6', 'filter', 'function evens(numbers) {
  return numbers.filter((n) => n % 2 === 0);
}', 2),
  ('obj-x4-r1', 'obj-x4', 'Explicit', 'function makeStudent(name, age) {
  return { name: name, age: age };
}', 1),
  ('obj-x4-r2', 'obj-x4', 'Shorthand', 'function makeStudent(name, age) {
  return { name, age };
}', 2),
  ('obj-x5-r1', 'obj-x5', 'Track the oldest so far', 'function oldest(people) {
  let best = people[0];
  for (const person of people) {
    if (person.age > best.age) {
      best = person;
    }
  }
  return best.name;
}', 1),
  ('obj-x6-r1', 'obj-x6', 'for...of', 'function totalLegs(pets) {
  let total = 0;
  for (const pet of pets) {
    total = total + pet.legs;
  }
  return total;
}', 1)
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
