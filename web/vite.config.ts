import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In dev the dashboard runs on :5173 and proxies API + realtime traffic to the backend.
// In production the backend serves the built dashboard from web/dist (same origin).
const API = process.env.VEXA_API_URL || 'http://localhost:3000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': API,
      '/voice': API,
      '/health': API,
      '/socket.io': { target: API, ws: true },
    },
  },
})
