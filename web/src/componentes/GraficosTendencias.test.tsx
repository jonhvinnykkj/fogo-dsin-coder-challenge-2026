// Tendências: o cartão de disponibilidade avisa quando a projeção de 7 dias perdeu para a média no teste retroativo.
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Tendencias } from '../../../shared/modelos';
import { GraficosTendencias, projecaoConfiavel } from './GraficosTendencias';

// O Recharts mede o contêiner; no jsdom ele tem tamanho zero e não desenha, o que não importa aqui.
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });

const serie = Array.from({ length: 30 }, (_, i) => ({ data: `2026-09-${String(i + 1).padStart(2, '0')}`, pct: 75 }));
const tendencias = (teste: Tendencias['testeProjecao']): Tendencias => ({
  disponibilidadePorTipo: [{ tipo: 'balanca', serie, projecao7d: 96.7 }],
  testeProjecao: teste,
  usoPatinetesPorBairro: [],
  falhasPorModelo: [],
  explicacao: {} as Tendencias['explicacao'],
});

describe('projecaoConfiavel', () => {
  it('só se a reta errou menos (ou igual) que repetir o último valor e a média', () => {
    expect(projecaoConfiavel({ erroReta: 2, erroUltimo: 3, erroMedia: 4, projecoes: 100 })).toBe(true);
    expect(projecaoConfiavel({ erroReta: 4.92, erroUltimo: 4.43, erroMedia: 4.09, projecoes: 312 })).toBe(false);
    expect(projecaoConfiavel({ erroReta: 0, erroUltimo: 0, erroMedia: 0, projecoes: 0 })).toBe(false);
  });
});

describe('GraficosTendencias', () => {
  it('reta pior que a média: o cartão traz o aviso de baixa confiabilidade', () => {
    render(<GraficosTendencias tendencias={tendencias({ erroReta: 4.92, erroUltimo: 4.43, erroMedia: 4.09, projecoes: 312 })} />);
    expect(screen.getByText(/Projeção pouco confiável/)).toBeInTheDocument();
  });

  it('reta melhor que as duas regras simples: sem aviso', () => {
    render(<GraficosTendencias tendencias={tendencias({ erroReta: 1, erroUltimo: 3, erroMedia: 4, projecoes: 312 })} />);
    expect(screen.queryByText(/Projeção pouco confiável/)).not.toBeInTheDocument();
  });
});
