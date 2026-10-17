// Teste retroativo do risco: "se tivéssemos usado o modelo nas últimas 2 semanas, quanto teria acertado?"
//
// Para cada um dos 14 dias completos antes de hoje:
//   1. corta os dados na meia-noite que abre o dia (o modelo só vê o que aconteceu até a véspera) e recalcula tudo:
//      base, perfis, razão de chuva e tendência (base.ts → calcularEstatisticas);
//   2. prevê as 24 horas do dia e mais 2 (até as 2h da madrugada seguinte, fim da noite) para cada bairro, com a previsão do
//      tempo guardada para o dia (clima_dia.chuva_prevista_mm), não com a chuva que caiu nele;
//   3. compara com o que aconteceu.
// Erro médio absoluto (MAE) por bairro em blocos de 3 horas (0h–3h, 3h–6h… : 8 blocos por dia, como o mapa de 7 dias):
//   média de |previsto − ocorrido| sobre bairros × blocos. Ex.: previu 1,2 e houve 2 → erro 0,8.
//   Por que blocos e não horas: numa hora um bairro tem em média 0,19 ocorrência (quase sempre 0 ou 1); nessa escala
//   qualquer previsão erra perto do mesmo tanto e o erro não mostra quem acerta o horário.
// Comparação ingênua = média simples de ocorrências por hora de cada bairro nas mesmas 8 semanas, espalhada igual pelas
//   horas (no bloco: 3 × a média). Ganho = (erro ingênuo − erro do modelo) ÷ erro ingênuo. Ex.: (0,90 − 0,78) ÷ 0,90 = 13%.
// Acerto dos 5 = na janela da noite (18h às 2h, onde estão as noites movimentadas), dos 5 bairros com maior total previsto,
//   quantos ficaram entre os 5 com mais ocorrências (empate com o 5º conta). Média dos dias, de 0 a 5. A média simples
//   também é avaliada assim (os 5 bairros de maior média). Se a madrugada seguinte ainda não tem dados, usa 18h–24h.
// As contagens são carregadas uma vez (carregarHistorico) e recortadas em memória a cada dia.
import type { Database } from 'better-sqlite3';
import { formatarNumero } from '../../shared/formato';
import type { ExplicacaoPrevisao, ResultadoBacktest } from '../../shared/modelos';
import { dataLocal, instanteLocal, somarDias } from '../tempo';
import { arred, calcularEstatisticas, carregarHistorico, DIA_MS, diaMes, fimDosDados, HORA_MS, SEMANAS_BASE } from './base';
import { calcularTaxas } from './risco';

const TOP = 5;
/** Horas previstas por dia: as 24 do dia e mais 2 (a noite vai até as 2h). */
const HORAS_PREVISTAS = 26;
const HORAS_BLOCO = 3;
/** Janela da noite, em horas desde a meia-noite do dia avaliado: 18h até 2h do dia seguinte. */
const NOITE = { de: 18, ate: 26 };

export function executarBacktest(db: Database, { agora, dias = 14 }: { agora: Date; dias?: number }): ResultadoBacktest {
  const fimMs = fimDosDados(db, agora);
  // Dias completos antes do dia em que os dados terminam (se terminam à meia-noite, o dia anterior está completo).
  const ultimoDia = dataLocal(new Date(fimMs));
  const datas = Array.from({ length: dias }, (_, k) => somarDias(ultimoDia, k - dias));
  const hist = carregarHistorico(db, { ate: new Date(fimMs), diasAntes: dias + SEMANAS_BASE * 7 + 1 });
  const nB = hist.bairros.length;
  const blocos = 24 / HORAS_BLOCO;

  const porDia: ResultadoBacktest['porDia'] = [];
  let somaModelo = 0;
  let somaIngenuo = 0;
  let somaTop = 0;
  let somaTopIngenuo = 0;
  for (const data of datas) {
    const corte = instanteLocal(data, 0).getTime();
    const h0 = Math.round((corte - hist.inicioMs) / HORA_MS);
    if (h0 < 0 || corte + DIA_MS > hist.fimMs) continue; // dia sem dados completos
    const est = calcularEstatisticas(hist, corte);
    if (est.horas === 0) continue;
    const horas = corte + HORAS_PREVISTAS * HORA_MS <= hist.fimMs ? HORAS_PREVISTAS : 24;
    const { taxas } = calcularTaxas(hist, est, corte, horas);
    const real = (i: number, t: number) => hist.porBairro[i]![h0 + t]!;

    let erroModelo = 0;
    let erroIngenuo = 0;
    const noitePrevista: number[] = [];
    const noiteOcorrida: number[] = [];
    for (let i = 0; i < nB; i++) {
      for (let b = 0; b < blocos; b++) {
        let prev = 0;
        let ocorr = 0;
        for (let k = 0; k < HORAS_BLOCO; k++) {
          prev += taxas[i * horas + b * HORAS_BLOCO + k]!;
          ocorr += real(i, b * HORAS_BLOCO + k);
        }
        erroModelo += Math.abs(prev - ocorr);
        erroIngenuo += Math.abs(HORAS_BLOCO * est.bruta[i]! - ocorr);
      }
      let prevNoite = 0;
      let realNoite = 0;
      for (let t = NOITE.de; t < Math.min(NOITE.ate, horas); t++) {
        prevNoite += taxas[i * horas + t]!;
        realNoite += real(i, t);
      }
      noitePrevista.push(prevNoite);
      noiteOcorrida.push(realNoite);
    }
    const celulas = nB * blocos;
    const acerto = acertoTop(noitePrevista, noiteOcorrida, TOP);
    const acertoIngenuo = acertoTop(est.bruta, noiteOcorrida, TOP);
    // A média simples de cada dia também vai na resposta: o gráfico por dia compara as duas linhas.
    porDia.push({ data, acertoTop5: acerto, acertoTop5Ingenuo: acertoIngenuo, mae: arred(erroModelo / celulas, 4), maeIngenuo: arred(erroIngenuo / celulas, 4) });
    somaModelo += erroModelo / celulas;
    somaIngenuo += erroIngenuo / celulas;
    somaTop += acerto;
    somaTopIngenuo += acertoIngenuo;
  }

  const avaliados = porDia.length;
  const maeModelo = avaliados ? arred(somaModelo / avaliados, 4) : 0;
  const maeIngenuo = avaliados ? arred(somaIngenuo / avaliados, 4) : 0;
  const ganhoPct = maeIngenuo > 0 ? arred((100 * (maeIngenuo - maeModelo)) / maeIngenuo, 1) : 0;
  const acertoTop5Medio = avaliados ? arred(somaTop / avaliados, 1) : 0;
  const acertoTop5IngenuoMedio = avaliados ? arred(somaTopIngenuo / avaliados, 1) : 0;
  const resultado = { dias: avaliados, maeModelo, maeIngenuo, ganhoPct, acertoTop5Medio, acertoTop5IngenuoMedio, porDia };
  return { ...resultado, explicacao: explicarBacktest(resultado, hist.inicioMs, fimMs) };
}

/** Quantos dos `top` maiores previstos ficaram entre os `top` maiores ocorridos (empate com o último conta). */
export function acertoTop(previsto: number[], ocorrido: number[], top: number): number {
  const ordem = (xs: number[]) => xs.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v || a.i - b.i);
  const escolhidos = ordem(previsto).slice(0, top).map((x) => x.i);
  const corte = ordem(ocorrido)[Math.min(top, ocorrido.length) - 1]?.v ?? 0;
  return escolhidos.filter((i) => ocorrido[i]! >= corte && ocorrido[i]! > 0).length;
}

function explicarBacktest(r: Omit<ResultadoBacktest, 'explicacao'>, inicioMs: number, fimMs: number): ExplicacaoPrevisao {
  const primeiro = r.porDia[0]?.data;
  const ultimo = r.porDia.at(-1)?.data;
  const fmtData = (d: string | undefined) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '—');
  const melhor = r.porDia.reduce((m, d) => (d.acertoTop5 > m ? d.acertoTop5 : m), 0);
  return {
    oQuePreve: `Quanto o mapa de risco teria acertado nos ${r.dias} dias antes de hoje (${fmtData(primeiro)} a ${fmtData(ultimo)}) se cada dia tivesse sido previsto na véspera.`,
    dadosUsados: [
      `Ocorrências registradas de ${diaMes(inicioMs)} a ${diaMes(fimMs - 1)}, por bairro e hora`,
      'Para cada dia, o modelo foi refeito só com os dados até a meia-noite anterior, e a chuva do dia entra pela previsão do tempo da véspera, não pela que caiu (nada do próprio dia entra no cálculo)',
      'Comparação: a média simples de ocorrências por hora de cada bairro, igual em todas as horas, sem horário, chuva nem tendência',
    ],
    comoAjuda: 'Diz se dá para confiar no mapa de risco antes de mexer na escala: quanto ele erra e se aponta os bairros certos.',
    confiabilidade: [
      {
        metrica: 'Erro médio do modelo (ocorrências por bairro a cada 3 horas)',
        valor: r.maeModelo,
        descricao: `Medido em blocos de 3 horas por bairro (8 por dia): em média o modelo errou ${formatarNumero(r.maeModelo, 2)} ocorrência por bloco.`,
      },
      {
        metrica: 'Erro médio da média simples (por bairro a cada 3 horas)',
        valor: r.maeIngenuo,
        descricao: `Repetir a média de cada bairro, igual em todas as horas, errou ${formatarNumero(r.maeIngenuo, 2)} por bloco.`,
      },
      {
        metrica: 'Erro a menos que a média simples (%)',
        valor: r.ganhoPct,
        descricao: r.ganhoPct >= 0
          ? `O modelo errou ${formatarNumero(r.ganhoPct, 1)}% menos que a média simples.`
          : `O modelo errou ${formatarNumero(-r.ganhoPct, 1)}% mais que a média simples: não use o mapa sem conferir.`,
      },
      {
        metrica: 'Acerto dos 5 bairros mais arriscados à noite (0 a 5)',
        valor: r.acertoTop5Medio,
        descricao: `Entre 18h e 2h, dos 5 bairros apontados como mais arriscados, em média ${formatarNumero(r.acertoTop5Medio, 1)} estiveram mesmo entre os 5 com mais ocorrências (melhor dia: ${melhor} de 5).`,
      },
      {
        metrica: 'Acerto dos 5 bairros pela média simples à noite (0 a 5)',
        valor: r.acertoTop5IngenuoMedio,
        descricao: `Para comparar: escolher sempre os 5 bairros de maior média acertaria ${formatarNumero(r.acertoTop5IngenuoMedio, 1)}.`,
      },
    ],
  };
}
