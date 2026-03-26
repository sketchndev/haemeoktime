import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/haemeoktime/',
  server: {
    proxy: {
      '/haemeoktime/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/haemeoktime/, ''),
      },
    },
  },
})
