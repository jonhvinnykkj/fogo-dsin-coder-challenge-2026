// A — Cartaz em blocos. O campo laranja sobe, o número do capítulo e o título pesado entram por máscara, um degrau de
// laranja mais escuro abre à direita e a tela real chega como uma placa grande, em perspectiva, até assentar.
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Capitulo } from '../componentes/Capitulo';
import { ALTURA_FAIXA, FaixaTopo, StatusFaixa, SubtituloFaixa } from '../componentes/FaixaTopo';
import { Legenda } from '../componentes/Legenda';
import { PlacaTela } from '../componentes/PlacaTela';
import { claro, curva, fonte, marca } from '../tema';
import { mistura, progresso } from '../tempo';

const TELA = { src: 'telas/central-povoada-claro-1366.png', largura: 1366, altura: 768 };
const PLACA = { x: 740, y: 186, largura: 1120, altura: Math.round((1120 * 768) / 1366) };

export function EstiloA() {
  const frame = useCurrentFrame();
  const campo = progresso(frame, 0, 14);
  const painel = progresso(frame, 18, 20);
  const placa = progresso(frame, 24, 32);
  const deriva = progresso(frame, 10, 110, curva.camera);

  return (
    <AbsoluteFill style={{ background: claro.faixa, fontFamily: fonte.familia, overflow: 'hidden' }}>
      {/* campo laranja sobe por baixo (transição do capítulo anterior) */}
      <AbsoluteFill style={{ background: marca.fogo, clipPath: `inset(${(1 - campo) * 100}% 0 0 0)` }} />
      {/* degrau de tom: laranja mais escuro abre da direita, a placa assenta sobre os dois tons */}
      <div
        style={{
          position: 'absolute',
          left: 900,
          top: ALTURA_FAIXA,
          right: 0,
          bottom: 0,
          background: marca.fogoEscuro,
          clipPath: `inset(0 0 0 ${(1 - painel) * 100}%)`,
        }}
      />
      <div style={{ position: 'absolute', left: 72, top: 118, translate: `${mistura(0, -26, deriva)}px 0` }}>
        <Capitulo estilo="cartaz" numero="2" linhas={['Central de', 'Operações']} inicio={6} tamanhoTitulo={104} />
      </div>
      <div
        style={{
          position: 'absolute',
          left: PLACA.x,
          top: PLACA.y,
          translate: `${mistura(1100, 0, placa) + mistura(0, -14, deriva)}px 0`,
          transform: `perspective(2400px) rotateY(${mistura(-24, 0, placa)}deg)`,
          transformOrigin: '100% 50%',
          boxShadow: '0 30px 70px rgb(20 20 22 / 0.30), 0 4px 10px rgb(20 20 22 / 0.16)',
        }}
      >
        <PlacaTela
          src={TELA.src}
          imgLargura={TELA.largura}
          imgAltura={TELA.altura}
          largura={PLACA.largura}
          altura={PLACA.altura}
          camera={[
            { f: 30, x: 0.5, y: 0.5, zoom: 1 },
            { f: 120, x: 0.82, y: 0.49, zoom: 1.22 },
          ]}
        />
      </div>
      <div style={{ position: 'absolute', left: 72, top: 884 }}>
        <Legenda estilo="bloco" linhas={[{ texto: 'Se algo acontece na cidade agora, a central percebe.' }]} inicio={56} tamanho={40} />
      </div>
      <FaixaTopo tema={claro} centro={<SubtituloFaixa tema={claro} />} direita={<StatusFaixa tema={claro} mostrarTema={false} />} />
    </AbsoluteFill>
  );
}
