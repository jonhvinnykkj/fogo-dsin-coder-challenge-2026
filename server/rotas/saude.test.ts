import { describe, expect, it } from 'vitest';
import { criarApp } from '../app';
import { carregarGeo } from '../geo/marilia';
import { relogioReal, type ContextoApp } from '../contexto';

const ctxDeTeste: ContextoApp = {
  db: null,
  barramento: null,
  relogio: relogioReal,
  geo: carregarGeo(),
};

describe('GET /api/saude', () => {
  it('responde 200 com o nome do sistema', async () => {
    const app = await criarApp(ctxDeTeste);
    const resposta = await app.inject({ method: 'GET', url: '/api/saude' });
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({ ok: true, nome: 'F.O.G.O.' });
    await app.close();
  });
});
