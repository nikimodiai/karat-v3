import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Manual code-splitting reduces the 900kB monolithic bundle into
// smaller chunks so customers on slow Indian 4G load the dashboard faster.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          // Charting (heavy: recharts pulls d3-* tree)
          charts:   ['recharts'],
          // Supabase client
          supabase: ['@supabase/supabase-js'],
          // Lucide icons (shake-friendly but lots of imports)
          icons:    ['lucide-react'],
          // React core
          react:    ['react', 'react-dom'],
        },
      },
    },
  },
})