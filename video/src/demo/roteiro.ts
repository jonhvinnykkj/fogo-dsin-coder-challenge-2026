// Roteiro da demonstração: quais trechos de cada gravação entram, em que velocidade, com que câmera e legenda.
// Tempos em segundos. `de` = onde o trecho começa na gravação; `dur` = quanto fica na tela; câmera e legendas usam o
// tempo da tela, contado do início do plano. O 1º plano de cada capítulo começa dentro do monitor da abertura e abre
// para a tela cheia aos ~5,4 s (ABERTURA_CAPITULO + expansão), por isso as legendas dele começam depois disso.
import { CalendarBlank, Gauge, IdentificationBadge, MapTrifold, SquaresFour, TrafficCone, TrendDown, WarningDiamond } from '@phosphor-icons/react';
import type { IndicadorCapitulo } from './CenaCapitulo';
import { br, type Numeros } from './dados';
import type { Plano } from './Montagem';

export interface DefCapitulo {
  numero: string;
  linhas: string[];
  rotuloMonitor: string;
  indicadores: IndicadorCapitulo[];
  planos: Plano[];
}

/** Enquadramento que mostra o conteúdo inteiro do app sem cortar o menu lateral no meio (corta na borda dele). */
const SEM_MENU = { x: 0.5615, zoom: 1.14 };
/** Lista de equipamentos: o conteúdo vai de x 248 a ~1640 da gravação; centraliza e enche a tela com ele. */
const LISTA = { x: 0.4917, zoom: 1.37 };
/** Previsões: conteúdo de x 248 a ~1500 (à direita fica o índice da página); a tela mostra só o conteúdo. */
const PREVISOES = { x: 0.4516, zoom: 1.52 };

/** Câmera parada em tela inteira enquanto o plano está no monitor da abertura; depois aproxima. */
const abreEm = (x: number, y: number, zoom: number, depois?: { t: number; x: number; y: number; zoom: number }) => [
  { t: 0, x: 0.5, y: 0.5, zoom: 1 },
  { t: 5.2, x: 0.5, y: 0.5, zoom: 1 },
  { t: 6.6, x, y, zoom },
  ...(depois ? [depois] : []),
];

export function capitulos(n: Numeros): DefCapitulo[] {
  return [
    {
      numero: '1',
      linhas: ['Inventário', 'da cidade'],
      rotuloMonitor: 'Inventário · Marília',
      indicadores: [
        { valor: n.equipamentos, rotulo: 'Equipamentos', Icone: TrafficCone },
        { valor: n.tipos, rotulo: 'Tipos de equipamento', Icone: SquaresFour, destaque: true },
        { valor: n.agentes, rotulo: 'Agentes cadastrados', Icone: IdentificationBadge },
      ],
      planos: [
        {
          clipe: 'inv-lista',
          de: 0.3,
          dur: 10.7,
          velocidade: 1.35,
          camera: abreEm(LISTA.x, 0.32, LISTA.zoom, { t: 10.7, x: LISTA.x, y: 0.34, zoom: 1.4 }),
          legendas: [{ linhas: [{ texto: 'Todo equipamento, com busca e filtros.', destaque: 'busca' }], de: 6.3, ate: 10.2, com: ['n04'], naoAntes: 5.6 }],
        },
        {
          clipe: 'inv-ficha',
          de: 0.4,
          dur: 5.6,
          velocidade: 1.3,
          camera: [
            { t: 0, x: SEM_MENU.x, y: 0.4, zoom: SEM_MENU.zoom },
            { t: 5.6, x: 0.55, y: 0.5, zoom: 1.2 },
          ],
          legendas: [{ linhas: [{ texto: 'Na ficha: tipo, telemetria e manutenções.', destaque: 'telemetria' }], de: 0.5, ate: 5.1, com: ['n05'] }],
        },
        {
          id: 'inv-novo-a',
          clipe: 'inv-novo',
          de: 3.2,
          dur: 5.6,
          velocidade: 1.5,
          entrada: 'empurrar',
          camera: [
            { t: 0, x: 0.435, y: 0.34, zoom: 1.6 },
            { t: 5.6, x: 0.435, y: 0.36, zoom: 1.66 },
          ],
          legendas: [{ linhas: [{ texto: 'O CEP preenche a rua; a cidade é Marília/SP.', destaque: 'Marília/SP' }], de: 0.6, ate: 5.1, com: ['n06'] }],
        },
        {
          id: 'inv-novo-b',
          clipe: 'inv-novo',
          de: 15.2,
          dur: 6.4,
          velocidade: 1.5,
          camera: [
            { t: 0, x: 0.468, y: 0.45, zoom: 1.45 },
            { t: 6.4, x: 0.468, y: 0.75, zoom: 1.5 },
          ],
          legendas: [{ linhas: [{ texto: 'Ponto no mapa e os campos do tipo:' }, { texto: 'câmera com visão noturna.', destaque: 'noturna' }], de: 0.8, ate: 5.9, com: ['n07'] }],
        },
        {
          clipe: 'inv-agentes',
          de: 0.3,
          dur: 4.4,
          velocidade: 1.2,
          entrada: 'empurrar',
          camera: [
            { t: 0, x: SEM_MENU.x, y: 0.38, zoom: SEM_MENU.zoom },
            { t: 4.4, x: 0.57, y: 0.42, zoom: 1.2 },
          ],
          legendas: [{ linhas: [{ texto: `E os ${br(n.agentes)} agentes, com situação e base.`, destaque: 'agentes' }], de: 0.5, ate: 4.0, com: ['n08'] }],
        },
      ],
    },
    {
      numero: '2',
      linhas: ['Central de', 'Operações'],
      rotuloMonitor: 'Central de Operações · Marília',
      indicadores: [
        { valor: n.disponibilidadePct, casas: 1, sufixo: '%', rotulo: 'Disponibilidade', Icone: Gauge, destaque: true },
        { valor: n.agentesEmAtividade, rotulo: 'Agentes em atividade', Icone: IdentificationBadge },
        { valor: n.alertasAbertos, rotulo: 'Alertas abertos', Icone: WarningDiamond },
      ],
      planos: [
        {
          clipe: 'cen-geral',
          de: 0,
          dur: 9.6,
          camera: abreEm(SEM_MENU.x, 0.45, SEM_MENU.zoom, { t: 9.6, x: 0.6, y: 0.45, zoom: 1.2 }),
          legendas: [{ linhas: [{ texto: 'Placas, mapa ao vivo e o feed de alertas.', destaque: 'feed' }], de: 5.6, ate: 9.2, com: ['n09'], naoAntes: 5.6 }],
        },
        {
          clipe: 'cen-acidente',
          de: 1.5,
          efeitos: [{ som: 'alerta', src: 4.7, volume: 0.55 }],
          dur: 11.0,
          velocidade: 1.1,
          entrada: 'empurrar',
          camera: [
            { t: 0, x: 0.5, y: 0.5, zoom: 1 },
            { t: 2.6, x: 0.5, y: 0.5, zoom: 1 },
            { t: 4.6, x: 0.52, y: 0.55, zoom: 1.28 },
            { t: 6.6, x: 0.52, y: 0.55, zoom: 1.28 },
            { t: 8.2, x: 0.74, y: 0.36, zoom: 1.32 },
            { t: 11.0, x: 0.74, y: 0.38, zoom: 1.36 },
          ],
          legendas: [
            { linhas: [{ texto: 'Acidente injetado: alerta crítico na hora.', destaque: 'crítico' }], de: 2.4, ate: 6.1, lado: 'direita', com: ['n10', 'n11'] },
            { linhas: [{ texto: 'O mapa vai ao local e o bairro muda de cor.', destaque: 'cor' }], de: 6.4, ate: 10.6, com: ['n12'] },
          ],
        },
        {
          clipe: 'cen-ficha',
          de: 2.6,
          dur: 5.6,
          velocidade: 1.1,
          camera: [
            { t: 0, x: 0.5, y: 0.5, zoom: 1 },
            { t: 1.4, x: 0.5, y: 0.5, zoom: 1 },
            { t: 3.0, x: 0.72, y: 0.45, zoom: 1.26 },
            { t: 5.6, x: 0.74, y: 0.47, zoom: 1.3 },
          ],
          legendas: [{ linhas: [{ texto: 'Um clique no marcador abre a ficha ao lado.', destaque: 'ficha' }], de: 1.2, ate: 5.2, com: ['n13'] }],
        },
        {
          clipe: 'cen-filtro',
          de: 0.8,
          dur: 5.6,
          velocidade: 1.2,
          entrada: 'empurrar',
          camera: [
            { t: 0, x: 0.42, y: 0.3, zoom: 1.12 },
            { t: 5.6, x: 0.42, y: 0.28, zoom: 1.2 },
          ],
          legendas: [{ linhas: [{ texto: 'O filtro vale para o mapa e para as placas.', destaque: 'filtro' }], de: 1.0, ate: 5.2, com: ['n14'] }],
        },
        {
          clipe: 'cen-regioes',
          de: 0.8,
          dur: 5.0,
          velocidade: 1.1,
          camera: [
            { t: 0, x: SEM_MENU.x, y: 0.42, zoom: SEM_MENU.zoom },
            { t: 1.6, x: 0.84, y: 0.42, zoom: 1.32 },
            { t: 5.0, x: 0.84, y: 0.44, zoom: 1.36 },
          ],
          legendas: [{ linhas: [{ texto: 'Regiões: quem opera normal e quem pede atenção.', destaque: 'normal' }], de: 0.6, ate: 4.6, com: ['n15'] }],
        },
        {
          clipe: 'cen-60x',
          de: 2.4,
          dur: 7.0,
          entrada: 'mascara',
          camera: [
            { t: 0, x: 0.4, y: 0.6, zoom: 1.1 },
            { t: 7.0, x: 0.4, y: 0.55, zoom: 1.18 },
          ],
          legendas: [{ linhas: [{ texto: 'Em 60×, agentes andam e eventos não param.', destaque: '60×' }], de: 1.0, ate: 6.6, lado: 'direita', com: ['n16'] }],
        },
        {
          clipe: 'cen-calor',
          de: 0.6,
          dur: 5.4,
          camera: [
            { t: 0, x: 0.45, y: 0.5, zoom: 1.04 },
            { t: 1.4, x: 0.45, y: 0.5, zoom: 1.04 },
            { t: 5.4, x: 0.5, y: 0.56, zoom: 1.34 },
          ],
          legendas: [{ linhas: [{ texto: 'O calor mostra onde as ocorrências se juntam.', destaque: 'calor' }], de: 0.8, ate: 5.0, com: ['n17'] }],
        },
      ],
    },
    {
      numero: '3',
      linhas: ['Cidade', 'preditiva'],
      rotuloMonitor: 'Previsões · Marília',
      indicadores: [
        { valor: n.ganhoPct, casas: 1, sufixo: '%', rotulo: 'Menos erro que a média simples', Icone: TrendDown, destaque: true },
        { valor: n.bairros, rotulo: 'Bairros com risco por hora', Icone: MapTrifold },
        { valor: n.dias, rotulo: 'Dias de previsão', Icone: CalendarBlank },
      ],
      planos: [
        {
          clipe: 'prev-resumo',
          de: 0,
          dur: 9.4,
          velocidade: 0.9,
          camera: abreEm(PREVISOES.x, 0.45, PREVISOES.zoom, { t: 9.4, x: PREVISOES.x, y: 0.6, zoom: 1.56 }),
          legendas: [{ linhas: [{ texto: 'Cada previsão diz o que prevê e que dados usa.', destaque: 'dados' }], de: 5.6, ate: 9.0, com: ['n19'], naoAntes: 5.6 }],
        },
        {
          clipe: 'prev-risco',
          de: 0.6,
          dur: 7.6,
          velocidade: 1.25,
          entrada: 'empurrar',
          camera: [
            { t: 0, x: PREVISOES.x, y: 0.38, zoom: PREVISOES.zoom },
            { t: 7.6, x: PREVISOES.x, y: 0.42, zoom: 1.56 },
          ],
          legendas: [{ linhas: [{ texto: 'Risco por bairro e hora: a régua toca as 24 h.', destaque: '24' }], de: 2.0, ate: 7.2, com: ['n20'] }],
        },
        {
          clipe: 'prev-semana',
          de: 0.8,
          dur: 6.0,
          velocidade: 1.2,
          camera: [
            { t: 0, x: PREVISOES.x, y: 0.36, zoom: PREVISOES.zoom },
            { t: 6.0, x: PREVISOES.x, y: 0.34, zoom: 1.56 },
          ],
          legendas: [{ linhas: [{ texto: '7 dias em blocos de 3 h; o clique mostra os fatores.', destaque: 'fatores' }], de: 1.0, ate: 5.6, com: ['n21'] }],
        },
        {
          clipe: 'prev-acertou',
          de: 0.6,
          dur: 6.4,
          velocidade: 1.15,
          entrada: 'empurrar',
          camera: [
            { t: 0, x: PREVISOES.x, y: 0.34, zoom: PREVISOES.zoom },
            { t: 6.4, x: PREVISOES.x, y: 0.36, zoom: 1.56 },
          ],
          legendas: [
            {
              linhas: [{ texto: `Teste de ${br(n.diasTeste)} dias: ${br(n.ganhoPct, 1)}% menos erro` }, { texto: 'que a média simples.', destaque: 'média' }],
              de: 1.0,
              ate: 6.0,
              com: ['n22', 'n23'],
            },
          ],
        },
        {
          clipe: 'prev-reforco',
          de: 0.5,
          dur: 4.8,
          velocidade: 1.1,
          camera: [
            { t: 0, x: PREVISOES.x, y: 0.38, zoom: PREVISOES.zoom },
            { t: 4.8, x: PREVISOES.x, y: 0.4, zoom: 1.56 },
          ],
          legendas: [{ linhas: [{ texto: 'Reforço: quem mover, para onde e quando.', destaque: 'Reforço' }], de: 0.4, ate: 4.4, com: ['n24'] }],
        },
        {
          clipe: 'prev-falhas',
          de: 0.5,
          dur: 4.8,
          velocidade: 1.1,
          entrada: 'empurrar',
          camera: [
            { t: 0, x: PREVISOES.x, y: 0.38, zoom: PREVISOES.zoom },
            { t: 4.8, x: PREVISOES.x, y: 0.4, zoom: 1.56 },
          ],
          legendas: [{ linhas: [{ texto: 'Falhas prováveis, com o porquê de cada uma.', destaque: 'porquê' }], de: 0.4, ate: 4.4, com: ['n25'] }],
        },
      ],
    },
  ];
}

/** O toque no interruptor: o tema claro é o padrão do sistema. */
export const coda: Plano[] = [
  {
    id: 'coda',
    clipe: 'tema',
    de: 0.3,
    dur: 4.7,
    camera: [{ t: 0, x: 0.5, y: 0.5, zoom: 1 }],
    legendas: [{ linhas: [{ texto: 'O padrão é o tema claro; o escuro é escolha.', destaque: 'claro' }], de: 0.5, ate: 4.3, com: ['n26'] }],
  },
];
