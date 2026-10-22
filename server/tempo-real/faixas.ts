// Faixas aceitas para o que um dispositivo manda em POST /api/telemetria. A ingestão soma por hora e tira médias: um
// 1e308 vira Infinity na soma (e `null` no JSON), e um "nível de água" de 1e9 estraga o gráfico e a previsão. Aqui cada
// métrica tem um piso e um teto realistas; passar deles é 400 com a faixa na mensagem.
import { LIMITE_MARILIA, distanciaMetros, type Ponto } from '../../shared/geo';
import { METRICAS_POR_TIPO } from '../../shared/telemetria';
import { TIPOS_EQUIPAMENTO, type TipoEquipamentoId } from '../../shared/tipos-equipamento';
import { dadosInvalidos } from '../erros';

type Faixa = readonly [minimo: number, maximo: number];

const PERCENTUAL: Faixa = [0, 100];
const CONTAGEM: Faixa = [0, 100_000]; // por hora: o radar mais movimentado de Marília passa pouco de 2 mil
const VELOCIDADE: Faixa = [0, 300]; // km/h
const KM_RODADOS: Faixa = [0, 1000];

/** Faixa de cada métrica (chaves de `METRICAS_POR_TIPO`). Métrica que não está aqui cai em CONTAGEM (≥ 0, sem absurdo). */
export const FAIXA_DA_METRICA: Record<string, Faixa> = {
  online: PERCENTUAL,
  bateria: PERCENTUAL,
  emUso: PERCENTUAL, // booleano vira 100 ou 0
  velocidade: VELOCIDADE,
  velocidadeMedia: VELOCIDADE,
  kmRodados: KM_RODADOS,
  fps: [0, 240],
  nivelCm: [0, 1000],
};

export const faixaDaMetrica = (chave: string): Faixa => FAIXA_DA_METRICA[chave] ?? CONTAGEM;

/** Leitura com mais de 6 h de atraso não é leitura: o dispositivo ficou isolado e o histórico já seguiu em frente. */
export const PASSADO_TOLERADO_MS = 6 * 60 * 60_000;

/** Raio, a partir do centro do mapa de Marília, em que um veículo pode estar (a mancha urbana tem uns 12 km de ponta a ponta). */
const RAIO_VEICULO_M = 15_000;
/** Patinete furtado sai da cidade, e é essa posição que dispara o alerta: aceitamos mais longe só para ele. */
const RAIO_PATINETE_M = 200_000;

const CENTRO: Ponto = (() => {
  const pontos = LIMITE_MARILIA.coordinates[0]!;
  const lats = pontos.map((p) => p[1]!);
  const lngs = pontos.map((p) => p[0]!);
  return { lat: (Math.min(...lats) + Math.max(...lats)) / 2, lng: (Math.min(...lngs) + Math.max(...lngs)) / 2 };
})();

const movel = (tipo: TipoEquipamentoId) => TIPOS_EQUIPAMENTO.find((t) => t.id === tipo)?.movel ?? false;

export interface LeituraParaConferir {
  em?: string;
  metricas: Record<string, number | boolean>;
  lat?: number;
  lng?: number;
}

/**
 * Confere faixa de cada métrica, posição (só quem se move manda; dentro de Marília) e hora (não mais de 6 h atrás).
 * Lança 400 com um campo por problema. Chaves de métrica desconhecidas ficam para a ingestão, que explica quais existem.
 */
export function conferirLeitura(tipo: TipoEquipamentoId, leitura: LeituraParaConferir, agora: Date): void {
  const campos: Record<string, string> = {};
  const rotulos = new Map(METRICAS_POR_TIPO[tipo].map((m) => [m.chave, m]));

  for (const [chave, valor] of Object.entries(leitura.metricas)) {
    if (typeof valor !== 'number' || !rotulos.has(chave)) continue;
    const [min, max] = faixaDaMetrica(chave);
    if (!Number.isFinite(valor) || valor < min || valor > max) {
      campos[`metricas.${chave}`] = `"${chave}" deve estar entre ${min} e ${max} (${rotulos.get(chave)!.unidade})`;
    }
  }

  if (leitura.lat !== undefined && leitura.lng !== undefined) {
    if (!movel(tipo)) campos.lat = 'Este tipo de equipamento é fixo: não envie lat e lng (a posição é a do cadastro)';
    else {
      const raio = tipo === 'patinete' ? RAIO_PATINETE_M : RAIO_VEICULO_M;
      if (distanciaMetros(CENTRO, { lat: leitura.lat, lng: leitura.lng }) > raio) {
        campos.lat = tipo === 'patinete'
          ? 'Posição a mais de 200 km de Marília: confira lat e lng'
          : 'Posição fora de Marília: confira lat e lng';
      }
    }
  }

  if (leitura.em !== undefined) {
    const informada = Date.parse(leitura.em);
    if (agora.getTime() - informada > PASSADO_TOLERADO_MS) campos.em = 'Hora da leitura com mais de 6 horas de atraso: envie leituras recentes';
  }

  if (Object.keys(campos).length) throw dadosInvalidos(campos);
}
