// Faixa do topo igual ao cabeçalho do app (grafite, placa laranja com a marca), na escala 1920×1080 (app 1366 × 1,406).
// `centro` recebe o subtítulo do app ou o rótulo do capítulo; `direita`, o status (relógio, ao vivo, Sala de controle).
import { Broadcast, Clock, Moon, Sun } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { interpolateColors, useCurrentFrame } from 'remotion';
import { fonte, forma, marca, situacao, type Tema } from '../tema';
import { progresso } from '../tempo';
import { Marca } from './Marca';

export const ALTURA_FAIXA = 80;

interface Props {
  tema: Tema;
  centro?: ReactNode;
  direita?: ReactNode;
  /** Quadro em que a faixa desce do topo; sem ele, já está no lugar. */
  entrada?: number;
}

export function FaixaTopo({ tema, centro, direita, entrada }: Props) {
  const frame = useCurrentFrame();
  const desce = entrada === undefined ? 1 : progresso(frame, entrada, 14);
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        right: 0,
        height: ALTURA_FAIXA,
        display: 'flex',
        alignItems: 'center',
        gap: 24,
        paddingRight: 24,
        background: tema.faixa,
        color: tema.sobreFaixa,
        fontFamily: fonte.familia,
        translate: `0 ${(desce - 1) * ALTURA_FAIXA}px`,
        zIndex: 10,
      }}
    >
      <Marca altura={ALTURA_FAIXA} />
      <div style={{ position: 'relative', flex: 1, minWidth: 0, height: '100%', display: 'flex', alignItems: 'center', overflow: 'hidden' }}>{centro}</div>
      {direita}
    </div>
  );
}

export function SubtituloFaixa({ tema }: { tema: Tema }) {
  return (
    <span style={{ color: tema.sobreFaixaSuave, fontSize: 18, fontWeight: 600, whiteSpace: 'nowrap' }}>
      Ferramenta Onisciente de Gestão e Operações · Marília
    </span>
  );
}

interface PropsStatus {
  tema: Tema;
  /** Chave "Sala de controle": 0 desligada, 1 ligada (valores no meio animam a troca). */
  chave?: number;
  data?: string;
  hora?: string;
  segundos?: string;
  mostrarRelogio?: boolean;
  mostrarTema?: boolean;
}

const chip = { display: 'inline-flex', alignItems: 'center', gap: 8, height: 40, padding: '0 14px', borderRadius: forma.raio, fontSize: 18, fontWeight: 800, whiteSpace: 'nowrap' } as const;

export function StatusFaixa({ tema, chave = 0, data = 'sáb, 17/10/2026', hora = '17:45', segundos = '05', mostrarRelogio = true, mostrarTema = true }: PropsStatus) {
  const trilho = interpolateColors(chave, [0, 1], [tema.faixaDestaque, marca.fogo]);
  const bolinha = interpolateColors(chave, [0, 1], [tema.sobreFaixaSuave, marca.sobreFogo]);
  const Icone = chave > 0.5 ? Sun : Moon;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 22, flex: 'none' }}>
      {mostrarRelogio && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Clock weight="fill" size={22} color={tema.sobreFaixaSuave} />
          <span style={{ color: tema.sobreFaixaSuave, fontSize: 18, fontWeight: 600 }}>{data}</span>
          <span style={{ fontSize: 27, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
            {hora}
            <span style={{ fontSize: 18, fontWeight: 600, color: tema.sobreFaixaSuave }}>:{segundos}</span>
          </span>
          <span style={{ ...chip, height: 34, padding: '0 10px', background: tema.faixaDestaque, fontSize: 17 }}>1×</span>
        </div>
      )}
      <span style={{ ...chip, background: situacao.operacional, color: '#1E1E1F' }}>
        <Broadcast weight="fill" size={22} />
        Ao vivo
      </span>
      {mostrarTema && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 18, fontWeight: 700 }}>
          <Icone weight="fill" size={22} />
          <span>Sala de controle</span>
          <span style={{ position: 'relative', width: 42, height: 25, borderRadius: forma.pilula, background: trilho }}>
            <span style={{ position: 'absolute', top: 4, left: 4 + chave * 17, width: 17, height: 17, borderRadius: '50%', background: bolinha }} />
          </span>
        </div>
      )}
    </div>
  );
}
