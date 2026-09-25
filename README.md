# Classroom Coding Platform

A hackathon skeleton for a classroom coding platform: real routing, real (room-code) auth, real sockets,
and stubbed code execution / AI hints for the team to build on.

## Architecture

```
root/
├── package.json     root scripts only (concurrently) — NOT an npm workspace
├── shared/          types.ts + events.ts — plain files imported by relative path (no package.json)
├── backend/         Express + TypeScript + Supabase + Socket.io
└── frontend/        Vite + React + TypeScript + Tailwind v4 + React Router
```

- **Backend** — one Express server serving REST and Socket.io on the same HTTP server. Data in Supabase
  (Postgres); the schema and demo seed are in `backend/schema.sql`.
- **Frontend** — one app. After joining, users are routed to `/student` or `/teacher` by role; visiting
  the other role's route redirects you back to your own.
- **Auth** — room code + name + role, no passwords. The backend issues a JWT used for both REST
  (`Authorization: Bearer`) and the socket handshake.
- **Contract** — `shared/types.ts` and `shared/events.ts` are the source of truth. Edit them first.
  See [CLAUDE.md](CLAUDE.md) for details and what is real vs. mocked.

## Ports

| App      | Port | URL                   |
| -------- | ---- | --------------------- |
| Backend  | 4000 | http://localhost:4000 |
| Frontend | 5173 | http://localhost:5173 |

The frontend dev server proxies `/api` and `/socket.io` to the backend.

## Run

```bash
npm install                  # root
npm install --prefix backend
npm install --prefix frontend
# (or: npm run install-all)

```

Then set up Supabase (the only database):

1. Create a project at [supabase.com](https://supabase.com).
2. `cp .env.example .env` and fill in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
   (dashboard → Project Settings → API). `JWT_SECRET` is optional for local dev (insecure fallback).
3. In the dashboard SQL editor, paste and run [`backend/schema.sql`](backend/schema.sql). It creates
   the tables and seeds the demo data. Reapplying it is supported. When upgrading the original skeleton,
   it creates memberships from the old user classroom/role columns and preserves module progress; legacy
   module comments are removed because they have no truthful submission target (back them up first).
4. `npm run dev` — boots both apps. The backend exits with a clear message if Supabase is unreachable or
   the schema hasn't been run.

## Demo data

`backend/schema.sql` seeds:

- **Room code: `DEMO123`**
- Teacher: `Ms. Rivera` · Students: `Alex`, `Sam`
- One ordered module with two sections, markdown content, MCQ/short/code questions, a code exercise,
  two teacher reference answers/checks, progress, an attempt, a sandbox result, and a line comment.

Join as a student and as a teacher (two browser windows) to try the raise-hand flow. Joining with any new
name creates a new user in that classroom.

## What's stubbed

Code execution (`POST /api/code/run`) and AI hints (`POST /api/ai/hint`) return mock responses. The OpenAI
client is scaffolded in `backend/src/openai.ts` but not wired into any route.

## Core API

All endpoints except `POST /api/auth/join` require `Authorization: Bearer <token>`. A JWT selects one
classroom membership, so the compatible room-code join flow can still be used to switch classrooms. Users
are global; role is stored on `memberships`, scoped to each classroom.

### Auth and classroom reads

- `POST /api/auth/join` — `{ roomCode, name, role }`; finds/creates the matching classroom membership.
- `GET /api/auth/me`
- `POST /api/classrooms` (teacher) — `{ name, roomCode }`; adds the caller as its teacher.
- `GET /api/classrooms/:id`, `GET /api/classrooms/:id/modules` (members)
- `GET /api/classrooms/:id/students` (teacher)
- `GET /api/classrooms/:id/students/:studentId/aggregate` (teacher) — progress, attempts, submissions,
  and submission comments for that scoped student.

### Authored learning content (teacher only)

`GET /api/modules/:id` returns a nested ordered module. Teachers receive answer keys, reference answers,
and checks; students receive the same content without those fields.

- Modules: `POST /api/modules`, `PATCH|DELETE /api/modules/:id`
- Sections: `POST /api/modules/:id/sections`, `PATCH|DELETE /api/modules/sections/:id`
- Blocks: `POST /api/modules/sections/:id/blocks`, `PATCH|DELETE /api/modules/blocks/:id`
- Questions: `POST /api/modules/sections/:id/questions`, `PATCH|DELETE /api/modules/questions/:id`
- MCQ options: `POST /api/modules/questions/:id/options`, `PATCH|DELETE /api/modules/options/:id`
- Code exercise (one per code question): `PUT /api/modules/questions/:id/exercise`
- Reference answers: `POST /api/modules/exercises/:id/references`,
  `PATCH|DELETE /api/modules/references/:id`
- Code checks: `POST /api/modules/exercises/:id/checks`, `PATCH|DELETE /api/modules/checks/:id`

Create/update bodies and response shapes are defined in [`shared/types.ts`](shared/types.ts). Every ordered
entity accepts `position`; omitting it appends it to its parent.

### Student work

- `PUT /api/progress`, `PUT /api/section-progress` — `{ studentId? , moduleId|sectionId, status }`.
  Students can update only themselves; teachers can update classroom students.
- `GET /api/students/:id/progress`, `GET /api/students/:id/section-progress`
- `POST /api/attempts` — `{ questionId, answer }`; the API records correctness only where an answer key
  exists.
- `POST /api/submissions` — `{ codeExerciseId, code, stdout?, stderr?, passed? }`.
  `stdout`, `stderr`, and `passed` are supplied by an external sandbox; **the API never executes code**.
- `GET /api/submissions/:id/comments`, `POST /api/comments` — a comment body is
  `{ submissionId, text, lineStart?, lineEnd? }`. Students may comment only on their own submissions;
  teachers can comment in their classroom.
