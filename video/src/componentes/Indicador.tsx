// Placa de indicador como a faixa da Central: bloco de cor cheia, número grande condensado no topo, rótulo com ícone
// embaixo. O bloco abre da esquerda e o número conta até o valor real, no formato brasileiro (96,1%).
import type { Icon } from '@phosphor-icons/react';
import { useCurrentFrame } from 'remotion';
import { curva, fonte, forma } from '../tema';
import { mistura, progresso } from '../tempo';

interface Props {
  valor: number;
  casas?: number;
  sufixo?: string;
  rotulo: string;
  Icone: Icon;
  fundo: string;
  cor: string;
  largura: number;
  altura: number;
  inicio?: number;
  duracao?: number;
  tamanhoNumero?: number;
}

export function Indicador({ valor, casas = 0, sufixo = '', rotulo, Icone, fundo, cor, largura, altura, inicio = 0, duracao = 36, tamanhoNumero = 128 }: Props) {
  const frame = useCurrentFrame();
  const abre = progresso(frame, inicio, 16);
  const conta = progresso(frame, inicio + 4, duracao, curva.entrada);
  const formato = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
  const atual = casas === 0 ? Math.round(valor * conta) : valor * conta;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        width: largura,
        height: altura,
        padding: '18px 28px 20px',
        borderRadius: forma.raio,
        background: fundo,
        color: cor,
        fontFamily: fonte.familia,
        clipPath: `inset(0 ${(1 - abre) * 100}% 0 0)`,
      }}
    >
      <div
        style={{
          fontSize: tamanhoNumero,
          fontWeight: 800,
          fontStretch: fonte.condensada,
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 0.9,
          letterSpacing: '-0.01em',
          translate: `${mistura(-40, 0, abre)}px 0`,
        }}
      >
        {formato.format(atual)}
        {sufixo}
      </div>
      <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 10, fontSize: 27, fontWeight: 700, lineHeight: 1.1, opacity: progresso(frame, inicio + 8, 12) }}>
        <Icone weight="fill" size={30} />
        {rotulo}
      </div>
    </div>
  );
}
