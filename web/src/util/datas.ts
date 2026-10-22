// Datas da interface. Datas de calendário ("2026-10-20", sem hora) NÃO passam por `new Date`, que as leria como
// meia-noite UTC e mostraria o dia anterior no fuso de São Paulo.
import { formatarDataHora } from '../../../shared/formato';

/** "2026-10-20" → "20/10/2026". Texto com hora ("2026-10-20T14:00:00Z") vira data e hora de São Paulo. */
export function formatarDia(valor: string): string {
  if (valor.length > 10) return formatarDataHora(valor);
  const [a, m, d] = valor.split('-');
  return a && m && d ? `${d}/${m}/${a}` : valor;
}

const fmtDiaSP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Hoje em São Paulo, como "aaaa-mm-dd" (o mesmo formato do campo de data). */
export function hojeIso(agora: Date = new Date()): string {
  return fmtDiaSP.format(agora);
}

const fmtHoraSP = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23' });
const fmtDiaMesSP = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });

/** Rótulo do eixo de horas no fuso de São Paulo: "14h"; na virada do dia, "18/10". */
export function rotuloHora(iso: string): string {
  const d = new Date(iso);
  const hora = fmtHoraSP.format(d);
  return hora === '00' ? fmtDiaMesSP.format(d) : `${hora}h`;
}

/** Hora cheia em São Paulo (0 a 23) e dia/mês de um instante, para os rótulos do eixo da telemetria. */
export function horaEDia(iso: string): { hora: number; minuto: number; dia: string } {
  const d = new Date(iso);
  return { hora: Number(fmtHoraSP.format(d)), minuto: Number(new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', minute: '2-digit' }).format(d)), dia: fmtDiaMesSP.format(d) };
}
