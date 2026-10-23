import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === "build" ? "/static/" : "/",
  build: { chunkSizeWarningLimit: 900 },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8001",
      "/admin": "http://localhost:8001",
    },
  },
}))
