// Controle da simulação: velocidade, pausa e botão "simular evento".
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ErroApi } from '../erros';
import { TIPOS_EVENTO_SIMULADO } from '../../shared/dominio';

const tags = ['Tempo real'];

const mudancaSchema = z.object({
  velocidade: z.union([z.literal(1), z.literal(10), z.literal(60)], { errorMap: () => ({ message: 'Velocidade: use 1, 10 ou 60' }) }).optional(),
  pausado: z.boolean({ invalid_type_error: 'Pausado: use verdadeiro ou falso' }).optional(),
});

const eventoSchema = z.object({
  tipo: z.enum(TIPOS_EVENTO_SIMULADO, { errorMap: () => ({ message: `Tipo de evento: use ${TIPOS_EVENTO_SIMULADO.join(', ')}` }) }),
  alvoId: z.number({ invalid_type_error: 'alvoId: informe o id do equipamento' }).int().positive().optional(),
});

export async function rotasSimulacao(app: FastifyInstance): Promise<void> {
  const ctx = app.ctx;
  const simulador = () => {
    if (!ctx.simulador) throw new ErroApi(503, 'Simulador indisponível neste servidor');
    return ctx.simulador;
  };

  app.get('/api/simulacao', { schema: { tags, summary: 'Estado da simulação (velocidade, pausa e relógio)' } }, async () => simulador().estado());

  app.patch('/api/simulacao', {
    schema: { tags, summary: 'Muda a velocidade (1, 10 ou 60) e/ou pausa a simulação', body: { type: 'object', additionalProperties: true } },
    validatorCompiler: () => (dados) => ({ value: dados }),
  }, async (req) => simulador().definir(mudancaSchema.parse(req.body ?? {})));

  app.post('/api/simulacao/eventos', {
    schema: {
      tags,
      summary: 'Injeta um evento na cidade (furto, falha, acidente, alagamento ou congestionamento)',
      description: '`alvoId` é o equipamento alvo (furto, falha, alagamento) ou o de referência do local (acidente, congestionamento); sem ele o simulador escolhe. Devolve os alertas gerados.',
      body: { type: 'object', additionalProperties: true },
    },
    validatorCompiler: () => (dados) => ({ value: dados }),
  }, async (req) => {
    const { tipo, alvoId } = eventoSchema.parse(req.body);
    return { alertas: simulador().injetar(tipo, alvoId) };
  });
}
