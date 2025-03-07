import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backendUrl = process.env.VITE_BACKEND_URL || 'https://ifcfile-to-graph.azurewebsites.net';
//const backendUrl = process.env.VITE_BACKEND_URL || 'http://localhost:7071';
const isSecure = backendUrl.startsWith('https');

export default defineConfig({
  base: "./",
  build: {
    sourcemap: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: backendUrl,
        changeOrigin: true,
        secure: isSecure
      },
    },
  },
  plugins: [react()],
})
