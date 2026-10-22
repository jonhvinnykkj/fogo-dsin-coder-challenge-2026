import type { Database } from 'better-sqlite3';
import type { CategoriaAgente, Orgao, Regiao, SituacaoAgente, Turno } from '../../shared/dominio';
import type { Agente, AgenteMapa, Pagina } from '../../shared/modelos';
import type { AgenteInput, FiltrosAgente } from '../../shared/schemas';
import { condicaoBusca } from './busca';

interface LinhaAgente {
  id: number;
  nome: string;
  matricula: string;
  categoria: CategoriaAgente;
  orgao: Orgao;
  situacao: SituacaoAgente;
  turno: Turno;
  base_logradouro: string;
  base_bairro_id: number;
  base_bairro_nome: string;
  regiao: Regiao;
  lat: number;
  lng: number;
  lat_atual: number;
  lng_atual: number;
  ultimo_sinal_em: string | null;
  equipamento_id: number | null;
  telefone: string | null;
  criado_em: string;
  atualizado_em: string;
}

const SELECT = `
  SELECT a.id, a.nome, a.matricula, a.categoria, a.orgao, a.situacao, a.turno, a.base_logradouro, a.base_bairro_id,
         b.nome AS base_bairro_nome, b.regiao AS regiao, a.lat, a.lng, a.lat_atual, a.lng_atual, a.ultimo_sinal_em,
         a.equipamento_id, a.telefone, a.criado_em, a.atualizado_em
  FROM agentes a JOIN bairros b ON b.id = a.base_bairro_id`;

function paraAgente(l: LinhaAgente): Agente {
  return {
    id: l.id,
    nome: l.nome,
    matricula: l.matricula,
    categoria: l.categoria,
    orgao: l.orgao,
    situacao: l.situacao,
    turno: l.turno,
    baseLogradouro: l.base_logradouro,
    baseBairroId: l.base_bairro_id,
    baseBairroNome: l.base_bairro_nome,
    regiao: l.regiao,
    lat: l.lat,
    lng: l.lng,
    latAtual: l.lat_atual,
    lngAtual: l.lng_atual,
    ultimoSinalEm: l.ultimo_sinal_em,
    ...(l.equipamento_id !== null && { equipamentoId: l.equipamento_id }),
    ...(l.telefone !== null && { telefone: l.telefone }),
    criadoEm: l.criado_em,
    atualizadoEm: l.atualizado_em,
  };
}

export function agentePorId(db: Database, id: number): Agente | undefined {
  const l = db.prepare(`${SELECT} WHERE a.id = ?`).get(id) as LinhaAgente | undefined;
  return l && paraAgente(l);
}

export function matriculaEmUso(db: Database, matricula: string, ignorarId?: number): boolean {
  return db.prepare('SELECT 1 FROM agentes WHERE matricula = ? COLLATE NOCASE AND id IS NOT ?').get(matricula, ignorarId ?? null) !== undefined;
}

export function inserirAgente(db: Database, a: AgenteInput, agora: string): number {
  const r = db
    .prepare(
      `INSERT INTO agentes (nome, matricula, categoria, orgao, situacao, turno, base_logradouro, base_bairro_id, lat, lng, lat_atual, lng_atual,
         equipamento_id, telefone, criado_em, atualizado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(a.nome, a.matricula, a.categoria, a.orgao, a.situacao, a.turno, a.baseLogradouro, a.baseBairroId, a.lat, a.lng, a.lat, a.lng,
      a.equipamentoId ?? null, a.telefone ?? null, agora, agora);
  return Number(r.lastInsertRowid);
}

/**
 * Não toca em posição atual nem último sinal (vêm da telemetria) nem na situação (vem do turno e das ocorrências; muda só
 * pelo PATCH /situacao): o formulário aberto antes não pode desfazer um "em ocorrência".
 */
export function atualizarAgente(db: Database, id: number, a: AgenteInput, agora: string): void {
  db.prepare(
    `UPDATE agentes SET nome = ?, matricula = ?, categoria = ?, orgao = ?, turno = ?, base_logradouro = ?, base_bairro_id = ?,
       lat = ?, lng = ?, equipamento_id = ?, telefone = ?, atualizado_em = ? WHERE id = ?`,
  ).run(a.nome, a.matricula, a.categoria, a.orgao, a.turno, a.baseLogradouro, a.baseBairroId, a.lat, a.lng,
    a.equipamentoId ?? null, a.telefone ?? null, agora, id);
}

export function gravarSituacaoAgente(db: Database, id: number, situacao: SituacaoAgente, agora: string): void {
  db.prepare('UPDATE agentes SET situacao = ?, atualizado_em = ? WHERE id = ?').run(situacao, agora, id);
}

export interface VinculosDoAgente {
  ocorrencias: number;
  alertas: number;
}

/** O que impede a exclusão: ocorrências atendidas e alertas ligados ao agente. */
export function vinculosDoAgente(db: Database, id: number): VinculosDoAgente {
  return db
    .prepare('SELECT (SELECT COUNT(*) FROM ocorrencias WHERE agente_id = @id) AS ocorrencias, (SELECT COUNT(*) FROM alertas WHERE agente_id = @id) AS alertas')
    .get({ id }) as VinculosDoAgente;
}

export function removerAgente(db: Database, id: number): void {
  db.prepare('DELETE FROM agentes WHERE id = ?').run(id);
}

export function listarAgentes(db: Database, f: FiltrosAgente): Pagina<Agente> {
  const cond: string[] = [];
  const params: unknown[] = [];
  if (f.busca) cond.push(condicaoBusca(f.busca, ['a.nome', 'a.matricula', 'a.base_logradouro', 'b.nome'], params));
  if (f.categoria) { cond.push('a.categoria = ?'); params.push(f.categoria); }
  if (f.situacao) { cond.push('a.situacao = ?'); params.push(f.situacao); }
  if (f.turno) { cond.push('a.turno = ?'); params.push(f.turno); }
  if (f.bairroId) { cond.push('a.base_bairro_id = ?'); params.push(f.bairroId); }
  if (f.regiao) { cond.push('b.regiao = ?'); params.push(f.regiao); }
  if (f.orgao) { cond.push('a.orgao = ?'); params.push(f.orgao); }
  const onde = cond.length ? ` WHERE ${cond.join(' AND ')}` : '';
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM agentes a JOIN bairros b ON b.id = a.base_bairro_id${onde}`).get(...params) as { n: number }).n;
  const linhas = db
    .prepare(`${SELECT}${onde} ORDER BY a.nome, a.id LIMIT ? OFFSET ?`)
    .all(...params, f.porPagina, (f.pagina - 1) * f.porPagina) as LinhaAgente[];
  return { itens: linhas.map(paraAgente), total, pagina: f.pagina, porPagina: f.porPagina };
}

/** Ponto do mapa de um agente (posição ATUAL). */
export function agenteMapaPorId(db: Database, id: number): AgenteMapa | undefined {
  const l = db.prepare('SELECT id, nome, categoria, situacao, lat_atual, lng_atual, base_bairro_id FROM agentes WHERE id = ?').get(id) as
    | { id: number; nome: string; categoria: CategoriaAgente; situacao: SituacaoAgente; lat_atual: number; lng_atual: number; base_bairro_id: number }
    | undefined;
  return l && { id: l.id, nome: l.nome, categoria: l.categoria, situacao: l.situacao, lat: l.lat_atual, lng: l.lng_atual, bairroId: l.base_bairro_id };
}

/** Agente a que o equipamento já está vinculado (ignorando `ignorarAgenteId`, o que está sendo editado). */
export function agenteDoEquipamento(db: Database, equipamentoId: number, ignorarAgenteId?: number): { id: number; nome: string } | undefined {
  return db
    .prepare('SELECT id, nome FROM agentes WHERE equipamento_id = ? AND id IS NOT ? LIMIT 1')
    .get(equipamentoId, ignorarAgenteId ?? null) as { id: number; nome: string } | undefined;
}
