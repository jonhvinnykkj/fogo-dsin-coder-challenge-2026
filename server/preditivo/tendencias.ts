// Tendências: disponibilidade por tipo (30 dias + projeção de 7), uso de patinetes por bairro e falhas por marca/modelo.
//
// Disponibilidade do dia = tempo em operação ÷ tempo em que o equipamento deveria funcionar (tudo menos "não instalado"
//   e "desativado", como na Central), somando a frota do tipo. A situação de cada hora sai do histórico de situação.
//   Ex.: 15 radares × 24 h = 360 h; um passou 12 h em manutenção → 348 ÷ 360 = 96,7%.
// Projeção para daqui a 7 dias = reta dos mínimos quadrados sobre os 30 pontos, estendida 7 dias.
//   Ex.: a reta cai 0,1 ponto por dia e hoje marca 95% → 95 − 0,7 = 94,3% (limitada a 0–100).
// Uso de patinetes = horas em uso por dia (métrica emUso da telemetria, % de cada hora), somando os patinetes do bairro;
//   média dos últimos 30 dias completos e variação da última semana contra a anterior. Ex.: 40 h → 34 h = −15%.
// Falhas por 100 equipamentos de cada marca/modelo nos últimos 60 dias (falha = mudança para mau funcionamento).
//   Ex.: 48 falhas em 20 câmeras VX-200 → 240 por 100.
// Tudo só até o fim do histórico (fimDosDados = meta.historico_ate + 1 h): o que a simulação ao vivo faz (falhas, consertos,
//   furtos, telemetria) não entra. O "hoje" das séries é o último dia com dados, e conta até o fim deles.
import type { Database } from 'better-sqlite3';
import { contaNaDisponibilidade, type SituacaoEquipamento } from '../../shared/dominio';
import { formatarNumero } from '../../shared/formato';
import type { ExplicacaoPrevisao, Tendencias } from '../../shared/modelos';
import { TIPOS_EQUIPAMENTO, type TipoEquipamentoId } from '../../shared/tipos-equipamento';
import { dataLocal, instanteLocal, somarDias } from '../tempo';
import { arred, DIA_MS, falhasPorEquipamento, fimDosDados, inicioDoHistorico, limitar, mediana, mudancasDeSituacao, situacaoNoInstante } from './base';

export const DIAS_SERIE = 30;
export const DIAS_PROJECAO = 7;
export const DIAS_FALHAS = 60;

/** Reta dos mínimos quadrados y = a + b·x para x = 0, 1, 2… */
export function regressaoLinear(ys: readonly number[]): { a: number; b: number } {
  const n = ys.length;
  if (n === 0) return { a: 0, b: 0 };
  const mx = (n - 1) / 2;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  ys.forEach((y, x) => {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
  });
  const b = sxx > 0 ? sxy / sxx : 0;
  return { a: my - b * mx, b };
}

const projetar = (ys: readonly number[], diasAFrente: number) => {
  const { a, b } = regressaoLinear(ys);
  return limitar(a + b * (ys.length - 1 + diasAFrente), 0, 100);
};

interface Equip {
  id: number;
  tipo: TipoEquipamentoId;
  marca: string;
  modelo: string;
  situacao: SituacaoEquipamento;
  criado_em: string;
}

/** % de disponibilidade de cada tipo em cada dia de `datas` (o último dia conta só até `agora`). */
function disponibilidadeDiaria(
  equipamentos: Equip[],
  mudancas: ReturnType<typeof mudancasDeSituacao>,
  datas: string[],
  agoraMs: number,
): Map<TipoEquipamentoId, number[]> {
  const inicioMs = instanteLocal(datas[0]!, 0).getTime();
  const nDias = datas.length;
  const oper = new Map<TipoEquipamentoId, Float64Array>();
  const contado = new Map<TipoEquipamentoId, Float64Array>();
  for (const t of TIPOS_EQUIPAMENTO) {
    oper.set(t.id, new Float64Array(nDias));
    contado.set(t.id, new Float64Array(nDias));
  }
  const acumular = (tipo: TipoEquipamentoId, s: SituacaoEquipamento, de: number, ate: number) => {
    if (!contaNaDisponibilidade(s) || ate <= de) return;
    const o = oper.get(tipo)!;
    const c = contado.get(tipo)!;
    // São Paulo não tem horário de verão: cada dia local tem exatamente 24 h a partir de `inicioMs`.
    for (let d = Math.floor((de - inicioMs) / DIA_MS); d < nDias; d++) {
      const ini = Math.max(de, inicioMs + d * DIA_MS);
      const fim = Math.min(ate, inicioMs + (d + 1) * DIA_MS);
      if (fim <= ini) break;
      c[d]! += fim - ini;
      if (s === 'operacional') o[d]! += fim - ini;
    }
  };

  for (const e of equipamentos) {
    const lista = mudancas.get(e.id);
    let s = situacaoNoInstante(e.situacao, lista, inicioMs);
    let t = inicioMs;
    for (const m of lista ?? []) {
      if (m.emMs <= inicioMs) continue;
      if (m.emMs >= agoraMs) break;
      acumular(e.tipo, s, t, m.emMs);
      s = m.para;
      t = m.emMs;
    }
    acumular(e.tipo, s, t, agoraMs);
  }

  const saida = new Map<TipoEquipamentoId, number[]>();
  for (const t of TIPOS_EQUIPAMENTO) {
    const o = oper.get(t.id)!;
    const c = contado.get(t.id)!;
    saida.set(t.id, Array.from(c, (ms, d) => (ms > 0 ? arred((100 * o[d]!) / ms, 1) : 0)));
  }
  return saida;
}

export function calcularTendencias(db: Database, { agora }: { agora: Date }): Tendencias {
  // Fim dos dados: o histórico acaba aqui (a simulação ao vivo fica de fora). Equipamento cadastrado depois não tem passado.
  const agoraMs = fimDosDados(db, agora);
  const hoje = dataLocal(new Date(agoraMs - 1));
  const datas = Array.from({ length: DIAS_SERIE }, (_, k) => somarDias(hoje, k - DIAS_SERIE + 1));
  const equipamentos = (db.prepare('SELECT id, tipo, marca, modelo, situacao, criado_em FROM equipamentos').all() as Equip[])
    .filter((e) => Date.parse(e.criado_em) < agoraMs);
  const mudancas = mudancasDeSituacao(db);

  // 1. Disponibilidade por tipo. Calcula 60 dias: os 30 últimos viram a série; os 60 alimentam o teste retroativo.
  const datasLongas = Array.from({ length: 2 * DIAS_SERIE }, (_, k) => somarDias(hoje, k - 2 * DIAS_SERIE + 1));
  const seriesLongas = disponibilidadeDiaria(equipamentos, mudancas, datasLongas, agoraMs);
  const disponibilidadePorTipo = TIPOS_EQUIPAMENTO.map((t) => {
    const ys = seriesLongas.get(t.id)!.slice(-DIAS_SERIE);
    return { tipo: t.id, serie: ys.map((pct, i) => ({ data: datas[i]!, pct })), projecao7d: arred(projetar(ys, DIAS_PROJECAO), 1) };
  });

  // 2. Uso de patinetes por bairro (30 dias completos, até ontem).
  const diasUso = Array.from({ length: DIAS_SERIE }, (_, k) => somarDias(hoje, k - DIAS_SERIE));
  const linhasUso = db
    .prepare(
      `SELECT e.bairro_id AS bairro, date(t.hora, '-3 hours') AS dia, SUM(COALESCE(json_extract(t.metricas, '$.emUso'), 0)) / 100.0 AS horas
       FROM equipamentos e JOIN telemetria_hora t ON t.equipamento_id = e.id
       WHERE e.tipo = 'patinete' AND t.hora >= ? AND t.hora < ? GROUP BY e.bairro_id, dia`,
    )
    .all(instanteLocal(diasUso[0]!, 0).toISOString(), new Date(Math.min(instanteLocal(hoje, 0).getTime(), agoraMs)).toISOString()) as { bairro: number; dia: string; horas: number }[];
  const usoPorBairroDia = new Map<string, number>(linhasUso.map((l) => [`${l.bairro}|${l.dia}`, l.horas]));
  const bairrosComPatinete = db
    .prepare("SELECT DISTINCT b.id, b.nome FROM equipamentos e JOIN bairros b ON b.id = e.bairro_id WHERE e.tipo = 'patinete' ORDER BY b.nome")
    .all() as { id: number; nome: string }[];
  const usoPatinetesPorBairro = bairrosComPatinete
    .map((b) => {
      const porDia = diasUso.map((d) => usoPorBairroDia.get(`${b.id}|${d}`) ?? 0);
      const soma = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
      const ultimos7 = soma(porDia.slice(-7));
      const anteriores7 = soma(porDia.slice(-14, -7));
      return {
        bairroId: b.id,
        nome: b.nome,
        mediaDiaria: arred(soma(porDia) / DIAS_SERIE, 1),
        variacaoPct: anteriores7 > 0 ? arred((ultimos7 / anteriores7 - 1) * 100, 1) : 0,
      };
    })
    .sort((a, b) => b.mediaDiaria - a.mediaDiaria);

  // 3. Falhas por marca e modelo (60 dias, ou desde o começo do histórico).
  const desde = Math.max(agoraMs - DIAS_FALHAS * DIA_MS, inicioDoHistorico(db) ?? agoraMs - DIAS_FALHAS * DIA_MS);
  const falhas = falhasPorEquipamento(db, desde, agoraMs);
  const porModelo = new Map<string, { marca: string; modelo: string; falhas: number; frota: number }>();
  for (const e of equipamentos) {
    if (situacaoNoInstante(e.situacao, mudancas.get(e.id), agoraMs - 1) === 'nao_instalado') continue;
    const chave = `${e.marca}|${e.modelo}`;
    const acc = porModelo.get(chave) ?? { marca: e.marca, modelo: e.modelo, falhas: 0, frota: 0 };
    acc.falhas += falhas.get(e.id) ?? 0;
    acc.frota++;
    porModelo.set(chave, acc);
  }
  const falhasPorModelo = [...porModelo.values()]
    .map((m) => ({ marca: m.marca, modelo: m.modelo, falhasPor100: arred((100 * m.falhas) / m.frota, 1), frota: m.frota }))
    .sort((a, b) => b.falhasPor100 - a.falhasPor100 || b.frota - a.frota);
  const totalFalhas = [...porModelo.values()].reduce((s, m) => s + m.falhas, 0);

  const resultado = { disponibilidadePorTipo, usoPatinetesPorBairro, falhasPorModelo };
  return { ...resultado, explicacao: explicarTendencias(resultado, seriesLongas, totalFalhas, Math.round((agoraMs - desde) / DIA_MS)) };
}

/**
 * Teste retroativo da projeção, em todas as datas possíveis: para cada janela de 30 dias da série longa, ajusta a reta,
 * projeta 7 dias à frente e compara com o valor medido naquele dia. Erro médio em pontos percentuais, comparado com
 * duas regras simples: repetir o último valor e repetir a média dos 30 dias.
 */
export function testeRetroativoProjecao(series: Map<TipoEquipamentoId, number[]>): { erroReta: number; erroUltimo: number; erroMedia: number; projecoes: number } {
  let erroReta = 0;
  let erroUltimo = 0;
  let erroMedia = 0;
  let n = 0;
  for (const ys of series.values()) {
    for (let k = 0; k + DIAS_SERIE - 1 + DIAS_PROJECAO < ys.length; k++) {
      const treino = ys.slice(k, k + DIAS_SERIE);
      const real = ys[k + DIAS_SERIE - 1 + DIAS_PROJECAO]!;
      erroReta += Math.abs(projetar(treino, DIAS_PROJECAO) - real);
      erroUltimo += Math.abs(treino.at(-1)! - real);
      erroMedia += Math.abs(treino.reduce((s, y) => s + y, 0) / treino.length - real);
      n++;
    }
  }
  return { erroReta: n ? arred(erroReta / n, 2) : 0, erroUltimo: n ? arred(erroUltimo / n, 2) : 0, erroMedia: n ? arred(erroMedia / n, 2) : 0, projecoes: n };
}

const pontos = (x: number) => `${formatarNumero(x, 1)} ${x >= 2 ? 'pontos percentuais' : 'ponto percentual'}`;

function explicarTendencias(
  t: Omit<Tendencias, 'explicacao'>,
  series: Map<TipoEquipamentoId, number[]>,
  totalFalhas: number,
  diasFalhas: number,
): ExplicacaoPrevisao {
  const retro = testeRetroativoProjecao(series);
  const taxas = t.falhasPorModelo.map((m) => m.falhasPor100);
  const pior = t.falhasPorModelo[0];
  const med = mediana(taxas);
  return {
    oQuePreve: 'Para onde caminha a disponibilidade de cada tipo de equipamento (projeção para daqui a 7 dias), como evolui o uso dos patinetes em cada bairro e quais marcas e modelos mais falham.',
    dadosUsados: [
      `Mudanças de situação dos equipamentos nos últimos ${DIAS_SERIE} dias (operação, falha, manutenção, furto)`,
      'Telemetria horária dos patinetes: parte de cada hora em uso',
      `${formatarNumero(totalFalhas)} falhas registradas nos últimos ${diasFalhas} dias, por marca e modelo`,
    ],
    comoAjuda: pior
      ? `Antecipa quedas de disponibilidade, mostra onde faltam ou sobram patinetes e aponta o que trocar na próxima compra: o ${pior.marca} ${pior.modelo} teve ${formatarNumero(pior.falhasPor100, 0)} falhas por 100 equipamentos, contra ${formatarNumero(med, 0)} do modelo mediano.`
      : 'Antecipa quedas de disponibilidade, mostra onde faltam ou sobram patinetes e aponta o que trocar na próxima compra.',
    confiabilidade: [
      {
        metrica: 'Erro da projeção de 7 dias (pontos percentuais)',
        valor: retro.erroReta,
        descricao: `Em ${formatarNumero(retro.projecoes)} projeções refeitas no passado (cada tipo, cada dia possível), a reta errou em média ${pontos(retro.erroReta)}; `
          + `repetir o último valor errou ${pontos(retro.erroUltimo)} e repetir a média dos 30 dias, ${pontos(retro.erroMedia)}. `
          + (retro.erroReta <= Math.min(retro.erroUltimo, retro.erroMedia) ? 'A reta acerta melhor que as regras simples.' : 'Use a projeção para ver a direção, não o número exato.'),
      },
      {
        metrica: 'Falhas analisadas por marca e modelo',
        valor: totalFalhas,
        descricao: `Taxas calculadas sobre ${formatarNumero(totalFalhas)} falhas; modelos com frota pequena (menos de 5 equipamentos) variam muito de um mês para outro.`,
      },
    ],
  };
}

