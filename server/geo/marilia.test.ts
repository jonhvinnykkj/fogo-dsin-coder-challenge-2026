import { describe, expect, it } from 'vitest';
import { dentroDeMarilia } from '../../shared/geo';
import { carregarGeo } from './marilia';

function mulberry32(a: number) {
  return {
    num() {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

describe('geografia de Marília', () => {
  const geo = carregarGeo();

  it('carrega bairros com polígonos de pelo menos 3 vértices', () => {
    expect(geo.bairros.length).toBeGreaterThanOrEqual(30);
    for (const b of geo.bairros) expect(b.poligono.coordinates[0]!.length).toBeGreaterThanOrEqual(4);
  });

  it('bairroDoPonto devolve o índice do próprio bairro no centro dele', () => {
    geo.bairros.forEach((b, i) => expect(geo.bairroDoPonto(b.lat, b.lng)).toBe(i));
  });

  it('pontoAleatorioNaRua é determinístico e fica dentro de Marília', () => {
    const a = Array.from({ length: 30 }, (() => { const r = mulberry32(7); return () => geo.pontoAleatorioNaRua(r); })());
    const b = Array.from({ length: 30 }, (() => { const r = mulberry32(7); return () => geo.pontoAleatorioNaRua(r); })());
    expect(a).toEqual(b);
    for (const p of a) {
      expect(dentroDeMarilia(p.lat, p.lng)).toBe(true);
      expect(p.logradouro.length).toBeGreaterThan(0);
    }
  });

  it('com bairroIndice escolhe ponto cujo bairro mais próximo é esse', () => {
    const r = mulberry32(3);
    for (const i of [0, 10, 40]) {
      for (let k = 0; k < 10; k++) {
        const p = geo.pontoAleatorioNaRua(r, i);
        expect(geo.bairroDoPonto(p.lat, p.lng)).toBe(i);
      }
    }
  });

  it('polígonos dos bairros ficam dentro do limite (centroide dentro)', () => {
    for (const b of geo.bairros) expect(dentroDeMarilia(b.lat, b.lng)).toBe(true);
  });
});
