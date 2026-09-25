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

const DEV_JWT_SECRET = 'dev-only-insecure-secret';

function resolveJwtSecret(): string {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set when NODE_ENV=production (see .env.example).');
  }
  console.warn('[config] JWT_SECRET is not set — using an insecure dev default. Copy .env.example to .env.');
  return DEV_JWT_SECRET;
}

export const JWT_SECRET = resolveJwtSecret();
