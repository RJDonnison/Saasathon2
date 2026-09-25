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
3. In the dashboard SQL editor, paste and run [`backend/schema.sql`](backend/schema.sql) once. It creates
   the tables and seeds the demo data.
4. `npm run dev` — boots both apps. The backend exits with a clear message if Supabase is unreachable or
   the schema hasn't been run.

## Demo data

`backend/schema.sql` seeds:

- **Room code: `DEMO123`**
- Teacher: `Ms. Rivera` · Students: `Alex`, `Sam`
- Two modules: "Variables and Types", "Loops"

Join as a student and as a teacher (two browser windows) to try the raise-hand flow. Joining with any new
name creates a new user in that classroom.

## What's stubbed

Code execution (`POST /api/code/run`) and AI hints (`POST /api/ai/hint`) return mock responses. The OpenAI
client is scaffolded in `backend/src/openai.ts` but not wired into any route.
