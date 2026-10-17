import type { Database } from 'better-sqlite3';
import type { Manutencao } from '../../shared/modelos';

interface LinhaManutencao {
  id: number;
  equipamento_id: number;
  tipo: 'corretiva' | 'preventiva';
  aberta_em: string;
  prevista_para: string | null;
  concluida_em: string | null;
  descricao: string;
}

const paraManutencao = (l: LinhaManutencao): Manutencao => ({
  id: l.id,
  equipamentoId: l.equipamento_id,
  tipo: l.tipo,
  abertaEm: l.aberta_em,
  ...(l.prevista_para !== null && { previstaPara: l.prevista_para }),
  ...(l.concluida_em !== null && { concluidaEm: l.concluida_em }),
  descricao: l.descricao,
});

export interface NovaManutencao {
  equipamentoId: number;
  tipo: 'corretiva' | 'preventiva';
  abertaEm: string;
  previstaPara?: string | null;
  concluidaEm?: string | null;
  descricao: string;
}

export function inserirManutencao(db: Database, m: NovaManutencao): number {
  const r = db
    .prepare('INSERT INTO manutencoes (equipamento_id, tipo, aberta_em, prevista_para, concluida_em, descricao) VALUES (?, ?, ?, ?, ?, ?)')
    .run(m.equipamentoId, m.tipo, m.abertaEm, m.previstaPara ?? null, m.concluidaEm ?? null, m.descricao);
  return Number(r.lastInsertRowid);
}

/** Manutenção prevista e ainda não concluída do mesmo tipo (a mais antiga), ou undefined. */
export function previstaEmAberto(db: Database, equipamentoId: number, tipo: 'corretiva' | 'preventiva'): number | undefined {
  const l = db.prepare('SELECT id FROM manutencoes WHERE equipamento_id = ? AND tipo = ? AND concluida_em IS NULL ORDER BY aberta_em, id LIMIT 1')
    .get(equipamentoId, tipo) as { id: number } | undefined;
  return l?.id;
}

/** Conclui uma manutenção que estava prevista (fica a data prevista; a descrição passa a ser a do que foi feito). */
export function concluirManutencao(db: Database, id: number, concluidaEm: string, descricao: string): void {
  db.prepare('UPDATE manutencoes SET concluida_em = ?, descricao = ? WHERE id = ?').run(concluidaEm, descricao, id);
}

export function manutencoesDoEquipamento(db: Database, equipamentoId: number): Manutencao[] {
  return (
    db.prepare('SELECT * FROM manutencoes WHERE equipamento_id = ? ORDER BY aberta_em DESC, id DESC').all(equipamentoId) as LinhaManutencao[]
  ).map(paraManutencao);
}
