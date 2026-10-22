// Regras de negócio do cadastro achadas na revisão do avaliador (docs/REVISAO-AVALIADOR.md, seção 5): I1, I4 e D1 a D6.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { criarAppDeTeste } from '../test/app';
import { criarCtxDeTeste, type CtxDeTeste, type RelogioDeTeste } from '../test/ctx';
import { corpoAgente, corpoEquipamento } from '../test/fabricas';

let ctx: CtxDeTeste;
let app: FastifyInstance;

beforeEach(async () => {
  ctx = criarCtxDeTeste();
  app = await criarAppDeTeste(ctx);
});
afterEach(async () => {
  await app.close();
});

const criarEquip = (sobrescreve: Record<string, unknown> = {}) =>
  app.inject({ method: 'POST', url: '/api/equipamentos', payload: corpoEquipamento(ctx, sobrescreve) });
const criarAgente = (sobrescreve: Record<string, unknown> = {}) =>
  app.inject({ method: 'POST', url: '/api/agentes', payload: corpoAgente(ctx, sobrescreve) });
const moto = { tipo: 'moto_agente', caracteristicas: { placa: 'ABC1D23', cilindrada: 160 } };

/** Dois bairros diferentes: o ponto de um e o id do outro. */
function doisBairros() {
  const [b1, b2] = ctx.db.prepare('SELECT id, nome, lat, lng FROM bairros ORDER BY id LIMIT 2').all() as { id: number; nome: string; lat: number; lng: number }[];
  return { b1: b1!, b2: b2! };
}

describe('I1: exclusão logo depois do cadastro', () => {
  it('equipamento recém-cadastrado, com a primeira telemetria já recebida, pode ser excluído', async () => {
    const eq = (await criarEquip()).json();
    ctx.db
      .prepare("INSERT INTO telemetria_hora (equipamento_id, hora, leituras, online_min, metricas) VALUES (?, '2026-10-17T14:00:00.000Z', 3, 2, '{}')")
      .run(eq.id);
    // O cadastro em si não grava histórico que impeça a exclusão.
    expect(ctx.db.prepare('SELECT COUNT(*) AS n FROM historico_situacao WHERE equipamento_id = ?').get(eq.id)).toEqual({ n: 0 });
    expect((await app.inject({ method: 'DELETE', url: `/api/equipamentos/${eq.id}` })).statusCode).toBe(204);
  });

  it('mudança de situação feita por pessoa continua impedindo, e a mensagem a cita', async () => {
    const eq = (await criarEquip()).json();
    await app.inject({ method: 'PATCH', url: `/api/equipamentos/${eq.id}/situacao`, payload: { situacao: 'desativado', motivo: 'Teste' } });
    const r = await app.inject({ method: 'DELETE', url: `/api/equipamentos/${eq.id}` });
    expect(r.statusCode).toBe(409);
    expect(r.json().erro).toContain('1 mudança de situação');
  });
});

describe('I4: o bairro precisa conter o ponto', () => {
  it('equipamento: ponto de um bairro com o id de outro dá 400 dizendo em que bairro o ponto fica (POST e PUT)', async () => {
    const { b1, b2 } = doisBairros();
    const r = await criarEquip({ bairroId: b2.id, lat: b1.lat, lng: b1.lng });
    expect(r.statusCode).toBe(400);
    expect(r.json().erro).toContain(`O ponto fica em ${b1.nome}`);
    expect(r.json().campos.bairroId).toContain(b1.nome);

    const eq = (await criarEquip({ bairroId: b1.id, lat: b1.lat, lng: b1.lng })).json();
    const put = await app.inject({ method: 'PUT', url: `/api/equipamentos/${eq.id}`, payload: corpoEquipamento(ctx, { bairroId: b2.id, lat: b1.lat, lng: b1.lng }) });
    expect(put.statusCode).toBe(400);
    expect(put.json().campos.bairroId).toContain(b1.nome);
  });

  it('tolera alguns metros na divisa: ponto a ~10 m do bairro escolhido passa', async () => {
    const { b1 } = doisBairros();
    const poligono = JSON.parse((ctx.db.prepare('SELECT poligono FROM bairros WHERE id = ?').get(b1.id) as { poligono: string }).poligono);
    const [lng, lat] = poligono.coordinates[0][0] as [number, number];
    // Um vértice do polígono, 0,0001° (~10 m) para fora do centro do bairro: sempre a menos de 30 m da borda.
    const r = await criarEquip({ bairroId: b1.id, lat: lat + 0.0001, lng });
    expect(r.statusCode).toBe(201);
  });

  it('agente: a base precisa ficar no bairro escolhido', async () => {
    const { b1, b2 } = doisBairros();
    const r = await criarAgente({ baseBairroId: b2.id, lat: b1.lat, lng: b1.lng });
    expect(r.statusCode).toBe(400);
    expect(r.json().campos.baseBairroId).toContain(`O ponto fica em ${b1.nome}`);
    expect((await criarAgente({ baseBairroId: b1.id, lat: b1.lat, lng: b1.lng })).statusCode).toBe(201);
  });
});

describe('D1: data que não existe', () => {
  it('2026-02-30 é recusada (instalação, manutenção) e 2024-02-29 (bissexto) passa', async () => {
    const r = await criarEquip({ instaladoEm: '2026-02-30' });
    expect(r.statusCode).toBe(400);
    expect(r.json().campos.instaladoEm).toMatch(/inválida/);
    const m = await criarEquip({ numeroSerie: 'S-2', manutencaoNecessidade: 'agendada', proximaManutencao: '2026-04-31' });
    expect(m.json().campos.proximaManutencao).toMatch(/inválida/);
    expect((await criarEquip({ numeroSerie: 'S-3', instaladoEm: '2026-02-28' })).statusCode).toBe(201);
    expect((await criarEquip({ numeroSerie: 'S-4', instaladoEm: '2024-02-29' })).statusCode).toBe(201);
  });
});

describe('D2: datas contra o relógio do contexto', () => {
  it('instalação no futuro é recusada; com a simulação adiantada, a mesma data passa', async () => {
    const r = await criarEquip({ instaladoEm: '2026-10-18' }); // o relógio de teste marca 17/10
    expect(r.statusCode).toBe(400);
    expect(r.json().campos.instaladoEm).toMatch(/futuro/);
    (ctx.relogio as RelogioDeTeste).definir('2026-10-19T12:00:00.000Z');
    expect((await criarEquip({ instaladoEm: '2026-10-18' })).statusCode).toBe(201);
  });

  it('última manutenção no futuro e próxima antes da última são recusadas', async () => {
    const futura = await criarEquip({ ultimaManutencao: '2099-01-01' });
    expect(futura.json().campos.ultimaManutencao).toMatch(/futuro/);
    const invertida = await criarEquip({ manutencaoNecessidade: 'agendada', ultimaManutencao: '2026-10-10', proximaManutencao: '2026-10-01' });
    expect(invertida.statusCode).toBe(400);
    expect(invertida.json().campos.proximaManutencao).toMatch(/anterior à última/);
    const igual = await criarEquip({ numeroSerie: 'S-2', manutencaoNecessidade: 'agendada', ultimaManutencao: '2026-10-10', proximaManutencao: '2026-10-10' });
    expect(igual.statusCode).toBe(201);
  });

  it('o PUT também confere as datas', async () => {
    const eq = (await criarEquip()).json();
    const put = await app.inject({ method: 'PUT', url: `/api/equipamentos/${eq.id}`, payload: corpoEquipamento(ctx, { instaladoEm: '2099-01-01' }) });
    expect(put.statusCode).toBe(400);
    expect(put.json().campos.instaladoEm).toMatch(/futuro/);
  });
});

describe('D3: número de série sem diferenciar maiúsculas', () => {
  it('"REV-X" e "rev-x" são o mesmo número (409), no POST e no PUT', async () => {
    expect((await criarEquip({ numeroSerie: 'REV-X' })).statusCode).toBe(201);
    expect((await criarEquip({ numeroSerie: 'rev-x' })).statusCode).toBe(409);
    const outro = (await criarEquip({ numeroSerie: 'OUTRO' })).json();
    const put = await app.inject({ method: 'PUT', url: `/api/equipamentos/${outro.id}`, payload: corpoEquipamento(ctx, { numeroSerie: 'Rev-X' }) });
    expect(put.statusCode).toBe(409);
  });
});

describe('D4: vínculo do agente com o veículo', () => {
  it('câmera não pode ser vinculada a agente', async () => {
    const cam = (await criarEquip({ tipo: 'camera', caracteristicas: { resolucao: '1080p', visaoNoturna: true, colorida: true, ptz: false, angulo: 90, armazenamentoDias: 30 } })).json();
    const r = await criarAgente({ equipamentoId: cam.id });
    expect(r.statusCode).toBe(400);
    expect(r.json().campos.equipamentoId).toMatch(/moto de agente ou uma viatura/);
  });

  it('moto livre vincula; a mesma moto em outro agente é recusada; o dono pode se editar', async () => {
    const m = (await criarEquip(moto)).json();
    const dono = await criarAgente({ equipamentoId: m.id });
    expect(dono.statusCode).toBe(201);
    const outro = await criarAgente({ matricula: 'AT-2', equipamentoId: m.id });
    expect(outro.statusCode).toBe(400);
    expect(outro.json().campos.equipamentoId).toContain(dono.json().nome);
    const edicao = await app.inject({ method: 'PUT', url: `/api/agentes/${dono.json().id}`, payload: corpoAgente(ctx, { equipamentoId: m.id, nome: 'Novo Nome' }) });
    expect(edicao.statusCode).toBe(200);
    // E o PUT de um terceiro com a mesma moto também é recusado.
    const terceiro = (await criarAgente({ matricula: 'AT-3' })).json();
    const put = await app.inject({ method: 'PUT', url: `/api/agentes/${terceiro.id}`, payload: corpoAgente(ctx, { matricula: 'AT-3', equipamentoId: m.id }) });
    expect(put.statusCode).toBe(400);
  });
});

describe('D5: furtado e desativado fora da manutenção preventiva', () => {
  it('o cadastro só aceita nao_instalado, operacional e em_manutencao como situação inicial', async () => {
    for (const situacao of ['furtado', 'desativado', 'mau_funcionamento']) {
      const r = await criarEquip({ numeroSerie: `S-${situacao}`, situacao });
      expect(r.statusCode).toBe(400);
      expect(r.json().campos.situacao).toMatch(/Situação inicial/);
    }
    for (const situacao of ['nao_instalado', 'operacional', 'em_manutencao']) {
      expect((await criarEquip({ numeroSerie: `S-${situacao}`, situacao })).statusCode).toBe(201);
    }
  });

  it('furtado e desativado saem do quadro preventivo (e do filtro da lista) ao mudar de situação', async () => {
    const agendada = { manutencaoNecessidade: 'agendada', proximaManutencao: '2026-11-05' };
    const ok = (await criarEquip({ numeroSerie: 'M-1', ...agendada })).json();
    const furtado = (await criarEquip({ numeroSerie: 'M-2', ...agendada })).json();
    const desativado = (await criarEquip({ numeroSerie: 'M-3', ...agendada })).json();
    await app.inject({ method: 'PATCH', url: `/api/equipamentos/${furtado.id}/situacao`, payload: { situacao: 'furtado', motivo: 'Furtado em teste' } });
    await app.inject({ method: 'PATCH', url: `/api/equipamentos/${desativado.id}/situacao`, payload: { situacao: 'desativado', motivo: 'Desativado em teste' } });
    const painel = (await app.inject({ method: 'GET', url: '/api/manutencao/painel' })).json();
    const todos = [...painel.atrasadas, ...painel.imediatas, ...painel.proximos7, ...painel.proximos30].map((e: { id: number }) => e.id);
    expect(todos).toEqual([ok.id]);
  });
});

describe('D6: campo vazio tem mensagem própria', () => {
  it('equipamento: Escolha o tipo / o órgão e Informe o CEP', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/equipamentos',
      payload: { ...corpoEquipamento(ctx), tipo: undefined, orgao: undefined, cep: '' },
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().campos).toMatchObject({ tipo: 'Escolha o tipo', orgao: 'Escolha o órgão', cep: 'Informe o CEP' });
  });

  it('valor errado (não vazio) continua dizendo "valor inválido"; CEP mal escrito, o formato', async () => {
    const r = await criarEquip({ tipo: 'foguete', orgao: 'Ninguém', cep: '123' });
    expect(r.json().campos).toMatchObject({ tipo: 'Tipo: valor inválido', orgao: 'Órgão responsável: valor inválido', cep: 'CEP inválido: use o formato 00000-000' });
  });

  it('agente: categoria, órgão e turno vazios', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/agentes',
      payload: { ...corpoAgente(ctx), categoria: undefined, orgao: undefined, turno: undefined },
    });
    expect(r.json().campos).toMatchObject({ categoria: 'Escolha a categoria', orgao: 'Escolha o órgão', turno: 'Escolha o turno' });
  });
});
