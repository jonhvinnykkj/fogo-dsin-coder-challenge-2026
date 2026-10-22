import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { criarAppDeTeste } from '../test/app';
import { criarCtxDeTeste, type CtxDeTeste } from '../test/ctx';
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

const criar = (sobrescreve: Record<string, unknown> = {}) =>
  app.inject({ method: 'POST', url: '/api/agentes', payload: corpoAgente(ctx, sobrescreve) });

describe('agentes', () => {
  it('CRUD básico', async () => {
    const r = await criar();
    expect(r.statusCode).toBe(201);
    const agente = r.json();
    expect(agente).toMatchObject({ nome: 'Carlos Henrique Souza', matricula: 'AT-1001', latAtual: agente.lat, ultimoSinalEm: null });
    expect(agente.baseBairroNome).toBeTypeOf('string');
    expect(agente.regiao).toBeTypeOf('string');
    expect(agente.criadoEm).toBe('2026-10-17T15:00:00.000Z');

    const detalhe = (await app.inject({ method: 'GET', url: `/api/agentes/${agente.id}` })).json();
    expect(detalhe).toMatchObject({ ...agente, ocorrencias: [] });

    const put = await app.inject({ method: 'PUT', url: `/api/agentes/${agente.id}`, payload: corpoAgente(ctx, { nome: 'Carlos H. Souza', telefone: '(14) 99999-0000' }) });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toMatchObject({ nome: 'Carlos H. Souza', telefone: '(14) 99999-0000' });

    const lista = (await app.inject({ method: 'GET', url: '/api/agentes' })).json();
    expect(lista).toMatchObject({ total: 1, pagina: 1, porPagina: 25 });

    const del = await app.inject({ method: 'DELETE', url: `/api/agentes/${agente.id}` });
    expect(del.statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: `/api/agentes/${agente.id}` })).json()).toEqual({ erro: 'Agente não encontrado' });
  });

  it('matrícula única (409), também na edição de outro agente', async () => {
    await criar();
    const dup = await criar({ nome: 'Outra Pessoa' });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().erro).toBe('Já existe agente com esta matrícula');
    const b = (await criar({ matricula: 'AT-2' })).json();
    const put = await app.inject({ method: 'PUT', url: `/api/agentes/${b.id}`, payload: corpoAgente(ctx, { matricula: 'AT-1001' }) });
    expect(put.statusCode).toBe(409);
  });

  it('filtra por categoria e busca sem acento', async () => {
    await criar();
    const guarda = (await criar({ matricula: 'GM-1', nome: 'José Antônio', categoria: 'guarda_municipal', orgao: 'Guarda Civil Municipal' })).json();
    const porCategoria = (await app.inject({ method: 'GET', url: '/api/agentes?categoria=guarda_municipal' })).json();
    expect(porCategoria.itens.map((a: { id: number }) => a.id)).toEqual([guarda.id]);
    const porNome = (await app.inject({ method: 'GET', url: '/api/agentes?busca=jose%20antonio' })).json();
    expect(porNome.itens.map((a: { id: number }) => a.id)).toEqual([guarda.id]);
    expect((await app.inject({ method: 'GET', url: '/api/agentes?categoria=xyz' })).statusCode).toBe(400);
  });

  it('PUT preserva posição atual e último sinal vindos da telemetria', async () => {
    const a = (await criar()).json();
    ctx.db.prepare("UPDATE agentes SET lat_atual = -22.2, lng_atual = -49.95, ultimo_sinal_em = '2026-10-17T14:59:00.000Z' WHERE id = ?").run(a.id);
    await app.inject({ method: 'PUT', url: `/api/agentes/${a.id}`, payload: corpoAgente(ctx, { baseLogradouro: 'Rua Nova' }) });
    const depois = (await app.inject({ method: 'GET', url: `/api/agentes/${a.id}` })).json();
    expect(depois).toMatchObject({ baseLogradouro: 'Rua Nova', latAtual: -22.2, lngAtual: -49.95, ultimoSinalEm: '2026-10-17T14:59:00.000Z' });
  });

  it('PUT não mexe na situação (vem do turno e das ocorrências; só o PATCH a muda)', async () => {
    const a = (await criar()).json();
    ctx.db.prepare("UPDATE agentes SET situacao = 'em_ocorrencia' WHERE id = ?").run(a.id);
    const put = await app.inject({ method: 'PUT', url: `/api/agentes/${a.id}`, payload: corpoAgente(ctx, { telefone: '(14) 98888-0000', situacao: 'em_servico' }) });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toMatchObject({ telefone: '(14) 98888-0000', situacao: 'em_ocorrencia' });
  });

  it('PATCH situação e vínculo com equipamento existente', async () => {
    const moto = corpoEquipamento(ctx, { tipo: 'moto_agente', caracteristicas: { placa: 'ABC1D23', cilindrada: 160 } });
    const eq = (await app.inject({ method: 'POST', url: '/api/equipamentos', payload: moto })).json();
    const a = (await criar({ equipamentoId: eq.id })).json();
    expect(a.equipamentoId).toBe(eq.id);
    const r = await app.inject({ method: 'PATCH', url: `/api/agentes/${a.id}/situacao`, payload: { situacao: 'pausa' } });
    expect(r.statusCode).toBe(200);
    expect(r.json().situacao).toBe('pausa');
    const ruim = await criar({ matricula: 'X-9', equipamentoId: 9999 });
    expect(ruim.statusCode).toBe(400);
    expect(ruim.json().campos.equipamentoId).toBe('Equipamento não encontrado');
  });

  it('GET por id traz as últimas 20 ocorrências, da mais recente para a mais antiga', async () => {
    const a = (await criar()).json();
    const ins = ctx.db.prepare(
      `INSERT INTO ocorrencias (tipo, gravidade, bairro_id, lat, lng, inicio, agente_id, descricao, chuva, origem)
       VALUES ('acidente', 2, ?, ?, ?, ?, ?, 'Colisão', 0, 'historico')`,
    );
    for (let i = 0; i < 25; i++) ins.run(a.baseBairroId, a.lat, a.lng, `2026-10-${String(1 + (i % 28)).padStart(2, '0')}T10:00:00.000Z`, a.id);
    const d = (await app.inject({ method: 'GET', url: `/api/agentes/${a.id}` })).json();
    expect(d.ocorrencias).toHaveLength(20);
    expect(d.ocorrencias[0].inicio >= d.ocorrencias[19].inicio).toBe(true);
    expect(d.ocorrencias[0]).toMatchObject({ tipo: 'acidente', gravidade: 2, chuva: false, origem: 'historico', agenteId: a.id });
  });

  it('recusa excluir agente com ocorrências (409)', async () => {
    const a = (await criar()).json();
    ctx.db
      .prepare(`INSERT INTO ocorrencias (tipo, gravidade, bairro_id, lat, lng, inicio, agente_id, descricao, chuva, origem) VALUES ('infracao', 1, ?, ?, ?, '2026-10-10T10:00:00.000Z', ?, 'x', 0, 'historico')`)
      .run(a.baseBairroId, a.lat, a.lng, a.id);
    const r = await app.inject({ method: 'DELETE', url: `/api/agentes/${a.id}` });
    expect(r.statusCode).toBe(409);
    expect(r.json().erro).toMatch(/Fora de serviço/);
  });

  it('valida coordenada e bairro', async () => {
    const r = await criar({ lat: -23.55, lng: -46.63 });
    expect(r.statusCode).toBe(400);
    expect(r.json().campos.lat).toMatch(/Marília/);
    const b = await criar({ baseBairroId: 99999 });
    expect(b.json().campos.baseBairroId).toBe('Bairro não encontrado');
  });
});

describe('correções do cadastro de agente (rodada 2)', () => {
  it.each(['123', 'abc', '<script>alert(1)</script>', '(14) 12345-6789', '(00) 99999-0000', '(14) 9999-0000', '14 3333', '(14) 99999-0000 ramal 2'])(
    'telefone inválido %j é recusado com 400 em campos.telefone',
    async (telefone) => {
      const r = await criar({ telefone });
      expect(r.statusCode).toBe(400);
      expect(r.json().campos.telefone).toMatch(/Telefone inválido/);
    },
  );

  it.each([
    ['(14) 99999-0000', '(14) 99999-0000'],
    ['14999990000', '(14) 99999-0000'],
    ['14 99999 0000', '(14) 99999-0000'],
    ['+55 (14) 99999-0000', '(14) 99999-0000'],
    ['(14) 3433-1234', '(14) 3433-1234'],
    ['1434331234', '(14) 3433-1234'],
  ])('telefone %j é gravado como %j (um formato só)', async (entrada, gravado) => {
    const r = await criar({ telefone: entrada });
    expect(r.statusCode).toBe(201);
    expect(r.json().telefone).toBe(gravado);
  });

  it('telefone vazio ou ausente = sem telefone', async () => {
    const vazio = (await criar({ telefone: '  ' })).json();
    expect(vazio.telefone).toBeUndefined();
    expect((await criar({ matricula: 'AT-2' })).json().telefone).toBeUndefined();
  });

  it('matrícula com letra de largura total repete a existente (NFKC); NUL no nome é recusado', async () => {
    await criar();
    expect((await criar({ matricula: 'ＡＴ-1001' })).statusCode).toBe(409);
    const nul = await criar({ matricula: 'AT-3', nome: 'Carlos\u0000' });
    expect(nul.statusCode).toBe(400);
    expect(nul.json().campos.nome).toBeDefined();
  });

  describe('veículo × categoria e órgão do agente', () => {
    const veiculo = async (tipo: 'moto_agente' | 'viatura', orgao: string, serie: string) => {
      const caracteristicas = tipo === 'moto_agente'
        ? { placa: 'ABC1D23', cilindrada: 160 }
        : { placa: 'ABC1D23', orgaoViatura: orgao, prefixo: 'P-1' };
      const r = await app.inject({ method: 'POST', url: '/api/equipamentos', payload: corpoEquipamento(ctx, { tipo, orgao, numeroSerie: serie, caracteristicas }) });
      expect(r.statusCode).toBe(201);
      return r.json().id as number;
    };

    it('agente da PM não aceita moto de agente de trânsito; aceita viatura da PM e recusa a da Guarda', async () => {
      const moto = await veiculo('moto_agente', 'Secretaria de Mobilidade Urbana', 'M-1');
      const pm = { categoria: 'policial_militar', orgao: 'Polícia Militar' };
      const comMoto = await criar({ ...pm, equipamentoId: moto });
      expect(comMoto.statusCode).toBe(400);
      expect(comMoto.json().campos.equipamentoId).toMatch(/viatura/);

      const viaturaGcm = await veiculo('viatura', 'Guarda Civil Municipal', 'V-GCM');
      const deOutroOrgao = await criar({ ...pm, matricula: 'PM-1', equipamentoId: viaturaGcm });
      expect(deOutroOrgao.statusCode).toBe(400);
      expect(deOutroOrgao.json().campos.equipamentoId).toMatch(/outro órgão/);

      const viaturaPm = await veiculo('viatura', 'Polícia Militar', 'V-PM');
      expect((await criar({ ...pm, matricula: 'PM-2', equipamentoId: viaturaPm })).statusCode).toBe(201);
    });

    it('agente de trânsito usa moto (não viatura) e vale também na edição', async () => {
      const moto = await veiculo('moto_agente', 'Secretaria de Mobilidade Urbana', 'M-2');
      const viatura = await veiculo('viatura', 'Guarda Civil Municipal', 'V-2');
      const comViatura = await criar({ equipamentoId: viatura });
      expect(comViatura.statusCode).toBe(400);
      expect(comViatura.json().campos.equipamentoId).toMatch(/moto de agente/);
      const a = (await criar({ equipamentoId: moto })).json();
      const put = await app.inject({ method: 'PUT', url: `/api/agentes/${a.id}`, payload: corpoAgente(ctx, { categoria: 'guarda_municipal', orgao: 'Guarda Civil Municipal', equipamentoId: moto }) });
      expect(put.statusCode).toBe(400);
      expect(put.json().campos.equipamentoId).toMatch(/viatura/);
    });
  });

  it('excluir agente com histórico diz qual (ocorrências e alertas)', async () => {
    const a = (await criar()).json();
    const insere = ctx.db.prepare(`INSERT INTO ocorrencias (tipo, gravidade, bairro_id, lat, lng, inicio, agente_id, descricao, chuva, origem) VALUES ('infracao', 1, ?, ?, ?, '2026-10-10T10:00:00.000Z', ?, 'x', 0, 'historico')`);
    insere.run(a.baseBairroId, a.lat, a.lng, a.id);
    insere.run(a.baseBairroId, a.lat, a.lng, a.id);
    const r = await app.inject({ method: 'DELETE', url: `/api/agentes/${a.id}` });
    expect(r.statusCode).toBe(409);
    expect(r.json().erro).toBe("Este agente tem 2 ocorrências. Use a situação 'Fora de serviço' em vez de excluir.");
  });
});
