// Taxas e sorteios do simulador, em funções pequenas e sem estado (o simulador só as chama).
//
// A cidade ao vivo usa as MESMAS taxas do histórico (perfil de hora e dia × bairro × chuva), multiplicadas por um fator
// de demonstração: no mundo real um acidente aparece a cada ~40 min, o que deixaria a tela parada para quem avalia.
// A velocidade (1×, 10×, 60×) multiplica de novo, e encurta o tempo de reparo e de encerramento das ocorrências.
import type { TipoOcorrencia } from '../../shared/dominio';
import type { Ocorrencia } from '../../shared/modelos';
import type { TipoEquipamentoId } from '../../shared/tipos-equipamento';
import { FALHAS_POR_DIA, FATOR_FURTO_BAIRRO_QUENTE, FURTOS_PATINETE_POR_DIA } from '../semente/historico';
import { PERFIL_PATINETE, type TipoDia } from '../semente/perfis';

/**
 * Ocorrências ao vivo: múltiplo da taxa histórica. Dá ~1,7 por minuto na cidade inteira a 1×, das quais uma em cada quatro vira alerta.
 * Com 24 (valor antigo) e ocorrências de 10 a 40 min, mesmo fechando tudo sobravam ~100 alertas abertos ao mesmo tempo (taxa × duração);
 * com 8 e 5 a 20 min ficam ~20 a 30, que a Central consegue mostrar como "o que está acontecendo agora".
 */
export const FATOR_DEMO_OCORRENCIAS = 8;
type TipoOrigem = Ocorrencia['origem'];
/** Quanto dura uma ocorrência ao vivo, em minutos sorteados (antes do fator do tipo e da velocidade). */
export const DURACAO_OCORRENCIA_MIN = { minimo: 5, maximo: 20 } as const;
/** Falhas de equipamento: múltiplo da taxa histórica (~1 a cada 4 min a 1×). */
export const FATOR_DEMO_FALHAS = 150;
/** Furtos de patinete: múltiplo da taxa histórica (~1 por hora a 1×). */
export const FATOR_DEMO_FURTOS = 40;
/** Fração das falhas em que o equipamento para de transmitir (vira "sem sinal" em 15 min). */
export const CHANCE_FALHA_MUDA = 0.25;

/** Probabilidade de o equipamento falhar neste tick. `fatorRisco` = modelo × idade × manutenção (`fatorRiscoEquipamento`). */
export function chanceDeFalha(tipo: TipoEquipamentoId, fatorRisco: number, segundos: number, velocidade: number): number {
  return Math.min(1, ((FALHAS_POR_DIA[tipo] * fatorRisco) / 86_400) * segundos * FATOR_DEMO_FALHAS * velocidade);
}

/** Probabilidade de um patinete ser furtado neste tick (3× nos bairros quentes). */
export function chanceDeFurto(bairroQuente: boolean, segundos: number, velocidade: number): number {
  const porDia = FURTOS_PATINETE_POR_DIA * (bairroQuente ? FATOR_FURTO_BAIRRO_QUENTE : 1);
  return Math.min(1, (porDia / 86_400) * segundos * FATOR_DEMO_FURTOS * velocidade);
}

/** Parte da hora que um tick representa, já com demonstração e velocidade: é o `escala` do gerador de ocorrências. */
export function escalaDeOcorrencias(segundos: number, velocidade: number): number {
  return (segundos / 3600) * FATOR_DEMO_OCORRENCIAS * velocidade;
}

/** Fração dos patinetes em uso agora (perfil da hora × movimento do local, menos na chuva). */
export function fracaoDePatinetesEmUso(tipoDoDia: TipoDia, hora: number, escalaLocal: number, chuva: boolean): number {
  return Math.min(0.9, 0.16 * PERFIL_PATINETE[tipoDoDia][hora]! * escalaLocal * (chuva ? 0.45 : 1));
}

/**
 * Quanto a ocorrência conta no índice das regiões da Central (gravado nela, em `peso`). Ao vivo o simulador gera
 * FATOR_DEMO_OCORRENCIAS (8) vezes o ritmo real, × a velocidade da tela; cada ocorrência ao vivo pesa o inverso disso, e o
 * índice mede a cidade no ritmo real em qualquer velocidade. Ex.: a 60×, 1 ÷ (8 × 60) = 1/480. Histórico e eventos
 * injetados pelo botão contam inteiros (peso 1).
 */
export function pesoNoIndice(origem: TipoOrigem, velocidade: number): number {
  return origem === 'tempo_real' ? 1 / (FATOR_DEMO_OCORRENCIAS * velocidade) : 1;
}

/** Quanto dura uma ocorrência ao vivo antes de ser encerrada (a 60× passa depressa, para a tela mostrar o ciclo todo). */
export function duracaoDaOcorrenciaMs(tipo: TipoOcorrencia, minutosSorteados: number, velocidade: number): number {
  const fator = tipo === 'alagamento' ? 2 : tipo === 'acidente' ? 1.5 : 1;
  return Math.max(15_000, (minutosSorteados * fator * 60_000) / velocidade);
}

/** Velocidade de deslocamento em m/s. */
export const VELOCIDADE_MS: Record<'patinete' | 'veiculo' | 'agente', number> = { patinete: 4.5, veiculo: 8, agente: 3 };

export const DESCRICOES_INJETADAS: Record<'acidente' | 'congestionamento' | 'alagamento', readonly string[]> = {
  // Injetado = gravidade máxima (4): descrições de acidente grave.
  acidente: ['Colisão grave com vítima presa nas ferragens', 'Atropelamento com vítima grave', 'Capotamento com feridos', 'Colisão entre carro e moto com vítima grave'],
  congestionamento: ['Trânsito parado por obra na pista', 'Fila longa após semáforo apagado', 'Via bloqueada por veículo quebrado'],
  alagamento: ['Água acumulada na pista após chuva forte'],
};
