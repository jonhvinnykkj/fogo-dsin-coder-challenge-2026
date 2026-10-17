import { readFileSync } from 'node:fs';
import type { Database } from 'better-sqlite3';

const SQL = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');

/** Cria tabelas e índices que faltam. Seguro para rodar a cada partida. */
export function migrar(db: Database): void {
  db.exec(SQL);
}
