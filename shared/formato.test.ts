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

describe('telefone', () => {
  it('normaliza celular e fixo, com ou sem pontuação e +55', async () => {
    const { normalizarTelefone } = await import('./formato');
    expect(normalizarTelefone('14999990000')).toBe('(14) 99999-0000');
    expect(normalizarTelefone('+55 14 99999-0000')).toBe('(14) 99999-0000');
    expect(normalizarTelefone('(14) 3433-1234')).toBe('(14) 3433-1234');
  });

  it('recusa o que não é telefone brasileiro com DDD', async () => {
    const { normalizarTelefone } = await import('./formato');
    for (const ruim of ['', '123', 'abc', '<script>', '99999-0000', '(14) 8888-0000', '(14) 99999-000', '(10) 99999-0000', '(14) 99999-0000 x']) {
      expect(normalizarTelefone(ruim), ruim).toBeUndefined();
    }
  });

  it('máscara de digitação pontua aos poucos e ignora letras', async () => {
    const { mascararTelefoneDigitado } = await import('./formato');
    const digitando = ['', '1', '14', '149', '14999', '1499999', '14999990', '149999900', '1499999000', '14999990000', '149999900001'];
    expect(digitando.map(mascararTelefoneDigitado)).toEqual([
      '', '(1', '(14', '(14) 9', '(14) 999', '(14) 9999-9', '(14) 9999-90', '(14) 9999-900', '(14) 9999-9000', '(14) 99999-0000', '(14) 99999-0000',
    ]);
    expect(mascararTelefoneDigitado('ab(14) 3433-1234x')).toBe('(14) 3433-1234');
  });
});
