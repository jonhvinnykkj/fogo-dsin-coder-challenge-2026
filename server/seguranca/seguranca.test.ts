import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Papel } from '../../shared/seguranca';
import { criarApp } from '../app';
import { converterTokensLegados } from '../db/migrar';
import { criarCtxDeTeste, type CtxDeTeste } from '../test/ctx';
import { entrarComo } from '../test/app';
import { corpoAgente, corpoEquipamento, inserirEquipamentoDeTeste } from '../test/fabricas';
import { conferirSenha, gerarHashSenha, hashTokenDispositivo, tokenDispositivoConfere } from './cripto';
import { foraDaTabela, REGRAS } from './permissoes';
import { aproximar, mascararMatricula, mascararTelefone } from './protecao';
import { criarUsuario, garantirUsuariosDemo } from './usuarios';

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

const cookieDe = (r: { headers: Record<string, unknown> }) => String([r.headers['set-cookie']].flat()[0] ?? '');

describe('tabela de permissões', () => {
  it('toda rota de /api registrada tem regra (rota nova sem regra seria recusada a todos)', async () => {
    const { app } = await montar();
    const semRegra = app.seguranca.rotas.filter((r) => {
      const [metodo, rota] = r.split(' ') as [string, string];
      return metodo !== 'HEAD' && !foraDaTabela(rota) && !(r in REGRAS);
    });
    expect(semRegra).toEqual([]);
  });

  it('sem sessão: consulta e escrita respondem 401; saúde continua aberta', async () => {
    const { app } = await montar();
    expect((await app.inject({ method: 'GET', url: '/api/saude' })).statusCode).toBe(200);
    for (const [method, url] of [['GET', '/api/equipamentos'], ['GET', '/api/central/mapa'], ['GET', '/api/stream'], ['DELETE', '/api/equipamentos/1'], ['POST', '/api/simulacao/eventos']] as const) {
      const r = await app.inject({ method, url });
      expect(r.statusCode, `${method} ${url}`).toBe(401);
      expect(r.json().erro).toMatch(/entre no sistema/i);
    }
  });

  // Status esperado por papel: 403 = recusado pela permissão; qualquer outro = passou da permissão
  // (404/409/503 aqui são do próprio recurso: o equipamento 999 não existe, o simulador não está ligado no teste).
  const CASOS: { metodo: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; url: string; corpo?: object; liberado: Papel[] }[] = [
    { metodo: 'GET', url: '/api/equipamentos', liberado: ['gestor', 'operador', 'agente', 'leitura'] },
    { metodo: 'GET', url: '/api/previsoes/resumo', liberado: ['gestor', 'operador', 'agente', 'leitura'] },
    { metodo: 'DELETE', url: '/api/equipamentos/999', liberado: ['gestor'] },
    { metodo: 'PUT', url: '/api/agentes/999', corpo: {}, liberado: ['gestor'] },
    { metodo: 'POST', url: '/api/equipamentos/999/token', liberado: ['gestor'] },
    { metodo: 'PATCH', url: '/api/simulacao', corpo: { velocidade: 10 }, liberado: ['gestor'] },
    { metodo: 'POST', url: '/api/simulacao/eventos', corpo: { tipo: 'acidente' }, liberado: ['gestor'] },
    { metodo: 'GET', url: '/api/auditoria', liberado: ['gestor'] },
    { metodo: 'PATCH', url: '/api/alertas/999/resolver', liberado: ['gestor', 'operador'] },
    { metodo: 'PATCH', url: '/api/equipamentos/999/situacao', corpo: { situacao: 'operacional', motivo: 'teste' }, liberado: ['gestor', 'operador'] },
    { metodo: 'POST', url: '/api/equipamentos/999/manutencoes', corpo: {}, liberado: ['gestor', 'operador'] },
  ];

  it.each(['gestor', 'operador', 'agente', 'leitura'] as const)('papel %s: só passa onde a tabela libera', async (papel) => {
    const { ctx, app } = await montar();
    const cookie = entrarComo(ctx, papel);
    for (const c of CASOS) {
      const r = await app.inject({ method: c.metodo, url: c.url, headers: { cookie }, ...(c.corpo && { payload: c.corpo }) });
      if (c.liberado.includes(papel)) expect(r.statusCode, `${papel} ${c.metodo} ${c.url}`).not.toBe(403);
      else {
        expect(r.statusCode, `${papel} ${c.metodo} ${c.url}`).toBe(403);
        expect(r.json().erro).toMatch(/não tem permissão/);
      }
    }
  });

  it('agente só muda a PRÓPRIA situação', async () => {
    const { ctx, app } = await montar();
    const gestor = entrarComo(ctx, 'gestor');
    const criar = (matricula: string) =>
      app.inject({ method: 'POST', url: '/api/agentes', headers: { cookie: gestor }, payload: corpoAgente(ctx, { matricula }) }).then((r) => r.json().id as number);
    const meu = await criar('AT-0001');
    const outro = await criar('AT-0002');
    const cookie = entrarComo(ctx, 'agente', meu);
    const mudar = (id: number) => app.inject({ method: 'PATCH', url: `/api/agentes/${id}/situacao`, headers: { cookie }, payload: { situacao: 'pausa' } });
    expect((await mudar(meu)).statusCode).toBe(200);
    const recusado = await mudar(outro);
    expect(recusado.statusCode).toBe(403);
    expect(recusado.json().erro).toMatch(/própria situação/);
  });
});

describe('entrada e sessão', () => {
  it('senha certa abre sessão com cookie httpOnly e SameSite=Strict; senha errada e usuário inexistente dão a mesma resposta', async () => {
    const { ctx, app } = await montar();
    criarUsuario(ctx.db, { login: 'Maria', nome: 'Maria', papel: 'operador', senha: 'senha-bem-forte' });

    const errada = await app.inject({ method: 'POST', url: '/api/auth/entrar', payload: { login: 'maria', senha: 'chute' } });
    const inexistente = await app.inject({ method: 'POST', url: '/api/auth/entrar', payload: { login: 'ninguem', senha: 'chute' } });
    expect(errada.statusCode).toBe(401);
    expect(inexistente.json()).toEqual(errada.json());

    const ok = await app.inject({ method: 'POST', url: '/api/auth/entrar', payload: { login: ' MARIA ', senha: 'senha-bem-forte' } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ login: 'maria', papel: 'operador' });
    expect(ok.json()).not.toHaveProperty('senhaHash');
    const setCookie = cookieDe(ok);
    expect(setCookie).toMatch(/^fogo_sessao=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Strict/i);

    const cookie = setCookie.split(';')[0]!;
    expect((await app.inject({ method: 'GET', url: '/api/auth/eu', headers: { cookie } })).json()).toMatchObject({ usuario: { login: 'maria' } });

    // O banco não guarda o valor do cookie, só o hash.
    const valor = cookie.split('=')[1]!;
    const sessoes = ctx.db.prepare('SELECT id_hash FROM sessoes').all() as { id_hash: string }[];
    expect(sessoes.some((s) => s.id_hash === valor)).toBe(false);

    expect((await app.inject({ method: 'POST', url: '/api/auth/sair', headers: { cookie } })).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: '/api/auth/eu', headers: { cookie } })).json()).toEqual({ usuario: null });
    expect((await app.inject({ method: 'GET', url: '/api/equipamentos', headers: { cookie } })).statusCode).toBe(401);
  });

  it('sessão vencida não vale', async () => {
    const { ctx, app } = await montar();
    const cookie = entrarComo(ctx, 'gestor');
    ctx.db.prepare("UPDATE sessoes SET expira_em = '2000-01-01T00:00:00.000Z'").run();
    expect((await app.inject({ method: 'GET', url: '/api/equipamentos', headers: { cookie } })).statusCode).toBe(401);
  });

  it('limita as tentativas de entrada por IP (força bruta)', async () => {
    const { app } = await montar({ limiteEntradaPorMinuto: 3 });
    const tentar = () => app.inject({ method: 'POST', url: '/api/auth/entrar', payload: { login: 'gestor', senha: 'chute' } });
    for (let i = 0; i < 3; i += 1) expect((await tentar()).statusCode).toBe(401);
    const barrada = await tentar();
    expect(barrada.statusCode).toBe(429);
    expect(barrada.json().erro).toMatch(/muitas requisições/i);
  });

  it('entrada com um clique só existe no modo demonstração', async () => {
    const fora = await montar();
    garantirUsuariosDemo(fora.ctx.db);
    expect((await fora.app.inject({ method: 'POST', url: '/api/auth/demo', payload: { papel: 'gestor' } })).statusCode).toBe(404);
    expect((await fora.app.inject({ method: 'GET', url: '/api/auth/modo' })).json()).toEqual({ demo: false });
    await fora.app.close();

    const { ctx, app } = await montar({ demo: true });
    garantirUsuariosDemo(ctx.db);
    const r = await app.inject({ method: 'POST', url: '/api/auth/demo', payload: { papel: 'leitura' } });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ login: 'consulta', papel: 'leitura' });
  }, 20_000); // 8 hashes scrypt de propósito lentos

  it('usuários de demonstração: um por papel, senhas aleatórias e só no banco vazio', () => {
    const ctx = criarCtxDeTeste();
    const criados = garantirUsuariosDemo(ctx.db);
    expect(criados.map((c) => c.papel).sort()).toEqual(['agente', 'gestor', 'leitura', 'operador']);
    expect(new Set(criados.map((c) => c.senha)).size).toBe(4);
    expect(garantirUsuariosDemo(ctx.db)).toEqual([]);
  }, 20_000);

  it('requisição de escrita vinda de outro site é recusada (CSRF)', async () => {
    const { ctx, app } = await montar();
    const cookie = entrarComo(ctx, 'gestor');
    const r = await app.inject({ method: 'PATCH', url: '/api/simulacao', headers: { cookie, origin: 'https://site-malicioso.example', host: 'localhost:3333' }, payload: { velocidade: 10 } });
    expect(r.statusCode).toBe(403);
    expect(r.json().erro).toMatch(/outro site/);
  });
});

describe('LGPD: dados pessoais e posição dos agentes', () => {
  it('máscaras mantêm só o necessário para reconhecer', () => {
    expect(mascararTelefone('(14) 99876-5432')).toBe('(14) •••••-••32');
    expect(mascararMatricula('AT-1001')).toBe('AT-••01');
    expect(mascararMatricula('GM2034')).toBe('GM••34');
    expect(aproximar(-22.21437)).toBeCloseTo(-22.215, 6);
  });

  it('telefone e matrícula inteiros só para o gestor; posição aproximada para "somente consulta"', async () => {
    const { ctx, app } = await montar();
    const gestor = entrarComo(ctx, 'gestor');
    const criado = (await app.inject({ method: 'POST', url: '/api/agentes', headers: { cookie: gestor }, payload: corpoAgente(ctx, { telefone: '(14) 99876-5432', lat: -22.21437, lng: -49.94621, baseBairroId: ctx.geo.bairroDoPonto(-22.21437, -49.94621) + 1 }) })).json();
    expect(criado).toMatchObject({ telefone: '(14) 99876-5432', matricula: 'AT-1001' });

    const operador = entrarComo(ctx, 'operador');
    const visto = (await app.inject({ method: 'GET', url: `/api/agentes/${criado.id}`, headers: { cookie: operador } })).json();
    expect(visto).toMatchObject({ telefone: '(14) •••••-••32', matricula: 'AT-••01', latAtual: -22.21437 });
    const lista = (await app.inject({ method: 'GET', url: '/api/agentes', headers: { cookie: operador } })).json();
    expect(lista.itens[0]).toMatchObject({ telefone: '(14) •••••-••32' });

    const consulta = entrarComo(ctx, 'leitura');
    const mapa = (await app.inject({ method: 'GET', url: '/api/central/mapa', headers: { cookie: consulta } })).json();
    expect(mapa.agentes[0].lat).toBeCloseTo(-22.215, 6);
    expect(mapa.agentes[0].lng).toBeCloseTo(-49.945, 6);
    const mapaOperador = (await app.inject({ method: 'GET', url: '/api/central/mapa', headers: { cookie: operador } })).json();
    expect(mapaOperador.agentes[0].lat).toBe(-22.21437);
  });
});

describe('auditoria', () => {
  it('registra quem editou, com antes e depois e sem o token do dispositivo', async () => {
    const { ctx, app } = await montar();
    const cookie = entrarComo(ctx, 'gestor');
    const criado = (await app.inject({ method: 'POST', url: '/api/equipamentos', headers: { cookie }, payload: corpoEquipamento(ctx) })).json();
    await app.inject({ method: 'PUT', url: `/api/equipamentos/${criado.id}`, headers: { cookie }, payload: corpoEquipamento(ctx, { marca: 'Outra marca' }) });

    const trilha = (await app.inject({ method: 'GET', url: '/api/auditoria', headers: { cookie } })).json();
    expect(trilha.total).toBe(2);
    const [edicao, cadastro] = trilha.itens;
    expect(cadastro).toMatchObject({ acao: 'Cadastro de equipamento', entidade: 'equipamentos', entidadeId: criado.id, status: 201, antes: null });
    expect(edicao).toMatchObject({ acao: 'Edição de equipamento', papel: 'gestor', status: 200 });
    expect(edicao.login).toMatch(/^teste-gestor/);
    expect(edicao.antes).toMatchObject({ marca: 'Kapsch' });
    expect(edicao.depois).toMatchObject({ marca: 'Outra marca' });
    expect(JSON.stringify(trilha)).not.toContain('token_dispositivo');
  });

  it('tentativa recusada também fica registrada; a de quem nem entrou, não', async () => {
    const { ctx, app } = await montar();
    const cookie = entrarComo(ctx, 'leitura');
    await app.inject({ method: 'DELETE', url: '/api/equipamentos/1', headers: { cookie } });
    await app.inject({ method: 'DELETE', url: '/api/equipamentos/1' });
    const linhas = ctx.db.prepare('SELECT papel, status, acao FROM auditoria').all();
    expect(linhas).toEqual([{ papel: 'leitura', status: 403, acao: 'Exclusão de equipamento' }]);
  });

  it('entrada errada vira registro sem guardar a senha tentada', async () => {
    const { ctx, app } = await montar();
    await app.inject({ method: 'POST', url: '/api/auth/entrar', payload: { login: 'gestor', senha: 'segredo-tentado' } });
    const linha = ctx.db.prepare('SELECT acao, status, dados FROM auditoria').get() as { acao: string; status: number; dados: string };
    expect(linha).toMatchObject({ acao: 'Entrada no sistema', status: 401 });
    expect(linha.dados).not.toContain('segredo-tentado');
  });
});

describe('tokens de dispositivo e senhas', () => {
  it('senha: scrypt com sal (mesma senha, hashes diferentes) e conferência', async () => {
    const a = gerarHashSenha('uma senha');
    expect(a).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(gerarHashSenha('uma senha')).not.toBe(a);
    expect(await conferirSenha('uma senha', a)).toBe(true);
    expect(await conferirSenha('outra senha', a)).toBe(false);
    expect(await conferirSenha('uma senha', 'lixo')).toBe(false);
  });

  it('banco antigo com token em texto é convertido para hash e o dispositivo continua entrando', () => {
    const ctx = criarCtxDeTeste();
    const id = inserirEquipamentoDeTeste(ctx, { tipo: 'radar', codigo: 'FOGO-RAD-0001' });
    ctx.db.prepare("UPDATE equipamentos SET token_dispositivo = 'token-antigo' WHERE id = ?").run(id);
    expect(converterTokensLegados(ctx.db)).toBe(1);
    const guardado = (ctx.db.prepare('SELECT token_dispositivo AS t FROM equipamentos WHERE id = ?').get(id) as { t: string }).t;
    expect(guardado).toBe(hashTokenDispositivo('token-antigo'));
    expect(tokenDispositivoConfere('token-antigo', guardado)).toBe(true);
    expect(converterTokensLegados(ctx.db)).toBe(0);
  });

  it('gestor gera token novo: ele vale na telemetria e o antigo deixa de valer', async () => {
    const { ctx, app } = await montar();
    const id = inserirEquipamentoDeTeste(ctx, { tipo: 'radar', codigo: 'FOGO-RAD-0001', token: 'token-velho' });
    const cookie = entrarComo(ctx, 'gestor');
    const novo = (await app.inject({ method: 'POST', url: `/api/equipamentos/${id}/token`, headers: { cookie } })).json();
    expect(novo).toMatchObject({ id, codigo: 'FOGO-RAD-0001' });
    const enviar = (token: string) =>
      app.inject({ method: 'POST', url: '/api/telemetria', headers: { 'x-dispositivo-token': token }, payload: { codigo: 'FOGO-RAD-0001', metricas: { fluxo: 10 } } });
    expect((await enviar(novo.token)).statusCode).toBe(202);
    expect((await enviar('token-velho')).statusCode).toBe(401);
  });
});

describe('cabeçalhos de segurança', () => {
  it('libera no CSP o script inline do index.html mesmo com quebras de linha CRLF (Windows)', async () => {
    const pasta = mkdtempSync(join(tmpdir(), 'fogo-csp-'));
    try {
      writeFileSync(join(pasta, 'index.html'), '<html><head><script>\r\n  var a = 1;\r\n</script></head></html>');
      const { app } = await montar({ pastaWeb: pasta });
      const csp = String((await app.inject({ method: 'GET', url: '/api/saude' })).headers['content-security-policy']);
      const esperado = createHash('sha256').update('\n  var a = 1;\n').digest('base64'); // o navegador normaliza para LF
      expect(csp).toContain(`'sha256-${esperado}'`);
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  });

  it('CSP sem upgrade para https, sem iframe e sem farejar tipo', async () => {
    const { app } = await montar();
    const r = await app.inject({ method: 'GET', url: '/api/saude' });
    const csp = String(r.headers['content-security-policy']);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain('https://tile.openstreetmap.org');
    expect(csp).not.toContain('upgrade-insecure-requests');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
  });
});
