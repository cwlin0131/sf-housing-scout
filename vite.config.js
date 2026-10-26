import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'web',
  plugins: [react()],
  server: {
    port: 5273,
    open: true,
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
  build: { outDir: '../dist', emptyOutDir: true },
});
