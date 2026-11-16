import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Always build against the shared package in this repo (../shared), never a copy inside node_modules.
// npm can install "file:../shared" as a copy instead of a link (e.g. on a server); that copy goes stale
// after a git pull and the build then fails with "X is not exported by @dsk/shared".
const sharedEntry = fileURLToPath(new URL('../shared/src/index.js', import.meta.url));

// Domains the app may be opened on (Vite blocks unknown hosts). Add more comma-separated in ALLOWED_HOSTS.
const allowedHosts = ['portal.dskrishna.in', '.dskrishna.in', ...(process.env.ALLOWED_HOSTS || '').split(',').map((h) => h.trim()).filter(Boolean)];
const apiTarget = process.env.API_PROXY || 'http://localhost:5000';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@dsk/shared': sharedEntry },
  },
  server: {
    port: 5173,
    allowedHosts,
    proxy: { '/api': apiTarget },
    // the shared package lives outside the client folder
    fs: { allow: ['..'] },
  },
  // `vite preview` (serving the built app): same domains and the same /api forwarding to the backend
  preview: {
    allowedHosts,
    proxy: { '/api': apiTarget },
  },
});
