import type { FastifyInstance } from 'fastify';
import { painel } from '../servicos/equipamentos';

export async function rotasManutencao(app: FastifyInstance): Promise<void> {
  app.get('/api/manutencao/painel', {
    schema: {
      tags: ['Manutenção'],
      summary: 'Painel de manutenção: atrasadas, imediatas, próximos 7 e próximos 30 dias',
      description: 'Considera só equipamentos ativos (exclui desativados e não instalados). Os grupos não se repetem.',
    },
  }, async () => painel(app.ctx));
}
