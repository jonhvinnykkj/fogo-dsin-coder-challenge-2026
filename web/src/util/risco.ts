// Apoio da tela de Previsões: escala de cor do risco, horários no relógio de São Paulo e rótulos de região.
// Os números (índice, taxa, fatores) vêm prontos do servidor; aqui só se decide como mostrar.
import { COR_NIVEL_RISCO, type Regiao } from '../../../shared/dominio';
import type { Tema } from '../estilo/tema';

const FUSO = 'America/Sao_Paulo';

// ---------------------------------------------------------------- cor

type Rgb = [number, number, number];

const rgb = (hex: string): Rgb => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const hex = ([r, g, b]: Rgb) => `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('').toUpperCase()}`;

/** Cor contínua entre paradas `[índice, cor]` (interpolação linear em RGB; fora das pontas, a cor da ponta). */
function interpolar(paradas: readonly (readonly [number, string])[], indice: number): string {
  const i = Math.min(100, Math.max(0, indice));
  const fim = paradas.findIndex(([p]) => p >= i);
  if (fim === -1) return paradas.at(-1)![1].toUpperCase();
  if (fim === 0) return paradas[0]![1].toUpperCase();
  const [p0, c0] = paradas[fim - 1]!;
  const [p1, c1] = paradas[fim]!;
  const t = (i - p0) / (p1 - p0);
  const a = rgb(c0);
  const b = rgb(c1);
  return hex([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
}

/** Cada nível chega à sua cor no índice em que termina: 25 = amarelo, 50 = âmbar, 75 = laranja-fogo, 100 = vermelho-escuro. */
const PARADAS_NIVEIS = [
  [25, COR_NIVEL_RISCO.baixo],
  [50, COR_NIVEL_RISCO.moderado],
  [75, COR_NIVEL_RISCO.alto],
  [100, COR_NIVEL_RISCO.critico],
] as const;

/** Cor do índice para o mapa (a transparência do polígono faz o "quase nada" sumir no fundo). */
export function rampaRisco(indice: number): string {
  return interpolar([[0, COR_NIVEL_RISCO.baixo], ...PARADAS_NIVEIS], indice);
}

/** Fundo de onde a escala parte em cada tema: risco quase zero some na superfície (a maioria das células é baixa). */
export const COR_RISCO_ZERO: Record<Tema, string> = { claro: '#E9E9E4', escuro: '#38383C' };

/** Cor da célula da grade de 7 dias e das barras: do fundo do tema (0) até o vermelho-escuro (100). */
export function corDaCelula(indice: number, tema: Tema): string {
  return interpolar([[0, COR_RISCO_ZERO[tema]], ...PARADAS_NIVEIS], indice);
}

/** Gradiente CSS da legenda, com as mesmas paradas. */
export function gradienteLegenda(tema: Tema): string {
  const paradas = [[0, COR_RISCO_ZERO[tema]] as const, ...PARADAS_NIVEIS].map(([p, c]) => `${c} ${p}%`);
  return `linear-gradient(90deg, ${paradas.join(', ')})`;
}

// ---------------------------------------------------------------- horários (São Paulo)

const fmtHora = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', hourCycle: 'h23' });
const fmtSemana = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, weekday: 'short' });
const fmtSemanaLonga = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, weekday: 'long' });
const fmtDiaMes = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit' });
const fmtDataIso = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Hora local (0 a 23) do instante ISO. */
export function horaLocal(iso: string): number {
  return Number(fmtHora.format(new Date(iso))) % 24;
}

/** "sáb", "dom"… (sem o ponto que o Intl põe). */
export function diaDaSemanaCurto(iso: string): string {
  return fmtSemana.format(new Date(iso)).replace('.', '');
}

/** "sábado", "domingo", "segunda-feira"→"segunda". */
export function diaDaSemana(iso: string): string {
  return fmtSemanaLonga.format(new Date(iso)).replace('-feira', '');
}

/** "sáb 17/10". */
export function rotuloDia(iso: string): string {
  return `${diaDaSemanaCurto(iso)} ${fmtDiaMes.format(new Date(iso))}`;
}

/** "21h". */
export function rotuloHoraCurta(iso: string): string {
  return `${horaLocal(iso)}h`;
}

/** "18h às 21h" (o fim da noite é "24h", como nos textos do servidor). */
export function faixaDeHoras(inicioIso: string, horas: number): string {
  const h = horaLocal(inicioIso);
  const fim = (h + horas) % 24;
  return `${h}h às ${fim === 0 ? 24 : fim}h`;
}

/** Dia local "aaaa-mm-dd". */
export function dataLocalIso(iso: string): string {
  return fmtDataIso.format(new Date(iso));
}

export interface DiaDaGrade {
  data: string;
  rotulo: string;
  /** Posições (na lista recebida) dos blocos que caem nesse dia. */
  indices: number[];
}

/** Agrupa instantes consecutivos pelo dia local. O primeiro e o último dia podem ser parciais. */
export function agruparPorDia(inicios: readonly string[]): DiaDaGrade[] {
  const dias: DiaDaGrade[] = [];
  inicios.forEach((iso, i) => {
    const data = dataLocalIso(iso);
    const ultimo = dias.at(-1);
    if (ultimo?.data === data) ultimo.indices.push(i);
    else dias.push({ data, rotulo: rotuloDia(iso), indices: [i] });
  });
  return dias;
}

// ---------------------------------------------------------------- textos

/** Como o servidor fala das regiões: "região Centro" (para não confundir com o bairro Centro) e "Zona Leste". */
export function rotuloRegiao(regiao: Regiao): string {
  return regiao === 'Centro' ? 'Região Centro' : `Zona ${regiao}`;
}

/** "×2,15" — quanto o fator multiplica a taxa. */
export function textoPeso(peso: number): string {
  return `×${peso.toLocaleString('pt-BR', { maximumFractionDigits: peso >= 10 ? 0 : 2 })}`;
}

/** Ocorrências esperadas: "0,4", "6,9", "28" (casas pelo tamanho; o servidor manda até 2 casas). */
export function textoOcorrencias(n: number): string {
  const casas = n >= 20 ? 0 : 1;
  return n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

/** "0,4 ocorrência esperada", "6,9 ocorrências esperadas" (abaixo de 2, singular, como manda a norma). */
export function ocorrenciasEsperadas(n: number): string {
  return `${textoOcorrencias(n)} ${n < 2 ? 'ocorrência esperada' : 'ocorrências esperadas'}`;
}
