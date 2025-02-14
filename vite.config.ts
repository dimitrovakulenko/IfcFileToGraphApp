import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

//const backendUrl = process.env.VITE_BACKEND_URL || 'http://localhost:9090';
const backendUrl = 'http://localhost:5050';
const isSecure = backendUrl.startsWith('https');

// https://vite.dev/config/
export default defineConfig({
  base: "./",
  build: {
    sourcemap: true,
  },
  server: {
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
