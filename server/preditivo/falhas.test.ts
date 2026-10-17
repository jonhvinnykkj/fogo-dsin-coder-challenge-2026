import type { Database } from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ContextoApp } from '../contexto';
import { inserirEquipamentoDeTeste } from '../test/fabricas';
import { somarDias } from '../tempo';
import { preverFalhas, respostaFalhas } from './falhas';
import { AGORA_PREDITIVO, bairroPorNome, copiaDaCidade } from './test-helpers';

const HOJE = '2026-10-15';
let db: Database;
let ruim: number;
let novo: number;

function camera(codigo: string, marca: string, modelo: string, instaladoEm: string, proximaManutencao: string): number {
  const id = inserirEquipamentoDeTeste({ db } as ContextoApp, { tipo: 'camera', codigo, proximaManutencao });
  db.prepare('UPDATE equipamentos SET marca = ?, modelo = ?, instalado_em = ?, bairro_id = ? WHERE id = ?').run(marca, modelo, instaladoEm, bairroPorNome(db, 'Centro'), id);
  return id;
}

beforeAll(() => {
  db = copiaDaCidade();
  // Mesmo tipo (câmera), mesmo bairro, sem telemetria recente (nenhuma queda de sinal para nenhum dos dois).
  ruim = camera('TESTE-CAM-RUIM', 'Vigilux', 'VX-200', '2023-10-15T12:00:00.000Z', somarDias(HOJE, -40)); // 3 anos, 40 dias de atraso
  novo = camera('TESTE-CAM-NOVA', 'Axis', 'Q1798-LE', '2026-09-15T12:00:00.000Z', somarDias(HOJE, 60)); // 1 mês, em dia
}, 120_000);

afterAll(() => db.close());

describe('preverFalhas', () => {
  it('a câmera de modelo pouco confiável com 40 dias de manutenção atrasada fica acima da nova, confiável e em dia', () => {
    const lista = preverFalhas(db, { agora: AGORA_PREDITIVO });
    const posRuim = lista.findIndex((r) => r.equipamentoId === ruim);
    const posNovo = lista.findIndex((r) => r.equipamentoId === novo);
    expect(posRuim).toBeGreaterThanOrEqual(0);
    expect(posNovo).toBeGreaterThanOrEqual(0);
    expect(posRuim).toBeLessThan(posNovo);
    expect(lista[posRuim]!.probabilidade).toBeGreaterThan(2 * lista[posNovo]!.probabilidade);
    const nomes = lista[posRuim]!.fatores.map((f) => f.nome).join(' | ');
    expect(nomes).toMatch(/modelo/i);
    expect(nomes).toMatch(/manutenção/i);
  });

  it('probabilidades entre 0 e 1, em ordem decrescente, só equipamentos operacionais', () => {
    const lista = preverFalhas(db, { agora: AGORA_PREDITIVO });
    expect(lista.length).toBeGreaterThan(100);
    for (let i = 0; i < lista.length; i++) {
      expect(lista[i]!.probabilidade).toBeGreaterThanOrEqual(0);
      expect(lista[i]!.probabilidade).toBeLessThanOrEqual(1);
      if (i > 0) expect(lista[i]!.probabilidade).toBeLessThanOrEqual(lista[i - 1]!.probabilidade);
    }
    const operacionais = (db.prepare("SELECT COUNT(*) AS n FROM equipamentos WHERE situacao = 'operacional'").get() as { n: number }).n;
    expect(lista).toHaveLength(operacionais);
  });

  it('a resposta explica e mede a confiabilidade num teste retroativo de 7 dias', () => {
    const r = respostaFalhas(db, { agora: AGORA_PREDITIVO });
    expect(r.itens.length).toBeGreaterThan(0);
    expect(r.explicacao.dadosUsados.length).toBeGreaterThan(0);
    expect(r.explicacao.confiabilidade.length).toBeGreaterThan(0);
    for (const c of r.explicacao.confiabilidade) expect(Number.isFinite(c.valor)).toBe(true);
  });
});
