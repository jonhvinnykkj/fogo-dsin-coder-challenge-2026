import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { criarApp } from '../app';
import { criarCtxDeTeste, type CtxDeTeste } from '../test/ctx';
import { inserirEquipamentoDeTeste } from '../test/fabricas';

let ctx: CtxDeTeste;
let app: FastifyInstance;

beforeEach(async () => {
  ctx = criarCtxDeTeste();
  inserirEquipamentoDeTeste(ctx, { tipo: 'radar', codigo: 'FOGO-RAD-0001', token: 'segredo-do-radar-1' });
  inserirEquipamentoDeTeste(ctx, { tipo: 'radar', codigo: 'FOGO-RAD-0002', token: 'segredo-do-radar-2' });
  app = await criarApp(ctx);
});
afterEach(async () => {
  await app.close();
});

const enviar = (token: string | undefined, corpo: unknown) =>
  app.inject({ method: 'POST', url: '/api/telemetria', headers: token === undefined ? {} : { 'x-dispositivo-token': token }, payload: corpo as object });
const sinal = (codigo: string) => (ctx.db.prepare('SELECT ultimo_sinal_em AS s FROM equipamentos WHERE codigo = ?').get(codigo) as { s: string | null }).s;

describe('POST /api/telemetria', () => {
  it('sem token: 401 e nada gravado', async () => {
    const r = await enviar(undefined, { codigo: 'FOGO-RAD-0001', metricas: { fluxo: 100 } });
    expect(r.statusCode).toBe(401);
    expect(r.json().erro).toMatch(/token/i);
    expect(sinal('FOGO-RAD-0001')).toBeNull();
  });

  it('token de outro equipamento: 401', async () => {
    const r = await enviar('segredo-do-radar-2', { codigo: 'FOGO-RAD-0001', metricas: { fluxo: 100 } });
    expect(r.statusCode).toBe(401);
    expect(sinal('FOGO-RAD-0001')).toBeNull();
  });

  it('código que não existe: 401 (não revela quais códigos existem)', async () => {
    const r = await enviar('qualquer', { codigo: 'FOGO-RAD-9999', metricas: { fluxo: 100 } });
    expect(r.statusCode).toBe(401);
  });

  it('token certo: 202 { aceita: true } e último sinal atualizado', async () => {
    const r = await enviar('segredo-do-radar-1', { codigo: 'FOGO-RAD-0001', metricas: { fluxo: 100, velocidadeMedia: 45 } });
    expect(r.statusCode).toBe(202);
    expect(r.json()).toEqual({ aceita: true });
    expect(sinal('FOGO-RAD-0001')).toBe('2026-10-17T15:00:00.000Z');
    expect(sinal('FOGO-RAD-0002')).toBeNull();
  });

  it('respeita a hora da leitura (em) quando enviada', async () => {
    const r = await enviar('segredo-do-radar-1', { codigo: 'FOGO-RAD-0001', em: '2026-10-17T14:58:00.000Z', metricas: { fluxo: 100 } });
    expect(r.statusCode).toBe(202);
    expect(sinal('FOGO-RAD-0001')).toBe('2026-10-17T14:58:00.000Z');
  });

  it('corpo inválido (com token certo): 400 em português, sem gravar', async () => {
    const semMetricas = await enviar('segredo-do-radar-1', { codigo: 'FOGO-RAD-0001' });
    expect(semMetricas.statusCode).toBe(400);
    const metricaDeOutroTipo = await enviar('segredo-do-radar-1', { codigo: 'FOGO-RAD-0001', metricas: { bateria: 50 } });
    expect(metricaDeOutroTipo.statusCode).toBe(400);
    expect(metricaDeOutroTipo.json().erro).toMatch(/métrica/i);
    const textoNoNumero = await enviar('segredo-do-radar-1', { codigo: 'FOGO-RAD-0001', metricas: { fluxo: 'muito' } });
    expect(textoNoNumero.statusCode).toBe(400);
    const latitudeAbsurda = await enviar('segredo-do-radar-1', { codigo: 'FOGO-RAD-0001', metricas: { fluxo: 1 }, lat: 200, lng: 0 });
    expect(latitudeAbsurda.statusCode).toBe(400);
    expect(sinal('FOGO-RAD-0001')).toBeNull();
  });
});

describe('simulação e stream (rotas)', () => {
  it('GET/PATCH /api/simulacao e POST /api/simulacao/eventos', async () => {
    const { Simulador } = await import('../tempo-real/simulador');
    await app.close();
    ctx.simulador = new Simulador(ctx, { semente: 1 });
    app = await criarApp(ctx);
    const g = await app.inject({ method: 'GET', url: '/api/simulacao' });
    expect(g.json()).toEqual({ velocidade: 1, pausado: false, relogio: '2026-10-17T15:00:00.000Z' });
    const p = await app.inject({ method: 'PATCH', url: '/api/simulacao', payload: { velocidade: 10, pausado: true } });
    expect(p.json()).toMatchObject({ velocidade: 10, pausado: true });
    const ruim = await app.inject({ method: 'PATCH', url: '/api/simulacao', payload: { velocidade: 5 } });
    expect(ruim.statusCode).toBe(400);
    const e = await app.inject({ method: 'POST', url: '/api/simulacao/eventos', payload: { tipo: 'acidente' } });
    expect(e.statusCode).toBe(200);
    expect(e.json().alertas).toHaveLength(1);
    expect(e.json().alertas[0]).toMatchObject({ tipo: 'acidente' });
    const tipoRuim = await app.inject({ method: 'POST', url: '/api/simulacao/eventos', payload: { tipo: 'meteoro' } });
    expect(tipoRuim.statusCode).toBe(400);
    const semAlvo = await app.inject({ method: 'POST', url: '/api/simulacao/eventos', payload: { tipo: 'falha', alvoId: 99999 } });
    expect(semAlvo.statusCode).toBe(404);
    expect(semAlvo.json().erro).toBe('Equipamento não encontrado');
  });

  it('sem simulador a rota responde 503 em português', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/simulacao' });
    expect(r.statusCode).toBe(503);
    expect(r.json().erro).toMatch(/simulador/i);
  });
});
