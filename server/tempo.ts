// Utilitários de data. No banco: ISO 8601 UTC; datas de calendário: YYYY-MM-DD.
const MS_DIA = 86_400_000;
const DESLOCAMENTO_SAO_PAULO_MS = -3 * 3_600_000; // Brasil sem horário de verão desde 2019

/** Data de calendário (YYYY-MM-DD) em America/Sao_Paulo. */
export function dataLocal(quando: Date): string {
  return new Date(quando.getTime() + DESLOCAMENTO_SAO_PAULO_MS).toISOString().slice(0, 10);
}

/** Soma dias a uma data YYYY-MM-DD (ou a qualquer ISO; usa só a parte da data). */
export function somarDias(data: string, dias: number): string {
  return new Date(Date.parse(`${data.slice(0, 10)}T00:00:00.000Z`) + dias * MS_DIA).toISOString().slice(0, 10);
}
