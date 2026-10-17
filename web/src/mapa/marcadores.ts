// Marcadores em bloco de cor cheia (a mesma linguagem das etiquetas de situação), sem imagens externas.
import L from 'leaflet';

export function iconeBloco(cor: string, opcoes: { tamanho?: number; tracejado?: boolean; contorno?: string } = {}): L.DivIcon {
  const t = opcoes.tamanho ?? 22;
  const borda = opcoes.tracejado ? `3px dashed ${cor}` : `3px solid ${opcoes.contorno ?? '#fff'}`;
  const fundo = opcoes.tracejado ? '#fff' : cor;
  return L.divIcon({
    className: '',
    html: `<span style="display:block;width:${t}px;height:${t}px;border-radius:4px;background:${fundo};border:${borda};box-shadow:0 2px 6px rgb(0 0 0 / .4)"></span>`,
    iconSize: [t, t],
    iconAnchor: [t / 2, t / 2],
  });
}
