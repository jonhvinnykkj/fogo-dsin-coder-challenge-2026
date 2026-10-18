// Atalhos de tempo: progresso 0→1 de um trecho, com curva, e mistura linear de dois valores.
import { interpolate } from 'remotion';
import { curva } from './tema';

export type Curva = (t: number) => number;

/** 0 antes de `inicio`, 1 depois de `inicio + duracao`, curva no meio. */
export function progresso(frame: number, inicio: number, duracao: number, easing: Curva = curva.entrada): number {
  return interpolate(frame, [inicio, inicio + Math.max(1, duracao)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing,
  });
}

export const mistura = (de: number, ate: number, p: number): number => de + (ate - de) * p;
