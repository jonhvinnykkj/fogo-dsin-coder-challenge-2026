// Anomalias: a leitura de agora contra o "normal" DAQUELE equipamento naquela hora.
//
// O normal vem do histórico: média e desvio padrão das leituras do mesmo equipamento, na mesma hora do dia e no
// mesmo tipo de dia (dia útil ou fim de semana). Uma leitura é anômala quando está a 3 desvios ou mais da média
// (|z| ≥ 3) — e só se houver pelo menos 5 amostras para saber o que é normal.
import { formatarNumero } from '../../shared/formato';
import { METRICA_PRINCIPAL, METRICAS_POR_TIPO } from '../../shared/telemetria';
import type { TipoEquipamentoId } from '../../shared/tipos-equipamento';
import type { Database } from 'better-sqlite3';
import { partesLocais } from '../tempo';

export interface BaseHoraria {
  media: Record<string, number>;
  desvio: Record<string, number>;
  amostras: number;
}

export interface Anomalia {
  metrica: string;
  valor: number;
  esperado: number;
  z: number;
  explicacao: string;
}

export const AMOSTRAS_MINIMAS = 5;
export const Z_LIMITE = 3;
/** Radar zerado só é "zerado" em horário em que o normal é passar carro. */
export const FLUXO_MINIMO_PARA_ZERO = 50;
/** Horas com menos minutos online que isto não entram no normal (queda de sinal e falha não são "normal"). */
const ONLINE_MIN_NORMAL = 55;
/**
 * Piso do desvio usado no cálculo do z. Com poucos dias parecidos (um sábado só tem ~8 em 60 dias) o desvio medido costuma
 * sair menor que o real, e ruído normal passaria por anomalia. Por isso o desvio nunca é menor que:
 *  - 20% da média (a variação natural de velocidade, distância, bateria…);
 *  - a raiz da média, nas contagens por hora (o desvio de uma contagem de Poisson);
 *  - 1 (métricas que quase não variam, como falhas de fase por hora).
 */
const DESVIO_RELATIVO_MINIMO = 0.2;
const DESVIO_ABSOLUTO_MINIMO = 1;
const ehContagem = (unidade: string) => unidade.endsWith('/h') && unidade !== 'km/h';

const numero = (v: number | boolean | undefined): number | undefined => (typeof v === 'boolean' ? (v ? 100 : 0) : v);

/**
 * Média e desvio de cada métrica nas leituras históricas desse equipamento nessa hora local (0 a 23) e tipo de dia.
 * `antes` deixa de fora a hora em gravação (a linha ao vivo não pode ser o próprio "normal" dela). Fora dos dias úteis,
 * `diaSemana` (0 = domingo, 6 = sábado) compara sábado só com sábado e domingo só com domingo, que têm perfis diferentes.
 */
export function calcularBaseHoraria(
  db: Database,
  equipamentoId: number,
  diaUtil: boolean,
  hora: number,
  opcoes: { antes?: Date; diaSemana?: number } = {},
): BaseHoraria {
  const horaUtc = String((hora + 3) % 24).padStart(2, '0'); // Marília = UTC−3, sem horário de verão
  const linhas = db
    .prepare(
      `SELECT hora, metricas FROM telemetria_hora
       WHERE equipamento_id = ? AND online_min >= ? AND hora < ? AND substr(hora, 12, 2) = ?`,
    )
    .all(equipamentoId, ONLINE_MIN_NORMAL, (opcoes.antes ?? new Date('9999-12-31T00:00:00.000Z')).toISOString(), horaUtc) as { hora: string; metricas: string }[];

  const valores = new Map<string, number[]>();
  let amostras = 0;
  for (const l of linhas) {
    const dia = partesLocais(new Date(l.hora)).diaSemana;
    if ((dia >= 1 && dia <= 5) !== diaUtil) continue;
    if (!diaUtil && opcoes.diaSemana !== undefined && dia !== opcoes.diaSemana) continue;
    amostras++;
    for (const [chave, v] of Object.entries(JSON.parse(l.metricas) as Record<string, number>)) {
      const lista = valores.get(chave) ?? [];
      lista.push(v);
      valores.set(chave, lista);
    }
  }

  const media: Record<string, number> = {};
  const desvio: Record<string, number> = {};
  for (const [chave, lista] of valores) {
    const m = lista.reduce((s, x) => s + x, 0) / lista.length;
    media[chave] = Math.round(m * 1000) / 1000;
    const variancia = lista.length > 1 ? lista.reduce((s, x) => s + (x - m) ** 2, 0) / (lista.length - 1) : 0;
    desvio[chave] = Math.round(Math.sqrt(variancia) * 1000) / 1000;
  }
  return { media, desvio, amostras };
}

const fmt = (n: number) => formatarNumero(n, n >= 100 || Number.isInteger(n) ? 0 : 1);

/** Desvio usado no z de uma métrica: o medido, mas nunca menor que os pisos de DESVIO_RELATIVO_MINIMO. */
function desvioUsado(base: BaseHoraria, chave: string, unidade: string, esperado: number): number {
  return Math.max(
    base.desvio[chave] ?? 0,
    Math.abs(esperado) * DESVIO_RELATIVO_MINIMO,
    ehContagem(unidade) ? Math.sqrt(Math.abs(esperado)) : 0,
    DESVIO_ABSOLUTO_MINIMO,
  );
}

/**
 * z de cada métrica da leitura contra o normal do horário (mesma conta de `detectarAnomalia`). Serve ao motor para saber se
 * uma leitura já voltou ao normal (|z| < 2) e fechar o alerta de anomalia. Vazio se faltam amostras.
 */
export function zPorMetrica(base: BaseHoraria, leitura: Record<string, number | boolean>, tipo: TipoEquipamentoId): Record<string, number> {
  const z: Record<string, number> = {};
  if (base.amostras < AMOSTRAS_MINIMAS) return z;
  for (const metrica of METRICAS_POR_TIPO[tipo]) {
    const valor = numero(leitura[metrica.chave]);
    const esperado = base.media[metrica.chave];
    if (valor === undefined || esperado === undefined) continue;
    z[metrica.chave] = (valor - esperado) / desvioUsado(base, metrica.chave, metrica.unidade, esperado);
  }
  return z;
}

/**
 * A métrica mais fora do normal da leitura, ou `null` se tudo está dentro do esperado (ou se faltam amostras).
 * O desvio usado tem um piso (ver DESVIO_RELATIVO_MINIMO) para ruído normal não passar por anomalia.
 */
export function detectarAnomalia(base: BaseHoraria, leitura: Record<string, number | boolean>, tipo: TipoEquipamentoId): Anomalia | null {
  if (base.amostras < AMOSTRAS_MINIMAS) return null;
  const achadas: Anomalia[] = [];
  for (const metrica of METRICAS_POR_TIPO[tipo]) {
    const valor = numero(leitura[metrica.chave]);
    const esperado = base.media[metrica.chave];
    if (valor === undefined || esperado === undefined) continue;
    const z = (valor - esperado) / desvioUsado(base, metrica.chave, metrica.unidade, esperado);

    const radarZerado = tipo === 'radar' && metrica.chave === 'fluxo' && valor === 0 && esperado >= FLUXO_MINIMO_PARA_ZERO;
    if (!radarZerado && Math.abs(z) < Z_LIMITE) continue;

    const sentido = valor < esperado ? 'abaixo' : 'acima';
    achadas.push({
      metrica: metrica.chave,
      valor,
      esperado,
      z: Math.round(z * 10) / 10,
      explicacao:
        `${metrica.rotulo}: ${fmt(valor)} ${metrica.unidade}, ${sentido} do normal para o horário: ${fmt(esperado)} ${metrica.unidade} ` +
        `(variação habitual de ${fmt(base.desvio[metrica.chave] ?? 0)}, em ${base.amostras} dias parecidos)`,
    });
  }
  // A métrica principal do tipo conta a história (radar sem leituras de veículos); senão, a mais distante do normal.
  return achadas.find((a) => a.metrica === METRICA_PRINCIPAL[tipo]) ?? achadas.sort((a, b) => Math.abs(b.z) - Math.abs(a.z))[0] ?? null;
}
