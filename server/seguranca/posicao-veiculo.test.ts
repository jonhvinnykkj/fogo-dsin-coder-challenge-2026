// A moto ou a viatura de um agente anda com ele: a posição do veículo não pode vazar mais exata do que a do agente.
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EventoFogo } from '../../shared/modelos';
import { criarApp } from '../app';
import { entrarComo } from '../test/app';
import { criarCtxDeTeste, type CtxDeTeste } from '../test/ctx';
import { corpoAgente, inserirEquipamentoDeTeste } from '../test/fabricas';
import { alvoPorId } from '../tempo-real/motor-alertas';
import { aproximar, protegerEvento, veiculosDeAgentes } from './protecao';

const EXATO = { lat: -22.21437, lng: -49.94621 };

let ctx: CtxDeTeste;
let app: FastifyInstance;
let motoId: number;
let radarId: number;
let consulta: string;
let operador: string;

beforeEach(async () => {
  ctx = criarCtxDeTeste();
  app = await criarApp(ctx, { limitePorMinuto: 100_000 });
  motoId = inserirEquipamentoDeTeste(ctx, { tipo: 'moto_agente', codigo: 'FOGO-MOT-0001', ...EXATO });
  radarId = inserirEquipamentoDeTeste(ctx, { tipo: 'radar', codigo: 'FOGO-RAD-0001', ...EXATO });
  const gestor = entrarComo(ctx, 'gestor');
  const r = await app.inject({ method: 'POST', url: '/api/agentes', headers: { cookie: gestor }, payload: corpoAgente(ctx, { equipamentoId: motoId }) });
  expect(r.statusCode).toBe(201);
  consulta = entrarComo(ctx, 'leitura');
  operador = entrarComo(ctx, 'operador');
});
afterEach(async () => {
  await app.close();
});

const pegar = async (url: string, cookie: string) => (await app.inject({ method: 'GET', url, headers: { cookie } })).json();
const aprox = { lat: aproximar(EXATO.lat), lng: aproximar(EXATO.lng) };

describe('posição do veículo de agente para "somente consulta"', () => {
  it('mapa da central: a moto vem arredondada; o radar, exato; o operador vê tudo exato', async () => {
    const mapa = await pegar('/api/central/mapa', consulta);
    const moto = mapa.equipamentos.find((e: { id: number }) => e.id === motoId);
    const radar = mapa.equipamentos.find((e: { id: number }) => e.id === radarId);
    expect(moto.lat).toBeCloseTo(aprox.lat, 6);
    expect(moto.lng).toBeCloseTo(aprox.lng, 6);
    expect(radar).toMatchObject(EXATO);
    const doOperador = (await pegar('/api/central/mapa', operador)).equipamentos.find((e: { id: number }) => e.id === motoId);
    expect(doOperador).toMatchObject(EXATO);
  });

  it('ficha do equipamento e listagem (por tipo) trazem a posição arredondada', async () => {
    const ficha = await pegar(`/api/equipamentos/${motoId}`, consulta);
    expect(ficha.latAtual).toBeCloseTo(aprox.lat, 6);
    expect(ficha.lngAtual).toBeCloseTo(aprox.lng, 6);
    for (const tipo of ['moto_agente', 'viatura']) {
      for (const e of (await pegar(`/api/equipamentos?tipo=${tipo}`, consulta)).itens) {
        expect(e.latAtual, tipo).toBeCloseTo(aprox.lat, 6);
      }
    }
    expect((await pegar(`/api/equipamentos/${radarId}`, consulta)).latAtual).toBe(EXATO.lat);
    expect((await pegar(`/api/equipamentos/${motoId}`, operador)).latAtual).toBe(EXATO.lat);
  });

  it('o alerta do veículo também sai arredondado', async () => {
    ctx.motor.alertarFalha(alvoPorId(ctx.db, motoId)!, new Date('2026-10-17T15:00:00.000Z'), 'teste');
    const alertas = (await pegar('/api/alertas', consulta)) as { equipamentoId?: number; lat?: number }[];
    const doVeiculo = alertas.filter((a) => a.equipamentoId === motoId && a.lat !== undefined);
    expect(doVeiculo.length).toBeGreaterThan(0);
    for (const a of doVeiculo) expect(a.lat).toBeCloseTo(aprox.lat, 6);
    const ficha = await pegar(`/api/equipamentos/${motoId}`, consulta);
    for (const a of ficha.alertas as { lat?: number }[]) if (a.lat !== undefined) expect(a.lat).toBeCloseTo(aprox.lat, 6);
  });

  it('evento do tempo real: itens "equipamento" de veículo de agente e o evento "equipamento" saem arredondados', () => {
    const veiculos = veiculosDeAgentes(ctx.db);
    expect([...veiculos]).toEqual([motoId]);
    const posicoes: EventoFogo = {
      tipo: 'posicoes',
      itens: [{ tipo: 'equipamento', id: motoId, ...EXATO }, { tipo: 'equipamento', id: radarId, ...EXATO }, { tipo: 'agente', id: radarId, ...EXATO }],
    };
    const visto = protegerEvento(posicoes, 'leitura', () => veiculos);
    if (visto.tipo !== 'posicoes') throw new Error('tipo');
    expect(visto.itens[0]!.lat).toBeCloseTo(aprox.lat, 6);
    expect(visto.itens[1]).toMatchObject({ id: radarId, ...EXATO });
    expect(visto.itens[2]!.lat).toBeCloseTo(aprox.lat, 6);
    expect(protegerEvento(posicoes, 'operador', () => veiculos)).toBe(posicoes);

    const mapa = { id: motoId, codigo: 'FOGO-MOT-0001', tipo: 'moto_agente', situacao: 'operacional', bairroId: 1, orgao: 'x', manutencao: 'ok', ...EXATO } as never;
    const ev = protegerEvento({ tipo: 'equipamento', dados: mapa }, 'leitura', () => veiculos);
    if (ev.tipo !== 'equipamento') throw new Error('tipo');
    expect(ev.dados.lat).toBeCloseTo(aprox.lat, 6);
  });

  it('SSE de ponta a ponta: "somente consulta" recebe a moto arredondada', async () => {
    await app.listen({ port: 0, host: '127.0.0.1' });
    const url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}/api/stream`;
    const r = await fetch(url, { headers: { cookie: consulta } });
    const leitor = r.body!.getReader();
    const decoder = new TextDecoder();
    let texto = '';
    setTimeout(() => {
      ctx.barramento.registrarPosicao({ tipo: 'equipamento', id: motoId, ...EXATO });
      ctx.barramento.descarregarPosicoes();
    }, 100);
    const limite = Date.now() + 3000;
    while (Date.now() < limite && !texto.includes('event: posicoes')) {
      const { value, done } = await leitor.read();
      if (done) break;
      texto += decoder.decode(value);
    }
    await leitor.cancel();
    const dados = JSON.parse(/event: posicoes\ndata: (.*)\n/.exec(texto)![1]!) as { itens: { lat: number }[] };
    expect(dados.itens[0]!.lat).toBeCloseTo(aprox.lat, 6);
  });
});
