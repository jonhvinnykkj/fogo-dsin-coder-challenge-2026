import type { FastifyInstance } from 'fastify';
import { METRICAS_POR_TIPO } from '../../shared/telemetria';
import { TIPOS_EQUIPAMENTO } from '../../shared/tipos-equipamento';

// Cada tipo leva também as métricas que POST /api/telemetria aceita (chave, rótulo e unidade), de shared/telemetria.ts.
const CATALOGO = TIPOS_EQUIPAMENTO.map((t) => ({ ...t, metricas: METRICAS_POR_TIPO[t.id] }));

export async function rotasTipos(app: FastifyInstance): Promise<void> {
  app.get('/api/tipos-equipamento', {
    schema: {
      tags: ['Catálogo'],
      summary: 'Catálogo dos 13 tipos de equipamento, com os campos de cada um e as métricas de telemetria aceitas',
      description: 'Para cada tipo: id, nome, sigla, campos do cadastro e `metricas` ({ chave, rotulo, unidade }), as chaves que POST /api/telemetria aceita.',
    },
  }, async () => CATALOGO);
}
