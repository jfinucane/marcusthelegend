import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    hmr: { host: 'spark-b0aa.taileb1e78.ts.net', clientPort: 443 },
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
      '/api': {
        target: 'http://host.docker.internal:5000',
        proxyTimeout: 180000,
        timeout: 180000,
      },
      '/static': 'http://host.docker.internal:5000',
    },
  },
})
