// Movimento dos veículos e agentes: pontos que andam de rua em rua.
//
// O mapa de ruas de Marília (`geo.pontoAleatorioNaRua`) sorteia pontos que estão em ruas de verdade. Para andar, o móvel
// escolhe um ponto de rua PERTO (poucas centenas de metros) e caminha em linha reta até lá; chegando, escolhe o próximo.
// Saltos curtos de uma rua à outra desenham um caminho que acompanha o traçado das ruas sem precisar de um grafo viário.
import { dentroDeMarilia, distanciaMetros, type Ponto } from '../../shared/geo';
import type { GeoMarilia } from '../geo/marilia';

export interface Rng {
  num(): number;
}

export interface Movel extends Ponto {
  /** Ponto de rua para onde está indo; `undefined` = precisa escolher outro. */
  alvo?: Ponto | undefined;
}

const DISTANCIA_MINIMA_SALTO_M = 40;
const SORTEIOS_POR_ALVO = 8;
const MAX_SALTOS_POR_PASSO = 12;

/** Dos pontos de rua sorteados no bairro, o mais perto de `de` que fique a pelo menos 40 m (senão, o mais longe achado). */
export function escolherAlvoPerto(geo: GeoMarilia, rng: Rng, bairroIndice: number, de: Ponto, raioMaxM = 450): Ponto {
  let melhor: Ponto | undefined;
  let melhorDist = Infinity;
  let maisLonge: Ponto | undefined;
  let maisLongeDist = -1;
  for (let i = 0; i < SORTEIOS_POR_ALVO; i++) {
    const p = geo.pontoAleatorioNaRua(rng, bairroIndice);
    const d = distanciaMetros(de, p);
    if (d > maisLongeDist) { maisLonge = p; maisLongeDist = d; }
    if (d >= DISTANCIA_MINIMA_SALTO_M && d <= raioMaxM && d < melhorDist) { melhor = p; melhorDist = d; }
  }
  const p = melhor ?? maisLonge!;
  return { lat: p.lat, lng: p.lng };
}

/**
 * Anda `metros` em direção ao alvo, escolhendo um novo (`escolherAlvo`) cada vez que chega. Nunca sai de Marília:
 * se o passo cair fora do município, o móvel fica onde estava. Devolve a distância realmente percorrida.
 */
export function andar(movel: Movel, metros: number, escolherAlvo: (de: Ponto) => Ponto): number {
  const inicio = { lat: movel.lat, lng: movel.lng };
  let restante = metros;
  for (let salto = 0; salto < MAX_SALTOS_POR_PASSO && restante > 0.5; salto++) {
    movel.alvo ??= escolherAlvo(movel);
    const d = distanciaMetros(movel, movel.alvo);
    if (d <= restante) {
      movel.lat = movel.alvo.lat;
      movel.lng = movel.alvo.lng;
      restante -= d;
      movel.alvo = undefined;
      if (d < 0.5) break; // já estava no alvo e o sorteio devolveu o mesmo ponto
    } else {
      const f = restante / d;
      movel.lat += (movel.alvo.lat - movel.lat) * f;
      movel.lng += (movel.alvo.lng - movel.lng) * f;
      restante = 0;
    }
  }
  if (!dentroDeMarilia(movel.lat, movel.lng)) {
    movel.lat = inicio.lat;
    movel.lng = inicio.lng;
    movel.alvo = undefined;
    return 0;
  }
  movel.lat = Math.round(movel.lat * 1e6) / 1e6;
  movel.lng = Math.round(movel.lng * 1e6) / 1e6;
  return distanciaMetros(inicio, movel);
}

/** Um ponto fora de Marília a ~10–15 km de `de` (para o patinete "levado" do furto). */
export function pontoForaDeMarilia(de: Ponto, rng: Rng): Ponto {
  const base = rng.num() * 2 * Math.PI;
  for (let volta = 0; volta < 8; volta++) {
    const angulo = base + (volta * Math.PI) / 4;
    const graus = 0.11 + 0.03 * rng.num(); // ≈ 12 a 15 km
    const p = { lat: Math.round((de.lat + graus * Math.sin(angulo)) * 1e6) / 1e6, lng: Math.round((de.lng + graus * Math.cos(angulo)) * 1e6) / 1e6 };
    if (!dentroDeMarilia(p.lat, p.lng)) return p;
  }
  return { lat: de.lat + 1, lng: de.lng };
}
