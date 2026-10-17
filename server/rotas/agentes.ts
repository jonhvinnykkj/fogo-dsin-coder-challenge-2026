import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { SITUACOES_AGENTE } from '../../shared/dominio';
import { agenteInputSchema, filtrosAgenteSchema } from '../../shared/schemas';
import * as servico from '../servicos/agentes';
import { lerId } from './id';

const tags = ['Agentes'];
const situacaoSchema = z.object({
  situacao: z.enum(SITUACOES_AGENTE, { errorMap: () => ({ message: 'Situação: valor inválido' }) }),
});

export async function rotasAgentes(app: FastifyInstance): Promise<void> {
  const ctx = app.ctx;
  const id = (req: { params: unknown }) => lerId((req.params as { id?: string }).id, 'Agente');

  app.get('/api/agentes', {
    schema: { tags, summary: 'Lista agentes com busca, filtros e paginação', description: 'Filtros: busca, categoria, situacao, turno, bairroId, regiao, orgao, pagina, porPagina.' },
  }, async (req) => servico.listar(ctx, filtrosAgenteSchema.parse(req.query)));

  app.get('/api/agentes/:id', {
    schema: { tags, summary: 'Ficha do agente com as últimas 20 ocorrências atendidas' },
  }, async (req) => servico.detalheDoAgente(ctx, id(req)));

  app.post('/api/agentes', { schema: { tags, summary: 'Cadastra agente' } },
    async (req, reply) => reply.code(201).send(servico.criarAgente(ctx, agenteInputSchema.parse(req.body))));

  app.put('/api/agentes/:id', {
    schema: { tags, summary: 'Edita os dados cadastrais (não altera a posição atual nem o último sinal)' },
  }, async (req) => servico.atualizarAgente(ctx, id(req), agenteInputSchema.parse(req.body)));

  app.patch('/api/agentes/:id/situacao', {
    schema: { tags, summary: 'Muda a situação do agente', description: 'Corpo: { situacao: em_servico|em_ocorrencia|pausa|fora_de_servico }.' },
  }, async (req) => servico.mudarSituacaoAgente(ctx, id(req), situacaoSchema.parse(req.body).situacao));

  app.delete('/api/agentes/:id', {
    schema: { tags, summary: 'Exclui agente sem histórico (com ocorrências ou alertas: 409)' },
  }, async (req, reply) => {
    servico.excluirAgente(ctx, id(req));
    return reply.code(204).send();
  });
}
