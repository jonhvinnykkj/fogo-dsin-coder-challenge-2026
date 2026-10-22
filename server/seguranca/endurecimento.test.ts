// Segunda rodada de segurança e API: auditoria do Modo Campo, busca, Origin, entrada e mensagens de erro.
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { criarApp } from '../app';
import { inserirOcorrencia } from '../repositorios/ocorrencias';
import { entrarComo } from '../test/app';
import { criarCtxDeTeste, type CtxDeTeste } from '../test/ctx';
import { corpoAgente, inserirEquipamentoDeTeste } from '../test/fabricas';
import { Simulador } from '../tempo-real/simulador';
import { criarUsuario } from './usuarios';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function montar(opcoes: Parameters<typeof criarApp>[1] = {}): Promise<{ ctx: CtxDeTeste; app: FastifyInstance }> {
  const ctx = criarCtxDeTeste();
  app = await criarApp(ctx, { limitePorMinuto: 100_000, ...opcoes });
  return { ctx, app };
}

const bairroDe = (ctx: CtxDeTeste) => ctx.db.prepare('SELECT id, lat, lng FROM bairros ORDER BY id LIMIT 1').get() as { id: number; lat: number; lng: number };
const linhasDeAuditoria = (ctx: CtxDeTeste) =>
  (ctx.db.prepare('SELECT acao, entidade, entidade_id AS entidadeId, status, antes, depois, dados FROM auditoria ORDER BY id').all() as Record<string, string | number | null>[]).map((l) => ({
    ...l, antes: l.antes ? JSON.parse(l.antes as string) : null, depois: l.depois ? JSON.parse(l.depois as string) : null, dados: l.dados ? JSON.parse(l.dados as string) : null,
  }));

async function agenteComSessao(ctx: CtxDeTeste, app: FastifyInstance, papel: 'agente' | 'operador' = 'agente') {
  const gestor = entrarComo(ctx, 'gestor');
  const r = await app.inject({ method: 'POST', url: '/api/agentes', headers: { cookie: gestor }, payload: corpoAgente(ctx) });
  const id = (r.json() as { id: number }).id;
  ctx.db.prepare('DELETE FROM auditoria').run();
  return { id, cookie: entrarComo(ctx, papel, papel === 'agente' ? id : null) };
}

describe('auditoria do Modo Campo: entidade certa, com antes e depois', () => {
  it('relato: fotografa o EQUIPAMENTO relatado (situação antes e depois) e guarda o agente', async () => {
    const { ctx, app } = await montar();
    const { id, cookie } = await agenteComSessao(ctx, app);
    const b = bairroDe(ctx);
    const eq = inserirEquipamentoDeTeste(ctx, { tipo: 'camera', codigo: 'FOGO-CAM-0001', lat: b.lat, lng: b.lng });
    const r = await app.inject({ method: 'POST', url: `/api/campo/agentes/${id}/reportes`, headers: { cookie }, payload: { equipamentoId: eq, problema: 'furtado' } });
    expect(r.statusCode).toBe(201);
    const [linha] = linhasDeAuditoria(ctx);
    expect(linha).toMatchObject({ acao: 'Problema relatado pelo agente (Modo Campo)', entidade: 'equipamentos', entidadeId: eq, status: 201 });
    expect(linha!.antes).toMatchObject({ id: eq, situacao: 'operacional' });
    expect(linha!.depois).toMatchObject({ id: eq, situacao: 'furtado' });
    expect(linha!.dados).toMatchObject({ agenteId: id, equipamentoId: eq, problema: 'furtado' });
  });

  it('chegada e conclusão: fotografam a OCORRÊNCIA, com o id dela (e não o do agente)', async () => {
    const { ctx, app } = await montar();
    const { id, cookie } = await agenteComSessao(ctx, app);
    const b = bairroDe(ctx);
    const o = inserirOcorrencia(ctx.db, {
      tipo: 'acidente', gravidade: 3, bairroId: b.id, lat: b.lat, lng: b.lng, inicio: '2026-10-17T14:50:00.000Z', agenteId: id, descricao: 'Colisão', chuva: false, origem: 'injetado',
    });
    ctx.db.prepare("UPDATE agentes SET situacao = 'em_ocorrencia' WHERE id = ?").run(id);
    expect(o.id).not.toBe(id + 1000); // ids de entidades diferentes: o teste só vale se a auditoria não usar o do agente
    await app.inject({ method: 'POST', url: `/api/campo/agentes/${id}/despachos/${o.id}/chegada`, headers: { cookie } });
    await app.inject({ method: 'POST', url: `/api/campo/agentes/${id}/despachos/${o.id}/conclusao`, headers: { cookie } });
    const [chegada, conclusao] = linhasDeAuditoria(ctx);
    expect(chegada).toMatchObject({ acao: 'Chegada do agente ao local (Modo Campo)', entidade: 'ocorrencias', entidadeId: o.id, status: 200 });
    expect(chegada!.antes).toMatchObject({ id: o.id, chegou_em: null });
    expect(chegada!.depois).toMatchObject({ id: o.id, chegou_em: '2026-10-17T15:00:00.000Z' });
    expect(chegada!.dados).toMatchObject({ agenteId: id });
    expect(conclusao).toMatchObject({ entidade: 'ocorrencias', entidadeId: o.id, status: 200 });
    expect(conclusao!.antes).toMatchObject({ id: o.id, fim: null });
    expect(conclusao!.depois).toMatchObject({ id: o.id, fim: expect.any(String) });
  });

  it('o 403 chega à auditoria com o que se tentou enviar e a entidade alvo', async () => {
    const { ctx, app } = await montar();
    const { id } = await agenteComSessao(ctx, app);
    const consulta = entrarComo(ctx, 'leitura');
    const r = await app.inject({ method: 'POST', url: `/api/campo/agentes/${id}/reportes`, headers: { cookie: consulta }, payload: { equipamentoId: 7, problema: 'furtado', observacao: 'tentativa' } });
    expect(r.statusCode).toBe(403);
    const [linha] = linhasDeAuditoria(ctx);
    expect(linha).toMatchObject({ entidade: 'equipamentos', entidadeId: 7, status: 403 });
    expect(linha!.dados).toMatchObject({ agenteId: id, equipamentoId: 7, observacao: 'tentativa' });
  });
});

describe('busca de agentes não desfaz a máscara da matrícula', () => {
  it('"somente consulta" e operador não acham agente pela matrícula (nem por prefixo); o gestor acha', async () => {
    const { ctx, app } = await montar();
    const gestor = entrarComo(ctx, 'gestor');
    await app.inject({ method: 'POST', url: '/api/agentes', headers: { cookie: gestor }, payload: corpoAgente(ctx, { matricula: 'GM-2004', categoria: 'guarda_municipal', orgao: 'Guarda Civil Municipal' }) });
    const buscar = async (cookie: string, termo: string) => (await app.inject({ method: 'GET', url: `/api/agentes?busca=${encodeURIComponent(termo)}`, headers: { cookie } })).json().total as number;
    for (const papel of ['leitura', 'operador', 'agente'] as const) {
      const cookie = entrarComo(ctx, papel);
      for (const termo of ['GM-2004', 'GM-20', '2004', 'GM-']) expect(await buscar(cookie, termo), `${papel} ${termo}`).toBe(0);
      expect(await buscar(cookie, 'Carlos'), `${papel} por nome`).toBe(1); // o resto da busca continua
    }
    expect(await buscar(gestor, 'GM-2004')).toBe(1);
  });
});

describe('Origin em toda escrita', () => {
  const evil = { origin: 'http://evil.com', host: 'localhost:3333' };

  it('entrar, demo e sair de outro site: 403 (rotas públicas também)', async () => {
    const { app } = await montar({ demo: true });
    for (const [url, payload] of [['/api/auth/entrar', { login: 'x', senha: 'y' }], ['/api/auth/demo', { papel: 'gestor' }], ['/api/auth/sair', undefined]] as const) {
      const r = await app.inject({ method: 'POST', url, headers: evil, ...(payload && { payload }) });
      expect(r.statusCode, url).toBe(403);
      expect(r.json().erro).toMatch(/outro site/);
    }
  });

  it('o mesmo site passa; telemetria (dispositivo) não confere Origin', async () => {
    const { ctx, app } = await montar({ demo: true });
    inserirEquipamentoDeTeste(ctx, { tipo: 'radar', codigo: 'FOGO-RAD-0001', token: 'tok' });
    const mesmo = await app.inject({ method: 'POST', url: '/api/auth/sair', headers: { origin: 'http://localhost:3333', host: 'localhost:3333' } });
    expect(mesmo.statusCode).toBe(204);
    const tel = await app.inject({ method: 'POST', url: '/api/telemetria', headers: { ...evil, 'x-dispositivo-token': 'tok' }, payload: { codigo: 'FOGO-RAD-0001', metricas: { fluxo: 5 } } });
    expect(tel.statusCode).toBe(202);
  });

  it('localhost:5173 (Vite) só vale em desenvolvimento: sem interface servida passa; com ela, ou em produção, é recusado', async () => {
    const dev = { origin: 'http://localhost:5173', host: 'localhost:3333' };
    const aberto = await montar({ pastaWeb: join(tmpdir(), 'fogo-nao-existe') });
    expect((await aberto.app.inject({ method: 'POST', url: '/api/auth/sair', headers: dev })).statusCode).toBe(204);
    await aberto.app.close();

    const pasta = mkdtempSync(join(tmpdir(), 'fogo-web-'));
    try {
      writeFileSync(join(pasta, 'index.html'), '<html></html>');
      const servindo = await montar({ pastaWeb: pasta });
      expect((await servindo.app.inject({ method: 'POST', url: '/api/auth/sair', headers: dev })).statusCode).toBe(403);
      await servindo.app.close();
      const forcado = await montar({ pastaWeb: pasta, origensDeDesenvolvimento: true });
      expect((await forcado.app.inject({ method: 'POST', url: '/api/auth/sair', headers: dev })).statusCode).toBe(204);
      await forcado.app.close();
      // `npm run dev` depois de um `npm start`: a pasta compilada sobrou, mas a interface vem do Vite.
      vi.stubEnv('npm_lifecycle_event', 'dev');
      try {
        const npmDev = await montar({ pastaWeb: pasta });
        expect((await npmDev.app.inject({ method: 'POST', url: '/api/auth/sair', headers: dev })).statusCode).toBe(204);
        await npmDev.app.close();
      } finally {
        vi.unstubAllEnvs();
      }
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
    const producao = await montar({ pastaWeb: join(tmpdir(), 'fogo-nao-existe'), origensDeDesenvolvimento: false });
    expect((await producao.app.inject({ method: 'POST', url: '/api/auth/sair', headers: dev })).statusCode).toBe(403);
  });
});

describe('entrada: a senha digitada no campo de usuário não vai para a auditoria', () => {
  it('login inexistente não é gravado; login existente com senha errada fica identificado', async () => {
    const { ctx, app } = await montar();
    criarUsuario(ctx.db, { login: 'maria', nome: 'Maria', papel: 'operador', senha: 'senha-bem-forte' });
    await app.inject({ method: 'POST', url: '/api/auth/entrar', payload: { login: 'MinhaSenhaSecreta123', senha: 'x' } });
    await app.inject({ method: 'POST', url: '/api/auth/entrar', payload: { login: 'maria', senha: 'errada' } });
    const linhas = ctx.db.prepare('SELECT login, dados, status FROM auditoria ORDER BY id').all();
    expect(JSON.stringify(linhas)).not.toContain('MinhaSenhaSecreta123');
    expect(linhas).toEqual([{ login: null, dados: null, status: 401 }, { login: 'maria', dados: null, status: 401 }]);
  }, 20_000);
});

describe('mensagens e formato da API', () => {
  it('X-Frame-Options é DENY (coerente com frame-ancestors none)', async () => {
    const { app } = await montar();
    expect((await app.inject({ method: 'GET', url: '/api/saude' })).headers['x-frame-options']).toBe('DENY');
  });

  it('Content-Type JSON com corpo vazio vale como sem corpo (DELETE, POST .../token, sair)', async () => {
    const { ctx, app } = await montar();
    const cookie = entrarComo(ctx, 'gestor');
    const id = inserirEquipamentoDeTeste(ctx, { tipo: 'radar', codigo: 'FOGO-RAD-0001' });
    const json = { cookie, 'content-type': 'application/json' };
    expect((await app.inject({ method: 'POST', url: `/api/equipamentos/${id}/token`, headers: json })).statusCode).toBe(200);
    expect((await app.inject({ method: 'DELETE', url: `/api/equipamentos/${id}`, headers: json })).statusCode).toBe(204);
    expect((await app.inject({ method: 'POST', url: '/api/auth/sair', headers: json })).statusCode).toBe(204);
  });

  it('JSON quebrado, corpo grande e tipo de conteúdo errado ganham mensagem clara em português', async () => {
    const { ctx, app } = await montar();
    const cookie = entrarComo(ctx, 'gestor');
    const enviar = (headers: Record<string, string>, payload: string) => app.inject({ method: 'POST', url: '/api/equipamentos', headers: { cookie, ...headers }, payload });
    const quebrado = await enviar({ 'content-type': 'application/json' }, '{ruim');
    expect([quebrado.statusCode, quebrado.json().erro]).toEqual([400, 'JSON inválido no corpo da requisição']);
    const grande = await enviar({ 'content-type': 'application/json' }, 'x'.repeat(300_000));
    expect([grande.statusCode, grande.json().erro]).toEqual([413, 'Corpo grande demais: o limite é de 256 KB']);
    const tipo = await enviar({ 'content-type': 'application/xml' }, '<a/>');
    expect(tipo.statusCode).toBe(415);
    expect(tipo.json().erro).toMatch(/Content-Type: application\/json/);
  });

  it('403 do servidor de arquivos não vira "confira o corpo": caminho com // é 404; outro 403 diz que o caminho é negado', async () => {
    const { app } = await montar();
    app.get('/arquivos/:nome', async () => {
      throw Object.assign(new Error('Forbidden'), { statusCode: 403 });
    });
    const negado = await app.inject({ method: 'GET', url: '/arquivos/segredo' });
    expect([negado.statusCode, negado.json().erro]).toEqual([403, 'Acesso negado a este caminho']);
  });

  it.skipIf(!existsSync(join(__dirname, '../../dist/web/index.html')))('com a interface compilada, GET /api//auditoria dá 404 "Rota não encontrada"', async () => {
    const { ctx, app } = await montar();
    const r = await app.inject({ method: 'GET', url: '/api//auditoria', headers: { cookie: entrarComo(ctx, 'gestor') } });
    expect([r.statusCode, r.json().erro]).toEqual([404, 'Rota não encontrada']);
  });

  it('POST /api/simulacao/eventos recusa equipamento inexistente (404), campo desconhecido como bairroId (400) e id de tipo errado (400)', async () => {
    const { ctx, app } = await montar();
    ctx.simulador = new Simulador(ctx, { semente: 1 });
    const cookie = entrarComo(ctx, 'gestor');
    const injetar = (payload: object) => app.inject({ method: 'POST', url: '/api/simulacao/eventos', headers: { cookie }, payload });
    const inexistente = await injetar({ tipo: 'furto', equipamentoId: 999999 });
    expect([inexistente.statusCode, inexistente.json().erro]).toEqual([404, 'Equipamento não encontrado']);
    const bairro = await injetar({ tipo: 'alagamento', bairroId: 999 });
    expect(bairro.statusCode).toBe(400);
    expect(bairro.json().campos).toHaveProperty('bairroId');
    expect((await injetar({ tipo: 'falha', equipamentoId: 'x' })).statusCode).toBe(400);
    expect((await injetar({ tipo: 'falha', talvez: 1 })).statusCode).toBe(400);
  });

  it('horas= vazio na telemetria do equipamento vale como não informado', async () => {
    const { ctx, app } = await montar();
    const cookie = entrarComo(ctx, 'gestor');
    const id = inserirEquipamentoDeTeste(ctx, { tipo: 'radar', codigo: 'FOGO-RAD-0001' });
    expect((await app.inject({ method: 'GET', url: `/api/equipamentos/${id}/telemetria?horas=`, headers: { cookie } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/api/equipamentos/${id}/telemetria?horas=abc`, headers: { cookie } })).statusCode).toBe(400);
  });
});
