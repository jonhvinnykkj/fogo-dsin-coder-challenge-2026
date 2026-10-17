import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { criarApp } from '../app';
import { inserirAlerta } from '../repositorios/alertas';
import { criarCtxDeTeste, type CtxDeTeste, type RelogioDeTeste } from '../test/ctx';

let ctx: CtxDeTeste;
let app: FastifyInstance;

beforeEach(async () => {
  ctx = criarCtxDeTeste();
  app = await criarApp(ctx);
});
afterEach(async () => {
  await app.close();
});

function novo(sobrescreve: Partial<Parameters<typeof inserirAlerta>[1]> = {}) {
  return inserirAlerta(ctx.db, {
    tipo: 'falha_equipamento',
    criticidade: 'alta',
    titulo: 'Radar sem sinal',
    descricao: 'Sem leituras há 30 minutos',
    criadoEm: '2026-10-17T14:00:00.000Z',
    ...sobrescreve,
  });
}
const lista = async (qs = '') => (await app.inject({ method: 'GET', url: `/api/alertas${qs}` })).json() as { id: number }[];

describe('alertas', () => {
  it('reconhecer preenche reconhecidoEm com a hora do relógio', async () => {
    const a = novo();
    expect(a.reconhecidoEm).toBeUndefined();
    const r = await app.inject({ method: 'PATCH', url: `/api/alertas/${a.id}/reconhecer` });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ id: a.id, reconhecidoEm: '2026-10-17T15:00:00.000Z' });
    expect(r.json().resolvidoEm).toBeUndefined();

    (ctx.relogio as RelogioDeTeste).definir('2026-10-17T16:00:00.000Z');
    const de_novo = await app.inject({ method: 'PATCH', url: `/api/alertas/${a.id}/reconhecer` });
    expect(de_novo.json().reconhecidoEm).toBe('2026-10-17T15:00:00.000Z');
  });

  it('resolver tira da lista status=abertos e mantém em todos', async () => {
    const a = novo();
    const b = novo({ titulo: 'Outro' });
    expect((await lista('?status=abertos')).map((x) => x.id).sort()).toEqual([a.id, b.id].sort());
    const r = await app.inject({ method: 'PATCH', url: `/api/alertas/${a.id}/resolver` });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ resolvidoEm: '2026-10-17T15:00:00.000Z', reconhecidoEm: '2026-10-17T15:00:00.000Z' });
    expect((await lista('?status=abertos')).map((x) => x.id)).toEqual([b.id]);
    expect((await lista('?status=todos')).map((x) => x.id).sort()).toEqual([a.id, b.id].sort());
  });

  it('o padrão da lista é só os abertos', async () => {
    const a = novo();
    novo({ titulo: 'resolvido' });
    await app.inject({ method: 'PATCH', url: '/api/alertas/2/resolver' });
    expect((await lista()).map((x) => x.id)).toEqual([a.id]);
  });

  it('filtra por criticidade, tipo e desde', async () => {
    const critico = novo({ criticidade: 'critica', tipo: 'furto', criadoEm: '2026-10-17T14:30:00.000Z' });
    const antigo = novo({ criticidade: 'baixa', tipo: 'anomalia', criadoEm: '2026-10-10T08:00:00.000Z' });
    expect((await lista('?criticidade=critica')).map((x) => x.id)).toEqual([critico.id]);
    expect((await lista('?tipo=anomalia')).map((x) => x.id)).toEqual([antigo.id]);
    expect((await lista(`?desde=${encodeURIComponent('2026-10-15T00:00:00.000Z')}`)).map((x) => x.id)).toEqual([critico.id]);
    expect((await app.inject({ method: 'GET', url: '/api/alertas?criticidade=urgente' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/api/alertas?desde=ontem' })).statusCode).toBe(400);
  });

  it('lista os mais recentes primeiro', async () => {
    const velho = novo({ criadoEm: '2026-10-17T10:00:00.000Z' });
    const recente = novo({ criadoEm: '2026-10-17T14:00:00.000Z' });
    expect((await lista()).map((x) => x.id)).toEqual([recente.id, velho.id]);
  });

  it('404 para alerta inexistente', async () => {
    const r = await app.inject({ method: 'PATCH', url: '/api/alertas/999/reconhecer' });
    expect(r.statusCode).toBe(404);
    expect(r.json()).toEqual({ erro: 'Alerta não encontrado' });
    expect((await app.inject({ method: 'PATCH', url: '/api/alertas/999/resolver' })).statusCode).toBe(404);
  });

  it('o alerta do equipamento aparece na ficha dele', async () => {
    const eq = (await app.inject({ method: 'POST', url: '/api/equipamentos', payload: (await import('../test/fabricas')).corpoEquipamento(ctx) })).json();
    novo({ equipamentoId: eq.id, lat: eq.lat, lng: eq.lng, bairroId: eq.bairroId });
    const ficha = (await app.inject({ method: 'GET', url: `/api/equipamentos/${eq.id}` })).json();
    expect(ficha.alertas).toHaveLength(1);
    expect(ficha.alertas[0]).toMatchObject({ equipamentoId: eq.id, titulo: 'Radar sem sinal' });
  });

  it('PATCH resolver de alerta já resolvido mantém a origem e não emite o evento de novo', async () => {
    const a = novo();
    const eventos: { tipo: string }[] = [];
    ctx.barramento.assinar((e) => eventos.push(e));
    await app.inject({ method: 'PATCH', url: `/api/alertas/${a.id}/resolver` });
    const segunda = await app.inject({ method: 'PATCH', url: `/api/alertas/${a.id}/resolver` });
    expect(segunda.statusCode).toBe(200);
    expect(segunda.json()).toMatchObject({ resolucao: 'manual' });
    expect(eventos.filter((e) => e.tipo === 'alerta')).toHaveLength(1);
  });
});
