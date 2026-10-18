// Composições do vídeo. "Demonstracao" é o vídeo de entrega (estilo C, gravações reais). "Estilos" toca os três quadros de estilo em sequência (A, B, C; 4 s cada) para um render só;
// cada um também existe sozinho na pasta "Quadros-de-estilo" do Studio.
import { Composition, Folder, Series } from 'remotion';
import { calcularDemonstracao, Demonstracao, duracaoTotal, PROPS_PADRAO } from './demo/Demonstracao';
import { EstiloA } from './estilos/EstiloA';
import { EstiloB } from './estilos/EstiloB';
import { EstiloC } from './estilos/EstiloC';
import { carregarFonte } from './fonte';
import { video } from './tema';

carregarFonte();

const QUADROS_POR_ESTILO = 4 * video.fps;

function Estilos() {
  return (
    <Series>
      <Series.Sequence durationInFrames={QUADROS_POR_ESTILO} name="A — Cartaz em blocos">
        <EstiloA />
      </Series.Sequence>
      <Series.Sequence durationInFrames={QUADROS_POR_ESTILO} name="B — A interface é o palco">
        <EstiloB />
      </Series.Sequence>
      <Series.Sequence durationInFrames={QUADROS_POR_ESTILO} name="C — Sala de controle">
        <EstiloC />
      </Series.Sequence>
    </Series>
  );
}

const formato = { fps: video.fps, width: video.largura, height: video.altura } as const;

export function Raiz() {
  return (
    <>
      <Composition
        id="Demonstracao"
        component={Demonstracao}
        durationInFrames={duracaoTotal(PROPS_PADRAO)}
        defaultProps={PROPS_PADRAO}
        calculateMetadata={calcularDemonstracao}
        {...formato}
      />
      <Composition id="Estilos" component={Estilos} durationInFrames={QUADROS_POR_ESTILO * 3} {...formato} />
      <Folder name="Quadros-de-estilo">
        <Composition id="EstiloA" component={EstiloA} durationInFrames={QUADROS_POR_ESTILO} {...formato} />
        <Composition id="EstiloB" component={EstiloB} durationInFrames={QUADROS_POR_ESTILO} {...formato} />
        <Composition id="EstiloC" component={EstiloC} durationInFrames={QUADROS_POR_ESTILO} {...formato} />
      </Folder>
    </>
  );
}
