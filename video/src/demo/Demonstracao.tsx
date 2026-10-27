// O vídeo inteiro: abertura, a entrada por papel, os cinco capítulos (Inventário, Central, Modo Campo, Previsões, Boletim),
// o toque no tema e o fechamento,
// com narração (frase por frase, no tempo de cada cena), trilha abaixada sob a voz e efeitos discretos.
// Números, narração e duração das gravações chegam por props, calculadas dos JSONs (dados.ts / calcularDemonstracao).
import { AbsoluteFill, Audio, Sequence, staticFile, type CalculateMetadataFunction } from 'remotion';
import { escuro, video } from '../tema';
import { Abertura, DURACAO_ABERTURA } from './Abertura';
import { CenaCapitulo, duracaoCapitulo } from './CenaCapitulo';
import { carregarDuracaoClipes, carregarNarracao, carregarNumeros, NUMEROS_VAZIOS, type Numeros } from './dados';
import { DURACAO_FECHAMENTO, Fechamento } from './Fechamento';
import { EntradaMascara, linhaDoTempo, Montagem, TRANSICAO, type Plano } from './Montagem';
import { capitulos, coda, entrada, type DefCapitulo } from './roteiro';
import { RESPIRO, sincronizar, type FalaGravada, type FalaNoPlano } from './sincronia';

// `type` (e não interface) para o Remotion aceitar como Record<string, unknown>.
export type PropsDemonstracao = {
  numeros: Numeros;
  narracao: FalaGravada[];
  duracaoClipes: Record<string, number>;
  /** Nomes da equipe para o fechamento (vazio = não mostra a linha). */
  equipe?: string[];
  /** Trilha em public/ (vazio = sem trilha). */
  musica?: string;
  /** Efeitos sonoros em public/audio/sfx. */
  efeitos?: boolean;
};

export const PROPS_PADRAO: PropsDemonstracao = {
  numeros: NUMEROS_VAZIOS,
  narracao: [],
  duracaoClipes: {},
  equipe: [],
  musica: 'audio/trilha-longa.mp3', // a trilha de 19/10 esticada para 3:52 (scripts/esticar-trilha.py)
  efeitos: true,
};

// Níveis (arquivos já normalizados: voz −16 LUFS, trilha −16 LUFS, efeitos −20 LUFS).
const TRILHA_LIVRE = 0.355; // −9 dB: a trilha respira entre as frases
const TRILHA_SOB_VOZ = 0.1; // −20 dB: ~20 dB abaixo da voz enquanto ela fala
const RAMPA = 12; // 0,4 s de subida/descida
const fps = video.fps;
const q = (s: number) => Math.round(s * fps);

interface Bloco {
  nome: string;
  inicio: number;
  duracao: number;
  mascara: boolean;
}

interface Montado {
  blocos: Bloco[];
  caps: DefCapitulo[];
  entrada: Plano[];
  coda: Plano[];
  duracaoAbertura: number;
  duracaoFechamento: number;
  falas: { arquivo: string; inicio: number; fim: number }[];
  efeitos: { som: string; quadro: number; volume: number }[];
  total: number;
}

/** Falas de uma cena solta (abertura, fechamento), a partir de `inicio`; depois de pergunta, uma pausa maior. */
function enfileirar(falas: FalaGravada[], inicio: number): { colocadas: FalaNoPlano[]; fim: number } {
  let t = inicio;
  const colocadas = falas.map((f) => {
    const c = { ...f, inicio: t };
    t += f.duracao + (f.texto.trim().endsWith('?') ? 0.42 : RESPIRO);
    return c;
  });
  return { colocadas, fim: colocadas.length ? colocadas[colocadas.length - 1].inicio + colocadas[colocadas.length - 1].duracao : inicio };
}

export function montar({ numeros, narracao, duracaoClipes }: PropsDemonstracao): Montado {
  const caps = capitulos(numeros).map((c) => ({ ...c, planos: sincronizar(c.planos, narracao, { primeiroAbre: true, duracaoClipe: duracaoClipes }) }));
  const entradaSinc = sincronizar(entrada, narracao, { duracaoClipe: duracaoClipes });
  const codaSinc = sincronizar(coda, narracao, { duracaoClipe: duracaoClipes });
  const abertura = enfileirar(narracao.filter((f) => f.cena === 'abertura'), 0.8);
  const fechamento = enfileirar(narracao.filter((f) => f.cena === 'fechamento'), 0.9);
  const duracaoAbertura = Math.max(DURACAO_ABERTURA, q(abertura.fim + 1.6));
  const duracaoFechamento = Math.max(DURACAO_FECHAMENTO, q(fechamento.fim + 2.4));

  const lista = [
    { nome: 'abertura', duracao: duracaoAbertura, mascara: false },
    { nome: 'entrada', duracao: duracaoCapitulo(entradaSinc), mascara: true },
    ...caps.map((c) => ({ nome: `capitulo-${c.numero}`, duracao: duracaoCapitulo(c.planos), mascara: true })),
    { nome: 'coda', duracao: duracaoCapitulo(codaSinc), mascara: true },
    { nome: 'fechamento', duracao: duracaoFechamento, mascara: true },
  ];
  let t = 0;
  const blocos = lista.map((b) => {
    if (b.mascara) t -= TRANSICAO;
    const bloco = { ...b, inicio: t };
    t += b.duracao;
    return bloco;
  });
  const inicio = (nome: string) => blocos.find((b) => b.nome === nome)!.inicio;

  const falas: Montado['falas'] = [];
  const efeitos: Montado['efeitos'] = [];
  const porFala = (base: number, f: FalaNoPlano) => falas.push({ arquivo: f.arquivo, inicio: base + q(f.inicio), fim: base + q(f.inicio + f.duracao) });
  const porPlanos = (base: number, planos: Plano[]) => {
    const { inicios } = linhaDoTempo(planos);
    planos.forEach((p, i) => {
      (p.falas ?? []).forEach((f) => porFala(base + inicios[i], f));
      (p.efeitos ?? []).forEach((e) => efeitos.push({ som: e.som, quadro: base + inicios[i] + q(e.t ?? 0), volume: e.volume ?? 0.5 }));
    });
  };
  abertura.colocadas.forEach((f) => porFala(0, f));
  porPlanos(inicio('entrada'), entradaSinc);
  caps.forEach((c, i) => {
    const base = inicio(`capitulo-${c.numero}`);
    porPlanos(base, c.planos);
    efeitos.push({ som: `transicao-${(i % 3) + 1}`, quadro: Math.max(0, base - 6), volume: 0.42 });
    c.indicadores.forEach((_, k) => efeitos.push({ som: k % 2 ? 'tique-b' : 'tique-a', quadro: base + 48 + k * 8, volume: 0.3 }));
  });
  porPlanos(inicio('coda'), codaSinc);
  fechamento.colocadas.forEach((f) => porFala(inicio('fechamento'), f));

  return { blocos, caps, entrada: entradaSinc, coda: codaSinc, duracaoAbertura, duracaoFechamento, falas, efeitos, total: t };
}

export const duracaoTotal = (props: PropsDemonstracao) => montar(props).total;

export const calcularDemonstracao: CalculateMetadataFunction<PropsDemonstracao> = async ({ props }) => {
  const [numeros, narracao, duracaoClipes] = await Promise.all([carregarNumeros(), carregarNarracao(), carregarDuracaoClipes()]);
  const completas = { ...props, numeros, narracao, duracaoClipes };
  return { props: completas, durationInFrames: duracaoTotal(completas) };
};

/** Volume da trilha: abaixa sob a voz com rampas de 0,4 s, entra devagar e sai no fim. */
function volumeTrilha(falas: Montado['falas'], total: number) {
  return (f: number) => {
    let voz = 0;
    for (const { inicio, fim } of falas) {
      if (f < inicio - RAMPA || f > fim + RAMPA) continue;
      voz = Math.max(voz, f < inicio ? (f - (inicio - RAMPA)) / RAMPA : f > fim ? 1 - (f - fim) / RAMPA : 1);
      if (voz >= 1) break;
    }
    const entra = Math.min(1, f / q(1.2));
    const sai = Math.min(1, Math.max(0, (total - f) / q(2.5)));
    return (TRILHA_LIVRE + (TRILHA_SOB_VOZ - TRILHA_LIVRE) * voz) * entra * sai;
  };
}

export function Demonstracao(props: PropsDemonstracao) {
  const { equipe = [], musica, efeitos: comEfeitos = true } = props;
  const m = montar(props);
  const cena = (nome: string) => {
    if (nome === 'abertura') return <Abertura duracao={m.duracaoAbertura} />;
    if (nome === 'fechamento') return <Fechamento equipe={equipe} />;
    if (nome === 'entrada') return <Montagem planos={m.entrada} />;
    if (nome === 'coda') return <Montagem planos={m.coda} />;
    const c = m.caps.find((x) => `capitulo-${x.numero}` === nome)!;
    return <CenaCapitulo numero={c.numero} linhas={c.linhas} rotuloMonitor={c.rotuloMonitor} indicadores={c.indicadores} planos={c.planos} />;
  };
  return (
    <AbsoluteFill style={{ background: escuro.fundo }}>
      {m.blocos.map((b) => (
        <Sequence key={b.nome} from={b.inicio} durationInFrames={b.duracao} name={b.nome}>
          {b.mascara ? <EntradaMascara>{cena(b.nome)}</EntradaMascara> : cena(b.nome)}
        </Sequence>
      ))}
      {m.falas.map((f) => (
        <Sequence key={`${f.arquivo}-${f.inicio}`} from={f.inicio} durationInFrames={f.fim - f.inicio + 6} name={`voz ${f.arquivo}`} layout="none">
          <Audio src={staticFile(f.arquivo)} />
        </Sequence>
      ))}
      {comEfeitos &&
        m.efeitos.map((e) => (
          <Sequence key={`${e.som}-${e.quadro}`} from={e.quadro} durationInFrames={q(3)} name={`efeito ${e.som}`} layout="none">
            <Audio src={staticFile(`audio/sfx/${e.som}.mp3`)} volume={e.volume} />
          </Sequence>
        ))}
      {musica && <Audio src={staticFile(musica)} volume={volumeTrilha(m.falas, m.total)} />}
    </AbsoluteFill>
  );
}
