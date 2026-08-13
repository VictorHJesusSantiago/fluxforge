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
      '/api': process.env['VITE_PROXY_TARGET'] ?? 'http://localhost:3000',
    },
  },
  build: {
    outDir: 'dist',
  },
});
