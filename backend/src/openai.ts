import OpenAI from 'openai';
import './config.js'; // ensure .env is loaded before reading process.env

// Scaffolded singleton — NOT imported by any route yet (see the commented block in routes/ai.ts).
// Because it throws when the key is missing, importing it is what makes OPENAI_API_KEY "required".
if (!process.env.OPENAI_API_KEY) {
  throw new Error(
    'OPENAI_API_KEY is not set. Add it to .env (see .env.example) before importing backend/src/openai.ts.',
  );
}

export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
