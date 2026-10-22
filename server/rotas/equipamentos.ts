import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { equipamentoEdicaoSchema, equipamentoInputSchema, filtrosEquipamentoSchema, manutencaoInputSchema, mudancaSituacaoSchema } from '../../shared/schemas';
import * as servico from '../servicos/equipamentos';
import { lerId } from './id';

const tags = ['Equipamentos'];
// `horas=` vazio vale como não informado (padrão 48), como os outros filtros da API.
export const horasSchema = z.object({ horas: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().int().min(1).max(720).default(48)) });

export async function rotasEquipamentos(app: FastifyInstance): Promise<void> {
  const ctx = app.ctx;
  const id = (req: { params: unknown }) => lerId((req.params as { id?: string }).id, 'Equipamento');

  app.get('/api/equipamentos', {
    schema: {
      tags,
      summary: 'Lista equipamentos com busca, filtros e paginação',
      description: 'Filtros: busca, tipo, situacao, bairroId, regiao, orgao, manutencao (imediata|proxima|atrasada), ordem (codigo|tipo|situacao|bairro), direcao (asc|desc), pagina, porPagina. A busca ignora acentos e maiúsculas e olha código, série, marca, modelo, logradouro, referência e bairro.',
    },
  }, async (req) => servico.listar(ctx, filtrosEquipamentoSchema.parse(req.query)));

  app.get('/api/equipamentos/:id', {
    schema: { tags, summary: 'Ficha do equipamento (endereço com cidade/uf, sempre Marília/SP) com histórico de situação, manutenções e alertas' },
  }, async (req) => servico.detalheDoEquipamento(ctx, id(req)));

  app.post('/api/equipamentos', {
    schema: { tags, summary: 'Cadastra equipamento (gera o código FOGO-<SIGLA>-0000 e o token do dispositivo)', description: 'A resposta traz a ficha e o campo tokenDispositivo, que aparece só nesta resposta (o banco guarda o hash; para outro, POST /api/equipamentos/:id/token). Endereço: cep, logradouro, referencia, bairroId. cidade e uf são opcionais e, se vierem, precisam ser Marília/SP (400 caso contrário); o servidor sempre grava Marília/SP.' },
  }, async (req, reply) => reply.code(201).send(servico.criarEquipamento(ctx, equipamentoInputSchema.parse(req.body))));

  app.put('/api/equipamentos/:id', {
    schema: {
      tags,
      summary: 'Edita os dados cadastrais',
      description: 'Não altera código, token, posição atual, último sinal nem a situação (use PATCH /situacao). O grupo de manutenção (manutencaoNecessidade, manutencaoPeriodicidadeDias, ultimaManutencao, proximaManutencao) é opcional: sem manutencaoNecessidade, as datas gravadas ficam como estão.',
    },
  }, async (req) => servico.atualizarEquipamento(ctx, id(req), equipamentoEdicaoSchema.parse(req.body)));

  app.patch('/api/equipamentos/:id/situacao', {
    schema: {
      tags,
      summary: 'Muda a situação e grava no histórico',
      description: 'Corpo: { situacao, motivo, recuperado? }. Sair de "furtado" para qualquer situação, exceto "desativado" (dado como perdido), exige recuperado: true.',
    },
  }, async (req) => servico.mudarSituacao(ctx, id(req), mudancaSituacaoSchema.parse(req.body)));

  app.delete('/api/equipamentos/:id', {
    schema: { tags, summary: 'Exclui equipamento sem histórico (com alertas, ocorrências, manutenções, mudanças de situação ou agente: 409 dizendo qual; a telemetria sai junto)' },
  }, async (req, reply) => {
    servico.excluirEquipamento(ctx, id(req));
    return reply.code(204).send();
  });

  app.get('/api/equipamentos/:id/telemetria', {
    schema: { tags, summary: 'Telemetria por hora das últimas N horas (padrão 48)' },
  }, async (req) => servico.telemetria(ctx, id(req), horasSchema.parse(req.query).horas));

  app.post('/api/equipamentos/:id/manutencoes', {
    schema: {
      tags: ['Manutenção'],
      summary: 'Registra manutenção prevista ou concluída',
      description: 'Corpo: { tipo: corretiva|preventiva, descricao, previstaPara?, concluidaEm? }. Prevista: se já há uma do mesmo tipo em aberto, 409. Concluída: fecha a prevista do mesmo tipo (se houver), atualiza última/próxima data e devolve o equipamento a "operacional" se estava em manutenção ou com mau funcionamento.',
    },
  }, async (req, reply) => reply.code(201).send(servico.registrarManutencao(ctx, id(req), manutencaoInputSchema.parse(req.body))));
}
