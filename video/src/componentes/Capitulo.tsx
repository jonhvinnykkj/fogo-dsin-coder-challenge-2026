// Abertura de capítulo nos três jeitos dos quadros de estilo:
// - cartaz: rótulo, número enorme condensado e título pesado, grafite sobre o laranja (A);
// - faixa: o rótulo do capítulo "rola" para dentro da faixa do topo, no lugar do subtítulo do app (B);
// - sala: rótulo laranja e título claro sobre o grafite da Sala de controle (C).
import type { ReactNode } from 'react';
import { useCurrentFrame } from 'remotion';
import { claro, fonte, forma, marca, type Tema } from '../tema';
import { progresso } from '../tempo';
import { Revelar } from './Revelar';

export type EstiloCapitulo = 'cartaz' | 'faixa' | 'sala';

interface PropsBase {
  numero: string;
  /** Título em linhas (cartaz e sala quebram onde você mandar; a faixa junta tudo numa linha). */
  linhas: string[];
  inicio?: number;
  tema?: Tema;
}

interface PropsCapitulo extends PropsBase {
  estilo: EstiloCapitulo;
  /** Só na faixa: o que estava escrito antes (sai para cima). */
  anterior?: ReactNode;
  tamanhoNumero?: number;
  tamanhoTitulo?: number;
}

export function Capitulo({ estilo, ...props }: PropsCapitulo) {
  if (estilo === 'cartaz') return <CapituloCartaz {...props} />;
  if (estilo === 'faixa') return <CapituloFaixa {...props} />;
  return <CapituloSala {...props} />;
}

const rotulo = { fontSize: 26, fontWeight: 800, fontStretch: fonte.expandida, letterSpacing: '0.16em', textTransform: 'uppercase', lineHeight: 1 } as const;

export function CapituloCartaz({ numero, linhas, inicio = 0, tamanhoNumero = 600, tamanhoTitulo = 112 }: PropsBase & { tamanhoNumero?: number; tamanhoTitulo?: number }) {
  const frame = useCurrentFrame();
  const abre = progresso(frame, inicio, 26);
  return (
    <div style={{ fontFamily: fonte.familia, color: marca.sobreFogo }}>
      <Revelar inicio={inicio} duracao={14}>
        <div style={{ ...rotulo, letterSpacing: `${0.5 - 0.34 * abre}em` }}>Capítulo</div>
      </Revelar>
      <div style={{ marginTop: 18 }}>
        <Revelar inicio={inicio + 2} duracao={20} folga={0.1}>
          <div
            style={{
              fontSize: tamanhoNumero,
              fontWeight: 900,
              fontStretch: fonte.condensada,
              lineHeight: 0.74,
              letterSpacing: '-0.04em',
              scale: `${1.12 - 0.12 * abre}`,
              transformOrigin: '0% 100%',
            }}
          >
            {numero}
          </div>
        </Revelar>
      </div>
      <div style={{ marginTop: 34 }}>
        {linhas.map((linha, i) => (
          <Revelar key={linha} inicio={inicio + 9 + i * 4} duracao={18}>
            <div style={{ fontSize: tamanhoTitulo, fontWeight: 900, lineHeight: 0.98, letterSpacing: '-0.025em', whiteSpace: 'nowrap' }}>{linha}</div>
          </Revelar>
        ))}
      </div>
    </div>
  );
}

export function CapituloFaixa({ numero, linhas, inicio = 0, tema = claro, anterior }: PropsBase & { anterior?: ReactNode }) {
  const frame = useCurrentFrame();
  const troca = progresso(frame, inicio, 16);
  const titulo = linhas.join(' ');
  return (
    <div style={{ position: 'absolute', inset: 0, fontFamily: fonte.familia }}>
      {anterior && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', translate: `0 ${-troca * 100}%`, opacity: 1 - troca }}>{anterior}</div>
      )}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', gap: 16, translate: `0 ${(1 - troca) * 100}%` }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 50,
            height: 50,
            borderRadius: forma.raio,
            background: marca.fogo,
            color: marca.sobreFogo,
            fontSize: 34,
            fontWeight: 900,
            fontStretch: fonte.condensada,
            lineHeight: 1,
          }}
        >
          {numero}
        </span>
        <span style={{ color: tema.sobreFaixa, fontSize: 31, fontWeight: 800, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>{titulo}</span>
      </div>
    </div>
  );
}

export function CapituloSala({ numero, linhas, inicio = 0, tema = claro, tamanhoTitulo = 76 }: PropsBase & { tamanhoTitulo?: number }) {
  return (
    <div style={{ fontFamily: fonte.familia }}>
      <Revelar inicio={inicio} duracao={14}>
        <div style={{ ...rotulo, fontSize: 24, letterSpacing: '0.14em', color: tema.fogoTexto }}>Capítulo {numero}</div>
      </Revelar>
      <div style={{ marginTop: 20 }}>
        {linhas.map((linha, i) => (
          <Revelar key={linha} inicio={inicio + 5 + i * 4} duracao={18}>
            <div style={{ color: tema.texto, fontSize: tamanhoTitulo, fontWeight: 900, lineHeight: 0.98, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>{linha}</div>
          </Revelar>
        ))}
      </div>
    </div>
  );
}
