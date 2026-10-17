import { describe, expect, it } from 'vitest';
import type { EventoFogo } from '../../shared/modelos';
import { criarCtxDeTeste, type RelogioDeTeste } from '../test/ctx';
import { inserirEquipamentoDeTeste } from '../test/fabricas';
import { preencherLacuna, SEMENTE_PADRAO } from '../semente/semear';
import { ingerirTelemetria } from './ingestao';

const linha = (ctx: ReturnType<typeof criarCtxDeTeste>, codigo: string) =>
  ctx.db.prepare('SELECT lat_atual, lng_atual, ultimo_sinal_em, lat, lng FROM equipamentos WHERE codigo = ?').get(codigo) as {
    lat_atual: number; lng_atual: number; ultimo_sinal_em: string | null; lat: number; lng: number;
  };

describe('ingerirTelemetria', () => {
  it('leitura de patinete com lat/lng muda a posição atual e sai no próximo agrupamento de posições', () => {
    const ctx = criarCtxDeTeste();
    const id = inserirEquipamentoDeTeste(ctx, { tipo: 'patinete', codigo: 'FOGO-PAT-0001' });
    const eventos: EventoFogo[] = [];
    ctx.barramento.assinar((e) => eventos.push(e));

    const antes = linha(ctx, 'FOGO-PAT-0001');
    const r = ingerirTelemetria(ctx, { codigo: 'FOGO-PAT-0001', metricas: { bateria: 80, emUso: 20 }, lat: antes.lat + 0.001, lng: antes.lng + 0.001 });
    expect(r.aceita).toBe(true);

    const depois = linha(ctx, 'FOGO-PAT-0001');
    expect(depois.lat_atual).toBeCloseTo(antes.lat + 0.001, 6);
    expect(depois.lng_atual).toBeCloseTo(antes.lng + 0.001, 6);
    expect(depois.lat).toBe(antes.lat); // a posição cadastrada não muda
    expect(depois.ultimo_sinal_em).toBe('2026-10-17T15:00:00.000Z');

    expect(eventos.filter((e) => e.tipo === 'posicoes')).toHaveLength(0); // ainda agrupando
    ctx.barramento.descarregarPosicoes();
    const posicoes = eventos.filter((e) => e.tipo === 'posicoes');
    expect(posicoes).toHaveLength(1);
    expect(posicoes[0]).toMatchObject({ itens: [{ tipo: 'equipamento', id, lat: depois.lat_atual, lng: depois.lng_atual }] });
    ctx.barramento.descarregarPosicoes();
    expect(eventos.filter((e) => e.tipo === 'posicoes')).toHaveLength(1); // nada novo, nada emitido
  });

  it('várias posições do mesmo equipamento no mesmo agrupamento viram uma só (a última)', () => {
    const ctx = criarCtxDeTeste();
    inserirEquipamentoDeTeste(ctx, { tipo: 'viatura', codigo: 'FOGO-VIA-0001' });
    const eventos: EventoFogo[] = [];
    ctx.barramento.assinar((e) => eventos.push(e));
    const { lat, lng } = linha(ctx, 'FOGO-VIA-0001');
    ingerirTelemetria(ctx, { codigo: 'FOGO-VIA-0001', metricas: { velocidade: 30 }, lat: lat + 0.001, lng });
    ingerirTelemetria(ctx, { codigo: 'FOGO-VIA-0001', metricas: { velocidade: 31 }, lat: lat + 0.002, lng });
    ctx.barramento.descarregarPosicoes();
    const itens = (eventos.find((e) => e.tipo === 'posicoes') as Extract<EventoFogo, { tipo: 'posicoes' }>).itens;
    expect(itens).toHaveLength(1);
    expect(itens[0]!.lat).toBeCloseTo(lat + 0.002, 6);
  });

  it('acumula a hora corrente: leituras, média corrida e minutos online', () => {
    const ctx = criarCtxDeTeste({ agora: '2026-10-17T15:10:00.000Z' });
    const id = inserirEquipamentoDeTeste(ctx, { tipo: 'radar', codigo: 'FOGO-RAD-0001' });
    ingerirTelemetria(ctx, { codigo: 'FOGO-RAD-0001', metricas: { fluxo: 300, velocidadeMedia: 40 } });
    (ctx.relogio as RelogioDeTeste).definir('2026-10-17T15:40:00.000Z');
    ingerirTelemetria(ctx, { codigo: 'FOGO-RAD-0001', metricas: { fluxo: 500 } });
    const l = ctx.db.prepare('SELECT hora, leituras, online_min, metricas FROM telemetria_hora WHERE equipamento_id = ?').all(id) as {
      hora: string; leituras: number; online_min: number; metricas: string;
    }[];
    expect(l).toHaveLength(1);
    expect(l[0]!.hora).toBe('2026-10-17T15:00:00.000Z');
    expect(l[0]!.leituras).toBe(2);
    expect(l[0]!.online_min).toBe(41);
    expect(JSON.parse(l[0]!.metricas)).toEqual({ fluxo: 400, velocidadeMedia: 40 });
  });

  it('booleanos viram porcentagem (online: true = 100)', () => {
    const ctx = criarCtxDeTeste();
    const id = inserirEquipamentoDeTeste(ctx, { tipo: 'camera', codigo: 'FOGO-CAM-0001' });
    ingerirTelemetria(ctx, { codigo: 'FOGO-CAM-0001', metricas: { online: true, fps: 24 } });
    const m = (ctx.db.prepare('SELECT metricas FROM telemetria_hora WHERE equipamento_id = ?').get(id) as { metricas: string }).metricas;
    expect(JSON.parse(m)).toEqual({ online: 100, fps: 24 });
  });

  it('recusa código desconhecido, métrica que o tipo não tem e lat sem lng', () => {
    const ctx = criarCtxDeTeste();
    inserirEquipamentoDeTeste(ctx, { tipo: 'radar', codigo: 'FOGO-RAD-0001' });
    expect(() => ingerirTelemetria(ctx, { codigo: 'FOGO-XXX-9999', metricas: { fluxo: 1 } })).toThrow(/não encontrado/);
    expect(() => ingerirTelemetria(ctx, { codigo: 'FOGO-RAD-0001', metricas: { bateria: 1 } })).toThrow(/Métrica/);
    expect(() => ingerirTelemetria(ctx, { codigo: 'FOGO-RAD-0001', metricas: { fluxo: 1 }, lat: -22.2 })).toThrow(/lat.*lng/i);
  });

  it('um sinal atrasado não faz o último sinal andar para trás', () => {
    const ctx = criarCtxDeTeste();
    inserirEquipamentoDeTeste(ctx, { tipo: 'radar', codigo: 'FOGO-RAD-0001' });
    ingerirTelemetria(ctx, { codigo: 'FOGO-RAD-0001', metricas: { fluxo: 1 } });
    ingerirTelemetria(ctx, { codigo: 'FOGO-RAD-0001', metricas: { fluxo: 1 }, em: '2026-10-17T14:00:00.000Z' });
    expect(linha(ctx, 'FOGO-RAD-0001').ultimo_sinal_em).toBe('2026-10-17T15:00:00.000Z');
  });

  it('telemetria ao vivo na hora corrente e depois preencherLacuna 3 h à frente: sem erro, sem duplicar', () => {
    const ctx = criarCtxDeTeste({ agora: '2026-10-17T15:20:00.000Z' });
    const id = inserirEquipamentoDeTeste(ctx, { tipo: 'radar', codigo: 'FOGO-RAD-0001' });
    ctx.db.prepare("INSERT INTO meta (chave, valor) VALUES ('historico_ate', '2026-10-17T14:00:00.000Z')").run();
    ingerirTelemetria(ctx, { codigo: 'FOGO-RAD-0001', metricas: { fluxo: 123 } });
    ctx.db.prepare(`INSERT INTO ocorrencias (tipo, gravidade, bairro_id, lat, lng, inicio, descricao, origem)
      VALUES ('acidente', 2, 1, -22.2, -49.9, '2026-10-17T15:05:00.000Z', 'ao vivo', 'tempo_real')`).run();

    const agora = new Date('2026-10-17T18:20:00.000Z');
    const r = preencherLacuna(ctx.db, { agora, semente: SEMENTE_PADRAO, geo: ctx.geo });
    expect(r.horasGeradas).toBe(3); // 15, 16 e 17 UTC

    const viva = ctx.db.prepare("SELECT leituras, metricas FROM telemetria_hora WHERE equipamento_id = ? AND hora = '2026-10-17T15:00:00.000Z'").get(id) as { leituras: number; metricas: string };
    expect(viva.leituras).toBe(1);
    expect(JSON.parse(viva.metricas)).toEqual({ fluxo: 123 });
    expect((ctx.db.prepare('SELECT COUNT(*) AS n FROM telemetria_hora WHERE equipamento_id = ?').get(id) as { n: number }).n).toBe(3);
    const dup = ctx.db.prepare("SELECT COUNT(*) AS n FROM (SELECT 1 FROM ocorrencias WHERE origem = 'historico' GROUP BY inicio, bairro_id, tipo HAVING COUNT(*) > 1)").get() as { n: number };
    expect(dup.n).toBe(0);
    expect((ctx.db.prepare("SELECT valor FROM meta WHERE chave = 'historico_ate'").get() as { valor: string }).valor).toBe('2026-10-17T17:00:00.000Z');
    expect(preencherLacuna(ctx.db, { agora, semente: SEMENTE_PADRAO, geo: ctx.geo }).horasGeradas).toBe(0);
  });
});
