import type { FastifyInstance } from 'fastify';
import { filtrosCentralSchema, filtroOcorrenciasSchema } from '../../shared/schemas';
import { calcularIndicadores, calcularStatusRegioes, listarOcorrenciasRecentes, listarParaMapa } from '../servicos/central';

const tags = ['Central'];

const FILTROS =
  'Filtros: `tipo` e `situacao` (repetidos ou separados por vírgula), `bairroId`, `regiao`, `orgao`, `manutencao` (ok|proxima|imediata|atrasada). ' +
  'Agentes respondem só a `bairroId`, `regiao` e `orgao`.';

export async function rotasCentral(app: FastifyInstance): Promise<void> {
  const ctx = app.ctx;

  app.get('/api/central/indicadores', { schema: { tags, summary: 'Indicadores ao vivo da central', description: FILTROS } }, async (req) =>
    calcularIndicadores(ctx.db, filtrosCentralSchema.parse(req.query), ctx.relogio.agora()),
  );

  app.get('/api/central/mapa', { schema: { tags, summary: 'Equipamentos e agentes para o mapa (carga compacta)', description: FILTROS } }, async (req) =>
    listarParaMapa(ctx.db, filtrosCentralSchema.parse(req.query), ctx.relogio.agora()),
  );

  app.get('/api/central/regioes', {
    schema: {
      tags,
      summary: 'Índice de atenção por região e bairro, com motivos',
      description: 'Índice do bairro (0 a 100) = 12 × indisponíveis + 25 × alertas críticos abertos + 10 × alertas altos abertos + 4 × ocorrências nas últimas 3 h. Normal abaixo de 30, atenção até 59, crítico a partir de 60. A região leva o maior índice entre os bairros.',
    },
  }, async () => calcularStatusRegioes(ctx.db, ctx.relogio.agora()));

  app.get('/api/central/ocorrencias', {
    schema: { tags, summary: 'Ocorrências recentes (camada de calor)', description: 'Parâmetro `horas` de 1 a 168 (padrão 24). Todas as origens.' },
  }, async (req) => listarOcorrenciasRecentes(ctx.db, filtroOcorrenciasSchema.parse(req.query).horas, ctx.relogio.agora()));
}
