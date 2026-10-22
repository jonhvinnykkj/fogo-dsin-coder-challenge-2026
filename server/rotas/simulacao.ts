// Controle da simulação: velocidade, pausa e botão "simular evento".
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ErroApi, invalido } from '../erros';
import { TIPOS_EVENTO_SIMULADO } from '../../shared/dominio';

const tags = ['Tempo real'];

export const mudancaSchema = z.object({
  velocidade: z.union([z.literal(1), z.literal(10), z.literal(60)], { errorMap: () => ({ message: 'Velocidade: use 1, 10 ou 60' }) }).optional(),
  pausado: z.boolean({ invalid_type_error: 'Pausado: use verdadeiro ou falso' }).optional(),
});

const idDoEquipamento = (campo: string) => z.number({ invalid_type_error: `${campo}: informe o id do equipamento` }).int().positive().optional();
// `.strict()`: campo que a rota não conhece (bairroId, por exemplo) era ignorado em silêncio e o evento saía em outro lugar.
export const eventoSchema = z
  .object({
    tipo: z.enum(TIPOS_EVENTO_SIMULADO, { errorMap: () => ({ message: `Tipo de evento: use ${TIPOS_EVENTO_SIMULADO.join(', ')}` }) }),
    alvoId: idDoEquipamento('alvoId'),
    /** Mesmo que `alvoId`, com o nome que o resto da API usa. */
    equipamentoId: idDoEquipamento('equipamentoId'),
  })
  .strict()
  .refine((e) => e.alvoId === undefined || e.equipamentoId === undefined || e.alvoId === e.equipamentoId, {
    message: 'Informe só um: alvoId e equipamentoId são o mesmo campo',
    path: ['equipamentoId'],
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
      description: '`alvoId` (ou `equipamentoId`, o mesmo campo) é o equipamento alvo (furto, falha, alagamento) ou o de referência do local (acidente, congestionamento); sem ele o simulador escolhe. Equipamento que não existe dá 404; campo desconhecido (como `bairroId`), 400. Devolve os alertas gerados.',
      body: { type: 'object', additionalProperties: true },
    },
    validatorCompiler: () => (dados) => ({ value: dados }),
  }, async (req) => {
    const corpo = req.body as Record<string, unknown> | null;
    if (corpo && typeof corpo === 'object' && 'bairroId' in corpo) {
      throw invalido('bairroId não é aceito: o evento nasce no local do equipamento alvo (alvoId)', { bairroId: 'Campo não aceito: use alvoId' });
    }
    const { tipo, alvoId, equipamentoId } = eventoSchema.parse(corpo);
    return { alertas: simulador().injetar(tipo, alvoId ?? equipamentoId) };
  });
}
