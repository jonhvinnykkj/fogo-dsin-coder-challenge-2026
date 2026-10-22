// O tempo real vale tanto quanto a sessão: sair do sistema ou ter a sessão vencida fecha a conexão.
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { criarApp } from '../app';
import { entrarComo } from '../test/app';
import { criarCtxDeTeste, type CtxDeTeste } from '../test/ctx';

let ctx: CtxDeTeste;
let app: FastifyInstance;
let url: string;

beforeEach(async () => {
  ctx = criarCtxDeTeste();
  app = await criarApp(ctx, { limitePorMinuto: 100_000, verificarSessaoMs: 50 });
  await app.listen({ port: 0, host: '127.0.0.1' });
  url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
afterEach(async () => {
  await app.close();
});

/** Lê o stream até o servidor fechá-lo; devolve o texto recebido, ou 'aberto' se a conexão seguir viva depois de 1 s. */
async function ateFechar(r: Response, aoAbrir: () => Promise<void>): Promise<string> {
  const leitor = r.body!.getReader();
  const decoder = new TextDecoder();
  let texto = '';
  let abriu = false;
  const limite = Date.now() + 1500;
  for (;;) {
    const espera = limite - Date.now();
    const lido = await Promise.race([leitor.read(), new Promise<'tempo'>((ok) => setTimeout(() => ok('tempo'), Math.max(espera, 1)))]).catch(() => ({ done: true as const, value: undefined }));
    if (lido === 'tempo') {
      await leitor.cancel();
      return 'aberto';
    }
    if (lido.value) texto += decoder.decode(lido.value);
    if (!abriu && texto.includes('event: estado')) {
      abriu = true;
      await aoAbrir();
    }
    if (lido.done) return texto;
  }
}

describe('GET /api/stream e a sessão', () => {
  it('sair do sistema fecha a conexão', async () => {
    const cookie = entrarComo(ctx, 'gestor');
    const r = await fetch(`${url}/api/stream`, { headers: { cookie } });
    const texto = await ateFechar(r, async () => {
      await fetch(`${url}/api/auth/sair`, { method: 'POST', headers: { cookie } });
    });
    expect(texto).toContain('event: sessao');
    expect(texto).toContain('"encerrada":true');
  });

  it('sessão que vence com a conexão aberta: o servidor fecha na próxima conferência', async () => {
    const cookie = entrarComo(ctx, 'leitura');
    const r = await fetch(`${url}/api/stream`, { headers: { cookie } });
    const texto = await ateFechar(r, async () => {
      ctx.db.prepare("UPDATE sessoes SET expira_em = '2000-01-01T00:00:00.000Z'").run();
    });
    expect(texto).toContain('"encerrada":true');
  });

  it('a sessão de outra pessoa não é afetada', async () => {
    const a = entrarComo(ctx, 'gestor');
    const b = entrarComo(ctx, 'operador');
    const r = await fetch(`${url}/api/stream`, { headers: { cookie: b } });
    const texto = await ateFechar(r, async () => {
      await fetch(`${url}/api/auth/sair`, { method: 'POST', headers: { cookie: a } });
    });
    expect(texto).toBe('aberto');
  });
});
