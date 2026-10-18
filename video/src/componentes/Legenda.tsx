// Legenda curta em pt-BR, em três formas:
// - bloco: placa grafite que abre da esquerda e as palavras sobem (A);
// - etiqueta: cada linha é uma etiqueta de cor cheia com o formato das etiquetas do app ("Prioridade alta") (B);
// - marcador: texto claro sobre o grafite e a palavra-chave ganha um bloco laranja por trás (C).
import type { CSSProperties } from 'react';
import { interpolateColors, useCurrentFrame } from 'remotion';
import { curva, fonte, forma, marca } from '../tema';
import { mistura, progresso } from '../tempo';

export type EstiloLegenda = 'bloco' | 'etiqueta' | 'marcador';

export interface LinhaLegenda {
  texto: string;
  /** etiqueta: cor cheia da etiqueta e do texto. */
  fundo?: string;
  cor?: string;
  /** marcador: palavra que ganha o bloco laranja. */
  destaque?: string;
}

interface Props {
  estilo: EstiloLegenda;
  linhas: LinhaLegenda[];
  inicio?: number;
  tamanho?: number;
  /** bloco: cor da placa e do texto; marcador: cor do texto. */
  fundo?: string;
  cor?: string;
  style?: CSSProperties;
}

export function Legenda({ estilo, linhas, inicio = 0, tamanho = 40, fundo = marca.sobreFogo, cor = '#F2F2EF', style }: Props) {
  const base: CSSProperties = { fontFamily: fonte.familia, fontSize: tamanho, fontWeight: 700, lineHeight: 1.18, letterSpacing: '-0.005em', ...style };
  if (estilo === 'etiqueta') return <LegendaEtiquetas linhas={linhas} inicio={inicio} style={{ ...base, fontWeight: 800 }} />;
  if (estilo === 'marcador') return <LegendaMarcador linhas={linhas} inicio={inicio} cor={cor} style={base} />;
  return <LegendaBloco linhas={linhas} inicio={inicio} fundo={fundo} cor={cor} style={base} tamanho={tamanho} />;
}

/** Palavras que sobem uma a uma, com atraso fixo entre elas. */
function Palavras({ texto, inicio, passo = 1.6 }: { texto: string; inicio: number; passo?: number }) {
  const frame = useCurrentFrame();
  return (
    <>
      {texto.split(' ').map((palavra, i) => {
        const p = progresso(frame, inicio + i * passo, 12);
        return (
          <span key={`${palavra}-${i}`} style={{ display: 'inline-block', opacity: p, translate: `0 ${mistura(0.45, 0, p)}em`, marginRight: '0.26em' }}>
            {palavra}
          </span>
        );
      })}
    </>
  );
}

function LegendaBloco({ linhas, inicio, fundo, cor, style, tamanho }: { linhas: LinhaLegenda[]; inicio: number; fundo: string; cor: string; style: CSSProperties; tamanho: number }) {
  const frame = useCurrentFrame();
  const abre = progresso(frame, inicio, 14);
  let atraso = inicio + 5;
  return (
    <div
      style={{
        ...style,
        display: 'inline-block',
        // a última palavra já traz 0,26em de margem à direita: o respiro direito desconta isso
        padding: `${tamanho * 0.5}px ${tamanho * 0.48}px ${tamanho * 0.52}px ${tamanho * 0.74}px`,
        background: fundo,
        color: cor,
        clipPath: `inset(0 ${(1 - abre) * 100}% 0 0)`,
        whiteSpace: 'nowrap',
      }}
    >
      {linhas.map((linha) => {
        const comeco = atraso;
        atraso += linha.texto.split(' ').length * 1.6;
        return (
          <div key={linha.texto}>
            <Palavras texto={linha.texto} inicio={comeco} />
          </div>
        );
      })}
    </div>
  );
}

function LegendaEtiquetas({ linhas, inicio, style }: { linhas: LinhaLegenda[]; inicio: number; style: CSSProperties }) {
  const frame = useCurrentFrame();
  return (
    <div style={{ ...style, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
      {linhas.map((linha, i) => {
        const comeco = inicio + i * 7;
        const abre = progresso(frame, comeco, 10);
        const texto = progresso(frame, comeco + 3, 12);
        return (
          <div
            key={linha.texto}
            style={{
              padding: '0.2em 0.42em 0.24em',
              borderRadius: forma.raio,
              background: linha.fundo ?? marca.fogo,
              color: linha.cor ?? marca.sobreFogo,
              whiteSpace: 'nowrap',
              clipPath: `inset(0 ${(1 - abre) * 100}% 0 0)`,
            }}
          >
            <span style={{ display: 'inline-block', opacity: texto, translate: `${mistura(-0.3, 0, texto)}em 0` }}>{linha.texto}</span>
          </div>
        );
      })}
    </div>
  );
}

function LegendaMarcador({ linhas, inicio, cor, style }: { linhas: LinhaLegenda[]; inicio: number; cor: string; style: CSSProperties }) {
  const frame = useCurrentFrame();
  let atraso = inicio;
  return (
    <div style={{ ...style, color: cor, whiteSpace: 'nowrap' }}>
      {linhas.map((linha) => {
        const palavras = linha.texto.split(' ');
        const comeco = atraso;
        atraso += palavras.length * 1.6;
        return (
          <div key={linha.texto}>
            {palavras.map((palavra, i) => {
              const p = progresso(frame, comeco + i * 1.6, 12);
              const limpa = palavra.replace(/[.,;:!?]$/, '');
              const pontuacao = palavra.slice(limpa.length);
              const ehDestaque = linha.destaque !== undefined && limpa === linha.destaque;
              const bloco = ehDestaque ? progresso(frame, comeco + palavras.length * 1.6 + 8, 12) : 0;
              return (
                <span key={`${palavra}-${i}`} style={{ display: 'inline-block', opacity: p, translate: `0 ${mistura(0.45, 0, p)}em`, marginRight: '0.26em' }}>
                  {ehDestaque ? (
                    <span style={{ position: 'relative', display: 'inline-block', padding: '0 0.12em', margin: '0 -0.12em' }}>
                      <span
                        style={{
                          position: 'absolute',
                          inset: '0.06em 0 0.02em',
                          background: marca.fogo,
                          borderRadius: forma.raio,
                          scale: `${bloco} 1`,
                          transformOrigin: '0% 50%',
                        }}
                      />
                      <span style={{ position: 'relative', color: interpolateColors(bloco, [0, 0.6, 1], [cor, cor, marca.sobreFogo]) }}>{limpa}</span>
                    </span>
                  ) : (
                    limpa
                  )}
                  {pontuacao}
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

interface PropsPlaca {
  linhas: LinhaLegenda[];
  /** Quadros (locais) em que a legenda entra e começa a sair. */
  inicio: number;
  fim: number;
  tamanho?: number;
  style?: CSSProperties;
}

/**
 * Legenda por cima da gravação: placa grafite, texto claro e a palavra-chave num bloco laranja (como no quadro C).
 * Abre da esquerda para a direita e fecha de volta para a esquerda.
 */
export function LegendaPlaca({ linhas, inicio, fim, tamanho = 44, style }: PropsPlaca) {
  const frame = useCurrentFrame();
  if (frame < inicio - 1 || frame > fim + 12) return null;
  const abre = progresso(frame, inicio, 12);
  const fecha = progresso(frame, fim, 10, curva.saida);
  const corte = fecha > 0 ? `inset(0 ${fecha * 100}% 0 0)` : `inset(0 ${(1 - abre) * 100}% 0 0)`;
  return (
    <div
      style={{
        display: 'inline-block',
        padding: `${tamanho * 0.34}px ${tamanho * 0.3}px ${tamanho * 0.4}px ${tamanho * 0.56}px`,
        borderRadius: forma.raio,
        background: marca.sobreFogo,
        clipPath: corte,
        ...style,
      }}
    >
      <LegendaMarcador
        linhas={linhas}
        inicio={inicio + 4}
        cor="#EDEDEA"
        style={{ fontFamily: fonte.familia, fontSize: tamanho, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.005em' }}
      />
    </div>
  );
}
