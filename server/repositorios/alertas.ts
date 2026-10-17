import type { Database } from 'better-sqlite3';
import type { Criticidade } from '../../shared/dominio';
import type { Alerta } from '../../shared/modelos';

interface LinhaAlerta {
  id: number;
  tipo: string;
  criticidade: Criticidade;
  titulo: string;
  descricao: string;
  equipamento_id: number | null;
  agente_id: number | null;
  bairro_id: number | null;
  lat: number | null;
  lng: number | null;
  criado_em: string;
  reconhecido_em: string | null;
  resolvido_em: string | null;
}

const COLUNAS = 'id, tipo, criticidade, titulo, descricao, equipamento_id, agente_id, bairro_id, lat, lng, criado_em, reconhecido_em, resolvido_em';

function paraAlerta(l: LinhaAlerta): Alerta {
  return {
    id: l.id,
    tipo: l.tipo,
    criticidade: l.criticidade,
    titulo: l.titulo,
    descricao: l.descricao,
    ...(l.equipamento_id !== null && { equipamentoId: l.equipamento_id }),
    ...(l.agente_id !== null && { agenteId: l.agente_id }),
    ...(l.bairro_id !== null && { bairroId: l.bairro_id }),
    ...(l.lat !== null && { lat: l.lat }),
    ...(l.lng !== null && { lng: l.lng }),
    criadoEm: l.criado_em,
    ...(l.reconhecido_em !== null && { reconhecidoEm: l.reconhecido_em }),
    ...(l.resolvido_em !== null && { resolvidoEm: l.resolvido_em }),
  };
}

export interface NovoAlerta {
  tipo: string;
  criticidade: Criticidade;
  titulo: string;
  descricao: string;
  equipamentoId?: number;
  agenteId?: number;
  bairroId?: number;
  lat?: number;
  lng?: number;
  criadoEm: string;
  chaveDedup?: string;
}

export function inserirAlerta(db: Database, a: NovoAlerta): Alerta {
  const r = db
    .prepare(
      `INSERT INTO alertas (tipo, criticidade, titulo, descricao, equipamento_id, agente_id, bairro_id, lat, lng, criado_em, chave_dedup)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(a.tipo, a.criticidade, a.titulo, a.descricao, a.equipamentoId ?? null, a.agenteId ?? null, a.bairroId ?? null, a.lat ?? null, a.lng ?? null, a.criadoEm, a.chaveDedup ?? null);
  return alertaPorId(db, Number(r.lastInsertRowid))!;
}

export function alertaPorId(db: Database, id: number): Alerta | undefined {
  const l = db.prepare(`SELECT ${COLUNAS} FROM alertas WHERE id = ?`).get(id) as LinhaAlerta | undefined;
  return l && paraAlerta(l);
}

export interface FiltroAlertas {
  status: 'abertos' | 'todos';
  criticidade?: Criticidade;
  tipo?: string;
  desde?: string;
  limite: number;
}

/** Mais recentes primeiro. `desde` compara com `criado_em` (ISO UTC). */
export function listarAlertas(db: Database, f: FiltroAlertas): Alerta[] {
  const cond: string[] = [];
  const params: unknown[] = [];
  if (f.status === 'abertos') cond.push('resolvido_em IS NULL');
  if (f.criticidade) { cond.push('criticidade = ?'); params.push(f.criticidade); }
  if (f.tipo) { cond.push('tipo = ?'); params.push(f.tipo); }
  if (f.desde) { cond.push('criado_em >= ?'); params.push(f.desde); }
  const onde = cond.length ? ` WHERE ${cond.join(' AND ')}` : '';
  const linhas = db.prepare(`SELECT ${COLUNAS} FROM alertas${onde} ORDER BY criado_em DESC, id DESC LIMIT ?`).all(...params, f.limite) as LinhaAlerta[];
  return linhas.map(paraAlerta);
}

export function alertasDoEquipamento(db: Database, equipamentoId: number, limite = 50): Alerta[] {
  const linhas = db
    .prepare(`SELECT ${COLUNAS} FROM alertas WHERE equipamento_id = ? ORDER BY criado_em DESC, id DESC LIMIT ?`)
    .all(equipamentoId, limite) as LinhaAlerta[];
  return linhas.map(paraAlerta);
}

/** Idempotente: mantém o primeiro instante de reconhecimento. */
export function reconhecerAlerta(db: Database, id: number, agora: string): Alerta | undefined {
  db.prepare('UPDATE alertas SET reconhecido_em = COALESCE(reconhecido_em, ?) WHERE id = ?').run(agora, id);
  return alertaPorId(db, id);
}

/** Resolver também reconhece, se ainda não tinha sido reconhecido. */
export function resolverAlerta(db: Database, id: number, agora: string): Alerta | undefined {
  db.prepare('UPDATE alertas SET reconhecido_em = COALESCE(reconhecido_em, ?), resolvido_em = COALESCE(resolvido_em, ?) WHERE id = ?').run(agora, agora, id);
  return alertaPorId(db, id);
}
