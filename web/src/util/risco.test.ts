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
