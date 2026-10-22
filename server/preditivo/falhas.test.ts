import type { Database } from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ContextoApp } from '../contexto';
import { inserirEquipamentoDeTeste, inserirTelemetriaDeTeste } from '../test/fabricas';
import { somarDias } from '../tempo';
import { fimDosDados, HORA_MS } from './base';
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

describe('sinal fraco e conserto', () => {
  const chance = (id: number) => preverFalhas(db, { agora: AGORA_PREDITIVO }).find((r) => r.equipamentoId === id)!;
  const horasFracas = (id: number) => Number(chance(id).fatores.find((f) => /sinal fraco/.test(f.nome))?.nome.match(/^(\d+) hora/)?.[1] ?? 0);

  it('só conta o sinal fraco depois da última manutenção ou recuperação do equipamento', () => {
    const id = camera('TESTE-CAM-CONSERTADA', 'Axis', 'Q1798-LE', '2026-09-15T12:00:00.000Z', somarDias(HOJE, 60));
    const fim = fimDosDados(db, AGORA_PREDITIVO);
    for (let h = 1; h <= 6; h++) inserirTelemetriaDeTeste({ db } as ContextoApp, id, new Date(fim - h * HORA_MS).toISOString(), { online: 40, fps: 20 }, 30);
    const comDefeito = chance(id).probabilidade;
    expect(horasFracas(id)).toBe(6);

    // Reparo concluído 3 h atrás: só as 3 horas fracas depois dele valem.
    db.prepare("INSERT INTO manutencoes (equipamento_id, tipo, aberta_em, concluida_em, descricao) VALUES (?, 'corretiva', ?, ?, 'Reparo')")
      .run(id, new Date(fim - 5 * HORA_MS).toISOString(), new Date(fim - 3 * HORA_MS).toISOString());
    expect(horasFracas(id)).toBe(3);

    // Reparo concluído agora (o simulador consertou): o defeito antigo não pesa mais e a chance cai.
    db.prepare("UPDATE manutencoes SET concluida_em = ? WHERE equipamento_id = ?").run(new Date(fim).toISOString(), id);
    expect(horasFracas(id)).toBe(0);
    expect(chance(id).probabilidade).toBeLessThan(comDefeito);

    // Mesma regra para a recuperação registrada só na situação (sem ordem de manutenção): volta a operar 2 h atrás.
    db.prepare('DELETE FROM manutencoes WHERE equipamento_id = ?').run(id);
    db.prepare("INSERT INTO historico_situacao (equipamento_id, de, para, motivo, em, origem) VALUES (?, 'mau_funcionamento', 'operacional', 'Recuperado', ?, 'ao_vivo')")
      .run(id, new Date(fim - 2 * HORA_MS).toISOString());
    expect(horasFracas(id)).toBe(2);
  });

  it('o teste retroativo ignora conserto posterior ao instante previsto', () => {
    // A recuperação ao vivo é de depois do corte de 7 dias atrás: não pode mudar a previsão feita "naquele dia".
    const antes = respostaFalhas(db, { agora: AGORA_PREDITIVO }).explicacao.confiabilidade;
    db.prepare("INSERT INTO manutencoes (equipamento_id, tipo, aberta_em, concluida_em, descricao) SELECT id, 'corretiva', ?, ?, 'Reparo ao vivo' FROM equipamentos")
      .run(new Date(AGORA_PREDITIVO.getTime() - 2 * HORA_MS).toISOString(), new Date(AGORA_PREDITIVO.getTime() - HORA_MS).toISOString());
    expect(respostaFalhas(db, { agora: AGORA_PREDITIVO }).explicacao.confiabilidade).toEqual(antes);
  });
});
