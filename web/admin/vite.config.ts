import { fileURLToPath, URL } from 'node:url';

import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/admin-assets/',
  build: {
    assetsDir: 'assets',
    emptyOutDir: true,
    outDir: fileURLToPath(new URL('../../dist-web/admin', import.meta.url)),
  },
  plugins: [vue()],
  root: fileURLToPath(new URL('.', import.meta.url)),
});
