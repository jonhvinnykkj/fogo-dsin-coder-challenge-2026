import { readFileSync } from 'node:fs';
import type { Database } from 'better-sqlite3';

const SQL = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');

/** Cria tabelas e índices que faltam. Seguro para rodar a cada partida. */
export function migrar(db: Database): void {
  db.exec(SQL);
  // Bancos criados antes da Tarefa 11b não têm `alertas.resolucao`; CREATE TABLE IF NOT EXISTS não acrescenta coluna.
  // O ALTER só roda se a coluna faltar, então migrar() continua seguro a cada partida.
  const colunas = db.prepare("PRAGMA table_info('alertas')").all() as { name: string }[];
  if (!colunas.some((c) => c.name === 'resolucao')) {
    db.exec("ALTER TABLE alertas ADD COLUMN resolucao TEXT CHECK (resolucao IN ('manual','automatica'))");
  }
}
