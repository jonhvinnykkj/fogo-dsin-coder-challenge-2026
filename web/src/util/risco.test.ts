// Escala de cor do risco, agrupamento dos blocos de 3 h por dia (relógio de São Paulo) e rótulos de região e horário.
import { describe, expect, it } from 'vitest';
import { COR_NIVEL_RISCO } from '../../../shared/dominio';
import { agruparPorDia, corDaCelula, faixaDeHoras, horaLocal, rampaRisco, rotuloDia, rotuloRegiao } from './risco';

describe('rampaRisco', () => {
  it('passa pelas cores dos níveis nos limites 25, 50, 75 e 100 e fica entre elas no meio', () => {
    expect(rampaRisco(25)).toBe(COR_NIVEL_RISCO.baixo);
    expect(rampaRisco(50)).toBe(COR_NIVEL_RISCO.moderado);
    expect(rampaRisco(75)).toBe(COR_NIVEL_RISCO.alto);
    expect(rampaRisco(100)).toBe(COR_NIVEL_RISCO.critico);
    const meio = rampaRisco(62.5);
    expect(meio).not.toBe(COR_NIVEL_RISCO.moderado);
    expect(meio).not.toBe(COR_NIVEL_RISCO.alto);
    expect(meio).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('limita fora de 0–100', () => {
    expect(rampaRisco(140)).toBe(COR_NIVEL_RISCO.critico);
    expect(rampaRisco(-3)).toBe(rampaRisco(0));
  });
});

describe('corDaCelula', () => {
  it('índice 0 some no fundo do tema; 100 é o vermelho-escuro nos dois temas', () => {
    expect(corDaCelula(0, 'claro')).not.toBe(corDaCelula(0, 'escuro'));
    expect(corDaCelula(100, 'claro')).toBe(COR_NIVEL_RISCO.critico);
    expect(corDaCelula(100, 'escuro')).toBe(COR_NIVEL_RISCO.critico);
    expect(corDaCelula(25, 'escuro')).toBe(COR_NIVEL_RISCO.baixo);
  });
});

/** Matiz (graus), saturação e luminosidade (0 a 1) de "#RRGGBB" — para checar a família da cor. */
function hsl(hex: string): { h: number; s: number; l: number } {
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return { h: (h + 360) % 360, s, l };
}

describe('escala no tema escuro', () => {
  // Cinza → amarelo em linha reta passa por amarelo escuro, que é oliva/barro (#968650 no meio). Os tons escuros do risco
  // baixo têm de ser neutros (pouca saturação) ou âmbar (matiz até 40°), da família do laranja-fogo.
  it('o risco baixo não passa por oliva: abaixo de 50% de luminosidade, neutro ou âmbar', () => {
    for (let i = 0; i <= 25; i += 0.5) {
      const cor = corDaCelula(i, 'escuro');
      const { h, s, l } = hsl(cor);
      if (l < 0.5) expect(s < 0.15 || h <= 40, `índice ${i}: ${cor} (matiz ${h.toFixed(0)}°, saturação ${s.toFixed(2)})`).toBe(true);
    }
  });

  it('o tema claro não muda: do fundo ao amarelo em linha reta', () => {
    expect(corDaCelula(0, 'claro')).toBe('#E9E9E4');
    expect(corDaCelula(12.5, 'claro')).toBe('#EFDFA5'); // meio exato entre #E9E9E4 e #F5D565
    expect(corDaCelula(25, 'claro')).toBe(COR_NIVEL_RISCO.baixo);
  });
});

describe('horários em São Paulo', () => {
  it('hora local, dia da semana e faixa de horas', () => {
    expect(horaLocal('2026-10-17T21:00:00.000Z')).toBe(18);
    expect(horaLocal('2026-10-18T03:00:00.000Z')).toBe(0);
    expect(rotuloDia('2026-10-18T03:00:00.000Z')).toBe('dom 18/10');
    expect(faixaDeHoras('2026-10-18T00:00:00.000Z', 3)).toBe('21h às 24h');
    expect(faixaDeHoras('2026-10-17T21:00:00.000Z', 1)).toBe('18h às 19h');
  });

  it('agrupa os 56 blocos de 3 h de 7 dias por dia local: começo e fim parciais', () => {
    const inicio = Date.parse('2026-10-17T21:00:00.000Z'); // sábado 18h em São Paulo
    const blocos = Array.from({ length: 56 }, (_, i) => new Date(inicio + i * 3 * 3600_000).toISOString());
    const dias = agruparPorDia(blocos);
    expect(dias.map((d) => d.indices.length)).toEqual([2, 8, 8, 8, 8, 8, 8, 6]);
    expect(dias[0]!.rotulo).toBe('sáb 17/10');
    expect(dias[1]!.rotulo).toBe('dom 18/10');
    expect(dias.at(-1)!.rotulo).toBe('sáb 24/10');
    expect(dias.flatMap((d) => d.indices)).toEqual(blocos.map((_, i) => i));
  });
});

describe('rotuloRegiao', () => {
  it('fala como o servidor: "região Centro" e "Zona Leste"', () => {
    expect(rotuloRegiao('Centro')).toBe('Região Centro');
    expect(rotuloRegiao('Leste')).toBe('Zona Leste');
  });
});
