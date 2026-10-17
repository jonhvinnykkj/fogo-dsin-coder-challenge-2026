// Camada dos agentes: losangos fora do agrupamento (são poucos e o que importa é ver cada um andando).
// Cada evento `posicoes` só chama `setLatLng`; o CSS faz o agente deslizar até o ponto novo.
import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { ROTULO_CATEGORIA_AGENTE, ROTULO_SITUACAO_AGENTE } from '../../../shared/dominio';
import type { AgenteMapa } from '../../../shared/modelos';
import { iconeAgente } from './iconesMapa';
import { compararMarcadores } from './regrasMapa';

const tituloDe = (a: AgenteMapa) => `${a.nome}, ${ROTULO_CATEGORIA_AGENTE[a.categoria].toLowerCase()}, ${ROTULO_SITUACAO_AGENTE[a.situacao].toLowerCase()}`;

interface Props {
  agentes: AgenteMapa[];
  visivel: boolean;
  selecionadoId?: number;
  onSelecionar: (id: number) => void;
}

export function CamadaAgentes({ agentes, visivel, selecionadoId, onSelecionar }: Props) {
  const mapa = useMap();
  const camada = useRef<L.LayerGroup | null>(null);
  const marcadores = useRef(new Map<number, L.Marker>());
  const desenhados = useRef(new Map<number, AgenteMapa>());
  const selecionado = useRef<number | undefined>(undefined);
  const aoSelecionar = useRef(onSelecionar);
  useEffect(() => {
    aoSelecionar.current = onSelecionar;
  });

  useEffect(() => {
    const c = L.layerGroup();
    camada.current = c;
    const registro = marcadores.current;
    const vistos = desenhados.current;

    // Deslize desligado enquanto a câmera voa (flyTo, zoom sem animação): o agente acompanha o mapa sem atraso.
    const container = mapa.getContainer();
    let quadro = 0;
    const inicio = () => {
      cancelAnimationFrame(quadro);
      container.classList.add('fogo-sem-deslize');
    };
    const fim = () => {
      cancelAnimationFrame(quadro);
      quadro = requestAnimationFrame(() => container.classList.remove('fogo-sem-deslize'));
    };
    mapa.on('zoomstart', inicio);
    mapa.on('zoomend', fim);

    return () => {
      mapa.off('zoomstart', inicio);
      mapa.off('zoomend', fim);
      cancelAnimationFrame(quadro);
      container.classList.remove('fogo-sem-deslize');
      c.clearLayers();
      mapa.removeLayer(c);
      registro.clear();
      vistos.clear();
      camada.current = null;
    };
  }, [mapa]);

  useEffect(() => {
    const c = camada.current;
    if (!c) return;
    if (visivel) mapa.addLayer(c);
    else mapa.removeLayer(c);
  }, [visivel, mapa]);

  useEffect(() => {
    const c = camada.current;
    if (!c) return;
    const registro = marcadores.current;
    // Fora de serviço não está na rua: não aparece no mapa.
    const naRua = agentes.filter((a) => a.situacao !== 'fora_de_servico');
    const dif = compararMarcadores(desenhados.current, naRua);

    for (const id of dif.removidos) {
      const m = registro.get(id);
      if (m) c.removeLayer(m);
      registro.delete(id);
      desenhados.current.delete(id);
    }
    for (const a of dif.movidos) registro.get(a.id)?.setLatLng([a.lat, a.lng]);
    for (const a of dif.mudados) {
      const m = registro.get(a.id);
      if (!m) continue;
      m.options.title = tituloDe(a);
      m.setIcon(iconeAgente(a.categoria, a.situacao, selecionado.current === a.id));
    }
    for (const a of dif.incluidos) {
      const m = L.marker([a.lat, a.lng], {
        icon: iconeAgente(a.categoria, a.situacao, selecionado.current === a.id),
        title: tituloDe(a),
        keyboard: true,
        zIndexOffset: 500, // agentes por cima dos equipamentos
      });
      m.on('click', () => aoSelecionar.current(a.id));
      registro.set(a.id, m);
      c.addLayer(m);
    }
    for (const a of naRua) desenhados.current.set(a.id, a);
  }, [agentes]);

  useEffect(() => {
    const anterior = selecionado.current;
    selecionado.current = selecionadoId;
    for (const id of [anterior, selecionadoId]) {
      if (id === undefined) continue;
      const m = marcadores.current.get(id);
      const a = desenhados.current.get(id);
      if (m && a) {
        m.setIcon(iconeAgente(a.categoria, a.situacao, id === selecionadoId));
        m.setZIndexOffset(id === selecionadoId ? 1500 : 500);
      }
    }
  }, [selecionadoId]);

  return null;
}
