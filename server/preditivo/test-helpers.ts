// Banco semeado compartilhado pelos testes do motor preditivo (e das rotas /api/previsoes).
//
// A semente completa (350 equipamentos, ~17,6 mil ocorrências, ~450 mil horas de telemetria) leva 1–3 s.
// O projeto 'preditivo' do vitest.config.ts roda esses arquivos num só processo, um depois do outro e sem isolar
// módulos, então `cidadeSemeada()` semeia UMA vez e todos reaproveitam. Rodando um arquivo sozinho, ele semeia na
// primeira chamada do mesmo jeito. O banco compartilhado é só para leitura: quem precisa gravar usa
// `copiaDaCidade()`, um banco em memória novo, cópia byte a byte do semeado.
import Database from 'better-sqlite3';
import { semear, SEMENTE_PADRAO } from '../semente/semear';
import { criarCtxDeTeste, type CtxDeTeste } from '../test/ctx';

/** Quinta-feira, 15/10/2026, 12 h em São Paulo. */
export const AGORA_PREDITIVO = new Date('2026-10-15T15:00:00.000Z');

let cidade: CtxDeTeste | undefined;

export function cidadeSemeada(): CtxDeTeste {
  if (!cidade) {
    cidade = criarCtxDeTeste({ agora: AGORA_PREDITIVO });
    semear(cidade.db, { agora: AGORA_PREDITIVO, semente: SEMENTE_PADRAO, geo: cidade.geo });
  }
  return cidade;
}

/** Cópia gravável da cidade semeada (banco em memória independente). */
export function copiaDaCidade(): Database.Database {
  const db = new Database(cidadeSemeada().db.serialize());
  db.pragma('foreign_keys = ON');
  return db;
}

export function bairroPorNome(db: Database.Database, nome: string): number {
  const linha = db.prepare('SELECT id FROM bairros WHERE nome = ?').get(nome) as { id: number } | undefined;
  if (!linha) throw new Error(`Bairro não encontrado: ${nome}`);
  return linha.id;
}
