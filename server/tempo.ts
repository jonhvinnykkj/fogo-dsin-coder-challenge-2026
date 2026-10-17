// Utilitários de data. No banco: ISO 8601 UTC; datas de calendário: YYYY-MM-DD.
const MS_DIA = 86_400_000;
const DESLOCAMENTO_SAO_PAULO_MS = -3 * 3_600_000; // Brasil sem horário de verão desde 2019

/** Data de calendário (YYYY-MM-DD) em America/Sao_Paulo. */
export function dataLocal(quando: Date): string {
  return new Date(quando.getTime() + DESLOCAMENTO_SAO_PAULO_MS).toISOString().slice(0, 10);
}

export interface PartesLocais {
  /** YYYY-MM-DD em America/Sao_Paulo. */
  data: string;
  hora: number;
  minuto: number;
  /** 0 = domingo … 6 = sábado. */
  diaSemana: number;
}

/** Data, hora, minuto e dia da semana em America/Sao_Paulo. */
export function partesLocais(quando: Date): PartesLocais {
  const d = new Date(quando.getTime() + DESLOCAMENTO_SAO_PAULO_MS);
  return { data: d.toISOString().slice(0, 10), hora: d.getUTCHours(), minuto: d.getUTCMinutes(), diaSemana: d.getUTCDay() };
}

/** Instante (UTC) de uma data local YYYY-MM-DD às `hora`:`minuto` em America/Sao_Paulo. */
export function instanteLocal(data: string, hora = 0, minuto = 0): Date {
  return new Date(Date.parse(`${data}T00:00:00.000Z`) - DESLOCAMENTO_SAO_PAULO_MS + (hora * 60 + minuto) * 60_000);
}

/** Início da hora UTC (minutos, segundos e milissegundos zerados). */
export function inicioDaHora(quando: Date): Date {
  return new Date(Math.floor(quando.getTime() / 3_600_000) * 3_600_000);
}

/** Soma dias a uma data YYYY-MM-DD (ou a qualquer ISO; usa só a parte da data). */
export function somarDias(data: string, dias: number): string {
  return new Date(Date.parse(`${data.slice(0, 10)}T00:00:00.000Z`) + dias * MS_DIA).toISOString().slice(0, 10);
}
