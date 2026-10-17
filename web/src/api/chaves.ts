// Chaves do TanStack Query: fixas e num lugar só, para o tempo real (SSE) e as mutações acertarem o mesmo cache.
//
// Regra das chaves com filtro: sem filtro = `[raiz]`; com filtro = `[raiz, filtrosLimpos]`. Assim `['mapa']` é ao
// mesmo tempo a variante sem filtros e o prefixo que alcança todas as variantes (invalidar, `setQueriesData`).
import type { Criticidade } from '../../../shared/dominio';
import type { FiltrosAgente, FiltrosCentral, FiltrosEquipamento } from '../../../shared/schemas';

export type FiltrosAlertas = {
  status?: 'abertos' | 'todos';
  criticidade?: Criticidade;
  tipo?: string;
  desde?: string;
  limite?: number;
};

export type FiltrosListaEquipamentos = Partial<FiltrosEquipamento>;
export type FiltrosListaAgentes = Partial<FiltrosAgente>;

export type NomePrevisao = 'risco' | 'backtest' | 'reforco' | 'falhas' | 'tendencias' | 'resumo';

/** Tira vazio, nulo e lista vazia, para `{}` e `{ tipo: [] }` caírem na mesma chave. */
export function limparFiltros<T extends object>(filtros: T): Partial<T> {
  const limpo: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(filtros)) {
    if (valor === undefined || valor === null || valor === '') continue;
    if (Array.isArray(valor) && valor.length === 0) continue;
    limpo[chave] = valor;
  }
  return limpo as Partial<T>;
}

function comFiltros<R extends string, T extends object>(raiz: R, filtros?: T): readonly [R] | readonly [R, Partial<T>] {
  if (!filtros) return [raiz] as const;
  const limpo = limparFiltros(filtros);
  return Object.keys(limpo).length ? ([raiz, limpo] as const) : ([raiz] as const);
}

export const chaves = {
  tipos: () => ['tipos-equipamento'] as const,
  bairros: () => ['bairros'] as const,

  /** Sem argumento: prefixo de tudo de equipamentos (listas, fichas, telemetria). */
  equipamentos: (filtros?: FiltrosListaEquipamentos) =>
    filtros ? (['equipamentos', 'lista', limparFiltros(filtros)] as const) : (['equipamentos'] as const),
  listasEquipamentos: () => ['equipamentos', 'lista'] as const,
  equipamento: (id: number) => ['equipamentos', 'detalhe', id] as const,
  telemetria: (id: number, horas: number) => ['equipamentos', 'telemetria', id, horas] as const,

  agentes: (filtros?: FiltrosListaAgentes) =>
    filtros ? (['agentes', 'lista', limparFiltros(filtros)] as const) : (['agentes'] as const),
  listasAgentes: () => ['agentes', 'lista'] as const,
  agente: (id: number) => ['agentes', 'detalhe', id] as const,

  alertas: (filtros?: FiltrosAlertas) => comFiltros('alertas', filtros),

  mapa: (filtros?: FiltrosCentral) => comFiltros('mapa', filtros),
  indicadores: (filtros?: FiltrosCentral) => comFiltros('indicadores', filtros),
  regioes: () => ['regioes'] as const,
  /** Sem argumento: prefixo de todas as janelas. */
  ocorrencias: (horas?: number) => (horas === undefined ? (['ocorrencias'] as const) : (['ocorrencias', horas] as const)),

  manutencao: () => ['manutencao'] as const,
  painelManutencao: () => ['manutencao', 'painel'] as const,

  simulacao: () => ['simulacao'] as const,

  previsoes: () => ['previsoes'] as const,
  previsao: (nome: NomePrevisao, params?: Record<string, unknown>) =>
    params && Object.keys(limparFiltros(params)).length
      ? (['previsoes', nome, limparFiltros(params)] as const)
      : (['previsoes', nome] as const),
};

/** Filtros de uma variante a partir da chave (`[raiz]` → `{}`). */
export function filtrosDaChave<T extends object>(chave: readonly unknown[]): Partial<T> {
  const f = chave[1];
  return f && typeof f === 'object' ? (f as Partial<T>) : {};
}
