import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' so the built app also works from a sub-folder (e.g. GitHub Pages)
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    // OneDrive / synced folders on Windows don't always report file changes; poll instead
    watch: { usePolling: true, interval: 300 },
  },
})