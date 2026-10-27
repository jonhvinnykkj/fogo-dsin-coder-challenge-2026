// Seletor de ponto: clicar marca o ponto sem mexer na vista; só a coordenada digitada leva o mapa até ela.
import { act, render } from '@testing-library/react';
import L from 'leaflet';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { textoDeCoordenada } from '../util/numeros';
import { SeletorPontoMapa } from './SeletorPontoMapa';

/** Faz o mesmo que o formulário: guarda o ponto com a precisão do campo (6 casas) e devolve ao seletor. */
function Formulario({ inicial }: { inicial?: { lat: number; lng: number } }) {
  const [ponto, setPonto] = useState<{ lat?: number; lng?: number }>(inicial ?? {});
  return (
    <>
      <SeletorPontoMapa lat={ponto.lat} lng={ponto.lng} onEscolher={(lat, lng) => setPonto({ lat: Number(textoDeCoordenada(lat).replace(',', '.')), lng: Number(textoDeCoordenada(lng).replace(',', '.')) })} />
      <button type="button" onClick={() => setPonto({ lat: -22.25, lng: -49.9 })}>digitar</button>
    </>
  );
}

afterEach(() => vi.restoreAllMocks());

function espiar() {
  const chamadas: Parameters<L.Map['setView']>[] = [];
  let mapa!: L.Map;
  const original = L.Map.prototype.setView;
  vi.spyOn(L.Map.prototype, 'setView').mockImplementation(function (this: L.Map, ...args) {
    mapa = this;
    chamadas.push(args);
    return original.apply(this, args);
  });
  return { chamadas, mapa: () => mapa };
}

describe('SeletorPontoMapa', () => {
  it('clicar no mapa não recentra nem muda o zoom (mesmo com o clique voltando arredondado)', () => {
    const { chamadas, mapa } = espiar();
    render(<Formulario inicial={{ lat: -22.2138, lng: -49.9508 }} />);
    const aposMontar = chamadas.length;
    expect(aposMontar).toBeGreaterThan(0);

    act(() => { mapa().fire('click', { latlng: L.latLng(-22.2185041234567, -49.9440191234567) }); });
    act(() => { mapa().fire('click', { latlng: L.latLng(-22.2185041234567, -49.9440191234567) }); });
    expect(chamadas).toHaveLength(aposMontar);
  });

  it('a coordenada digitada leva o mapa até o ponto, sem animar quando o zoom muda', () => {
    const { chamadas, mapa } = espiar();
    const { getByText } = render(<Formulario />); // sem ponto: o mapa abre no zoom da cidade
    const aposMontar = chamadas.length;
    act(() => { getByText('digitar').click(); });
    const [centro, zoom, opcoes] = chamadas[aposMontar]!; // a primeira chamada é a do seletor (as seguintes são do próprio Leaflet)
    expect(centro).toEqual([-22.25, -49.9]);
    expect(zoom).toBe(16);
    expect(opcoes).toMatchObject({ animate: false }); // o zoom animado do Leaflet termina num temporizador que estoura se a tela fecha antes
    expect(mapa().getZoom()).toBe(16);
  });
});
