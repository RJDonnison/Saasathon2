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
- Auth is **Supabase Auth with Google OAuth** (see "Auth" below). The backend issues no tokens of its own.

## The contract rule

`shared/types.ts` (entities + REST request/response types) and `shared/events.ts` (socket payloads) are
the **single source of truth**. Both apps import them by relative path. **Add or change fields there
first**; never fork or redeclare these types locally in frontend or backend.

- Frontend imports the `.ts` path directly: `import type { User } from '../../shared/types'`
- Backend uses NodeNext, so relative imports need a `.js` extension even though the file is `.ts`:
  `import type { User } from '../../shared/types.js'`
- Keep `shared/` free of runtime code and dependencies (types only) so it needs no build step.

## Auth

- The browser signs in with Google via `supabase.auth.signInWithOAuth` (`frontend/src/supabase.ts`, public
  publishable key, **auth only** — data still goes through our backend's `/api`, never straight from the
  browser). supabase-js stores and auto-refreshes the session.
- Every API call sends `Authorization: Bearer <Supabase access token>`; the socket handshake sends the same
  token as `auth.token` (`frontend/src/api.ts`, `frontend/src/socket.ts`). Do **not** hand-roll JWT
  signing/verification or add a login/logout endpoint — the backend validates tokens with
  `supabase.auth.getUser(token)` (`backend/src/auth.ts`, briefly cached).
- Two levels of access: `requireIdentity` = valid Google session (used by `/api/auth/join` and
  `/api/auth/me`); `requireMember` = identity that has also joined a classroom (everything else).
- Signing in is not enough to use the app: the user then enters a **room code + role** on the join page
  (`POST /api/auth/join`), which upserts their global `users` row (`users.id` = the Supabase auth user id; name
  from their Google profile) and creates or updates a classroom membership. Role and classroom are read from
  the most recently joined membership on every request — not from the token.
  Anyone with a room code can pick the teacher role — by design for now.
- Sign-out is `supabase.auth.signOut()`.

## Current stub status

REAL (backed by Supabase / real socket broadcasts):
- `POST /api/auth/join`, `GET /api/auth/me` (Supabase Auth + Google)
- Classroom, module (create/read/update/delete, teacher-only writes), progress and comment endpoints
- Socket.io: presence (`presence_update`), `raise_hand`, `student_status_update`, broadcast to a
  classroom-scoped room (`io.to(classroomId)`). The server trusts the authenticated user (from the Supabase token), not the client payload.

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
- The remote schema is fixed under the no-schema-change constraint. `backend/schema.sql` is a reference/demo
  seed only; do not run it as an upgrade script or alter the remote schema. Modules support only
  `id`, `classroom_id`, `title`, `content`, `created_at`, and `position`.
- The seeded demo users (Ms. Rivera, Alex, Sam) have no auth account; they only populate the teacher's
  grid. Real users are created by `POST /api/auth/join`.
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

cp .env.example .env            # fill in the SUPABASE_* and VITE_SUPABASE_* values (all required)
# use the existing remote Supabase schema; do not run backend/schema.sql as an upgrade
# one-time: enable Google sign-in (see below)
npm run dev                     # from root: boots backend :4000 and frontend :5173
```

**Google sign-in setup (one-time, dashboard only):**
1. Google Cloud Console -> APIs & Services -> Credentials -> Create OAuth client ID (Web application). Add
   the authorized redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`.
2. Supabase dashboard -> Authentication -> Sign In / Providers -> Google: enable, paste the client ID + secret.
3. Supabase dashboard -> Authentication -> URL Configuration: set Site URL to `http://localhost:5173` and
   add `http://localhost:5173/**` to Redirect URLs.

`VITE_SUPABASE_*` are read from the root `.env` (`envDir: '..'` in `frontend/vite.config.ts`). Only
`VITE_`-prefixed vars reach the browser, so `SUPABASE_SERVICE_ROLE_KEY` never does — don't change
`envPrefix`, and never put the service-role key in a `VITE_` var. Restart the dev server after editing `.env`.

`backend/schema.sql` is a reference/demo seed for a separately provisioned database: room code **`DEMO123`**, teacher
"Ms. Rivera", students "Alex" and "Sam", two modules.

The backend resolves `.env` (repo root) from its working directory, so run it via its npm scripts
(cwd = `backend/`), not `node backend/dist/...` from elsewhere.

Type-check: `cd backend && npx tsc --noEmit`, `cd frontend && npx tsc -b`.

## No automated tests

**Do not write any automated tests** — no unit, integration, E2E, acceptance, snapshot or component tests.
Don't add test files, test runners or frameworks (Jest, Vitest, Playwright, Cypress, Testing Library, etc.),
test scripts in any `package.json`, or CI test steps, even if asked to "verify" or "cover" a change.
Check work by running the app and by type-checking (see above) instead.

## Frontend styling

- Tailwind v4 utility classes only — no separate CSS files, no CSS-in-JS, no inline `style={}` for
  layout. If a one-off value is truly needed, use Tailwind's arbitrary-value syntax (`w-[123px]`)
  rather than a `style` attribute.
- Layout is done with **flex and grid utilities** (`flex`, `grid`, `gap-*`, `items-*`, `justify-*`,
  `grid-cols-*`, etc.) — not `position: absolute`/`fixed`, not manual `top/left/margin` offsets to
  place elements. Reach for `absolute`/`relative` only for genuine overlay cases (badges, tooltips,
  modals), not general page layout.
- Responsive behavior uses Tailwind's breakpoint prefixes (`sm:`, `md:`, `lg:`) rather than custom
  media queries.
- Don't hand-roll spacing with arbitrary margins on every element — prefer `gap-*` on the flex/grid
  parent so spacing lives in one place.
