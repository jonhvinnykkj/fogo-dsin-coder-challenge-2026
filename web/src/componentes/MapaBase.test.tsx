// Balões do mapa fecham quando o mapa começa a se mover (voo, zoom, arrasto).
import { render } from '@testing-library/react';
import L from 'leaflet';
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import { describe, expect, it } from 'vitest';
import { FALHAS_PARA_AVISAR, JANELA_FALHAS_MS, MapaBase, registrarFalhaDeBloco } from './MapaBase';

function Preparar({ aoPronto }: { aoPronto: (mapa: L.Map) => void }) {
  const mapa = useMap();
  useEffect(() => aoPronto(mapa), [mapa, aoPronto]);
  return null;
}

describe('MapaBase', () => {
  it.each(['movestart', 'zoomstart'])('fecha o balão aberto em %s', (evento) => {
    let mapa!: L.Map;
    render(<MapaBase mostrarLimite={false}><Preparar aoPronto={(m) => { mapa = m; }} /></MapaBase>);
    const marcador = L.marker([-22.2138, -49.9508]).bindTooltip('Bairro').addTo(mapa);
    marcador.openTooltip();
    expect(marcador.isTooltipOpen()).toBe(true);
    mapa.fire(evento);
    expect(marcador.isTooltipOpen()).toBe(false);
  });
});

describe('aviso de mapa sem conexão', () => {
  it('dois blocos que falham não bastam', () => {
    let falhas: number[] = [];
    let aviso = false;
    for (const t of [1000, 1100]) ({ falhas, avisar: aviso } = registrarFalhaDeBloco(falhas, t));
    expect(aviso).toBe(false);
  });

  it(`uma sequência de ${FALHAS_PARA_AVISAR} falhas dentro da janela avisa`, () => {
    let falhas: number[] = [];
    let aviso = false;
    for (let i = 0; i < FALHAS_PARA_AVISAR; i++) ({ falhas, avisar: aviso } = registrarFalhaDeBloco(falhas, 1000 + i * 100));
    expect(aviso).toBe(true);
  });

  it('falhas espalhadas por mais que a janela não se acumulam', () => {
    let falhas: number[] = [];
    let aviso = false;
    for (let i = 0; i < FALHAS_PARA_AVISAR * 2; i++) ({ falhas, avisar: aviso } = registrarFalhaDeBloco(falhas, i * (JANELA_FALHAS_MS + 1)));
    expect(aviso).toBe(false);
  });
});
