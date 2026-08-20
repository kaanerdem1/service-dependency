import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    /** ngrok / cloudflared audit — URL oturum başına değişir */
    allowedHosts: ['.ngrok-free.dev', '.ngrok.io', '.ngrok.app', '.trycloudflare.com'],
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
      },
    },
  },
})
