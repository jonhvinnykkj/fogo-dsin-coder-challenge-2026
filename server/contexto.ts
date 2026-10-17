// Contexto compartilhado por rotas e serviços. `barramento` e `simulador` ainda são provisórios:
// a Tarefa 6 troca pelos tipos reais.
import type { Database } from 'better-sqlite3';
import type { GeoMarilia } from './geo/marilia';

export interface Relogio {
  agora(): Date;
}

export const relogioReal: Relogio = { agora: () => new Date() };

export interface ContextoApp {
  db: Database;
  barramento: unknown;
  relogio: Relogio;
  geo: GeoMarilia;
  simulador?: unknown;
}
