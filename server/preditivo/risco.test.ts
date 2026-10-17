import type { Database } from 'better-sqlite3';
import { beforeAll, describe, expect, it } from 'vitest';
import type { CelulaRisco, NivelRisco } from '../../shared/modelos';
import { instanteLocal } from '../tempo';
import { preverRisco } from './risco';
import { AGORA_PREDITIVO, bairroPorNome, cidadeSemeada, copiaDaCidade } from './test-helpers';

const HORA = 3_600_000;
let db: Database;

beforeAll(() => {
  db = cidadeSemeada().db;
}, 120_000);

const nivelEsperado = (indice: number): NivelRisco => (indice < 25 ? 'baixo' : indice < 50 ? 'moderado' : indice < 75 ? 'alto' : 'critico');
const semExplicacao = (celulas: CelulaRisco[]) => celulas.map((c) => `${c.bairroId}|${c.inicio}|${c.taxaEsperada}`);

describe('preverRisco', () => {
  it('Centro na sexta às 22 h tem índice maior que na terça às 3 h (agora = quinta 12 h, 7 dias)', () => {
    const p = preverRisco(db, { agora: AGORA_PREDITIVO, horas: 168 });
    const centro = bairroPorNome(db, 'Centro');
    const celula = (inicio: Date) => p.celulas.find((c) => c.bairroId === centro && c.inicio === inicio.toISOString());
    const sexta22 = celula(instanteLocal('2026-10-16', 22));
    const terca3 = celula(instanteLocal('2026-10-20', 3));
    expect(sexta22).toBeDefined();
    expect(terca3).toBeDefined();
    expect(sexta22!.indice).toBeGreaterThan(terca3!.indice);
  });

  it('uma célula por bairro e hora, a partir da hora atual, com início em ISO UTC', () => {
    const p = preverRisco(db, { agora: AGORA_PREDITIVO, horas: 24 });
    const bairros = (db.prepare('SELECT COUNT(*) AS n FROM bairros').get() as { n: number }).n;
    expect(p.horas).toBe(24);
    expect(p.celulas).toHaveLength(bairros * 24);
    const inicios = [...new Set(p.celulas.map((c) => c.inicio))].sort();
    expect(inicios[0]).toBe(AGORA_PREDITIVO.toISOString());
    expect(inicios).toHaveLength(24);
    expect(Date.parse(inicios[23]!) - Date.parse(inicios[0]!)).toBe(23 * HORA);
  });

  it('todo índice fica entre 0 e 100, o nível segue o índice e toda célula tem ao menos um fator', () => {
    const p = preverRisco(db, { agora: AGORA_PREDITIVO, horas: 168 });
    for (const c of p.celulas) {
      expect(c.indice).toBeGreaterThanOrEqual(0);
      expect(c.indice).toBeLessThanOrEqual(100);
      expect(c.nivel).toBe(nivelEsperado(c.indice));
      expect(c.taxaEsperada).toBeGreaterThan(0);
      expect(c.fatores.length).toBeGreaterThanOrEqual(1);
      for (const f of c.fatores) {
        expect(f.nome.length).toBeGreaterThan(0);
        expect(f.peso).toBeGreaterThan(0);
      }
    }
    expect(p.celulas.some((c) => c.nivel === 'critico')).toBe(true);
    expect(p.celulas.some((c) => c.nivel === 'baixo')).toBe(true);
  });

  it('nomeia os fatores em português: dia e período, bairro', () => {
    const p = preverRisco(db, { agora: AGORA_PREDITIVO, horas: 168 });
    const centro = bairroPorNome(db, 'Centro');
    // Sexta às 18 h: pico de saída do trabalho (perfil de dia útil ≈ 2×) no bairro mais movimentado.
    const sexta18 = p.celulas.find((c) => c.bairroId === centro && c.inicio === instanteLocal('2026-10-16', 18).toISOString())!;
    const nomes = sexta18.fatores.map((f) => f.nome);
    expect(nomes).toContain('Sexta à noite');
    expect(nomes).toContain('Bairro com histórico alto');
    expect(sexta18.fatores.find((f) => f.nome === 'Sexta à noite')!.peso).toBeGreaterThan(1.5);
    // Terça às 3 h: a madrugada pesa para baixo.
    const terca3 = p.celulas.find((c) => c.bairroId === centro && c.inicio === instanteLocal('2026-10-20', 3).toISOString())!;
    expect(terca3.fatores.find((f) => f.nome === 'Terça de madrugada')!.peso).toBeLessThan(0.7);
  });

  it('cita "Previsão de chuva" só nos dias com chuva prevista', () => {
    const p = preverRisco(db, { agora: AGORA_PREDITIVO, horas: 168 });
    const clima = new Map((db.prepare('SELECT data, chuva_mm FROM clima_dia').all() as { data: string; chuva_mm: number }[]).map((l) => [l.data, l.chuva_mm]));
    const diaLocal = (iso: string) => new Date(Date.parse(iso) - 3 * HORA).toISOString().slice(0, 10);
    const citaChuva = (c: CelulaRisco) => c.fatores.some((f) => f.nome === 'Previsão de chuva');
    const chuvosas = p.celulas.filter((c) => (clima.get(diaLocal(c.inicio)) ?? 0) > 0);
    const secas = p.celulas.filter((c) => (clima.get(diaLocal(c.inicio)) ?? 0) === 0);
    expect(chuvosas.length).toBeGreaterThan(0); // a semente padrão prevê chuva nesta semana
    expect(chuvosas.some(citaChuva)).toBe(true);
    expect(secas.some(citaChuva)).toBe(false);
  });

  it('explica o que prevê, com quais dados, como ajuda e quão confiável foi (números do teste retroativo)', () => {
    const { explicacao } = preverRisco(db, { agora: AGORA_PREDITIVO, horas: 24 });
    expect(explicacao.oQuePreve.length).toBeGreaterThan(20);
    expect(explicacao.comoAjuda.length).toBeGreaterThan(20);
    expect(explicacao.dadosUsados.length).toBeGreaterThan(0);
    expect(explicacao.confiabilidade.length).toBeGreaterThanOrEqual(2);
    for (const c of explicacao.confiabilidade) expect(Number.isFinite(c.valor)).toBe(true);
  });

  it('com corte `ate`, usa só o que aconteceu antes dele (igual a apagar o depois)', () => {
    const ate = instanteLocal('2026-10-08', 0);
    const comCorte = preverRisco(db, { agora: ate, horas: 24, ate });
    const copia = copiaDaCidade();
    copia.prepare('DELETE FROM ocorrencias WHERE inicio >= ?').run(ate.toISOString());
    const semFuturo = preverRisco(copia, { agora: ate, horas: 24, ate });
    expect(semExplicacao(comCorte.celulas)).toEqual(semExplicacao(semFuturo.celulas));
    copia.close();
  });

  it('ignora ocorrências injetadas e as ao vivo (aceleradas para a demonstração)', () => {
    const antes = preverRisco(db, { agora: AGORA_PREDITIVO, horas: 24 });
    const copia = copiaDaCidade();
    const lorenzetti = bairroPorNome(copia, 'Lorenzetti');
    const ins = copia.prepare(
      "INSERT INTO ocorrencias (tipo, gravidade, bairro_id, lat, lng, inicio, descricao, chuva, origem) VALUES ('acidente', 2, ?, -22.2, -49.9, ?, '', 0, ?)",
    );
    for (let i = 0; i < 300; i++) {
      const inicio = new Date(AGORA_PREDITIVO.getTime() - (i + 1) * 20 * 60_000).toISOString();
      ins.run(lorenzetti, inicio, i % 2 ? 'injetado' : 'tempo_real');
    }
    const depois = preverRisco(copia, { agora: AGORA_PREDITIVO, horas: 24 });
    expect(semExplicacao(depois.celulas)).toEqual(semExplicacao(antes.celulas));
    copia.close();
  });
});
