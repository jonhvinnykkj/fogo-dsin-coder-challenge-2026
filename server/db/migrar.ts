import { readFileSync } from 'node:fs';
import type { Database } from 'better-sqlite3';

const SQL = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');

/** Cria tabelas e índices que faltam. Seguro para rodar a cada partida. */
export function migrar(db: Database): void {
  db.exec(SQL);
  // Bancos criados antes da Tarefa 11b não têm `alertas.resolucao`; CREATE TABLE IF NOT EXISTS não acrescenta coluna.
  // O ALTER só roda se a coluna faltar, então migrar() continua seguro a cada partida.
  const temColuna = (tabela: string, coluna: string) =>
    (db.prepare(`PRAGMA table_info('${tabela}')`).all() as { name: string }[]).some((c) => c.name === coluna);
  if (!temColuna('alertas', 'resolucao')) {
    db.exec("ALTER TABLE alertas ADD COLUMN resolucao TEXT CHECK (resolucao IN ('manual','automatica'))");
  }
  // Rodada final: peso da ocorrência no índice das regiões.
  if (!temColuna('ocorrencias', 'peso')) db.exec('ALTER TABLE ocorrencias ADD COLUMN peso REAL NOT NULL DEFAULT 1');
  // Rodada final: previsão do tempo guardada por dia (preenchida por completarPrevisoesDeChuva na partida).
  if (!temColuna('clima_dia', 'chuva_prevista_mm')) db.exec('ALTER TABLE clima_dia ADD COLUMN chuva_prevista_mm REAL');
  // Rodada final: mudança de situação gerada pela semente × ao vivo, e a próxima manutenção no fim do histórico.
  // (Banco antigo: as linhas que já existiam ficam como 'historico', e a data é copiada na partida por preencherLacuna.)
  if (!temColuna('historico_situacao', 'origem')) {
    db.exec("ALTER TABLE historico_situacao ADD COLUMN origem TEXT NOT NULL DEFAULT 'historico' CHECK (origem IN ('historico','ao_vivo'))");
  }
  // Cidade/UF do endereço: sempre Marília/SP. Linhas antigas ficam com o valor padrão.
  if (!temColuna('equipamentos', 'cidade')) db.exec("ALTER TABLE equipamentos ADD COLUMN cidade TEXT NOT NULL DEFAULT 'Marília'");
  if (!temColuna('equipamentos', 'uf')) db.exec("ALTER TABLE equipamentos ADD COLUMN uf TEXT NOT NULL DEFAULT 'SP'");
  if (!temColuna('equipamentos', 'proxima_manutencao_historico')) db.exec('ALTER TABLE equipamentos ADD COLUMN proxima_manutencao_historico TEXT');
}
