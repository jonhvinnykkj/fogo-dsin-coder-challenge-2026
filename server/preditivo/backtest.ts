// Teste retroativo do risco: "se tivéssemos usado o modelo nas últimas 2 semanas, quanto teria acertado?"
//
// Para cada um dos 14 dias completos antes de hoje:
//   1. corta os dados na meia-noite que abre o dia (o modelo só vê o que aconteceu até a véspera) e recalcula tudo:
//      base, perfil, razão de chuva e tendência (base.ts → calcularEstatisticas);
//   2. prevê as 24 horas do dia para cada bairro (a chuva do dia entra como "previsão": na cidade sintética a previsão
//      do tempo sempre se confirma);
//   3. compara com o que aconteceu, bairro a bairro e hora a hora.
// Erro médio absoluto (MAE) = média de |previsto − ocorrido| sobre bairros × horas.
//   Ex.: previu 0,40 e houve 1 → erro 0,60; previu 0,05 e houve 0 → erro 0,05.
// Comparação ingênua = média simples de ocorrências por hora de cada bairro nas mesmas 8 semanas (sem horário, chuva
// nem tendência). Ganho = (erro ingênuo − erro do modelo) ÷ erro ingênuo. Ex.: (0,25 − 0,21) ÷ 0,25 = 16%.
// Acerto dos 5 = dos 5 bairros com maior total previsto no dia, quantos ficaram entre os 5 com mais ocorrências
//   (empate com o 5º conta como acerto). Média dos 14 dias, de 0 a 5.
// As contagens são carregadas uma vez (carregarHistorico) e recortadas em memória a cada dia.
import type { Database } from 'better-sqlite3';
import { formatarNumero } from '../../shared/formato';
import type { ExplicacaoPrevisao, ResultadoBacktest } from '../../shared/modelos';
import { dataLocal, instanteLocal, somarDias } from '../tempo';
import { arred, calcularEstatisticas, carregarHistorico, DIA_MS, diaMes, fimDosDados, HORA_MS, SEMANAS_BASE } from './base';
import { calcularTaxas } from './risco';

const TOP = 5;

export function executarBacktest(db: Database, { agora, dias = 14 }: { agora: Date; dias?: number }): ResultadoBacktest {
  const fimMs = fimDosDados(db, agora);
  // Dias completos antes do dia em que os dados terminam (se terminam à meia-noite, o dia anterior está completo).
  const ultimoDia = dataLocal(new Date(fimMs));
  const datas = Array.from({ length: dias }, (_, k) => somarDias(ultimoDia, k - dias));
  const hist = carregarHistorico(db, { ate: new Date(fimMs), diasAntes: dias + SEMANAS_BASE * 7 + 1 });
  const nB = hist.bairros.length;

  const porDia: ResultadoBacktest['porDia'] = [];
  let somaModelo = 0;
  let somaIngenuo = 0;
  let somaTop = 0;
  let somaTopIngenuo = 0;
  let avaliados = 0;
  for (const data of datas) {
    const corte = instanteLocal(data, 0).getTime();
    const h0 = Math.round((corte - hist.inicioMs) / HORA_MS);
    if (h0 < 0 || corte + DIA_MS > hist.fimMs) continue; // dia sem dados completos
    const est = calcularEstatisticas(hist, corte);
    if (est.horas === 0) continue;
    const { taxas } = calcularTaxas(hist, est, corte, 24);

    let erroModelo = 0;
    let erroIngenuo = 0;
    const previstoDia: number[] = [];
    const ocorridoDia: number[] = [];
    for (let i = 0; i < nB; i++) {
      let prev = 0;
      let real = 0;
      for (let t = 0; t < 24; t++) {
        const p = taxas[i * 24 + t]!;
        const r = hist.porBairro[i]![h0 + t]!;
        erroModelo += Math.abs(p - r);
        erroIngenuo += Math.abs(est.bruta[i]! - r);
        prev += p;
        real += r;
      }
      previstoDia.push(prev);
      ocorridoDia.push(real);
    }
    const celulas = nB * 24;
    const acerto = acertoTop(previstoDia, ocorridoDia, TOP);
    somaTopIngenuo += acertoTop(est.bruta, ocorridoDia, TOP);
    porDia.push({ data, acertoTop5: acerto, mae: arred(erroModelo / celulas, 4) });
    somaModelo += erroModelo / celulas;
    somaIngenuo += erroIngenuo / celulas;
    somaTop += acerto;
    avaliados++;
  }

  const maeModelo = avaliados ? arred(somaModelo / avaliados, 4) : 0;
  const maeIngenuo = avaliados ? arred(somaIngenuo / avaliados, 4) : 0;
  const ganhoPct = maeIngenuo > 0 ? arred((100 * (maeIngenuo - maeModelo)) / maeIngenuo, 1) : 0;
  const acertoTop5Medio = avaliados ? arred(somaTop / avaliados, 1) : 0;
  const acertoTop5Ingenuo = avaliados ? arred(somaTopIngenuo / avaliados, 1) : 0;
  const resultado = { dias: avaliados, maeModelo, maeIngenuo, ganhoPct, acertoTop5Medio, porDia };
  return { ...resultado, explicacao: explicarBacktest(resultado, acertoTop5Ingenuo, hist.inicioMs, fimMs) };
}

/** Quantos dos `top` maiores previstos ficaram entre os `top` maiores ocorridos (empate com o último conta). */
export function acertoTop(previsto: number[], ocorrido: number[], top: number): number {
  const ordem = (xs: number[]) => xs.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v || a.i - b.i);
  const escolhidos = ordem(previsto).slice(0, top).map((x) => x.i);
  const corte = ordem(ocorrido)[Math.min(top, ocorrido.length) - 1]?.v ?? 0;
  return escolhidos.filter((i) => ocorrido[i]! >= corte && ocorrido[i]! > 0).length;
}

function explicarBacktest(r: Omit<ResultadoBacktest, 'explicacao'>, topIngenuo: number, inicioMs: number, fimMs: number): ExplicacaoPrevisao {
  const primeiro = r.porDia[0]?.data;
  const ultimo = r.porDia.at(-1)?.data;
  const fmtData = (d: string | undefined) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '—');
  const melhor = r.porDia.reduce((m, d) => (d.acertoTop5 > m ? d.acertoTop5 : m), 0);
  return {
    oQuePreve: `Quanto o mapa de risco teria acertado nos ${r.dias} dias antes de hoje (${fmtData(primeiro)} a ${fmtData(ultimo)}) se cada dia tivesse sido previsto na véspera.`,
    dadosUsados: [
      `Ocorrências registradas de ${diaMes(inicioMs)} a ${diaMes(fimMs - 1)}, por bairro e hora`,
      'Para cada dia, o modelo foi refeito só com os dados até a meia-noite anterior (nada do próprio dia entra no cálculo)',
      'Comparação: a média simples de ocorrências por hora de cada bairro, sem horário, chuva nem tendência',
    ],
    comoAjuda: 'Diz se dá para confiar no mapa de risco antes de mexer na escala: quanto ele erra e se aponta os bairros certos.',
    confiabilidade: [
      {
        metrica: 'Erro médio do modelo (ocorrências por bairro e hora)',
        valor: r.maeModelo,
        descricao: `Em média o modelo errou ${formatarNumero(r.maeModelo, 2)} ocorrência por bairro em cada hora.`,
      },
      {
        metrica: 'Erro médio da média simples',
        valor: r.maeIngenuo,
        descricao: `Repetir a média de cada bairro errou ${formatarNumero(r.maeIngenuo, 2)}.`,
      },
      {
        metrica: 'Erro a menos que a média simples (%)',
        valor: r.ganhoPct,
        descricao: r.ganhoPct >= 0
          ? `O modelo errou ${formatarNumero(r.ganhoPct, 1)}% menos que a média simples.`
          : `O modelo errou ${formatarNumero(-r.ganhoPct, 1)}% mais que a média simples: não use o mapa sem conferir.`,
      },
      {
        metrica: 'Acerto dos 5 bairros mais arriscados (0 a 5)',
        valor: r.acertoTop5Medio,
        descricao: `Dos 5 bairros apontados como mais arriscados, em média ${formatarNumero(r.acertoTop5Medio, 1)} estiveram mesmo entre os 5 com mais ocorrências do dia (melhor dia: ${melhor} de 5).`,
      },
      {
        metrica: 'Acerto dos 5 bairros pela média simples (0 a 5)',
        valor: topIngenuo,
        descricao: `Para comparar: escolher os 5 bairros pela média simples acertaria ${formatarNumero(topIngenuo, 1)}. Os bairros mais movimentados mudam pouco; o ganho do modelo está em dizer a hora.`,
      },
    ],
  };
}
