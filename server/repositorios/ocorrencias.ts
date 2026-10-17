import type { Database } from 'better-sqlite3';
import type { TipoOcorrencia } from '../../shared/dominio';
import type { Ocorrencia } from '../../shared/modelos';

interface LinhaOcorrencia {
  id: number;
  tipo: TipoOcorrencia;
  gravidade: 1 | 2 | 3 | 4;
  bairro_id: number;
  lat: number;
  lng: number;
  inicio: string;
  fim: string | null;
  equipamento_id: number | null;
  agente_id: number | null;
  descricao: string;
  chuva: number;
  origem: Ocorrencia['origem'];
}

export function paraOcorrencia(l: LinhaOcorrencia): Ocorrencia {
  return {
    id: l.id,
    tipo: l.tipo,
    gravidade: l.gravidade,
    bairroId: l.bairro_id,
    lat: l.lat,
    lng: l.lng,
    inicio: l.inicio,
    ...(l.fim !== null && { fim: l.fim }),
    ...(l.equipamento_id !== null && { equipamentoId: l.equipamento_id }),
    ...(l.agente_id !== null && { agenteId: l.agente_id }),
    descricao: l.descricao,
    chuva: l.chuva === 1,
    origem: l.origem,
  };
}

/** Últimas ocorrências atendidas pelo agente, mais recentes primeiro. */
export function ocorrenciasDoAgente(db: Database, agenteId: number, limite = 20): Ocorrencia[] {
  const linhas = db
    .prepare('SELECT * FROM ocorrencias WHERE agente_id = ? ORDER BY inicio DESC, id DESC LIMIT ?')
    .all(agenteId, limite) as LinhaOcorrencia[];
  return linhas.map(paraOcorrencia);
}

export type NovaOcorrencia = Omit<Ocorrencia, 'id' | 'fim'>;

export function inserirOcorrencia(db: Database, o: NovaOcorrencia): Ocorrencia {
  const r = db
    .prepare(
      `INSERT INTO ocorrencias (tipo, gravidade, bairro_id, lat, lng, inicio, equipamento_id, agente_id, descricao, chuva, origem)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(o.tipo, o.gravidade, o.bairroId, o.lat, o.lng, o.inicio, o.equipamentoId ?? null, o.agenteId ?? null, o.descricao, o.chuva ? 1 : 0, o.origem);
  return ocorrenciaPorId(db, Number(r.lastInsertRowid))!;
}

export function ocorrenciaPorId(db: Database, id: number): Ocorrencia | undefined {
  const l = db.prepare('SELECT * FROM ocorrencias WHERE id = ?').get(id) as LinhaOcorrencia | undefined;
  return l && paraOcorrencia(l);
}

export function encerrarOcorrencia(db: Database, id: number, fim: string): Ocorrencia | undefined {
  db.prepare('UPDATE ocorrencias SET fim = ? WHERE id = ? AND fim IS NULL').run(fim, id);
  return ocorrenciaPorId(db, id);
}
