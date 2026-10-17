// Ícones dos marcadores da Central (L.divIcon), na linguagem das placas: equipamento = bloco quadrado na cor da
// situação com o ícone do tipo; agente = losango (forma de placa de advertência) com o ícone da categoria; grupo =
// bloco com a contagem na cor da pior situação de dentro.
//
// Desempenho: os SVGs dos ícones Phosphor são gerados UMA vez, quando o módulo carrega (fora de qualquer render do
// React), e cada combinação tipo × situação vira um L.DivIcon guardado em cache. Mover ou trocar a cor de um marcador
// nunca recria SVG.
import { HandPalm, ShieldChevron, ShieldStar, type Icon } from '@phosphor-icons/react';
import L from 'leaflet';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import {
  COR_SITUACAO, COR_SITUACAO_AGENTE, ROTULO_SITUACAO, type CategoriaAgente, type SituacaoAgente, type SituacaoEquipamento,
} from '../../../shared/dominio';
import { formatarNumero } from '../../../shared/formato';
import { TIPOS_EQUIPAMENTO, type TipoEquipamentoId } from '../../../shared/tipos-equipamento';
import { componenteDoIcone } from '../componentes/IconeTipo';
import { corDoTexto } from '../estilo/contraste';
import './mapa-operacional.css';

/** Ícone Phosphor (estilo cheio, cor = currentColor) como texto SVG. */
function svgDoIcone(Icone: Icon, tamanho: number): string {
  if (typeof document === 'undefined') return '';
  const caixa = document.createElement('div');
  const raiz = createRoot(caixa);
  flushSync(() => raiz.render(createElement(Icone, { weight: 'fill', size: tamanho, 'aria-hidden': true })));
  const svg = caixa.innerHTML;
  raiz.unmount();
  return svg;
}

export const ICONE_CATEGORIA_AGENTE: Record<CategoriaAgente, Icon> = {
  agente_transito: HandPalm,
  guarda_municipal: ShieldStar,
  policial_militar: ShieldChevron,
};

const SVG_TIPO = new Map<TipoEquipamentoId, string>(TIPOS_EQUIPAMENTO.map((t) => [t.id, svgDoIcone(componenteDoIcone(t.icone), 16)]));
const SVG_CATEGORIA = new Map<CategoriaAgente, string>(
  (Object.keys(ICONE_CATEGORIA_AGENTE) as CategoriaAgente[]).map((c) => [c, svgDoIcone(ICONE_CATEGORIA_AGENTE[c], 13)]),
);

const TAMANHO_EQUIPAMENTO = 26;
const cacheEquipamento = new Map<string, L.DivIcon>();

export function iconeEquipamento(tipo: TipoEquipamentoId, situacao: SituacaoEquipamento, selecionado = false): L.DivIcon {
  const chave = `${tipo}|${situacao}|${selecionado ? 1 : 0}`;
  let icone = cacheEquipamento.get(chave);
  if (!icone) {
    const cor = COR_SITUACAO[situacao];
    const tracejado = situacao === 'nao_instalado';
    const estilo = tracejado ? `color:${cor}` : `background:${cor};color:${corDoTexto(cor)}`;
    const classes = ['fogo-mk', tracejado ? 'fogo-mk--tracejado' : '', selecionado ? 'fogo-mk--selecionado' : ''].filter(Boolean).join(' ');
    const t = selecionado ? TAMANHO_EQUIPAMENTO + 8 : TAMANHO_EQUIPAMENTO;
    icone = L.divIcon({
      className: 'fogo-mk-raiz',
      html: `<span class="${classes}" style="${estilo}">${SVG_TIPO.get(tipo) ?? ''}</span>`,
      iconSize: [t, t],
      iconAnchor: [t / 2, t / 2],
    });
    cacheEquipamento.set(chave, icone);
  }
  return icone;
}

const TAMANHO_AGENTE = 26;
const cacheAgente = new Map<string, L.DivIcon>();

/**
 * Agente em serviço fica grafite (unidade disponível), em ocorrência fica laranja-fogo e em pausa âmbar: no mapa a cor
 * cheia fica para quem está ocupado, e o verde continua sendo só "equipamento operando".
 */
export function corDoAgenteNoMapa(situacao: SituacaoAgente): string {
  return situacao === 'em_servico' ? '#1E1E1F' : COR_SITUACAO_AGENTE[situacao];
}

export function iconeAgente(categoria: CategoriaAgente, situacao: SituacaoAgente, selecionado = false): L.DivIcon {
  const chave = `${categoria}|${situacao}|${selecionado ? 1 : 0}`;
  let icone = cacheAgente.get(chave);
  if (!icone) {
    const cor = corDoAgenteNoMapa(situacao);
    const t = selecionado ? TAMANHO_AGENTE + 8 : TAMANHO_AGENTE;
    icone = L.divIcon({
      className: `fogo-ag-raiz${selecionado ? ' fogo-ag-raiz--selecionado' : ''}`,
      html: `<span class="fogo-ag" style="--cor-ag:${cor};color:${corDoTexto(cor)}"><span class="fogo-ag__losango"></span>${SVG_CATEGORIA.get(categoria) ?? ''}</span>`,
      iconSize: [t, t],
      iconAnchor: [t / 2, t / 2],
    });
    cacheAgente.set(chave, icone);
  }
  return icone;
}

/**
 * Grupo de equipamentos: contagem na cor da pior situação; tamanho cresce com a contagem. Quando a pior é um problema
 * (furto, falha, manutenção), um selo branco diz quantos estão com problema — "36" magenta com selo "1" é um furto
 * entre 36, não 36 furtos.
 */
export function iconeGrupo(contagem: number, pior: SituacaoEquipamento, comProblema: number): L.DivIcon {
  const t = contagem < 10 ? 32 : contagem < 50 ? 38 : 46;
  const cor = pior === 'nao_instalado' ? COR_SITUACAO.desativado : COR_SITUACAO[pior];
  const selo = comProblema > 0 ? `<span class="fogo-grupo__selo">${formatarNumero(comProblema)}</span>` : '';
  return L.divIcon({
    className: 'fogo-grupo-raiz',
    html: `<span class="fogo-grupo" style="background:${cor};color:${corDoTexto(cor)}">${formatarNumero(contagem)}${selo}</span>`,
    iconSize: [t, t],
    iconAnchor: [t / 2, t / 2],
  });
}

/** Resumo do grupo para a dica e leitores de tela: "24 equipamentos (Operacional 22, Mau funcionamento 2)". */
export function resumoDoGrupo(situacoes: SituacaoEquipamento[]): string {
  const conta = new Map<SituacaoEquipamento, number>();
  for (const s of situacoes) conta.set(s, (conta.get(s) ?? 0) + 1);
  const partes = [...conta.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([s, n]) => `${ROTULO_SITUACAO[s]} ${formatarNumero(n)}`);
  return `${formatarNumero(situacoes.length)} equipamentos (${partes.join(', ')}). Clique para aproximar.`;
}

/** Ponto na cor da criticidade com dois anéis pulsando: marca onde o alerta ou o evento recém-criado aconteceu. */
export function iconePulso(cor: string): L.DivIcon {
  return L.divIcon({
    className: 'fogo-pulso-raiz',
    html: `<span class="fogo-pulso-alvo" style="--cor-pulso:${cor}"><span class="fogo-pulso"></span><span class="fogo-pulso fogo-pulso--atrasado"></span><span class="fogo-pulso__ponto"></span></span>`,
    iconSize: [64, 64],
    iconAnchor: [32, 32],
  });
}
