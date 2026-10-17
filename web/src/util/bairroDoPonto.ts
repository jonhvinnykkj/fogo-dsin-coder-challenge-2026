import { pontoNoPoligono } from '../../../shared/geo';
import type { Bairro } from '../../../shared/modelos';

/** Bairro cujo polígono contém o ponto (ou `undefined` quando o ponto cai entre os polígonos). */
export function bairroDoPonto(lat: number, lng: number, bairros: Bairro[]): Bairro | undefined {
  return bairros.find((b) => pontoNoPoligono(lat, lng, b.poligono));
}
