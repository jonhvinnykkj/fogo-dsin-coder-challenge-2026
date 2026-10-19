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
  proxima_manutencao_historico  TEXT,           -- a próxima manutenção no fim do histórico gerado (o modelo de falhas usa esta)
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
  em              TEXT NOT NULL,
  -- 'historico' = gerada pela semente; 'ao_vivo' = simulador ou tela. As previsões aprendem só com 'historico'
  -- (vale também depois de reiniciar, quando o fim do histórico anda para a frente).
  origem          TEXT NOT NULL DEFAULT 'historico' CHECK (origem IN ('historico','ao_vivo'))
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
  origem          TEXT NOT NULL CHECK (origem IN ('historico','tempo_real','injetado')),
  -- Quanto a ocorrência pesa no índice das regiões (Central): 1 para histórico e injetado; ao vivo, 1 ÷ (8 × velocidade
  -- da simulação quando ela começou), porque o simulador gera 8 vezes o ritmo real (× a velocidade). Ver servicos/central.ts.
  peso            REAL NOT NULL DEFAULT 1
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
  chave_dedup     TEXT,
  -- Quem fechou o alerta: 'manual' (pessoa, pela tela) ou 'automatica' (a causa acabou). NULL = aberto ou fechado antes da Tarefa 11b.
  resolucao       TEXT CHECK (resolucao IN ('manual','automatica'))
);
CREATE INDEX IF NOT EXISTS idx_alertas_abertos ON alertas(resolvido_em, criticidade);
CREATE INDEX IF NOT EXISTS idx_alertas_equipamento ON alertas(equipamento_id);
CREATE INDEX IF NOT EXISTS idx_alertas_dedup ON alertas(chave_dedup);

CREATE TABLE IF NOT EXISTS clima_dia (
  data      TEXT PRIMARY KEY,                           -- YYYY-MM-DD
  chuva_mm  REAL NOT NULL DEFAULT 0,                    -- a que cai (nos dias futuros, a que vai cair na cidade sintética)
  previsto  INTEGER NOT NULL DEFAULT 0 CHECK (previsto IN (0, 1)),
  chuva_prevista_mm REAL                                -- previsão do tempo da véspera (observada + erro); as previsões usam esta
);

-- Chave/valor para o que não merece tabela própria. `historico_ate`: ISO da última hora de histórico gerada
-- (a semente e o preenchimento de lacuna a gravam; a telemetria ao vivo da hora corrente não conta como histórico).
CREATE TABLE IF NOT EXISTS meta (
  chave  TEXT PRIMARY KEY,
  valor  TEXT NOT NULL
);

-- ---- Segurança (login, sessões e auditoria) ----

-- Pessoas que entram no sistema. A senha fica só como hash scrypt com sal (`scrypt$N$r$p$sal$hash`).
CREATE TABLE IF NOT EXISTS usuarios (
  id          INTEGER PRIMARY KEY,
  login       TEXT NOT NULL UNIQUE,
  nome        TEXT NOT NULL,
  papel       TEXT NOT NULL CHECK (papel IN ('gestor','operador','agente','leitura')),
  senha_hash  TEXT NOT NULL,
  agente_id   INTEGER REFERENCES agentes(id) ON DELETE SET NULL,
  ativo       INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
  demo        INTEGER NOT NULL DEFAULT 0 CHECK (demo IN (0, 1)),
  criado_em   TEXT NOT NULL
);

-- Sessões abertas. Guarda só o SHA-256 do valor do cookie: quem copiar o banco não consegue se passar por ninguém.
CREATE TABLE IF NOT EXISTS sessoes (
  id_hash     TEXT PRIMARY KEY,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  criada_em   TEXT NOT NULL,
  expira_em   TEXT NOT NULL,
  ip          TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessoes_usuario ON sessoes(usuario_id);

-- Trilha de auditoria: toda escrita na API (e cada tentativa de entrada), com quem, o quê, antes e depois.
CREATE TABLE IF NOT EXISTS auditoria (
  id           INTEGER PRIMARY KEY,
  em           TEXT NOT NULL,
  usuario_id   INTEGER,
  login        TEXT,
  papel        TEXT,
  acao         TEXT NOT NULL,
  metodo       TEXT NOT NULL,
  rota         TEXT NOT NULL,
  entidade     TEXT,
  entidade_id  INTEGER,
  status       INTEGER NOT NULL,
  antes        TEXT,
  depois       TEXT,
  dados        TEXT,
  ip           TEXT
);
CREATE INDEX IF NOT EXISTS idx_auditoria_em ON auditoria(em);
