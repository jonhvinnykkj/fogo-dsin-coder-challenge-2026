// Quem pode chamar cada rota da API. Lista explícita: rota de /api que não estiver aqui é recusada (403) a todos,
// então esquecer de cadastrar uma rota nova falha fechado, nunca aberto. Um teste confere que toda rota registrada
// tem entrada nesta tabela.
import { PAPEIS, type Papel } from '../../shared/seguranca';

/** `publico`: sem login. As demais entradas listam os papéis aceitos. */
export type Regra = 'publico' | readonly Papel[];

const TODOS = PAPEIS;
const OPERACAO: readonly Papel[] = ['gestor', 'operador'];
const GESTAO: readonly Papel[] = ['gestor'];
/** Operação ou o próprio agente (a rota confere que o :id é o agente vinculado ao usuário). */
const OPERACAO_OU_PROPRIO_AGENTE: readonly Papel[] = ['gestor', 'operador', 'agente'];

export const REGRAS: Record<string, Regra> = {
  // Sem login
  'GET /api/saude': 'publico',
  'GET /api/auth/modo': 'publico',
  'POST /api/auth/entrar': 'publico',
  'POST /api/auth/demo': 'publico',
  'POST /api/auth/sair': 'publico',
  'GET /api/auth/eu': 'publico', // sem sessão devolve { usuario: null }
  'POST /api/telemetria': 'publico', // autenticada pelo token do dispositivo, não por sessão

  // Consulta: qualquer pessoa logada
  'GET /api/tipos-equipamento': TODOS,
  'GET /api/bairros': TODOS,
  'GET /api/equipamentos': TODOS,
  'GET /api/equipamentos/:id': TODOS,
  'GET /api/equipamentos/:id/telemetria': TODOS,
  'GET /api/agentes': TODOS,
  'GET /api/agentes/:id': TODOS,
  'GET /api/alertas': TODOS,
  'GET /api/manutencao/painel': TODOS,
  'GET /api/central/indicadores': TODOS,
  'GET /api/central/mapa': TODOS,
  'GET /api/central/regioes': TODOS,
  'GET /api/central/ocorrencias': TODOS,
  'GET /api/simulacao': TODOS,
  'GET /api/stream': TODOS,
  'GET /api/previsoes/risco': TODOS,
  'GET /api/previsoes/backtest': TODOS,
  'GET /api/previsoes/reforco': TODOS,
  'GET /api/previsoes/falhas': TODOS,
  'GET /api/previsoes/tendencias': TODOS,
  'GET /api/previsoes/resumo': TODOS,

  // Operação da central
  'PATCH /api/alertas/:id/reconhecer': OPERACAO,
  'PATCH /api/alertas/:id/resolver': OPERACAO,
  'PATCH /api/equipamentos/:id/situacao': OPERACAO,
  'POST /api/equipamentos/:id/manutencoes': OPERACAO,
  'PATCH /api/agentes/:id/situacao': OPERACAO_OU_PROPRIO_AGENTE,

  // Modo Campo: o próprio agente, ou a operação (que escolhe um agente na tela)
  'GET /api/campo/agentes/:id/despacho': OPERACAO_OU_PROPRIO_AGENTE,
  'GET /api/campo/agentes/:id/equipamentos-proximos': OPERACAO_OU_PROPRIO_AGENTE,
  'POST /api/campo/agentes/:id/despachos/:ocorrenciaId/chegada': OPERACAO_OU_PROPRIO_AGENTE,
  'POST /api/campo/agentes/:id/despachos/:ocorrenciaId/conclusao': OPERACAO_OU_PROPRIO_AGENTE,
  'POST /api/campo/agentes/:id/reportes': OPERACAO_OU_PROPRIO_AGENTE,

  // Gestão: cadastro, exclusão, simulação, segredos e auditoria
  'POST /api/equipamentos': GESTAO,
  'PUT /api/equipamentos/:id': GESTAO,
  'DELETE /api/equipamentos/:id': GESTAO,
  'POST /api/equipamentos/:id/token': GESTAO,
  'POST /api/agentes': GESTAO,
  'PUT /api/agentes/:id': GESTAO,
  'DELETE /api/agentes/:id': GESTAO,
  'PATCH /api/simulacao': GESTAO,
  'POST /api/simulacao/eventos': GESTAO,
  'GET /api/auditoria': GESTAO,
};

/** Rotas que o papel "agente" só pode chamar sobre si mesmo (`:id` = agente vinculado). */
export const SO_O_PROPRIO_AGENTE = new Set([
  'PATCH /api/agentes/:id/situacao',
  'GET /api/campo/agentes/:id/despacho',
  'GET /api/campo/agentes/:id/equipamentos-proximos',
  'POST /api/campo/agentes/:id/despachos/:ocorrenciaId/chegada',
  'POST /api/campo/agentes/:id/despachos/:ocorrenciaId/conclusao',
  'POST /api/campo/agentes/:id/reportes',
]);

export const chaveDaRota = (metodo: string, rota: string) => `${metodo.toUpperCase()} ${rota}`;

/** Documentação (Swagger) e a interface são abertas; o que elas chamam na API passa pela tabela acima. */
export const foraDaTabela = (rota: string) => !rota.startsWith('/api/') || rota.startsWith('/api/docs');
