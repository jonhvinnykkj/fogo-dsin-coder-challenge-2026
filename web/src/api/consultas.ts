// Consultas e mutações (TanStack Query) de todas as telas. As chaves ficam em `chaves.ts`; o tempo real (SSE)
// mantém mapa, indicadores, alertas e relógio vivos no cache, por isso essas consultas não precisam ficar repetindo.
import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { SituacaoAgente, TipoEventoSimulado } from '../../../shared/dominio';
import type {
  Agente, AgenteDetalhe, Alerta, Bairro, Equipamento, EquipamentoDetalhe, EstadoSimulacao, Indicadores, Ocorrencia,
  Pagina, PainelManutencao, PontoTelemetria, PrevisaoRisco, RespostaFalhas, RespostaReforco, ResultadoBacktest,
  ResumoPreditivo, StatusRegiao, Tendencias,
} from '../../../shared/modelos';
import type { AgenteInput, EquipamentoEdicao, EquipamentoInput, FiltrosCentral, ManutencaoInput, MudancaSituacao } from '../../../shared/schemas';
import type { TipoEquipamento } from '../../../shared/tipos-equipamento';
import { aplicarAlerta, aplicarSimulacao, type MapaCentral } from '../tempo-real/aplicarNoCache';
import { api, ErroApi, type Parametros } from './cliente';
import {
  chaves, type FiltrosAlertas, type FiltrosListaAgentes, type FiltrosListaEquipamentos, type NomePrevisao,
} from './chaves';

export { chaves, limparFiltros } from './chaves';
export type { FiltrosAlertas, FiltrosListaAgentes, FiltrosListaEquipamentos, NomePrevisao } from './chaves';
export type { MapaCentral } from '../tempo-real/aplicarNoCache';

const UM_MINUTO = 60_000;

/** Erro do usuário (4xx) não melhora tentando de novo; falha de rede ou 5xx tenta mais uma vez. */
export function deveTentarDeNovo(tentativas: number, erro: unknown): boolean {
  if (erro instanceof ErroApi && erro.status >= 400 && erro.status < 500) return false;
  return tentativas < 1;
}

const p = (filtros: object) => filtros as Parametros;

// ---------------------------------------------------------------- catálogo

export function useTiposEquipamento() {
  return useQuery({ queryKey: chaves.tipos(), queryFn: () => api.get<TipoEquipamento[]>('/api/tipos-equipamento'), staleTime: Infinity });
}

export function useBairros() {
  return useQuery({ queryKey: chaves.bairros(), queryFn: () => api.get<Bairro[]>('/api/bairros'), staleTime: Infinity });
}

// ---------------------------------------------------------------- equipamentos

export function useEquipamentos(filtros: FiltrosListaEquipamentos = {}) {
  return useQuery({
    queryKey: chaves.equipamentos(filtros),
    queryFn: () => api.get<Pagina<Equipamento>>('/api/equipamentos', p(filtros)),
    placeholderData: keepPreviousData, // trocar de página não pisca a tabela
  });
}

export function useEquipamento(id: number | undefined) {
  return useQuery({
    queryKey: chaves.equipamento(id ?? 0),
    queryFn: () => api.get<EquipamentoDetalhe>(`/api/equipamentos/${id}`),
    enabled: id !== undefined,
  });
}

export function useTelemetria(id: number | undefined, horas = 48) {
  return useQuery({
    queryKey: chaves.telemetria(id ?? 0, horas),
    queryFn: () => api.get<PontoTelemetria[]>(`/api/equipamentos/${id}/telemetria`, { horas }),
    enabled: id !== undefined,
    staleTime: UM_MINUTO,
  });
}

// ---------------------------------------------------------------- agentes

export function useAgentes(filtros: FiltrosListaAgentes = {}) {
  return useQuery({
    queryKey: chaves.agentes(filtros),
    queryFn: () => api.get<Pagina<Agente>>('/api/agentes', p(filtros)),
    placeholderData: keepPreviousData,
  });
}

export function useAgente(id: number | undefined) {
  return useQuery({
    queryKey: chaves.agente(id ?? 0),
    queryFn: () => api.get<AgenteDetalhe>(`/api/agentes/${id}`),
    enabled: id !== undefined,
  });
}

// ---------------------------------------------------------------- central e alertas

export function useAlertas(filtros: FiltrosAlertas = {}) {
  return useQuery({ queryKey: chaves.alertas(filtros), queryFn: () => api.get<Alerta[]>('/api/alertas', p(filtros)) });
}

export function useMapa(filtros: FiltrosCentral = {}) {
  return useQuery({
    queryKey: chaves.mapa(filtros),
    queryFn: () => api.get<MapaCentral>('/api/central/mapa', p(filtros)),
    placeholderData: keepPreviousData,
  });
}

/**
 * Sem filtros, o SSE mantém os números vivos (evento `indicadores` a cada 5 s). Com filtros o servidor não manda nada
 * pronto: a Central pede `atualizarACada` (ms) para os números filtrados também andarem.
 */
export function useIndicadores(filtros: FiltrosCentral = {}, opcoes: { atualizarACada?: number } = {}) {
  return useQuery({
    queryKey: chaves.indicadores(filtros),
    queryFn: () => api.get<Indicadores>('/api/central/indicadores', p(filtros)),
    placeholderData: keepPreviousData,
    ...(opcoes.atualizarACada ? { refetchInterval: opcoes.atualizarACada } : {}),
  });
}

/** Regiões não têm evento próprio no SSE: atualiza a cada 30 s (e na reconexão). */
export function useRegioes() {
  return useQuery({ queryKey: chaves.regioes(), queryFn: () => api.get<StatusRegiao[]>('/api/central/regioes'), refetchInterval: 30_000 });
}

export function useOcorrencias(horas = 24) {
  return useQuery({ queryKey: chaves.ocorrencias(horas), queryFn: () => api.get<Ocorrencia[]>('/api/central/ocorrencias', { horas }) });
}

/** Falhas e reparos da simulação mexem nas colunas sem evento próprio no SSE: relê a cada 30 s (e após registrar). */
export function usePainelManutencao() {
  return useQuery({ queryKey: chaves.painelManutencao(), queryFn: () => api.get<PainelManutencao>('/api/manutencao/painel'), refetchInterval: 30_000 });
}

export function useSimulacao() {
  return useQuery({ queryKey: chaves.simulacao(), queryFn: () => api.get<EstadoSimulacao>('/api/simulacao'), staleTime: Infinity });
}

// ---------------------------------------------------------------- previsões

export interface RespostasPrevisao {
  risco: PrevisaoRisco;
  backtest: ResultadoBacktest;
  reforco: RespostaReforco;
  falhas: RespostaFalhas;
  tendencias: Tendencias;
  resumo: ResumoPreditivo;
}

/**
 * O servidor guarda as previsões por 60 s; aqui também. `risco` aceita `{ horas: 24 | 168 }` (168 vem em blocos de 3 h).
 * `ativa: false` adia a busca (a tela de Previsões só pede os 7 dias, ~450 KB, quando a grade chega perto da tela).
 */
export function usePrevisao<N extends NomePrevisao>(nome: N, params?: Parametros, opcoes: { ativa?: boolean } = {}) {
  return useQuery({
    queryKey: chaves.previsao(nome, params),
    queryFn: () => api.get<RespostasPrevisao[N]>(`/api/previsoes/${nome}`, params),
    staleTime: UM_MINUTO,
    enabled: opcoes.ativa ?? true,
  });
}

// ---------------------------------------------------------------- mutações

/** Depois de mexer no cadastro, tudo que mostra equipamento/agente pode ter mudado. */
function invalidarCadastro(qc: QueryClient, raiz: 'equipamentos' | 'agentes') {
  const lista = raiz === 'equipamentos' ? [chaves.equipamentos(), chaves.manutencao()] : [chaves.agentes()];
  for (const queryKey of [...lista, chaves.mapa(), chaves.indicadores(), chaves.regioes()]) void qc.invalidateQueries({ queryKey });
}

export function useCriarEquipamento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dados: EquipamentoInput) => api.post<EquipamentoDetalhe>('/api/equipamentos', dados),
    onSuccess: (eq) => {
      qc.setQueryData(chaves.equipamento(eq.id), eq);
      invalidarCadastro(qc, 'equipamentos');
    },
  });
}

export function useAtualizarEquipamento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dados }: { id: number; dados: EquipamentoEdicao }) => api.put<EquipamentoDetalhe>(`/api/equipamentos/${id}`, dados),
    onSuccess: (eq) => {
      qc.setQueryData(chaves.equipamento(eq.id), eq);
      invalidarCadastro(qc, 'equipamentos');
    },
  });
}

export function useMudarSituacaoEquipamento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...mudanca }: MudancaSituacao & { id: number }) => api.patch<EquipamentoDetalhe>(`/api/equipamentos/${id}/situacao`, mudanca),
    onSuccess: () => invalidarCadastro(qc, 'equipamentos'),
  });
}

export function useRegistrarManutencao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dados }: { id: number; dados: ManutencaoInput }) => api.post<unknown>(`/api/equipamentos/${id}/manutencoes`, dados),
    onSuccess: () => invalidarCadastro(qc, 'equipamentos'),
  });
}

export function useExcluirEquipamento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del(`/api/equipamentos/${id}`),
    onSuccess: (_r, id) => {
      qc.removeQueries({ queryKey: chaves.equipamento(id) });
      invalidarCadastro(qc, 'equipamentos');
    },
  });
}

export function useCriarAgente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dados: AgenteInput) => api.post<AgenteDetalhe>('/api/agentes', dados),
    onSuccess: (ag) => {
      qc.setQueryData(chaves.agente(ag.id), ag);
      invalidarCadastro(qc, 'agentes');
    },
  });
}

export function useAtualizarAgente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dados }: { id: number; dados: AgenteInput }) => api.put<AgenteDetalhe>(`/api/agentes/${id}`, dados),
    onSuccess: (ag) => {
      qc.setQueryData(chaves.agente(ag.id), ag);
      invalidarCadastro(qc, 'agentes');
    },
  });
}

export function useMudarSituacaoAgente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, situacao }: { id: number; situacao: SituacaoAgente }) => api.patch<unknown>(`/api/agentes/${id}/situacao`, { situacao }),
    onSuccess: () => invalidarCadastro(qc, 'agentes'),
  });
}

export function useExcluirAgente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del(`/api/agentes/${id}`),
    onSuccess: (_r, id) => {
      qc.removeQueries({ queryKey: chaves.agente(id) });
      invalidarCadastro(qc, 'agentes');
    },
  });
}

export function useReconhecerAlerta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.patch<Alerta>(`/api/alertas/${id}/reconhecer`),
    onSuccess: (alerta) => aplicarAlerta(qc, alerta),
  });
}

export function useResolverAlerta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.patch<Alerta>(`/api/alertas/${id}/resolver`),
    onSuccess: (alerta) => {
      aplicarAlerta(qc, alerta);
      void qc.invalidateQueries({ queryKey: chaves.indicadores() });
    },
  });
}

export function useDefinirSimulacao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mudanca: Partial<Pick<EstadoSimulacao, 'velocidade' | 'pausado'>>) => api.patch<EstadoSimulacao>('/api/simulacao', mudanca),
    onSuccess: (estado) => aplicarSimulacao(qc, estado),
  });
}

export type { TipoEventoSimulado } from '../../../shared/dominio';

/** Evento da demonstração (lista em `TIPOS_EVENTO_SIMULADO`). Os alertas voltam na resposta e entram no feed na hora. */
export function useInjetarEvento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (evento: { tipo: TipoEventoSimulado; alvoId?: number }) => api.post<{ alertas: Alerta[] }>('/api/simulacao/eventos', evento),
    onSuccess: ({ alertas }, evento) => {
      for (const a of alertas) aplicarAlerta(qc, a);
      // O evento muda o índice do bairro (alerta + ocorrência), os números da faixa (o SSE só os manda a cada 5 s) e,
      // numa falha ou furto, a situação do alvo.
      void qc.invalidateQueries({ queryKey: chaves.regioes() });
      void qc.invalidateQueries({ queryKey: chaves.indicadores() });
      void qc.invalidateQueries({ queryKey: chaves.ocorrencias() });
      if (evento.alvoId !== undefined) void qc.invalidateQueries({ queryKey: chaves.equipamento(evento.alvoId) });
    },
  });
}
