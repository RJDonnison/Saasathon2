# Classroom Coding Platform

A classroom coding platform (hackathon project): one backend, one frontend. Students and teachers are
**different routes/roles inside the same frontend app**, chosen after auth — not separate apps.

## Architecture

- `backend/` — one Express server (TypeScript, Supabase/Postgres via `@supabase/supabase-js`) exposing REST **and**
  Socket.io on the same HTTP server, port **4000**.
- `frontend/` — one Vite + React + TS + Tailwind v4 + React Router app on port **5173**. After auth it
  routes to `/student/*` or `/teacher/*` based on the authenticated user's role. Vite proxies `/api` and
  `/socket.io` to the backend.
- `shared/` — plain `.ts` files (`types.ts`, `events.ts`), **not** an npm package and not a workspace.
- The repo is flat: no `apps/` or `packages/` wrapper, and **no npm workspaces**. Root, `backend/` and
  `frontend/` each have their own `package.json` and `node_modules`. The root only holds the `dev` script
  (`concurrently`).
- Auth is intentionally simple (hackathon): `POST /api/auth/join` with a room code + name + role, no
  passwords. It returns a JWT `{ userId, role, classroomId }`, which is sent as `Authorization: Bearer …`
  and also as the socket handshake `auth.token`. Anyone with a room code can join as a teacher — that is
  by design for now.

## The contract rule

`shared/types.ts` (entities + REST request/response types) and `shared/events.ts` (socket payloads) are
the **single source of truth**. Both apps import them by relative path. **Add or change fields there
first**; never fork or redeclare these types locally in frontend or backend.

- Frontend imports the `.ts` path directly: `import type { User } from '../../shared/types'`
- Backend uses NodeNext, so relative imports need a `.js` extension even though the file is `.ts`:
  `import type { User } from '../../shared/types.js'`
- Keep `shared/` free of runtime code and dependencies (types only) so it needs no build step.

## Current stub status

REAL (backed by Supabase / real socket broadcasts):
- `POST /api/auth/join`, `GET /api/auth/me`
- Classroom, module (create/read/update/delete, teacher-only writes), progress and comment endpoints
- Socket.io: presence (`presence_update`), `raise_hand`, `student_status_update`, broadcast to a
  classroom-scoped room (`io.to(classroomId)`). The server trusts the JWT, not the client payload.

MOCKED — don't "fix" these into real implementations unless explicitly asked; that is follow-up feature work:
- `POST /api/code/run` — returns `"mock output for: " + code` after a fake 300ms delay. Nothing is executed.
- `POST /api/ai/hint` — returns a canned placeholder reply. A commented-out block in
  `backend/src/routes/ai.ts` shows where a real OpenAI call would go.
- Most frontend components under `frontend/src/student/` and `frontend/src/teacher/` are placeholders
  with static/mock content.

## Database: Supabase only

**Supabase (Postgres) is the only database.** There is no SQLite and no local DB file — don't add one.
- All data access goes through the client in `backend/src/supabase.ts`, using the **service-role key**
  (server-side only; it bypasses RLS, and RLS is enabled with no policies so the anon key can access nothing).
  It throws at startup if `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are unset, and the backend
  checks the `classrooms` table is reachable before listening.
- The schema **and** the demo seed live in `backend/schema.sql`. Supabase has no migration runner here:
  when you change a table, update `backend/schema.sql` (and the row types/mappers in `backend/src/rows.ts`)
  and re-run the SQL in the Supabase SQL editor. Add fields to `shared/types.ts` first.
- DB columns are snake_case; `rows.ts` maps them to the camelCase entities in `shared/types.ts`.
  Wrap queries in `unwrap()` so database errors become JSON 500s.

## OpenAI is scaffolded, NOT wired in

`openai` is installed and a client exists at `backend/src/openai.ts`, but **no route uses it**. The OpenAI
client existing does **not** mean AI hints are real. `openai.ts` deliberately throws at import time if
`OPENAI_API_KEY` is unset; because nothing imports it yet, the app boots without a key. Importing it from
a route makes the key mandatory at startup.

## Run commands

```bash
npm install                     # root (concurrently)
npm install --prefix backend
npm install --prefix frontend
# or, all at once:
npm run install-all

cp .env.example .env            # then fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (required)
# one-time: paste backend/schema.sql into the Supabase dashboard SQL editor and run it
npm run dev                     # from root: boots backend :4000 and frontend :5173
```

`backend/schema.sql` creates the tables and seeds the demo data: room code **`DEMO123`**, teacher
"Ms. Rivera", students "Alex" and "Sam", two modules. `JWT_SECRET` falls back to an insecure dev default
(with a warning) outside production.

The backend resolves `.env` (repo root) from its working directory, so run it via its npm scripts
(cwd = `backend/`), not `node backend/dist/...` from elsewhere.

Type-check: `cd backend && npx tsc --noEmit`, `cd frontend && npx tsc -b`.

## No automated tests

**Do not write any automated tests** — no unit, integration, E2E, acceptance, snapshot or component tests.
Don't add test files, test runners or frameworks (Jest, Vitest, Playwright, Cypress, Testing Library, etc.),
test scripts in any `package.json`, or CI test steps, even if asked to "verify" or "cover" a change.
Check work by running the app and by type-checking (see above) instead.
