import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { criarApp } from '../app';
import { criarCtxDeTeste, type CtxDeTeste } from '../test/ctx';
import { inserirEquipamentoDeTeste } from '../test/fabricas';
import { Simulador } from '../tempo-real/simulador';

let ctx: CtxDeTeste;
let app: FastifyInstance;
let url: string;

beforeEach(async () => {
  ctx = criarCtxDeTeste();
  ctx.simulador = new Simulador(ctx, { semente: 1 });
  app = await criarApp(ctx);
  await app.listen({ port: 0, host: '127.0.0.1' });
  url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
afterEach(async () => {
  await app.close();
});

/** Lê o stream até aparecer `quantos` blocos (separados por linha em branco) ou estourar o tempo. */
async function lerBlocos(resposta: Response, quantos: number, aoAbrir?: () => void): Promise<string[]> {
  const leitor = resposta.body!.getReader();
  const decoder = new TextDecoder();
  let texto = '';
  const limite = Date.now() + 4000;
  let abriu = false;
  while (Date.now() < limite) {
    const { value, done } = await leitor.read();
    if (done) break;
    texto += decoder.decode(value);
    if (!abriu) {
      abriu = true;
      aoAbrir?.();
    }
    if (texto.split('\n\n').filter(Boolean).length >= quantos) break;
  }
  await leitor.cancel();
  return texto.split('\n\n').filter(Boolean);
}

describe('GET /api/stream', () => {
  it('manda os cabeçalhos de SSE, retry, o evento estado e depois os eventos do barramento', async () => {
    const r = await fetch(`${url}/api/stream`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('text/event-stream');
    expect(r.headers.get('cache-control')).toContain('no-cache');
    expect(r.headers.get('connection')).toBe('keep-alive');

    const blocos = await lerBlocos(r, 3, () => {
      ctx.barramento.emitir({ tipo: 'simulacao', dados: { velocidade: 10, pausado: false, relogio: '2026-10-17T15:00:00.000Z' } });
    });
    expect(blocos[0]).toBe('retry: 3000');
    expect(blocos[1]).toMatch(/^event: estado\ndata: /);
    const estado = JSON.parse(blocos[1]!.split('data: ')[1]!) as { simulacao: { velocidade: number } };
    expect(estado.simulacao.velocidade).toBe(1);
    expect(blocos[2]).toMatch(/^event: simulacao\ndata: /);
    expect(JSON.parse(blocos[2]!.split('data: ')[1]!)).toMatchObject({ tipo: 'simulacao', dados: { velocidade: 10 } });
  });

  it('o estado inicial leva os indicadores e o simulador publica `indicadores` pelo barramento', async () => {
    inserirEquipamentoDeTeste(ctx, { tipo: 'radar', codigo: 'S-1' });
    const r = await fetch(`${url}/api/stream`);
    const blocos = await lerBlocos(r, 3, () => ctx.simulador!.emitirIndicadores());
    const estado = JSON.parse(blocos[1]!.split('data: ')[1]!) as { indicadores: { totalEquipamentos: number } };
    expect(estado.indicadores.totalEquipamentos).toBeGreaterThan(0);
    const ev = blocos.find((b) => b.startsWith('event: indicadores'));
    expect(ev).toBeDefined();
    expect(JSON.parse(ev!.split('data: ')[1]!)).toMatchObject({ tipo: 'indicadores', dados: { totalEquipamentos: 1 } });
  });

  it('um alerta injetado aparece no stream', async () => {
    const r = await fetch(`${url}/api/stream`);
    const blocos = await lerBlocos(r, 3, () => {
      void fetch(`${url}/api/simulacao/eventos`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tipo: 'acidente' }) });
    });
    const alerta = blocos.find((b) => b.startsWith('event: alerta'));
    expect(alerta).toBeDefined();
    expect(JSON.parse(alerta!.split('data: ')[1]!)).toMatchObject({ tipo: 'alerta', dados: { tipo: 'acidente' } });
  });

  it('ao desconectar, a assinatura do barramento é removida', async () => {
    const r = await fetch(`${url}/api/stream`);
    await lerBlocos(r, 2);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(ctx.barramento.ouvintesAtivos).toBe(0);
  });

  it('fechar o servidor encerra as conexões abertas (não trava)', async () => {
    const r = await fetch(`${url}/api/stream`);
    const leitor = r.body!.getReader();
    await leitor.read(); // chegou o retry: a conexão está aberta
    const inicio = Date.now();
    await app.close();
    expect(Date.now() - inicio).toBeLessThan(2000);
    // O cliente vê o fim do stream (ou erro de conexão encerrada), nunca fica pendurado.
    const fim = await Promise.race([leitor.read().then((x) => (x.done ? 'fim' : 'dados')).catch(() => 'fim'), new Promise((res) => setTimeout(() => res('pendurado'), 2000))]);
    expect(fim).not.toBe('pendurado');
    expect(ctx.barramento.ouvintesAtivos).toBe(0);
  });
});
