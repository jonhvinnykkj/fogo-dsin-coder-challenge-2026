import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { ZodError } from 'zod';
import '../shared/erros-zod';
import type { ContextoApp } from './contexto';
import { ErroApi } from './erros';
import { rotasAgentes } from './rotas/agentes';
import { rotasAlertas } from './rotas/alertas';
import { rotasBairros } from './rotas/bairros';
import { rotasCampo } from './rotas/campo';
import { rotasCentral } from './rotas/central';
import { rotasEquipamentos } from './rotas/equipamentos';
import { rotasManutencao } from './rotas/manutencao';
import { rotasPrevisoes } from './rotas/previsoes';
import { rotasSaude } from './rotas/saude';
import { rotasSimulacao } from './rotas/simulacao';
import { rotasStream } from './rotas/stream';
import { rotasTelemetria } from './rotas/telemetria';
import { rotasTipos } from './rotas/tipos';

const PASTA_WEB = fileURLToPath(new URL('../dist/web', import.meta.url));

/** Primeira mensagem de cada campo; o caminho vira "caracteristicas.velocidadeMaxima". */
function camposDoZod(erro: ZodError): Record<string, string> {
  const campos: Record<string, string> = {};
  for (const i of erro.issues) {
    const chave = i.path.length ? i.path.join('.') : 'corpo';
    campos[chave] ??= i.message;
  }
  return campos;
}

export async function criarApp(ctx: ContextoApp): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('ctx', ctx);

  app.setErrorHandler((erro: FastifyError | ErroApi | ZodError, _req, reply) => {
    if (erro instanceof ZodError) return reply.code(400).send({ erro: 'Dados inválidos', campos: camposDoZod(erro) });
    if (erro instanceof ErroApi) return reply.code(erro.status).send({ erro: erro.message, ...(erro.campos && { campos: erro.campos }) });
    const codigo = 'code' in erro ? erro.code : undefined;
    if (typeof codigo === 'string' && codigo.startsWith('SQLITE_CONSTRAINT')) {
      return reply.code(409).send({ erro: 'Operação recusada: conflita com dados já cadastrados' });
    }
    const status = 'statusCode' in erro && typeof erro.statusCode === 'number' ? erro.statusCode : 500;
    if (status >= 400 && status < 500) return reply.code(status).send({ erro: 'Requisição inválida: confira o corpo e os parâmetros enviados' });
    console.error(erro);
    return reply.code(500).send({ erro: 'Erro interno do servidor' });
  });

  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'F.O.G.O. - API',
        description: 'Inventário de equipamentos e agentes de Marília-SP, alertas e manutenção. Datas em ISO 8601 UTC; mensagens de erro em português.',
        version: '0.1.0',
      },
      tags: [
        { name: 'Catálogo', description: 'Tipos de equipamento e bairros' },
        { name: 'Equipamentos', description: 'Cadastro, situação e telemetria' },
        { name: 'Agentes', description: 'Cadastro de agentes' },
        { name: 'Alertas', description: 'Feed de alertas' },
        { name: 'Manutenção', description: 'Ordens e painel de manutenção' },
        { name: 'Central', description: 'Indicadores, mapa e situação das regiões da central de operações' },
        { name: 'Tempo real', description: 'Ingestão de telemetria, simulação e fluxo de eventos (SSE)' },
        { name: 'Previsões', description: 'Cidade preditiva: risco por bairro e hora, teste retroativo, reforço de agentes, falhas, tendências e resumo do dia' },
        { name: 'Modo Campo', description: 'Celular do agente na rua: despacho, chegada e conclusão, equipamentos próximos e relato de problemas' },
      ],
    },
  });
  await app.register(fastifySwaggerUi, { routePrefix: '/api/docs' });

  await app.register(rotasSaude);
  await app.register(rotasTipos);
  await app.register(rotasBairros);
  await app.register(rotasEquipamentos);
  await app.register(rotasAgentes);
  await app.register(rotasAlertas);
  await app.register(rotasManutencao);
  await app.register(rotasCentral);
  await app.register(rotasTelemetria);
  await app.register(rotasSimulacao);
  await app.register(rotasStream);
  await app.register(rotasPrevisoes);
  await app.register(rotasCampo);

  // Interface compilada (npm run build): arquivos estáticos + fallback de SPA fora de /api. Caminho com extensão
  // (/assets/index-abc.js, .css, .ico…) é arquivo: se não existe, 404 — uma aba aberta antes de um novo build não recebe o
  // index.html no lugar do script.
  const temInterface = existsSync(PASTA_WEB);
  if (temInterface) await app.register(fastifyStatic, { root: PASTA_WEB });
  app.setNotFoundHandler((req, reply) => {
    const caminho = req.url.split('?')[0]!;
    const ehArquivo = /\.[a-z0-9]+$/i.test(caminho.slice(caminho.lastIndexOf('/') + 1));
    if (temInterface && req.method === 'GET' && !caminho.startsWith('/api') && !ehArquivo) return reply.sendFile('index.html');
    return reply.code(404).send({ erro: ehArquivo ? 'Arquivo não encontrado' : 'Rota não encontrada' });
  });

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    ctx: ContextoApp;
  }
}
