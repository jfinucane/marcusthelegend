import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    hmr: { host: 'spark-b0aa.taileb1e78.ts.net' },
    headers: {
      'Access-Control-Allow-Private-Network': 'true',
    },
    allowedHosts: [
      'marcusthelegend.com',
      'www.marcusthelegend.com',
      'https://spark-b0aa.taileb1e78.ts.net',
      "spark-b0aa.taileb1e78.ts.net"
    ],  
    proxy: {
      '/api': 'http://localhost:5000',
      '/static': 'http://localhost:5000',
    },
  },
})
