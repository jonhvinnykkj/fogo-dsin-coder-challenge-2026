// Modo Campo: o agente vê o próprio despacho, registra chegada e conclusão, vê os equipamentos perto e relata problemas.
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EventoFogo, Ocorrencia } from '../../shared/modelos';
import { inserirOcorrencia } from '../repositorios/ocorrencias';
import { criarAppDeTeste, entrarComo } from '../test/app';
import { criarCtxDeTeste, type CtxDeTeste } from '../test/ctx';
import { corpoAgente, inserirEquipamentoDeTeste } from '../test/fabricas';

let ctx: CtxDeTeste;
let app: FastifyInstance;
let eventos: EventoFogo[];
let bairro: { id: number; nome: string; lat: number; lng: number };

beforeEach(async () => {
  ctx = criarCtxDeTeste();
  app = await criarAppDeTeste(ctx);
  eventos = [];
  ctx.barramento.assinar((e) => eventos.push(e));
  bairro = ctx.db.prepare('SELECT id, nome, lat, lng FROM bairros ORDER BY id LIMIT 1').get() as typeof bairro;
});
afterEach(async () => {
  await app.close();
});

async function novoAgente(sobrescreve: Record<string, unknown> = {}): Promise<number> {
  const r = await app.inject({ method: 'POST', url: '/api/agentes', payload: corpoAgente(ctx, sobrescreve) });
  expect(r.statusCode).toBe(201);
  return (r.json() as { id: number }).id;
}

/** Ocorrência aberta com o agente despachado (como o simulador faz), com o alerta crítico dela. */
function despachar(agenteId: number, sobrescreve: Partial<Omit<Ocorrencia, 'id' | 'fim'>> = {}): Ocorrencia {
  const o = inserirOcorrencia(ctx.db, {
    tipo: 'acidente', gravidade: 4, bairroId: bairro.id, lat: bairro.lat + 0.009, lng: bairro.lng, inicio: '2026-10-17T14:50:00.000Z',
    agenteId, descricao: 'Colisão entre carro e moto', chuva: false, origem: 'injetado', ...sobrescreve,
  });
  ctx.db.prepare("UPDATE agentes SET situacao = 'em_ocorrencia' WHERE id = ?").run(agenteId);
  ctx.motor.alertarOcorrencia(o, bairro.nome, new Date('2026-10-17T14:50:00.000Z'));
  return o;
}

const url = (agenteId: number, resto: string) => `/api/campo/agentes/${agenteId}${resto}`;

describe('GET /api/campo/agentes/:id/despacho', () => {
  it('sem ocorrência aberta para o agente, o despacho é nulo', async () => {
    const id = await novoAgente();
    const r = await app.inject({ method: 'GET', url: url(id, '/despacho') });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ despacho: null });
  });

  it('traz a ocorrência aberta com bairro, rua mais próxima e distância a partir da posição atual do agente', async () => {
    const id = await novoAgente();
    const o = despachar(id);
    const r = await app.inject({ method: 'GET', url: url(id, '/despacho') });
    const { despacho } = r.json() as { despacho: Record<string, unknown> };
    expect(despacho).toMatchObject({ ocorrencia: { id: o.id, tipo: 'acidente', agenteId: id }, bairroNome: bairro.nome });
    // 0,009° de latitude ≈ 1 km
    expect(despacho.distanciaMetros).toBeGreaterThan(950);
    expect(despacho.distanciaMetros).toBeLessThan(1050);
    expect(typeof despacho.logradouro === 'string' || despacho.logradouro === null).toBe(true);
    expect(despacho).not.toHaveProperty('chegouEm');
  });

  it('ocorrência já encerrada ou de outro agente não aparece; agente inexistente dá 404', async () => {
    const id = await novoAgente();
    const outro = await novoAgente({ matricula: 'AT-2002' });
    despachar(outro);
    despachar(id, { inicio: '2026-10-17T10:00:00.000Z' });
    ctx.db.prepare('UPDATE ocorrencias SET fim = ? WHERE agente_id = ?').run('2026-10-17T10:30:00.000Z', id);
    expect((await app.inject({ method: 'GET', url: url(id, '/despacho') })).json()).toEqual({ despacho: null });
    const r = await app.inject({ method: 'GET', url: url(999, '/despacho') });
    expect(r.statusCode).toBe(404);
    expect(r.json()).toEqual({ erro: 'Agente não encontrado' });
  });
});

describe('chegada e conclusão do despacho', () => {
  it('"cheguei" grava a hora da chegada; repetir dá 409', async () => {
    const id = await novoAgente();
    const o = despachar(id);
    const r = await app.inject({ method: 'POST', url: url(id, `/despachos/${o.id}/chegada`) });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ ocorrencia: { id: o.id }, chegouEm: '2026-10-17T15:00:00.000Z' });
    const de_novo = await app.inject({ method: 'POST', url: url(id, `/despachos/${o.id}/chegada`) });
    expect(de_novo.statusCode).toBe(409);
    expect(de_novo.json()).toEqual({ erro: 'A chegada a este local já foi registrada' });
  });

  it('não registra chegada em ocorrência de outro agente nem em ocorrência encerrada', async () => {
    const id = await novoAgente();
    const outro = await novoAgente({ matricula: 'AT-2002' });
    const deOutro = despachar(outro);
    const r = await app.inject({ method: 'POST', url: url(id, `/despachos/${deOutro.id}/chegada`) });
    expect(r.statusCode).toBe(404);
    expect(r.json()).toEqual({ erro: 'Despacho não encontrado' });
    ctx.db.prepare('UPDATE ocorrencias SET fim = ? WHERE id = ?').run('2026-10-17T14:59:00.000Z', deOutro.id);
    expect((await app.inject({ method: 'POST', url: url(outro, `/despachos/${deOutro.id}/chegada`) })).statusCode).toBe(404);
  });

  it('concluir exige a chegada antes', async () => {
    const id = await novoAgente();
    const o = despachar(id);
    const r = await app.inject({ method: 'POST', url: url(id, `/despachos/${o.id}/conclusao`) });
    expect(r.statusCode).toBe(400);
    expect(r.json()).toEqual({ erro: 'Registre a chegada ao local antes de concluir' });
  });

  it('concluir encerra a ocorrência, fecha o alerta dela (manual), devolve o agente ao serviço e avisa a Central', async () => {
    const id = await novoAgente();
    const o = despachar(id);
    await app.inject({ method: 'POST', url: url(id, `/despachos/${o.id}/chegada`) });
    eventos = [];
    const r = await app.inject({ method: 'POST', url: url(id, `/despachos/${o.id}/conclusao`) });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ id: o.id, fim: '2026-10-17T15:00:00.000Z' });
    expect(ctx.db.prepare('SELECT situacao FROM agentes WHERE id = ?').get(id)).toEqual({ situacao: 'em_servico' });
    expect(ctx.db.prepare('SELECT resolvido_em, resolucao FROM alertas WHERE chave_dedup = ?').get(`ocorrencia:${o.id}`))
      .toEqual({ resolvido_em: '2026-10-17T15:00:00.000Z', resolucao: 'manual' });
    expect(eventos.map((e) => e.tipo)).toEqual(expect.arrayContaining(['ocorrencia', 'agente', 'alerta']));
    expect(eventos.find((e) => e.tipo === 'agente')).toMatchObject({ dados: { id, situacao: 'em_servico' } });
    expect((await app.inject({ method: 'GET', url: url(id, '/despacho') })).json()).toEqual({ despacho: null });
    // Concluída não volta a ser concluída
    expect((await app.inject({ method: 'POST', url: url(id, `/despachos/${o.id}/conclusao`) })).statusCode).toBe(404);
  });
});

describe('GET /api/campo/agentes/:id/equipamentos-proximos', () => {
  it('os 5 mais próximos da posição atual do agente, do mais perto ao mais longe, sem desativados nem não instalados', async () => {
    const id = await novoAgente();
    // Um a cada ~110 m para o norte: FOGO-RAD-0001 é o mais perto.
    for (let i = 1; i <= 7; i++) {
      inserirEquipamentoDeTeste(ctx, { tipo: 'radar', codigo: `FOGO-RAD-000${i}`, lat: bairro.lat + i * 0.001, lng: bairro.lng });
    }
    inserirEquipamentoDeTeste(ctx, { tipo: 'camera', codigo: 'FOGO-CAM-0001', situacao: 'desativado', lat: bairro.lat, lng: bairro.lng });
    inserirEquipamentoDeTeste(ctx, { tipo: 'camera', codigo: 'FOGO-CAM-0002', situacao: 'nao_instalado', lat: bairro.lat, lng: bairro.lng });
    inserirEquipamentoDeTeste(ctx, { tipo: 'camera', codigo: 'FOGO-CAM-0003', situacao: 'furtado', lat: bairro.lat + 0.0035, lng: bairro.lng });

    const r = await app.inject({ method: 'GET', url: url(id, '/equipamentos-proximos') });
    expect(r.statusCode).toBe(200);
    const itens = r.json() as { codigo: string; situacao: string; distanciaMetros: number; bairroNome: string; logradouro: string }[];
    expect(itens.map((e) => e.codigo)).toEqual(['FOGO-RAD-0001', 'FOGO-RAD-0002', 'FOGO-RAD-0003', 'FOGO-CAM-0003', 'FOGO-RAD-0004']);
    expect(itens[0]).toMatchObject({ situacao: 'operacional', bairroNome: bairro.nome, logradouro: 'Avenida Sampaio Vidal' });
    expect(itens[0]!.distanciaMetros).toBeGreaterThan(100);
    expect(itens[0]!.distanciaMetros).toBeLessThan(120);
    expect(itens.map((e) => e.distanciaMetros)).toEqual([...itens.map((e) => e.distanciaMetros)].sort((a, b) => a - b));

    const dois = await app.inject({ method: 'GET', url: url(id, '/equipamentos-proximos?limite=2') });
    expect((dois.json() as unknown[]).length).toBe(2);
    expect((await app.inject({ method: 'GET', url: url(id, '/equipamentos-proximos?limite=50') })).statusCode).toBe(400);
  });
});

describe('equipamentos-proximos e o veículo do próprio agente', () => {
  it('a moto vinculada ao agente não aparece na lista (ela está a 0 m); a dos colegas continua', async () => {
    const id = await novoAgente();
    const minha = inserirEquipamentoDeTeste(ctx, { tipo: 'moto_agente', codigo: 'FOGO-MOT-0001', lat: bairro.lat, lng: bairro.lng });
    inserirEquipamentoDeTeste(ctx, { tipo: 'moto_agente', codigo: 'FOGO-MOT-0002', lat: bairro.lat + 0.001, lng: bairro.lng });
    ctx.db.prepare('UPDATE agentes SET equipamento_id = ? WHERE id = ?').run(minha, id);
    const r = await app.inject({ method: 'GET', url: url(id, '/equipamentos-proximos') });
    expect((r.json() as { codigo: string }[]).map((e) => e.codigo)).toEqual(['FOGO-MOT-0002']);
  });
});

describe('POST /api/campo/agentes/:id/reportes', () => {
  async function cenario() {
    const id = await novoAgente();
    const eq = inserirEquipamentoDeTeste(ctx, { tipo: 'camera', codigo: 'FOGO-CAM-0009', lat: bairro.lat + 0.001, lng: bairro.lng });
    return { id, eq };
  }
  const historico = (eq: number) => ctx.db.prepare('SELECT de, para, motivo, origem FROM historico_situacao WHERE equipamento_id = ? ORDER BY id').all(eq);
  const alertas = (eq: number) => ctx.db.prepare('SELECT tipo, criticidade, descricao FROM alertas WHERE equipamento_id = ? AND resolvido_em IS NULL').all(eq);

  it('mau funcionamento: muda a situação (histórico com quem relatou e a observação) e abre o alerta de falha', async () => {
    const { id, eq } = await cenario();
    const r = await app.inject({ method: 'POST', url: url(id, '/reportes'), payload: { equipamentoId: eq, problema: 'mau_funcionamento', observacao: 'Tela apagada.' } });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ equipamento: { id: eq, codigo: 'FOGO-CAM-0009', situacao: 'mau_funcionamento' }, alerta: { tipo: 'falha_equipamento', criticidade: 'alta' } });
    expect(historico(eq)).toEqual([{
      de: 'operacional', para: 'mau_funcionamento', origem: 'ao_vivo',
      motivo: 'Mau funcionamento relatado em campo por Carlos Henrique Souza (AT-1001): Tela apagada',
    }]);
    expect(alertas(eq)).toEqual([expect.objectContaining({ tipo: 'falha_equipamento', descricao: expect.stringContaining('relatado em campo por Carlos Henrique Souza (AT-1001): Tela apagada') })]);
    expect(eventos.some((e) => e.tipo === 'equipamento' && e.dados.id === eq && e.dados.situacao === 'mau_funcionamento')).toBe(true);
    expect(eventos.some((e) => e.tipo === 'alerta' && e.dados.equipamentoId === eq)).toBe(true);
  });

  it('furtado: situação furtado e alerta crítico de furto', async () => {
    const { id, eq } = await cenario();
    const r = await app.inject({ method: 'POST', url: url(id, '/reportes'), payload: { equipamentoId: eq, problema: 'furtado' } });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ equipamento: { situacao: 'furtado' }, alerta: { tipo: 'furto_suspeito', criticidade: 'critica' } });
    expect(historico(eq)).toEqual([expect.objectContaining({ para: 'furtado', motivo: 'Furto relatado em campo por Carlos Henrique Souza (AT-1001)' })]);
  });

  it('vandalizado: fica em mau funcionamento, com "vandalismo" no histórico e no alerta', async () => {
    const { id, eq } = await cenario();
    const r = await app.inject({ method: 'POST', url: url(id, '/reportes'), payload: { equipamentoId: eq, problema: 'vandalizado', observacao: 'pichada' } });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ equipamento: { situacao: 'mau_funcionamento' }, alerta: { tipo: 'falha_equipamento' } });
    expect(historico(eq)).toEqual([expect.objectContaining({ motivo: 'Vandalismo relatado em campo por Carlos Henrique Souza (AT-1001): pichada' })]);
    expect(alertas(eq)[0]).toMatchObject({ descricao: expect.stringContaining('vandalismo relatado em campo') });
  });

  it('equipamento já em mau funcionamento: não muda a situação de novo e não duplica o alerta aberto', async () => {
    const { id, eq } = await cenario();
    await app.inject({ method: 'POST', url: url(id, '/reportes'), payload: { equipamentoId: eq, problema: 'mau_funcionamento' } });
    const r = await app.inject({ method: 'POST', url: url(id, '/reportes'), payload: { equipamentoId: eq, problema: 'vandalizado' } });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ equipamento: { situacao: 'mau_funcionamento' }, alerta: null });
    expect(historico(eq)).toHaveLength(1);
    expect(alertas(eq)).toHaveLength(1);
  });

  it('recusa: corpo inválido (400), equipamento inexistente (404), fora de operação (400) e furtado relatado como defeito (400)', async () => {
    const { id } = await cenario();
    const invalido = await app.inject({ method: 'POST', url: url(id, '/reportes'), payload: { equipamentoId: 1, problema: 'quebrado' } });
    expect(invalido.statusCode).toBe(400);
    expect(invalido.json()).toMatchObject({ campos: { problema: 'Problema: escolha mau funcionamento, furtado ou vandalizado' } });

    const inexistente = await app.inject({ method: 'POST', url: url(id, '/reportes'), payload: { equipamentoId: 999, problema: 'furtado' } });
    expect(inexistente.statusCode).toBe(404);
    expect(inexistente.json()).toEqual({ erro: 'Equipamento não encontrado' });

    const desativado = inserirEquipamentoDeTeste(ctx, { tipo: 'radar', codigo: 'FOGO-RAD-0099', situacao: 'desativado' });
    const r1 = await app.inject({ method: 'POST', url: url(id, '/reportes'), payload: { equipamentoId: desativado, problema: 'mau_funcionamento' } });
    expect(r1.statusCode).toBe(400);
    expect(r1.json()).toEqual({ erro: 'Este equipamento não está em operação na rua' });

    const furtado = inserirEquipamentoDeTeste(ctx, { tipo: 'radar', codigo: 'FOGO-RAD-0098', situacao: 'furtado' });
    const r2 = await app.inject({ method: 'POST', url: url(id, '/reportes'), payload: { equipamentoId: furtado, problema: 'vandalizado' } });
    expect(r2.statusCode).toBe(400);
    expect(r2.json()).toEqual({ erro: 'Este equipamento consta como furtado. Se ele foi encontrado, registre a recuperação na ficha do equipamento' });
  });
});

describe('permissões do Modo Campo', () => {
  it('o agente usa só o próprio Modo Campo; somente consulta e quem não entrou ficam de fora', async () => {
    const meu = await novoAgente({ matricula: 'AT-0001' });
    const outro = await novoAgente({ matricula: 'AT-0002' });
    const o = despachar(outro);
    const equipamentoId = inserirEquipamentoDeTeste(ctx, { tipo: 'radar', codigo: 'FOGO-RAD-0100' });
    const comCookie = (cookie: string, method: 'GET' | 'POST', caminho: string, payload?: object) =>
      app.inject({ method, url: caminho, headers: { cookie }, ...(payload && { payload }) });

    const agente = entrarComo(ctx, 'agente', meu);
    expect((await comCookie(agente, 'GET', url(meu, '/despacho'))).statusCode).toBe(200);
    expect((await comCookie(agente, 'GET', url(meu, '/equipamentos-proximos'))).statusCode).toBe(200);
    const alheio = await comCookie(agente, 'GET', url(outro, '/despacho'));
    expect(alheio.statusCode).toBe(403);
    expect(alheio.json().erro).toMatch(/próprio Modo Campo/);
    expect((await comCookie(agente, 'POST', url(outro, `/despachos/${o.id}/chegada`))).statusCode).toBe(403);
    expect((await comCookie(agente, 'POST', url(outro, '/reportes'), { equipamentoId, problema: 'furtado' })).statusCode).toBe(403);

    // A operação acompanha qualquer agente (a tela deixa escolher um).
    expect((await comCookie(entrarComo(ctx, 'operador'), 'GET', url(outro, '/despacho'))).statusCode).toBe(200);

    const consulta = entrarComo(ctx, 'leitura');
    expect((await comCookie(consulta, 'GET', url(meu, '/despacho'))).statusCode).toBe(403);
    expect((await comCookie(consulta, 'POST', url(meu, '/reportes'), { equipamentoId, problema: 'furtado' })).statusCode).toBe(403);
    expect((await comCookie('', 'GET', url(meu, '/despacho'))).statusCode).toBe(401);
  });
});

describe('Swagger', () => {
  it('documenta as rotas do Modo Campo com a tag própria', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/docs/json' });
    const doc = r.json() as { tags: { name: string }[]; paths: Record<string, Record<string, { tags?: string[] }>> };
    expect(doc.tags.map((t) => t.name)).toContain('Modo Campo');
    for (const caminho of [
      '/api/campo/agentes/{id}/despacho', '/api/campo/agentes/{id}/despachos/{ocorrenciaId}/chegada',
      '/api/campo/agentes/{id}/despachos/{ocorrenciaId}/conclusao', '/api/campo/agentes/{id}/equipamentos-proximos', '/api/campo/agentes/{id}/reportes',
    ]) {
      const operacoes = Object.values(doc.paths[caminho] ?? {});
      expect(operacoes.length, caminho).toBeGreaterThan(0);
      expect(operacoes[0]!.tags).toEqual(['Modo Campo']);
    }
  });
});
