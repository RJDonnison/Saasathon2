import dotenv from "dotenv";
import path from "node:path";

// Paths are anchored to the working directory, which is backend/ for every npm script
// (dev, start, and root `npm run dev --prefix backend`). Unlike import.meta.url this is the
// same in src/ (tsx) and dist/ (compiled), so .env resolves identically in both.
const backendDir = process.cwd();

// Load the single root-level .env (backend/ -> repo root). Missing file is fine.
dotenv.config({ path: path.resolve(backendDir, "../.env"), quiet: true });

export const PORT = Number(process.env.PORT ?? 4000);

function parseClientOrigins(value: string): ReadonlySet<string> {
  const entries = value.split(",").map((entry) => entry.trim());
  if (entries.length === 0 || entries.some((entry) => entry.length === 0)) {
    throw new Error(
      "CLIENT_ORIGINS must be a non-empty comma-separated list of origins",
    );
  }

  const origins = new Set<string>();
  for (const entry of entries) {
    let url: URL;
    try {
      url = new URL(entry);
    } catch {
      throw new Error(`CLIENT_ORIGINS contains an invalid origin: ${entry}`);
    }
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.origin === "null" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      throw new Error(`CLIENT_ORIGINS contains an invalid origin: ${entry}`);
    }
    origins.add(url.origin);
  }
  return origins;
}

if (process.env.NODE_ENV === "production" && !process.env.CLIENT_ORIGINS) {
  throw new Error("CLIENT_ORIGINS must be configured in production");
}

// Local development may omit the setting; production requires an explicit allowlist.
export const CLIENT_ORIGINS = parseClientOrigins(
  process.env.CLIENT_ORIGINS ?? "http://localhost:5173",
);

/** Shared by Express and Socket.io so both transports enforce the same allowlist. */
export function isAllowedClientOrigin(origin: string | undefined): boolean {
  return typeof origin === "string" && CLIENT_ORIGINS.has(origin);
}

// Piston runs locally by default. A hosted instance can be configured explicitly when needed.
// Keep its URL and any credential server-side: submitted code must never call it directly from
// the browser.
export const PISTON_API_URL = (
  process.env.PISTON_API_URL ?? "http://localhost:2000/api/v2"
).replace(/\/$/, "");
export const PISTON_AUTH_TOKEN = process.env.PISTON_AUTH_TOKEN?.trim();
