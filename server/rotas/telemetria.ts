// Porta de entrada de dispositivos IoT (e do simulador, que usa a mesma função por dentro).
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ErroApi } from '../erros';
import { tokenDispositivoConfere } from '../seguranca/cripto';
import { conferirLeitura } from '../tempo-real/faixas';
import { ingerirTelemetria } from '../tempo-real/ingestao';
import { alvoPorCodigo } from '../tempo-real/motor-alertas';

export const corpoSchema = z.object({
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

/** Tentativas recusadas por IP: sem isto, dava para testar 300 tokens por minuto sem tomar nem um 429. */
export const RECUSADAS_POR_MINUTO = 30;
const JANELA_MS = 60_000;

const naoAutorizado = () => new ErroApi(401, 'Token do dispositivo ausente ou não confere com o código informado (cabeçalho x-dispositivo-token)');

export async function rotasTelemetria(app: FastifyInstance): Promise<void> {
  const ctx = app.ctx;
  const recusadas = new Map<string, number[]>();
  /** Instantes (ms) das recusas do IP na última janela. */
  const recentes = (ip: string, agora: number) => {
    const lista = (recusadas.get(ip) ?? []).filter((t) => agora - t < JANELA_MS);
    if (lista.length) recusadas.set(ip, lista);
    else recusadas.delete(ip);
    return lista;
  };

  app.post('/api/telemetria', {
    schema: {
      tags: ['Tempo real'],
      summary: 'Recebe uma leitura de um dispositivo',
      description:
        'Autentica pelo cabeçalho `x-dispositivo-token` (o token do equipamento cadastrado, que precisa casar com o `codigo` do corpo). ' +
        'Corpo: `{ codigo, em?, metricas: { fluxo: 412, ... }, lat?, lng? }`; as métricas válidas dependem do tipo e estão em `GET /api/tipos-equipamento` (campo `metricas`). ' +
        'Faixas: percentuais (`online`, `bateria`, `emUso`) de 0 a 100; velocidades de 0 a 300 km/h; contagens de 0 a 100 000; `lat`/`lng` só de equipamento móvel e dentro de Marília; `em` com no máximo 6 h de atraso. Fora disso, 400. ' +
        'Responde 202 `{ aceita: true }`. Mais de 30 tentativas com token inválido por minuto, do mesmo IP, dão 429. A leitura atualiza o último sinal, a posição atual e a telemetria da hora, e pode gerar alertas.',
      headers: { type: 'object', properties: { 'x-dispositivo-token': { type: 'string', description: 'Token do dispositivo' } } },
      body: { type: 'object', additionalProperties: true },
      response: { 202: { type: 'object', properties: { aceita: { type: 'boolean' } } } },
    },
    // O corpo é validado pelo zod, depois da autenticação: quem não tem token não descobre o formato.
    validatorCompiler: () => (dados) => ({ value: dados }),
  }, async (req, reply) => {
    const agoraMs = Date.now(); // tempo real, como o limite de requisições: a simulação não acelera um ataque
    if (recentes(req.ip, agoraMs).length >= RECUSADAS_POR_MINUTO) {
      throw new ErroApi(429, 'Muitas tentativas com token inválido a partir deste endereço: tente de novo em instantes');
    }
    const registrarRecusa = () => {
      if (recusadas.size > 10_000) recusadas.clear(); // teto de memória: um ataque com milhares de IPs não enche o processo
      recusadas.set(req.ip, [...recentes(req.ip, agoraMs), agoraMs]);
      return naoAutorizado();
    };
    const token = req.headers['x-dispositivo-token'];
    const bruto = req.body as { codigo?: unknown } | null | undefined;
    if (typeof token !== 'string' || token === '' || typeof bruto?.codigo !== 'string') throw registrarRecusa();
    const linha = ctx.db.prepare('SELECT token_dispositivo AS t FROM equipamentos WHERE codigo = ?').get(bruto.codigo) as { t: string } | undefined;
    // O banco guarda só o hash do token (sha256:<hex>); a comparação é em tempo constante.
    if (!linha || !tokenDispositivoConfere(token, linha.t)) throw registrarRecusa();

    const leitura = corpoSchema.parse(req.body);
    const alvo = alvoPorCodigo(ctx.db, leitura.codigo);
    if (alvo) conferirLeitura(alvo.tipo, leitura, ctx.relogio.agora()); // faixas por métrica, posição e hora
    ingerirTelemetria(ctx, leitura);
    return reply.code(202).send({ aceita: true });
  });
}
