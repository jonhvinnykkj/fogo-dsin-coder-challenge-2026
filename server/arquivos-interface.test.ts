// Arquivos da interface compilada: versão comprimida pronta conforme o Accept-Encoding e cache certo para cada tipo.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { cacheDoArquivo, criarApp } from './app';
import { criarCtxDeTeste } from './test/ctx';

const JS = 'console.log("F.O.G.O.");\n'.repeat(200);
let pasta: string;
let app: FastifyInstance | undefined;

async function montar(): Promise<FastifyInstance> {
  pasta = mkdtempSync(join(tmpdir(), 'fogo-web-'));
  mkdirSync(join(pasta, 'assets'));
  writeFileSync(join(pasta, 'index.html'), '<!doctype html><title>F.O.G.O.</title>');
  writeFileSync(join(pasta, 'assets', 'index-abc.js'), JS);
  writeFileSync(join(pasta, 'assets', 'index-abc.js.br'), brotliCompressSync(JS));
  writeFileSync(join(pasta, 'assets', 'index-abc.js.gz'), gzipSync(JS));
  app = await criarApp(criarCtxDeTeste(), { pastaWeb: pasta, limitePorMinuto: 100_000 });
  return app;
}

afterEach(async () => {
  await app?.close();
  app = undefined;
  rmSync(pasta, { recursive: true, force: true });
});

describe('arquivos da interface', () => {
  it('entrega a versão .br pronta a quem aceita brotli, .gz a quem só aceita gzip e o original aos demais', async () => {
    const a = await montar();
    const br = await a.inject({ method: 'GET', url: '/assets/index-abc.js', headers: { 'accept-encoding': 'gzip, deflate, br' } });
    expect(br.headers['content-encoding']).toBe('br');
    expect(br.headers['content-type']).toMatch(/javascript/);
    expect(br.headers.vary).toMatch(/accept-encoding/i);
    expect(br.rawPayload.length).toBeLessThan(JS.length / 10);

    const gz = await a.inject({ method: 'GET', url: '/assets/index-abc.js', headers: { 'accept-encoding': 'gzip' } });
    expect(gz.headers['content-encoding']).toBe('gzip');

    const puro = await a.inject({ method: 'GET', url: '/assets/index-abc.js' });
    expect(puro.headers['content-encoding']).toBeUndefined();
    expect(puro.body).toBe(JS);
  });

  it('arquivo com hash no nome fica guardado um ano; a página sempre é conferida (build novo aparece na hora)', async () => {
    const a = await montar();
    const js = await a.inject({ method: 'GET', url: '/assets/index-abc.js', headers: { 'accept-encoding': 'br' } });
    expect(js.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    for (const url of ['/', '/previsoes']) {
      const pagina = await a.inject({ method: 'GET', url });
      expect(pagina.statusCode).toBe(200);
      expect(pagina.headers['cache-control']).toBe('no-cache');
    }
  });

  it('a regra do cache reconhece a pasta assets com barra normal e invertida (Windows)', () => {
    expect(cacheDoArquivo('/app/dist/web/assets/index-abc.js.br')).toMatch(/immutable/);
    expect(cacheDoArquivo('C:\\fogo\\dist\\web\\assets\\index-abc.js')).toMatch(/immutable/);
    expect(cacheDoArquivo('/app/dist/web/index.html')).toBe('no-cache');
  });
});
