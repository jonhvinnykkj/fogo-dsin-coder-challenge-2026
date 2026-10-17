# F.O.G.O. — Plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: superpowers:subagent-driven-development. Passos com caixas (`- [ ]`) para acompanhar.

**Objetivo:** construir o F.O.G.O. — inventário de equipamentos e agentes, central de operações em tempo real com mapa, e cidade preditiva — num único sistema web que roda com `npm install && npm start`.

**Arquitetura:** um processo Node (Fastify) serve a API REST, o fluxo SSE e a interface React já compilada. O banco é um arquivo SQLite criado e povoado sozinho no primeiro start (cidade sintética de Marília + 60 dias de histórico com padrões plantados). Um simulador no mesmo processo gera telemetria IoT que passa pela mesma função da rota de ingestão, alimenta o motor de alertas/anomalias e chega à tela por SSE. A previsão é estatística explicável em TypeScript.

**Stack:** Node ≥ 20 · TypeScript estrito · Fastify 5 (+ @fastify/static, @fastify/swagger, @fastify/swagger-ui) · better-sqlite3 · zod 3 · tsx · React 19 + Vite · React Router 7 · TanStack Query 5 · Leaflet 1.9 + react-leaflet 5 + leaflet.markercluster + leaflet.heat · Recharts · @phosphor-icons/react · d3-delaunay · Vitest + Testing Library + jsdom · Playwright (só 1 teste de fumaça) · concurrently. CSS puro com variáveis (sem Tailwind).

**Design:** `docs/design/2026-10-17-fogo-design.md` — leia antes de qualquer tarefa.

## Restrições globais

- Iniciar com um comando: `npm install && npm start` → http://localhost:3333 (porta por `PORT`). Dev: `npm run dev` (Vite em 5173 com proxy `/api` → 3333).
- Nenhum serviço externo obrigatório. Só os blocos do mapa (OpenStreetMap) e o ViaCEP opcional usam rede.
- Cidade: **Marília-SP**. CEPs na faixa **17500-000 a 17539-999**. Toda coordenada cadastrada precisa cair dentro do limite do município.
- Interface 100% em **português do Brasil**; números `1.234,5`; datas `dd/mm/aaaa HH:mm` no fuso America/Sao_Paulo. No banco, datas em texto ISO 8601 UTC.
- **Tema claro por padrão.** Modo escuro só por escolha do usuário ("Sala de controle"), grafite `#1E1E1F` (fundo) / `#2A2A2C` (superfície). Proibido usar `prefers-color-scheme`.
- Marca: laranja-fogo `#F04A00` para marca/ação; texto grafite `#1E1E1F`. Cores de situação (blocos cheios): operacional `#1F9D55`, mau funcionamento `#E8A400`, em manutenção `#2F6FEB`, desativado `#6B7280`, furtado `#C2185B`, não instalado `#9CA3AF` (contorno tracejado). Criticidade: crítica `#D92D20`, alta `#F04A00`, média `#E8A400`, baixa `#2F6FEB`.
- Ícones: `@phosphor-icons/react` com `weight="fill"`, sempre acompanhados de palavra. Nada de ícone de traço fino em bolinha colorida, avatar de iniciais, fundo creme ou cartão branco com borda fina.
- Nomes de domínio em português (`equipamento`, `situacao`, `bairro`…). TypeScript `strict: true`.
- Testes: `npx vitest run <arquivo>`; todos: `npm test`. Commits em português, um por tarefa, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Hook GateGuard: na primeira escrita de cada arquivo ou no primeiro comando, ele pede "fatos" (quem chama o arquivo, que não há duplicata, formato dos dados, pedido do usuário). Responda em texto e repita a mesma operação. O pedido do usuário é: "deixo tudo com vc, utilize agentes para criar a melhor solucao".
- Disco do Mac apertado: não instale nada fora do projeto; nada de pacotes pesados além dos listados.

## Foco de revisão

1. **Reiniciar o servidor com o banco já criado** não pode duplicar dados; e se o avaliador abrir dias depois, o histórico precisa ser completado até "agora" (lacuna preenchida), para "próximas 24 h" continuar valendo. → testes na Tarefa 5.
2. **Busca com `%`, `_`, aspas e acentos** ("50%", "D'Ávila", "marilia" achando "Marília") não pode quebrar nem casar tudo. → teste na Tarefa 4.
3. **Editar um equipamento enquanto a simulação o atualiza**: o PUT do formulário não pode apagar posição atual, último sinal nem situação vinda da telemetria. → teste na Tarefa 4.
4. **Excluir equipamento com histórico** (telemetria, alertas, agente vinculado) deve ser recusado com mensagem clara sugerindo "desativar". → teste na Tarefa 4.
5. **Aba que perdeu a conexão SSE** (notebook dormiu, servidor reiniciou) precisa reconectar e ressincronizar a tela sozinha. → teste na Tarefa 9.

## Estrutura de arquivos

```
package.json  tsconfig.json  tsconfig.server.json  vite.config.ts  vitest.config.ts  .nvmrc  .gitignore
Dockerfile  docker-compose.yml  README.md  docs/GUIA-DO-TIME.md
shared/                      código comum servidor + interface (sem dependência de Node)
  dominio.ts                 enums, rótulos pt-BR, cores, funções de classificação
  tipos-equipamento.ts       catálogo dos 13 tipos + schema zod das características
  schemas.ts                 schemas de entrada (equipamento, agente, filtros, situação)
  modelos.ts                 interfaces de saída da API e dos eventos SSE
  geo.ts                     pontoNoPoligono, distanciaMetros, LIMITE_MARILIA (do JSON)
  formato.ts                 formatarNumero, formatarData, formatarPct (pt-BR)
  limite-marilia.json        polígono do município (gerado na Tarefa 2)
server/
  index.ts                   start: banco → migração → semente/lacuna → app → simulador → listen
  app.ts                     criarApp(ctx) → FastifyInstance
  contexto.ts                ContextoApp, Relogio, relogioReal
  db/{conexao.ts, schema.sql, migrar.ts}
  geo/{marilia.ts, dados/bairros.json, dados/ruas.json, dados/FONTE.md}
  repositorios/{equipamentos,agentes,bairros,alertas,ocorrencias,telemetria,manutencoes}.ts
  servicos/{equipamentos.ts, central.ts}
  rotas/{saude,tipos,bairros,equipamentos,agentes,alertas,manutencao,central,telemetria,stream,simulacao,previsoes}.ts
  semente/{aleatorio.ts, catalogo-marcas.ts, cidade.ts, historico.ts, semear.ts}
  tempo-real/{barramento.ts, ingestao.ts, anomalias.ts, motor-alertas.ts, simulador.ts}
  preditivo/{base.ts, risco.ts, backtest.ts, reforco.ts, falhas.ts, tendencias.ts, resumo.ts}
web/
  index.html
  src/{main.tsx, App.tsx, rotas.tsx}
  src/api/{cliente.ts, consultas.ts}
  src/tempo-real/{useStream.ts}
  src/estilo/{tokens.css, base.css}
  src/componentes/...        Shell, Navegacao, BlocoIndicador, EtiquetaSituacao, IconeTipo, Tabela, BarraFiltros, Gaveta, CampoDinamico, MapaBase, SeletorPontoMapa, CartaoExplicacao
  src/paginas/{Central, Equipamentos, EquipamentoFicha, EquipamentoFormulario, Agentes, AgenteFicha, AgenteFormulario, Manutencao, Alertas, Previsoes}.tsx
scripts/{empacotar.mjs, geo/baixar-osm.mjs}
e2e/fumaca.spec.ts
```

Testes ficam ao lado do código (`*.test.ts` / `*.test.tsx`).

---

### Tarefa 1: Esqueleto do projeto

**Arquivos:**
- Criar: `package.json`, `tsconfig.json`, `tsconfig.server.json`, `vite.config.ts`, `vitest.config.ts`, `.nvmrc` (`22`), `.gitignore` (`node_modules`, `dist`, `data/*.db*`, `test-results`, `*.zip`), `server/index.ts`, `server/app.ts`, `server/contexto.ts`, `server/rotas/saude.ts`, `web/index.html`, `web/src/main.tsx`, `web/src/App.tsx`
- Teste: `server/rotas/saude.test.ts`

**Interfaces:**
- Produz: `criarApp(ctx: ContextoApp): Promise<FastifyInstance>` (em `server/app.ts`); `interface Relogio { agora(): Date }`; `relogioReal: Relogio`; `interface ContextoApp { db: Database.Database; barramento: Barramento; relogio: Relogio; geo: GeoMarilia; simulador?: Simulador }` — nesta tarefa `db`, `barramento`, `geo` podem ser tipos provisórios (`unknown`) que as Tarefas 3, 4 e 6 trocam pelos reais.
- Scripts do `package.json`: `dev` (concurrently: `tsx watch server/index.ts` + `vite`), `build` (`vite build` → `dist/web`), `start` (`npm run build && tsx server/index.ts`), `test` (`vitest run`), `typecheck` (`tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.server.json`), `e2e` (`playwright test`), `empacotar` (`node scripts/empacotar.mjs`). `engines.node: ">=20"`.
- `server/app.ts` serve `dist/web` com `@fastify/static` quando a pasta existir, com fallback de SPA (`index.html`) para rotas fora de `/api`.

- [ ] **Passo 1: teste que falha** — `saude.test.ts`: `criarApp(ctxDeTeste)` + `app.inject({ method: 'GET', url: '/api/saude' })` → `statusCode === 200` e corpo `{ ok: true, nome: 'F.O.G.O.' }`.
- [ ] **Passo 2:** `npx vitest run server/rotas/saude.test.ts` → FALHA (módulo inexistente).
- [ ] **Passo 3:** instalar dependências da stack, criar os arquivos acima e a rota `GET /api/saude`. `web/src/App.tsx` mostra só o título "F.O.G.O." por enquanto.
- [ ] **Passo 4:** teste passa; `npm run typecheck` sem erros; `npm start` responde `curl localhost:3333/api/saude` e `curl localhost:3333/` devolve o HTML.
- [ ] **Passo 5:** commit `chore: esqueleto do projeto (Fastify + Vite + Vitest)`.

### Tarefa 2: Dados geográficos de Marília

Só dados; não mexe em `package.json`. Pode rodar em paralelo com a Tarefa 1.

**Arquivos:**
- Criar: `scripts/geo/baixar-osm.mjs` (roda uma vez, sem dependências; consulta a Overpass API com novas tentativas e espera crescente, alternando entre `overpass-api.de`, `overpass.kumi.systems` e `overpass.private.coffee`), `server/geo/dados/bairros.json`, `server/geo/dados/ruas.json`, `shared/limite-marilia.json`, `server/geo/dados/FONTE.md`

**Interfaces:**
- Produz `bairros.json`: `Array<{ nome: string; regiao: 'Centro'|'Norte'|'Sul'|'Leste'|'Oeste'; lat: number; lng: number; cep: string }>` — ao menos 30 bairros reais da área urbana de Marília (nós `place=suburb|neighbourhood|quarter` do OSM; se faltarem, completar com bairros reais conferidos no OSM/Nominatim). `regiao` pelo quadrante em relação ao centro (−22.2139, −49.9458); raio de ~1,2 km do centro = `Centro`. `cep`: um CEP plausível da faixa 17500-000…17539-999 por bairro (anotar em FONTE.md que é aproximado).
- Produz `ruas.json`: `Array<{ nome: string; tipo: string; pontos: [number, number][] }>` — ao menos 200 vias nomeadas (`highway` primary/secondary/tertiary/residential) dentro do município, pontos simplificados (no máximo 30 por via), coordenadas com 5 casas decimais. Total do arquivo ≤ 1,5 MB.
- Produz `limite-marilia.json`: `{ type: 'Polygon', coordinates: [[[lng, lat], ...]] }` — perímetro urbano (relação administrativa do município recortada à mancha urbana, ou envoltória convexa das vias com folga de 300 m; dizer qual em FONTE.md).
- `FONTE.md`: origem (© colaboradores do OpenStreetMap, ODbL), data da coleta, consultas usadas.

- [ ] **Passo 1:** escrever e rodar `node scripts/geo/baixar-osm.mjs`.
- [ ] **Passo 2:** verificação (script Node rápido, não precisa virar teste): ≥ 30 bairros, ≥ 200 ruas, todo centro de bairro dentro do limite, nenhum nome repetido em bairros, tamanho de `ruas.json` ≤ 1,5 MB.
- [ ] **Passo 3:** commit `feat(geo): bairros, ruas e limite de Marília (OpenStreetMap)`.

### Tarefa 3: Domínio compartilhado, catálogo e geografia

**Arquivos:**
- Criar: `shared/dominio.ts`, `shared/tipos-equipamento.ts`, `shared/schemas.ts`, `shared/modelos.ts`, `shared/geo.ts`, `shared/formato.ts`, `server/geo/marilia.ts`
- Teste: `shared/tipos-equipamento.test.ts`, `shared/schemas.test.ts`, `shared/formato.test.ts`, `server/geo/marilia.test.ts`

**Interfaces:**
- Consome: JSONs da Tarefa 2.
- Produz (`shared/dominio.ts`): `SITUACOES_EQUIPAMENTO = ['nao_instalado','operacional','mau_funcionamento','em_manutencao','desativado','furtado'] as const` e `type SituacaoEquipamento`; `NECESSIDADES_MANUTENCAO = ['nenhuma','imediata','agendada','periodica']`; `CATEGORIAS_AGENTE = ['agente_transito','guarda_municipal','policial_militar']`; `SITUACOES_AGENTE = ['em_servico','em_ocorrencia','pausa','fora_de_servico']`; `REGIOES = ['Centro','Norte','Sul','Leste','Oeste']`; `CRITICIDADES = ['critica','alta','media','baixa']`; `TIPOS_OCORRENCIA = ['acidente','congestionamento','infracao','furto_vandalismo','veiculo_quebrado','alagamento','seguranca']`; `ORGAOS = ['Secretaria de Mobilidade Urbana','Guarda Civil Municipal','Polícia Militar','Concessionária do Rotativo','Operadora de Patinetes','Defesa Civil']`; mapas `ROTULO_*` (pt-BR) e `COR_SITUACAO`, `COR_CRITICIDADE` (valores das Restrições globais); `estaIndisponivel(s)` = `mau_funcionamento | em_manutencao | furtado`; `contaNaDisponibilidade(s)` = tudo menos `nao_instalado` e `desativado`; `agenteEmAtividade(s)` = `em_servico | em_ocorrencia`.
- Produz (`shared/tipos-equipamento.ts`): `type TipoEquipamentoId = 'radar'|'camera'|'balanca'|'fiscal_rotativo'|'cancela'|'transporte'|'totem_rotativo'|'patinete'|'moto_agente'|'viatura'|'semaforo'|'painel_mensagem'|'sensor_alagamento'`; `interface CampoCaracteristica { chave: string; rotulo: string; tipo: 'texto'|'numero'|'booleano'|'opcao'; opcoes?: string[]; min?: number; max?: number; unidade?: string; obrigatorio: boolean }`; `interface TipoEquipamento { id: TipoEquipamentoId; rotulo: string; sigla: string /* 3 letras: RAD CAM BAL FIS CAN TRA TOT PAT MOT VTR SEM PMV ALG */; movel: boolean; icone: string /* nome do componente Phosphor */; orgaoPadrao: Orgao; campos: CampoCaracteristica[] }`; `TIPOS_EQUIPAMENTO: TipoEquipamento[]` (campos do design §5.1); `tipoPorId(id)`; `schemaCaracteristicas(id): z.ZodType<Record<string, unknown>>`.
- Produz (`shared/schemas.ts`): `equipamentoInputSchema` (tipo, numeroSerie, marca, modelo, orgao, situacao, cep `/^\d{5}-?\d{3}$/` dentro da faixa, logradouro, referencia, bairroId, lat, lng, manutencaoNecessidade, manutencaoPeriodicidadeDias?, ultimaManutencao?, proximaManutencao?, caracteristicas, instaladoEm?) com `superRefine`: coordenada dentro de `LIMITE_MARILIA`; `proximaManutencao` obrigatória se `agendada|periodica`; `manutencaoPeriodicidadeDias` obrigatória se `periodica`; `caracteristicas` validadas por `schemaCaracteristicas(tipo)`. `type EquipamentoInput`. `agenteInputSchema` (nome, matricula, categoria, orgao, situacao, turno `'manha'|'tarde'|'noite'|'madrugada'`, baseLogradouro, baseBairroId, lat, lng, equipamentoId?, telefone?). `mudancaSituacaoSchema = { situacao, motivo: string min 3, recuperado?: boolean }`. `filtrosEquipamentoSchema` (busca?, tipo?, situacao?, bairroId?, regiao?, orgao?, manutencao? `'imediata'|'proxima'|'atrasada'`, pagina=1, porPagina=25 máx 100). `filtrosAgenteSchema` análogo.
- Produz (`shared/modelos.ts`): `Bairro { id; nome; regiao; lat; lng; cep; poligono: GeoJSON.Polygon }`, `Equipamento` (campos do input + `id`, `codigo`, `bairroNome`, `regiao`, `latAtual`, `lngAtual`, `ultimoSinalEm`, `criadoEm`, `atualizadoEm`), `EquipamentoMapa { id; codigo; tipo; situacao; lat; lng; bairroId; orgao; manutencao: 'ok'|'proxima'|'imediata'|'atrasada' }`, `Agente`, `AgenteMapa`, `Alerta { id; tipo; criticidade; titulo; descricao; equipamentoId?; agenteId?; bairroId?; lat?; lng?; criadoEm; reconhecidoEm?; resolvidoEm? }`, `Ocorrencia`, `Indicadores { totalEquipamentos; operacionais; indisponiveis; naoInstalados; desativados; disponibilidadePct; agentesEmAtividade; agentesTotal; alertasAbertos; alertasCriticosAbertos; manutencaoImediata; manutencaoProxima7d }`, `StatusBairro { bairroId; nome; indice; nivel: 'normal'|'atencao'|'critico'; motivos: string[] }`, `StatusRegiao { regiao; indice; nivel; motivos; bairros: StatusBairro[] }`, `EstadoSimulacao { velocidade: 1|10|60; pausado: boolean; relogio: string }`, `EventoFogo` (união discriminada por `tipo`: `'posicoes' | 'equipamento' | 'agente' | 'alerta' | 'ocorrencia' | 'indicadores' | 'simulacao'`), e os tipos da Tarefa 8 (`ExplicacaoPrevisao`, `CelulaRisco`, `PrevisaoRisco`, `ResultadoBacktest`, `RecomendacaoReforco`, `RiscoFalha`, `Tendencias`, `ResumoPreditivo`).
- Produz (`shared/geo.ts`): `pontoNoPoligono(lat, lng, poligono): boolean`, `distanciaMetros(a, b): number`, `LIMITE_MARILIA`, `dentroDeMarilia(lat, lng)`.
- Produz (`server/geo/marilia.ts`): `carregarGeo(): GeoMarilia` com `GeoMarilia { bairros: Omit<Bairro,'id'>[] /* com polígono Voronoi (d3-delaunay) recortado ao limite */; ruas: Rua[]; bairroDoPonto(lat, lng): number /* índice do bairro mais próximo */; pontoAleatorioNaRua(rng, bairroIndice?): { lat; lng; logradouro } }`.
- Produz (`shared/formato.ts`): `formatarNumero(n, casas=0)`, `formatarPct(n)`, `formatarData(iso)`, `formatarDataHora(iso)`, `formatarRelativo(iso, agora)` ("há 3 min").

- [ ] **Passo 1: testes que falham**
  - `tipos-equipamento.test.ts`: 13 tipos; siglas únicas de 3 letras; `movel === true` exatamente para `fiscal_rotativo, transporte, patinete, moto_agente, viatura`; `schemaCaracteristicas('radar').safeParse({ modalidade: 'velocidade', velocidadeMaxima: 60, faixas: 2, sentido: 'Centro → Bairro' }).success === true` e com `velocidadeMaxima: 250` → `false`; `schemaCaracteristicas('camera')` exige `resolucao` em `['720p','1080p','4K']`.
  - `schemas.test.ts`: equipamento válido no centro (−22.2139, −49.9458) passa; mesmo com `lat: -23.55, lng: -46.63` (São Paulo) falha com mensagem contendo "Marília"; `manutencaoNecessidade: 'agendada'` sem `proximaManutencao` falha; CEP `01310-100` falha e `17509-020` passa.
  - `formato.test.ts`: `formatarNumero(1234.5, 1) === '1.234,5'`; `formatarPct(87.25) === '87,3%'`; `formatarData('2026-10-17T15:00:00Z') === '17/10/2026'`.
  - `marilia.test.ts`: `carregarGeo().bairros.length >= 30`; todo polígono de bairro tem ≥ 3 vértices; `bairroDoPonto(b.lat, b.lng) === i` para cada bairro `i`; `pontoAleatorioNaRua` com o mesmo `rng` semeado devolve o mesmo ponto, sempre `dentroDeMarilia`.
- [ ] **Passo 2:** rodar → FALHA.
- [ ] **Passo 3:** implementar os arquivos. Voronoi: `Delaunay.from(centros).voronoi([minLng, minLat, maxLng, maxLat])`, cada célula recortada ao limite (Sutherland–Hodgman serve; o limite é um polígono simples).
- [ ] **Passo 4:** testes passam; `npm run typecheck` limpo.
- [ ] **Passo 5:** commit `feat(dominio): catálogo de equipamentos, schemas e geografia de Marília`.

### Tarefa 4: Banco, repositórios e API de cadastro (Parte 1 — servidor)

**Arquivos:**
- Criar: `server/db/conexao.ts`, `server/db/schema.sql`, `server/db/migrar.ts`, `server/repositorios/*.ts`, `server/servicos/equipamentos.ts`, `server/rotas/{tipos,bairros,equipamentos,agentes,alertas,manutencao}.ts`
- Modificar: `server/app.ts` (registrar rotas + swagger em `/api/docs`), `server/contexto.ts` (tipo real do `db`)
- Teste: `server/rotas/equipamentos.test.ts`, `server/rotas/agentes.test.ts`, `server/rotas/alertas.test.ts`, `server/test/ctx.ts` (fábrica de contexto com banco `:memory:` + bairros carregados)

**Interfaces:**
- Consome: Tarefa 3.
- Produz: `abrirBanco(caminho: string): Database` (WAL, `foreign_keys = ON`); `migrar(db)` (idempotente, executa `schema.sql` com `CREATE TABLE IF NOT EXISTS`); `inserirBairros(db, geo)`.
- Tabelas (`schema.sql`): `bairros(id, nome UNIQUE, regiao, lat, lng, cep, poligono TEXT)`; `equipamentos(id, codigo UNIQUE, tipo, numero_serie UNIQUE, marca, modelo, orgao, situacao, cep, logradouro, referencia, bairro_id FK, cidade DEFAULT 'Marília', uf DEFAULT 'SP', lat, lng, lat_atual, lng_atual, manutencao_necessidade, manutencao_periodicidade_dias, ultima_manutencao, proxima_manutencao, caracteristicas TEXT, instalado_em, ultimo_sinal_em, token_dispositivo, criado_em, atualizado_em)`; `historico_situacao(id, equipamento_id FK, de, para, motivo, em)`; `agentes(id, nome, matricula UNIQUE, categoria, orgao, situacao, turno, base_logradouro, base_bairro_id FK, lat, lng, equipamento_id FK NULL, telefone, atualizado_em)`; `ocorrencias(id, tipo, gravidade 1–4, bairro_id, lat, lng, inicio, fim, equipamento_id, agente_id, descricao, chuva 0/1, origem 'historico'|'tempo_real'|'injetado')`; `telemetria_hora(equipamento_id, hora, leituras, online_min, metricas TEXT, PRIMARY KEY(equipamento_id, hora))`; `manutencoes(id, equipamento_id, tipo 'corretiva'|'preventiva', aberta_em, prevista_para, concluida_em, descricao)`; `alertas(id, tipo, criticidade, titulo, descricao, equipamento_id, agente_id, bairro_id, lat, lng, criado_em, reconhecido_em, resolvido_em, chave_dedup)`; `clima_dia(data PRIMARY KEY, chuva_mm, previsto 0/1)`. Índices em situação, tipo, bairro, `ocorrencias(inicio)`, `ocorrencias(bairro_id, inicio)`, `alertas(resolvido_em, criticidade)`.
- Rotas: `GET /api/tipos-equipamento`; `GET /api/bairros`; `GET /api/equipamentos` (filtros → `{ itens: Equipamento[]; total: number }`); `GET /api/equipamentos/:id` (→ `Equipamento & { historico; manutencoes; alertas }`); `POST /api/equipamentos` (gera `codigo = FOGO-<SIGLA>-<4 dígitos sequenciais>` e `token_dispositivo` aleatório; 201); `PUT /api/equipamentos/:id`; `PATCH /api/equipamentos/:id/situacao` (grava histórico); `DELETE /api/equipamentos/:id`; `GET /api/equipamentos/:id/telemetria?horas=48`; o mesmo conjunto para `/api/agentes`; `GET /api/alertas?status=abertos|todos&criticidade=`; `PATCH /api/alertas/:id/reconhecer`; `PATCH /api/alertas/:id/resolver`; `GET /api/manutencao/painel` → `{ atrasadas; imediatas; proximos7; proximos30 }` (cada item `Equipamento`).
- Erros: 400 com `{ erro: string; campos?: Record<string, string> }` (mensagens do zod em pt-BR); 404 `{ erro: 'Equipamento não encontrado' }`; 409 para conflito.
- Regras do serviço: número de série único (409 "Já existe equipamento com este número de série"); `furtado → operacional` só com `recuperado: true` (400 "Registre a recuperação do equipamento antes de voltar a operar"); `PUT` não altera `lat_atual`, `lng_atual`, `ultimo_sinal_em`, `codigo`, `token_dispositivo`; `DELETE` só se não houver telemetria, alerta nem agente vinculado, senão 409 "Este equipamento tem histórico. Use a situação 'Desativado' em vez de excluir."
- Busca: `LIKE ? ESCAPE '\'` com `%`, `_` e `\` escapados; comparação sem acento (coluna/função `sem_acento` registrada via `db.function`) sobre código, número de série, marca, modelo, logradouro e bairro.

- [ ] **Passo 1: testes que falham** (`equipamentos.test.ts`)
  - POST válido → 201, `codigo` casa `/^FOGO-RAD-\d{4}$/`; GET por id devolve os mesmos dados; GET lista com `tipo=radar` traz ele, com `tipo=camera` não.
  - POST com mesmo `numeroSerie` → 409.
  - POST com coordenada de São Paulo → 400 com `campos.lat` ou `campos.lng`.
  - `busca=50%` casa só equipamento com "50%" no modelo (cadastrar outro sem); `busca=D'Ávila` → 200; `busca=marilia` acha logradouro "Rua Marília…".
  - PUT depois de gravar `lat_atual = -22.2` e `ultimo_sinal_em` direto no banco → esses campos continuam iguais.
  - PATCH `furtado` → `operacional` sem `recuperado` → 400; com `recuperado: true` → 200 e `historico.length === 2`.
  - DELETE de equipamento com linha em `telemetria_hora` → 409 com mensagem citando "Desativado"; DELETE de equipamento novo sem histórico → 204.
  - `agentes.test.ts`: CRUD básico, matrícula única (409), filtro por categoria.
  - `alertas.test.ts`: reconhecer preenche `reconhecidoEm`; resolver tira da lista `status=abertos`.
- [ ] **Passo 2:** rodar → FALHA.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** testes passam; `/api/docs` abre com as rotas listadas.
- [ ] **Passo 5:** commit `feat(api): banco SQLite e cadastro de equipamentos, agentes e alertas`.

### Tarefa 5: Cidade sintética e histórico com padrões plantados

**Arquivos:**
- Criar: `server/semente/aleatorio.ts`, `server/semente/catalogo-marcas.ts`, `server/semente/cidade.ts`, `server/semente/historico.ts`, `server/semente/semear.ts`
- Modificar: `server/index.ts` (semear/preencher lacuna no start)
- Teste: `server/semente/semear.test.ts`, `server/semente/historico.test.ts`

**Interfaces:**
- Consome: Tarefas 3 e 4.
- Produz: `criarRng(semente: number): Rng` (mulberry32) com `rng.num()`, `rng.int(min, max)`, `rng.escolher(lista)`, `rng.peso(mapa)`, `rng.normal(media, desvio)`; `semear(db, { agora: Date; semente: number; geo: GeoMarilia }): { criado: boolean }` (não faz nada se já houver equipamentos); `preencherLacuna(db, { agora; semente; geo }): { horasGeradas: number }` (gera histórico da última hora registrada até `agora` quando a lacuna passar de 1 h).
- Conteúdo da semente (`SEMENTE_PADRAO = 2026`): ~350 equipamentos distribuídos pelos 13 tipos (mais radares, câmeras, semáforos e patinetes), marcas/modelos plausíveis por tipo em `catalogo-marcas.ts` com `confiabilidade` 0–1 por modelo (ao menos um modelo claramente pior), números de série no formato da marca, posição em ruas reais do bairro, referência variada ("nº 181", "oposto ao nº 181", "S/N", "KM 3 da SP-294", "em frente ao Mercado do Tio"); situação ~82% operacional, 6% mau funcionamento, 4% em manutenção, 3% não instalado, 3% desativado, 2% furtado; manutenção coerente (algumas atrasadas, algumas imediatas). ~80 agentes nas 3 categorias, turnos, bases e motos/viaturas vinculadas.
- Histórico de 60 dias até `agora`: `clima_dia` (≈ 25% dos dias com chuva) + 7 dias de previsão (`previsto = 1`); ocorrências por hora com taxa = base do bairro × perfil hora/dia × (1,8 se chuva para acidentes) × eventos; telemetria horária por equipamento (fluxo, velocidade média, infrações, online, bateria, pesagens…) com quedas antes das falhas; manutenções preventivas/corretivas; falhas com chance maior para modelo pouco confiável, idade alta e manutenção atrasada.
- Padrões plantados (documentar em comentário no topo de `historico.ts`, eles viram as perguntas da Parte 3): picos 7–9 h e 17–19 h em dias úteis; sexta e sábado 20 h–2 h no Centro com 2,5× ocorrências de segurança/infração; horário de escola (6:30–7:30, 11:30–13:30, 17–18 h) mais acidentes leves perto dos transportes escolares; chuva → acidentes 1,8×; dois bairros com furto de patinete 3× acima; modelo pouco confiável falha ~3× mais.

- [ ] **Passo 1: testes que falham**
  - `semear.test.ts`: `semear` em banco vazio → `criado: true`, 300–400 equipamentos, 60–100 agentes, todos `dentroDeMarilia`, números de série únicos; segunda chamada → `criado: false` e contagens iguais; mesma semente em dois bancos → mesmo hash (ex.: concatenação ordenada de `codigo|numero_serie|lat|lng`).
  - `preencherLacuna` com `agora` 3 dias depois → `horasGeradas` entre 71 e 73 e nenhuma ocorrência duplicada (mesmo `inicio`+`bairro_id`+`tipo` não repete).
  - `historico.test.ts`: participação das horas 7–9 e 17–19 em dias úteis > 1,5× a média das outras horas diurnas; taxa de acidentes em dia de chuva ≥ 1,5× dia seco; ocorrências de segurança no Centro sex/sáb 20 h–2 h ≥ 2× as de seg–qui no mesmo horário; taxa de falha do modelo pouco confiável ≥ 2× a média dos demais.
- [ ] **Passo 2:** rodar → FALHA.
- [ ] **Passo 3:** implementar. Inserção em transação única e statements preparados (meta: semente completa < 15 s no Mac).
- [ ] **Passo 4:** testes passam; `rm -f data/fogo.db && npm start` cria o banco e loga contagens e tempo.
- [ ] **Passo 5:** commit `feat(semente): cidade sintética de Marília e 60 dias de histórico`.

### Tarefa 6: Tempo real — ingestão IoT, anomalias, alertas, simulador e SSE

**Arquivos:**
- Criar: `server/tempo-real/{barramento.ts, ingestao.ts, anomalias.ts, motor-alertas.ts, simulador.ts}`, `server/rotas/{telemetria.ts, stream.ts, simulacao.ts}`
- Modificar: `server/app.ts`, `server/index.ts` (inicia o simulador), `server/contexto.ts`
- Teste: `server/tempo-real/ingestao.test.ts`, `server/tempo-real/anomalias.test.ts`, `server/tempo-real/motor-alertas.test.ts`, `server/tempo-real/simulador.test.ts`, `server/rotas/telemetria.test.ts`

**Interfaces:**
- Consome: Tarefas 3–5.
- Produz: `class Barramento { emitir(e: EventoFogo): void; assinar(fn: (e: EventoFogo) => void): () => void }`; `interface LeituraTelemetria { codigo: string; em?: string; metricas: Record<string, number | boolean>; lat?: number; lng?: number }`; `ingerirTelemetria(ctx, leitura): { aceita: true; alertas: Alerta[] }` (atualiza `ultimo_sinal_em`, posição atual, acumula em `telemetria_hora`, roda anomalias e regras, emite eventos); `calcularBaseHoraria(db, equipamentoId, diaUtil: boolean, hora: number): { media: Record<string, number>; desvio: Record<string, number>; amostras: number }`; `detectarAnomalia(base, leitura, tipo): { metrica: string; valor: number; esperado: number; z: number; explicacao: string } | null` (|z| ≥ 3 com ≥ 5 amostras; para fluxo de radar, zero em horário com média ≥ 50 conta como anomalia mesmo com desvio grande); `class MotorAlertas { avaliarLeitura(...); varrer(agora) /* sem sinal > 15 min, manutenção atrasada, patinete fora do limite */; registrar(alerta) /* dedup por chave_dedup enquanto aberto */ }`; `class Simulador { iniciar(); parar(); estado(): EstadoSimulacao; definir({ velocidade?, pausado? }); injetar(tipo: 'furto'|'falha'|'acidente'|'alagamento'|'congestionamento', alvoId?: number): Alerta[]; passo(): void /* um tick, usado nos testes */ }` — tick a cada 2 s reais × velocidade; móveis andam pelas ruas; leituras seguem os mesmos perfis da Tarefa 5; falhas, furtos e ocorrências aleatórias em taxa baixa; tudo via `ingerirTelemetria` (o mesmo caminho da rota).
- Rotas: `POST /api/telemetria` (cabeçalho `x-dispositivo-token`; 401 se faltar ou não bater com o `codigo`; 202 `{ aceita: true }`); `GET /api/stream` (SSE: `retry: 3000`, um evento `estado` com `{ indicadores, simulacao }` ao conectar, depois eventos do barramento; posições agrupadas num evento `posicoes` a cada 2 s; `:ping` a cada 15 s); `GET /api/simulacao`; `PATCH /api/simulacao` `{ velocidade?: 1|10|60; pausado?: boolean }`; `POST /api/simulacao/eventos` `{ tipo, alvoId? }` → `{ alertas }`.
- Tipos de alerta (`tipo` + criticidade): `sem_sinal` (alta), `anomalia_leitura` (média; alta se radar zerado no pico), `furto_suspeito` (crítica), `falha_equipamento` (alta), `manutencao_atrasada` (média), `alagamento` (crítica acima da altura de alerta), `acidente` (alta; crítica se gravidade 4), `congestionamento` (média). Título e descrição em pt-BR dizendo o quê, onde e por quê (ex.: "Radar FOGO-RAD-0012 sem leituras às 18h — normal para o horário: 410 veículos/h").

- [ ] **Passo 1: testes que falham**
  - `telemetria.test.ts`: sem token → 401; token de outro equipamento → 401; certo → 202 e `ultimo_sinal_em` atualizado.
  - `anomalias.test.ts`: base com média 400 e desvio 40 (10 amostras) e leitura 0 → anomalia com `explicacao` contendo "400"; leitura 410 → `null`; base com 3 amostras → `null`.
  - `motor-alertas.test.ts`: duas leituras anômalas seguidas do mesmo radar → 1 alerta aberto (dedup); depois de resolvido, nova anomalia → novo alerta; `varrer` com equipamento operacional sem sinal há 20 min → alerta `sem_sinal`; patinete com posição fora de Marília → `furto_suspeito` crítico.
  - `simulador.test.ts`: com rng semeado, 10 × `passo()` geram as mesmas leituras em duas execuções; `injetar('alagamento')` gera alerta `alagamento` crítico e evento no barramento; `definir({ velocidade: 60 })` reflete em `estado()`.
  - `ingestao.test.ts`: leitura de patinete com `lat/lng` muda `lat_atual/lng_atual` e emite evento `posicoes` no próximo agrupamento.
- [ ] **Passo 2:** rodar → FALHA.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** testes passam; com `npm start`, `curl -N localhost:3333/api/stream` mostra eventos chegando; `curl -X POST /api/simulacao/eventos -d '{"tipo":"acidente"}'` faz aparecer um `alerta` no stream.
- [ ] **Passo 5:** commit `feat(tempo-real): ingestão IoT, anomalias, alertas, simulador e SSE`.

### Tarefa 7: Central — indicadores, mapa e situação das regiões (Parte 2 — servidor)

**Arquivos:**
- Criar: `server/servicos/central.ts`, `server/rotas/central.ts`
- Modificar: `server/app.ts`, `server/tempo-real/simulador.ts` (emitir `indicadores` a cada 5 s)
- Teste: `server/servicos/central.test.ts`

**Interfaces:**
- Consome: Tarefas 3–6.
- Produz: `calcularIndicadores(db, filtros?): Indicadores` — `disponibilidadePct = operacionais / (total − naoInstalados − desativados) × 100`, 1 casa; `indisponiveis = mau_funcionamento + em_manutencao + furtado`; `agentesEmAtividade = em_servico + em_ocorrencia`; `manutencaoProxima7d` = `proxima_manutencao` entre hoje e hoje+7. `listarParaMapa(db, filtros?): { equipamentos: EquipamentoMapa[]; agentes: AgenteMapa[] }` (`manutencao`: `atrasada` se `proxima_manutencao < hoje`, `imediata` se necessidade imediata, `proxima` se ≤ 7 dias, senão `ok`). `calcularStatusRegioes(db, agora): StatusRegiao[]` — índice do bairro 0–100 = min(100, 12 × indisponíveis + 25 × alertas críticos abertos + 10 × alertas altos abertos + 4 × ocorrências nas últimas 3 h); nível `normal` < 30 ≤ `atencao` < 60 ≤ `critico`; `motivos` em pt-BR ("2 câmeras indisponíveis", "1 alerta crítico aberto"); índice da região = máximo dos bairros.
- Rotas: `GET /api/central/indicadores` (aceita os mesmos filtros do mapa), `GET /api/central/mapa` (filtros: tipo[], situacao[], bairroId, regiao, orgao, manutencao), `GET /api/central/regioes`.

- [ ] **Passo 1: testes que falham** (`central.test.ts`, banco montado à mão com 10 equipamentos): 6 operacionais, 1 mau funcionamento, 1 furtado, 1 não instalado, 1 desativado → `disponibilidadePct === 75`, `indisponiveis === 2`; filtro `tipo=['camera']` muda os totais; bairro com 1 alerta crítico + 2 indisponíveis → índice 49, nível `atencao`, `motivos` com "alerta crítico"; equipamento com `proxima_manutencao` ontem → `manutencao: 'atrasada'` no mapa.
- [ ] **Passo 2:** rodar → FALHA.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** testes passam.
- [ ] **Passo 5:** commit `feat(central): indicadores, mapa e situação das regiões`.

### Tarefa 8: Motor preditivo (Parte 3 — servidor)

**Arquivos:**
- Criar: `server/preditivo/{base.ts, risco.ts, backtest.ts, reforco.ts, falhas.ts, tendencias.ts, resumo.ts}`, `server/rotas/previsoes.ts`
- Modificar: `server/app.ts`
- Teste: `server/preditivo/risco.test.ts`, `server/preditivo/backtest.test.ts`, `server/preditivo/reforco.test.ts`, `server/preditivo/falhas.test.ts`, `server/preditivo/tendencias.test.ts`

**Interfaces:**
- Consome: Tarefas 3–5 (histórico semeado com `SEMENTE_PADRAO`; os testes usam um banco semeado uma vez em `beforeAll`).
- Produz:
  - `interface ExplicacaoPrevisao { oQuePreve: string; dadosUsados: string[]; comoAjuda: string; confiabilidade: { metrica: string; valor: number; descricao: string }[] }`.
  - `preverRisco(db, { agora: Date; horas: number /* 24 ou 168 */; ate?: Date /* corte para backtest */ }): PrevisaoRisco` com `celulas: CelulaRisco[]` (`{ bairroId; inicio; taxaEsperada; indice; nivel: 'baixo'|'moderado'|'alto'|'critico'; fatores: { nome: string; peso: number }[] }`). Modelo: taxa(bairro, dia, hora) = base do bairro (ocorrências/hora nas últimas 8 semanas, suavizada para a média da cidade com peso k = 20 horas-equivalentes) × perfil(dia útil/sábado/domingo, hora) da cidade × fator chuva da previsão do dia (razão observada chuva/seco no histórico) × tendência (últimas 2 semanas ÷ 6 anteriores, limitada a 0,7–1,3). Índice = 100 × taxa ÷ percentil 99 das taxas da janela, limitado a 100; níveis: < 25 baixo, < 50 moderado, < 75 alto, ≥ 75 crítico. `fatores` = os multiplicadores que mais pesaram, com nome em pt-BR ("Sexta à noite", "Previsão de chuva", "Bairro com histórico alto").
  - `executarBacktest(db, { agora; dias: 14 }): ResultadoBacktest` → para cada dia da janela, prevê com dados até a véspera e compara: `{ dias; maeModelo; maeIngenuo /* média histórica simples por bairro */; ganhoPct; acertoTop5Medio /* 0–5 */; porDia: { data; acertoTop5; mae }[] }`.
  - `recomendarReforco(db, { agora; horas: 24 }): RecomendacaoReforco[]` → carga prevista por região e turno (soma das taxas) ÷ agentes escalados naquele turno; move agentes da região com folga para a de déficit (guloso, máx. 3 recomendações por turno), `{ regiaoOrigem; regiaoDestino; quantidade; inicio; fim; cargaPorAgenteAntes; cargaPorAgenteDepois; motivo }`.
  - `preverFalhas(db, { agora }): RiscoFalha[]` (ordenado) → probabilidade em 7 dias = 1 − exp(−7 × λ) com λ = λ_tipo × fator_modelo (taxa de falhas do modelo ÷ média do tipo, suavizada) × fator_idade (1 + anos/5) × fator_manutencao (1 + dias de atraso/30, máx. 3) × fator_quedas (1 + quedas de sinal nas últimas 72 h / 3); `fatores: { nome; contribuicao }[]`.
  - `calcularTendencias(db, { agora }): Tendencias` → `{ disponibilidadePorTipo: { tipo; serie: { data; pct }[]; projecao7d: number }[]; usoPatinetesPorBairro: { bairroId; nome; mediaDiaria; variacaoPct }[]; falhasPorModelo: { marca; modelo; falhasPor100: number; frota: number }[] }` (projeção = regressão linear dos últimos 30 dias).
  - `montarResumo(db, { agora }): ResumoPreditivo` → índice de risco consolidado por bairro (próximas 24 h), top 5 recomendações do dia em linguagem de gestor, cada uma com `fonte` ('risco'|'reforco'|'falhas'|'tendencias').
  - Toda resposta leva `explicacao: ExplicacaoPrevisao` (o backtest alimenta a `confiabilidade` do risco).
- Rotas: `GET /api/previsoes/risco?horas=24|168`, `/api/previsoes/backtest`, `/api/previsoes/reforco`, `/api/previsoes/falhas`, `/api/previsoes/tendencias`, `/api/previsoes/resumo`. Cache em memória de 60 s por rota.

- [ ] **Passo 1: testes que falham**
  - `risco.test.ts`: com `agora` numa quinta 12 h, a célula do Centro na sexta 22 h tem índice maior que a do Centro na terça 3 h (use `horas: 168`); todo `indice` em 0–100; toda célula tem ≥ 1 fator; `explicacao.dadosUsados` não vazio.
  - `backtest.test.ts`: `maeModelo < maeIngenuo` e `acertoTop5Medio >= 2`.
  - `reforco.test.ts`: banco montado com Centro de taxa alta e 2 agentes e Sul de taxa baixa e 10 agentes no mesmo turno → primeira recomendação Sul → Centro com `cargaPorAgenteDepois < cargaPorAgenteAntes` no destino.
  - `falhas.test.ts`: entre dois equipamentos do mesmo tipo, o de modelo pouco confiável com 40 dias de manutenção atrasada fica acima do novo, de modelo confiável e em dia; `probabilidade` em 0–1.
  - `tendencias.test.ts`: `disponibilidadePorTipo` tem os 13 tipos e séries de 30 pontos; o modelo pouco confiável aparece com `falhasPor100` maior que a mediana.
- [ ] **Passo 2:** rodar → FALHA.
- [ ] **Passo 3:** implementar (`base.ts` com as consultas de agregação reaproveitadas: ocorrências por bairro×hora, perfil horário, razão de chuva).
- [ ] **Passo 4:** testes passam; cada rota responde em < 500 ms com o banco semeado (medir com `app.inject` + `performance.now()` num teste).
- [ ] **Passo 5:** commit `feat(preditivo): risco, teste retroativo, reforço, falhas e tendências`.

### Tarefa 9: Base da interface — identidade, casca, dados e tempo real

Antes de codar: carregar a skill `frontend-design` e seguir as Restrições globais de visual.

**Arquivos:**
- Criar: `web/src/estilo/{tokens.css, base.css}`, `web/src/rotas.tsx`, `web/src/api/{cliente.ts, consultas.ts}`, `web/src/tempo-real/useStream.ts`, `web/src/componentes/{Shell, Navegacao, BlocoIndicador, EtiquetaSituacao, IconeTipo, Tabela, BarraFiltros, Gaveta, CampoDinamico, MapaBase, CartaoExplicacao, AlternarTema, EstadoVazio}.tsx` (+ CSS modules)
- Modificar: `web/src/App.tsx`, `web/src/main.tsx`
- Teste: `web/src/tempo-real/useStream.test.tsx`, `web/src/componentes/EtiquetaSituacao.test.tsx`

**Interfaces:**
- Consome: `shared/*`, rotas das Tarefas 4–8.
- Produz: `api.get<T>(caminho, params?)`, `api.post/put/patch/del` (lança `ErroApi { status; erro; campos? }`); hooks TanStack Query em `consultas.ts` (`useEquipamentos(filtros)`, `useEquipamento(id)`, `useAgentes`, `useAgente`, `useBairros`, `useTiposEquipamento`, `useAlertas`, `useMapa(filtros)`, `useIndicadores(filtros)`, `useRegioes`, `usePainelManutencao`, `usePrevisao<T>(nome)`, mutações de CRUD/situação/alertas/simulação); `useStream(): { conectado: boolean; ultimoEvento?: EventoFogo }` — abre `EventSource('/api/stream')`, aplica eventos no cache (`setQueryData` para `mapa`, `indicadores`, `alertas`), e **ao reabrir depois de erro invalida** `mapa`, `indicadores`, `alertas` e `regioes`; `IconeTipo({ tipo, comRotulo? })` mapeia `TipoEquipamento.icone` → componente Phosphor `weight="fill"`; `EtiquetaSituacao({ situacao })` bloco cheio com a cor e o rótulo; `BlocoIndicador({ rotulo, valor, cor, detalhe? })` número grande em bloco de cor cheia; `CampoDinamico({ campo: CampoCaracteristica, valor, onChange })`; `MapaBase` (Leaflet + OSM, centro de Marília, zoom 13, aviso "Mapa sem conexão — os dados continuam atualizados" quando os blocos falham); `Shell` com navegação lateral (Central, Equipamentos, Agentes, Manutenção, Alertas, Previsões), barra superior com relógio da simulação, indicador de conexão ao vivo e `AlternarTema` (claro padrão; escuro grafite salvo em `localStorage` chave `fogo:tema`; `data-tema="escuro"` no `<html>`).
- Rotas da interface: `/` Central · `/equipamentos` · `/equipamentos/novo` · `/equipamentos/:id` · `/equipamentos/:id/editar` · `/agentes` · `/agentes/novo` · `/agentes/:id` · `/agentes/:id/editar` · `/manutencao` · `/alertas` · `/previsoes`. Páginas ainda não feitas mostram `EstadoVazio` com o nome da página.

- [ ] **Passo 1: testes que falham**
  - `useStream.test.tsx` (EventSource falso): evento `alerta` adiciona o alerta ao cache `['alertas']`; sequência `error` → `open` chama `invalidateQueries` para `['mapa']`, `['indicadores']`, `['alertas']`, `['regioes']`; `conectado` vira `false` no erro e `true` na reabertura.
  - `EtiquetaSituacao.test.tsx`: `situacao="furtado"` mostra "Furtado" com `background-color` `#C2185B`.
- [ ] **Passo 2:** rodar → FALHA.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** testes passam; `npm run build` sem erros; navegar pelas rotas no navegador (claro e escuro) sem erro no console.
- [ ] **Passo 5:** commit `feat(web): identidade visual, casca, cliente da API e tempo real`.

### Tarefa 10: Telas da Parte 1 — inventário

**Arquivos:**
- Criar: `web/src/paginas/{Equipamentos, EquipamentoFicha, EquipamentoFormulario, Agentes, AgenteFicha, AgenteFormulario}.tsx` (+ CSS), `web/src/componentes/SeletorPontoMapa.tsx`
- Teste: `web/src/paginas/EquipamentoFormulario.test.tsx`

**Interfaces:**
- Consome: Tarefa 9.
- Comportamento:
  - Lista: busca com espera de 300 ms, filtros (tipo, situação, bairro, região, órgão, manutenção) refletidos na URL, paginação, colunas código · tipo (ícone + palavra) · situação (bloco) · bairro · logradouro/referência · próxima manutenção · último sinal (relativo). Botão "Cadastrar equipamento".
  - Formulário: seções Identificação, Localização, Situação e manutenção, Características do tipo. Ao trocar o tipo, os campos de características mudam (`CampoDinamico`). CEP: ao completar 8 dígitos chama `https://viacep.com.br/ws/{cep}/json/` (timeout 3 s; se falhar, segue manual com aviso discreto) e preenche logradouro. `SeletorPontoMapa`: clicar no mapa preenche lat/lng e sugere o bairro (polígono que contém o ponto). Validação com o mesmo `equipamentoInputSchema` (erros por campo em pt-BR) e erros 400/409 da API mostrados no campo certo.
  - Ficha: cabeçalho com código, tipo, situação (bloco) e ações (Editar, Mudar situação — diálogo com motivo e "recuperado" quando sai de Furtado —, Desativar); mini-mapa; dados; características; linha do tempo de situação; manutenções; gráfico de telemetria das últimas 48 h (Recharts, métrica principal do tipo); alertas ligados.
  - Agentes: lista, formulário (vínculo com moto/viatura disponível) e ficha (posição no mini-mapa, situação, turno, ocorrências atendidas).
- [ ] **Passo 1: teste que falha** (`EquipamentoFormulario.test.tsx`): escolher tipo "Radar de fiscalização" mostra o campo "Velocidade máxima"; trocar para "Câmera de videomonitoramento" esconde esse campo e mostra "Resolução"; enviar com `velocidadeMaxima = 250` mostra erro no campo sem chamar a API.
- [ ] **Passo 2:** rodar → FALHA.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** teste passa; no navegador: cadastrar um radar novo clicando no mapa, editar, mudar para Furtado e voltar com "recuperado"; tentar excluir um equipamento com histórico mostra a mensagem do 409.
- [ ] **Passo 5:** commit `feat(web): inventário de equipamentos e agentes`.

### Tarefa 11: Telas da Parte 2 — Central de Operações, Manutenção e Alertas

**Arquivos:**
- Criar: `web/src/paginas/{Central, Manutencao, Alertas}.tsx` (+ CSS), `web/src/componentes/{MapaOperacional, FeedAlertas, PainelRegioes, FichaLateral, ControlesSimulacao, FaixaIndicadores}.tsx`
- Teste: `web/src/componentes/FeedAlertas.test.tsx`

**Interfaces:**
- Consome: Tarefas 7, 9 e 10.
- Comportamento:
  - Central: mapa ocupando a área principal; marcadores com `IconeTipo` sobre a cor da situação, agrupados (markercluster) com contagem; agentes como marcador próprio (forma diferente) que se move com o evento `posicoes`; camada "Bairros" (polígonos pintados pelo nível de `regioes`) e camada "Calor de ocorrências" (últimas 24 h) ligáveis; `FaixaIndicadores` com 6 `BlocoIndicador` (total, operacionais, indisponíveis, disponibilidade %, agentes em atividade, alertas críticos) atualizados ao vivo; `BarraFiltros` (tipo, situação, bairro, região, órgão, "manutenção imediata/próxima") que filtra mapa e indicadores; `FeedAlertas` ao lado: críticos primeiro e destacados, "há X min", botões Reconhecer/Resolver, clicar centraliza o mapa; `PainelRegioes`: 5 regiões com nível e motivos, expansível para bairros; clicar num marcador abre `FichaLateral` (resumo + "Abrir ficha completa"); `ControlesSimulacao`: 1×/10×/60×, pausar, "Injetar evento" (furto, falha, acidente, alagamento, congestionamento).
  - Novo alerta crítico: toast discreto + item piscando 3 s no feed (sem som).
  - Manutenção: colunas Atrasadas · Imediatas · Próximos 7 dias · Próximos 30 dias, cada cartão com código, tipo, bairro, data e ação "Registrar manutenção" (muda situação/datas).
  - Alertas: tabela filtrável (criticidade, tipo, status) com ações.
- [ ] **Passo 1: teste que falha** (`FeedAlertas.test.tsx`): com 3 alertas (baixa, crítica, alta) o primeiro item é o crítico; clicar "Resolver" chama a mutação com o id certo.
- [ ] **Passo 2:** rodar → FALHA.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** teste passa; no navegador a 1366×768: a Central abre povoada em < 2 s; injetar "acidente" faz o alerta aparecer no feed e o bairro mudar de cor sem recarregar; filtros mudam mapa e números; desligar a internet mostra o aviso do mapa e o resto continua.
- [ ] **Passo 5:** commit `feat(web): central de operações, manutenção e alertas`.

### Tarefa 12: Telas da Parte 3 — Cidade Preditiva

**Arquivos:**
- Criar: `web/src/paginas/Previsoes.tsx` (+ CSS), `web/src/componentes/{MapaRisco, GradeRiscoSemana, CartaoBacktest, ListaReforco, RankingFalhas, GraficosTendencias, ResumoDoDia}.tsx`
- Teste: `web/src/componentes/CartaoExplicacao.test.tsx`

**Interfaces:**
- Consome: Tarefas 8 e 9.
- Comportamento (uma página com seções e índice lateral fixo):
  - `ResumoDoDia`: as 5 recomendações do dia em blocos, cada uma com a fonte.
  - Risco: `MapaRisco` com polígonos pintados pelo índice e régua de horário (próximas 24 h, passo de 1 h, botão "tocar" que anima); `GradeRiscoSemana` (bairros × próximos 7 dias por faixa de horário, ordenável pelo maior risco); clicar num bairro mostra os fatores.
  - `CartaoBacktest`: "Nas últimas 2 semanas, o modelo errou em média X ocorrências/dia por bairro contra Y de uma média simples (Z% melhor); dos 5 bairros apontados como mais arriscados, em média N de fato foram" + gráfico por dia.
  - `ListaReforco`: recomendações com origem → destino, horário, quantos agentes, carga antes/depois.
  - `RankingFalhas`: top 20 com probabilidade (barra), fatores em pílulas, link para a ficha, botão "Agendar manutenção".
  - Anomalias: alertas `anomalia_leitura` das últimas 24 h com "esperado × medido".
  - `GraficosTendencias`: disponibilidade por tipo (linhas + projeção tracejada), patinetes por bairro (barras), falhas por modelo (barras).
  - Toda seção termina com `CartaoExplicacao` (O que prevê · Dados usados · Como ajuda · Confiabilidade).
- [ ] **Passo 1: teste que falha** (`CartaoExplicacao.test.tsx`): renderiza os 4 títulos e cada item de `dadosUsados`; `confiabilidade` vazia mostra "Sem medida de acerto ainda".
- [ ] **Passo 2:** rodar → FALHA.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** teste passa; no navegador a página carrega em < 2 s, a régua anima e todas as seções mostram dados.
- [ ] **Passo 5:** commit `feat(web): cidade preditiva`.

### Tarefa 13: Entrega — documentação, Docker, fumaça E2E e pacote

**Arquivos:**
- Criar: `README.md`, `docs/GUIA-DO-TIME.md`, `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `e2e/fumaca.spec.ts`, `playwright.config.ts`, `scripts/empacotar.mjs`, `docs/telas/*.png`

**Interfaces:**
- README: o que é (3 partes, uma frase cada), **como rodar** (Node ≥ 20 → `npm install && npm start` → http://localhost:3333; Docker → `docker compose up`), telas com capturas, arquitetura (diagrama em texto: simulador → ingestão → motor de alertas → SSE → interface; previsões sobre o histórico), dicionário de dados resumido, como cada previsão funciona (fórmula em uma linha + resultado do teste retroativo), API (`/api/docs` + exemplo de `curl` para `POST /api/telemetria`), decisões e limitações honestas (dados sintéticos com padrões plantados; blocos do mapa precisam de internet), **declaração de uso de IA** (Claude Code com Claude Opus 5.5 orquestrando e revisando e Claude Sonnet 5.5 implementando; o time revisou e estudou cada módulo — ver GUIA-DO-TIME), créditos (© colaboradores do OpenStreetMap).
- GUIA-DO-TIME: mapa do código; o caminho de um dado IoT do simulador à tela (arquivo por arquivo); como a semente cria os padrões; cada previsão explicada com um exemplo numérico; regras de negócio; como rodar os testes; **20 perguntas prováveis da comissão com respostas curtas**; sugestões do que cada integrante apresenta.
- `fumaca.spec.ts`: sobe o app (webServer `npm start`, banco temporário via `FOGO_DB=./data/e2e.db`), abre `/` e vê os 6 indicadores e o mapa; abre `/previsoes` e vê "O que prevê"; abre `/equipamentos` e vê ao menos 10 linhas.
- `empacotar.mjs`: gera `fogo-dsin-coder-challenge.zip` sem `node_modules`, `dist`, `data/*.db*`, `test-results`, `.git`; imprime o tamanho e falha se > 50 MB.
- `server/index.ts` aceita `FOGO_DB` (caminho do banco, padrão `data/fogo.db`) e `PORT`; se a porta estiver ocupada, mostra "A porta 3333 está em uso. Rode com PORT=3334 npm start".

- [ ] **Passo 1:** escrever `fumaca.spec.ts` e rodar → FALHA (sem config).
- [ ] **Passo 2:** implementar config, Docker, scripts e docs; gerar capturas de tela com o Playwright.
- [ ] **Passo 3:** verificação de instalação limpa: copiar o projeto (sem `node_modules`, `dist`, `data`) para uma pasta temporária, `npm ci && npm start`, `curl /api/saude` e `/api/central/indicadores` respondem; `npm test` e `npm run e2e` verdes; `docker compose up --build` sobe e responde; `npm run empacotar` < 50 MB.
- [ ] **Passo 4:** commit `docs: README, guia do time, Docker, fumaça E2E e empacotamento`.

---

## Depois do plano (fora da execução automática)

- Revisão final do branch inteiro por um revisor.
- Usuário abre e testa o sistema; ajustes.
- Vídeo de demonstração (ponto extra), depois do OK do usuário.
- Formulário de entrega no site da DSIN: nome do time, integrantes e tecnologias **vêm do usuário**; nada é enviado sem o OK dele.

## Ordem e paralelismo

1 e 2 em paralelo → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13. Do 9 em diante (interface) pode começar assim que a Tarefa 7 estiver pronta, em paralelo com a 8, porque mexe só em `web/`; a 12 espera a 8.
