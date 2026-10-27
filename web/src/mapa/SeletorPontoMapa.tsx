// Mapa para escolher um ponto: clicar marca o ponto (lat/lng sobem pelo `onEscolher`) e o bairro é sugerido por quem usa.
// Mostra o erro do ponto (fora de Marília, vindo do servidor ou da validação) logo abaixo do mapa.
import { CursorClick, WarningCircle } from '@phosphor-icons/react';
import { useEffect, useMemo, useRef } from 'react';
import { Marker, useMap, useMapEvents } from 'react-leaflet';
import { dentroDeMarilia } from '../../../shared/geo';
import { iconeBloco } from './marcadores';
import { MapaBase } from './MapaBase';
import estilos from './SeletorPontoMapa.module.css';

interface Props {
  lat?: number;
  lng?: number;
  onEscolher: (lat: number, lng: number) => void;
  erro?: string;
  /** `id` do parágrafo de erro, para os campos de latitude e longitude apontarem para ele (`aria-describedby`). */
  idErro?: string;
  /** Texto da dica acima do mapa. */
  dica?: string;
}

const COR_PONTO = '#F04A00';
const ZOOM_PONTO = 16;

/** Dois pontos são "o mesmo" quando diferem menos que a casa que o campo mostra (6 casas ≈ 0,1 m): o clique volta arredondado pelo formulário. */
const mesmoPonto = (a: { lat: number; lng: number } | null, lat: number, lng: number) =>
  a !== null && Math.abs(a.lat - lat) < 1e-5 && Math.abs(a.lng - lng) < 1e-5;

function Cliques({ onEscolher, registrar }: { onEscolher: Props['onEscolher']; registrar: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      registrar(e.latlng.lat, e.latlng.lng);
      onEscolher(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

/**
 * Quando o ponto muda por fora do mapa (digitou a coordenada), o mapa vai até ele. Clicar no mapa NÃO move a vista: a pessoa
 * está olhando o lugar certo, e recentrar faria o segundo clique no mesmo pixel cair em outro ponto.
 * O zoom só anima quando não muda: a animação de zoom do Leaflet termina num temporizador de 250 ms que, se a tela fecha
 * antes (Cancelar logo depois de digitar), mexe num mapa já desmontado e estoura `_leaflet_pos`.
 */
function SeguirPonto({ lat, lng, ultimoClique }: { lat?: number; lng?: number; ultimoClique: React.RefObject<{ lat: number; lng: number } | null> }) {
  const mapa = useMap();
  useEffect(() => {
    if (lat === undefined || lng === undefined || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    if (mesmoPonto(ultimoClique.current, lat, lng)) return;
    ultimoClique.current = null; // a coordenada foi digitada: vale recentrar de novo, mesmo se for a de um clique antigo
    const zoom = Math.max(mapa.getZoom(), ZOOM_PONTO);
    mapa.setView([lat, lng], zoom, { animate: zoom === mapa.getZoom() });
  }, [lat, lng, mapa, ultimoClique]);
  // A animação de deslizar (sem zoom) usa quadros de animação; parar ao sair evita que continue sobre o mapa desmontado.
  useEffect(() => () => { try { mapa.stop(); } catch { /* mapa já removido */ } }, [mapa]);
  return null;
}

export function SeletorPontoMapa({ lat, lng, onEscolher, erro, idErro, dica = 'Clique no mapa para marcar o ponto exato.' }: Props) {
  const ultimoClique = useRef<{ lat: number; lng: number } | null>(null);
  const temPonto = lat !== undefined && lng !== undefined && Number.isFinite(lat) && Number.isFinite(lng);
  const icone = useMemo(() => iconeBloco(COR_PONTO, { tamanho: 26, contorno: '#1E1E1F' }), []);
  const aviso = erro ?? (temPonto && !dentroDeMarilia(lat, lng) ? 'A coordenada precisa ficar dentro de Marília' : undefined);

  return (
    <div className={estilos.seletor}>
      <p className={estilos.dica}>
        <CursorClick weight="fill" size={18} aria-hidden="true" />
        {dica}
      </p>
      <div className={`${estilos.mapa} ${aviso ? estilos.comErro : ''}`}>
        <MapaBase rotulo="Mapa para escolher o ponto" zoom={temPonto ? ZOOM_PONTO : 13} centro={temPonto ? [lat, lng] : undefined}>
          <Cliques onEscolher={onEscolher} registrar={(la, ln) => { ultimoClique.current = { lat: la, lng: ln }; }} />
          <SeguirPonto lat={lat} lng={lng} ultimoClique={ultimoClique} />
          {temPonto && <Marker position={[lat, lng]} icon={icone} interactive={false} />}
        </MapaBase>
      </div>
      {aviso && (
        <p id={idErro} className={estilos.erro} role="alert">
          <WarningCircle weight="fill" size={16} aria-hidden="true" />
          {aviso}
        </p>
      )}
    </div>
  );
}
