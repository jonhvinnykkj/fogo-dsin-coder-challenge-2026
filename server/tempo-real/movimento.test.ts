import { describe, expect, it } from 'vitest';
import { dentroDeMarilia, distanciaMetros } from '../../shared/geo';
import { carregarGeo } from '../geo/marilia';
import { criarRng } from '../semente/aleatorio';
import { andar, escolherAlvoPerto, pontoForaDeMarilia, type Movel } from './movimento';
import { chanceDeFalha, chanceDeFurto, duracaoDaOcorrenciaMs, escalaDeOcorrencias } from './eventos-simulados';

const geo = carregarGeo();
const indice = geo.bairros.findIndex((b) => b.nome === 'Centro');

describe('movimento', () => {
  it('anda a distância pedida em saltos de rua em rua e nunca sai de Marília', () => {
    const rng = criarRng(1);
    const p = geo.pontoAleatorioNaRua(rng, indice);
    const movel: Movel = { lat: p.lat, lng: p.lng };
    let percorrido = 0;
    for (let i = 0; i < 300; i++) {
      percorrido += andar(movel, 25, (de) => escolherAlvoPerto(geo, rng, indice, de));
      expect(dentroDeMarilia(movel.lat, movel.lng)).toBe(true);
    }
    // 300 passos de 25 m = 7,5 km; em linha reta entre alvos, o deslocamento acumulado fica perto disso.
    expect(percorrido).toBeGreaterThan(5500);
    expect(percorrido).toBeLessThan(7600);
  });

  it('com alvo fixo chega e para', () => {
    const rng = criarRng(2);
    const a = geo.pontoAleatorioNaRua(rng, indice);
    const b = escolherAlvoPerto(geo, rng, indice, a, 400);
    const movel: Movel = { lat: a.lat, lng: a.lng, alvo: b };
    andar(movel, 5000, () => b);
    expect(distanciaMetros(movel, b)).toBeLessThan(1);
  });

  it('pontoForaDeMarilia devolve um ponto fora do município, a mais de 10 km', () => {
    const rng = criarRng(3);
    const de = geo.pontoAleatorioNaRua(rng, indice);
    for (let i = 0; i < 20; i++) {
      const fora = pontoForaDeMarilia(de, rng);
      expect(dentroDeMarilia(fora.lat, fora.lng)).toBe(false);
      expect(distanciaMetros(de, fora)).toBeGreaterThan(10_000);
    }
  });
});

describe('taxas do simulador', () => {
  it('a velocidade multiplica as chances e as ocorrências', () => {
    expect(chanceDeFalha('radar', 1, 2, 60)).toBeCloseTo(chanceDeFalha('radar', 1, 2, 1) * 60, 10);
    expect(chanceDeFurto(true, 2, 10)).toBeCloseTo(chanceDeFurto(true, 2, 1) * 10, 10);
    expect(chanceDeFurto(true, 2, 1)).toBeCloseTo(chanceDeFurto(false, 2, 1) * 3, 10);
    expect(escalaDeOcorrencias(2, 60)).toBeCloseTo(escalaDeOcorrencias(2, 1) * 60, 10);
  });

  it('ocorrência dura menos a 60× mas nunca menos de 15 s', () => {
    expect(duracaoDaOcorrenciaMs('acidente', 30, 1)).toBe(45 * 60_000);
    expect(duracaoDaOcorrenciaMs('acidente', 30, 60)).toBe(45_000);
    expect(duracaoDaOcorrenciaMs('infracao', 10, 60)).toBe(15_000);
  });
});
