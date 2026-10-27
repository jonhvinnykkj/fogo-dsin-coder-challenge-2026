// Aparelho de celular em CSS (corpo grafite, borda fina, furo de câmera) com a gravação do celular na tela.
// A tela segue a proporção da página capturada (390:844); a moldura cresce por fora dela.
import { escuro, forma } from '../tema';
import { PlacaTela, type QuadroCamera } from './PlacaTela';

/** Gravação do celular: página de 390×844 px CSS capturada com deviceScaleFactor 2 (arquivo retrato). Ajuste aqui se o arquivo real for outro. */
export const CELULAR = { largura: 780, altura: 1688 } as const;

const BORDA = 14;
const RAIO = 54;

interface Props {
  /** Caminho dentro de public/ (.mp4 ou imagem). */
  src: string;
  /** Altura total do aparelho, moldura incluída. */
  altura: number;
  trimBefore?: number;
  velocidade?: number;
  camera: QuadroCamera[];
}

/** Largura total do aparelho para uma altura total (a tela mantém 390:844). */
export const larguraCelular = (altura: number) => Math.round(((altura - 2 * BORDA) * CELULAR.largura) / CELULAR.altura) + 2 * BORDA;

export function Celular({ src, altura, trimBefore, velocidade, camera }: Props) {
  const largura = larguraCelular(altura);
  return (
    <div
      style={{
        position: 'relative',
        width: largura,
        height: altura,
        boxSizing: 'border-box',
        padding: BORDA,
        borderRadius: RAIO,
        background: escuro.superficie,
        border: `1px solid ${escuro.superficieAlta}`,
        boxShadow: '0 28px 64px rgba(0, 0, 0, 0.45)',
      }}
    >
      <PlacaTela
        src={src}
        trimBefore={trimBefore}
        velocidade={velocidade}
        imgLargura={CELULAR.largura}
        imgAltura={CELULAR.altura}
        largura={largura - 2 * BORDA - 2}
        altura={altura - 2 * BORDA - 2}
        camera={camera}
        style={{ borderRadius: RAIO - BORDA, background: escuro.fundo }}
      />
      {/* furo da câmera */}
      <div style={{ position: 'absolute', top: BORDA + 14, left: '50%', width: 14, height: 14, marginLeft: -7, borderRadius: forma.pilula, background: escuro.fundo, boxShadow: `0 0 0 2px ${escuro.superficieBaixa}` }} />
    </div>
  );
}
