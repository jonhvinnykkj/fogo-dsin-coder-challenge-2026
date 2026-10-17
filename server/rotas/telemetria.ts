// Porta de entrada de dispositivos IoT (e do simulador, que usa a mesma função por dentro).
import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ErroApi } from '../erros';
import { ingerirTelemetria } from '../tempo-real/ingestao';

const corpoSchema = z.object({
  codigo: z.string({ required_error: 'Informe o código do equipamento' }).trim().min(1, 'Informe o código do equipamento').max(40),
  em: z
    .string({ invalid_type_error: 'Hora da leitura: use texto ISO 8601' })
    .refine((v) => !Number.isNaN(Date.parse(v)), 'Hora da leitura inválida: use ISO 8601 (ex.: 2026-10-17T15:00:00Z)')
    .optional(),
  metricas: z
    .record(z.string().max(40), z.union([z.number({ invalid_type_error: 'Cada métrica deve ser número ou verdadeiro/falso' }).finite(), z.boolean()]))
    .refine((m) => Object.keys(m).length >= 1 && Object.keys(m).length <= 20, 'Envie de 1 a 20 métricas'),
  lat: z.number().min(-90, 'Latitude entre -90 e 90').max(90, 'Latitude entre -90 e 90').optional(),
  lng: z.number().min(-180, 'Longitude entre -180 e 180').max(180, 'Longitude entre -180 e 180').optional(),
});

const hash = (t: string) => createHash('sha256').update(t).digest();
const naoAutorizado = () => new ErroApi(401, 'Token do dispositivo ausente ou não confere com o código informado (cabeçalho x-dispositivo-token)');

export async function rotasTelemetria(app: FastifyInstance): Promise<void> {
  const ctx = app.ctx;

  app.post('/api/telemetria', {
    schema: {
      tags: ['Tempo real'],
      summary: 'Recebe uma leitura de um dispositivo',
      description:
        'Autentica pelo cabeçalho `x-dispositivo-token` (o token do equipamento cadastrado, que precisa casar com o `codigo` do corpo). ' +
        'Corpo: `{ codigo, em?, metricas: { fluxo: 412, ... }, lat?, lng? }`; as métricas válidas dependem do tipo (`GET /api/tipos`). ' +
        'Responde 202 `{ aceita: true }`. A leitura atualiza o último sinal, a posição atual e a telemetria da hora, e pode gerar alertas.',
      headers: { type: 'object', properties: { 'x-dispositivo-token': { type: 'string', description: 'Token do dispositivo' } } },
      body: { type: 'object', additionalProperties: true },
      response: { 202: { type: 'object', properties: { aceita: { type: 'boolean' } } } },
    },
    // O corpo é validado pelo zod, depois da autenticação: quem não tem token não descobre o formato.
    validatorCompiler: () => (dados) => ({ value: dados }),
  }, async (req, reply) => {
    const token = req.headers['x-dispositivo-token'];
    const bruto = req.body as { codigo?: unknown } | null | undefined;
    if (typeof token !== 'string' || token === '' || typeof bruto?.codigo !== 'string') throw naoAutorizado();
    const linha = ctx.db.prepare('SELECT token_dispositivo AS t FROM equipamentos WHERE codigo = ?').get(bruto.codigo) as { t: string } | undefined;
    if (!linha || !timingSafeEqual(hash(token), hash(linha.t))) throw naoAutorizado();

    ingerirTelemetria(ctx, corpoSchema.parse(req.body));
    return reply.code(202).send({ aceita: true });
  });
}
