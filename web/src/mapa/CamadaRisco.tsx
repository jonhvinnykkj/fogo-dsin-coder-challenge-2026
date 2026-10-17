// Camada do mapa de risco: o polígono de cada bairro pintado pelo índice previsto na hora escolhida na régua.
// Mesma técnica da camada de bairros da Central: os polígonos nascem uma vez; trocar a hora só chama `setStyle` em quem
// mudou de cor (a régua tocando troca as cores a cada segundo sem recriar nada). A dica lê sempre a hora atual.
import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { COR_NIVEL_RISCO, ROTULO_NIVEL_RISCO } from '../../../shared/dominio';
import type { Bairro, CelulaRisco } from '../../../shared/modelos';
import { corDoTexto } from '../estilo/contraste';
import type { Tema } from '../estilo/tema';
import { ocorrenciasEsperadas, rampaRisco, textoPeso } from '../util/risco';

export const PAINEL_RISCO = 'fogo-risco';

export interface PinturaRisco {
  fillColor: string;
  fillOpacity: number;
  color: string;
  opacity: number;
  weight: number;
}

/** Cor pelo índice; quanto mais baixo, mais transparente (o bairro calmo quase some no mapa). Escolhido = contorno forte. */
export function pinturaDoRisco(indice: number, selecionado: boolean, tema: Tema): PinturaRisco {
  const forca = Math.min(1, Math.max(0, indice) / 80);
  const cor = rampaRisco(indice);
  return {
    fillColor: cor,
    fillOpacity: Math.round((0.1 + 0.58 * forca) * 100) / 100,
    color: selecionado ? (tema === 'escuro' ? '#EDEDEA' : '#1E1E1F') : cor,
    opacity: selecionado ? 1 : Math.round((0.45 + 0.45 * forca) * 100) / 100,
    weight: selecionado ? 3.5 : 1.2,
  };
}

const escapar = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function dica(nome: string, c: CelulaRisco | undefined): string {
  if (!c) return `<strong>${escapar(nome)}</strong>`;
  const cor = COR_NIVEL_RISCO[c.nivel];
  const fatores = c.fatores.slice(0, 3).map((f) => `<li>${escapar(f.nome)} ${textoPeso(f.peso)}</li>`).join('');
  return `<strong>${escapar(nome)}</strong>`
    + `<span class="fogo-dica__nivel" style="background:${cor};color:${corDoTexto(cor)}">${ROTULO_NIVEL_RISCO[c.nivel]} · índice ${c.indice}</span>`
    + `<ul><li>${ocorrenciasEsperadas(c.taxaEsperada)} nesta hora</li>${fatores}</ul>`;
}

const chave = (p: PinturaRisco) => `${p.fillColor}|${p.fillOpacity}|${p.color}|${p.opacity}|${p.weight}`;

interface Props {
  bairros: Bairro[] | undefined;
  /** Células da hora escolhida, por bairro. */
  celulas: Map<number, CelulaRisco> | undefined;
  selecionado: number | null;
  tema: Tema;
  onSelecionar: (bairroId: number) => void;
}

export function CamadaRisco({ bairros, celulas, selecionado, tema, onSelecionar }: Props) {
  const mapa = useMap();
  const camada = useRef<L.LayerGroup | null>(null);
  const poligonos = useRef(new Map<number, L.Polygon>());
  const pinturas = useRef(new Map<number, string>());
  const nomes = useRef(new Map<number, string>());
  const atuais = useRef<Map<number, CelulaRisco> | undefined>(undefined);
  const selecionar = useRef(onSelecionar);
  useEffect(() => {
    selecionar.current = onSelecionar;
  }, [onSelecionar]);

  useEffect(() => {
    if (!mapa.getPane(PAINEL_RISCO)) mapa.createPane(PAINEL_RISCO).style.zIndex = '350';
    const c = L.layerGroup().addTo(mapa);
    camada.current = c;
    const registro = poligonos.current;
    const feitas = pinturas.current;
    return () => {
      c.clearLayers();
      mapa.removeLayer(c);
      registro.clear();
      feitas.clear();
      camada.current = null;
    };
  }, [mapa]);

  // Polígonos: uma vez por bairro; enquadra a área urbana na primeira vez.
  useEffect(() => {
    const c = camada.current;
    if (!c || !bairros) return;
    const novos: L.Polygon[] = [];
    for (const b of bairros) {
      nomes.current.set(b.id, b.nome);
      if (poligonos.current.has(b.id)) continue;
      const aneis = b.poligono.coordinates.map((anel) => anel.map(([lng, lat]) => [lat!, lng!] as [number, number]));
      const p = L.polygon(aneis, { pane: PAINEL_RISCO, className: 'fogo-risco-bairro', fillOpacity: 0, opacity: 0 });
      p.bindTooltip(() => dica(nomes.current.get(b.id) ?? '', atuais.current?.get(b.id)), {
        sticky: true, direction: 'top', className: 'fogo-dica', offset: [0, -8],
      });
      p.on('click', () => selecionar.current(b.id));
      poligonos.current.set(b.id, p);
      c.addLayer(p);
      novos.push(p);
    }
    if (novos.length === bairros.length && novos.length > 0) {
      mapa.options.zoomSnap = 0.5;
      mapa.fitBounds(L.featureGroup(novos).getBounds(), { padding: [10, 10], animate: false });
    }
  }, [bairros, mapa]);

  // Pintura da hora: só quem mudou.
  useEffect(() => {
    atuais.current = celulas;
    for (const [id, p] of poligonos.current) {
      const pintura = pinturaDoRisco(celulas?.get(id)?.indice ?? 0, id === selecionado, tema);
      const k = chave(pintura);
      if (pinturas.current.get(id) === k) continue;
      pinturas.current.set(id, k);
      p.setStyle(pintura);
      if (id === selecionado) p.bringToFront();
      if (p.isTooltipOpen()) p.setTooltipContent(dica(nomes.current.get(id) ?? '', celulas?.get(id)));
    }
  }, [celulas, selecionado, tema, bairros]);

  return null;
}
