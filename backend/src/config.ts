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
// Keep this server-only. Piston should be bound to localhost or an internal network,
// never exposed through a VITE_ variable or called directly by the browser.
export const PISTON_BASE_URL = process.env.PISTON_BASE_URL?.replace(/\/$/, '');
