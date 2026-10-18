import { describe, expect, it } from 'vitest';
import { formatarChance, formatarData, formatarDataHora, formatarNumero, formatarPct, formatarRelativo } from './formato';

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
  // Chance de falha: o modelo nunca dá certeza, então as pontas não viram "100%" nem "0%".
  it('chance (0 a 1) sem prometer certeza nas pontas', () => {
    expect(formatarChance(0.9999)).toBe('mais de 99%');
    expect(formatarChance(0.995)).toBe('mais de 99%');
    expect(formatarChance(1)).toBe('mais de 99%');
    expect(formatarChance(0.994)).toBe('99%');
    expect(formatarChance(0.5)).toBe('50%');
    expect(formatarChance(0.126)).toBe('13%');
    expect(formatarChance(0.005)).toBe('1%');
    expect(formatarChance(0.004)).toBe('menos de 1%');
    expect(formatarChance(0)).toBe('menos de 1%');
    expect(`${formatarChance(0.9999)} de chance de falhar nos próximos 7 dias`).toBe('mais de 99% de chance de falhar nos próximos 7 dias');
  });
  it('relativo', () => {
    const agora = new Date('2026-10-17T15:00:00Z');
    expect(formatarRelativo('2026-10-17T14:57:00Z', agora)).toBe('há 3 min');
    expect(formatarRelativo('2026-10-17T14:59:50Z', agora)).toBe('agora');
    expect(formatarRelativo('2026-10-17T12:00:00Z', agora)).toBe('há 3 h');
    expect(formatarRelativo('2026-10-15T15:00:00Z', agora)).toBe('há 2 dias');
  });
});

describe('formatarEndereco', () => {
  it('compõe rua, referência, bairro, cidade/UF e CEP', async () => {
    const { formatarEndereco } = await import('./formato');
    expect(formatarEndereco({ logradouro: 'Avenida Sampaio Vidal', referencia: 'nº 181', bairroNome: 'Centro', cep: '17500-000', cidade: 'Marília', uf: 'SP' }))
      .toBe('Avenida Sampaio Vidal, nº 181 — Centro, Marília/SP — CEP 17500-000');
  });
  it('sem referência e sem cidade/UF (resposta antiga) usa Marília/SP', async () => {
    const { formatarEndereco } = await import('./formato');
    expect(formatarEndereco({ logradouro: 'Rua X', referencia: '', bairroNome: 'Centro', cep: '17500-000' }))
      .toBe('Rua X — Centro, Marília/SP — CEP 17500-000');
  });
});

describe('cidade/UF', () => {
  it('formata Marília/SP a partir das constantes', async () => {
    const { CIDADE, UF, formatarCidadeUf } = await import('./formato');
    expect(CIDADE).toBe('Marília');
    expect(UF).toBe('SP');
    expect(formatarCidadeUf()).toBe('Marília/SP');
    expect(formatarCidadeUf('Bauru', 'sp')).toBe('Bauru/SP');
  });
});
