// Documentação (Swagger) completa sem tocar na validação: os esquemas de corpo e de filtros saem dos MESMOS zod que as rotas
// usam para validar (zod-to-json-schema), e os códigos de resposta saem da tabela de permissões somados ao que cada rota pode
// recusar. Este módulo só acrescenta `schema` de documentação às rotas quando elas são registradas (gancho `onRoute`); o
// validador e o serializador do Fastify são desligados (`app.ts`), então nada daqui valida nem muda uma resposta.
import type { FastifyInstance } from 'fastify';
import type { ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { proximosCampoSchema, reporteCampoSchema } from '../../shared/campo';
import {
  agenteInputSchema, equipamentoEdicaoSchema, equipamentoInputSchema, filtroOcorrenciasSchema, filtroRiscoSchema, filtrosAgenteSchema,
  filtrosCentralSchema, filtrosEquipamentoSchema, manutencaoInputSchema, mudancaSituacaoSchema,
} from '../../shared/schemas';
import { chaveDaRota, foraDaTabela, REGRAS, SO_O_PROPRIO_AGENTE } from '../seguranca/permissoes';
import { situacaoSchema } from './agentes';
import { filtrosSchema as filtrosAlertas } from './alertas';
import { filtrosSchema as filtrosAuditoria } from './auditoria';
import { demoSchema, entradaSchema } from './auth';
import { horasSchema } from './equipamentos';
import { eventoSchema, mudancaSchema } from './simulacao';
import { corpoSchema as corpoTelemetria } from './telemetria';

interface Doc {
  resumo?: string;
  descricao?: string;
  /** Corpo da requisição (zod da própria validação). */
  corpo?: ZodTypeAny;
  /** Filtros da URL (zod da própria validação). */
  consulta?: ZodTypeAny;
  /** Código de sucesso (padrão 200). */
  ok?: 200 | 201 | 202 | 204;
  /** Além dos que saem da tabela de permissões: o que mais a rota pode responder. */
  tambem?: readonly number[];
  tags?: string[];
}

const MENSAGEM: Record<number, string> = {
  200: 'Sucesso',
  201: 'Criado',
  202: 'Aceito',
  204: 'Sem conteúdo',
  400: 'Dados inválidos: corpo ou parâmetros fora do formato (a resposta traz `campos` com a mensagem de cada um)',
  401: 'Sem sessão: entre no sistema (ou token do dispositivo inválido)',
  403: 'Perfil sem permissão para a ação, ou requisição escrita vinda de outro site',
  404: 'Recurso não encontrado',
  409: 'Conflito com dados já cadastrados',
  413: 'Corpo maior que 256 KB',
  415: 'Tipo de conteúdo não aceito: envie JSON',
  429: 'Muitas requisições: o limite por minuto foi atingido',
  503: 'Simulador indisponível neste servidor',
};

/** Formato de todo erro da API. */
const ERRO = {
  type: 'object',
  properties: { erro: { type: 'string', description: 'Mensagem em português' }, campos: { type: 'object', additionalProperties: { type: 'string' }, description: 'Mensagem por campo (erros 400)' } },
  required: ['erro'],
} as const;

/** O que cada rota tem de próprio. O que não aparece aqui só ganha os códigos que a tabela de permissões já explica. */
const DOCS: Record<string, Doc> = {
  'GET /api/saude': { resumo: 'Saúde do servidor (sem login)', descricao: 'Responde `{ ok: true, nome: "F.O.G.O." }`. Serve para checar se o servidor está no ar.', tags: ['Sistema'] },

  'POST /api/auth/entrar': { corpo: entradaSchema, tambem: [401, 429] },
  'POST /api/auth/demo': { corpo: demoSchema, tambem: [400, 404, 429] },
  'POST /api/auth/sair': { ok: 204, tambem: [403] },
  'GET /api/auth/eu': { tambem: [] },

  'GET /api/equipamentos': { consulta: filtrosEquipamentoSchema },
  'POST /api/equipamentos': {
    // Neutro de propósito: o que a resposta devolve do token está descrito pela rota que o gera (POST /api/equipamentos/{id}/token).
    resumo: 'Cadastra equipamento (gera o código FOGO-<SIGLA>-0000)',
    corpo: equipamentoInputSchema,
    ok: 201,
    tambem: [409],
  },
  'PUT /api/equipamentos/:id': { corpo: equipamentoEdicaoSchema, tambem: [409] },
  'DELETE /api/equipamentos/:id': { ok: 204, tambem: [409] },
  'PATCH /api/equipamentos/:id/situacao': { corpo: mudancaSituacaoSchema },
  'GET /api/equipamentos/:id/telemetria': { consulta: horasSchema },
  'POST /api/equipamentos/:id/manutencoes': { corpo: manutencaoInputSchema, ok: 201, tambem: [409] },

  'GET /api/agentes': { consulta: filtrosAgenteSchema },
  'POST /api/agentes': { corpo: agenteInputSchema, ok: 201, tambem: [409] },
  'PUT /api/agentes/:id': { corpo: agenteInputSchema, tambem: [409] },
  'DELETE /api/agentes/:id': { ok: 204, tambem: [409] },
  'PATCH /api/agentes/:id/situacao': { corpo: situacaoSchema },

  'GET /api/alertas': { consulta: filtrosAlertas },
  'PATCH /api/alertas/:id/reconhecer': {
    // O servidor guarda a hora do reconhecimento (e só a primeira): não guarda quem reconheceu; isso fica na auditoria.
    resumo: 'Reconhece o alerta (grava a hora em que foi visto)',
    descricao: 'Só a primeira chamada grava a hora; repetir não muda nada. Quem reconheceu fica na trilha de auditoria (`GET /api/auditoria`), não no alerta.',
  },

  'GET /api/central/indicadores': { consulta: filtrosCentralSchema },
  'GET /api/central/mapa': { consulta: filtrosCentralSchema },
  'GET /api/central/ocorrencias': { consulta: filtroOcorrenciasSchema },
  'GET /api/previsoes/risco': { consulta: filtroRiscoSchema },

  'PATCH /api/simulacao': { corpo: mudancaSchema, tambem: [503] },
  'GET /api/simulacao': { tambem: [503] },
  'POST /api/simulacao/eventos': { corpo: eventoSchema, tambem: [409, 503] },
  'GET /api/stream': { tambem: [429] },

  'GET /api/auditoria': { consulta: filtrosAuditoria },

  'POST /api/telemetria': { corpo: corpoTelemetria, ok: 202, tambem: [400, 401, 429] },

  'GET /api/campo/agentes/:id/equipamentos-proximos': { consulta: proximosCampoSchema },
  'POST /api/campo/agentes/:id/despachos/:ocorrenciaId/chegada': { tambem: [409] },
  'POST /api/campo/agentes/:id/despachos/:ocorrenciaId/conclusao': { tambem: [400] },
  'POST /api/campo/agentes/:id/reportes': { corpo: reporteCampoSchema, ok: 201 },
};

const paraJsonSchema = (z: ZodTypeAny): Record<string, unknown> => {
  const { $schema: _omitido, ...esquema } = zodToJsonSchema(z, { target: 'openApi3', $refStrategy: 'none' }) as Record<string, unknown>;
  return esquema;
};

const ESCRITAS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Códigos de resposta de uma rota: o de sucesso, mais o que a tabela de permissões, os parâmetros e o corpo permitem concluir. */
export function codigosDaRota(chave: string, doc: Doc = DOCS[chave] ?? {}): number[] {
  const [metodo] = chave.split(' ') as [string];
  const regra = REGRAS[chave];
  const codigos = new Set<number>([doc.ok ?? (metodo === 'DELETE' ? 204 : 200)]);
  const protegida = regra !== undefined && regra !== 'publico';
  if (doc.corpo || doc.consulta) codigos.add(400);
  if (protegida) codigos.add(401);
  // 403: perfil sem permissão (rota que não é de todos), agente só no próprio :id, ou Origin de outro site em toda escrita.
  if ((protegida && Array.isArray(regra) && regra.length < 4) || SO_O_PROPRIO_AGENTE.has(chave) || (ESCRITAS.has(metodo) && chave !== 'POST /api/telemetria')) codigos.add(403);
  if (chave.includes(':')) codigos.add(404);
  if (ESCRITAS.has(metodo) && doc.corpo) {
    codigos.add(413);
    codigos.add(415);
  }
  for (const c of doc.tambem ?? []) codigos.add(c);
  return [...codigos].sort((a, b) => a - b);
}

/** Liga a documentação: chame ANTES de registrar as rotas. */
export function documentarRotas(app: FastifyInstance): void {
  app.addHook('onRoute', (rota) => {
    if (foraDaTabela(rota.url)) return;
    for (const metodo of [rota.method].flat()) {
      if (metodo === 'HEAD') continue;
      const chave = chaveDaRota(metodo, rota.url);
      const doc = DOCS[chave] ?? {};
      const esquema = (rota.schema ?? {}) as Record<string, unknown>;
      const respostas: Record<string, unknown> = { ...((esquema.response as Record<string, unknown> | undefined) ?? {}) };
      for (const codigo of codigosDaRota(chave, doc)) {
        if (respostas[codigo] !== undefined) continue;
        respostas[codigo] = codigo >= 400 ? { description: MENSAGEM[codigo] ?? 'Erro', ...ERRO } : { description: MENSAGEM[codigo] ?? 'Sucesso', ...(codigo === 204 ? { type: 'null' } : {}) };
      }
      rota.schema = {
        ...esquema,
        ...(doc.resumo && { summary: doc.resumo }),
        ...(doc.descricao && { description: doc.descricao }),
        ...(doc.tags && { tags: doc.tags }),
        ...(doc.corpo && { body: paraJsonSchema(doc.corpo) }),
        ...(doc.consulta && { querystring: paraJsonSchema(doc.consulta) }),
        response: respostas,
      };
    }
  });
}
