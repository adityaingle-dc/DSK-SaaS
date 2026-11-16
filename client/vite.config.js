import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Always build against the shared package in this repo (../shared), never a copy inside node_modules.
// npm can install "file:../shared" as a copy instead of a link (e.g. on a server); that copy goes stale
// after a git pull and the build then fails with "X is not exported by @dsk/shared".
const sharedEntry = fileURLToPath(new URL('../shared/src/index.js', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@dsk/shared': sharedEntry },
  },
  server: {
    port: 5173,
    proxy: { '/api': process.env.API_PROXY || 'http://localhost:5000' },
    // the shared package lives outside the client folder
    fs: { allow: ['..'] },
  },
});
