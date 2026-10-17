// Camada "Calor de ocorrências": ocorrências das últimas 24 h em leaflet.heat, com peso pela gravidade.
// Só existe enquanto ligada; o redesenho é limitado a um a cada 3 s (a 60× chegam várias ocorrências por segundo).
import L from 'leaflet';
import 'leaflet.heat';
import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import type { Ocorrencia } from '../../../shared/modelos';
import { pesoDaOcorrencia } from './regrasMapa';

type Ponto = [number, number, number];
interface CamadaCalorLeaflet extends L.Layer {
  setLatLngs(pontos: Ponto[]): this;
}
interface OpcoesCalor {
  radius: number;
  blur: number;
  maxZoom: number;
  max: number;
  minOpacity: number;
  gradient: Record<number, string>;
}
type ClasseCalor = new (pontos: Ponto[], opcoes: OpcoesCalor) => CamadaCalorLeaflet;

/** Âmbar → laranja-fogo → vermelho: as cores de criticidade do F.O.G.O., não o arco-íris padrão. */
export const GRADIENTE_CALOR: Record<number, string> = { 0.25: '#E8A400', 0.55: '#F04A00', 0.85: '#D92D20' };
const JANELA_MS = 24 * 3_600_000;
const INTERVALO_MS = 3000;

let Classe: ClasseCalor | undefined;

/**
 * A HeatLayer do plugin lê o canvas com getImageData a cada redesenho; avisar o navegador disso (`willReadFrequently`)
 * evita o alerta de desempenho no console e deixa a leitura mais rápida. O resto é o `_initCanvas` original.
 */
function classeCalor(): ClasseCalor {
  if (Classe) return Classe;
  const Base = (L as unknown as { HeatLayer: { extend(p: object): ClasseCalor; prototype: { _initCanvas(): void } } }).HeatLayer;
  const original = Base.prototype._initCanvas;
  Classe = Base.extend({
    _initCanvas(this: { _initCanvas(): void }) {
      const criar = L.DomUtil.create;
      // O plugin cria o canvas por L.DomUtil.create e logo pede o contexto 2D: pedimos antes, com a dica certa.
      (L.DomUtil as { create: typeof criar }).create = ((tag: string, classe?: string, pai?: HTMLElement) => {
        const el = criar(tag, classe, pai);
        if (tag === 'canvas') (el as HTMLCanvasElement).getContext('2d', { willReadFrequently: true });
        return el;
      }) as typeof criar;
      try {
        original.call(this);
      } finally {
        (L.DomUtil as { create: typeof criar }).create = criar;
      }
    },
  });
  return Classe;
}

function pontosRecentes(ocorrencias: Ocorrencia[], agora: number): Ponto[] {
  const desde = agora - JANELA_MS;
  const pontos: Ponto[] = [];
  for (const o of ocorrencias) if (Date.parse(o.inicio) >= desde) pontos.push([o.lat, o.lng, pesoDaOcorrencia(o.gravidade)]);
  return pontos;
}

export function CamadaCalor({ ocorrencias, visivel }: { ocorrencias: Ocorrencia[] | undefined; visivel: boolean }) {
  const mapa = useMap();
  const camada = useRef<CamadaCalorLeaflet | null>(null);
  const ultimo = useRef(0);
  const pendente = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dados = useRef(ocorrencias);
  useEffect(() => {
    dados.current = ocorrencias;
  });

  useEffect(() => {
    if (!visivel) return;
    const C = classeCalor();
    const c = new C(pontosRecentes(dados.current ?? [], Date.now()), {
      // `max` alto: com centenas de ocorrências em 24 h o centro saturaria em vermelho e esconderia os marcadores.
      radius: 18, blur: 22, maxZoom: 14, max: 4, minOpacity: 0.12, gradient: GRADIENTE_CALOR,
    });
    camada.current = c;
    ultimo.current = Date.now();
    mapa.addLayer(c);
    return () => {
      clearTimeout(pendente.current);
      pendente.current = undefined;
      mapa.removeLayer(c);
      camada.current = null;
    };
  }, [visivel, mapa]);

  useEffect(() => {
    if (!camada.current || pendente.current) return;
    const desenhar = () => {
      pendente.current = undefined;
      ultimo.current = Date.now();
      camada.current?.setLatLngs(pontosRecentes(dados.current ?? [], Date.now()));
    };
    const espera = Math.max(0, INTERVALO_MS - (Date.now() - ultimo.current));
    pendente.current = setTimeout(desenhar, espera);
  }, [ocorrencias]);

  return null;
}
