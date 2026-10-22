// Alerta preventivo de falha provável: a previsão de falhas (7 dias) vira alerta na Central quando a chance é alta.
import type { Database } from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ContextoApp } from '../contexto';
import { mudarSituacao, registrarManutencao } from '../servicos/equipamentos';
import { somarDias } from '../tempo';
import { Barramento } from '../tempo-real/barramento';
import { LIMITE_FALHA_PROVAVEL, LIMITE_FALHA_PROVAVEL_FECHAR, MotorAlertas } from '../tempo-real/motor-alertas';
import { inserirEquipamentoDeTeste } from '../test/fabricas';
import { preverFalhas } from './falhas';
import { AGORA_PREDITIVO, bairroPorNome, cidadeSemeada, copiaDaCidade } from './test-helpers';

const HOJE = '2026-10-15';
let db: Database;
let motor: MotorAlertas;
let ctx: ContextoApp;

const relogio = { agora: () => new Date(AGORA_PREDITIVO) };
const chance = (id: number) => preverFalhas(db, { agora: AGORA_PREDITIVO }).find((r) => r.equipamentoId === id)?.probabilidade;
const abertos = (id: number) =>
  db.prepare("SELECT * FROM alertas WHERE tipo = 'falha_provavel' AND equipamento_id = ? AND resolvido_em IS NULL").all(id) as { criticidade: string; titulo: string; descricao: string }[];

/** Câmera velha, de modelo ruim e com a manutenção atrasada há 4 meses: a previsão passa dos 50%. */
function cameraCandidata(): number {
  const id = inserirEquipamentoDeTeste({ db } as ContextoApp, { tipo: 'camera', codigo: 'TESTE-CAM-VELHA', proximaManutencao: somarDias(HOJE, -120) });
  db.prepare("UPDATE equipamentos SET marca = 'Vigilux', modelo = 'VX-200', instalado_em = '2016-10-15T12:00:00.000Z', bairro_id = ? WHERE id = ?")
    .run(bairroPorNome(db, 'Centro'), id);
  return id;
}

beforeEach(() => {
  db = copiaDaCidade();
  const barramento = new Barramento();
  motor = new MotorAlertas({ db, barramento, relogio });
  ctx = { db, barramento, motor, relogio, geo: cidadeSemeada().geo };
});
afterEach(() => db.close());

describe('alerta preventivo de falha provável', () => {
  it('mudar a situação pela tela para fora de operação fecha o alerta na hora, sem esperar a varredura', () => {
    const id = cameraCandidata();
    motor.varrerFalhasProvaveis(AGORA_PREDITIVO);
    expect(abertos(id)).toHaveLength(1);
    mudarSituacao(ctx, id, { situacao: 'em_manutencao', motivo: 'Levada para a oficina' });
    expect(abertos(id)).toHaveLength(0);
  });

  it('equipamento operacional com chance alta ganha um alerta com os motivos e a ação, sem duplicar', () => {
    const id = cameraCandidata();
    expect(chance(id)).toBeGreaterThanOrEqual(LIMITE_FALHA_PROVAVEL);

    const criados = motor.varrerFalhasProvaveis(AGORA_PREDITIVO);
    const meu = criados.find((a) => a.equipamentoId === id)!;
    expect(meu).toMatchObject({ tipo: 'falha_provavel', criticidade: expect.stringMatching(/media|alta/) });
    expect(meu.titulo).toMatch(/% de chance de falhar em 7 dias/);
    expect(meu.descricao).toMatch(/Manutenção atrasada há 120 dias/); // o motivo vem dos fatores da previsão
    expect(meu.descricao).toMatch(/agende uma manutenção preventiva/);

    // Segunda varredura: o alerta aberto segura a repetição.
    expect(motor.varrerFalhasProvaveis(AGORA_PREDITIVO).filter((a) => a.equipamentoId === id)).toHaveLength(0);
    expect(abertos(id)).toHaveLength(1);
  });

  it('em banco recém-semeado, só um punhado de equipamentos passa do limite (a Central não é inundada)', () => {
    const criados = motor.varrerFalhasProvaveis(AGORA_PREDITIVO);
    expect(criados.length).toBeLessThanOrEqual(5);
    expect(db.prepare("SELECT COUNT(*) AS n FROM alertas WHERE tipo = 'falha_provavel'").get()).toEqual({ n: criados.length });
  });

  it('fecha sozinho quando o equipamento recebe manutenção, e não reabre logo em seguida', () => {
    const id = cameraCandidata();
    motor.varrerFalhasProvaveis(AGORA_PREDITIVO);
    expect(abertos(id)).toHaveLength(1);

    registrarManutencao(ctx, id, { tipo: 'preventiva', descricao: 'Revisão', concluidaEm: AGORA_PREDITIVO.toISOString() });
    expect(abertos(id)).toHaveLength(0);
    expect(db.prepare("SELECT resolucao FROM alertas WHERE tipo = 'falha_provavel' AND equipamento_id = ?").get(id)).toEqual({ resolucao: 'automatica' });
    motor.varrerFalhasProvaveis(AGORA_PREDITIVO);
    expect(abertos(id)).toHaveLength(0);
  });

  it('fecha sozinho quando a chance cai abaixo do piso', () => {
    const id = cameraCandidata();
    motor.varrerFalhasProvaveis(AGORA_PREDITIVO);
    expect(abertos(id)).toHaveLength(1);

    // Instalada há um mês, manutenção em dia, modelo confiável: a chance despenca.
    db.prepare("UPDATE equipamentos SET marca = 'Axis', modelo = 'Q1798-LE', instalado_em = '2026-09-15T12:00:00.000Z', proxima_manutencao = ? WHERE id = ?").run(somarDias(HOJE, 60), id);
    expect(chance(id)).toBeLessThan(LIMITE_FALHA_PROVAVEL_FECHAR);
    motor.varrerFalhasProvaveis(AGORA_PREDITIVO);
    expect(abertos(id)).toHaveLength(0);
  });

  it('fecha quando o equipamento deixa de estar operacional (a falha real passa a ser o alerta de falha)', () => {
    const id = cameraCandidata();
    motor.varrerFalhasProvaveis(AGORA_PREDITIVO);
    db.prepare("UPDATE equipamentos SET situacao = 'mau_funcionamento' WHERE id = ?").run(id);
    motor.varrerFalhasProvaveis(AGORA_PREDITIVO);
    expect(abertos(id)).toHaveLength(0);
  });

  it('a varredura periódica do motor também abre o alerta preventivo, no máximo uma vez por minuto', () => {
    const id = cameraCandidata();
    motor.varrer(AGORA_PREDITIVO);
    expect(abertos(id)).toHaveLength(1);
    db.prepare("DELETE FROM alertas WHERE tipo = 'falha_provavel'").run();
    motor.varrer(new Date(AGORA_PREDITIVO.getTime() + 10_000)); // 10 s depois: ainda não recalcula
    expect(abertos(id)).toHaveLength(0);
    motor.varrer(new Date(AGORA_PREDITIVO.getTime() + 61_000));
    expect(abertos(id)).toHaveLength(1);
  });
});
