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

/**
 * Distância em metros do ponto até a borda do polígono (anel externo), num plano local: bom para os poucos metros
 * que a divisa de um bairro precisa de tolerância. 0 se o ponto cai exatamente sobre a borda.
 */
export function distanciaAoBordoMetros(lat: number, lng: number, poligono: Poligono): number {
  const anel = poligono.coordinates[0];
  if (!anel || anel.length < 2) return Infinity;
  const M_POR_GRAU = 111320;
  const k = Math.cos((lat * Math.PI) / 180);
  let menor = Infinity;
  for (let i = 0; i + 1 < anel.length; i++) {
    // Coordenadas relativas ao ponto, em metros (x = leste, y = norte).
    const ax = (anel[i]![0]! - lng) * k * M_POR_GRAU;
    const ay = (anel[i]![1]! - lat) * M_POR_GRAU;
    const bx = (anel[i + 1]![0]! - lng) * k * M_POR_GRAU;
    const by = (anel[i + 1]![1]! - lat) * M_POR_GRAU;
    const dx = bx - ax;
    const dy = by - ay;
    const comp2 = dx * dx + dy * dy;
    const t = comp2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / comp2));
    menor = Math.min(menor, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return menor;
}

/** Tolerância na divisa entre bairros: o GPS e o desenho do polígono não coincidem ao metro. */
export const TOLERANCIA_DIVISA_METROS = 30;

/** O ponto está no polígono ou a até `tolerancia` metros da borda dele. */
export function pontoNoPoligonoComTolerancia(lat: number, lng: number, poligono: Poligono, tolerancia = TOLERANCIA_DIVISA_METROS): boolean {
  return pontoNoPoligono(lat, lng, poligono) || distanciaAoBordoMetros(lat, lng, poligono) <= tolerancia;
}
