// App de teste já logado: cria um usuário do papel pedido, abre uma sessão e faz todo `app.inject` mandar o cookie.
// Os testes que não são sobre segurança continuam iguais; os de segurança usam `entrarComo` e `criarApp` direto.
import type { FastifyInstance, InjectOptions } from 'fastify';
import type { Papel } from '../../shared/seguranca';
import { criarApp } from '../app';
import type { ContextoApp } from '../contexto';
import { COOKIE_SESSAO, type OpcoesSeguranca } from '../seguranca/plugin';
import { gerarHashSenha } from '../seguranca/cripto';
import { abrirSessao } from '../seguranca/usuarios';

let sequencia = 0;
export const SENHA_DE_TESTE = 'senha-de-teste-123';
let hashDeTeste: string | undefined;

/** Cria um usuário do papel e devolve o cabeçalho `cookie` de uma sessão aberta para ele. */
export function entrarComo(ctx: ContextoApp, papel: Papel, agenteId: number | null = null): string {
  sequencia += 1;
  // Insere direto com um hash calculado uma vez: o scrypt de cada teste somaria segundos à suíte.
  const r = ctx.db
    .prepare("INSERT INTO usuarios (login, nome, papel, senha_hash, agente_id, criado_em) VALUES (?, ?, ?, ?, ?, '2026-10-01T00:00:00.000Z')")
    .run(`teste-${papel}-${sequencia}`, `Teste ${papel}`, papel, (hashDeTeste ??= gerarHashSenha(SENHA_DE_TESTE)), agenteId);
  return `${COOKIE_SESSAO}=${abrirSessao(ctx.db, Number(r.lastInsertRowid), '127.0.0.1')}`;
}

export async function criarAppDeTeste(ctx: ContextoApp, papel: Papel = 'gestor', opcoes: OpcoesSeguranca = {}): Promise<FastifyInstance> {
  // Limite alto: alguns testes fazem centenas de chamadas seguidas.
  const app = await criarApp(ctx, { limitePorMinuto: 100_000, ...opcoes });
  const cookie = entrarComo(ctx, papel);
  const injetar = app.inject.bind(app) as (o: InjectOptions | string) => ReturnType<FastifyInstance['inject']>;
  app.inject = ((o: InjectOptions | string) => {
    const opcoesInject: InjectOptions = typeof o === 'string' ? { url: o } : o;
    return injetar({ ...opcoesInject, headers: { cookie, ...opcoesInject.headers } });
  }) as FastifyInstance['inject'];
  (app as FastifyInstance & { cookieDeTeste: string }).cookieDeTeste = cookie;
  return app;
}
