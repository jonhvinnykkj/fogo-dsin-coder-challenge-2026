import { describe, expect, it } from 'vitest';
import { formatarData, formatarDataHora, formatarNumero, formatarPct, formatarRelativo } from './formato';

describe('formato pt-BR', () => {
  it('números', () => {
    expect(formatarNumero(1234.5, 1)).toBe('1.234,5');
    expect(formatarNumero(1234567)).toBe('1.234.567');
  });
  it('percentual', () => {
    expect(formatarPct(87.25)).toBe('87,3%');
  });
  it('datas no fuso de São Paulo', () => {
    expect(formatarData('2026-10-17T15:00:00Z')).toBe('17/10/2026');
    expect(formatarDataHora('2026-10-17T15:00:00Z')).toBe('17/10/2026 12:00');
    expect(formatarData('2026-10-18T01:00:00Z')).toBe('17/10/2026');
  });
  it('relativo', () => {
    const agora = new Date('2026-10-17T15:00:00Z');
    expect(formatarRelativo('2026-10-17T14:57:00Z', agora)).toBe('há 3 min');
    expect(formatarRelativo('2026-10-17T14:59:50Z', agora)).toBe('agora');
    expect(formatarRelativo('2026-10-17T12:00:00Z', agora)).toBe('há 3 h');
    expect(formatarRelativo('2026-10-15T15:00:00Z', agora)).toBe('há 2 dias');
  });
});
