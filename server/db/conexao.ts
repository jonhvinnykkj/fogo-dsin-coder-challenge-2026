import Database from 'better-sqlite3';

/** Minúsculas e sem acento: "Marília" -> "marilia". Valores nulos viram texto vazio. */
export function semAcento(texto: unknown): string {
  if (texto === null || texto === undefined) return '';
  return String(texto).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Abre o banco (WAL, chaves estrangeiras ligadas) e registra a função SQL `sem_acento`. */
export function abrirBanco(caminho: string): Database.Database {
  const db = new Database(caminho);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.function('sem_acento', { deterministic: true }, (texto) => semAcento(texto));
  return db;
}
