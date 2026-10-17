// Mapa para escolher um ponto: clicar marca o ponto (lat/lng sobem pelo `onEscolher`) e o bairro é sugerido por quem usa.
// Mostra o erro do ponto (fora de Marília, vindo do servidor ou da validação) logo abaixo do mapa.
import { CursorClick, WarningCircle } from '@phosphor-icons/react';
import { useEffect, useMemo, useRef } from 'react';
import { Marker, useMap, useMapEvents } from 'react-leaflet';
import { dentroDeMarilia } from '../../../shared/geo';
import { iconeBloco } from '../mapa/marcadores';
import { MapaBase } from './MapaBase';
import estilos from './SeletorPontoMapa.module.css';

interface Props {
  lat?: number;
  lng?: number;
  onEscolher: (lat: number, lng: number) => void;
  erro?: string;
  /** Texto da dica acima do mapa. */
  dica?: string;
}

const COR_PONTO = '#F04A00';
const ZOOM_PONTO = 16;

function Cliques({ onEscolher, registrar }: { onEscolher: Props['onEscolher']; registrar: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      registrar(e.latlng.lat, e.latlng.lng);
      onEscolher(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

/** Quando o ponto muda por fora do mapa (digitou a coordenada, trocou o CEP), o mapa vai até ele. */
function SeguirPonto({ lat, lng, ultimoClique }: { lat?: number; lng?: number; ultimoClique: React.RefObject<string | null> }) {
  const mapa = useMap();
  useEffect(() => {
    if (lat === undefined || lng === undefined || Number.isNaN(lat) || Number.isNaN(lng)) return;
    if (ultimoClique.current === `${lat},${lng}`) return;
    mapa.setView([lat, lng], Math.max(mapa.getZoom(), ZOOM_PONTO), { animate: true });
  }, [lat, lng, mapa, ultimoClique]);
  return null;
}

export function SeletorPontoMapa({ lat, lng, onEscolher, erro, dica = 'Clique no mapa para marcar o ponto exato.' }: Props) {
  const ultimoClique = useRef<string | null>(null);
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
          <Cliques onEscolher={onEscolher} registrar={(la, ln) => { ultimoClique.current = `${la},${ln}`; }} />
          <SeguirPonto lat={lat} lng={lng} ultimoClique={ultimoClique} />
          {temPonto && <Marker position={[lat, lng]} icon={icone} interactive={false} />}
        </MapaBase>
      </div>
      {aviso && (
        <p className={estilos.erro} role="alert">
          <WarningCircle weight="fill" size={16} aria-hidden="true" />
          {aviso}
        </p>
      )}
    </div>
  );
}
