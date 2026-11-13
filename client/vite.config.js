import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': process.env.API_PROXY || 'http://localhost:5000' },
    // @dsk/shared is a local package symlinked from ../shared
    fs: { allow: ['..'] },
  },
});
