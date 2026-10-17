import type { FastifyInstance } from 'fastify';

export async function rotasSaude(app: FastifyInstance): Promise<void> {
  app.get('/api/saude', async () => ({ ok: true, nome: 'F.O.G.O.' }));
}
