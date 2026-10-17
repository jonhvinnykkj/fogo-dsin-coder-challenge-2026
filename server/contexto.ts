// Contexto compartilhado por rotas e serviços. Os tipos `unknown` são provisórios:
// as Tarefas 3 (geo), 4 (banco) e 6 (barramento/simulador) trocam pelos tipos reais.
export interface Relogio {
  agora(): Date;
}

export const relogioReal: Relogio = { agora: () => new Date() };

export interface ContextoApp {
  db: unknown;
  barramento: unknown;
  relogio: Relogio;
  geo: unknown;
  simulador?: unknown;
}
