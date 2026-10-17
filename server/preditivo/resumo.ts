// Resumo do dia: índice de risco consolidado por bairro (próximas 24 h) e as 5 recomendações mais importantes.
//
// Índice do bairro = 100 × ocorrências esperadas nas próximas 24 h ÷ percentil 99 dessas somas entre os bairros, limitado
//   a 100 (a mesma régua do mapa de risco, aplicada ao dia inteiro). Ex.: 22 esperadas, percentil 99 = 24 → 92 (crítico).
// Recomendações: cada previsão propõe as suas (risco, reforço, falhas, tendências) com uma prioridade; entra a melhor de
//   cada fonte e as vagas que sobram vão para as de maior prioridade. No máximo 5, das mais urgentes para as menos.
import type { Database } from 'better-sqlite3';
import { formatarNumero } from '../../shared/formato';
import type {
  ExplicacaoPrevisao, PrevisaoRisco, RecomendacaoDoDia, RecomendacaoReforco, RespostaFalhas, ResultadoBacktest, ResumoPreditivo, Tendencias,
} from '../../shared/modelos';
import { NOME_DO_TIPO } from '../../shared/tipos-equipamento';
import { partesLocais } from '../tempo';
import { arred, daRegiao, HORA_MS, horaCurta, mediana, nomeDoDia, percentil, periodoDoDia, regiaoComArtigo } from './base';
import { executarBacktest } from './backtest';
import { respostaFalhas } from './falhas';
import { recomendarReforco } from './reforco';
import { confiabilidadeDoRisco, nivelDoRisco, preverRisco } from './risco';
import { calcularTendencias } from './tendencias';

const MAX_RECOMENDACOES = 5;
const ORDEM_PRIORIDADE = { alta: 0, media: 1, baixa: 2 } as const;
const FONTES: RecomendacaoDoDia['fonte'][] = ['risco', 'reforco', 'falhas', 'tendencias'];

/** Previsões já calculadas (a rota reaproveita o que está no cache); o que faltar é calculado aqui. */
export interface PartesDoResumo {
  backtest?: ResultadoBacktest;
  risco?: PrevisaoRisco;
  reforco?: RecomendacaoReforco[];
  falhas?: RespostaFalhas;
  tendencias?: Tendencias;
}

export function montarResumo(db: Database, { agora }: { agora: Date }, partes: PartesDoResumo = {}): ResumoPreditivo {
  const backtest = partes.backtest ?? executarBacktest(db, { agora, dias: 14 });
  const risco = partes.risco ?? preverRisco(db, { agora, horas: 24, backtest });
  const reforco = partes.reforco ?? recomendarReforco(db, { agora, horas: 24, previsao: risco });
  const falhas = partes.falhas ?? respostaFalhas(db, { agora });
  const tendencias = partes.tendencias ?? calcularTendencias(db, { agora });

  const bairros = db.prepare('SELECT id, nome FROM bairros').all() as { id: number; nome: string }[];
  const nomeDo = new Map(bairros.map((b) => [b.id, b.nome]));
  const somaPorBairro = new Map<number, number>(bairros.map((b) => [b.id, 0]));
  for (const c of risco.celulas) somaPorBairro.set(c.bairroId, (somaPorBairro.get(c.bairroId) ?? 0) + c.taxaEsperada);
  const p99 = percentil([...somaPorBairro.values()], 99);
  const indiceBairros = [...somaPorBairro]
    .map(([bairroId, soma]) => {
      const indice = p99 > 0 ? Math.round(Math.min(100, (100 * soma) / p99)) : 0;
      return { bairroId, nome: nomeDo.get(bairroId) ?? String(bairroId), indice, nivel: nivelDoRisco(indice), esperadas: soma };
    })
    .sort((a, b) => b.indice - a.indice || b.esperadas - a.esperadas || a.nome.localeCompare(b.nome));

  const candidatas = [
    ...recomendacoesDeRisco(risco, indiceBairros),
    ...recomendacoesDeReforco(reforco),
    ...recomendacoesDeFalhas(falhas),
    ...recomendacoesDeTendencias(tendencias),
  ];
  return {
    geradoEm: agora.toISOString(),
    indiceBairros: indiceBairros.map(({ esperadas: _e, ...b }) => b),
    recomendacoes: escolher(candidatas),
    explicacao: explicarResumo(backtest, falhas),
  };
}

/** A melhor de cada fonte, depois as de maior prioridade; no fim, ordena por prioridade (estável). */
function escolher(candidatas: RecomendacaoDoDia[]): RecomendacaoDoDia[] {
  const porPrioridade = [...candidatas].sort((a, b) => ORDEM_PRIORIDADE[a.prioridade] - ORDEM_PRIORIDADE[b.prioridade]);
  const escolhidas: RecomendacaoDoDia[] = [];
  for (const fonte of FONTES) {
    const melhor = porPrioridade.find((c) => c.fonte === fonte);
    if (melhor) escolhidas.push(melhor);
  }
  for (const c of porPrioridade) {
    if (escolhidas.length >= MAX_RECOMENDACOES) break;
    if (!escolhidas.includes(c)) escolhidas.push(c);
  }
  return escolhidas.slice(0, MAX_RECOMENDACOES).sort((a, b) => ORDEM_PRIORIDADE[a.prioridade] - ORDEM_PRIORIDADE[b.prioridade]);
}

function recomendacoesDeRisco(risco: PrevisaoRisco, indice: { bairroId: number; nome: string; indice: number; esperadas: number }[]): RecomendacaoDoDia[] {
  const saida: RecomendacaoDoDia[] = [];
  const topo = indice[0];
  if (topo) {
    const celulas = risco.celulas.filter((c) => c.bairroId === topo.bairroId).sort((a, b) => a.inicio.localeCompare(b.inicio));
    // As 3 horas seguidas mais carregadas do bairro.
    let melhor = 0;
    let soma = -1;
    for (let i = 0; i + 3 <= celulas.length; i++) {
      const s = celulas[i]!.taxaEsperada + celulas[i + 1]!.taxaEsperada + celulas[i + 2]!.taxaEsperada;
      if (s > soma) { soma = s; melhor = i; }
    }
    const pico = celulas[melhor];
    const media = indice.reduce((s, b) => s + b.esperadas, 0) / indice.length;
    const nivel = nivelDoRisco(topo.indice);
    if (pico) {
      const inicioMs = Date.parse(pico.inicio);
      const p = partesLocais(new Date(inicioMs));
      saida.push({
        titulo: `Reforce o patrulhamento no bairro ${topo.nome} (${nomeDoDia(p.diaSemana)} ${periodoDoDia(p.hora)})`,
        detalhe: `O bairro ${topo.nome} deve ter ${formatarNumero(topo.esperadas, 0)} ocorrências nas próximas 24 h, ${formatarNumero(topo.esperadas / media, 1)} vezes a média dos bairros. `
          + `O pico é das ${horaCurta(inicioMs)} às ${horaCurta(inicioMs + 3 * HORA_MS)} (${formatarNumero(soma, 1)} ocorrências esperadas nessas 3 horas).`,
        fonte: 'risco',
        prioridade: nivel === 'critico' ? 'alta' : nivel === 'alto' ? 'media' : 'baixa',
      });
    }
  }
  const comChuva = risco.celulas.find((c) => c.fatores.some((f) => f.nome === 'Previsão de chuva'));
  if (comChuva) {
    const fator = comChuva.fatores.find((f) => f.nome === 'Previsão de chuva')!.peso;
    const p = partesLocais(new Date(comChuva.inicio));
    saida.push({
      titulo: `Chuva prevista para ${nomeDoDia(p.diaSemana)}: mais ocorrências`,
      detalhe: `Nos dias de chuva do histórico houve ${formatarNumero((fator - 1) * 100, 0)}% mais ocorrências que nos secos, puxadas por acidentes e alagamentos. `
        + 'Deixe equipes de trânsito e a Defesa Civil de sobreaviso nos pontos de alagamento.',
      fonte: 'risco',
      prioridade: 'media',
    });
  }
  return saida;
}

function recomendacoesDeReforco(recs: RecomendacaoReforco[]): RecomendacaoDoDia[] {
  return [...recs]
    .sort((a, b) => b.cargaPorAgenteAntes - b.cargaPorAgenteDepois - (a.cargaPorAgenteAntes - a.cargaPorAgenteDepois))
    .slice(0, 2)
    .map((r, i) => ({
      titulo: `Mova ${r.quantidade === 1 ? '1 agente' : `${r.quantidade} agentes`} ${daRegiao(r.regiaoOrigem)} para ${regiaoComArtigo(r.regiaoDestino)} (${horaCurta(Date.parse(r.inicio))} às ${horaCurta(Date.parse(r.fim))})`,
      detalhe: r.motivo,
      fonte: 'reforco' as const,
      prioridade: i === 0 ? ('alta' as const) : ('media' as const),
    }));
}

function recomendacoesDeFalhas(falhas: RespostaFalhas): RecomendacaoDoDia[] {
  return falhas.itens
    .filter((r) => r.probabilidade >= 0.2)
    .slice(0, 2)
    .map((r) => ({
      titulo: `Revise ${r.codigo} antes que pare (${NOME_DO_TIPO[r.tipo][0]}, ${r.bairroNome})`,
      detalhe: `${formatarNumero(r.probabilidade * 100, 0)}% de chance de falhar nos próximos 7 dias. Motivos: ${r.fatores.slice(0, 3).map((f) => f.nome.charAt(0).toLowerCase() + f.nome.slice(1)).join('; ')}.`,
      fonte: 'falhas' as const,
      prioridade: r.probabilidade >= 0.5 ? ('alta' as const) : r.probabilidade >= 0.3 ? ('media' as const) : ('baixa' as const),
    }));
}

function recomendacoesDeTendencias(t: Tendencias): RecomendacaoDoDia[] {
  const saida: RecomendacaoDoDia[] = [];
  const quedas = t.disponibilidadePorTipo
    .map((d) => {
      const media = d.serie.reduce((s, p) => s + p.pct, 0) / d.serie.length;
      return { ...d, media, queda: media - d.projecao7d };
    })
    .sort((a, b) => b.queda - a.queda);
  const pior = quedas[0];
  if (pior && pior.queda >= 2) {
    saida.push({
      titulo: `Disponibilidade de ${NOME_DO_TIPO[pior.tipo][1]} em queda: ${formatarNumero(pior.projecao7d, 0)}% em 7 dias`,
      detalhe: `A média dos últimos 30 dias foi ${formatarNumero(pior.media, 1)}% e a tendência aponta ${formatarNumero(pior.projecao7d, 1)}% daqui a uma semana. Antecipe as preventivas desse tipo.`,
      fonte: 'tendencias',
      prioridade: pior.queda >= 5 ? 'media' : 'baixa',
    });
  }
  const med = mediana(t.falhasPorModelo.map((m) => m.falhasPor100));
  const modelo = t.falhasPorModelo.find((m) => m.frota >= 5);
  if (modelo && med > 0 && modelo.falhasPor100 >= 1.5 * med) {
    saida.push({
      titulo: `${modelo.marca} ${modelo.modelo} falha ${formatarNumero(modelo.falhasPor100 / med, 1)} vezes mais que o modelo mediano`,
      detalhe: `${formatarNumero(modelo.falhasPor100, 0)} falhas por 100 equipamentos em 60 dias (frota de ${modelo.frota}). Priorize a troca na próxima compra e reforce a manutenção desses equipamentos.`,
      fonte: 'tendencias',
      prioridade: 'media',
    });
  }
  const patinete = t.usoPatinetesPorBairro.filter((u) => u.mediaDiaria >= 5).sort((a, b) => a.variacaoPct - b.variacaoPct)[0];
  if (patinete && patinete.variacaoPct <= -20) {
    saida.push({
      titulo: `Uso de patinetes caiu ${formatarNumero(-patinete.variacaoPct, 0)}% em ${patinete.nome}`,
      detalhe: `Média de ${formatarNumero(patinete.mediaDiaria, 1)} horas de uso por dia no bairro, mas a última semana ficou bem abaixo da anterior. Confira furtos e patinetes parados com a operadora.`,
      fonte: 'tendencias',
      prioridade: 'baixa',
    });
  }
  return saida;
}

function explicarResumo(bt: ResultadoBacktest, falhas: RespostaFalhas): ExplicacaoPrevisao {
  const topDecil = falhas.explicacao.confiabilidade.find((c) => c.metrica.startsWith('Falhas entre os 10%'));
  return {
    oQuePreve: 'O risco de cada bairro nas próximas 24 horas (índice de 0 a 100) e as 5 ações mais importantes do dia, tiradas das quatro previsões.',
    dadosUsados: [
      'Mapa de risco das próximas 24 horas (ocorrências históricas, horário, chuva prevista e tendência)',
      'Escala de agentes por turno e região',
      'Chance de falha de cada equipamento nos próximos 7 dias',
      'Tendências de disponibilidade, uso de patinetes e falhas por modelo',
    ],
    comoAjuda: 'Abre o dia com uma lista curta do que fazer, onde e quando, em ordem de prioridade, sem precisar abrir cada painel.',
    confiabilidade: [...confiabilidadeDoRisco(bt), ...(topDecil ? [{ ...topDecil, valor: arred(topDecil.valor, 1) }] : [])],
  };
}
