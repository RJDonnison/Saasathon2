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
  `/api/auth/me`); `requireMember` = identity that has also been assigned to a classroom (everything else).
- Teachers bootstrap through `POST /api/auth/join`, which upserts their global `users` row and creates a teacher
  membership. Students are assigned by school email from the teacher roster; `/api/auth/me` matches the Google
  email, upserts the user row, and creates the student membership. The browser retries `/api/auth/me` while a
  signed-in identity has no membership yet. Role and classroom come from the most recently joined membership.
- Sign-out is `supabase.auth.signOut()`.

## Current stub status

REAL (backed by Supabase / real socket broadcasts):
- `POST /api/auth/join`, `GET /api/auth/me` (Supabase Auth + Google)
- Classroom, module (create/read/update/delete, teacher-only writes), progress and comment endpoints
- AI (OpenAI): `POST /api/ai/hint` (student "I'm stuck" tutor) and `POST /api/ai/draft` (teacher module
  drafting/planning) — see "AI service" below. Needs `OPENAI_API_KEY`; without it they return 503.
- `POST /api/code/run` — runs JavaScript, TypeScript and Python in the configured Piston sandbox. It is
  constrained to a 3-second run, 25,000-character source, and 12 runs/user/minute.
- Socket.io: presence (`presence_update`), `raise_hand`, `student_status_update`, broadcast to a
  classroom-scoped room (`io.to(classroomId)`). The server trusts the authenticated user (from the Supabase token), not the client payload.

MOCKED — don't "fix" these into real implementations unless explicitly asked; that is follow-up feature work:

- Most frontend components under `frontend/src/student/` and `frontend/src/teacher/` are placeholders
  with static/mock content. The student's multiple-choice / short-answer questions are local-only (no attempts
  endpoint is wired up).

## Database: Supabase only

**Supabase (Postgres) is the only database.** There is no SQLite and no local DB file — don't add one.

- All data access goes through the client in `backend/src/supabase.ts`, using the **service-role key**
  (server-side only; it bypasses RLS, and RLS is enabled with no policies so the anon key can access nothing).
  It throws at startup if `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are unset, and the backend
  checks the `classrooms` table is reachable before listening.
- The schema **and** the demo seed live in `backend/schema.sql`. Supabase has no migration runner here:
  when you change a table, update `backend/schema.sql` (and the row types/mappers in `backend/src/rows.ts`)
  and re-run the SQL in the Supabase SQL editor. Add fields to `shared/types.ts` first.
- The seeded demo users (Ms. Rivera, Alex, Sam) have no auth account; they only populate the teacher's
  grid. Real users are created by `POST /api/auth/join`.
- DB columns are snake_case; `rows.ts` maps them to the camelCase entities in `shared/types.ts`.
  Wrap queries in `unwrap()` so database errors become JSON 500s.

## AI service (OpenAI)

A thin, **stateless** wrapper over the OpenAI chat API inside the backend (`backend/src/openai.ts`,
`backend/src/ai/prompts.ts`, `backend/src/routes/ai.ts`). Callers send a question; the server loads the
module itself (scoped to the caller's classroom), so clients can't inject or swap the context.
- `POST /api/ai/hint` — **student only**. A tutor scoped to `moduleId` that gives **hints, never answers**
  (a deliberate design choice — this project pushes back against AI doing students' work). Optional
  `history` (the client re-sends the transcript), `code` (the editor the student last touched), `exerciseId` and
  `error` (a failed run's output). `studentId` must be the caller. When `code` is sent the model replies in JSON
  and the response may carry a `highlight` (`{line, endLine?, note}`, 1-based, validated server-side to lie inside
  the submitted code) that the editor marks and scrolls to. The tutor only *locates* a problem, never fixes it.
- `POST /api/ai/draft` — **teacher only** (stretch). Helps draft/plan modules; optional `moduleId` and
  unsaved `draft` as context. Replies in Markdown. No UI yet: the teacher dashboard calls `api.aiDraft`.
- **Never give the student prompt answer material.** The student context is built only from the
  student-safe module aggregate (`aggregate(module, false)` → `studentModuleContext`), which excludes
  answer keys, reference answers and checks. Keep it that way; don't add those fields to it. (The teacher
  prompt does include them — it's the teacher's own material.)
- The hint behaviour lives in `hintSystemPrompt`; change tutoring style there. Prompt quality is best judged
  against a real model — tune it with real conversations.
- Config: `OPENAI_API_KEY` (no key -> the AI routes return 503 with a clear message; the rest of the app
  still boots), optional `OPENAI_MODEL` (default `gpt-4o-mini`), and the SDK's `OPENAI_BASE_URL`.
- Guards: per-user rate limit (20/min, in-memory), input size caps, and OpenAI errors are mapped to a generic
  502 (never leaked). Known limit: chat history is client-supplied, so a determined student could forge
  "assistant" turns; the system prompt tells the model to hold the line, but it isn't a hard guarantee.

## Student dashboard

Two columns: the lesson on the left, the tutor (`AiChatPanel`) on the right, `sticky` under the top bar so it
stays on screen while the lesson scrolls (stacked on phones). A lesson (`ModuleView`) renders its sections in
order; each section is its Markdown content blocks followed by its questions, so teachers interleave reading and
work by ordering sections (read -> practice -> read -> practice). Blocks and questions have separate `position`
sequences, so they can't be mixed *within* a section without a contract change. Each code exercise gets its own
`CodeEditor`; there is also a free playground at the end. `WorkspaceContext` shares editor text, the active
editor and the tutor's highlight between the columns. Each editor is Monaco; tutor highlights are Monaco
whole-line decorations and are revealed in the editor when received. Monaco is lazy-loaded only when a code
segment is rendered.

## Code execution (Piston)

`backend/src/routes/code.ts` sends code to the Piston instance selected by `PISTON_API_URL` (default:
`http://localhost:2000/api/v2`). Set `PISTON_AUTH_TOKEN` for a hosted instance that requires bearer auth;
both values are server-only. The local Piston service normally needs no token.

## Run commands

```bash
npm install                     # root (concurrently)
npm install --prefix backend
npm install --prefix frontend
# or, all at once:
npm run install-all

cp .env.example .env            # fill in the SUPABASE_* and VITE_SUPABASE_* values (all required)
# one-time: paste backend/schema.sql into the Supabase dashboard SQL editor and run it
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

`backend/schema.sql` creates the tables and seeds the demo data: room code **`DEMO123`**, teacher
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

- Tailwind v4 utility classes only — no separate CSS files, the current ones we have should be how 
  the app is based on and styled, no CSS-in-JS, no inline `style={}` for
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
- **Colours and fonts come from `frontend/src/app.css`'s `@theme`; everything else is Tailwind.** Use the tokens
  (`bg-canvas`, `bg-surface`, `bg-surface-soft`, `text-ink`, `text-muted`, `border-border`, `bg-accent`, the pastel
  `bg-mint`/`text-mint-ink`, `bg-peach`/`text-peach-ink`, `bg-lavender`/`text-lavender-ink`, `font-display`,
  `font-mono`) — no hard-coded hex values and no custom CSS classes in the signed-in screens. If a colour is
  missing, add a token to `@theme` rather than inlining a hex.
- **Shared pieces:** build signed-in screens from `frontend/src/ui/` (`AppShell`, `Card`, `Heading`, `Button`,
  `Eyebrow`, `Avatar`, `Dot`, `InlineText`, `icons`) and the class strings in `ui/styles.ts` (`CARD`, `INPUT`,
  `TINT`) instead of restyling from scratch.
- **Gotcha — global rules in `app.css`:** it has *unlayered* element rules (`h1`/`h2`/`h3` sizes, `p { margin-top: 0 }`,
  `button, a, input, select, textarea { font: inherit }`), and unlayered CSS beats Tailwind's layered utilities. On
  those elements a size/weight/leading/margin utility silently does nothing unless it uses Tailwind's important
  modifier (`text-sm!`, `font-semibold!`, `m-0!`). `Heading`, `Button` and `INPUT` already do this — use them rather
  than a bare `<h1>`/`<button>`/`<input>`, and add `!` to font utilities on a bare `<a>`/`<Link>`. Write `!` utilities
  out *literally*: Tailwind finds classes by scanning text, so `${CONSTANT}!` produces nothing. No `mt-*` on a `<p>`.
  Don't edit the landing page's global rules to "fix" this; it depends on them.
