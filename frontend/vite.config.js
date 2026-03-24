import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    hmr: { host: '100.122.184.88' },
    proxy: {
      '/api': 'http://localhost:5000',
      '/static': 'http://localhost:5000',
    },
  },
})
