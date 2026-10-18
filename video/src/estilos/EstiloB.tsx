// B — A interface é o palco. Cortina laranja e grafite abrem a tela real em tela cheia; na faixa do topo o subtítulo
// do app rola para fora e o capítulo entra no lugar; a câmera avança devagar até o feed de alertas e a legenda
// chega em etiquetas de cor cheia, do mesmo formato das etiquetas do app.
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Capitulo } from '../componentes/Capitulo';
import { FaixaTopo, StatusFaixa, SubtituloFaixa } from '../componentes/FaixaTopo';
import { Legenda } from '../componentes/Legenda';
import { PlacaTela } from '../componentes/PlacaTela';
import { Pulso } from '../componentes/Pulso';
import { claro, curva, fonte, marca } from '../tema';
import { progresso } from '../tempo';

const TELA = { src: 'telas/central-povoada-claro-1366.png', largura: 1366, altura: 768 };
/** Primeiro cartão do feed ("Acidente em Paulista"), em px da captura. */
const PRIMEIRO_ALERTA = { x: 998, y: 250, largura: 344, altura: 108 };

export function EstiloB() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: claro.fundo, fontFamily: fonte.familia, overflow: 'hidden' }}>
      <PlacaTela
        src={TELA.src}
        imgLargura={TELA.largura}
        imgAltura={TELA.altura}
        largura={1920}
        altura={1080}
        camera={[
          { f: 18, x: 0.5, y: 0.5, zoom: 1 },
          // abas "Alertas 139 · Regiões 5" e a contagem ficam inteiras logo abaixo da faixa
          { f: 112, x: 0.8565, y: 0.457, zoom: 1.75 },
        ]}
      >
        <Pulso {...PRIMEIRO_ALERTA} de={0} ate={12} cor={claro.faixa} espessura={5} inicio={70} periodo={16} vezes={2} />
      </PlacaTela>
      <div style={{ position: 'absolute', left: 96, top: 700 }}>
        <Legenda
          estilo="etiqueta"
          tamanho={44}
          inicio={60}
          linhas={[
            { texto: 'Se algo acontece na cidade agora,', fundo: marca.fogo, cor: marca.sobreFogo },
            { texto: 'a central percebe.', fundo: claro.faixa, cor: claro.sobreFaixa },
          ]}
        />
      </div>
      <FaixaTopo
        tema={claro}
        centro={<Capitulo estilo="faixa" numero="2" linhas={['Central de Operações']} anterior={<SubtituloFaixa tema={claro} />} inicio={16} tema={claro} />}
        direita={<StatusFaixa tema={claro} />}
      />
      {/* cortina de transição: laranja sai primeiro, o grafite logo atrás */}
      <AbsoluteFill style={{ background: claro.faixa, translate: `${progresso(frame, 3, 15, curva.camera) * 100}% 0` }} />
      <AbsoluteFill style={{ background: marca.fogo, translate: `${progresso(frame, 0, 14, curva.camera) * 100}% 0` }} />
    </AbsoluteFill>
  );
}
