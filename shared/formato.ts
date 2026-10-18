// Formatadores pt-BR. Datas sempre no fuso America/Sao_Paulo.
const FUSO = 'America/Sao_Paulo';

/** O F.O.G.O. atende um único município: cidade e UF do endereço são sempre estas. */
export const CIDADE = 'Marília';
export const UF = 'SP';
export const MSG_CIDADE_UF = 'O F.O.G.O. atende só Marília/SP: a cidade e a UF precisam ser Marília/SP';

/** "Marília/SP" (ou outra cidade/UF, como a que o ViaCEP devolve). */
export function formatarCidadeUf(cidade: string = CIDADE, uf: string = UF): string {
  return `${cidade}/${uf.toUpperCase()}`;
}

export function formatarNumero(n: number, casas = 0): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

export function formatarPct(n: number): string {
  return `${formatarNumero(n, 1)}%`;
}

/**
 * Chance de 0 a 1 como texto ("13%"). O modelo nunca dá certeza: nas pontas fica "mais de 99%" e "menos de 1%", em vez de
 * "100%" ou "0%" (com λ alto a probabilidade guardada chega a 0,9999). Lê bem na frase: "mais de 99% de chance de falhar".
 */
export function formatarChance(p: number): string {
  if (p >= 0.995) return 'mais de 99%';
  if (p < 0.005) return 'menos de 1%';
  return `${formatarNumero(p * 100, 0)}%`;
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

/** "Rua X, referência — Bairro, Marília/SP — CEP 17500-000". Resposta antiga sem cidade/UF cai em Marília/SP. */
export function formatarEndereco(e: { logradouro: string; referencia?: string; bairroNome: string; cep: string; cidade?: string; uf?: string }): string {
  const rua = e.referencia ? `${e.logradouro}, ${e.referencia}` : e.logradouro;
  return `${rua} — ${e.bairroNome}, ${formatarCidadeUf(e.cidade, e.uf)} — CEP ${e.cep}`;
}
