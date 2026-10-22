// Contas do Boletim do dia sobre o que as rotas já devolvem: nada de número novo, só recorte e frase.
import type { NivelRiscoId } from '../../../shared/dominio';
import { formatarNumero } from '../../../shared/formato';
import type { PrevisaoRisco, RecomendacaoReforco, ResumoPreditivo } from '../../../shared/modelos';
import { faixaDeHoras, horaLocal, rotuloRegiao, textoPeso } from '../util/risco';

export interface BairroEmRisco {
  bairroId: number;
  nome: string;
  indice: number;
  nivel: NivelRiscoId;
  /** Soma das ocorrências esperadas nas próximas 24 h. */
  esperadas: number;
  /** Hora mais carregada do bairro (ISO); ausente se o bairro não tem células. */
  picoInicio?: string;
  /** Os fatores da hora de pico, como na tela de Previsões. */
  porque: string;
}

const SEM_FATOR = 'Segue o normal do bairro';

/**
 * Os `n` primeiros do índice de bairros do resumo (a mesma ordem da tela de Previsões). O "porquê" vem dos fatores da
 * hora de pico do bairro na previsão de risco; o servidor só detalha fatores que mudam a taxa em 10% ou mais.
 */
export function bairrosDeMaiorRisco(resumo: ResumoPreditivo, risco: PrevisaoRisco, n: number): BairroEmRisco[] {
  return resumo.indiceBairros.slice(0, n).map((b) => {
    const celulas = risco.celulas.filter((c) => c.bairroId === b.bairroId);
    const pico = celulas.reduce<(typeof celulas)[number] | undefined>((m, c) => (!m || c.taxaEsperada > m.taxaEsperada ? c : m), undefined);
    const esperadas = Math.round(celulas.reduce((s, c) => s + c.taxaEsperada, 0) * 100) / 100;
    return {
      bairroId: b.bairroId,
      nome: b.nome,
      indice: b.indice,
      nivel: b.nivel,
      esperadas,
      ...(pico && { picoInicio: pico.inicio }),
      porque: pico?.fatores.length ? pico.fatores.map((f) => `${f.nome} ${textoPeso(f.peso)}`).join(' · ') : SEM_FATOR,
    };
  });
}

/** Hora do pico em São Paulo: "22h". */
export const horaDoPico = (iso: string) => `${horaLocal(iso)}h`;

/** Dias de calendário entre duas datas "aaaa-mm-dd" (sem passar por fuso). */
function diasEntre(de: string, ate: string): number {
  const utc = (d: string) => {
    const [a, m, dia] = d.split('-').map(Number);
    return Date.UTC(a!, m! - 1, dia!);
  };
  return Math.round((utc(ate) - utc(de)) / 86_400_000);
}

/** "venceu há 34 dias", "hoje", "amanhã", "em 8 dias" — `hoje` é a data de São Paulo (hojeIso). */
export function prazoDaManutencao(data: string, hoje: string): string {
  const d = diasEntre(hoje, data);
  if (d < 0) return `venceu há ${-d} ${d === -1 ? 'dia' : 'dias'}`;
  if (d === 0) return 'hoje';
  if (d === 1) return 'amanhã';
  return `em ${d} dias`;
}

/** "Mover 1 agente da Zona Leste para a Região Centro, das 14h às 22h: carga de 6,4 para 5,6 ocorrências por agente". */
export function textoReforco(r: RecomendacaoReforco): string {
  const horas = Math.round((Date.parse(r.fim) - Date.parse(r.inicio)) / 3_600_000);
  const agentes = r.quantidade === 1 ? '1 agente' : `${r.quantidade} agentes`;
  const carga = (n: number) => formatarNumero(n, 1);
  return `Mover ${agentes} da ${rotuloRegiao(r.regiaoOrigem)} para a ${rotuloRegiao(r.regiaoDestino)}, das ${faixaDeHoras(r.inicio, horas)}: `
    + `carga de ${carga(r.cargaPorAgenteAntes)} para ${carga(r.cargaPorAgenteDepois)} ocorrências por agente`;
}
