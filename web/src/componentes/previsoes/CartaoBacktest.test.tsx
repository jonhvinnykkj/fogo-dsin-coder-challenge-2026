// Cartão do teste retroativo: a frase com os números do servidor (sem reescrever nem arredondar diferente) e o gráfico por
// dia com o modelo e a média simples.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ResultadoBacktest } from '../../../../shared/modelos';
import { CartaoBacktest, fraseBacktest } from './CartaoBacktest';

const porDia = Array.from({ length: 14 }, (_, i) => ({
  data: `2026-10-${String(3 + i).padStart(2, '0')}`,
  acertoTop5: i % 3 === 0 ? 5 : 4,
  acertoTop5Ingenuo: 4,
  mae: 0.5 + i / 100,
  maeIngenuo: 0.58,
}));

const RESULTADO: ResultadoBacktest = {
  dias: 14,
  maeModelo: 0.5348,
  maeIngenuo: 0.5809,
  ganhoPct: 7.9,
  acertoTop5Medio: 4.1,
  acertoTop5IngenuoMedio: 3.9,
  porDia,
  explicacao: { oQuePreve: '', dadosUsados: [], comoAjuda: '', confiabilidade: [] },
};

describe('fraseBacktest', () => {
  it('monta a frase com os campos reais, na unidade de 3 horas e na janela da noite', () => {
    expect(fraseBacktest(RESULTADO)).toBe(
      'Nas últimas 2 semanas, o modelo errou em média 0,53 ocorrências por bairro a cada 3 horas, contra 0,58 de uma média simples '
      + '(7,9% melhor). Dos 5 bairros apontados como mais arriscados à noite (18h–2h), em média 4,1 de fato foram — a média simples acertaria 3,9.',
    );
  });

  it('com outro número de dias e ganho negativo, diz isso sem esconder', () => {
    const frase = fraseBacktest({ ...RESULTADO, dias: 9, ganhoPct: -2.4, maeModelo: 0.6, maeIngenuo: 0.586 });
    expect(frase.startsWith('Nos últimos 9 dias, o modelo errou em média 0,60 ocorrências')).toBe(true);
    expect(frase).toContain('contra 0,59 de uma média simples (2,4% pior)');
  });
});

describe('CartaoBacktest', () => {
  it('mostra a frase, os números grandes e o gráfico por dia com modelo × média simples', () => {
    render(<CartaoBacktest resultado={RESULTADO} />);
    expect(screen.getByText(fraseBacktest(RESULTADO))).toBeInTheDocument();
    expect(screen.getByText('7,9%')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /erro por dia.*modelo.*média simples/i })).toBeInTheDocument();
    // tabela equivalente ao gráfico, para leitor de tela: um dia por linha
    expect(screen.getAllByRole('row')).toHaveLength(15);
  });
});
