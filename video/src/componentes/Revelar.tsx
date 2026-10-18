// Revela o conteúdo por uma máscara: ele desliza de um lado para dentro da própria caixa (tipografia "subindo").
// A máscara tem folga em cima e embaixo para não cortar acento (Í, õ) nem cedilha.
import type { CSSProperties, ReactNode } from 'react';
import { useCurrentFrame } from 'remotion';
import { curva } from '../tema';
import { progresso, type Curva } from '../tempo';

type Lado = 'baixo' | 'cima' | 'esquerda' | 'direita';

interface Props {
  inicio: number;
  duracao?: number;
  de?: Lado;
  easing?: Curva;
  /** Folga da máscara, em em (padrão 0,25em em cima e embaixo). */
  folga?: number;
  style?: CSSProperties;
  children: ReactNode;
}

export function Revelar({ inicio, duracao = 16, de = 'baixo', easing = curva.entrada, folga = 0.25, style, children }: Props) {
  const frame = useCurrentFrame();
  const resto = (1 - progresso(frame, inicio, duracao, easing)) * 115;
  const translate = de === 'baixo' ? `0 ${resto}%` : de === 'cima' ? `0 ${-resto}%` : de === 'esquerda' ? `${-resto}% 0` : `${resto}% 0`;
  return (
    <div style={{ overflow: 'hidden', paddingTop: `${folga}em`, paddingBottom: `${folga}em`, marginTop: `-${folga}em`, marginBottom: `-${folga}em`, ...style }}>
      <div style={{ translate }}>{children}</div>
    </div>
  );
}
