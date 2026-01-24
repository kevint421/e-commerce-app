import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Disable module preload polyfill which adds crossorigin attribute
    // This fixes CORS issues with CloudFront when CORS headers aren't configured
    modulePreload: false,
  }
})
