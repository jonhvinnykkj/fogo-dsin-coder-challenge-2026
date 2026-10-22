// Mapa base de Marília (Leaflet + OpenStreetMap). As telas põem camadas dentro dele (`children`) e podem pegar a
// instância do mapa por `ref` ou, de dentro, por `useMap()` do react-leaflet.
// Os blocos do mapa são a única coisa que depende de internet: se falharem, um aviso diz que os dados seguem ao vivo.
import { WifiSlash } from '@phosphor-icons/react';
import type { LatLngBoundsExpression, LatLngExpression, Map as MapaLeaflet, TileLayer as CamadaLeaflet } from 'leaflet';
import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { GeoJSON, MapContainer, TileLayer, useMapEvents } from 'react-leaflet';
import { LIMITE_MARILIA } from '../../../shared/geo';
import '../mapa/configurarLeaflet';
import estilos from './MapaBase.module.css';

/** Centro da mancha urbana de Marília (meio do limite municipal do OpenStreetMap). */
export const CENTRO_MARILIA: [number, number] = [-22.2138, -49.9508];
export const ZOOM_PADRAO = 13;
/** Limite com folga: dá para olhar em volta, mas não perder a cidade de vista. */
const LIMITES_NAVEGACAO: LatLngBoundsExpression = [[-22.36, -50.1], [-22.06, -49.8]];

const ATRIBUICAO = '&copy; <a href="https://www.openstreetmap.org/copyright">colaboradores do OpenStreetMap</a>';
/** Dois blocos que falham são ruído (um erro de rede passageiro); o aviso só sobe com uma sequência dentro de uma janela curta. */
export const FALHAS_PARA_AVISAR = 6;
export const JANELA_FALHAS_MS = 10_000;

/** Acrescenta uma falha de bloco e descarta as que saíram da janela; `avisar` é verdadeiro quando já são o bastante. */
export function registrarFalhaDeBloco(falhas: readonly number[], agora: number): { falhas: number[]; avisar: boolean } {
  const recentes = [...falhas.filter((t) => agora - t <= JANELA_FALHAS_MS), agora];
  return { falhas: recentes, avisar: recentes.length >= FALHAS_PARA_AVISAR };
}

export const MENSAGEM_MAPA_SEM_CONEXAO = 'Mapa sem conexão — os dados continuam atualizados';

interface Props {
  children?: ReactNode;
  centro?: LatLngExpression;
  zoom?: number;
  /** Contorno tracejado do município. */
  mostrarLimite?: boolean;
  /** Nome do mapa para leitores de tela. */
  rotulo?: string;
  className?: string;
  ref?: Ref<MapaLeaflet>;
}

/**
 * Fecha os balões (dica de bairro, de grupo) quando o mapa começa a se mexer: no voo, no zoom ou no arrasto o
 * balão que estava sob o mouse ficaria parado na tela, longe do que ele descrevia. Ele volta no próximo mouse-over.
 */
export function FechaDicasAoMover() {
  const mapa = useMapEvents({
    movestart: () => fecharDicas(mapa),
    zoomstart: () => fecharDicas(mapa),
  });
  return null;
}

export function fecharDicas(mapa: MapaLeaflet) {
  mapa.eachLayer((camada) => camada.closeTooltip());
}

export function MapaBase({ children, centro = CENTRO_MARILIA, zoom = ZOOM_PADRAO, mostrarLimite = true, rotulo = 'Mapa de Marília', className, ref }: Props) {
  const [semConexao, setSemConexao] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false);
  const falhas = useRef<number[]>([]);
  const camada = useRef<CamadaLeaflet>(null);

  useEffect(() => {
    const caiu = () => setSemConexao(true);
    const voltou = () => {
      falhas.current = [];
      setSemConexao(false);
      camada.current?.redraw(); // o Leaflet não tenta de novo os blocos que falharam
    };
    window.addEventListener('offline', caiu);
    window.addEventListener('online', voltou);
    return () => {
      window.removeEventListener('offline', caiu);
      window.removeEventListener('online', voltou);
    };
  }, []);

  return (
    <div className={`${estilos.moldura} ${className ?? ''}`} role="region" aria-label={rotulo}>
      <MapContainer
        ref={ref}
        center={centro}
        zoom={zoom}
        minZoom={11}
        maxBounds={LIMITES_NAVEGACAO}
        maxBoundsViscosity={0.8}
        className={estilos.mapa}
      >
        <TileLayer
          ref={camada}
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution={ATRIBUICAO}
          maxZoom={19}
          eventHandlers={{
            tileerror: () => {
              const r = registrarFalhaDeBloco(falhas.current, Date.now());
              falhas.current = r.falhas;
              if (r.avisar) setSemConexao(true);
            },
            tileload: () => {
              falhas.current = [];
              setSemConexao(false);
            },
          }}
        />
        <FechaDicasAoMover />
        {mostrarLimite && <GeoJSON data={LIMITE_MARILIA} interactive={false} style={{ className: estilos.limite, fill: false, weight: 2, dashArray: '6 6' }} />}
        {children}
      </MapContainer>

      {semConexao && (
        <div className={estilos.aviso} role="status">
          <WifiSlash weight="fill" size={18} aria-hidden="true" />
          {MENSAGEM_MAPA_SEM_CONEXAO}
        </div>
      )}
    </div>
  );
}
