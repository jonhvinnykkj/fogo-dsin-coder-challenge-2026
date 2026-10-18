// Números grandes do vídeo, lidos dos JSONs que o roteiro de gravação salvou da API do sistema
// (public/gravacoes/dados/*.json, ao lado das gravações). Nada aqui é digitado à mão.
import { staticFile } from 'remotion';

export type Numeros = {
  /** /api/equipamentos → total */
  equipamentos: number;
  /** /api/tipos-equipamento → quantidade de tipos */
  tipos: number;
  /** /api/agentes → total */
  agentes: number;
  /** /api/central/indicadores (logo depois do acidente injetado) */
  disponibilidadePct: number;
  agentesEmAtividade: number;
  alertasAbertos: number;
  /** /api/previsoes/backtest → ganhoPct (quanto o modelo erra menos que a média simples) e dias testados */
  ganhoPct: number;
  diasTeste: number;
  /** /api/bairros → quantidade */
  bairros: number;
  /** /api/previsoes/risco?horas=168 → horas / 24 */
  dias: number;
};

async function ler<T>(nome: string): Promise<T> {
  const resposta = await fetch(staticFile(`gravacoes/dados/${nome}.json`));
  if (!resposta.ok) throw new Error(`Falta gravacoes/dados/${nome}.json: rode scripts/gravar.mjs antes de renderizar`);
  return ((await resposta.json()) as { dados: T }).dados;
}

const lista = (d: unknown): unknown[] => (Array.isArray(d) ? d : ((d as { itens?: unknown[] }).itens ?? []));

export async function carregarNumeros(): Promise<Numeros> {
  const [equipamentos, tipos, agentes, central, backtest, bairros, semana] = await Promise.all([
    ler<{ total: number }>('equipamentos'),
    ler<unknown>('tipos-equipamento'),
    ler<{ total: number }>('agentes'),
    ler<{ disponibilidadePct: number; agentesEmAtividade: number; alertasAbertos: number }>('central-indicadores'),
    ler<{ ganhoPct: number; dias: number }>('previsoes-backtest'),
    ler<unknown>('bairros'),
    ler<{ horas: number }>('previsoes-semana'),
  ]);
  return {
    equipamentos: equipamentos.total,
    tipos: lista(tipos).length,
    agentes: agentes.total,
    disponibilidadePct: central.disponibilidadePct,
    agentesEmAtividade: central.agentesEmAtividade,
    alertasAbertos: central.alertasAbertos,
    ganhoPct: backtest.ganhoPct,
    diasTeste: backtest.dias,
    bairros: lista(bairros).length,
    dias: semana.horas / 24,
  };
}

/** Número no formato brasileiro (1.234,5). */
export const br = (valor: number, casas = 0) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }).format(valor);

/** Valores só para o Studio abrir antes da primeira gravação (o render sempre recalcula a partir dos JSONs). */
export const NUMEROS_VAZIOS: Numeros = {
  equipamentos: 0,
  tipos: 0,
  agentes: 0,
  disponibilidadePct: 0,
  agentesEmAtividade: 0,
  alertasAbertos: 0,
  ganhoPct: 0,
  diasTeste: 0,
  bairros: 0,
  dias: 0,
};
