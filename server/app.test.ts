// Arquivos estáticos e fallback da SPA: rota da interface devolve o index.html; arquivo que não existe devolve 404.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { criarApp } from './app';
import { criarCtxDeTeste } from './test/ctx';

const TEM_INTERFACE = existsSync(fileURLToPath(new URL('../dist/web/index.html', import.meta.url)));

let app: FastifyInstance;
beforeAll(async () => {
  app = await criarApp(criarCtxDeTeste());
});
afterAll(async () => {
  await app.close();
});

describe('arquivos da interface', () => {
  // Aba aberta antes de um novo build pede um /assets/*.js que não existe mais: com 200 + index.html o navegador
  // reclama de tipo de arquivo (MIME); com 404 fica claro que é só recarregar.
  it('arquivo que não existe (/assets/*.js, *.css, favicon) responde 404, não o index.html', async () => {
    for (const url of ['/assets/index-naoexiste123.js', '/assets/estilo-velho.css', '/favicon-antigo.ico']) {
      const r = await app.inject({ method: 'GET', url });
      expect(r.statusCode, url).toBe(404);
      expect(r.headers['content-type'] ?? '').not.toContain('text/html');
    }
  });

  it.runIf(TEM_INTERFACE)('rota da interface (sem extensão) continua abrindo o index.html', async () => {
    const r = await app.inject({ method: 'GET', url: '/equipamentos/5/editar' });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toContain('text/html');
  });

  it('rota de API que não existe responde 404 em JSON', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/nao-existe' });
    expect(r.statusCode).toBe(404);
    expect(r.json()).toEqual({ erro: 'Rota não encontrada' });
  });
});
