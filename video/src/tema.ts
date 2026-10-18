// Tema do vídeo: os mesmos tokens do app (web/src/estilo/tokens.css), em objetos para usar nos estilos inline do Remotion.
// Claro é o padrão; "Sala de controle" (grafite) só quando a cena pede. Nada de cor fora desta lista.
import { Easing } from 'remotion';

export const marca = {
  fogo: '#F04A00',
  sobreFogo: '#1E1E1F', // grafite sobre laranja: 4,5:1 (branco daria 3,7:1)
  fogoEscuro: '#D44100', // degrau de tom do laranja, para separar blocos sem borda
  fogoTextoEscuro: '#FF7A3D', // laranja que lê sobre grafite
} as const;

export interface Tema {
  nome: 'claro' | 'escuro';
  fundo: string;
  superficie: string;
  superficieBaixa: string;
  superficieAlta: string;
  texto: string;
  textoSuave: string;
  textoFraco: string;
  faixa: string;
  sobreFaixa: string;
  sobreFaixaSuave: string;
  faixaDestaque: string;
  blocoNeutro: string;
  sobreBlocoNeutro: string;
  fogoTexto: string;
}

export const claro: Tema = {
  nome: 'claro',
  fundo: '#F2F2EF',
  superficie: '#FFFFFF',
  superficieBaixa: '#E7E7E3',
  superficieAlta: '#DADAD5',
  texto: '#1E1E1F',
  textoSuave: '#55555A',
  textoFraco: '#68686D',
  faixa: '#1E1E1F',
  sobreFaixa: '#F2F2EF',
  sobreFaixaSuave: '#A8A8AD',
  faixaDestaque: '#34343A',
  blocoNeutro: '#1E1E1F',
  sobreBlocoNeutro: '#FFFFFF',
  fogoTexto: '#B83900',
};

export const escuro: Tema = {
  nome: 'escuro',
  fundo: '#1E1E1F',
  superficie: '#2A2A2C',
  superficieBaixa: '#242426',
  superficieAlta: '#38383B',
  texto: '#EDEDEA',
  textoSuave: '#B3B3B8',
  textoFraco: '#96969C',
  faixa: '#2A2A2C',
  sobreFaixa: '#F2F2EF',
  sobreFaixaSuave: '#A8A8AD',
  faixaDestaque: '#3A3A3E',
  blocoNeutro: '#3A3A3E',
  sobreBlocoNeutro: '#FFFFFF',
  fogoTexto: marca.fogoTextoEscuro,
};

/** Situação dos equipamentos (shared/dominio.ts). */
export const situacao = {
  operacional: '#1F9D55',
  mau_funcionamento: '#E8A400',
  em_manutencao: '#2F6FEB',
  desativado: '#6B7280',
  furtado: '#C2185B',
} as const;

/** Criticidade dos alertas. */
export const criticidade = {
  critica: '#D92D20',
  alta: '#F04A00',
  media: '#E8A400',
  baixa: '#2F6FEB',
} as const;

/** Uma família só, larguras como hierarquia: condensada nos números, expandida na marca. */
export const fonte = {
  familia: "'Archivo Video', 'Archivo Variable', 'Archivo', system-ui, sans-serif",
  condensada: '80%',
  normal: '100%',
  expandida: '125%',
} as const;

/** Cantos: retos (4px, como no app) ou pílula. Em 1920×1080 o canto de 4px do app vira 6px. */
export const forma = { raio: 6, pilula: 999 } as const;

/** Curvas. `app` é a mesma do CSS do sistema; `entrada` e `camera` são do vídeo. */
export const curva = {
  app: Easing.bezier(0.2, 0.7, 0.2, 1),
  entrada: Easing.bezier(0.16, 1, 0.3, 1),
  saida: Easing.bezier(0.7, 0, 0.84, 0),
  camera: Easing.bezier(0.45, 0, 0.15, 1),
} as const;

export const video = { largura: 1920, altura: 1080, fps: 30 } as const;
