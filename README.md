# Loop Classroom

Loop Classroom is an AI-assisted creative-coding classroom for teachers, tutors, and their students. It turns a live coding lesson into one connected workflow: a teacher creates and runs a lesson, students work through it with contextual hints rather than answers, and the teacher can see who needs help and follow up with evidence after class.

Built for SaaSathon, it addresses a recurring classroom problem: when a learner gets stuck, a teacher cannot be beside every student at once. Rather than putting a generic chatbot beside the work, Loop gives the helper the current lesson, question, code, and recent error; preserves the teacher's ability to step in; and records the learning signals needed for a useful follow-up.

## The end-to-end workflow

1. A teacher creates a private classroom and invites students by email.
2. They plan a lesson with AI or build it by hand, review it, then publish it with the appropriate access setting.
3. They start a live lesson. Students follow the live lesson by default, or work through an available lesson at their own pace.
4. Students read, answer questions, write and run code, check their work, ask the hint-only helper, raise a hand, and receive teacher feedback in context.
5. The teacher sees live presence, hands raised, activity, saved work, and progress; they can open a read-only view of a student's current workspace to help.
6. When the lesson ends, Loop produces a class and student-level feedback view from the recorded activity, including practical teaching and follow-up signals.

## Implemented features

### Classrooms, accounts, and access

- Google sign-in through Supabase Auth, with role-aware student and teacher routes.
- Teachers can create classrooms; people can belong to more than one classroom and switch their active classroom.
- Teachers invite one or many students using school email addresses, optionally with names. Invitations have pending, accepted, and declined states; teachers can cancel an invitation or remove an enrolled student.
- Students see only invitations addressed to their signed-in Google email and explicitly accept or decline before being enrolled. There are no room or join codes.
- Classroom membership is enforced by the backend for classroom data, lessons, work, comments, and live-session controls.

### Teacher lesson authoring

- A lesson builder with titles, introductions, ordered sections, and formatted reading blocks.
- Mixed, reorderable lesson content: reading can sit between questions exactly where the teacher wants it.
- Four question types: multiple choice, short answer, math, and code exercises.
- Multiple-choice answer keys; short-answer keys; and math expected values with a configurable tolerance.
- Code-exercise authoring for JavaScript, TypeScript, and Python, including instructions, starter code, a required function name, teacher notes/checks, hidden test code, and structured automated test cases.
- Per-lesson draft, publish, unpublish, save, and delete controls. Draft lessons are hidden from students.
- Per-lesson access controls: publish a lesson for self-paced access, or make it available only while the teacher is running that lesson live.
- AI lesson planning from a topic and learner level. It can open a structured, reviewable lesson draft in the builder rather than publishing anything automatically.
- Contextual AI builder suggestions against the teacher's in-progress lesson, plus editable AI-generated code-test candidates that a teacher reviews before adding.

### Student learning workspace

- A classroom home with announcements, lesson progress, a “pick up where you left off” view with remaining-question count, and a horizontally scrolling lesson carousel that opens at the first in-progress lesson.
- Full lesson cards are clickable; unavailable lessons are visibly locked. Loading states use skeletons rather than placeholder values.
- A live three-pane workspace for lesson navigation, the lesson itself, and the AI helper. On smaller screens, the panes become accessible tabs.
- Students follow the teacher's live lesson by default, can browse another available lesson, and can return to the teacher's lesson. The app records whether a student was following the live lesson for later feedback.
- Ordered, numbered questions with consistent cards for multiple choice, short answer, math, and code exercises; clear correct and incorrect feedback states; and lesson/section hierarchy.
- Saved answer and code drafts while a student works, durable question and lesson progress, and controls to mark a lesson complete, reopen it, or move to the next available lesson.
- Math-answer validation with arithmetic-expression support.
- Monaco-based coding exercises with starter code, stdout/stderr, JavaScript/TypeScript/Python execution, and teacher-authored automated checks. A coding lesson can also expose a separate playground for experimentation.
- Students can raise a hand, lower it if they no longer need help, and see the short cooldown before raising it again.
- Private, question-specific teacher/student conversations. A conversation does not appear to a student until a teacher starts it; subsequent messages update live and teacher feedback appears in the student notification bell.

### Hint-only AI assistance

- The student helper is available while working in any accessible lesson, not only during a teacher-controlled phase.
- It receives server-loaded, student-safe context for the current lesson and question. For a code question, it can also use the student's current code and last execution error.
- Its product behaviour is deliberately “hints, not answers”: it nudges the learner toward the next useful step instead of supplying a full solution.
- When it can locate a relevant syntax or runtime problem, it can mark and scroll to the relevant code line with a short hint; it does not apply a fix for the student.
- Student helper requests are recorded in the live lesson feedback data. Automated answer-seeking and safety flags are surfaced as teacher review signals, not as conclusions about a student.

### Live teaching and teacher visibility

- Teachers can start a published lesson, move the live class to the previous or next lesson, change the stored teach/work phase, and end the session.
- Live session changes, classroom presence, raised hands, lesson progress, student activity, saved work, and question-conversation messages update through Socket.io.
- The teacher dashboard shows online/offline presence, raised hands, live lesson progress, and each student's current meaningful activity (viewing, answering, writing code, running code, or checking work).
- Selecting a student shows their lesson completion and code-run history. From a raised hand or active student, a teacher can open a read-only live workspace showing the current prompt, saved answer or code draft, current activity, and the private question conversation.
- Teachers can acknowledge a raised hand, post and delete class announcements, and manage lesson access, invitations, and published lessons from the classroom workspace.

### Post-lesson feedback

- Ending a live lesson opens a teacher feedback report with class completion, helper-use rate, independent-work count, time spent following the teacher, average completion time, and quiz-check timing where data exists.
- The report includes an AI-generated class summary, strengths, teaching suggestions, and students suggested for a check-in. It falls back to recorded facts when AI is unavailable.
- Each student has a detailed follow-up view with progress, activity time, helper use, follow percentage, activity timeline, recorded AI-helper turns, review signals, and an AI-suggested teacher check-in based only on captured lesson data.

### Privacy, safety, and platform behaviour

- Student lesson responses deliberately exclude teacher answer keys, hidden code, checks, and automated tests. The server performs access checks before code execution and grading.
- Code runs through a server-side Piston integration, keeping any Piston credential off the client. Execution is limited to JavaScript, TypeScript, and Python with timeouts, memory limits, and per-user rate limits.
- Supabase Postgres stores classrooms, memberships, invitations, lessons, progress, student work, submissions, comments, activity, live sessions, and feedback events.
- Responsive role-specific interfaces include loading skeletons, error/retry states, keyboard-accessible controls, and live updates without requiring a page refresh.

## Technology

| Area | Implementation |
| --- | --- |
| Web app | React 19, TypeScript, Vite, React Router, Tailwind CSS v4 |
| API and live updates | Express, TypeScript, Socket.io |
| Identity and data | Supabase Auth (Google OAuth) and Supabase Postgres |
| Code runtime | Piston, proxied through the authenticated backend |
| AI | OpenAI for student hints, teacher authoring support, code-test suggestions, and lesson feedback |
| Shared contracts | `shared/types.ts` and `shared/events.ts` |

## Run locally

### Prerequisites

- Node.js and npm
- A Supabase project with Google OAuth enabled
- A Piston `/api/v2` instance for code execution (the default assumes `http://localhost:2000/api/v2`)
- An OpenAI API key for AI features; the non-AI classroom workflow still runs without one

### Setup

```bash
npm install
npm install --prefix backend
npm install --prefix frontend
# or: npm run install-all
```

1. Copy `.env.example` to `.env` and supply the Supabase values:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
2. In the Supabase SQL editor, run [`backend/schema.sql`](backend/schema.sql).
3. Enable Google under Supabase Authentication and configure its callback URL as `https://<project-ref>.supabase.co/auth/v1/callback`. OAuth redirects to `window.location.origin`; for local development, set the site URL to `http://localhost:5173` and add `http://localhost:5173/**` to the redirect URLs.
4. Set `PISTON_API_URL` if Piston is not at the local default. `PISTON_AUTH_TOKEN` is optional for a protected hosted Piston instance.
5. Set `OPENAI_API_KEY` (and optionally `OPENAI_MODEL`) to enable AI features.
6. Start both applications:

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The API and Socket.io server run on [http://localhost:4000](http://localhost:4000); Vite proxies `/api` and `/socket.io` during development.

## Deploy with Render and Vercel

Connect the GitHub repository to Render and Vercel. Both services can auto-deploy commits pushed to `main`.

1. **Deploy the backend first.** In Render, create a Blueprint from this repository; the root [`render.yaml`](render.yaml) creates the API service and builds from the repository root so imports from `shared/` resolve. It sets `CLIENT_ORIGINS` to the exact production frontend origin: `https://saasathon2-5plpmnqdj-reuben19.vercel.app`. Set its dashboard secrets and configuration: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and a production `PISTON_API_URL`. Set `PISTON_AUTH_TOKEN` when that hosted Piston service requires it. `OPENAI_API_KEY` and `OPENAI_MODEL` are optional.
2. **Deploy the frontend.** In Vercel, set the project root directory to `frontend`. Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_API_ORIGIN`, and `VITE_SOCKET_ORIGIN`; both API/socket variables are service configuration and should be the HTTPS Render service URL, without a trailing slash. The included `frontend/vercel.json` only supplies the React Router SPA fallback—it does not proxy API or Socket.io traffic. Disable Vercel Deployment Protection for public access; otherwise visitors receive Vercel's login page.
3. In Supabase Authentication URL Configuration, add the exact URL `https://saasathon2-5plpmnqdj-reuben19.vercel.app` to Redirect URLs (and use it as the Site URL as appropriate). OAuth uses `window.location.origin`; do not use preview wildcards. Keep the Supabase Google callback URL as `https://<project-ref>.supabase.co/auth/v1/callback`.

The local Piston default cannot serve production traffic: deploy or subscribe to a hosted Piston `/api/v2` endpoint before enabling production code runs. Render's free web services can cold-start and temporarily interrupt Socket.io; the client reconnects, but users may briefly see stale realtime presence until it reconnects. Protect `main` in GitHub branch protection and require the **Typecheck** status check before merge so the Render/Vercel main-branch deployments only receive reviewed changes.

### Try the complete workflow

Use two Google accounts (or a normal and private browser window): sign in as a teacher, create a classroom, invite the second account, accept the invitation as that student, create or generate and publish a lesson, then start it live. The teacher and student views can then be used side by side to test live presence, hands, activity, feedback, and the hint-only assistant.

## Project structure

```text
shared/     Shared TypeScript entities, REST contracts, and socket event shapes
backend/    Express API, Supabase access, Piston proxy, AI routes, and Socket.io server
frontend/   React teacher and student experiences
```

The public API is authenticated with the Supabase access token in `Authorization: Bearer <token>`. `shared/types.ts` is the authoritative description of request and response shapes.
