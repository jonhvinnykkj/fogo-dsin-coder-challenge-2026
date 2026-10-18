// Planos de gravação em sequência, com transição de verdade entre eles:
// - corte: troca seca (bom em cima de um clique, "corte no movimento");
// - empurrar: o plano novo empurra o anterior para a esquerda;
// - mascara: uma barra laranja varre a tela e o plano novo aparece atrás dela; o anterior recua um pouco (profundidade).
// Cada plano tem câmera (zoom/pan em cima do que importa) e legendas com tempo próprio.
import type { ReactNode } from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { LegendaPlaca, type LinhaLegenda } from '../componentes/Legenda';
import { PlacaTela, type QuadroCamera } from '../componentes/PlacaTela';
import { curva, marca, video } from '../tema';
import { progresso } from '../tempo';
import type { FalaNoPlano } from './sincronia';

export type Entrada = 'corte' | 'empurrar' | 'mascara';

export interface LegendaPlano {
  linhas: LinhaLegenda[];
  /** segundos locais do plano */
  de: number;
  ate: number;
  lado?: 'esquerda' | 'direita';
  /** ids das frases da narração que esta legenda resume (o tempo passa a seguir a fala) */
  com?: string[];
  /** não entra antes deste segundo (1º plano do capítulo: só depois que o monitor abre) */
  naoAntes?: number;
}

export interface EfeitoPlano {
  /** nome do arquivo em public/audio/sfx, sem .mp3 */
  som: string;
  /** segundo da gravação em que o som cai (vira tempo de tela na sincronia) */
  src: number;
  /** tempo de tela calculado */
  t?: number;
  volume?: number;
}

export interface Plano {
  /** cena da narração (narracao.ts); padrão: o nome do clipe */
  id?: string;
  /** arquivo em public/gravacoes, sem o .mp4 */
  clipe: string;
  /** segundos pulados do começo do clipe */
  de: number;
  /** segundos na tela (conta a transição de saída) */
  dur: number;
  /** velocidade da gravação (1 = tempo real; 1,3 = 30% mais rápido) */
  velocidade?: number;
  entrada?: Entrada;
  /** câmera em segundos locais do plano (x, y de 0 a 1 na gravação; zoom 1 = tela cheia) */
  camera?: { t: number; x: number; y: number; zoom: number }[];
  legendas?: LegendaPlano[];
  /** quando a 1ª frase começa (segundos do plano); padrão na sincronia */
  inicioFala?: number;
  efeitos?: EfeitoPlano[];
  /** preenchido pela sincronia */
  falas?: FalaNoPlano[];
}

export interface Retangulo {
  x: number;
  y: number;
  largura: number;
  altura: number;
}

export const TRANSICAO = 14;
const CHEIA: Retangulo = { x: 0, y: 0, largura: video.largura, altura: video.altura };

export const quadros = (segundos: number) => Math.round(segundos * video.fps);

/** Quadro de início de cada plano e duração total da montagem. */
export function linhaDoTempo(planos: Plano[]): { inicios: number[]; total: number } {
  const inicios: number[] = [];
  let t = 0;
  planos.forEach((p, i) => {
    if (i > 0 && (p.entrada ?? 'corte') !== 'corte') t -= TRANSICAO;
    inicios.push(t);
    t += quadros(p.dur);
  });
  return { inicios, total: t };
}

interface Props {
  planos: Plano[];
  /** Retângulo do 1º plano em cada quadro (a abertura do capítulo o põe no monitor e depois abre para a tela cheia). */
  retanguloPrimeiro?: (frame: number) => Retangulo;
}

export function Montagem({ planos, retanguloPrimeiro }: Props) {
  const { inicios } = linhaDoTempo(planos);
  return (
    <AbsoluteFill>
      {planos.map((plano, i) => (
        <Sequence key={`${plano.clipe}-${i}`} from={inicios[i]} durationInFrames={quadros(plano.dur)} name={plano.clipe}>
          <PlanoNaTela plano={plano} saida={planos[i + 1]?.entrada ?? 'corte'} retangulo={i === 0 ? retanguloPrimeiro : undefined} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}

function PlanoNaTela({ plano, saida, retangulo }: { plano: Plano; saida: Entrada; retangulo?: (frame: number) => Retangulo }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = quadros(plano.dur);
  const entrada = plano.entrada ?? 'corte';
  const entra = entrada === 'corte' ? 1 : progresso(frame, 0, TRANSICAO, curva.camera);
  const sai = saida === 'corte' ? 0 : progresso(frame, dur - TRANSICAO, TRANSICAO, curva.camera);
  const r = retangulo ? retangulo(frame) : CHEIA;

  const desloca = (entrada === 'empurrar' ? (1 - entra) * video.largura : 0) - (saida === 'empurrar' ? sai * video.largura : 0);
  const recua = saida === 'mascara' ? sai : 0;
  const camera: QuadroCamera[] = (plano.camera ?? [{ t: 0, x: 0.5, y: 0.5, zoom: 1 }]).map((q) => ({ f: Math.round(q.t * fps), x: q.x, y: q.y, zoom: q.zoom }));

  return (
    <AbsoluteFill
      style={{
        translate: `${desloca}px 0`,
        scale: `${1 - 0.06 * recua}`,
        filter: recua > 0 ? `brightness(${1 - 0.45 * recua})` : undefined,
        clipPath: entrada === 'mascara' && entra < 1 ? `inset(0 ${(1 - entra) * 100}% 0 0)` : undefined,
      }}
    >
      <div style={{ position: 'absolute', left: r.x, top: r.y }}>
        <PlacaTela
          src={`gravacoes/${plano.clipe}.mp4`}
          trimBefore={quadros(plano.de)}
          velocidade={plano.velocidade ?? 1}
          imgLargura={video.largura}
          imgAltura={video.altura}
          largura={r.largura}
          altura={r.altura}
          camera={camera}
        />
      </div>
      {(plano.legendas ?? []).map((l) => (
        <div key={l.linhas.map((x) => x.texto).join('|')} style={{ position: 'absolute', bottom: 64, ...(l.lado === 'direita' ? { right: 64 } : { left: 64 }) }}>
          <LegendaPlaca linhas={l.linhas} inicio={Math.round(l.de * fps)} fim={Math.round(l.ate * fps)} />
        </div>
      ))}
      {entrada === 'mascara' && entra < 1 && (
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${entra * 100}%`, width: 44, marginLeft: -44, background: marca.fogo }} />
      )}
    </AbsoluteFill>
  );
}

/** Mesma varredura laranja da `mascara`, para cenas inteiras (abertura de capítulo, fechamento). */
export function EntradaMascara({ children, duracao = TRANSICAO }: { children: ReactNode; duracao?: number }) {
  const frame = useCurrentFrame();
  const p = progresso(frame, 0, duracao, curva.camera);
  return (
    <AbsoluteFill style={{ clipPath: p < 1 ? `inset(0 ${(1 - p) * 100}% 0 0)` : undefined }}>
      {children}
      {p < 1 && <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${p * 100}%`, width: 44, marginLeft: -44, background: marca.fogo }} />}
    </AbsoluteFill>
  );
}

