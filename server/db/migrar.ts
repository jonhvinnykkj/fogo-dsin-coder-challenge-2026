import { readFileSync } from 'node:fs';
import type { Database } from 'better-sqlite3';
import { ehHashDeToken, hashTokenDispositivo } from '../seguranca/cripto';

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
  garantirSerieUnicaSemCaixa(db);
  garantirImediataNoMauFuncionamento(db);
  converterTokensLegados(db);
}

/**
 * Segurança: o banco guarda só o hash do token de cada dispositivo (`sha256:<hex>`). Bancos criados antes disso têm o
 * token em texto: converte uma vez, na partida. O dispositivo continua usando o mesmo token; só o banco deixa de conhecê-lo.
 */
export function converterTokensLegados(db: Database): number {
  const linhas = db.prepare('SELECT id, token_dispositivo AS t FROM equipamentos').all() as { id: number; t: string }[];
  const legados = linhas.filter((l) => !ehHashDeToken(l.t));
  if (legados.length === 0) return 0;
  const atualizar = db.prepare('UPDATE equipamentos SET token_dispositivo = ? WHERE id = ?');
  db.transaction(() => {
    for (const l of legados) atualizar.run(hashTokenDispositivo(l.t), l.id);
  })();
  return legados.length;
}

/**
 * Número de série único sem diferenciar maiúsculas de minúsculas ("REV-X" e "rev-x" são o mesmo). A restrição UNIQUE do
 * schema é sensível à caixa e não dá para trocá-la num banco que já existe; então vai um índice único à parte. Bancos que
 * já têm um par repetido (cadastrado antes da regra) não aceitariam o índice: o cadastro mais novo de cada par ganha o
 * sufixo " (repetido <id>)" para o par deixar de colidir e ninguém perder registro. Seguro rodar a cada partida.
 */
export function garantirSerieUnicaSemCaixa(db: Database): number {
  const repetidos = db
    .prepare(
      `SELECT id FROM equipamentos e WHERE EXISTS (
         SELECT 1 FROM equipamentos o WHERE o.numero_serie = e.numero_serie COLLATE NOCASE AND o.id < e.id)`,
    )
    .all() as { id: number }[];
  const renomear = db.prepare("UPDATE equipamentos SET numero_serie = numero_serie || ' (repetido ' || id || ')' WHERE id = ?");
  db.transaction(() => {
    for (const r of repetidos) renomear.run(r.id);
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS ux_equipamentos_numero_serie_sem_caixa ON equipamentos(numero_serie COLLATE NOCASE)');
  })();
  return repetidos.length;
}

/**
 * Equipamento em mau funcionamento precisa de manutenção imediata (o exemplo do enunciado). A regra vale daqui para a frente
 * em `gravarSituacao`; esta passada única corrige o banco que já existia (cadastrado ou semeado antes dela). Roda uma só vez
 * (marca em `meta`), para não desfazer, a cada partida, uma escolha que o gestor fez depois pelo formulário.
 */
export function garantirImediataNoMauFuncionamento(db: Database): number {
  const feito = db.prepare("SELECT 1 FROM meta WHERE chave = 'mau_funcionamento_imediata'").get();
  if (feito) return 0;
  return db.transaction(() => {
    const n = db.prepare("UPDATE equipamentos SET manutencao_necessidade = 'imediata' WHERE situacao = 'mau_funcionamento' AND manutencao_necessidade <> 'imediata'").run().changes;
    db.prepare("INSERT INTO meta (chave, valor) VALUES ('mau_funcionamento_imediata', '1')").run();
    return n;
  })();
}
