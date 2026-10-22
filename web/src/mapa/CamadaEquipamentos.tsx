// Camada dos equipamentos: marcadores agrupados (leaflet.markercluster), atualizados no lugar.
//
// A camada é criada uma vez; a cada mudança do cache só o que mudou é tocado: quem entrou é incluído, quem saiu
// (filtro) é tirado, quem andou (patinete, viatura) é reposicionado em lote e quem mudou de situação troca de ícone
// e recalcula a cor do grupo. Nada de recriar 350 marcadores a cada evento do tempo real.
import L from 'leaflet';
import 'leaflet.markercluster';
import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { estaIndisponivel, ROTULO_SITUACAO, type SituacaoEquipamento } from '../../../shared/dominio';
import type { EquipamentoMapa, SituacaoManutencao } from '../../../shared/modelos';
import { rotuloCurtoDoTipo } from '../componentes/IconeTipo';
import { iconeEquipamento, iconeGrupo, resumoDoGrupo } from './iconesMapa';
import { compararMarcadores, contarManutencao, pedeAtencaoDeManutencao, piorSituacao, ROTULO_MANUTENCAO_NO_MAPA } from './regrasMapa';

interface OpcoesMarcador extends L.MarkerOptions {
  situacao: SituacaoEquipamento;
  manutencao: SituacaoManutencao;
}

const situacaoDe = (m: L.Marker) => (m.options as OpcoesMarcador).situacao;
const manutencaoDe = (m: L.Marker) => (m.options as OpcoesMarcador).manutencao;
const tituloDe = (e: EquipamentoMapa) =>
  `${e.codigo}, ${rotuloCurtoDoTipo(e.tipo).toLowerCase()}, ${ROTULO_SITUACAO[e.situacao].toLowerCase()}${pedeAtencaoDeManutencao(e.manutencao) ? `, ${ROTULO_MANUTENCAO_NO_MAPA[e.manutencao]}` : ''}`;

interface Props {
  equipamentos: EquipamentoMapa[];
  visivel: boolean;
  selecionadoId?: number;
  onSelecionar: (id: number) => void;
}

export function CamadaEquipamentos({ equipamentos, visivel, selecionadoId, onSelecionar }: Props) {
  const mapa = useMap();
  const grupo = useRef<L.MarkerClusterGroup | null>(null);
  const marcadores = useRef(new Map<number, L.Marker>());
  const desenhados = useRef(new Map<number, EquipamentoMapa>());
  const selecionado = useRef<number | undefined>(undefined);
  const aoSelecionar = useRef(onSelecionar);
  useEffect(() => {
    aoSelecionar.current = onSelecionar;
  });

  useEffect(() => {
    const g = L.markerClusterGroup({
      showCoverageOnHover: false,
      // Com a cidade inteira na tela (zoom ≤ 13) os grupos são mais largos, para o centro não virar um amontoado.
      maxClusterRadius: (zoom: number) => (zoom <= 13 ? 60 : 46),
      disableClusteringAtZoom: 17,
      spiderfyOnMaxZoom: true,
      chunkedLoading: true,
      iconCreateFunction: (cluster) => {
        const situacoes = cluster.getAllChildMarkers().map(situacaoDe);
        const manutencao = contarManutencao(cluster.getAllChildMarkers().map(manutencaoDe));
        cluster.options.title = resumoDoGrupo(situacoes, manutencao); // dica nativa, também lida por leitores de tela
        return iconeGrupo(situacoes.length, piorSituacao(situacoes), situacoes.filter(estaIndisponivel).length, manutencao);
      },
    });
    grupo.current = g;
    const registro = marcadores.current;
    const vistos = desenhados.current;
    return () => {
      g.clearLayers();
      mapa.removeLayer(g);
      registro.clear();
      vistos.clear();
      grupo.current = null;
    };
  }, [mapa]);

  useEffect(() => {
    const g = grupo.current;
    if (!g) return;
    if (visivel) mapa.addLayer(g);
    else mapa.removeLayer(g);
  }, [visivel, mapa]);

  useEffect(() => {
    const g = grupo.current;
    if (!g) return;
    const registro = marcadores.current;
    const dif = compararMarcadores(desenhados.current, equipamentos);

    if (dif.removidos.length) {
      g.removeLayers(dif.removidos.map((id) => registro.get(id)).filter((m): m is L.Marker => Boolean(m)));
      for (const id of dif.removidos) {
        registro.delete(id);
        desenhados.current.delete(id);
      }
    }

    if (dif.movidos.length) {
      // Em lote: tirar, mover e devolver é bem mais barato que deixar o agrupamento reagir a cada `setLatLng`.
      const movidos = dif.movidos.map((e) => registro.get(e.id)).filter((m): m is L.Marker => Boolean(m));
      g.removeLayers(movidos);
      for (const e of dif.movidos) registro.get(e.id)?.setLatLng([e.lat, e.lng]);
      g.addLayers(movidos);
    }

    if (dif.mudados.length) {
      const mudados: L.Marker[] = [];
      for (const e of dif.mudados) {
        const m = registro.get(e.id);
        if (!m) continue;
        (m.options as OpcoesMarcador).situacao = e.situacao;
        (m.options as OpcoesMarcador).manutencao = e.manutencao;
        m.options.title = tituloDe(e);
        m.setIcon(iconeEquipamento(e.tipo, e.situacao, selecionado.current === e.id, e.manutencao));
        mudados.push(m);
      }
      g.refreshClusters(mudados);
    }

    if (dif.incluidos.length) {
      const novos = dif.incluidos.map((e) => {
        const opcoes: OpcoesMarcador = {
          icon: iconeEquipamento(e.tipo, e.situacao, selecionado.current === e.id, e.manutencao),
          situacao: e.situacao,
          manutencao: e.manutencao,
          title: tituloDe(e),
          keyboard: true,
        };
        const m = L.marker([e.lat, e.lng], opcoes);
        m.on('click', () => aoSelecionar.current(e.id));
        registro.set(e.id, m);
        return m;
      });
      g.addLayers(novos);
    }

    for (const e of equipamentos) desenhados.current.set(e.id, e);
  }, [equipamentos]);

  // Seleção: só o marcador escolhido (e o anterior) trocam de ícone.
  useEffect(() => {
    const anterior = selecionado.current;
    selecionado.current = selecionadoId;
    for (const id of [anterior, selecionadoId]) {
      if (id === undefined) continue;
      const m = marcadores.current.get(id);
      const e = desenhados.current.get(id);
      if (m && e) {
        m.setIcon(iconeEquipamento(e.tipo, e.situacao, id === selecionadoId, e.manutencao));
        m.setZIndexOffset(id === selecionadoId ? 1000 : 0);
      }
    }
    // Só a troca de seleção: novas posições e situações já usam `selecionado.current` ao montar o ícone.
  }, [selecionadoId]);

  return null;
}
