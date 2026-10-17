import type { FastifyInstance } from 'fastify';
import { listarBairros } from '../repositorios/bairros';

export async function rotasBairros(app: FastifyInstance): Promise<void> {
  app.get('/api/bairros', { schema: { tags: ['Catálogo'], summary: 'Bairros de Marília, com região, centro, CEP e polígono' } }, async () => listarBairros(app.ctx.db));
}
