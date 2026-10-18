// Narração do vídeo, frase por frase, cada uma presa à sua cena.
// `texto` é a frase como se escreve (roteiro, relatório); `fala` é o que vai para a voz: F.O.G.O. vira "Fogo",
// números vão por extenso e "DSIN" nunca é falado (fica só na tela). Os números vêm dos JSONs da gravação.
// scripts/narracao-json.mjs imprime esta lista já com os números; scripts/narrar.py grava public/audio/narracao/.
// Sem import de runtime aqui: o Node lê este arquivo direto (--experimental-strip-types).

export type CenaNarrada =
  | 'abertura'
  | 'inv-lista'
  | 'inv-ficha'
  | 'inv-novo-a'
  | 'inv-novo-b'
  | 'inv-agentes'
  | 'cen-geral'
  | 'cen-acidente'
  | 'cen-ficha'
  | 'cen-filtro'
  | 'cen-regioes'
  | 'cen-60x'
  | 'cen-calor'
  | 'prev-resumo'
  | 'prev-risco'
  | 'prev-semana'
  | 'prev-acertou'
  | 'prev-reforco'
  | 'prev-falhas'
  | 'coda'
  | 'fechamento';

export interface FraseNarracao {
  id: string;
  cena: CenaNarrada;
  texto: string;
  fala: string;
  /** Pergunta: vai sozinha para a voz, com ajustes próprios e várias tomadas (escolhe a que sobe no fim). */
  pergunta?: boolean;
  /** Tomadas a gerar (padrão 1; "Claude Code" pede 2 para escolher a que a transcrição entende). */
  tomadas?: number;
  /** Gera sem previous_text/next_text (quando o contexto atrapalha a pronúncia). */
  semContexto?: boolean;
  /** Palavras que a transcrição precisa ouvir (sem acento) para a tomada valer. */
  exigir?: string[];
}

export interface NumerosNarracao {
  equipamentos: number;
  tipos: number;
  agentes: number;
  ganhoPct: number;
  diasTeste: number;
}

const UNIDADES = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

/** Inteiro de 0 a 999 por extenso (o suficiente para os números do vídeo). */
export function porExtenso(n: number): string {
  const v = Math.round(n);
  if (v < 0 || v > 999) return String(v);
  if (v < 20) return UNIDADES[v];
  if (v < 100) return DEZENAS[Math.floor(v / 10)] + (v % 10 ? ` e ${UNIDADES[v % 10]}` : '');
  if (v === 100) return 'cem';
  const resto = v % 100;
  return CENTENAS[Math.floor(v / 100)] + (resto ? ` e ${porExtenso(resto)}` : '');
}

/** Porcentagem falada: 7,0 → "sete por cento"; 7,4 → "sete vírgula quatro por cento". */
export function porcentagemFalada(valor: number): string {
  const inteiro = Math.floor(valor);
  const decimo = Math.round((valor - inteiro) * 10);
  return `${porExtenso(inteiro)}${decimo ? ` vírgula ${porExtenso(decimo)}` : ''} por cento`;
}

const br = (valor: number, casas = 0) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }).format(valor);

/** Frase em que a escrita e a fala só diferem pelos números/siglas. */
const f = (id: string, cena: CenaNarrada, texto: string, fala = texto, extra: Partial<FraseNarracao> = {}): FraseNarracao => ({ id, cena, texto, fala, ...extra });

export function narracao(n: NumerosNarracao): FraseNarracao[] {
  const ext = porExtenso;
  return [
    f('n01', 'abertura', 'Se algo acontece na cidade agora, a central percebe?', undefined, { pergunta: true, tomadas: 4 }),
    f('n02', 'abertura', 'Com o F.O.G.O., a central de Marília percebe.', 'Com o Fogo, a central de Marília percebe.'),

    f(
      'n03',
      'inv-lista',
      `Primeiro, o inventário: ${br(n.equipamentos)} equipamentos, de ${br(n.tipos)} tipos, e ${br(n.agentes)} agentes.`,
      `Primeiro, o inventário: ${ext(n.equipamentos)} equipamentos, de ${ext(n.tipos)} tipos, e ${ext(n.agentes)} agentes.`,
    ),
    f('n04', 'inv-lista', 'Dá para buscar e filtrar do jeito que precisar.'),
    f('n05', 'inv-ficha', 'Cada equipamento tem ficha, telemetria e histórico de manutenção.'),
    // "Marília" sai com o "-lia" bem brasileiro, perto de "-lha": a transcrição (small e medium) escreve "marilha" em
    // todas as 12 tomadas testadas; ficou a com contexto, que emenda melhor com as vizinhas
    f('n06', 'inv-novo-a', 'No cadastro, a cidade é sempre Marília, e o CEP preenche a rua.', undefined, { tomadas: 2 }),
    f('n07', 'inv-novo-b', 'O ponto vai no mapa, e cada tipo tem seus campos, como a visão noturna da câmera.'),
    f('n08', 'inv-agentes', `E os ${br(n.agentes)} agentes, com situação, turno e base.`, `E os ${ext(n.agentes)} agentes, com situação, turno e base.`),

    f('n09', 'cen-geral', 'Agora, a central em tempo real: placas, mapa ao vivo e o feed de alertas.'),
    f('n10', 'cen-acidente', 'Vamos injetar um acidente.'),
    f('n11', 'cen-acidente', 'Na hora, surge o alerta crítico, e o mapa vai até o local.'),
    f('n12', 'cen-acidente', 'O bairro muda de cor, porque a atenção ali subiu.'),
    f('n13', 'cen-ficha', 'Um clique no marcador abre a ficha, sem sair do mapa.'),
    f('n14', 'cen-filtro', 'Os filtros valem para o mapa e para as placas.'),
    f('n15', 'cen-regioes', 'As regiões mostram quem opera normal e quem pede atenção.'),
    f('n16', 'cen-60x', 'Em 60×, os agentes andam e os eventos não param.', 'Em sessenta vezes, os agentes andam e os eventos não param.'),
    f('n17', 'cen-calor', 'E o calor mostra onde as ocorrências se concentram.'),

    f('n18', 'prev-resumo', 'Por fim, as previsões. O resumo do dia diz o que fazer hoje.'),
    f('n19', 'prev-resumo', 'E cada previsão explica o que prevê e quais dados usa.'),
    f('n20', 'prev-risco', 'O risco de cada bairro, hora a hora, nas próximas 24 horas.', 'O risco de cada bairro, hora a hora, nas próximas vinte e quatro horas.'),
    f('n21', 'prev-semana', 'A semana em blocos de 3 horas; um clique mostra o que pesa.', 'A semana em blocos de três horas; um clique mostra o que pesa.'),
    f(
      'n22',
      'prev-acertou',
      `No teste dos últimos ${br(n.diasTeste)} dias, o modelo errou ${br(n.ganhoPct, 1)}% menos que a média simples.`,
      `No teste dos últimos ${ext(n.diasTeste)} dias, o modelo errou ${porcentagemFalada(n.ganhoPct)} menos que a média simples.`,
    ),
    f('n23', 'prev-acertou', 'É um ganho modesto, dito sem exagero.'),
    f('n24', 'prev-reforco', 'O reforço sugere quantos agentes mover, para onde e quando.'),
    f('n25', 'prev-falhas', 'E as falhas prováveis vêm com o motivo de cada uma.'),

    f('n26', 'coda', 'O tema claro é o padrão; o escuro é escolha de quem opera.'),
    // "com o Claude Code", sem contexto: com a frase anterior como contexto a voz diz "Clôdo Códo"; sozinha, a transcrição
    // ouve "Cloud Code" (a pronúncia em inglês). É a última cena, então não precisa emendar com a anterior.
    f('n27', 'fechamento', 'O F.O.G.O. foi feito com o Claude Code, e o time entende cada parte.', 'O Fogo foi feito com o Claude Code, e o time entende cada parte.', { tomadas: 2, semContexto: true }),
  ];
}
