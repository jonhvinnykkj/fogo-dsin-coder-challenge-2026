import type { Database } from 'better-sqlite3';
import { beforeAll, describe, expect, it } from 'vitest';
import { instanteLocal, somarDias } from '../tempo';
import { executarBacktest } from './backtest';
import { preverRisco } from './risco';
import { AGORA_PREDITIVO, cidadeSemeada } from './test-helpers';

let db: Database;
let resultado: ReturnType<typeof executarBacktest>;

beforeAll(() => {
  db = cidadeSemeada().db;
  resultado = executarBacktest(db, { agora: AGORA_PREDITIVO, dias: 14 });
}, 120_000);

describe('executarBacktest', () => {
  it('o modelo erra menos que a média simples por bairro e acerta ao menos 2 dos 5 bairros mais arriscados', () => {
    expect(resultado.maeModelo).toBeLessThan(resultado.maeIngenuo);
    expect(resultado.acertoTop5Medio).toBeGreaterThanOrEqual(2);
    expect(resultado.acertoTop5Medio).toBeLessThanOrEqual(5);
  });

  it('avalia os 14 dias completos antes de hoje, em ordem, e o ganho é a redução percentual do erro', () => {
    expect(resultado.dias).toBe(14);
    expect(resultado.porDia.map((d) => d.data)).toEqual(Array.from({ length: 14 }, (_, i) => somarDias('2026-10-15', i - 14)));
    expect(resultado.ganhoPct).toBeCloseTo((100 * (resultado.maeIngenuo - resultado.maeModelo)) / resultado.maeIngenuo, 0);
    const media = resultado.porDia.reduce((s, d) => s + d.mae, 0) / 14;
    expect(resultado.maeModelo).toBeCloseTo(media, 3);
    for (const d of resultado.porDia) {
      expect(Number.isInteger(d.acertoTop5)).toBe(true);
      expect(d.acertoTop5).toBeGreaterThanOrEqual(0);
      expect(d.acertoTop5).toBeLessThanOrEqual(5);
    }
  });

  it('cada dia é previsto só com dados até a véspera: o erro bate com preverRisco cortado à meia-noite', () => {
    const dia = resultado.porDia[0]!;
    const meiaNoite = instanteLocal(dia.data, 0);
    const previsao = preverRisco(db, { agora: meiaNoite, horas: 24, ate: meiaNoite });
    const reais = new Map<string, number>();
    const linhas = db
      .prepare("SELECT bairro_id, substr(inicio, 1, 13) AS hora, COUNT(*) AS n FROM ocorrencias WHERE origem = 'historico' AND inicio >= ? AND inicio < ? GROUP BY bairro_id, hora")
      .all(meiaNoite.toISOString(), instanteLocal(dia.data, 24).toISOString()) as { bairro_id: number; hora: string; n: number }[];
    for (const l of linhas) reais.set(`${l.bairro_id}|${l.hora}`, l.n);
    const erro = previsao.celulas.reduce((s, c) => s + Math.abs(c.taxaEsperada - (reais.get(`${c.bairroId}|${c.inicio.slice(0, 13)}`) ?? 0)), 0) / previsao.celulas.length;
    expect(dia.mae).toBeCloseTo(erro, 2);
  });

  it('explica o teste retroativo para o gestor', () => {
    const { explicacao } = resultado;
    expect(explicacao.oQuePreve.length).toBeGreaterThan(20);
    expect(explicacao.dadosUsados.length).toBeGreaterThan(0);
    expect(explicacao.confiabilidade.map((c) => c.valor)).toEqual(expect.arrayContaining([resultado.maeModelo, resultado.acertoTop5Medio]));
  });
});
