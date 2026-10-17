// Risco por bairro e hora (próximas 24 h, de hora em hora) ou por bloco de 3 horas (próximos 7 dias).
//
// MODELO (uma conta por bairro e hora; tudo aprendido das 8 semanas antes do corte, ver base.ts)
//   taxa esperada (ocorrências/hora) = base do bairro × perfil da região do bairro (dia da semana, hora)
//                                      × fator chuva do dia × tendência da cidade
//     Ex. (semente padrão, quinta 15/10 12 h): bairro Centro, quinta às 18 h = 1,243/h × perfil da região Centro 2,20
//     × 1 (sem chuva) × 0,98 = 2,69 ocorrências nessa hora; terça às 3 h = 1,243 × 0,36 × 1 × 0,98 = 0,44.
//   índice (0–100) = 100 × taxa ÷ percentil 99 das taxas da janela, limitado a 100.
//     Ex. (7 dias, blocos de 3 h): Centro na sexta das 21h às 24h soma 6,34; percentil 99 dos blocos = 3,97 → 160 → 100
//     (crítico); terça das 3h às 6h soma 0,95 → 24 (baixo).
//     Níveis: < 25 baixo, < 50 moderado, < 75 alto, ≥ 75 crítico.
//   7 dias: blocos de 3 horas no relógio de São Paulo (0h, 3h, 6h…); a taxa do bloco é a soma das 3 horas e o índice é
//     calculado entre os blocos. Só os blocos com índice ≥ 25 trazem fatores (deixa a resposta leve: 65 × 56 blocos).
//   fatores = os multiplicadores que mais pesaram (até 3, os que mudam a taxa em 10% ou mais), com nome para o gestor:
//     "Região Centro na sexta à noite" (perfil), "Bairro com histórico alto" (base ÷ média dos bairros), "Previsão de chuva",
//     "Cidade em alta/queda nas últimas 2 semanas" (tendência).
import type { Database } from 'better-sqlite3';
import { formatarNumero } from '../../shared/formato';
import type { CelulaRisco, ExplicacaoPrevisao, NivelRisco, PrevisaoRisco, ResultadoBacktest } from '../../shared/modelos';
import { partesLocais } from '../tempo';
import {
  arred, calcularEstatisticas, carregarHistorico, diaMes, HORA_MS, inicioDaHoraMs, iso, percentil, rotuloRegiaoHorario, SEMANAS_BASE, signif,
  type EstatisticasRisco, type HistoricoOcorrencias,
} from './base';
import { executarBacktest } from './backtest';

export const nivelDoRisco = (indice: number): NivelRisco => (indice < 25 ? 'baixo' : indice < 50 ? 'moderado' : indice < 75 ? 'alto' : 'critico');

/** Um fator só aparece se mudar a taxa em pelo menos 10% (para cima ou para baixo). */
const FATOR_MINIMO = Math.log(1.1);
const MAX_FATORES = 3;
/** Nos blocos de 3 horas, só os de índice a partir de 25 (moderado ou pior) levam fatores. */
const INDICE_MINIMO_FATORES = 25;

export interface HoraPrevista {
  ms: number;
  data: string;
  diaSemana: number;
  hora: number;
  /** Multiplicador da chuva do dia (1 se não há chuva prevista). */
  chuva: number;
  chovendo: boolean;
}

/** Taxas de uma janela: `taxas[i * horas + t]` = bairro `hist.bairros[i]`, hora `t`; `perfis` no mesmo índice. */
export interface TaxasPrevistas {
  inicioMs: number;
  horas: number;
  taxas: Float64Array;
  perfis: Float64Array;
  horasInfo: HoraPrevista[];
}

export function calcularTaxas(hist: HistoricoOcorrencias, est: EstatisticasRisco, inicioMs: number, horas: number): TaxasPrevistas {
  const horasInfo: HoraPrevista[] = [];
  for (let t = 0; t < horas; t++) {
    const ms = inicioMs + t * HORA_MS;
    const p = partesLocais(new Date(ms));
    // A previsão do tempo guardada para o dia (nunca a chuva observada: ver base.ts, "Chuva").
    const chovendo = (hist.chuvaPrevistaMm.get(p.data) ?? 0) > 0;
    horasInfo.push({ ms, data: p.data, diaSemana: p.diaSemana, hora: p.hora, chuva: chovendo ? est.chuva.fator : 1, chovendo });
  }
  const nB = hist.bairros.length;
  const taxas = new Float64Array(nB * horas);
  const perfis = new Float64Array(nB * horas);
  for (let i = 0; i < nB; i++) {
    const bairro = est.base[i]! * est.tendencia;
    const perfil = est.perfilRegiao.get(hist.bairros[i]!.regiao)!;
    for (let t = 0; t < horas; t++) {
      const h = horasInfo[t]!;
      const pr = perfil[h.diaSemana]![h.hora]!;
      perfis[i * horas + t] = pr;
      taxas[i * horas + t] = bairro * pr * h.chuva;
    }
  }
  return { inicioMs, horas, taxas, perfis, horasInfo };
}

/** Fatores de uma célula (hora ou bloco): `perfil` é o perfil da região naquela hora (média das horas, no bloco). */
function fatoresDaCelula(hist: HistoricoOcorrencias, est: EstatisticasRisco, i: number, h: HoraPrevista, perfil: number): { nome: string; peso: number }[] {
  const doBairro = est.mediaBairro > 0 ? est.base[i]! / est.mediaBairro : 1;
  const { tendencia } = est;
  const candidatos = [
    { nome: rotuloRegiaoHorario(hist.bairros[i]!.regiao, h.diaSemana, h.hora), peso: perfil },
    { nome: doBairro >= 1 ? 'Bairro com histórico alto' : 'Bairro com histórico baixo', peso: doBairro },
    ...(h.chovendo ? [{ nome: 'Previsão de chuva', peso: h.chuva }] : []),
    { nome: tendencia >= 1 ? 'Cidade em alta nas últimas 2 semanas' : 'Cidade em queda nas últimas 2 semanas', peso: tendencia },
  ]
    .filter((f) => f.peso > 0)
    .sort((a, b) => Math.abs(Math.log(b.peso)) - Math.abs(Math.log(a.peso)));
  const fortes = candidatos.filter((f) => Math.abs(Math.log(f.peso)) >= FATOR_MINIMO).slice(0, MAX_FATORES);
  const escolhidos = fortes.length > 0 ? fortes : candidatos.slice(0, 1);
  return escolhidos.length > 0 ? escolhidos.map((f) => ({ nome: f.nome, peso: arred(f.peso) })) : [{ nome: 'Sem histórico de ocorrências', peso: 1 }];
}

export interface OpcoesRisco {
  agora: Date;
  /** 24 (próximo dia, de hora em hora) ou 168 (próxima semana, em blocos de 3 horas). */
  horas: number;
  /** Corte para o teste retroativo: só usa dados anteriores a ele. Padrão: agora. */
  ate?: Date;
}

export interface RiscoCalculado {
  celulas: CelulaRisco[];
  granularidadeHoras: 1 | 3;
  hist: HistoricoOcorrencias;
  est: EstatisticasRisco;
  taxas: TaxasPrevistas;
}

/** Início do bloco de 3 horas (relógio de São Paulo: 0h, 3h, 6h…) que contém o instante. */
export function inicioDoBloco(ms: number): number {
  return inicioDaHoraMs(ms) - (partesLocais(new Date(ms)).hora % 3) * HORA_MS;
}

/** O modelo puro, sem a explicação (não roda o teste retroativo). Usado pelo reforço e pelo resumo. */
export function calcularRisco(db: Database, { agora, horas, ate }: OpcoesRisco): RiscoCalculado {
  const hist = carregarHistorico(db, { ate: ate ?? agora, diasAntes: SEMANAS_BASE * 7 });
  const est = calcularEstatisticas(hist, hist.fimMs);
  const granularidadeHoras: 1 | 3 = horas > 24 ? 3 : 1;
  const inicioMs = granularidadeHoras === 1 ? inicioDaHoraMs(agora.getTime()) : inicioDoBloco(agora.getTime());
  const taxas = calcularTaxas(hist, est, inicioMs, horas);
  const nCelulas = horas / granularidadeHoras;

  // Taxa e perfil de cada célula (bloco = soma das taxas e média dos perfis das horas).
  const valores = new Float64Array(hist.bairros.length * nCelulas);
  hist.bairros.forEach((_, i) => {
    for (let c = 0; c < nCelulas; c++) {
      let soma = 0;
      for (let k = 0; k < granularidadeHoras; k++) soma += taxas.taxas[i * horas + c * granularidadeHoras + k]!;
      valores[i * nCelulas + c] = soma;
    }
  });
  const p99 = percentil(valores, 99);
  const celulas: CelulaRisco[] = [];
  hist.bairros.forEach((b, i) => {
    for (let c = 0; c < nCelulas; c++) {
      const taxa = valores[i * nCelulas + c]!;
      const indice = p99 > 0 ? Math.round(Math.min(100, (100 * taxa) / p99)) : 0;
      const t0 = c * granularidadeHoras;
      const h = taxas.horasInfo[t0]!;
      let perfil = 0;
      for (let k = 0; k < granularidadeHoras; k++) perfil += taxas.perfis[i * horas + t0 + k]!;
      perfil /= granularidadeHoras;
      const comFatores = granularidadeHoras === 1 || indice >= INDICE_MINIMO_FATORES;
      celulas.push({
        bairroId: b.id, inicio: iso(h.ms), taxaEsperada: signif(taxa), indice, nivel: nivelDoRisco(indice),
        fatores: comFatores ? fatoresDaCelula(hist, est, i, h, perfil) : [],
      });
    }
  });
  return { celulas, granularidadeHoras, hist, est, taxas };
}

export function preverRisco(db: Database, opcoes: OpcoesRisco & { backtest?: ResultadoBacktest }): PrevisaoRisco {
  const r = calcularRisco(db, opcoes);
  const backtest = opcoes.backtest ?? executarBacktest(db, { agora: opcoes.ate ?? opcoes.agora, dias: 14 });
  return {
    geradoEm: opcoes.agora.toISOString(), horas: opcoes.horas, granularidadeHoras: r.granularidadeHoras, celulas: r.celulas,
    explicacao: explicarRisco(r, opcoes.horas, backtest),
  };
}

function explicarRisco({ est, taxas }: RiscoCalculado, horas: number, bt: ResultadoBacktest): ExplicacaoPrevisao {
  const diasJanela = [...new Set(taxas.horasInfo.map((h) => h.data))];
  const diasChuva = diasJanela.filter((d) => taxas.horasInfo.some((h) => h.data === d && h.chovendo)).length;
  const maisChuva = Math.round((est.chuva.fator - 1) * 100);
  const chuva = diasChuva > 0
    ? `Previsão do tempo: chuva em ${diasChuva} de ${diasJanela.length} dias da janela. No histórico, dias de chuva tiveram ${maisChuva}% ${maisChuva >= 0 ? 'mais' : 'menos'} ocorrências que os secos`
    : `Previsão do tempo: sem chuva na janela (no histórico, dias de chuva tiveram ${maisChuva}% ${maisChuva >= 0 ? 'mais' : 'menos'} ocorrências que os secos)`;
  const semanas = Math.round(est.horas / 168);
  return {
    oQuePreve: horas <= 24
      ? 'Quantas ocorrências cada bairro deve ter em cada hora das próximas 24 horas, num índice de 0 a 100 (100 = as horas mais arriscadas do período).'
      : 'Quantas ocorrências cada bairro deve ter em blocos de 3 horas nos próximos 7 dias, num índice de 0 a 100 (100 = os blocos mais arriscados da semana).',
    dadosUsados: [
      `${formatarNumero(est.total)} ocorrências registradas de ${diaMes(est.inicioMs)} a ${diaMes(est.fimMs - 1)} (últimas ${semanas} semanas), contadas por bairro e hora`,
      'Horário típico de cada região em cada dia da semana (puxado para o da cidade quando a região tem poucos dados)',
      chuva,
      'Ritmo da cidade nas últimas 2 semanas comparado com as 6 anteriores',
      'Eventos injetados na demonstração e ocorrências da simulação acelerada ficam de fora',
    ],
    comoAjuda: 'Mostra onde e quando reforçar patrulhamento e fiscalização antes de as ocorrências acontecerem: bairro em vermelho nas próximas horas pede mais agentes por perto.',
    confiabilidade: confiabilidadeDoRisco(bt),
  };
}

/** A confiabilidade do risco vem do teste retroativo (backtest.ts), em linguagem simples. */
export function confiabilidadeDoRisco(bt: ResultadoBacktest): ExplicacaoPrevisao['confiabilidade'] {
  return [
    {
      metrica: 'Erro médio por bairro a cada 3 horas',
      valor: bt.maeModelo,
      descricao: `Nos ${bt.dias} dias antes de hoje, a previsão feita na véspera errou em média ${formatarNumero(bt.maeModelo, 2)} ocorrência por bairro em cada bloco de 3 horas: `
        + `${formatarNumero(Math.abs(bt.ganhoPct), 0)}% ${bt.ganhoPct >= 0 ? 'menos' : 'mais'} que repetir a média de cada bairro (${formatarNumero(bt.maeIngenuo, 2)}).`,
    },
    {
      metrica: 'Acerto dos 5 bairros mais arriscados à noite',
      valor: bt.acertoTop5Medio,
      descricao: `Entre 18h e 2h, dos 5 bairros apontados como mais arriscados, em média ${formatarNumero(bt.acertoTop5Medio, 1)} estavam de fato entre os 5 com mais ocorrências `
        + `(escolher pela média simples acertaria ${formatarNumero(bt.acertoTop5IngenuoMedio, 1)}).`,
    },
  ];
}
