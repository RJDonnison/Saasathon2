import dotenv from 'dotenv';
import path from 'node:path';

// Paths are anchored to the working directory, which is backend/ for every npm script
// (dev, start, and root `npm run dev --prefix backend`). Unlike import.meta.url this is the
// same in src/ (tsx) and dist/ (compiled), so .env resolves identically in both.
const backendDir = process.cwd();

// Load the single root-level .env (backend/ -> repo root). Missing file is fine.
dotenv.config({ path: path.resolve(backendDir, '../.env'), quiet: true });

export const PORT = Number(process.env.PORT ?? 4000);
export const CLIENT_ORIGIN = 'http://localhost:5173';

// Piston runs locally by default. A hosted instance can be configured explicitly when needed.
// Keep its URL and any credential server-side: submitted code must never call it directly from
// the browser.
export const PISTON_API_URL = (process.env.PISTON_API_URL ?? 'http://localhost:2000/api/v2').replace(/\/$/, '');
export const PISTON_AUTH_TOKEN = process.env.PISTON_AUTH_TOKEN?.trim();
