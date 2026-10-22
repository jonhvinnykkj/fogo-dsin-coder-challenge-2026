import { describe, expect, it } from 'vitest';
import type { CelulaRisco, PrevisaoRisco, RecomendacaoReforco, ResumoPreditivo } from '../../../shared/modelos';
import { bairrosDeMaiorRisco, prazoDaManutencao, textoReforco } from './montar';

const celula = (bairroId: number, inicio: string, taxaEsperada: number, fatores: CelulaRisco['fatores'] = []): CelulaRisco => ({
  bairroId, inicio, taxaEsperada, indice: 0, nivel: 'baixo', fatores,
});

const RISCO = {
  geradoEm: '2026-10-19T13:00:00.000Z', horas: 24, granularidadeHoras: 1,
  celulas: [
    celula(1, '2026-10-19T20:00:00.000Z', 1.1, [{ nome: 'Região Centro na segunda à tarde', peso: 1.42 }]),
    // Pico do Centro: 01h UTC = 22h em São Paulo
    celula(1, '2026-10-20T01:00:00.000Z', 2.3, [{ nome: 'Bairro com histórico alto', peso: 6.59 }, { nome: 'Região Centro na segunda à noite', peso: 1.89 }]),
    celula(2, '2026-10-19T21:00:00.000Z', 0.4),
    celula(2, '2026-10-19T22:00:00.000Z', 0.5),
  ],
} as PrevisaoRisco;

const RESUMO = {
  indiceBairros: [
    { bairroId: 1, nome: 'Centro', indice: 100, nivel: 'critico' },
    { bairroId: 2, nome: 'Banzato', indice: 31, nivel: 'moderado' },
    { bairroId: 3, nome: 'Palmital', indice: 12, nivel: 'baixo' },
  ],
} as ResumoPreditivo;

describe('bairrosDeMaiorRisco', () => {
  it('segue a ordem do índice do resumo e explica pelo pico de cada bairro', () => {
    const [centro, banzato] = bairrosDeMaiorRisco(RESUMO, RISCO, 2);
    expect(centro).toEqual({
      bairroId: 1, nome: 'Centro', indice: 100, nivel: 'critico', esperadas: 3.4, picoInicio: '2026-10-20T01:00:00.000Z',
      porque: 'Bairro com histórico alto ×6,59 · Região Centro na segunda à noite ×1,89',
    });
    expect(banzato).toMatchObject({ nome: 'Banzato', esperadas: 0.9, picoInicio: '2026-10-19T22:00:00.000Z', porque: 'Segue o normal do bairro' });
  });

  it('para no limite pedido e tolera bairro sem células', () => {
    expect(bairrosDeMaiorRisco(RESUMO, RISCO, 5).map((b) => b.nome)).toEqual(['Centro', 'Banzato', 'Palmital']);
    expect(bairrosDeMaiorRisco(RESUMO, RISCO, 5)[2]).toMatchObject({ esperadas: 0, porque: 'Segue o normal do bairro' });
    expect(bairrosDeMaiorRisco(RESUMO, RISCO, 5)[2]).not.toHaveProperty('picoInicio');
  });
});

describe('prazoDaManutencao', () => {
  it('conta em dias de calendário de São Paulo', () => {
    expect(prazoDaManutencao('2026-09-15', '2026-10-19')).toBe('venceu há 34 dias');
    expect(prazoDaManutencao('2026-10-18', '2026-10-19')).toBe('venceu há 1 dia');
    expect(prazoDaManutencao('2026-10-19', '2026-10-19')).toBe('hoje');
    expect(prazoDaManutencao('2026-10-20', '2026-10-19')).toBe('amanhã');
    expect(prazoDaManutencao('2026-10-27', '2026-10-19')).toBe('em 8 dias');
  });
});

describe('textoReforco', () => {
  it('uma frase com quantos, de onde, para onde, quando e a carga antes e depois', () => {
    const r: RecomendacaoReforco = {
      regiaoOrigem: 'Leste', regiaoDestino: 'Centro', quantidade: 1, inicio: '2026-10-19T17:00:00.000Z', fim: '2026-10-20T01:00:00.000Z',
      cargaPorAgenteAntes: 6.4, cargaPorAgenteDepois: 5.6, motivo: 'x',
    };
    expect(textoReforco(r)).toBe('Mover 1 agente da Zona Leste para a Região Centro, das 14h às 22h: carga de 6,4 para 5,6 ocorrências por agente');
    expect(textoReforco({ ...r, quantidade: 2, regiaoDestino: 'Sul' })).toMatch(/^Mover 2 agentes da Zona Leste para a Zona Sul/);
  });
});
