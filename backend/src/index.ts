import http from "node:http";
import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import { CLIENT_ORIGIN, PORT } from "./config.js";
import { assertDatabaseReady } from "./supabase.js";
import { requireMember } from "./auth.js";
import { authRouter } from "./routes/auth.js";
import { classroomsRouter } from "./routes/classrooms.js";
import { modulesRouter } from "./routes/modules.js";
import { commentsRouter } from "./routes/comments.js";
import { progressRouter } from "./routes/progress.js";
import { codeRouter } from "./routes/code.js";
import { aiRouter } from "./routes/ai.js";
import { mathRouter } from "./routes/math.js";
import { activityRouter } from "./routes/activity.js";
import { attachSockets } from "./sockets.js";

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

// Public
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});
// Signed in with Google (Supabase session), no classroom needed yet: POST /join, GET /me
app.use("/api/auth", authRouter);

// Everything below requires a signed-in user who has joined a classroom (attaches req.user)
app.use("/api", requireMember);
app.use("/api/classrooms", classroomsRouter);
app.use("/api/modules", modulesRouter);
app.use("/api/comments", commentsRouter);
app.use("/api", progressRouter);
app.use("/api/code", codeRouter);
app.use("/api/ai", aiRouter);
app.use("/api/math", mathRouter);
app.use("/api/activity", activityRouter);

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Malformed JSON etc. -> JSON error body instead of Express's default HTML page.
const onError: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = typeof err?.status === "number" ? err.status : 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    error:
      status >= 500
        ? "Internal server error"
        : String(err.message ?? "Bad request"),
  });
};
app.use(onError);

// Fail fast (before opening the port) if Supabase is unreachable or schema.sql wasn't run.
try {
  await assertDatabaseReady();
} catch (err) {
  console.error(`[backend] ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}

const server = http.createServer(app);
attachSockets(server);

server.listen(PORT, () => {
  console.log(
    `[backend] REST + Socket.io listening on http://localhost:${PORT}`,
  );
});
