// O vídeo inteiro: abertura, os três capítulos (Inventário, Central, Previsões), o toque no tema e o fechamento.
// Os números grandes chegam por props, calculadas dos JSONs da API (ver dados.ts e calcularDemonstracao).
import { Audio, AbsoluteFill, Sequence, staticFile, type CalculateMetadataFunction } from 'remotion';
import { escuro } from '../tema';
import { Abertura, DURACAO_ABERTURA } from './Abertura';
import { CenaCapitulo, duracaoCapitulo } from './CenaCapitulo';
import { carregarNumeros, NUMEROS_VAZIOS, type Numeros } from './dados';
import { DURACAO_FECHAMENTO, Fechamento } from './Fechamento';
import { EntradaMascara, Montagem, TRANSICAO } from './Montagem';
import { capitulos, coda } from './roteiro';

// `type` (e não interface) para o Remotion aceitar como Record<string, unknown>.
export type PropsDemonstracao = {
  numeros: Numeros;
  /** Nomes da equipe para o fechamento (vazio = não mostra a linha). */
  equipe?: string[];
  /** Trilha opcional em public/ (ex.: "trilha.mp3"). Sem ela o vídeo sai mudo. */
  musica?: string;
  volumeMusica?: number;
};

export const PROPS_PADRAO: PropsDemonstracao = { numeros: NUMEROS_VAZIOS, equipe: [], musica: undefined, volumeMusica: 0.5 };

interface Bloco {
  nome: string;
  inicio: number;
  duracao: number;
  mascara: boolean;
}

/** Onde cada bloco começa: o capítulo 1 entra em corte (a faixa continua igual), o resto pela varredura laranja. */
export function blocos(numeros: Numeros): Bloco[] {
  const lista: { nome: string; duracao: number; mascara: boolean }[] = [
    { nome: 'abertura', duracao: DURACAO_ABERTURA, mascara: false },
    ...capitulos(numeros).map((c, i) => ({ nome: `capitulo-${c.numero}`, duracao: duracaoCapitulo(c.planos), mascara: i > 0 })),
    { nome: 'coda', duracao: duracaoCapitulo(coda), mascara: true },
    { nome: 'fechamento', duracao: DURACAO_FECHAMENTO, mascara: true },
  ];
  let t = 0;
  return lista.map((b) => {
    if (b.mascara) t -= TRANSICAO;
    const bloco = { ...b, inicio: t };
    t += b.duracao;
    return bloco;
  });
}

export const duracaoTotal = (numeros: Numeros) => {
  const b = blocos(numeros).at(-1)!;
  return b.inicio + b.duracao;
};

export const calcularDemonstracao: CalculateMetadataFunction<PropsDemonstracao> = async ({ props }) => {
  const numeros = await carregarNumeros();
  return { props: { ...props, numeros }, durationInFrames: duracaoTotal(numeros) };
};

export function Demonstracao({ numeros, equipe = [], musica, volumeMusica = 0.5 }: PropsDemonstracao) {
  const caps = capitulos(numeros);
  const lista = blocos(numeros);
  const cena = (nome: string) => {
    if (nome === 'abertura') return <Abertura />;
    if (nome === 'fechamento') return <Fechamento equipe={equipe} />;
    if (nome === 'coda') return <Montagem planos={coda} />;
    const c = caps.find((x) => `capitulo-${x.numero}` === nome)!;
    return <CenaCapitulo numero={c.numero} linhas={c.linhas} rotuloMonitor={c.rotuloMonitor} indicadores={c.indicadores} planos={c.planos} />;
  };
  return (
    <AbsoluteFill style={{ background: escuro.fundo }}>
      {lista.map((b) => (
        <Sequence key={b.nome} from={b.inicio} durationInFrames={b.duracao} name={b.nome}>
          {b.mascara ? <EntradaMascara>{cena(b.nome)}</EntradaMascara> : cena(b.nome)}
        </Sequence>
      ))}
      {musica && <Audio src={staticFile(musica)} volume={volumeMusica} />}
    </AbsoluteFill>
  );
}
