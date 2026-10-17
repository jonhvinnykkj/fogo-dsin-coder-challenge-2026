// Contexto compartilhado por rotas, serviços e pelo tempo real.
import type { Database } from 'better-sqlite3';
import type { GeoMarilia } from './geo/marilia';
import type { Barramento } from './tempo-real/barramento';
import type { MotorAlertas } from './tempo-real/motor-alertas';
import type { Simulador } from './tempo-real/simulador';

export interface Relogio {
  agora(): Date;
}

export const relogioReal: Relogio = { agora: () => new Date() };

export interface ContextoApp {
  db: Database;
  barramento: Barramento;
  /** Cria e resolve alertas (dedup por chave). Usado pela ingestão e pelo simulador. */
  motor: MotorAlertas;
  relogio: Relogio;
  geo: GeoMarilia;
  /** Ausente nos testes que não precisam dele; as rotas de simulação respondem 503 sem ele. */
  simulador?: Simulador;
}
