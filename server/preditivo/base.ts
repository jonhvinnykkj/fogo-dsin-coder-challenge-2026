// Motor preditivo (Parte 3) — consultas de agregação e utilitários compartilhados.
//
// Tudo no motor é estatística simples e explicável (contagens, médias e razões): agregado no SQL (GROUP BY) e fatiado
// em memória. Horas e dias são sempre os de São Paulo (server/tempo.ts); instantes ficam em milissegundos UTC.
//
// DE ONDE VÊM OS DADOS
//   - Ocorrências: só as de origem 'historico'. As 'injetado' são eventos de demonstração (botão "injetar evento") e as
//     'tempo_real' saem do simulador 24 vezes mais depressa que a cidade real (× a velocidade da tela, até 60×), para a
//     demonstração não ficar parada. Se entrassem, 10 minutos de demonstração a 60× pesariam como 10 dias de cidade.
//     O servidor completa o histórico até a hora em que foi ligado (preencherLacuna), então ele não tem buracos.
//   - Fim dos dados = última hora do histórico (meta.historico_ate) + 1 h, ou o corte pedido, o que vier antes.
//   - Falhas de equipamento = mudanças de situação para 'mau_funcionamento' (historico_situacao): é o momento exato da
//     falha. A previsão de falhas e as tendências usam a mesma definição.
//   - Chuva: clima_dia (observada nos dias passados, prevista — previsto = 1 — nos próximos 7 dias).
import type { Database } from 'better-sqlite3';
import type { Regiao, SituacaoEquipamento } from '../../shared/dominio';
import { partesLocais } from '../tempo';

export const HORA_MS = 3_600_000;
export const DIA_MS = 24 * HORA_MS;

/** Origens de ocorrência que o modelo aprende (ver o topo do arquivo). */
export const ORIGENS_APRENDIZADO = ['historico'] as const;
const FILTRO_ORIGEM = `origem IN (${ORIGENS_APRENDIZADO.map((o) => `'${o}'`).join(', ')})`;

/** Janela de aprendizado do risco: 8 semanas (56 dias = 1.344 horas). */
export const SEMANAS_BASE = 8;
/** Peso da média da cidade na base do bairro, em horas de observação ("horas-equivalentes"). */
export const K_SUAVIZACAO = 20;
/** Tendência: últimas 2 semanas contra as 6 anteriores, limitada a 0,7–1,3. */
export const DIAS_TENDENCIA = 14;
export const TENDENCIA_MIN = 0.7;
export const TENDENCIA_MAX = 1.3;

export type TipoDia = 'util' | 'sabado' | 'domingo';
export const tipoDeDia = (diaSemana: number): TipoDia => (diaSemana === 0 ? 'domingo' : diaSemana === 6 ? 'sabado' : 'util');

export const iso = (ms: number) => new Date(ms).toISOString();
export const inicioDaHoraMs = (ms: number) => Math.floor(ms / HORA_MS) * HORA_MS;
export const limitar = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x));
/** Arredonda para `casas` decimais. */
export const arred = (x: number, casas = 2) => Math.round(x * 10 ** casas) / 10 ** casas;
/** Três algarismos significativos: taxas pequenas (0,000412) não viram zero. */
export const signif = (x: number) => (x === 0 ? 0 : Number(x.toPrecision(3)));

/** Percentil p (0–100) por interpolação linear entre os vizinhos. Ex.: percentil([1, 2, 3, 4], 50) = 2,5. */
export function percentil(valores: ArrayLike<number>, p: number): number {
  const o = Float64Array.from(valores).sort();
  if (o.length === 0) return 0;
  const pos = ((o.length - 1) * p) / 100;
  const i = Math.floor(pos);
  return i + 1 < o.length ? o[i]! + (o[i + 1]! - o[i]!) * (pos - i) : o[i]!;
}

/** Valor do meio (média dos dois do meio se a quantidade for par). Ex.: mediana([3, 1, 2]) = 2. */
export function mediana(valores: readonly number[]): number {
  return percentil(valores, 50);
}

// ---- Rótulos para o gestor ----------------------------------------------------------------------------------

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const DIAS_MINUSC = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

export function periodoDoDia(hora: number): string {
  return hora < 6 ? 'de madrugada' : hora < 12 ? 'de manhã' : hora < 18 ? 'à tarde' : 'à noite';
}

/** "Sexta à noite", "Terça de madrugada"… (hora local). */
export function rotuloDiaPeriodo(diaSemana: number, hora: number): string {
  return `${DIAS[diaSemana]} ${periodoDoDia(hora)}`;
}

export const nomeDoDia = (diaSemana: number) => DIAS_MINUSC[diaSemana]!;

// Regiões nas frases: "região Centro" (e não só "Centro") para não confundir com o bairro Centro.
/** "a região Centro", "a Zona Sul". */
export const regiaoComArtigo = (r: Regiao) => (r === 'Centro' ? 'a região Centro' : `a Zona ${r}`);
/** "da região Centro", "da Zona Sul". */
export const daRegiao = (r: Regiao) => (r === 'Centro' ? 'da região Centro' : `da Zona ${r}`);
/** "na região Centro", "na Zona Sul". */
export const naRegiao = (r: Regiao) => (r === 'Centro' ? 'na região Centro' : `na Zona ${r}`);

/** "14h" ou "14h30" (hora local de um instante). */
export function horaCurta(ms: number): string {
  const p = partesLocais(new Date(ms));
  return p.minuto ? `${p.hora}h${String(p.minuto).padStart(2, '0')}` : `${p.hora}h`;
}

/** "15/10" (data local). */
export function diaMes(ms: number): string {
  const { data } = partesLocais(new Date(ms));
  return `${data.slice(8, 10)}/${data.slice(5, 7)}`;
}

// ---- Ocorrências por bairro × hora --------------------------------------------------------------------------

export interface BairroBase {
  id: number;
  nome: string;
  regiao: Regiao;
}

/** Ocorrências históricas carregadas uma vez e fatiadas em memória (o teste retroativo recorta 14 vezes). */
export interface HistoricoOcorrencias {
  bairros: BairroBase[];
  /** Início da primeira hora carregada (nunca antes do começo real do histórico). */
  inicioMs: number;
  /** Fim exclusivo dos dados. */
  fimMs: number;
  /** porBairro[i][h]: ocorrências do bairro `bairros[i]` na hora `inicioMs + h` horas. */
  porBairro: Float64Array[];
  /** Soma da cidade em cada hora. */
  cidade: Float64Array;
  /** Chuva (mm) por data local YYYY-MM-DD, observada ou prevista. */
  chuvaMm: Map<string, number>;
}

/** Fim exclusivo dos dados de aprendizado: o corte (na hora cheia) ou a última hora do histórico + 1 h. */
export function fimDosDados(db: Database, corte: Date): number {
  const fim = inicioDaHoraMs(corte.getTime());
  const meta = db.prepare("SELECT valor FROM meta WHERE chave = 'historico_ate'").get() as { valor: string } | undefined;
  return meta ? Math.min(fim, Date.parse(meta.valor) + HORA_MS) : fim;
}

/** Começo do histórico (primeira hora com ocorrência histórica), ou null num banco sem histórico. */
export function inicioDoHistorico(db: Database): number | null {
  const primeira = db.prepare(`SELECT MIN(inicio) AS i FROM ocorrencias WHERE ${FILTRO_ORIGEM}`).get() as { i: string | null };
  return primeira.i ? inicioDaHoraMs(Date.parse(primeira.i)) : null;
}

/** Carrega as contagens por bairro e hora dos `diasAntes` dias que antecedem o fim dos dados. */
export function carregarHistorico(db: Database, { ate, diasAntes }: { ate: Date; diasAntes: number }): HistoricoOcorrencias {
  const fimMs = fimDosDados(db, ate);
  const comecoDados = inicioDoHistorico(db) ?? fimMs;
  const inicioMs = Math.min(fimMs, Math.max(comecoDados, fimMs - diasAntes * DIA_MS));
  const horas = Math.round((fimMs - inicioMs) / HORA_MS);

  const bairros = db.prepare('SELECT id, nome, regiao FROM bairros ORDER BY id').all() as BairroBase[];
  const indice = new Map(bairros.map((b, i) => [b.id, i]));
  const porBairro = bairros.map(() => new Float64Array(horas));
  const cidade = new Float64Array(horas);
  const linhas = db
    .prepare(
      `SELECT bairro_id, substr(inicio, 1, 13) AS hora, COUNT(*) AS n FROM ocorrencias
       WHERE ${FILTRO_ORIGEM} AND inicio >= ? AND inicio < ? GROUP BY bairro_id, hora`,
    )
    .all(iso(inicioMs), iso(fimMs)) as { bairro_id: number; hora: string; n: number }[];
  for (const l of linhas) {
    const i = indice.get(l.bairro_id);
    const h = (Date.parse(`${l.hora}:00:00.000Z`) - inicioMs) / HORA_MS;
    if (i === undefined || h < 0 || h >= horas) continue;
    porBairro[i]![h]! += l.n;
    cidade[h]! += l.n;
  }
  const chuvaMm = new Map((db.prepare('SELECT data, chuva_mm FROM clima_dia').all() as { data: string; chuva_mm: number }[]).map((l) => [l.data, l.chuva_mm]));
  return { bairros, inicioMs, fimMs, porBairro, cidade, chuvaMm };
}

/** O que o modelo de risco aprende com as 8 semanas antes de um corte. */
export interface EstatisticasRisco {
  inicioMs: number;
  fimMs: number;
  horas: number;
  /** Ocorrências na janela (cidade inteira). */
  total: number;
  /** Ocorrências por hora de um bairro médio (total ÷ bairros ÷ horas). */
  mediaBairro: number;
  /** Base de cada bairro (ocorrências/hora), suavizada para a média da cidade. Alinhada a `bairros`. */
  base: number[];
  /** Média simples de cada bairro (ocorrências/hora), sem suavizar: é a previsão "ingênua" do teste retroativo. */
  bruta: number[];
  /** Tendência de cada bairro (0,7 a 1,3). */
  tendencia: number[];
  /** Perfil da cidade: taxa da hora (local) em cada tipo de dia ÷ taxa média. 1 = hora comum. */
  perfil: Record<TipoDia, number[]>;
  /** Razão chuva/seco: média de ocorrências num dia de chuva ÷ num dia seco (dias completos da janela). */
  chuva: { fator: number; diasChuva: number; diasSecos: number };
}

/**
 * Estatísticas da janela [corte − 8 semanas, corte), só com o que já tinha acontecido no corte.
 *
 * Base do bairro (suavizada):  base = (ocorrências do bairro + K × média dos bairros) ÷ (horas da janela + K), K = 20.
 *   Ex. (semente padrão): bairro Centro, 1.692 ocorrências em 1.344 h, bairro médio 0,189/h →
 *   (1.692 + 20 × 0,189) ÷ (1.344 + 20) = 1,243/h (sem suavizar: 1,259). Com poucas horas de dados a média pesa mais;
 *   com 8 semanas ela quase não mexe.
 * Perfil (dia útil / sábado / domingo × hora): taxa da cidade naquela hora ÷ taxa média da cidade.
 *   Ex.: dia útil às 18 h = 2,15 (mais que o dobro de uma hora comum); às 3 h = 0,36.
 * Chuva: média diária da cidade nos dias de chuva ÷ nos dias secos. Ex.: 12 dias de chuva e 43 secos → 1,15 (15% a mais).
 * Tendência: taxa das últimas 2 semanas ÷ taxa das 6 anteriores, limitada a 0,7–1,3. Ex.: 1,22/h ÷ 1,24/h = 0,98.
 */
export function calcularEstatisticas(hist: HistoricoOcorrencias, corteMs: number): EstatisticasRisco {
  const fimMs = Math.min(hist.fimMs, inicioDaHoraMs(corteMs));
  const inicioMs = Math.min(fimMs, Math.max(hist.inicioMs, fimMs - SEMANAS_BASE * 7 * DIA_MS));
  const h0 = Math.round((inicioMs - hist.inicioMs) / HORA_MS);
  const h1 = Math.round((fimMs - hist.inicioMs) / HORA_MS);
  const horas = h1 - h0;
  const nB = hist.bairros.length;

  // Perfil e chuva: uma passada pelas horas da janela (hora local).
  const somaSlot: Record<TipoDia, number[]> = { util: Array(24).fill(0), sabado: Array(24).fill(0), domingo: Array(24).fill(0) };
  const horasSlot: Record<TipoDia, number[]> = { util: Array(24).fill(0), sabado: Array(24).fill(0), domingo: Array(24).fill(0) };
  const dias = new Map<string, { n: number; horas: number }>();
  let total = 0;
  for (let h = h0; h < h1; h++) {
    const n = hist.cidade[h]!;
    const p = partesLocais(new Date(hist.inicioMs + h * HORA_MS));
    const td = tipoDeDia(p.diaSemana);
    somaSlot[td][p.hora]! += n;
    horasSlot[td][p.hora]!++;
    const d = dias.get(p.data) ?? { n: 0, horas: 0 };
    d.n += n;
    d.horas++;
    dias.set(p.data, d);
    total += n;
  }
  const mediaCidadeHora = horas > 0 ? total / horas : 0;
  const perfil = {} as Record<TipoDia, number[]>;
  for (const td of ['util', 'sabado', 'domingo'] as TipoDia[]) {
    perfil[td] = somaSlot[td].map((s, hora) => (horasSlot[td][hora]! > 0 && mediaCidadeHora > 0 ? s / horasSlot[td][hora]! / mediaCidadeHora : 1));
  }

  let somaChuva = 0;
  let diasChuva = 0;
  let somaSeco = 0;
  let diasSecos = 0;
  for (const [data, d] of dias) {
    if (d.horas < 24) continue; // só dias completos
    if ((hist.chuvaMm.get(data) ?? 0) > 0) { somaChuva += d.n; diasChuva++; } else { somaSeco += d.n; diasSecos++; }
  }
  const fatorChuva = diasChuva > 0 && diasSecos > 0 && somaSeco > 0 ? somaChuva / diasChuva / (somaSeco / diasSecos) : 1;

  // Base, média simples e tendência de cada bairro.
  const mediaBairro = horas > 0 ? total / nB / horas : 0;
  const hRecente = Math.max(h0, h1 - DIAS_TENDENCIA * 24);
  const base: number[] = [];
  const bruta: number[] = [];
  const tendencia: number[] = [];
  for (let i = 0; i < nB; i++) {
    const serie = hist.porBairro[i]!;
    let antes = 0;
    let recente = 0;
    for (let h = h0; h < hRecente; h++) antes += serie[h]!;
    for (let h = hRecente; h < h1; h++) recente += serie[h]!;
    const n = antes + recente;
    base.push(horas + K_SUAVIZACAO > 0 ? (n + K_SUAVIZACAO * mediaBairro) / (horas + K_SUAVIZACAO) : 0);
    bruta.push(horas > 0 ? n / horas : 0);
    const horasAntes = hRecente - h0;
    const horasRecente = h1 - hRecente;
    const taxaAntes = horasAntes > 0 ? antes / horasAntes : 0;
    tendencia.push(taxaAntes > 0 && horasRecente > 0 ? limitar(recente / horasRecente / taxaAntes, TENDENCIA_MIN, TENDENCIA_MAX) : 1);
  }

  return { inicioMs, fimMs, horas, total, mediaBairro, base, bruta, tendencia, perfil, chuva: { fator: fatorChuva, diasChuva, diasSecos } };
}

// ---- Equipamentos: falhas e situação no tempo ---------------------------------------------------------------

/** Falhas (mudanças para mau funcionamento) por equipamento em [desde, ate). */
export function falhasPorEquipamento(db: Database, desdeMs: number, ateMs: number): Map<number, number> {
  const linhas = db
    .prepare("SELECT equipamento_id, COUNT(*) AS n FROM historico_situacao WHERE para = 'mau_funcionamento' AND em >= ? AND em < ? GROUP BY equipamento_id")
    .all(iso(desdeMs), iso(ateMs)) as { equipamento_id: number; n: number }[];
  return new Map(linhas.map((l) => [l.equipamento_id, l.n]));
}

/** Mudanças de situação de cada equipamento, em ordem (para reconstruir a situação em qualquer instante). */
export function mudancasDeSituacao(db: Database): Map<number, { de: SituacaoEquipamento; para: SituacaoEquipamento; emMs: number }[]> {
  const linhas = db.prepare('SELECT equipamento_id, de, para, em FROM historico_situacao ORDER BY equipamento_id, em, id').all() as {
    equipamento_id: number; de: SituacaoEquipamento; para: SituacaoEquipamento; em: string;
  }[];
  const mapa = new Map<number, { de: SituacaoEquipamento; para: SituacaoEquipamento; emMs: number }[]>();
  for (const l of linhas) {
    let lista = mapa.get(l.equipamento_id);
    if (!lista) mapa.set(l.equipamento_id, (lista = []));
    lista.push({ de: l.de, para: l.para, emMs: Date.parse(l.em) });
  }
  return mapa;
}

/** Situação num instante: a última mudança antes dele; antes da primeira mudança, o "de" dela; sem mudanças, a atual. */
export function situacaoNoInstante(
  atual: SituacaoEquipamento,
  mudancas: readonly { de: SituacaoEquipamento; para: SituacaoEquipamento; emMs: number }[] | undefined,
  instanteMs: number,
): SituacaoEquipamento {
  if (!mudancas || mudancas.length === 0) return atual;
  let s = mudancas[0]!.de;
  for (const m of mudancas) {
    if (m.emMs > instanteMs) break;
    s = m.para;
  }
  return s;
}

/** Hora com menos de 55 minutos conectados conta como queda de sinal. */
export const LIMIAR_QUEDA_MIN = 55;

/** Horas com sinal fraco (online_min < 55) por equipamento em [desde, ate). Usa a chave (equipamento, hora): sem varrer a tabela. */
export function quedasDeSinal(db: Database, desdeMs: number, ateMs: number): Map<number, number> {
  const linhas = db
    .prepare(
      `SELECT e.id AS id, (SELECT COUNT(*) FROM telemetria_hora t WHERE t.equipamento_id = e.id AND t.hora >= ? AND t.hora < ? AND t.online_min < ?) AS n
       FROM equipamentos e`,
    )
    .all(iso(desdeMs), iso(ateMs), LIMIAR_QUEDA_MIN) as { id: number; n: number }[];
  return new Map(linhas.filter((l) => l.n > 0).map((l) => [l.id, l.n]));
}
