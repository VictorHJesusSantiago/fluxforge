import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const pkg = (name: string) => fileURLToPath(new URL(`../${name}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@fluxforge/core': pkg('core'),
      '@fluxforge/sdk': pkg('sdk'),
    },
  },
  server: {
    port: 5180,
    proxy: {
      // The server (default :3000) owns everything under /api and every webhook path — the
      // editor only ever talks to it via fetch, never bundles server code, so a dev-time proxy
      // is the whole integration; production simply serves both from wherever they're deployed.
      '/api': process.env['VITE_PROXY_TARGET'] ?? 'http://localhost:3000',
    },
  },
  build: {
    outDir: 'dist',
  },
});
