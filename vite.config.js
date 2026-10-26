import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Same .env the API reads, so changing PORT there moves both ends of the proxy together.
  // The '' prefix loads every key, not only VITE_ ones.
  const env = loadEnv(mode, process.cwd(), '');
  const apiPort = env.PORT || process.env.PORT || 8787;
  return {
    root: 'web',
    plugins: [react()],
    server: {
      port: 5273,
      open: true,
      proxy: { '/api': `http://127.0.0.1:${apiPort}` },
    },
    build: { outDir: '../dist', emptyOutDir: true },
  };
});
