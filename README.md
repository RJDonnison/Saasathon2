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
- Two modules: "Variables and Types", "Loops"

Sign in with Google, then join with `DEMO123` as a student in one browser window and as a teacher in another
(use two Google accounts, or a normal window plus a private one) to try the raise-hand flow. Your name comes
from your Google profile. Alex and Sam are demo rows with no login; they just populate the teacher's grid.

## What's stubbed

Code execution (`POST /api/code/run`) and AI hints (`POST /api/ai/hint`) return mock responses. The OpenAI
client is scaffolded in `backend/src/openai.ts` but not wired into any route.
