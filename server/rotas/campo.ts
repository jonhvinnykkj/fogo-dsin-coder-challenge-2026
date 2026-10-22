import type { FastifyInstance } from 'fastify';
import { proximosCampoSchema, reporteCampoSchema } from '../../shared/campo';
import { garantirTabelaCampo } from '../repositorios/campo';
import * as servico from '../servicos/campo';
import { lerId } from './id';

const tags = ['Modo Campo'];

export async function rotasCampo(app: FastifyInstance): Promise<void> {
  const ctx = app.ctx;
  garantirTabelaCampo(ctx.db);
  type Params = { params: unknown };
  const agente = (req: Params) => lerId((req.params as { id?: string }).id, 'Agente');
  const ocorrencia = (req: Params) => lerId((req.params as { ocorrenciaId?: string }).ocorrenciaId, 'Despacho');

  app.get('/api/campo/agentes/:id/despacho', {
    schema: { tags, summary: 'Ocorrência aberta para a qual o agente foi despachado', description: 'Responde { despacho: null } quando não há despacho. Traz bairro, rua mais próxima, distância a partir da posição atual do agente e a hora da chegada, se já registrada.' },
  }, async (req) => ({ despacho: servico.despachoDoAgente(ctx, agente(req)) }));

  app.post('/api/campo/agentes/:id/despachos/:ocorrenciaId/chegada', {
    schema: { tags, summary: 'Agente chegou ao local ("cheguei")', description: 'Só para a ocorrência aberta do próprio agente (senão 404). Registrar duas vezes dá 409.' },
  }, async (req) => servico.registrarChegadaAoLocal(ctx, agente(req), ocorrencia(req)));

  app.post('/api/campo/agentes/:id/despachos/:ocorrenciaId/conclusao', {
    schema: { tags, summary: 'Agente concluiu a ocorrência', description: 'Exige a chegada antes (400). Encerra a ocorrência, fecha o alerta dela (resolução manual) e devolve o agente para "em serviço".' },
  }, async (req) => servico.concluirDespacho(ctx, agente(req), ocorrencia(req)));

  app.get('/api/campo/agentes/:id/equipamentos-proximos', {
    schema: { tags, summary: 'Equipamentos na rua mais próximos do agente', description: 'Parâmetro: limite (1 a 20, padrão 5). Desativados e não instalados ficam de fora.' },
  }, async (req) => servico.equipamentosProximos(ctx, agente(req), proximosCampoSchema.parse(req.query).limite));

  app.post('/api/campo/agentes/:id/reportes', {
    schema: { tags, summary: 'Agente relata problema num equipamento', description: 'Corpo: { equipamentoId, problema: mau_funcionamento|furtado|vandalizado, observacao? }. Muda a situação (vandalizado = mau funcionamento) e abre o alerta de falha ou de furto.' },
  }, async (req, reply) => reply.code(201).send(servico.reportarProblema(ctx, agente(req), reporteCampoSchema.parse(req.body))));
}
