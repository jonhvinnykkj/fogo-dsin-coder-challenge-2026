-- Esquema do F.O.G.O. Idempotente: tudo com IF NOT EXISTS (rodado a cada partida do servidor).
-- Datas em texto ISO 8601 UTC (YYYY-MM-DDTHH:mm:ss.sssZ); datas de calendário em YYYY-MM-DD.

CREATE TABLE IF NOT EXISTS bairros (
  id        INTEGER PRIMARY KEY,
  nome      TEXT NOT NULL UNIQUE,
  regiao    TEXT NOT NULL CHECK (regiao IN ('Centro','Norte','Sul','Leste','Oeste')),
  lat       REAL NOT NULL,
  lng       REAL NOT NULL,
  cep       TEXT NOT NULL,
  poligono  TEXT NOT NULL            -- GeoJSON Polygon
);

CREATE TABLE IF NOT EXISTS equipamentos (
  id                            INTEGER PRIMARY KEY,
  codigo                        TEXT NOT NULL UNIQUE,   -- FOGO-RAD-0007
  tipo                          TEXT NOT NULL,
  numero_serie                  TEXT NOT NULL UNIQUE,
  marca                         TEXT NOT NULL,
  modelo                        TEXT NOT NULL,
  orgao                         TEXT NOT NULL,
  situacao                      TEXT NOT NULL CHECK (situacao IN ('nao_instalado','operacional','mau_funcionamento','em_manutencao','desativado','furtado')),
  cep                           TEXT NOT NULL,
  logradouro                    TEXT NOT NULL,
  referencia                    TEXT NOT NULL DEFAULT '',
  bairro_id                     INTEGER NOT NULL REFERENCES bairros(id),
  cidade                        TEXT NOT NULL DEFAULT 'Marília',
  uf                            TEXT NOT NULL DEFAULT 'SP',
  lat                           REAL NOT NULL,          -- ponto cadastrado (base)
  lng                           REAL NOT NULL,
  lat_atual                     REAL NOT NULL,          -- posição atual (telemetria)
  lng_atual                     REAL NOT NULL,
  manutencao_necessidade        TEXT NOT NULL DEFAULT 'nenhuma' CHECK (manutencao_necessidade IN ('nenhuma','imediata','agendada','periodica')),
  manutencao_periodicidade_dias INTEGER,
  ultima_manutencao             TEXT,
  proxima_manutencao            TEXT,
  caracteristicas               TEXT NOT NULL DEFAULT '{}',  -- JSON validado pelo tipo
  instalado_em                  TEXT,
  ultimo_sinal_em               TEXT,
  token_dispositivo             TEXT NOT NULL,          -- segredo do dispositivo; nunca sai pela API
  criado_em                     TEXT NOT NULL,
  atualizado_em                 TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_equipamentos_situacao ON equipamentos(situacao);
CREATE INDEX IF NOT EXISTS idx_equipamentos_tipo ON equipamentos(tipo);
CREATE INDEX IF NOT EXISTS idx_equipamentos_bairro ON equipamentos(bairro_id);
CREATE INDEX IF NOT EXISTS idx_equipamentos_proxima_manutencao ON equipamentos(proxima_manutencao);

CREATE TABLE IF NOT EXISTS historico_situacao (
  id              INTEGER PRIMARY KEY,
  equipamento_id  INTEGER NOT NULL REFERENCES equipamentos(id),
  de              TEXT NOT NULL,
  para            TEXT NOT NULL,
  motivo          TEXT NOT NULL,
  em              TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_historico_equipamento ON historico_situacao(equipamento_id, em);

CREATE TABLE IF NOT EXISTS agentes (
  id               INTEGER PRIMARY KEY,
  nome             TEXT NOT NULL,
  matricula        TEXT NOT NULL UNIQUE,
  categoria        TEXT NOT NULL CHECK (categoria IN ('agente_transito','guarda_municipal','policial_militar')),
  orgao            TEXT NOT NULL,
  situacao         TEXT NOT NULL CHECK (situacao IN ('em_servico','em_ocorrencia','pausa','fora_de_servico')),
  turno            TEXT NOT NULL CHECK (turno IN ('manha','tarde','noite','madrugada')),
  base_logradouro  TEXT NOT NULL,
  base_bairro_id   INTEGER NOT NULL REFERENCES bairros(id),
  lat              REAL NOT NULL,                       -- ponto cadastrado (base)
  lng              REAL NOT NULL,
  lat_atual        REAL NOT NULL,                       -- posição atual (telemetria)
  lng_atual        REAL NOT NULL,
  ultimo_sinal_em  TEXT,
  equipamento_id   INTEGER REFERENCES equipamentos(id),
  telefone         TEXT,
  criado_em        TEXT NOT NULL,
  atualizado_em    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agentes_categoria ON agentes(categoria);
CREATE INDEX IF NOT EXISTS idx_agentes_situacao ON agentes(situacao);
CREATE INDEX IF NOT EXISTS idx_agentes_bairro ON agentes(base_bairro_id);

CREATE TABLE IF NOT EXISTS ocorrencias (
  id              INTEGER PRIMARY KEY,
  tipo            TEXT NOT NULL,
  gravidade       INTEGER NOT NULL CHECK (gravidade BETWEEN 1 AND 4),
  bairro_id       INTEGER NOT NULL REFERENCES bairros(id),
  lat             REAL NOT NULL,
  lng             REAL NOT NULL,
  inicio          TEXT NOT NULL,
  fim             TEXT,
  equipamento_id  INTEGER REFERENCES equipamentos(id),
  agente_id       INTEGER REFERENCES agentes(id),
  descricao       TEXT NOT NULL DEFAULT '',
  chuva           INTEGER NOT NULL DEFAULT 0 CHECK (chuva IN (0, 1)),
  origem          TEXT NOT NULL CHECK (origem IN ('historico','tempo_real','injetado'))
);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_inicio ON ocorrencias(inicio);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_bairro_inicio ON ocorrencias(bairro_id, inicio);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_agente ON ocorrencias(agente_id, inicio);

CREATE TABLE IF NOT EXISTS telemetria_hora (
  equipamento_id  INTEGER NOT NULL REFERENCES equipamentos(id),
  hora            TEXT NOT NULL,                        -- início da hora, ISO UTC
  leituras        INTEGER NOT NULL DEFAULT 0,
  online_min      INTEGER NOT NULL DEFAULT 0,
  metricas        TEXT NOT NULL DEFAULT '{}',           -- JSON
  PRIMARY KEY (equipamento_id, hora)
) WITHOUT ROWID;                                        -- ~450 mil linhas: a chave é o próprio índice (sem cópia)

CREATE TABLE IF NOT EXISTS manutencoes (
  id              INTEGER PRIMARY KEY,
  equipamento_id  INTEGER NOT NULL REFERENCES equipamentos(id),
  tipo            TEXT NOT NULL CHECK (tipo IN ('corretiva','preventiva')),
  aberta_em       TEXT NOT NULL,
  prevista_para   TEXT,
  concluida_em    TEXT,
  descricao       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_manutencoes_equipamento ON manutencoes(equipamento_id);

CREATE TABLE IF NOT EXISTS alertas (
  id              INTEGER PRIMARY KEY,
  tipo            TEXT NOT NULL,
  criticidade     TEXT NOT NULL CHECK (criticidade IN ('critica','alta','media','baixa')),
  titulo          TEXT NOT NULL,
  descricao       TEXT NOT NULL,
  equipamento_id  INTEGER REFERENCES equipamentos(id),
  agente_id       INTEGER REFERENCES agentes(id),
  bairro_id       INTEGER REFERENCES bairros(id),
  lat             REAL,
  lng             REAL,
  criado_em       TEXT NOT NULL,
  reconhecido_em  TEXT,
  resolvido_em    TEXT,
  chave_dedup     TEXT
);
CREATE INDEX IF NOT EXISTS idx_alertas_abertos ON alertas(resolvido_em, criticidade);
CREATE INDEX IF NOT EXISTS idx_alertas_equipamento ON alertas(equipamento_id);
CREATE INDEX IF NOT EXISTS idx_alertas_dedup ON alertas(chave_dedup);

CREATE TABLE IF NOT EXISTS clima_dia (
  data      TEXT PRIMARY KEY,                           -- YYYY-MM-DD
  chuva_mm  REAL NOT NULL DEFAULT 0,
  previsto  INTEGER NOT NULL DEFAULT 0 CHECK (previsto IN (0, 1))
);
