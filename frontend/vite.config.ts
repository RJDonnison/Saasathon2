import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Read the single root .env. Only VITE_-prefixed vars reach the browser; server secrets
  // (SUPABASE_SERVICE_ROLE_KEY etc.) stay out. Don't change envPrefix.
  envDir: '..',
  server: {
    port: 5173,
    strictPort: true,
    // ../shared/*.ts lives outside this project root
    fs: { allow: ['..'] },
    proxy: {
      '/api': 'http://localhost:4000',
      '/socket.io': { target: 'http://localhost:4000', ws: true },
    },
  },
})
