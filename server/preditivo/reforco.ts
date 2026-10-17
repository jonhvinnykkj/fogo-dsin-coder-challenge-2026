// Reforço de agentes: onde vai faltar gente em cada turno das próximas 24 horas.
//
// 1. Carga prevista de uma região num turno = soma das taxas do mapa de risco (risco.ts) dos bairros da região nas horas
//    do turno. Ex. (semente padrão): região Centro na tarde de quinta (14h–22h): 6 bairros × 8 horas = 43,0 ocorrências.
// 2. Carga por agente = carga ÷ agentes escalados naquele turno com base na região. Ex.: 43,0 ÷ 7 = 6,1 por agente.
//    Cada turno é uma escala separada (a madrugada é o plantão reduzido que reforça a noite das 0h às 6h).
// 3. Guloso, um agente por vez: tira da região com MENOR carga por agente (que fique com pelo menos 1) e põe na de MAIOR,
//    enquanto (a) a maior estiver pelo menos 20% acima da média da cidade no turno e (b) a mudança não inverter a situação
//    (a origem não pode ficar mais carregada que o destino). Movimentos repetidos viram uma recomendação com quantidade;
//    no máximo 3 recomendações por turno. Trechos de turno com menos de 3 horas dentro da janela ficam de fora.
//    Ex.: na tarde de quinta a cidade tem 135 ocorrências previstas para 27 agentes (média 5,0; limite 1,2 × 5,0 = 6,0).
//    Região Centro: 43,0 ÷ 7 = 6,1 → em déficit. Menor carga com 2+ agentes: Zona Leste, 8,1 ÷ 3 = 2,7.
//    Mover 1: Centro 43,0 ÷ 8 = 5,4; Leste 8,1 ÷ 2 = 4,1 (não inverte). Agora nenhuma região passa de 6,0: para.
import type { Database } from 'better-sqlite3';
import { REGIOES, ROTULO_TURNO, TURNOS, turnoCobreHora, type Regiao, type Turno } from '../../shared/dominio';
import { formatarNumero } from '../../shared/formato';
import type { CelulaRisco, ExplicacaoPrevisao, PrevisaoRisco, RecomendacaoReforco, RespostaReforco, ResultadoBacktest } from '../../shared/modelos';
import { partesLocais } from '../tempo';
import { arred, daRegiao, HORA_MS, horaCurta, inicioDaHoraMs, iso, naRegiao, nomeDoDia, regiaoComArtigo } from './base';
import { executarBacktest } from './backtest';
import { calcularRisco, confiabilidadeDoRisco } from './risco';

/** A região de maior carga só recebe gente se estiver pelo menos 20% acima da média da cidade no turno. */
export const LIMIAR_DEFICIT = 1.2;
export const MAX_RECOMENDACOES_POR_TURNO = 3;
/** Trecho de turno mais curto que vale um remanejamento (o pedaço de turno que sobra no fim da janela de 24 h não vale). */
export const HORAS_MINIMAS_TURNO = 3;

export interface PeriodoDeTurno {
  turno: Turno;
  inicioMs: number;
  fimMs: number;
}

/** Trechos contínuos de cada turno dentro da janela [inicio, inicio + horas), em ordem de início. */
export function periodosDosTurnos(inicioMs: number, horas: number): PeriodoDeTurno[] {
  const periodos: PeriodoDeTurno[] = [];
  for (const turno of TURNOS) {
    let aberto: PeriodoDeTurno | undefined;
    for (let t = 0; t < horas; t++) {
      const ms = inicioMs + t * HORA_MS;
      if (turnoCobreHora(turno, partesLocais(new Date(ms)).hora)) {
        if (aberto && aberto.fimMs === ms) aberto.fimMs = ms + HORA_MS;
        else periodos.push((aberto = { turno, inicioMs: ms, fimMs: ms + HORA_MS }));
      }
    }
  }
  return periodos.sort((a, b) => a.inicioMs - b.inicioMs || TURNOS.indexOf(a.turno) - TURNOS.indexOf(b.turno));
}

interface Movimento {
  origem: Regiao;
  destino: Regiao;
  quantidade: number;
  antes: number;
  depois: number;
}

/** Equilíbrio guloso de um turno (ver o topo do arquivo). `agentes` não é alterado. */
export function equilibrar(carga: Record<Regiao, number>, agentes: Record<Regiao, number>): Movimento[] {
  const n = { ...agentes };
  const totalAgentes = REGIOES.reduce((s, r) => s + n[r], 0);
  const totalCarga = REGIOES.reduce((s, r) => s + carga[r], 0);
  if (totalAgentes === 0 || totalCarga === 0) return [];
  const media = totalCarga / totalAgentes;
  // Região sem ninguém escalado conta como se tivesse 1 agente: só recebe gente se a carga dela justificar.
  const porAgente = (r: Regiao) => carga[r] / Math.max(n[r], 1);
  const movimentos = new Map<string, Movimento>();

  for (let passo = 0; passo < totalAgentes; passo++) {
    const destino = [...REGIOES].sort((a, b) => porAgente(b) - porAgente(a))[0]!;
    if (porAgente(destino) < LIMIAR_DEFICIT * media) break;
    const origem = REGIOES.filter((r) => r !== destino && n[r] >= 2).sort((a, b) => porAgente(a) - porAgente(b))[0];
    if (!origem) break;
    const destinoDepois = carga[destino] / (n[destino] + 1);
    const origemDepois = carga[origem] / (n[origem] - 1);
    if (n[destino] > 0 && origemDepois > destinoDepois) break;
    const chave = `${origem}>${destino}`;
    let mov = movimentos.get(chave);
    if (!mov) {
      if (movimentos.size >= MAX_RECOMENDACOES_POR_TURNO) break;
      mov = { origem, destino, quantidade: 0, antes: porAgente(destino), depois: 0 };
      movimentos.set(chave, mov);
    }
    n[origem]--;
    n[destino]++;
    mov.quantidade++;
    mov.depois = carga[destino] / n[destino];
  }
  return [...movimentos.values()];
}

const plural = (n: number, um: string, varios: string) => (n === 1 ? `1 ${um}` : `${n} ${varios}`);

function contarAgentes(db: Database): Record<Turno, Record<Regiao, number>> {
  const vazio = () => Object.fromEntries(REGIOES.map((r) => [r, 0])) as Record<Regiao, number>;
  const escala = Object.fromEntries(TURNOS.map((t) => [t, vazio()])) as Record<Turno, Record<Regiao, number>>;
  const linhas = db.prepare('SELECT a.turno, b.regiao, COUNT(*) AS n FROM agentes a JOIN bairros b ON b.id = a.base_bairro_id GROUP BY a.turno, b.regiao').all() as {
    turno: Turno; regiao: Regiao; n: number;
  }[];
  for (const l of linhas) escala[l.turno][l.regiao] = l.n;
  return escala;
}

export interface OpcoesReforco {
  agora: Date;
  horas: number;
  /** Mapa de risco já calculado para a mesma janela (evita recalcular). */
  previsao?: Pick<PrevisaoRisco, 'celulas'>;
}

export function recomendarReforco(db: Database, { agora, horas, previsao }: OpcoesReforco): RecomendacaoReforco[] {
  const celulas: CelulaRisco[] = previsao?.celulas ?? calcularRisco(db, { agora, horas }).celulas;
  const regiaoDoBairro = new Map((db.prepare('SELECT id, regiao FROM bairros').all() as { id: number; regiao: Regiao }[]).map((b) => [b.id, b.regiao]));
  const escala = contarAgentes(db);
  const inicioMs = inicioDaHoraMs(agora.getTime());

  // Carga por hora e região (uma passada pelas células).
  const cargaHora = new Map<number, Record<Regiao, number>>();
  for (const c of celulas) {
    const ms = Date.parse(c.inicio);
    let porRegiao = cargaHora.get(ms);
    if (!porRegiao) cargaHora.set(ms, (porRegiao = Object.fromEntries(REGIOES.map((r) => [r, 0])) as Record<Regiao, number>));
    const r = regiaoDoBairro.get(c.bairroId);
    if (r) porRegiao[r] += c.taxaEsperada;
  }

  const recomendacoes: RecomendacaoReforco[] = [];
  for (const p of periodosDosTurnos(inicioMs, horas)) {
    if (p.fimMs - p.inicioMs < HORAS_MINIMAS_TURNO * HORA_MS) continue;
    const carga = Object.fromEntries(REGIOES.map((r) => [r, 0])) as Record<Regiao, number>;
    for (let ms = p.inicioMs; ms < p.fimMs; ms += HORA_MS) {
      const h = cargaHora.get(ms);
      if (h) for (const r of REGIOES) carga[r] += h[r];
    }
    const agentes = escala[p.turno];
    for (const m of equilibrar(carga, agentes)) {
      recomendacoes.push({
        regiaoOrigem: m.origem,
        regiaoDestino: m.destino,
        quantidade: m.quantidade,
        inicio: iso(p.inicioMs),
        fim: iso(p.fimMs),
        cargaPorAgenteAntes: arred(m.antes),
        cargaPorAgenteDepois: arred(m.depois),
        motivo: motivo(m, p, carga, agentes),
      });
    }
  }
  return recomendacoes;
}

function motivo(m: Movimento, p: PeriodoDeTurno, carga: Record<Regiao, number>, agentes: Record<Regiao, number>): string {
  const n = (x: number) => formatarNumero(x, 1);
  const de = horaCurta(p.inicioMs);
  const ate = horaCurta(p.fimMs);
  const periodo = `na ${ROTULO_TURNO[p.turno].toLowerCase()} de ${nomeDoDia(partesLocais(new Date(p.inicioMs)).diaSemana)} (${de} às ${ate})`;
  const destino = regiaoComArtigo(m.destino).replace(/^a/, 'A');
  const semAgente = agentes[m.destino] === 0;
  const situacao = semAgente
    ? `${destino} deve ter ${n(carga[m.destino])} ocorrências ${periodo} e não tem nenhum agente escalado`
    : `${destino} deve ter ${n(carga[m.destino])} ocorrências ${periodo} para ${plural(agentes[m.destino], 'agente', 'agentes')}: ${n(m.antes)} por agente, `
      + `contra ${n(agentes[m.origem] > 0 ? carga[m.origem] / agentes[m.origem] : 0)} ${naRegiao(m.origem)}`;
  return `${situacao}. Mande ${plural(m.quantidade, 'agente', 'agentes')} ${daRegiao(m.origem)} para ${regiaoComArtigo(m.destino)} das ${de} às ${ate}; `
    + `a carga ${naRegiao(m.destino)} cai para ${n(m.depois)} por agente.`;
}

export function respostaReforco(db: Database, opcoes: OpcoesReforco & { backtest?: ResultadoBacktest }): RespostaReforco {
  const recomendacoes = recomendarReforco(db, opcoes);
  const agentes = (db.prepare('SELECT COUNT(*) AS n FROM agentes').get() as { n: number }).n;
  const backtest = opcoes.backtest ?? executarBacktest(db, { agora: opcoes.agora, dias: 14 });
  return { geradoEm: opcoes.agora.toISOString(), horas: opcoes.horas, recomendacoes, explicacao: explicarReforco(recomendacoes, agentes, backtest) };
}

function explicarReforco(recs: RecomendacaoReforco[], agentes: number, bt: ResultadoBacktest): ExplicacaoPrevisao {
  const movidos = recs.reduce((s, r) => s + r.quantidade, 0);
  return {
    oQuePreve: 'Em quais regiões vai faltar agente em cada turno das próximas 24 horas: as ocorrências previstas para cada agente escalado.',
    dadosUsados: [
      'Mapa de risco das próximas 24 horas (ocorrências esperadas por bairro e hora)',
      `Escala de ${formatarNumero(agentes)} agentes: turno de cada um e região da base`,
      'Turnos: manhã 6h–14h, tarde 14h–22h, noite 22h–6h e madrugada 0h–6h (plantão que reforça a noite)',
    ],
    comoAjuda: recs.length > 0
      ? `Diz quantos agentes mover, de onde, para onde e em que horário (${plural(movidos, 'remanejamento', 'remanejamentos')} sugeridos): equilibra a carga até no máximo 20% acima da média da cidade, `
        + 'sem deixar a região de origem mais carregada que a de destino e com no máximo 3 mudanças por turno.'
      : 'Confirma que a escala atual já está equilibrada: nenhuma região passa de 20% acima da carga média por agente da cidade (ou mover alguém deixaria a origem mais carregada que o destino).',
    confiabilidade: confiabilidadeDoRisco(bt),
  };
}
