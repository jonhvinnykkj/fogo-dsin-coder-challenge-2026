import limite from './limite-marilia.json';

/** GeoJSON Polygon: anéis de pares [lng, lat]. */
export interface Poligono {
  type: 'Polygon';
  coordinates: number[][][];
}

export interface Ponto {
  lat: number;
  lng: number;
}

export const LIMITE_MARILIA = limite as Poligono;

function pontoNoAnel(lat: number, lng: number, anel: number[][]): boolean {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xi, yi] = anel[i]!;
    const [xj, yj] = anel[j]!;
    if (yi! > lat !== yj! > lat && lng < ((xj! - xi!) * (lat - yi!)) / (yj! - yi!) + xi!) dentro = !dentro;
  }
  return dentro;
}

/** Recebe lat/lng; os anéis do GeoJSON são [lng, lat]. O primeiro anel é o externo, os demais são buracos. */
export function pontoNoPoligono(lat: number, lng: number, poligono: Poligono): boolean {
  const [externo, ...buracos] = poligono.coordinates;
  if (!externo || !pontoNoAnel(lat, lng, externo)) return false;
  return !buracos.some((b) => pontoNoAnel(lat, lng, b));
}

export function dentroDeMarilia(lat: number, lng: number): boolean {
  return pontoNoPoligono(lat, lng, LIMITE_MARILIA);
}

/** Distância em metros (haversine). */
export function distanciaMetros(a: Ponto, b: Ponto): number {
  const R = 6371008.8;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
