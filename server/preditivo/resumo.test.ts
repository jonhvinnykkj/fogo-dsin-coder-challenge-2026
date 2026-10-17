// Resumo do dia: a recomendação de falha não pode prometer certeza. Com λ alto, a probabilidade guardada chega a 0,9999
// (ou 1 depois de arredondar), mas o texto diz "mais de 99%", nunca "100%".
import type { Database } from 'better-sqlite3';
import { beforeAll, describe, expect, it } from 'vitest';
import type { RespostaFalhas } from '../../shared/modelos';
import { executarBacktest } from './backtest';
import { respostaFalhas } from './falhas';
import { recomendarReforco } from './reforco';
import { montarResumo } from './resumo';
import { preverRisco } from './risco';
import { calcularTendencias } from './tendencias';
import { AGORA_PREDITIVO, cidadeSemeada } from './test-helpers';

let db: Database;
let partes: Parameters<typeof montarResumo>[2];
let falhas: RespostaFalhas;

beforeAll(() => {
  db = cidadeSemeada().db;
  const agora = AGORA_PREDITIVO;
  const backtest = executarBacktest(db, { agora, dias: 14 });
  const risco = preverRisco(db, { agora, horas: 24, backtest });
  falhas = respostaFalhas(db, { agora });
  partes = { backtest, risco, reforco: recomendarReforco(db, { agora, horas: 24, previsao: risco }), tendencias: calcularTendencias(db, { agora }) };
}, 120_000);

const comChances = (...ps: number[]): RespostaFalhas => ({
  ...falhas,
  itens: ps.map((p, i) => ({ ...falhas.itens[i]!, probabilidade: p })),
});

describe('montarResumo — chance de falha no texto', () => {
  it('λ alto (probabilidade 1 e 0,9999): "mais de 99% de chance", nunca "100%"', () => {
    const r = montarResumo(db, { agora: AGORA_PREDITIVO }, { ...partes, falhas: comChances(1, 0.9999) });
    const deFalhas = r.recomendacoes.filter((x) => x.fonte === 'falhas');
    expect(deFalhas.length).toBeGreaterThan(0);
    for (const x of deFalhas) {
      expect(x.detalhe).toMatch(/^mais de 99% de chance de falhar nos próximos 7 dias\./);
      expect(x.detalhe).not.toContain('100%');
    }
    expect(JSON.stringify(r)).not.toContain('100%');
  });

  it('chance comum continua inteira: 0,62 → "62% de chance"', () => {
    const r = montarResumo(db, { agora: AGORA_PREDITIVO }, { ...partes, falhas: comChances(0.62, 0.41) });
    const deFalhas = r.recomendacoes.filter((x) => x.fonte === 'falhas');
    expect(deFalhas[0]!.detalhe.startsWith('62% de chance de falhar')).toBe(true);
  });

  it('o texto "Como ajuda" das falhas também não diz 100%', () => {
    expect(falhas.explicacao.comoAjuda).not.toMatch(/\b100%/);
  });
});
