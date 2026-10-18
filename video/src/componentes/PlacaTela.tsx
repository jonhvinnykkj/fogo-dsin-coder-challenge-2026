// A tela real numa placa, com câmera: zoom e deslocamento por quadros-chave.
// Cada quadro-chave diz em que ponto da imagem a câmera mira (x, y de 0 a 1) e o zoom (1 = imagem cobrindo a placa).
// O zoom anda em escala logarítmica (aproximação com velocidade constante) e a imagem nunca deixa borda vazia.
// `children` fica por cima da imagem em coordenadas da própria imagem (px da captura), e acompanha a câmera.
import type { CSSProperties, ReactNode } from 'react';
import { Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { curva as curvas } from '../tema';
import type { Curva } from '../tempo';

export interface QuadroCamera {
  f: number;
  x: number;
  y: number;
  zoom: number;
}

interface Props {
  /** Caminho dentro de public/ (captura ou, depois, quadro de gravação). */
  src: string;
  imgLargura: number;
  imgAltura: number;
  largura: number;
  altura: number;
  camera: QuadroCamera[];
  curva?: Curva;
  style?: CSSProperties;
  children?: ReactNode;
}

const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function PlacaTela({ src, imgLargura, imgAltura, largura, altura, camera, curva = curvas.camera, style, children }: Props) {
  const frame = useCurrentFrame();
  const quadros = camera.length === 1 ? [camera[0], { ...camera[0], f: camera[0].f + 1 }] : camera;
  const fs = quadros.map((q) => q.f);
  const opcoes = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: curva } as const;
  const zoom = Math.exp(interpolate(frame, fs, quadros.map((q) => Math.log(q.zoom)), opcoes));
  const fx = interpolate(frame, fs, quadros.map((q) => q.x), opcoes);
  const fy = interpolate(frame, fs, quadros.map((q) => q.y), opcoes);

  const escala = Math.max(largura / imgLargura, altura / imgAltura) * zoom;
  const tx = limitar(largura / 2 - fx * imgLargura * escala, largura - imgLargura * escala, 0);
  const ty = limitar(altura / 2 - fy * imgAltura * escala, altura - imgAltura * escala, 0);

  return (
    <div style={{ position: 'relative', width: largura, height: altura, overflow: 'hidden', ...style }}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: imgLargura,
          height: imgAltura,
          transformOrigin: '0 0',
          transform: `translate(${tx}px, ${ty}px) scale(${escala})`,
        }}
      >
        <Img src={staticFile(src)} style={{ display: 'block', width: imgLargura, height: imgAltura }} />
        {children}
      </div>
    </div>
  );
}
