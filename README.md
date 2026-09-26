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
- **Auth** — Supabase Auth with Google sign-in, then a room code + role to enter a classroom. The browser's
  Supabase access token authenticates both REST (`Authorization: Bearer`) and the socket handshake; the
  backend issues no tokens of its own.
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
2. `cp .env.example .env` and fill in `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and the two `VITE_SUPABASE_*`
   values (dashboard → Project Settings → API; the frontend gets the *publishable* key only).
3. In the dashboard SQL editor, paste and run [`backend/schema.sql`](backend/schema.sql) once. It creates
   the tables and seeds the demo data.
4. Enable Google sign-in:
   - Google Cloud Console → APIs & Services → Credentials → create an OAuth client ID (Web application) with
     the authorized redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`.
   - Supabase dashboard → Authentication → Sign In / Providers → Google: enable it and paste the client ID and secret.
   - Authentication → URL Configuration: set Site URL to `http://localhost:5173` and add
     `http://localhost:5173/**` to Redirect URLs.
5. `npm run dev` — boots both apps. The backend exits with a clear message if Supabase is unreachable or
   the schema hasn't been run.

## Demo data

`backend/schema.sql` seeds:

- **Room code: `DEMO123`**
- Teacher: `Ms. Rivera` · Students: `Alex`, `Sam`
- One ordered module with two sections, markdown content, MCQ/short/code questions, a code exercise,
  two teacher reference answers/checks, progress, an attempt, a sandbox result, and a line comment.

Sign in with Google, then join with `DEMO123` as a student in one browser window and as a teacher in another
(use two Google accounts, or a normal window plus a private one) to try the raise-hand flow. Your name comes
from your Google profile. Alex and Sam are demo rows with no login; they just populate the teacher's grid.

## What's stubbed

Code execution (`POST /api/code/run`) returns a mock response.

## AI

`POST /api/ai/hint` is a student "I'm stuck" tutor that gives hints (never answers) scoped to the student's current
module, and `POST /api/ai/draft` is a teacher assistant for drafting/planning modules. Both call OpenAI and need
`OPENAI_API_KEY` in `.env` (optionally `OPENAI_MODEL`); without a key they return 503 and the rest of the app works.
See [CLAUDE.md](CLAUDE.md#ai-service-openai).

## Core API

All endpoints require a Supabase access token in `Authorization: Bearer <token>`. `POST /api/auth/join` and
`GET /api/auth/me` only require a signed-in identity; all other endpoints also require a classroom membership.
Users are global and role is stored on `memberships`, scoped to each classroom. Joining a classroom selects its
membership for subsequent requests.

### Auth and classroom reads

- `POST /api/auth/join` — `{ roomCode, role }`; creates or updates the caller's classroom membership.
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
