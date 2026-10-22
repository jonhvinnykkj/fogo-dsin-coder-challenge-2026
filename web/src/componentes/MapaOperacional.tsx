// Mapa ao vivo da Central: MapaBase + quatro camadas independentes (bairros, calor, equipamentos agrupados e agentes),
// legenda e um controle imperativo para a Central levar a câmera até um alerta, um bairro ou um evento recém-injetado.
//
// Cada camada recebe os dados prontos e mexe no Leaflet por conta própria (ver web/src/mapa/Camada*.tsx). Este
// componente consulta o mapa por conta própria para que as posições ao vivo (a cada 2 s) só re-renderizem ele, não a Central.
import { Clock, Info, Wrench, X } from '@phosphor-icons/react';
import L, { type Map as MapaLeaflet } from 'leaflet';
import { memo, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { useMap } from 'react-leaflet';
import { COR_NIVEL_ATENCAO, COR_SITUACAO, ROTULO_SITUACAO, SITUACOES_EQUIPAMENTO } from '../../../shared/dominio';
import type { Alerta, Bairro, StatusRegiao } from '../../../shared/modelos';
import { LIMITE_MARILIA } from '../../../shared/geo';
import type { FiltrosCentral } from '../../../shared/schemas';
import { useMapa, useOcorrencias } from '../api/consultas';
import { CamadaAgentes } from '../mapa/CamadaAgentes';
import { CamadaBairros, type ControleBairros } from '../mapa/CamadaBairros';
import { CamadaCalor, GRADIENTE_CALOR } from '../mapa/CamadaCalor';
import { CamadaEquipamentos } from '../mapa/CamadaEquipamentos';
import { corDoAgenteNoMapa, iconePulso } from '../mapa/iconesMapa';
import { MapaBase } from './MapaBase';
import estilos from './MapaOperacional.module.css';

export interface CamadasVisiveis {
  equipamentos: boolean;
  agentes: boolean;
  bairros: boolean;
  calor: boolean;
}

export type SelecaoMapa = { tipo: 'equipamento' | 'agente'; id: number };

export interface ControleMapa {
  /** Voa até o ponto e faz um anel pulsar nele (alerta clicado, evento injetado). */
  focarPonto(lat: number, lng: number, cor: string): void;
  /** Enquadra o bairro inteiro e pisca. */
  focarBairro(bairroId: number): void;
  /** Pisca o bairro na cor do alerta, sem mexer na câmera. */
  destacarBairro(bairroId: number, cor: string, forte?: boolean): void;
}

interface Props {
  filtros: FiltrosCentral;
  camadas: CamadasVisiveis;
  selecao: SelecaoMapa | null;
  onSelecionar: (s: SelecaoMapa) => void;
  alertasAbertos: Alerta[] | undefined;
  regioes: StatusRegiao[] | undefined;
  bairros: Bairro[] | undefined;
  ref?: Ref<ControleMapa>;
}

const PULSO_MS = 6400;

/** Enquadra o município inteiro ao abrir (com meio nível de zoom, para a cidade ocupar a moldura). */
function EnquadrarCidade() {
  const mapa = useMap();
  useEffect(() => {
    mapa.options.zoomSnap = 0.5;
    mapa.fitBounds(L.geoJSON(LIMITE_MARILIA).getBounds(), { padding: [8, 8], animate: false });
  }, [mapa]);
  return null;
}

/** O Leaflet não percebe sozinho quando a moldura muda de tamanho (filtros abrindo, coluna virando gaveta). */
function AjustarTamanho() {
  const mapa = useMap();
  useEffect(() => {
    const alvo = mapa.getContainer();
    let quadro = 0;
    const obs = new ResizeObserver(() => {
      cancelAnimationFrame(quadro);
      quadro = requestAnimationFrame(() => mapa.invalidateSize({ debounceMoveend: true }));
    });
    obs.observe(alvo);
    return () => {
      cancelAnimationFrame(quadro);
      obs.disconnect();
    };
  }, [mapa]);
  return null;
}

function MapaOperacionalBase({ filtros, camadas, selecao, onSelecionar, alertasAbertos, regioes, bairros, ref }: Props) {
  const mapa = useMapa(filtros);
  const ocorrencias = useOcorrencias(24);
  const leaflet = useRef<MapaLeaflet>(null);
  const controleBairros = useRef<ControleBairros>(null);
  const pulsos = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const ativos = pulsos.current;
    return () => {
      for (const t of ativos) clearTimeout(t);
    };
  }, []);

  useImperativeHandle(ref, () => ({
    focarPonto(lat, lng, cor) {
      const m = leaflet.current;
      if (!m) return;
      m.flyTo([lat, lng], Math.max(m.getZoom(), 15), { duration: 0.8 });
      const anel = L.marker([lat, lng], { icon: iconePulso(cor), interactive: false, keyboard: false, zIndexOffset: 2000 }).addTo(m);
      const t = setTimeout(() => {
        anel.remove();
        pulsos.current.delete(t);
      }, PULSO_MS);
      pulsos.current.add(t);
    },
    focarBairro(bairroId) {
      controleBairros.current?.focar(bairroId);
    },
    destacarBairro(bairroId, cor, forte) {
      controleBairros.current?.destacar(bairroId, cor, forte);
    },
  }), []);

  const selecionar = (tipo: SelecaoMapa['tipo']) => (id: number) => onSelecionar({ tipo, id });

  return (
    <div className={estilos.mapa}>
      <MapaBase ref={leaflet} rotulo="Mapa ao vivo de Marília com equipamentos, agentes e bairros">
        <EnquadrarCidade />
        <AjustarTamanho />
        <CamadaBairros ref={controleBairros} bairros={bairros} regioes={regioes} alertasAbertos={alertasAbertos} visivel={camadas.bairros} />
        <CamadaCalor ocorrencias={ocorrencias.data} visivel={camadas.calor} />
        <CamadaEquipamentos
          equipamentos={mapa.data?.equipamentos ?? []}
          visivel={camadas.equipamentos}
          selecionadoId={selecao?.tipo === 'equipamento' ? selecao.id : undefined}
          onSelecionar={selecionar('equipamento')}
        />
        <CamadaAgentes
          agentes={mapa.data?.agentes ?? []}
          visivel={camadas.agentes}
          selecionadoId={selecao?.tipo === 'agente' ? selecao.id : undefined}
          onSelecionar={selecionar('agente')}
        />
      </MapaBase>

      {mapa.isPending && <p className={estilos.carregando} role="status">Carregando a cidade…</p>}
      {mapa.isError && !mapa.data && (
        <p className={estilos.carregando} role="alert">Não foi possível carregar o mapa. A tela tenta de novo sozinha.</p>
      )}

      <Legenda camadas={camadas} />
    </div>
  );
}

export const MapaOperacional = memo(MapaOperacionalBase);

/** Legenda recolhível no canto do mapa: só o que está ligado aparece. */
function Legenda({ camadas }: { camadas: CamadasVisiveis }) {
  const [aberta, setAberta] = useState(false);
  if (!aberta) {
    return (
      <button type="button" className={estilos.botaoLegenda} onClick={() => setAberta(true)} aria-expanded="false">
        <Info weight="fill" size={16} aria-hidden="true" />
        Legenda
      </button>
    );
  }
  return (
    <section className={estilos.legenda} aria-label="Legenda do mapa">
      <header className={estilos.legendaTopo}>
        <h2>Legenda</h2>
        <button type="button" className={estilos.fecharLegenda} onClick={() => setAberta(false)} aria-expanded="true">
          <X weight="bold" size={14} aria-hidden="true" />
          Fechar
        </button>
      </header>
      {camadas.equipamentos && (
        <div className={estilos.grupoLegenda}>
          <h3>Equipamentos (cor da situação)</h3>
          <ul>
            {SITUACOES_EQUIPAMENTO.map((s) => (
              <li key={s}>
                <span className={`${estilos.amostra} ${s === 'nao_instalado' ? estilos.tracejada : ''}`} style={s === 'nao_instalado' ? { borderColor: COR_SITUACAO[s] } : { background: COR_SITUACAO[s] }} />
                {ROTULO_SITUACAO[s]}
              </li>
            ))}
          </ul>
          <p>Grupo: quantos equipamentos há ali, na cor do pior caso.</p>
          <h3>Manutenção (selo no canto)</h3>
          <ul>
            <li><span className={`fogo-selo-man fogo-selo-man--urgente ${estilos.selo}`}><Wrench weight="fill" size={10} aria-hidden="true" /></span>Imediata ou atrasada</li>
            <li><span className={`fogo-selo-man fogo-selo-man--proxima ${estilos.selo}`}><Clock weight="fill" size={10} aria-hidden="true" /></span>Nos próximos 7 dias</li>
          </ul>
          <p>No grupo, a chave conta quantos dali têm manutenção imediata ou atrasada; o relógio, quantos têm nos próximos 7 dias.</p>
        </div>
      )}
      {camadas.agentes && (
        <div className={estilos.grupoLegenda}>
          <h3>Agentes</h3>
          <ul>
            <li><span className={estilos.losango} style={{ background: corDoAgenteNoMapa('em_servico') }} />Em serviço</li>
            <li><span className={estilos.losango} style={{ background: corDoAgenteNoMapa('em_ocorrencia') }} />Em ocorrência</li>
            <li><span className={estilos.losango} style={{ background: corDoAgenteNoMapa('pausa') }} />Em pausa</li>
          </ul>
          <p>Fora de serviço não aparece.</p>
        </div>
      )}
      {camadas.bairros && (
        <div className={estilos.grupoLegenda}>
          <h3>Bairros (índice de atenção)</h3>
          <ul>
            <li><span className={estilos.area} style={{ background: COR_NIVEL_ATENCAO.atencao }} />Atenção (30 a 59)</li>
            <li><span className={estilos.area} style={{ background: COR_NIVEL_ATENCAO.critico }} />Crítico (60 ou mais)</li>
            <li><span className={`${estilos.area} ${estilos.contorno}`} />Alerta crítico aberto</li>
            <li><span className={`${estilos.area} ${estilos.contorno} ${estilos.contornoAlto}`} />Alerta alto nos últimos 10 min</li>
          </ul>
        </div>
      )}
      {camadas.calor && (
        <div className={estilos.grupoLegenda}>
          <h3>Calor de ocorrências (24 h)</h3>
          <span
            className={estilos.gradiente}
            style={{ background: `linear-gradient(90deg, ${Object.entries(GRADIENTE_CALOR).map(([p, c]) => `${c} ${Number(p) * 100}%`).join(', ')})` }}
          />
          <p className={estilos.escala}><span>Poucas</span><span>Muitas ou graves</span></p>
        </div>
      )}
    </section>
  );
}
