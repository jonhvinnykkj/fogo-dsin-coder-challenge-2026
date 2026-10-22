// SQL do Modo Campo: despacho aberto do agente, chegada ao local e equipamentos em operação na rua.
import type { Database } from 'better-sqlite3';
import type { SituacaoEquipamento } from '../../shared/dominio';
import type { Ocorrencia } from '../../shared/modelos';
import type { TipoEquipamentoId } from '../../shared/tipos-equipamento';
import { paraOcorrencia } from './ocorrencias';

/**
 * A chegada ao local é do Modo Campo, então a tabela nasce aqui (e não em schema.sql): criada quando as rotas do
 * Modo Campo sobem, sem mexer em banco que já existe. Uma linha por ocorrência: só o agente despachado chega.
 */
export function garantirTabelaCampo(db: Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS chegadas_campo (
    ocorrencia_id  INTEGER PRIMARY KEY REFERENCES ocorrencias(id),
    agente_id      INTEGER NOT NULL REFERENCES agentes(id),
    chegou_em      TEXT NOT NULL
  )`);
}

/** Ocorrência ainda aberta para a qual o agente foi despachado (a mais recente, se houver mais de uma). */
export function despachoAbertoDoAgente(db: Database, agenteId: number): Ocorrencia | undefined {
  const l = db.prepare('SELECT * FROM ocorrencias WHERE agente_id = ? AND fim IS NULL ORDER BY inicio DESC, id DESC LIMIT 1').get(agenteId);
  return l ? paraOcorrencia(l as Parameters<typeof paraOcorrencia>[0]) : undefined;
}

export function chegadaDaOcorrencia(db: Database, ocorrenciaId: number): string | undefined {
  const l = db.prepare('SELECT chegou_em FROM chegadas_campo WHERE ocorrencia_id = ?').get(ocorrenciaId) as { chegou_em: string } | undefined;
  return l?.chegou_em;
}

export function registrarChegada(db: Database, ocorrenciaId: number, agenteId: number, em: string): void {
  db.prepare('INSERT INTO chegadas_campo (ocorrencia_id, agente_id, chegou_em) VALUES (?, ?, ?)').run(ocorrenciaId, agenteId, em);
}

export interface LinhaEquipamentoNaRua {
  id: number;
  codigo: string;
  tipo: TipoEquipamentoId;
  situacao: SituacaoEquipamento;
  logradouro: string;
  referencia: string;
  bairro_nome: string;
  lat_atual: number;
  lng_atual: number;
}

const SELECT_NA_RUA = `SELECT e.id, e.codigo, e.tipo, e.situacao, e.logradouro, e.referencia, b.nome AS bairro_nome, e.lat_atual, e.lng_atual
  FROM equipamentos e JOIN bairros b ON b.id = e.bairro_id`;

/** Tudo o que está na rua: fica de fora o que foi desativado ou ainda não foi instalado. */
export function equipamentosNaRua(db: Database): LinhaEquipamentoNaRua[] {
  return db.prepare(`${SELECT_NA_RUA} WHERE e.situacao NOT IN ('desativado', 'nao_instalado')`).all() as LinhaEquipamentoNaRua[];
}

export function equipamentoNaRuaPorId(db: Database, id: number): LinhaEquipamentoNaRua | undefined {
  return db.prepare(`${SELECT_NA_RUA} WHERE e.id = ?`).get(id) as LinhaEquipamentoNaRua | undefined;
}
