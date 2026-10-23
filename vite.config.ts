import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { comprimirPasta } from './scripts/comprimir-build.mjs';

/** No fim de todo build, as versões .br/.gz que o servidor entrega prontas (scripts/comprimir-build.mjs). */
function comprimirBuild(): Plugin {
  let saida = '';
  return {
    name: 'fogo-comprimir-build',
    apply: 'build',
    configResolved(config) {
      saida = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      comprimirPasta(saida);
    },
  };
}

// Interface em web/, build em dist/web (servido pelo Fastify).
// Em desenvolvimento o Vite (5173) repassa /api para o servidor (3333).
export default defineConfig({
  root: 'web',
  plugins: [react(), comprimirBuild()],
  build: { outDir: '../dist/web', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://127.0.0.1:3333', changeOrigin: true } },
  },
});
