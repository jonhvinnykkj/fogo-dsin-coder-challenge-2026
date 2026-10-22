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

describe('rede de volta', () => {
  it('recarrega os blocos no zoom inteiro, mesmo com o mapa em meio nível (redraw do Leaflet pediria /12.5/…)', () => {
    let mapa!: L.Map;
    const { unmount } = render(<MapaBase mostrarLimite={false}><Preparar aoPronto={(m) => { mapa = m; }} /></MapaBase>);
    // No jsdom o mapa tem tamanho zero e não aceita meio nível; a Central, na tela, fica em 12,5 (zoomSnap 0,5).
    const getZoom = mapa.getZoom;
    mapa.getZoom = () => 12.5;
    try {
      let blocos!: L.TileLayer;
      mapa.eachLayer((c) => { if (c instanceof L.TileLayer) blocos = c; });
      window.dispatchEvent(new Event('online'));
      expect(mapa.hasLayer(blocos)).toBe(true);
      expect((blocos as unknown as { _tileZoom: number })._tileZoom).toBe(13);
    } finally {
      mapa.getZoom = getZoom;
      unmount();
    }
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
