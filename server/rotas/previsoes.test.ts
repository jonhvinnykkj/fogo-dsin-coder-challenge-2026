import { performance } from 'node:perf_hooks';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ResumoPreditivo } from '../../shared/modelos';
import { criarAppDeTeste } from '../test/app';
import { cidadeSemeada } from '../preditivo/test-helpers';

const ROTAS = ['/api/previsoes/risco?horas=24', '/api/previsoes/risco?horas=168', '/api/previsoes/backtest', '/api/previsoes/reforco',
  '/api/previsoes/falhas', '/api/previsoes/tendencias', '/api/previsoes/resumo'];

const apps: FastifyInstance[] = [];
async function appNovo(): Promise<FastifyInstance> {
  const app = await criarAppDeTeste(cidadeSemeada());
  apps.push(app);
  // "Frio" é o cache das previsões vazio, não o servidor: a primeira requisição de um app novo ainda inicializa os
  // ganchos (sessão, cabeçalhos, limite de requisições) e não deve entrar na conta da previsão.
  await app.inject({ method: 'GET', url: '/api/saude' });
  return app;
}

beforeAll(() => {
  cidadeSemeada();
}, 120_000);
afterAll(async () => {
  await Promise.all(apps.map((a) => a.close()));
});

describe('rotas /api/previsoes', () => {
  // Cada rota num app novo (cache vazio): mede o tempo frio, inclusive o teste retroativo que o risco e o resumo usam.
  it.each(ROTAS)('%s responde em menos de 500 ms com a cidade semeada, frio e com cache', async (url) => {
    const app = await appNovo();
    const t0 = performance.now();
    const frio = await app.inject({ method: 'GET', url });
    const msFrio = performance.now() - t0;
    expect(frio.statusCode).toBe(200);
    expect(frio.json().explicacao).toMatchObject({ oQuePreve: expect.any(String), comoAjuda: expect.any(String) });
    expect(msFrio).toBeLessThan(500);

    const t1 = performance.now();
    const quente = await app.inject({ method: 'GET', url });
    const msQuente = performance.now() - t1;
    expect(quente.body).toBe(frio.body);
    expect(msQuente).toBeLessThan(msFrio);
    console.info(`${url}: frio ${msFrio.toFixed(0)} ms, com cache ${msQuente.toFixed(1)} ms, ${(frio.body.length / 1024).toFixed(0)} KB`);
  });

  it('horas fora de 24 ou 168: 400 em português', async () => {
    const app = await appNovo();
    const r = await app.inject({ method: 'GET', url: '/api/previsoes/risco?horas=48' });
    expect(r.statusCode).toBe(400);
    expect(r.json().erro).toBe('Dados inválidos');
    expect(r.json().campos.horas).toMatch(/24 ou 168/);
  });

  it('resumo: índice de todos os bairros nas próximas 24 h e até 5 recomendações com a fonte', async () => {
    const app = await appNovo();
    const r = (await app.inject({ method: 'GET', url: '/api/previsoes/resumo' })).json() as ResumoPreditivo;
    const bairros = (cidadeSemeada().db.prepare('SELECT COUNT(*) AS n FROM bairros').get() as { n: number }).n;
    expect(r.indiceBairros).toHaveLength(bairros);
    for (let i = 1; i < r.indiceBairros.length; i++) expect(r.indiceBairros[i]!.indice).toBeLessThanOrEqual(r.indiceBairros[i - 1]!.indice);
    expect(r.recomendacoes.length).toBeGreaterThanOrEqual(3);
    expect(r.recomendacoes.length).toBeLessThanOrEqual(5);
    for (const rec of r.recomendacoes) {
      expect(['risco', 'reforco', 'falhas', 'tendencias']).toContain(rec.fonte);
      expect(['alta', 'media', 'baixa']).toContain(rec.prioridade);
      expect(rec.titulo.length).toBeGreaterThan(5);
      expect(rec.detalhe.length).toBeGreaterThan(10);
    }
    expect(new Set(r.recomendacoes.map((x) => x.fonte)).size).toBeGreaterThanOrEqual(3);
  });
});
