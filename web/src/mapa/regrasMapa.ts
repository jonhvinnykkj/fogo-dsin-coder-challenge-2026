// Regras puras do mapa da Central (sem Leaflet): testáveis e iguais para todas as camadas.
import { COR_CRITICIDADE, COR_NIVEL_ATENCAO, type Criticidade, type SituacaoEquipamento } from '../../../shared/dominio';
import type { NivelAtencao } from '../../../shared/modelos';

/** Gravidade de cada situação para o agrupamento: o grupo ganha a cor da pior. Desativado e não instalado são escolhas, não problemas. */
const GRAVIDADE_SITUACAO: Record<SituacaoEquipamento, number> = {
  furtado: 5,
  mau_funcionamento: 4,
  em_manutencao: 3,
  operacional: 2,
  desativado: 1,
  nao_instalado: 0,
};

export function piorSituacao(situacoes: Iterable<SituacaoEquipamento>): SituacaoEquipamento {
  let pior: SituacaoEquipamento | undefined;
  for (const s of situacoes) if (pior === undefined || GRAVIDADE_SITUACAO[s] > GRAVIDADE_SITUACAO[pior]) pior = s;
  return pior ?? 'operacional';
}

export interface PinturaBairro {
  fillColor: string;
  fillOpacity: number;
  color: string;
  opacity: number;
  weight: number;
}

/** Contorno suave padrão (grafite translúcido serve nos dois temas: o mapa escuro é invertido, não preto). */
const CONTORNO_SUAVE = '#55555A';

/**
 * Pintura de um bairro: o preenchimento vem do nível de atenção calculado pelo servidor (normal fica transparente,
 * para a cidade calma não virar uma colcha); o contorno ganha a cor do alerta alto ou crítico aberto ali, que aparece
 * na hora em que o alerta chega (o índice do bairro só muda na próxima leitura das regiões).
 * A Central só passa alertas críticos (os altos são muitos e já pesam no índice); a regra aceita os dois.
 */
export function pinturaDoBairro(nivel: NivelAtencao | undefined, alertaAberto: Extract<Criticidade, 'critica' | 'alta'> | undefined): PinturaBairro {
  const preenchimento =
    nivel === 'critico' ? { fillColor: COR_NIVEL_ATENCAO.critico, fillOpacity: 0.34 }
      : nivel === 'atencao' ? { fillColor: COR_NIVEL_ATENCAO.atencao, fillOpacity: 0.3 }
        : { fillColor: COR_NIVEL_ATENCAO.atencao, fillOpacity: 0 };
  const contorno = alertaAberto
    ? { color: COR_CRITICIDADE[alertaAberto], opacity: 0.95, weight: alertaAberto === 'critica' ? 3 : 2.5 }
    : { color: CONTORNO_SUAVE, opacity: 0.32, weight: 1 };
  return { ...preenchimento, ...contorno };
}

/** Peso de uma ocorrência no mapa de calor: gravidade 1 a 4 → 0,25 a 1. */
export function pesoDaOcorrencia(gravidade: 1 | 2 | 3 | 4): number {
  return gravidade / 4;
}

export interface ComMarcador {
  id: number;
  lat: number;
  lng: number;
  situacao: string;
}

export interface DiferencaMarcadores<T extends ComMarcador> {
  incluidos: T[];
  removidos: number[];
  movidos: T[];
  /** Situação mudou (trocar o ícone e recalcular a cor do grupo). */
  mudados: T[];
}

/**
 * Compara o que está desenhado com a lista nova do cache. O tempo real devolve o MESMO objeto para quem não mudou,
 * então a comparação por identidade descarta a maioria sem olhar campo nenhum.
 */
export function compararMarcadores<T extends ComMarcador>(anteriores: ReadonlyMap<number, T>, novos: readonly T[]): DiferencaMarcadores<T> {
  const r: DiferencaMarcadores<T> = { incluidos: [], removidos: [], movidos: [], mudados: [] };
  const vistos = new Set<number>();
  for (const item of novos) {
    vistos.add(item.id);
    const antes = anteriores.get(item.id);
    if (!antes) {
      r.incluidos.push(item);
      continue;
    }
    if (antes === item) continue;
    if (antes.lat !== item.lat || antes.lng !== item.lng) r.movidos.push(item);
    if (antes.situacao !== item.situacao) r.mudados.push(item);
  }
  for (const id of anteriores.keys()) if (!vistos.has(id)) r.removidos.push(id);
  return r;
}
