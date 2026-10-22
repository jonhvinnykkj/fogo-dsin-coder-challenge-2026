// Server-Sent Events: a tela abre uma conexão e recebe tudo o que acontece na cidade, sem ficar perguntando.
//
// Formato de cada mensagem: `event: <tipo>` + `data: <JSON do evento inteiro>` (o mesmo objeto `EventoFogo`, com `tipo`).
// Ao conectar chegam `retry: 3000` (o navegador reconecta sozinho em 3 s) e um evento `estado` com `{ simulacao, indicadores }`.
// Depois vêm os eventos do barramento. A cada 15 s um comentário `:ping` mantém a conexão viva atrás de proxies.
import type { ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';
import type { EstadoInicialStream, EventoFogo } from '../../shared/modelos';
import { protegerEvento } from '../seguranca/protecao';
import { calcularIndicadores } from '../servicos/central';

const PING_MS = 15_000;

export async function rotasStream(app: FastifyInstance): Promise<void> {
  const ctx = app.ctx;
  const clientes = new Set<ServerResponse>();

  // Sem isto, fechar o servidor esperaria para sempre as conexões SSE abertas. Tem de ser `preClose`: o `onClose` do
  // Fastify só roda DEPOIS de o servidor terminar de fechar, e ele só fecha quando as conexões caem.
  app.addHook('preClose', async () => {
    for (const res of clientes) {
      res.end();
      res.socket?.destroy(); // senão a conexão fica "ociosa" e o servidor espera ela cair sozinha
    }
    clientes.clear();
  });

  app.get('/api/stream', {
    schema: {
      tags: ['Tempo real'],
      summary: 'Fluxo de eventos em tempo real (SSE)',
      description:
        'Eventos: `estado` (uma vez, ao conectar), `posicoes` (agrupadas a cada 2 s), `equipamento`, `agente`, `alerta`, `ocorrencia`, `indicadores` (a cada 5 s), `simulacao`. ' +
        'Cada `data` é o JSON do evento inteiro (`{ tipo, ... }`).',
    },
  }, async (req, reply) => {
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no', // proxies (nginx) não podem segurar os eventos
    });
    clientes.add(res);

    const escrever = (nome: string, dados: unknown) => {
      if (!res.writableEnded && !res.destroyed) res.write(`event: ${nome}\ndata: ${JSON.stringify(dados)}\n\n`);
    };

    // Assina antes de mandar o estado, para não perder o que acontecer entre uma coisa e outra.
    // Cada conexão recebe os eventos ajustados ao papel de quem abriu (posição de agentes aproximada para "somente consulta").
    const papel = req.usuario?.papel ?? 'leitura';
    const cancelar = ctx.barramento.assinar((e: EventoFogo) => escrever(e.tipo, protegerEvento(e, papel)));
    const ping = setInterval(() => {
      if (!res.writableEnded && !res.destroyed) res.write(':ping\n\n');
    }, PING_MS);
    ping.unref();

    let limpo = false;
    const limpar = () => {
      if (limpo) return;
      limpo = true;
      clearInterval(ping);
      cancelar();
      clientes.delete(res);
    };
    req.raw.on('close', limpar);
    res.on('close', limpar);

    res.write('retry: 3000\n\n');
    const estado: EstadoInicialStream = {
      indicadores: calcularIndicadores(ctx.db, {}, ctx.relogio.agora()),
      simulacao: ctx.simulador?.estado() ?? { velocidade: 1, pausado: false, relogio: ctx.relogio.agora().toISOString() },
    };
    escrever('estado', estado);
  });
}
