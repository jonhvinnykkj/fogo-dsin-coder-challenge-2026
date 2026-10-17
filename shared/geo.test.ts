import { describe, expect, it } from 'vitest';
import { LIMITE_MARILIA, dentroDeMarilia, distanciaMetros, pontoNoPoligono } from './geo';

describe('geo', () => {
  it('pontoNoPoligono recebe lat/lng mas o anel é [lng, lat]', () => {
    const quadrado = { type: 'Polygon' as const, coordinates: [[[-50, -23], [-49, -23], [-49, -22], [-50, -22], [-50, -23]]] };
    expect(pontoNoPoligono(-22.5, -49.5, quadrado)).toBe(true);
    expect(pontoNoPoligono(-49.5, -22.5, quadrado)).toBe(false); // trocado
    expect(pontoNoPoligono(-21, -49.5, quadrado)).toBe(false);
  });
  it('centro de Marília dentro, São Paulo fora', () => {
    expect(dentroDeMarilia(-22.2139, -49.9458)).toBe(true);
    expect(dentroDeMarilia(-23.55, -46.63)).toBe(false);
    expect(LIMITE_MARILIA.type).toBe('Polygon');
  });
  it('distância em metros', () => {
    const d = distanciaMetros({ lat: -22.2, lng: -49.9 }, { lat: -22.2, lng: -49.89 });
    expect(d).toBeGreaterThan(1000);
    expect(d).toBeLessThan(1100);
  });
});
