import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { criarAppDeTeste } from '../test/app';
import { criarCtxDeTeste, type CtxDeTeste, type RelogioDeTeste } from '../test/ctx';
import { corpoEquipamento } from '../test/fabricas';
import { hashTokenDispositivo } from '../seguranca/cripto';

let ctx: CtxDeTeste;
let app: FastifyInstance;
const relogio = () => ctx.relogio as RelogioDeTeste;

beforeEach(async () => {
  ctx = criarCtxDeTeste();
  app = await criarAppDeTeste(ctx);
});
afterEach(async () => {
  await app.close();
});

async function criar(sobrescreve: Record<string, unknown> = {}) {
  return app.inject({ method: 'POST', url: '/api/equipamentos', payload: corpoEquipamento(ctx, sobrescreve) });
}
/** Equipamento criado, como o GET devolve (sem o `tokenDispositivo`, que só existe na resposta do POST). */
async function criarOk(sobrescreve: Record<string, unknown> = {}) {
  const r = await criar(sobrescreve);
  expect(r.statusCode).toBe(201);
  const { tokenDispositivo: _token, ...ficha } = r.json();
  return ficha;
}
const ler = async (id: number) => (await app.inject({ method: 'GET', url: `/api/equipamentos/${id}` })).json();

describe('cadastro de equipamento', () => {
  it('POST válido devolve 201 com código FOGO-RAD-0001 e o token do dispositivo, só nessa resposta', async () => {
    const r = await criar();
    expect(r.statusCode).toBe(201);
    const eq = r.json();
    expect(eq.codigo).toMatch(/^FOGO-RAD-\d{4}$/);
    expect(eq.codigo).toBe('FOGO-RAD-0001');
    expect(eq.tokenDispositivo).toMatch(/^[0-9a-f]{32}$/);
    expect(eq).not.toHaveProperty('token_dispositivo');
    const ficha = await ler(eq.id);
    expect(ficha).not.toHaveProperty('tokenDispositivo'); // depois do cadastro, nem a ficha nem a lista mostram o token
    expect(JSON.stringify((await app.inject({ method: 'GET', url: '/api/equipamentos' })).json())).not.toContain(eq.tokenDispositivo);
    expect(eq.criadoEm).toBe('2026-10-17T15:00:00.000Z');
    expect(eq.latAtual).toBe(eq.lat);
    expect(eq.ultimoSinalEm).toBeNull();
    const linha = ctx.db.prepare('SELECT token_dispositivo AS t FROM equipamentos WHERE id = ?').get(eq.id) as { t: string };
    expect(linha.t).toMatch(/^sha256:[0-9a-f]{64}$/); // o banco guarda só o hash do token
    expect(linha.t).toBe(hashTokenDispositivo(eq.tokenDispositivo)); // e o token devolvido é o que gera esse hash
  });

  it('o token devolvido no cadastro autentica o dispositivo, e "gerar token novo" invalida o anterior', async () => {
    const { id, codigo, tokenDispositivo } = (await criar()).json();
    const envia = (token: string) =>
      app.inject({ method: 'POST', url: '/api/telemetria', headers: { 'x-dispositivo-token': token }, payload: { codigo, metricas: { fluxo: 100 } } });
    expect((await envia(tokenDispositivo)).statusCode).toBe(202);
    const novo = (await app.inject({ method: 'POST', url: `/api/equipamentos/${id}/token` })).json();
    expect(novo.token).not.toBe(tokenDispositivo);
    expect((await envia(tokenDispositivo)).statusCode).toBe(401);
    expect((await envia(novo.token)).statusCode).toBe(202);
  });

  it('sem cidade/uf no corpo grava Marília/SP, e o GET devolve os dois campos', async () => {
    const criado = await criarOk();
    expect(criado).toMatchObject({ cidade: 'Marília', uf: 'SP' });
    const linha = ctx.db.prepare('SELECT cidade, uf FROM equipamentos WHERE id = ?').get(criado.id);
    expect(linha).toEqual({ cidade: 'Marília', uf: 'SP' });
    expect(await ler(criado.id)).toMatchObject({ cidade: 'Marília', uf: 'SP' });
    const lista = (await app.inject({ method: 'GET', url: '/api/equipamentos' })).json();
    expect(lista.itens[0]).toMatchObject({ cidade: 'Marília', uf: 'SP' });
  });

  it('aceita cidade/uf Marília/SP e recusa outra cidade com 400 em português', async () => {
    expect((await criar({ cidade: 'Marília', uf: 'SP' })).statusCode).toBe(201);
    const r = await criar({ numeroSerie: 'SN-0002', cidade: 'Bauru' });
    expect(r.statusCode).toBe(400);
    expect(r.json().campos.cidade).toBe('O F.O.G.O. atende só Marília/SP: a cidade e a UF precisam ser Marília/SP');
    const outraUf = await criar({ numeroSerie: 'SN-0003', uf: 'MG' });
    expect(outraUf.statusCode).toBe(400);
    expect(outraUf.json().campos.uf).toMatch(/atende só Marília\/SP/);
  });

  it('GET por id devolve os mesmos dados mais histórico, manutenções e alertas', async () => {
    const criado = await criarOk();
    const r = await app.inject({ method: 'GET', url: `/api/equipamentos/${criado.id}` });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject(criado);
    expect(r.json()).toMatchObject({ historico: [], manutencoes: [], alertas: [] });
  });

  it('numera os códigos por tipo, em sequência', async () => {
    await criarOk();
    const segundo = await criarOk({ numeroSerie: 'SN-0002' });
    expect(segundo.codigo).toBe('FOGO-RAD-0002');
    const camera = await criarOk({
      tipo: 'camera',
      numeroSerie: 'SN-C1',
      caracteristicas: { resolucao: '1080p', visaoNoturna: true, colorida: true, ptz: false, angulo: 90, armazenamentoDias: 30 },
    });
    expect(camera.codigo).toBe('FOGO-CAM-0001');
  });

  it('lista com tipo=radar traz o equipamento; com tipo=camera não', async () => {
    const criado = await criarOk();
    const radar = (await app.inject({ method: 'GET', url: '/api/equipamentos?tipo=radar' })).json();
    expect(radar.total).toBe(1);
    expect(radar.itens[0].id).toBe(criado.id);
    expect(radar).toMatchObject({ pagina: 1, porPagina: 25 });
    const camera = (await app.inject({ method: 'GET', url: '/api/equipamentos?tipo=camera' })).json();
    expect(camera.total).toBe(0);
    expect(camera.itens).toEqual([]);
  });

  it('rejeita número de série repetido com 409', async () => {
    await criarOk();
    const r = await criar();
    expect(r.statusCode).toBe(409);
    expect(r.json().erro).toBe('Já existe equipamento com este número de série');
  });

  it('rejeita coordenada de São Paulo com 400 em campos.lat ou campos.lng', async () => {
    const r = await criar({ lat: -23.55, lng: -46.63 });
    expect(r.statusCode).toBe(400);
    const corpo = r.json();
    expect(corpo.erro).toBe('Dados inválidos');
    expect(corpo.campos.lat ?? corpo.campos.lng).toMatch(/Marília/);
  });

  it('aponta o campo de característica inválido em campos["caracteristicas.<chave>"]', async () => {
    const r = await criar({ caracteristicas: { modalidade: 'velocidade', velocidadeMaxima: 500, faixas: 2, sentido: 'Centro' } });
    expect(r.statusCode).toBe(400);
    expect(r.json().campos['caracteristicas.velocidadeMaxima']).toMatch(/120/);
  });

  it('devolve mensagem em português para chave extra em caracteristicas', async () => {
    const r = await criar({ caracteristicas: { modalidade: 'velocidade', faixas: 2, sentido: 'Centro', corDoCarro: 'azul' } });
    expect(r.statusCode).toBe(400);
    const mensagens = Object.values(r.json().campos).join(' | ');
    expect(mensagens).not.toMatch(/unrecognized|expected|required|invalid/i);
    expect(mensagens).toMatch(/corDoCarro/);
  });

  it('rejeita bairro inexistente com 400 em campos.bairroId', async () => {
    const r = await criar({ bairroId: 99999 });
    expect(r.statusCode).toBe(400);
    expect(r.json().campos.bairroId).toBe('Bairro não encontrado');
  });

  it('devolve 400 para JSON malformado e 404 pt-BR para id inexistente', async () => {
    const ruim = await app.inject({ method: 'POST', url: '/api/equipamentos', payload: '{nao-json', headers: { 'content-type': 'application/json' } });
    expect(ruim.statusCode).toBe(400);
    expect(ruim.json().erro).toBeTypeOf('string');
    const nada = await app.inject({ method: 'GET', url: '/api/equipamentos/999' });
    expect(nada.statusCode).toBe(404);
    expect(nada.json()).toEqual({ erro: 'Equipamento não encontrado' });
    const texto = await app.inject({ method: 'GET', url: '/api/equipamentos/abc' });
    expect(texto.statusCode).toBe(404);
  });
});

describe('busca', () => {
  it('"50%" casa só o modelo com "50%" (coringa escapado)', async () => {
    const com = await criarOk({ numeroSerie: 'S-A', modelo: 'Pro 50% Plus' });
    await criarOk({ numeroSerie: 'S-B', modelo: 'Pro 500 Plus' });
    const r = (await app.inject({ method: 'GET', url: `/api/equipamentos?busca=${encodeURIComponent('50%')}` })).json();
    expect(r.itens.map((e: { id: number }) => e.id)).toEqual([com.id]);
  });

  it('"_" e "\\" não viram coringa', async () => {
    const com = await criarOk({ numeroSerie: 'S-A', modelo: 'X_1' });
    await criarOk({ numeroSerie: 'S-B', modelo: 'XA1' });
    const r = (await app.inject({ method: 'GET', url: `/api/equipamentos?busca=${encodeURIComponent('x_1')}` })).json();
    expect(r.itens.map((e: { id: number }) => e.id)).toEqual([com.id]);
    const barra = await app.inject({ method: 'GET', url: `/api/equipamentos?busca=${encodeURIComponent('a\\')}` });
    expect(barra.statusCode).toBe(200);
    expect(barra.json().total).toBe(0);
  });

  it('aspas e acentos: "D\'Ávila" funciona e "marilia" acha "Rua Marília"', async () => {
    const dAvila = await criarOk({ numeroSerie: 'S-A', logradouro: "Rua D'Ávila" });
    const marilia = await criarOk({ numeroSerie: 'S-B', logradouro: 'Rua Marília Central' });
    const a = await app.inject({ method: 'GET', url: `/api/equipamentos?busca=${encodeURIComponent("D'Ávila")}` });
    expect(a.statusCode).toBe(200);
    expect(a.json().itens.map((e: { id: number }) => e.id)).toEqual([dAvila.id]);
    const sem = (await app.inject({ method: 'GET', url: `/api/equipamentos?busca=${encodeURIComponent("d'avila")}` })).json();
    expect(sem.total).toBe(1);
    const m = (await app.inject({ method: 'GET', url: '/api/equipamentos?busca=marilia' })).json();
    expect(m.itens.map((e: { id: number }) => e.id)).toContain(marilia.id);
    expect(m.itens.map((e: { id: number }) => e.id)).not.toContain(dAvila.id);
  });

  it('busca também pelo código e pelo nome do bairro', async () => {
    const eq = await criarOk();
    const porCodigo = (await app.inject({ method: 'GET', url: '/api/equipamentos?busca=fogo-rad-0001' })).json();
    expect(porCodigo.total).toBe(1);
    const nomeBairro = ctx.db.prepare('SELECT nome FROM bairros WHERE id = ?').get(eq.bairroId) as { nome: string };
    const porBairro = (await app.inject({ method: 'GET', url: `/api/equipamentos?busca=${encodeURIComponent(nomeBairro.nome)}` })).json();
    expect(porBairro.itens.map((e: { id: number }) => e.id)).toContain(eq.id);
  });

  it('pagina o resultado', async () => {
    for (let i = 0; i < 3; i++) await criarOk({ numeroSerie: `P-${i}` });
    const r = (await app.inject({ method: 'GET', url: '/api/equipamentos?porPagina=2&pagina=2' })).json();
    expect(r).toMatchObject({ total: 3, pagina: 2, porPagina: 2 });
    expect(r.itens).toHaveLength(1);
  });
});

describe('edição (PUT)', () => {
  it('não apaga posição atual, último sinal, código, token nem a situação vinda da telemetria', async () => {
    const eq = await criarOk();
    const tokenAntes = (ctx.db.prepare('SELECT token_dispositivo AS t FROM equipamentos WHERE id = ?').get(eq.id) as { t: string }).t;
    ctx.db
      .prepare("UPDATE equipamentos SET lat_atual = -22.2, lng_atual = -49.95, ultimo_sinal_em = '2026-10-17T14:59:00.000Z', situacao = 'mau_funcionamento' WHERE id = ?")
      .run(eq.id);
    relogio().definir('2026-10-17T16:00:00.000Z');

    const r = await app.inject({
      method: 'PUT',
      url: `/api/equipamentos/${eq.id}`,
      payload: corpoEquipamento(ctx, { marca: 'Nova Marca', situacao: 'operacional' }),
    });
    expect(r.statusCode).toBe(200);
    const depois = await ler(eq.id);
    expect(depois.marca).toBe('Nova Marca');
    expect(depois.latAtual).toBe(-22.2);
    expect(depois.lngAtual).toBe(-49.95);
    expect(depois.ultimoSinalEm).toBe('2026-10-17T14:59:00.000Z');
    expect(depois.situacao).toBe('mau_funcionamento');
    expect(depois.codigo).toBe(eq.codigo);
    expect(depois.criadoEm).toBe('2026-10-17T15:00:00.000Z');
    expect(depois.atualizadoEm).toBe('2026-10-17T16:00:00.000Z');
    const tokenDepois = (ctx.db.prepare('SELECT token_dispositivo AS t FROM equipamentos WHERE id = ?').get(eq.id) as { t: string }).t;
    expect(tokenDepois).toBe(tokenAntes);
  });

  it('aceita manter o próprio número de série, mas recusa o de outro equipamento (409)', async () => {
    const a = await criarOk({ numeroSerie: 'A-1' });
    await criarOk({ numeroSerie: 'B-1' });
    const mesmo = await app.inject({ method: 'PUT', url: `/api/equipamentos/${a.id}`, payload: corpoEquipamento(ctx, { numeroSerie: 'A-1' }) });
    expect(mesmo.statusCode).toBe(200);
    const outro = await app.inject({ method: 'PUT', url: `/api/equipamentos/${a.id}`, payload: corpoEquipamento(ctx, { numeroSerie: 'B-1' }) });
    expect(outro.statusCode).toBe(409);
  });

  it('PUT com outra situação não a altera (só o PATCH muda a situação)', async () => {
    const eq = await criarOk({ situacao: 'operacional' });
    const r = await app.inject({ method: 'PUT', url: `/api/equipamentos/${eq.id}`, payload: corpoEquipamento(ctx, { situacao: 'furtado' }) });
    expect(r.statusCode).toBe(200);
    expect((await ler(eq.id)).situacao).toBe('operacional');
  });

  it('PUT com outro tipo é recusado com 400 em português e nada muda', async () => {
    const eq = await criarOk();
    const r = await app.inject({
      method: 'PUT',
      url: `/api/equipamentos/${eq.id}`,
      payload: corpoEquipamento(ctx, { tipo: 'camera', caracteristicas: { resolucao: '1080p', visaoNoturna: true, colorida: true, ptz: false, angulo: 90, armazenamentoDias: 30 } }),
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().erro).toBe('O tipo do equipamento não pode ser alterado');
    expect((await ler(eq.id)).tipo).toBe('radar');
  });

  // O formulário de edição só manda o grupo de manutenção (necessidade, periodicidade, última e próxima) quando a pessoa
  // mexe nele. Sem o grupo, o PUT mantém o que está gravado: um reparo registrado enquanto o formulário estava aberto fica.
  it('PUT sem o grupo de manutenção mantém as datas gravadas (ex.: reparo concluído com o formulário aberto)', async () => {
    const eq = await criarOk({ manutencaoNecessidade: 'periodica', manutencaoPeriodicidadeDias: 30, proximaManutencao: '2026-10-01' });
    const reparo = await app.inject({ method: 'POST', url: `/api/equipamentos/${eq.id}/manutencoes`, payload: { tipo: 'corretiva', descricao: 'Reparo', concluidaEm: '2026-10-17T14:00:00.000Z' } });
    expect(reparo.json()).toMatchObject({ ultimaManutencao: '2026-10-17', proximaManutencao: '2026-11-16' });
    const { manutencaoNecessidade: _n, manutencaoPeriodicidadeDias: _p, ultimaManutencao: _u, proximaManutencao: _x, ...semManutencao } = corpoEquipamento(ctx, { marca: 'Outra' });
    const r = await app.inject({ method: 'PUT', url: `/api/equipamentos/${eq.id}`, payload: semManutencao });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ marca: 'Outra', manutencaoNecessidade: 'periodica', manutencaoPeriodicidadeDias: 30, ultimaManutencao: '2026-10-17', proximaManutencao: '2026-11-16' });
    // Com o grupo, a edição da manutenção vale (e continua validada junto).
    const comGrupo = await app.inject({ method: 'PUT', url: `/api/equipamentos/${eq.id}`, payload: corpoEquipamento(ctx, { manutencaoNecessidade: 'agendada', proximaManutencao: '2026-12-01' }) });
    expect(comGrupo.json()).toMatchObject({ manutencaoNecessidade: 'agendada', proximaManutencao: '2026-12-01' });
    const incompleto = await app.inject({ method: 'PUT', url: `/api/equipamentos/${eq.id}`, payload: corpoEquipamento(ctx, { manutencaoNecessidade: 'agendada' }) });
    expect(incompleto.statusCode).toBe(400);
  });

  it('devolve 404 ao editar equipamento inexistente', async () => {
    const r = await app.inject({ method: 'PUT', url: '/api/equipamentos/999', payload: corpoEquipamento(ctx) });
    expect(r.statusCode).toBe(404);
  });
});

describe('mudança de situação (PATCH)', () => {
  const patch = (id: number, payload: Record<string, unknown>) =>
    app.inject({ method: 'PATCH', url: `/api/equipamentos/${id}/situacao`, payload });

  it('furtado → operacional exige recuperado: true', async () => {
    const eq = await criarOk();
    expect((await patch(eq.id, { situacao: 'furtado', motivo: 'Boletim de ocorrência 123' })).statusCode).toBe(200);

    const sem = await patch(eq.id, { situacao: 'operacional', motivo: 'Voltou a funcionar' });
    expect(sem.statusCode).toBe(400);
    expect(sem.json().erro).toMatch(/Registre a recuperação do equipamento/);

    const com = await patch(eq.id, { situacao: 'operacional', motivo: 'Equipamento recuperado', recuperado: true });
    expect(com.statusCode).toBe(200);
    expect(com.json().situacao).toBe('operacional');
    const ficha = await ler(eq.id);
    expect(ficha.historico).toHaveLength(2);
    expect(ficha.historico[0]).toMatchObject({ de: 'furtado', para: 'operacional', motivo: 'Equipamento recuperado', em: '2026-10-17T15:00:00.000Z' });
    expect(ficha.historico[1]).toMatchObject({ de: 'operacional', para: 'furtado' });
  });

  it('furtado não "ressuscita" por outra situação: em manutenção, não instalado e mau funcionamento também exigem a recuperação', async () => {
    for (const destino of ['em_manutencao', 'nao_instalado', 'mau_funcionamento']) {
      const eq = await criarOk({ numeroSerie: `SN-${destino}` });
      await patch(eq.id, { situacao: 'furtado', motivo: 'Boletim de ocorrência 123' });
      const sem = await patch(eq.id, { situacao: destino, motivo: 'Mandado para a oficina' });
      expect(sem.statusCode, destino).toBe(400);
      expect((await ler(eq.id)).situacao).toBe('furtado');
      const com = await patch(eq.id, { situacao: destino, motivo: 'Equipamento recuperado', recuperado: true });
      expect(com.statusCode, destino).toBe(200);
      expect(com.json().situacao).toBe(destino);
    }
  });

  it('furtado → desativado (dado como perdido) passa sem recuperação e fecha o alerta de furto', async () => {
    const eq = await criarOk();
    await patch(eq.id, { situacao: 'furtado', motivo: 'Boletim de ocorrência 123' });
    const r = await patch(eq.id, { situacao: 'desativado', motivo: 'Dado como perdido pela secretaria' });
    expect(r.statusCode).toBe(200);
    expect(r.json().situacao).toBe('desativado');
  });

  it('mau funcionamento torna a manutenção imediata e a manutenção concluída reagenda a periódica', async () => {
    const eq = await criarOk({ manutencaoNecessidade: 'periodica', manutencaoPeriodicidadeDias: 30, proximaManutencao: '2026-11-20' });
    expect((await patch(eq.id, { situacao: 'mau_funcionamento', motivo: 'Tela apagada' })).json().manutencaoNecessidade).toBe('imediata');
    expect((await ler(eq.id)).manutencaoNecessidade).toBe('imediata');
    // No mapa da Central ele aparece com manutenção imediata.
    const mapa = (await app.inject({ method: 'GET', url: '/api/central/mapa' })).json();
    expect(mapa.equipamentos.find((e: { id: number }) => e.id === eq.id).manutencao).toBe('imediata');

    const r = await app.inject({ method: 'POST', url: `/api/equipamentos/${eq.id}/manutencoes`, payload: { tipo: 'corretiva', descricao: 'Troca da tela', concluidaEm: '2026-10-17T12:00:00.000Z' } });
    expect(r.json()).toMatchObject({ situacao: 'operacional', manutencaoNecessidade: 'periodica', proximaManutencao: '2026-11-16' });
  });

  it('exige motivo e recusa a mesma situação', async () => {
    const eq = await criarOk();
    const semMotivo = await patch(eq.id, { situacao: 'desativado' });
    expect(semMotivo.statusCode).toBe(400);
    expect(semMotivo.json().campos.motivo).toBeTypeOf('string');
    const igual = await patch(eq.id, { situacao: 'operacional', motivo: 'Nada mudou' });
    expect(igual.statusCode).toBe(400);
  });

  it('404 para equipamento inexistente', async () => {
    expect((await patch(999, { situacao: 'desativado', motivo: 'Teste' })).statusCode).toBe(404);
  });
});

describe('exclusão (DELETE)', () => {
  it('telemetria não impede a exclusão e sai junto com o equipamento (I1)', async () => {
    const eq = await criarOk();
    ctx.db
      .prepare("INSERT INTO telemetria_hora (equipamento_id, hora, leituras, online_min, metricas) VALUES (?, '2026-10-17T14:00:00.000Z', 10, 60, '{}')")
      .run(eq.id);
    expect((await app.inject({ method: 'DELETE', url: `/api/equipamentos/${eq.id}` })).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: `/api/equipamentos/${eq.id}` })).statusCode).toBe(404);
    expect(ctx.db.prepare('SELECT COUNT(*) AS n FROM telemetria_hora WHERE equipamento_id = ?').get(eq.id)).toEqual({ n: 0 });
  });

  it('a recusa diz qual histórico existe (alertas e manutenção)', async () => {
    const eq = await criarOk();
    const alerta = ctx.db.prepare("INSERT INTO alertas (tipo, criticidade, titulo, descricao, equipamento_id, criado_em) VALUES ('falha', 'alta', 't', 'd', ?, '2026-10-17T14:00:00.000Z')");
    alerta.run(eq.id);
    alerta.run(eq.id);
    ctx.db.prepare("INSERT INTO manutencoes (equipamento_id, tipo, aberta_em, prevista_para, descricao) VALUES (?, 'preventiva', '2026-10-17T14:00:00.000Z', '2026-11-01', 'x')").run(eq.id);
    const r = await app.inject({ method: 'DELETE', url: `/api/equipamentos/${eq.id}` });
    expect(r.statusCode).toBe(409);
    expect(r.json().erro).toBe("Este equipamento tem 2 alertas e 1 manutenção. Use a situação 'Desativado' em vez de excluir.");
  });

  it('recusa quando há alerta ou agente vinculado', async () => {
    const comAlerta = await criarOk({ numeroSerie: 'AL-1' });
    ctx.db
      .prepare("INSERT INTO alertas (tipo, criticidade, titulo, descricao, equipamento_id, criado_em) VALUES ('falha', 'alta', 't', 'd', ?, '2026-10-17T14:00:00.000Z')")
      .run(comAlerta.id);
    expect((await app.inject({ method: 'DELETE', url: `/api/equipamentos/${comAlerta.id}` })).statusCode).toBe(409);

    const comAgente = await criarOk({ numeroSerie: 'AG-1' });
    const bairro = ctx.db.prepare('SELECT id FROM bairros LIMIT 1').get() as { id: number };
    ctx.db
      .prepare(
        `INSERT INTO agentes (nome, matricula, categoria, orgao, situacao, turno, base_logradouro, base_bairro_id, lat, lng, lat_atual, lng_atual, equipamento_id, criado_em, atualizado_em)
         VALUES ('N', 'M-1', 'agente_transito', 'Secretaria de Mobilidade Urbana', 'em_servico', 'manha', 'Rua', ?, -22.2, -49.9, -22.2, -49.9, ?, '2026-10-17T14:00:00.000Z', '2026-10-17T14:00:00.000Z')`,
      )
      .run(bairro.id, comAgente.id);
    expect((await app.inject({ method: 'DELETE', url: `/api/equipamentos/${comAgente.id}` })).statusCode).toBe(409);
  });

  it('exclui equipamento novo, sem histórico, com 204', async () => {
    const eq = await criarOk();
    const r = await app.inject({ method: 'DELETE', url: `/api/equipamentos/${eq.id}` });
    expect(r.statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: `/api/equipamentos/${eq.id}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/api/equipamentos/${eq.id}` })).statusCode).toBe(404);
  });
});

describe('manutenção', () => {
  const registrar = (id: number, payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: `/api/equipamentos/${id}/manutencoes`, payload });

  it('concluir manutenção de equipamento periódico em mau funcionamento: volta a operar e reagenda', async () => {
    const eq = await criarOk({
      manutencaoNecessidade: 'periodica',
      manutencaoPeriodicidadeDias: 30,
      proximaManutencao: '2026-10-01',
    });
    ctx.db.prepare("UPDATE equipamentos SET situacao = 'mau_funcionamento' WHERE id = ?").run(eq.id);

    const r = await registrar(eq.id, { tipo: 'corretiva', descricao: 'Troca do sensor', concluidaEm: '2026-10-10T12:00:00.000Z' });
    expect(r.statusCode).toBe(201);
    const corpo = r.json();
    expect(corpo.situacao).toBe('operacional');
    expect(corpo.ultimaManutencao).toBe('2026-10-10');
    expect(corpo.proximaManutencao).toBe('2026-11-09');
    expect(corpo.manutencaoNecessidade).toBe('periodica');
    expect(corpo.historico).toHaveLength(1);
    expect(corpo.historico[0]).toMatchObject({ de: 'mau_funcionamento', para: 'operacional', motivo: 'Manutenção concluída' });
    expect(corpo.manutencoes).toHaveLength(1);
    expect(corpo.manutencoes[0]).toMatchObject({ tipo: 'corretiva', concluidaEm: '2026-10-10T12:00:00.000Z' });
  });

  it('usa a data local de São Paulo: 23h do dia 17 não vira dia 18', async () => {
    const eq = await criarOk({ manutencaoNecessidade: 'periodica', manutencaoPeriodicidadeDias: 30, proximaManutencao: '2026-10-01' });
    relogio().definir('2026-10-18T03:00:00.000Z');
    const r = await registrar(eq.id, { tipo: 'preventiva', descricao: 'Revisão noturna', concluidaEm: '2026-10-18T02:00:00Z' });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ ultimaManutencao: '2026-10-17', proximaManutencao: '2026-11-16' });
  });

  it('recusa conclusão no futuro (mais de 5 minutos além de agora)', async () => {
    const eq = await criarOk();
    const r = await registrar(eq.id, { tipo: 'corretiva', descricao: 'Data errada', concluidaEm: '2026-10-17T16:00:00.000Z' });
    expect(r.statusCode).toBe(400);
    expect(r.json()).toEqual({ erro: 'Dados inválidos', campos: { concluidaEm: 'A data de conclusão não pode estar no futuro' } });
    const ok = await registrar(eq.id, { tipo: 'corretiva', descricao: 'Dentro da tolerância', concluidaEm: '2026-10-17T15:04:00.000Z' });
    expect(ok.statusCode).toBe(201);
  });

  it('concluir manutenção não periódica zera a próxima data e a necessidade', async () => {
    const eq = await criarOk({ manutencaoNecessidade: 'agendada', proximaManutencao: '2026-10-20' });
    const r = await registrar(eq.id, { tipo: 'preventiva', descricao: 'Revisão geral', concluidaEm: '2026-10-17T10:00:00.000Z' });
    expect(r.statusCode).toBe(201);
    const corpo = r.json();
    expect(corpo.manutencaoNecessidade).toBe('nenhuma');
    expect(corpo.proximaManutencao).toBeUndefined();
    expect(corpo.situacao).toBe('operacional');
    expect(corpo.historico).toHaveLength(0);
  });

  it('só com previstaPara: agenda e ajusta a próxima data (periódico só muda a data)', async () => {
    const eq = await criarOk();
    const r = await registrar(eq.id, { tipo: 'preventiva', descricao: 'Limpeza da lente', previstaPara: '2026-10-25' });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ manutencaoNecessidade: 'agendada', proximaManutencao: '2026-10-25' });

    const periodico = await criarOk({ numeroSerie: 'PER-1', manutencaoNecessidade: 'periodica', manutencaoPeriodicidadeDias: 15, proximaManutencao: '2026-11-30' });
    const r2 = await registrar(periodico.id, { tipo: 'preventiva', descricao: 'Antecipar revisão', previstaPara: '2026-10-22' });
    expect(r2.json()).toMatchObject({ manutencaoNecessidade: 'periodica', proximaManutencao: '2026-10-22' });
  });

  it('agendar a mesma manutenção duas vezes: 409 e uma linha "prevista" só; concluir fecha a que estava prevista', async () => {
    const eq = await criarOk();
    const primeira = await registrar(eq.id, { tipo: 'preventiva', descricao: 'Limpeza da lente', previstaPara: '2026-10-25' });
    expect(primeira.statusCode).toBe(201);
    const segunda = await registrar(eq.id, { tipo: 'preventiva', descricao: 'Limpeza da lente', previstaPara: '2026-10-26' });
    expect(segunda.statusCode).toBe(409);
    expect(segunda.json()).toEqual({ erro: 'Já existe uma manutenção prevista para este equipamento' });
    const abertas = () => ctx.db.prepare('SELECT COUNT(*) AS n FROM manutencoes WHERE equipamento_id = ? AND concluida_em IS NULL').get(eq.id) as { n: number };
    expect(abertas()).toEqual({ n: 1 });
    // Outro tipo pode ser agendado.
    expect((await registrar(eq.id, { tipo: 'corretiva', descricao: 'Trocar cabo', previstaPara: '2026-10-27' })).statusCode).toBe(201);

    const concluida = await registrar(eq.id, { tipo: 'preventiva', descricao: 'Lente limpa', concluidaEm: '2026-10-17T14:00:00.000Z' });
    expect(concluida.statusCode).toBe(201);
    const preventivas = concluida.json().manutencoes.filter((m: { tipo: string }) => m.tipo === 'preventiva');
    expect(preventivas).toHaveLength(1);
    expect(preventivas[0]).toMatchObject({ previstaPara: '2026-10-25', concluidaEm: '2026-10-17T14:00:00.000Z', descricao: 'Lente limpa' });
    expect(abertas()).toEqual({ n: 1 }); // sobra só a corretiva agendada
  });

  it('exige previstaPara ou concluidaEm e descrição', async () => {
    const eq = await criarOk();
    const r = await registrar(eq.id, { tipo: 'corretiva', descricao: 'Sem datas' });
    expect(r.statusCode).toBe(400);
    const r2 = await registrar(eq.id, { tipo: 'corretiva', descricao: '', concluidaEm: '2026-10-10T12:00:00.000Z' });
    expect(r2.statusCode).toBe(400);
    expect(r2.json().campos.descricao).toBeTypeOf('string');
    expect((await registrar(999, { tipo: 'corretiva', descricao: 'Teste', previstaPara: '2026-10-25' })).statusCode).toBe(404);
  });

  it('painel agrupa atrasadas, imediatas, próximos 7 e próximos 30 dias', async () => {
    const atrasada = await criarOk({ numeroSerie: 'M-1', manutencaoNecessidade: 'agendada', proximaManutencao: '2026-10-10' });
    const imediata = await criarOk({ numeroSerie: 'M-2', manutencaoNecessidade: 'imediata' });
    const sete = await criarOk({ numeroSerie: 'M-3', manutencaoNecessidade: 'agendada', proximaManutencao: '2026-10-20' });
    const trinta = await criarOk({ numeroSerie: 'M-4', manutencaoNecessidade: 'agendada', proximaManutencao: '2026-11-05' });
    await criarOk({ numeroSerie: 'M-5', manutencaoNecessidade: 'agendada', proximaManutencao: '2027-03-01' });
    await criarOk({ numeroSerie: 'M-6' });

    const r = await app.inject({ method: 'GET', url: '/api/manutencao/painel' });
    expect(r.statusCode).toBe(200);
    const ids = (lista: { id: number }[]) => lista.map((e) => e.id);
    const painel = r.json();
    expect(ids(painel.atrasadas)).toEqual([atrasada.id]);
    expect(ids(painel.imediatas)).toEqual([imediata.id]);
    expect(ids(painel.proximos7)).toEqual([sete.id]);
    expect(ids(painel.proximos30)).toEqual([trinta.id]);
    expect(painel.atrasadas[0].codigo).toMatch(/^FOGO-RAD-/);
  });

  it('filtro manutencao=atrasada da lista usa o mesmo critério', async () => {
    const atrasada = await criarOk({ numeroSerie: 'M-1', manutencaoNecessidade: 'agendada', proximaManutencao: '2026-10-10' });
    await criarOk({ numeroSerie: 'M-2' });
    const r = (await app.inject({ method: 'GET', url: '/api/equipamentos?manutencao=atrasada' })).json();
    expect(r.itens.map((e: { id: number }) => e.id)).toEqual([atrasada.id]);
  });
});

describe('telemetria e catálogos', () => {
  it('devolve a telemetria das últimas N horas em ordem cronológica', async () => {
    const eq = await criarOk();
    const ins = ctx.db.prepare('INSERT INTO telemetria_hora (equipamento_id, hora, leituras, online_min, metricas) VALUES (?, ?, ?, ?, ?)');
    ins.run(eq.id, '2026-10-14T10:00:00.000Z', 5, 60, '{}'); // fora de 48 h
    ins.run(eq.id, '2026-10-16T16:00:00.000Z', 7, 55, '{"velocidadeMedia":42}');
    ins.run(eq.id, '2026-10-17T14:00:00.000Z', 9, 60, '{"velocidadeMedia":38}');
    const r = await app.inject({ method: 'GET', url: `/api/equipamentos/${eq.id}/telemetria?horas=48` });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual([
      { hora: '2026-10-16T16:00:00.000Z', leituras: 7, onlineMin: 55, metricas: { velocidadeMedia: 42 } },
      { hora: '2026-10-17T14:00:00.000Z', leituras: 9, onlineMin: 60, metricas: { velocidadeMedia: 38 } },
    ]);
    expect((await app.inject({ method: 'GET', url: '/api/equipamentos/999/telemetria' })).statusCode).toBe(404);
  });

  it('GET /api/tipos-equipamento lista os 13 tipos e /api/bairros traz os bairros com polígono', async () => {
    const tipos = (await app.inject({ method: 'GET', url: '/api/tipos-equipamento' })).json();
    expect(tipos).toHaveLength(13);
    expect(tipos[0]).toHaveProperty('campos');
    // As métricas que POST /api/telemetria aceita, por tipo (chave, rótulo e unidade), vindas de shared/telemetria.ts.
    const radar = tipos.find((t: { id: string }) => t.id === 'radar');
    expect(radar.metricas).toEqual([
      { chave: 'fluxo', rotulo: 'Fluxo de veículos', unidade: 'veículos/h' },
      { chave: 'velocidadeMedia', rotulo: 'Velocidade média da via', unidade: 'km/h' },
      { chave: 'infracoes', rotulo: 'Infrações registradas', unidade: 'infrações/h' },
    ]);
    for (const t of tipos) expect(t.metricas.length).toBeGreaterThan(0);
    // A documentação da ingestão aponta para esta rota (e não para uma inexistente).
    const docs = (await app.inject({ method: 'GET', url: '/api/docs/json' })).json();
    expect(docs.paths['/api/telemetria'].post.description).toContain('GET /api/tipos-equipamento');
    const bairros = (await app.inject({ method: 'GET', url: '/api/bairros' })).json();
    expect(bairros.length).toBe(ctx.geo.bairros.length);
    expect(bairros[0].poligono.type).toBe('Polygon');
    expect(bairros[0]).toHaveProperty('regiao');
  });
});

describe('documentação', () => {
  it('/api/docs abre e lista as rotas', async () => {
    const ui = await app.inject({ method: 'GET', url: '/api/docs/' });
    expect(ui.statusCode).toBe(200);
    const json = (await app.inject({ method: 'GET', url: '/api/docs/json' })).json();
    expect(Object.keys(json.paths)).toEqual(expect.arrayContaining(['/api/equipamentos', '/api/agentes', '/api/alertas', '/api/manutencao/painel']));
  });
});

describe('correções do inventário (rodada 2)', () => {
  const lista = async (consulta: string) => (await app.inject({ method: 'GET', url: `/api/equipamentos?${consulta}` })).json();

  it('a busca também olha a referência ("nº 181", "oposto")', async () => {
    const a = await criarOk({ numeroSerie: 'REF-1', referencia: 'oposto ao mercado' });
    await criarOk({ numeroSerie: 'REF-2', referencia: 'esquina' });
    expect((await lista('busca=oposto')).itens.map((e: { id: number }) => e.id)).toEqual([a.id]);
    const c = await criarOk({ numeroSerie: 'REF-3', referencia: 'nº 181, fundos' });
    expect((await lista(`busca=${encodeURIComponent('nº 181')}`)).itens.map((e: { id: number }) => e.id)).toEqual([c.id]);
    expect((await lista('busca=ESQUINA')).total).toBe(1);
  });

  it('ordena por tipo, situação e bairro (pelo rótulo) com desempate pelo código, e recusa coluna desconhecida', async () => {
    const radar = await criarOk({ numeroSerie: 'O-1' });
    const camera = await criarOk({
      numeroSerie: 'O-2', tipo: 'camera', orgao: 'Guarda Civil Municipal',
      caracteristicas: { resolucao: '1080p', visaoNoturna: true, colorida: true, ptz: false, angulo: 90, armazenamentoDias: 30 },
    });
    const ids = (r: { itens: { id: number }[] }) => r.itens.map((e) => e.id);
    expect(ids(await lista('ordem=tipo'))).toEqual([camera.id, radar.id]); // "Câmera..." antes de "Radar..."
    expect(ids(await lista('ordem=tipo&direcao=desc'))).toEqual([radar.id, camera.id]);
    expect(ids(await lista('ordem=codigo&direcao=desc'))).toEqual([radar.id, camera.id]); // CAM < RAD
    ctx.db.prepare("UPDATE equipamentos SET situacao = 'em_manutencao' WHERE id = ?").run(radar.id);
    expect(ids(await lista('ordem=situacao'))).toEqual([radar.id, camera.id]); // "Em manutenção" antes de "Operacional"
    expect((await app.inject({ method: 'GET', url: '/api/equipamentos?ordem=drop%20table' })).statusCode).toBe(400);
  });

  it('número de série com letra de largura total conta como repetido (NFKC) e é gravado normalizado', async () => {
    await criarOk({ numeroSerie: 'SN-S1' });
    const r = await criar({ numeroSerie: 'SN-Ｓ1' });
    expect(r.statusCode).toBe(409);
    const ok = await criarOk({ numeroSerie: 'ＡＢＣ-9' });
    expect(ok.numeroSerie).toBe('ABC-9');
  });

  it('caractere de controle (NUL) em marca, série ou busca é recusado; "busca=%00" não casa com tudo', async () => {
    await criarOk();
    for (const campo of ['marca', 'modelo', 'numeroSerie', 'logradouro', 'referencia']) {
      const r = await criar({ numeroSerie: 'SN-NUL', [campo]: 'abc\u0000def' });
      expect(r.statusCode, campo).toBe(400);
      expect(Object.keys(r.json().campos), campo).toContain(campo);
    }
    expect((await app.inject({ method: 'GET', url: '/api/equipamentos?busca=%00' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/api/agentes?busca=a%00' })).statusCode).toBe(400);
  });

  it('data de instalação absurda (1850) é recusada; 2000 em diante passa', async () => {
    const r = await criar({ instaladoEm: '1850-01-01' });
    expect(r.statusCode).toBe(400);
    expect(r.json().campos.instaladoEm).toMatch(/anterior a 2000/);
    expect((await criar({ numeroSerie: 'SN-OK', instaladoEm: '2000-01-01' })).statusCode).toBe(201);
  });

  it('viatura: o órgão responsável tem que ser o da característica "Órgão"', async () => {
    const viatura = (orgao: string, orgaoViatura: string) =>
      criar({ numeroSerie: `VTR-${orgao}`, tipo: 'viatura', orgao, caracteristicas: { placa: 'ABC1D23', orgaoViatura, prefixo: 'M-1' } });
    const errada = await viatura('Guarda Civil Municipal', 'Polícia Militar');
    expect(errada.statusCode).toBe(400);
    expect(errada.json().campos.orgao).toMatch(/Polícia Militar/);
    expect((await viatura('Polícia Militar', 'Polícia Militar')).statusCode).toBe(201);
  });

  describe('manutenção concluída com data sem sentido', () => {
    const registrar = (id: number, payload: Record<string, unknown>) =>
      app.inject({ method: 'POST', url: `/api/equipamentos/${id}/manutencoes`, payload });

    it('1900 é recusada; antes da instalação também', async () => {
      const eq = await criarOk({ instaladoEm: '2026-05-10' });
      const antiga = await registrar(eq.id, { tipo: 'corretiva', descricao: 'Data errada', concluidaEm: '1900-01-01T12:00:00.000Z' });
      expect(antiga.statusCode).toBe(400);
      expect(antiga.json().campos.concluidaEm).toMatch(/anterior a 2000/);
      const antes = await registrar(eq.id, { tipo: 'corretiva', descricao: 'Antes de existir', concluidaEm: '2026-05-01T12:00:00.000Z' });
      expect(antes.statusCode).toBe(400);
      expect(antes.json().campos.concluidaEm).toMatch(/anterior à instalação \(10\/05\/2026\)/);
      expect((await ler(eq.id)).ultimaManutencao).toBeUndefined();
    });

    it('mais antiga que a última manutenção é recusada (não sobrescreve a última) e do mesmo dia passa', async () => {
      const eq = await criarOk({ instaladoEm: '2026-01-01' });
      expect((await registrar(eq.id, { tipo: 'preventiva', descricao: 'Revisão de setembro', concluidaEm: '2026-09-20T12:00:00.000Z' })).statusCode).toBe(201);
      const velha = await registrar(eq.id, { tipo: 'preventiva', descricao: 'Revisão de agosto', concluidaEm: '2026-08-01T12:00:00.000Z' });
      expect(velha.statusCode).toBe(400);
      expect(velha.json().campos.concluidaEm).toMatch(/Já há manutenção concluída em 20\/09\/2026/);
      expect((await ler(eq.id)).ultimaManutencao).toBe('2026-09-20');
      expect((await registrar(eq.id, { tipo: 'corretiva', descricao: 'No mesmo dia', concluidaEm: '2026-09-20T18:00:00.000Z' })).statusCode).toBe(201);
    });
  });
});
