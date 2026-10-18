// Carrega a Archivo variável (eixos de peso 100–900 e largura 62–125%) a partir de public/fontes, antes do 1º quadro.
// Mesmo arquivo que o app usa (@fontsource-variable/archivo, subconjunto latino: cobre os acentos do português).
import { cancelRender, continueRender, delayRender, staticFile } from 'remotion';

let carregada = false;

export function carregarFonte(): void {
  if (carregada || typeof document === 'undefined') return;
  carregada = true;
  const espera = delayRender('Carregando Archivo');
  const face = new FontFace('Archivo Video', `url(${staticFile('fontes/archivo-latin-wdth-normal.woff2')}) format('woff2')`, {
    weight: '100 900',
    stretch: '62% 125%',
    style: 'normal',
  });
  face
    .load()
    .then((f) => {
      document.fonts.add(f);
      continueRender(espera);
    })
    .catch((erro: unknown) => cancelRender(erro));
}
