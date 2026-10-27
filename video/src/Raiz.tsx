// Composições do vídeo. "Demonstracao" é o vídeo de entrega (estilo C, gravações reais). "Estilos" toca os três quadros de estilo em sequência (A, B, C; 4 s cada) para um render só;
// cada um também existe sozinho na pasta "Quadros-de-estilo" do Studio.
import { Composition, Folder, Series } from 'remotion';
import { calcularDemonstracao, Demonstracao, duracaoTotal, PROPS_PADRAO } from './demo/Demonstracao';
import { EstiloA } from './estilos/EstiloA';
import { EstiloB } from './estilos/EstiloB';
import { EstiloC } from './estilos/EstiloC';
import { Montagem, quadros, type Plano } from './demo/Montagem';
import { carregarFonte } from './fonte';
import { video } from './tema';

carregarFonte();

const QUADROS_POR_ESTILO = 4 * video.fps;

// Teste dos layouts de celular (os clipes ainda serão gravados em public/gravacoes/).
const PLANOS_TESTE: Plano[] = [
  {
    clipe: 'campo-entrar-celular',
    layout: 'celular',
    de: 0,
    dur: 4,
    legendas: [{ linhas: [{ texto: 'O agente entra no Modo Campo' }], de: 0.4, ate: 3.6 }],
  },
  {
    clipe: 'campo-despacho',
    celular: 'campo-despacho-celular',
    layout: 'lado-a-lado',
    de: 0,
    dur: 6,
    entrada: 'empurrar',
    legendas: [{ linhas: [{ texto: 'O alerta chega ao celular na hora' }], de: 0.6, ate: 5.4 }],
  },
];

function TesteLayouts() {
  return <Montagem planos={PLANOS_TESTE} />;
}

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
      <Folder name="Testes">
        <Composition id="TesteLayouts" component={TesteLayouts} durationInFrames={quadros(10) - 14} {...formato} />
      </Folder>
    </>
  );
}
