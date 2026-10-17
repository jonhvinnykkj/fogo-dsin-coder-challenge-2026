// Camada "Bairros": o polígono de cada bairro pintado pelo nível de atenção (normal transparente, atenção âmbar,
// crítico vermelho) e contornado pelo que está acontecendo agora (alerta crítico aberto ou alto recente). Os polígonos nascem uma vez; depois só
// `setStyle` em quem mudou. Fica num painel próprio, abaixo do calor e dos marcadores.
import L from 'leaflet';
import { useEffect, useImperativeHandle, useMemo, useRef, type Ref } from 'react';
import { useMap } from 'react-leaflet';
import { COR_NIVEL_ATENCAO, ROTULO_NIVEL_ATENCAO } from '../../../shared/dominio';
import type { Alerta, Bairro, StatusBairro, StatusRegiao } from '../../../shared/modelos';
import { corDoTexto } from '../estilo/contraste';
import { useAgora } from '../util/useAgora';
import { pinturaDoBairro, type PinturaBairro } from './regrasMapa';

export const PAINEL_BAIRROS = 'fogo-bairros';
const PISCAR_MS = 2700;
const PISCAR_FORTE_MS = 5400;
/** Alerta alto "recente" (contorna o bairro). */
export const RECENTE_MS = 10 * 60_000;

export interface ControleBairros {
  /** Pisca o bairro na cor dada (alerta que acabou de chegar). `forte` = evento provocado pelo usuário. */
  destacar(bairroId: number, cor: string, forte?: boolean): void;
  /** Aproxima o mapa até o bairro inteiro e pisca. */
  focar(bairroId: number): void;
}

interface Props {
  bairros: Bairro[] | undefined;
  regioes: StatusRegiao[] | undefined;
  alertasAbertos: Alerta[] | undefined;
  visivel: boolean;
  ref?: Ref<ControleBairros>;
}

const escapar = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function dicaDoBairro(nome: string, status: StatusBairro | undefined): string {
  if (!status) return `<strong>${escapar(nome)}</strong>`;
  const cor = COR_NIVEL_ATENCAO[status.nivel];
  const motivos = status.motivos.slice(0, 3).map((m) => `<li>${escapar(m)}</li>`).join('');
  return `<strong>${escapar(nome)}</strong>`
    + `<span class="fogo-dica__nivel" style="background:${cor};color:${corDoTexto(cor)}">${ROTULO_NIVEL_ATENCAO[status.nivel]} · índice ${status.indice}</span>`
    + (motivos ? `<ul>${motivos}</ul>` : '<ul><li>Sem pendências agora</li></ul>');
}

const chaveDaPintura = (p: PinturaBairro) => `${p.fillColor}|${p.fillOpacity}|${p.color}|${p.opacity}|${p.weight}`;

export function CamadaBairros({ bairros, regioes, alertasAbertos, visivel, ref }: Props) {
  const mapa = useMap();
  const camada = useRef<L.LayerGroup | null>(null);
  const poligonos = useRef(new Map<number, L.Polygon>());
  const pinturas = useRef(new Map<number, string>());
  const piscando = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const status = useRef(new Map<number, StatusBairro>());
  const alertas = useRef(new Map<number, 'critica' | 'alta'>());
  const nomes = useRef(new Map<number, string>());

  const statusPorBairro = useMemo(() => {
    const m = new Map<number, StatusBairro>();
    for (const r of regioes ?? []) for (const b of r.bairros) m.set(b.bairroId, b);
    return m;
  }, [regioes]);

  /**
   * Contorno do bairro = o que está acontecendo agora: vermelho enquanto houver alerta crítico aberto; laranja se um
   * alerta alto chegou nos últimos 10 min. Alertas altos antigos (acidentes que ninguém fechou) não contornam: seriam
   * dezenas ao mesmo tempo e virariam ruído — eles continuam pesando no índice (preenchimento).
   */
  const agora = useAgora(30_000);
  const alertaPorBairro = useMemo(() => {
    const recente = agora.getTime() - RECENTE_MS;
    const m = new Map<number, 'critica' | 'alta'>();
    for (const a of alertasAbertos ?? []) {
      if (a.bairroId === undefined || a.resolvidoEm) continue;
      if (a.criticidade === 'critica') m.set(a.bairroId, 'critica');
      else if (a.criticidade === 'alta' && !m.has(a.bairroId) && Date.parse(a.criadoEm) >= recente) m.set(a.bairroId, 'alta');
    }
    return m;
  }, [alertasAbertos, agora]);

  // Painel próprio abaixo do calor (overlayPane, 400) e dos marcadores.
  useEffect(() => {
    if (!mapa.getPane(PAINEL_BAIRROS)) mapa.createPane(PAINEL_BAIRROS).style.zIndex = '350';
    const c = L.layerGroup();
    camada.current = c;
    const registro = poligonos.current;
    const feitas = pinturas.current;
    const relogios = piscando.current;
    return () => {
      for (const t of relogios.values()) clearTimeout(t);
      relogios.clear();
      c.clearLayers();
      mapa.removeLayer(c);
      registro.clear();
      feitas.clear();
      camada.current = null;
    };
  }, [mapa]);

  useEffect(() => {
    const c = camada.current;
    if (!c) return;
    if (visivel) mapa.addLayer(c);
    else mapa.removeLayer(c);
  }, [visivel, mapa]);

  // Polígonos: uma vez por bairro.
  useEffect(() => {
    const c = camada.current;
    if (!c || !bairros) return;
    for (const b of bairros) {
      nomes.current.set(b.id, b.nome);
      if (poligonos.current.has(b.id)) continue;
      const aneis = b.poligono.coordinates.map((anel) => anel.map(([lng, lat]) => [lat!, lng!] as [number, number]));
      const p = L.polygon(aneis, { pane: PAINEL_BAIRROS, className: 'fogo-bairro', ...pinturaDoBairro(undefined, undefined) });
      p.bindTooltip(() => dicaDoBairro(nomes.current.get(b.id) ?? '', status.current.get(b.id)), { sticky: true, direction: 'top', className: 'fogo-dica', offset: [0, -8] });
      poligonos.current.set(b.id, p);
      c.addLayer(p);
    }
  }, [bairros]);

  // Pintura: só quem mudou.
  useEffect(() => {
    status.current = statusPorBairro;
    alertas.current = alertaPorBairro;
    for (const [id, p] of poligonos.current) {
      if (piscando.current.has(id)) continue; // a piscada devolve a pintura certa quando acabar
      const pintura = pinturaDoBairro(statusPorBairro.get(id)?.nivel, alertaPorBairro.get(id));
      const chave = chaveDaPintura(pintura);
      if (pinturas.current.get(id) === chave) continue;
      pinturas.current.set(id, chave);
      p.setStyle(pintura);
    }
  }, [statusPorBairro, alertaPorBairro, bairros]);

  useImperativeHandle(ref, () => {
    const destacar = (bairroId: number, cor: string, forte = false) => {
      const p = poligonos.current.get(bairroId);
      if (!p) return;
      clearTimeout(piscando.current.get(bairroId));
      p.setStyle({ color: cor, fillColor: cor, opacity: 1, fillOpacity: forte ? 0.5 : 0.34, weight: forte ? 5 : 3.5 });
      p.bringToFront();
      const el = p.getElement();
      el?.classList.remove('fogo-bairro-pulsa');
      void (el as SVGElement | undefined)?.getBoundingClientRect(); // reinicia a animação se já estava piscando
      el?.classList.add('fogo-bairro-pulsa');
      piscando.current.set(bairroId, setTimeout(() => {
        piscando.current.delete(bairroId);
        el?.classList.remove('fogo-bairro-pulsa');
        const pintura = pinturaDoBairro(status.current.get(bairroId)?.nivel, alertas.current.get(bairroId));
        pinturas.current.set(bairroId, chaveDaPintura(pintura));
        p.setStyle(pintura);
      }, forte ? PISCAR_FORTE_MS : PISCAR_MS));
    };
    return {
      destacar,
      focar(bairroId) {
        const p = poligonos.current.get(bairroId);
        if (!p) return;
        mapa.flyToBounds(p.getBounds(), { maxZoom: 15, padding: [48, 48], duration: 0.8 });
        destacar(bairroId, '#F04A00', true);
      },
    };
  }, [mapa]);

  return null;
}
