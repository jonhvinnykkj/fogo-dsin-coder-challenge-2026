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
import { calcularTendencias, retaSustentaAcao } from './tendencias';
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

// Tendências no resumo: "Antecipe as preventivas" só quando o teste retroativo da própria tela mostra que a reta acerta mais
// que repetir o último valor ou a média de 30 dias. Senão vira informação, com a confiabilidade no próprio cartão.
describe('montarResumo — tendência de disponibilidade', () => {
  const comQueda = (t: NonNullable<typeof partes>['tendencias'] & object, teste: { erroReta: number; erroUltimo: number; erroMedia: number }) => {
    const base = t.disponibilidadePorTipo[0]!;
    const serie = base.serie.map((p) => ({ ...p, pct: 90 }));
    // Sem os outros dois cartões de tendência, o da disponibilidade é o único da fonte e não perde a vaga.
    return { ...t, falhasPorModelo: [], usoPatinetesPorBairro: [], disponibilidadePorTipo: [{ ...base, serie, projecao7d: 80 }], testeProjecao: { ...teste, projecoes: 100 } };
  };
  const daTendencia = (tendencias: Parameters<typeof comQueda>[0]) =>
    montarResumo(db, { agora: AGORA_PREDITIVO }, { ...partes, tendencias }).recomendacoes.filter((x) => x.fonte === 'tendencias' && /Disponibilidade|disponibilidade/.test(x.titulo));

  it('reta pior que a média (como no teste retroativo real): informação, sem "Antecipe" e com a confiabilidade', () => {
    const [cartao] = daTendencia(comQueda(partes!.tendencias!, { erroReta: 4.9, erroUltimo: 5.2, erroMedia: 4.1 }));
    expect(cartao).toBeDefined();
    expect(cartao!.natureza).toBe('informacao');
    expect(cartao!.prioridade).toBe('baixa');
    expect(cartao!.titulo).toMatch(/^Informação:/);
    expect(cartao!.detalhe).not.toMatch(/Antecipe/);
    expect(cartao!.detalhe).toMatch(/Confiabilidade baixa.*4,9 p\.p\..*4,1 p\.p\./);
  });

  it('reta melhor que as duas regras simples: continua recomendando a ação', () => {
    const teste = { erroReta: 2.0, erroUltimo: 3.1, erroMedia: 4.1 };
    expect(retaSustentaAcao({ ...teste, projecoes: 100 })).toBe(true);
    const [cartao] = daTendencia(comQueda(partes!.tendencias!, teste));
    expect(cartao!.natureza).toBe('acao');
    expect(cartao!.detalhe).toMatch(/Antecipe as preventivas/);
  });

  it('sem projeções para testar, a reta não sustenta ação', () => {
    expect(retaSustentaAcao({ erroReta: 0, erroUltimo: 0, erroMedia: 0, projecoes: 0 })).toBe(false);
  });

  it('com os dados reais da semente, nunca manda antecipar se a reta errou mais que a média', () => {
    const r = montarResumo(db, { agora: AGORA_PREDITIVO }, partes);
    const t = partes!.tendencias!.testeProjecao;
    for (const x of r.recomendacoes.filter((y) => /Antecipe as preventivas/.test(y.detalhe))) expect(retaSustentaAcao(t)).toBe(true);
  });
});
