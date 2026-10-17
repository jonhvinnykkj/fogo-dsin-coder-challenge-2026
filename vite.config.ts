import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Interface em web/, build em dist/web (servido pelo Fastify).
// Em desenvolvimento o Vite (5173) repassa /api para o servidor (3333).
export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: { outDir: '../dist/web', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://127.0.0.1:3333', changeOrigin: true } },
  },
});
