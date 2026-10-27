// Palcos 1920×1080 dos planos que não são a Central em tela cheia:
// - celular: só a gravação do celular do agente, num aparelho à direita, com um rótulo à esquerda;
// - lado-a-lado: a Central numa janela (esquerda) e o celular gravado ao mesmo tempo (direita).
// Cada palco é uma caixa de 1920×1080; a Montagem a escala para caber no monitor da abertura.
import type { ReactNode } from 'react';
import { Desktop, DeviceMobile } from '@phosphor-icons/react';
import { AbsoluteFill } from 'remotion';
import { Celular } from '../componentes/Celular';
import { PlacaTela, type QuadroCamera } from '../componentes/PlacaTela';
import { escuro, fonte, forma, video } from '../tema';

export interface PropsPalco {
  clipe: string;
  celular?: string;
  trimBefore: number;
  velocidade: number;
  camera: QuadroCamera[];
  cameraCelular: QuadroCamera[];
}

/** Medidas dos palcos (px de 1920×1080). */
export const PALCO_CELULAR = { altura: 940, centroX: 1340, chipX: 96, chipY: 96 } as const;
export const PALCO_LADO = {
  janela: { x: 64, y: 120, tela: 1180, faixa: 44, borda: 12 },
  celular: { altura: 900, centroX: 1600, y: 120 },
} as const;

function Chip({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 12,
        height: 48,
        padding: '0 20px',
        borderRadius: forma.raio,
        background: escuro.superficie,
        color: escuro.textoSuave,
        fontSize: 22,
        fontWeight: 700,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export function PalcoCelular({ clipe, trimBefore, velocidade, cameraCelular }: PropsPalco) {
  const { altura, centroX, chipX, chipY } = PALCO_CELULAR;
  const largura = Math.round(((altura - 28) * 390) / 844) + 28;
  return (
    <AbsoluteFill style={{ background: escuro.fundo, fontFamily: fonte.familia }}>
      <div style={{ position: 'absolute', left: chipX, top: chipY }}>
        <Chip>
          <DeviceMobile weight="fill" size={28} />
          Modo Campo · celular do agente
        </Chip>
      </div>
      <div style={{ position: 'absolute', left: Math.round(centroX - largura / 2), top: Math.round((video.altura - altura) / 2) }}>
        <Celular src={`gravacoes/${clipe}.mp4`} altura={altura} trimBefore={trimBefore} velocidade={velocidade} camera={cameraCelular} />
      </div>
    </AbsoluteFill>
  );
}

export function PalcoLadoALado({ clipe, celular, trimBefore, velocidade, camera, cameraCelular }: PropsPalco) {
  const { janela, celular: cel } = PALCO_LADO;
  const alturaTela = Math.round((janela.tela * 9) / 16);
  const larguraCel = Math.round(((cel.altura - 28) * 390) / 844) + 28;
  return (
    <AbsoluteFill style={{ background: escuro.fundo, fontFamily: fonte.familia }}>
      {/* janela da Central */}
      <div
        style={{
          position: 'absolute',
          left: janela.x,
          top: janela.y,
          width: janela.tela + 2 * janela.borda,
          height: janela.faixa + alturaTela + janela.borda,
          borderRadius: forma.raio,
          background: escuro.superficie,
          overflow: 'hidden',
        }}
      >
        <div style={{ height: janela.faixa, padding: `0 ${janela.borda + 6}px`, display: 'flex', alignItems: 'center', gap: 12, color: escuro.textoSuave, fontSize: 20, fontWeight: 700 }}>
          <Desktop weight="fill" size={24} />
          Central de Operações
        </div>
        <div style={{ marginLeft: janela.borda }}>
          <PlacaTela
            src={`gravacoes/${clipe}.mp4`}
            trimBefore={trimBefore}
            velocidade={velocidade}
            imgLargura={video.largura}
            imgAltura={video.altura}
            largura={janela.tela}
            altura={alturaTela}
            camera={camera}
          />
        </div>
      </div>
      {/* celular gravado ao mesmo tempo */}
      <div style={{ position: 'absolute', left: Math.round(cel.centroX - larguraCel / 2), top: 0, width: larguraCel, height: video.altura }}>
        <div style={{ position: 'absolute', top: cel.y - 72, left: '50%', translate: '-50% 0' }}>
          <Chip>
            <DeviceMobile weight="fill" size={28} />
            Celular do agente
          </Chip>
        </div>
        <div style={{ position: 'absolute', top: cel.y }}>
          <Celular src={`gravacoes/${celular ?? clipe}.mp4`} altura={cel.altura} trimBefore={trimBefore} velocidade={velocidade} camera={cameraCelular} />
        </div>
      </div>
    </AbsoluteFill>
  );
}
