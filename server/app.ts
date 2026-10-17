import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import type { ContextoApp } from './contexto';
import { rotasSaude } from './rotas/saude';

const PASTA_WEB = fileURLToPath(new URL('../dist/web', import.meta.url));

export async function criarApp(ctx: ContextoApp): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('ctx', ctx);

  await app.register(rotasSaude);

  // Interface compilada (npm run build): arquivos estáticos + fallback de SPA fora de /api.
  if (existsSync(PASTA_WEB)) {
    await app.register(fastifyStatic, { root: PASTA_WEB });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api')) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ erro: 'Rota não encontrada' });
    });
  }

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    ctx: ContextoApp;
  }
}
