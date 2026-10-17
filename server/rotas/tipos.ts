import type { FastifyInstance } from 'fastify';
import { TIPOS_EQUIPAMENTO } from '../../shared/tipos-equipamento';

export async function rotasTipos(app: FastifyInstance): Promise<void> {
  app.get('/api/tipos-equipamento', { schema: { tags: ['Catálogo'], summary: 'Catálogo dos 13 tipos de equipamento, com os campos de cada um' } }, async () => TIPOS_EQUIPAMENTO);
}
