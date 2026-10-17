// Formatadores pt-BR. Datas sempre no fuso America/Sao_Paulo.
const FUSO = 'America/Sao_Paulo';

export function formatarNumero(n: number, casas = 0): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

export function formatarPct(n: number): string {
  return `${formatarNumero(n, 1)}%`;
}

const fmtData = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtHora = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

export function formatarData(iso: string): string {
  return fmtData.format(new Date(iso));
}

export function formatarDataHora(iso: string): string {
  const d = new Date(iso);
  return `${fmtData.format(d)} ${fmtHora.format(d)}`;
}

export function formatarRelativo(iso: string, agora: Date): string {
  const seg = Math.round((agora.getTime() - new Date(iso).getTime()) / 1000);
  if (seg < 45) return 'agora';
  const min = Math.round(seg / 60);
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const dias = Math.round(h / 24);
  return dias === 1 ? 'há 1 dia' : `há ${dias} dias`;
}
