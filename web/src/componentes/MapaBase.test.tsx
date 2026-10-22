// Balões do mapa fecham quando o mapa começa a se mover (voo, zoom, arrasto).
import { render } from '@testing-library/react';
import L from 'leaflet';
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import { describe, expect, it } from 'vitest';
import { MapaBase } from './MapaBase';

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
