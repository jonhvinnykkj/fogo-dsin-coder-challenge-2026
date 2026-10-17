# F.O.G.O. — Ferramenta Onisciente de Gestão e Operações

Sistema web de monitoramento de equipamentos de trânsito e segurança de **Marília-SP**, feito para a etapa bônus do **DSIN Coder Challenge 2026**. Tudo em português do Brasil, sem serviço externo obrigatório.

São três partes, num único sistema:

1. **Inventário Inteligente da Cidade** — cadastro de 13 tipos de equipamento IoT (radares, câmeras, semáforos, patinetes…) e de agentes (trânsito, guarda municipal, PM), com busca, filtros, ficha, mapa e API documentada.
2. **Central de Operações** — mapa ao vivo com equipamentos e agentes se mexendo, seis indicadores, feed de alertas em tempo real e situação de cada região; dá para acelerar a simulação e injetar acidente, furto, falha ou alagamento.
3. **Cidade Preditiva** — risco por bairro e hora (24 h e 7 dias), reforço de agentes, equipamentos com chance de falhar, anomalias e tendências; cada previsão diz o que prevê, com quais dados, como ajuda e **quão certa ela foi no passado**.

![Central de Operações](docs/telas/central.png)

## Como rodar em 1 minuto

**Com Node.js 22 ou mais novo** (o `better-sqlite3` 13 exige Node ≥ 22; testado em 22):

```bash
npm install && npm start
```

Abra **http://localhost:3333**. Na primeira vez o sistema compila a interface e cria sozinho o banco `data/fogo.db` com a cidade inteira (cerca de 2 segundos). Não há banco, chave ou conta para configurar.

**Com Docker** (se preferir não instalar o Node):

```bash
docker compose up --build
```

O banco fica num volume (`fogo-dados`): sobrevive a `docker compose down`; `docker compose down -v` recomeça do zero.

Porta ocupada? `PORT=3334 npm start` (o sistema avisa e sugere a próxima porta). Outro arquivo de banco: `FOGO_DB=./data/outro.db npm start`.

> Só os **blocos do mapa** (OpenStreetMap) precisam de internet. Sem ela, o mapa fica sem o fundo de ruas, mas os pontos, polígonos e o resto continuam funcionando.

## O que olhar primeiro (roteiro de 2 minutos)

1. **Central** (`/`): seis placas de cor cheia, mapa com equipamentos agrupados por situação, agentes deslizando, bairros pintados pelo índice de atenção e o feed de alertas à direita.
2. Barra no rodapé do mapa: clique em **60×** e depois em **Injetar evento → Acidente**. Em segundos aparece o alerta crítico, um agente é despachado ao local e o bairro muda de cor. Quando a ocorrência termina, o alerta se resolve sozinho (fica registrado como resolução automática).
3. Clique num marcador: a **ficha lateral** abre com situação, manutenção e ações; "Abrir ficha completa" mostra a linha do tempo, o gráfico de telemetria e os alertas.
4. **Previsões** (`/previsoes`): comece pelo "Resumo do dia" e role até **"Quanto acertou"**: é o teste retroativo, onde a previsão feita na véspera é comparada com o que de fato aconteceu.
5. Interruptor **Sala de controle** (topo): modo escuro grafite, só por escolha do usuário.

## Telas

| | |
|---|---|
| ![Ocorrência injetada](docs/telas/central-acidente.png) **Acidente injetado**: alerta, agente despachado e bairro em atenção | ![Ficha lateral](docs/telas/central-ficha.png) **Ficha do equipamento** sem sair do mapa |
| ![Regiões](docs/telas/central-regioes.png) **Regiões**: quem opera normal e quem exige atenção | ![Equipamentos](docs/telas/equipamentos.png) **Inventário** com busca e filtros |
| ![Ficha completa](docs/telas/equipamento-ficha.png) **Ficha completa**: situação, manutenção, telemetria | ![Teste retroativo](docs/telas/previsoes-retroativo.png) **Teste retroativo** da previsão |
| ![Sala de controle](docs/telas/central-sala-de-controle.png) **Sala de controle** (modo escuro) | ![Semana escura](docs/telas/previsoes-semana-escuro.png) **Risco dos próximos 7 dias** |

Tela de Previsões completa: [docs/telas/previsoes-topo.png](docs/telas/previsoes-topo.png).

## Arquitetura

```
 Simulador (no próprio processo)           Dispositivo real (curl, ESP32…)
        │  leituras de telemetria                    │
        └──────────────► POST /api/telemetria ◄──────┘     ← a mesma porta de entrada
                                 │
                        ingestão (valida, grava a hora, atualiza posição)
                                 │
              ┌──────────────────┴──────────────────┐
      detecção de anomalias                   motor de alertas
   (leitura × normal do equipamento)   (abre, repete, resolve; sem duplicar)
              └──────────────────┬──────────────────┘
                                 │
                   barramento de eventos (agrupa posições)
                                 │  Server-Sent Events: GET /api/stream
                                 ▼
                 Interface React (mapa Leaflet, feed, placas)

 SQLite (data/fogo.db)  ──►  Previsões: risco, reforço, falhas, tendências
 (60 dias de histórico        calculadas sobre o HISTÓRICO e comparadas com o passado
  + o que chega ao vivo)
```

| Camada | Tecnologia |
|---|---|
| Servidor | Node 22, TypeScript estrito, Fastify 5, zod, Swagger (`/api/docs`) |
| Banco | SQLite (`better-sqlite3`), arquivo único, SQL puro |
| Interface | React 19, Vite, TanStack Query, React Router, Leaflet (+ agrupamento e calor), Recharts |
| Testes | Vitest (servidor, regras, previsões, interface) e Playwright (fumaça) |

Código compartilhado entre servidor e interface fica em `shared/` (tipos, regras de classificação, validação, formatação pt-BR). O mapa de pastas está em [docs/GUIA-DO-TIME.md](docs/GUIA-DO-TIME.md).

## Dicionário de dados (resumo)

| Entidade | O que guarda |
|---|---|
| **equipamentos** | código legível (`FOGO-RAD-0007`), tipo (13), nº de série único, marca, modelo, órgão, **situação** (`operacional`, `mau_funcionamento`, `em_manutencao`, `desativado`, `furtado`, `nao_instalado`), endereço (CEP, logradouro, referência, bairro), latitude/longitude, posição atual (móveis), último sinal, manutenção (necessidade, periodicidade, última e próxima data), características do tipo (JSON validado) |
| **historico_situacao** | cada mudança de situação, com motivo e data |
| **agentes** | nome, matrícula, categoria, órgão, situação (`em_servico`, `em_ocorrencia`, `pausa`, `fora_de_servico`), turno, base, posição, equipamento vinculado |
| **bairros** | 65 bairros reais de Marília (OpenStreetMap): região (Centro/Norte/Sul/Leste/Oeste), centro e polígono |
| **ocorrencias** | acidente, congestionamento, infração, furto/vandalismo, veículo quebrado, alagamento, segurança; gravidade, local, início/fim, origem (`historico`, `tempo_real`, `injetado`), agente |
| **telemetria_hora** | uma linha por equipamento e hora, com as métricas do tipo (fluxo, bateria, sinal…) |
| **manutencoes** | ordens (preventiva/corretiva), previstas e concluídas |
| **alertas** | criticidade (crítica, alta, média, baixa), tipo, explicação, reconhecido/resolvido (manual ou automático) |
| **clima_dia** | chuva observada e prevista |

Datas no banco: texto ISO 8601 em UTC. Na tela: `dd/mm/aaaa HH:mm` no fuso de São Paulo. Toda coordenada cadastrada precisa cair dentro do limite do município.

## Como cada previsão funciona

Fórmula em uma linha e o exemplo com os números reais da cidade de exemplo. Os detalhes passo a passo estão no [guia do time](docs/GUIA-DO-TIME.md).

- **Risco por bairro e hora** — `taxa = base do bairro × perfil da região naquele dia da semana e hora × chuva do dia × tendência da cidade`; o índice (0 a 100) compara a taxa com o p99 do período. Ex.: o Centro numa sexta às 18 h tem taxa ≈ 2,6 ocorrências/h e índice 100 (crítico); terça às 3 h dá ≈ 0,44 e índice 33.
- **Reforço de agentes** — `carga por agente = ocorrências esperadas na região no turno ÷ agentes escalados`; move-se 1 agente por vez da região mais folgada para a mais sobrecarregada, até 20% acima da média da cidade. Ex.: Centro 6,1 ocorrências por agente na tarde de quinta contra 2,7 na Zona Leste → "mande 1 agente da Zona Leste para o Centro".
- **Chance de falha em 7 dias** — `λ = taxa do tipo × fator do modelo × (1 + anos/5) × atraso da manutenção × quedas de sinal recentes; chance = 1 − e^(−7λ)`. Ex.: câmera Vigilux VX-200 de 7,6 anos com muitas quedas de sinal aparece com "mais de 99%"; uma câmera média e sem sinais fica perto de 13%.
- **Anomalias em tempo real** — compara cada leitura com a média e o desvio **do mesmo equipamento, na mesma hora e tipo de dia**; vira alerta quando |z| ≥ 3 (com confirmação em leituras seguidas). Ex.: radar com fluxo ≈ 0 no horário de pico.
- **Tendências** — disponibilidade por tipo (30 dias + reta de mínimos quadrados por 7 dias), uso de patinetes por bairro e falhas por 100 equipamentos de cada marca/modelo. Ex.: o modelo ruim (VX-200) tem 243 falhas por 100 câmeras contra 66 do modelo mediano.

### Quão certas elas são (teste retroativo)

A tela de Previsões **refaz a previsão como se fosse ontem, 14 dias seguidos**, e compara com o que aconteceu. Os números são recalculados todo dia, então variam um pouco; os de outubro de 2026:

| Medida | Resultado |
|---|---|
| Erro por bairro em blocos de 3 h, contra repetir a média de cada bairro | **entre ~7% e ~9% menor** (17/10 às 19h: 0,53 × 0,58 ocorrência, 8% menor) |
| Dos 5 bairros apontados como mais arriscados à noite (18h–2h), quantos acertou | 4,0 de 5 (medido em 15/10) e 3,9 de 5 (17/10); a média simples acerta 3,9 |
| Falhas de equipamento | em 4 semanas seguidas, **135 previstas × 139 ocorridas** (15/10); na última semana, 33 previstas × 40 ocorridas (17/10) |
| Os 10% de equipamentos apontados como mais arriscados | concentraram 19% a 28% das falhas (ao acaso seriam 10%) |
| Projeção de disponibilidade em 7 dias | erra ~4,9 p.p., **pior** que repetir a média de 30 dias (4,1): a tela avisa "use para ver a direção" |

**Por que o ganho de ~8% e não 30%?** Por bairro e hora quase sempre há 0 ou 1 ocorrência, então boa parte do erro é pura sorte. Mesmo conhecendo as taxas verdadeiras usadas para gerar os dados, o máximo de melhora possível seria cerca de 10%; o modelo chega a cerca de 82% desse teto. Preferimos mostrar o número honesto a escolher uma métrica que o inflasse.

## API

Documentação interativa (Swagger): **http://localhost:3333/api/docs**. Principais rotas:

| Grupo | Rotas |
|---|---|
| Inventário | `GET/POST /api/equipamentos`, `GET/PUT/DELETE /api/equipamentos/:id`, `PATCH …/situacao`, `POST …/manutencoes`, `GET …/telemetria`; `GET/POST /api/agentes`, `GET/PUT/DELETE /api/agentes/:id`; `GET /api/bairros`, `GET /api/tipos-equipamento` |
| Central | `GET /api/central/{indicadores,mapa,regioes,ocorrencias}`, `GET /api/alertas`, `PATCH /api/alertas/:id/{reconhecer,resolver}`, `GET /api/manutencao/painel` |
| Tempo real | `POST /api/telemetria`, `GET /api/stream` (SSE), `GET/PATCH /api/simulacao`, `POST /api/simulacao/eventos` |
| Previsões | `GET /api/previsoes/{risco,reforco,falhas,tendencias,resumo}` |
| Saúde | `GET /api/saude` |

**Enviando uma leitura como se fosse um equipamento.** Cada equipamento tem um token (gerado na semente, nunca devolvido pela API). Para pegar o de um equipamento do **seu banco local**:

```bash
TOKEN=$(npm run -s token -- FOGO-RAD-0001)

curl -X POST http://localhost:3333/api/telemetria \
  -H "content-type: application/json" \
  -H "x-dispositivo-token: $TOKEN" \
  -d '{"codigo":"FOGO-RAD-0001","metricas":{"fluxo":412,"velocidadeMedia":38.5,"infracoes":3}}'
# → 202 {"aceita":true}
```

As métricas aceitas dependem do tipo (ex.: radar = `fluxo`, `velocidadeMedia`, `infracoes`; veja `GET /api/tipos-equipamento`). Sem token, ou com o token de outro equipamento, a resposta é `401`.

## Testes

```bash
npm test            # Vitest: servidor, regras, previsões e interface (347 testes em 46 arquivos)
npm run typecheck   # TypeScript estrito, servidor e interface
npm run e2e         # Playwright: sobe o app com banco próprio (porta 3399) e confere Central, Previsões e Equipamentos
```

O E2E usa `data/e2e.db` e o apaga ao terminar; não mexe no seu `data/fogo.db`. Na primeira execução do Playwright pode ser preciso `npx playwright install chromium`.

`npm run empacotar` gera `fogo-dsin-coder-challenge.zip` (sem `node_modules`, `dist`, bancos e pastas de trabalho; falha se passar de 50 MB).

## Decisões e limitações (sem maquiagem)

- **Os dados são sintéticos.** Bairros e ruas são reais (OpenStreetMap), mas equipamentos, agentes, ocorrências e 60 dias de telemetria são gerados com semente fixa e **padrões plantados** de propósito (picos de 7–9 h e 17–19 h, sexta/sábado à noite no Centro, chuva com mais acidentes, um modelo de câmera pouco confiável, furtos de patinete em dois bairros). A previsão "redescobre" esses padrões; isso prova que o método funciona, **não** que ele acertaria numa cidade real sem ajuste.
- **O simulador é acelerado de propósito** para a demonstração: ocorrências, falhas e furtos ao vivo acontecem muito mais depressa que na vida real. Por isso as previsões aprendem **só com o histórico**, não com o que o simulador gera ao vivo nem com eventos injetados.
- A velocidade 10× e 60× multiplica o ritmo de eventos, mas o relógio é o relógio real (nada é gravado no futuro).
- **Se o avaliador abrir dias depois**, o histórico é completado até "agora" ao iniciar (a lacuna é preenchida), então "próximas 24 h" continua valendo. A lacuna não cria falhas novas de equipamento; o simulador ao vivo cria.
- O ganho do risco por bairro é modesto (~8%), pelas razões acima; a projeção linear de disponibilidade é pior que repetir a média nesta cidade estável. Dizemos isso na própria tela.
- Sem login nem permissões: é uma ferramenta de demonstração, e o token por equipamento só protege a entrada de telemetria.
- O mapa precisa de internet para o fundo de ruas; o ViaCEP (preenchimento de CEP) é opcional e o cadastro funciona sem ele.
- SQLite atende bem a um município simulado; para milhões de leituras por dia o caminho seria um banco de séries temporais (discutido no guia).

## Uso de IA

Este projeto foi construído com **Claude Code**: o **Claude Opus 5.5** orquestrou o trabalho, revisou e implementou as partes mais complexas; o **Claude Sonnet 5.5** implementou e revisou tarefas; o **Claude Haiku 5.5** fez revisões curtas. Cada tarefa passou por testes escritos antes do código e por revisão independente.

O time **revisou, testou e estudou** cada módulo. O [guia do time](docs/GUIA-DO-TIME.md) reúne o mapa do código, o caminho de um dado IoT, as fórmulas com exemplos e as perguntas prováveis da comissão com respostas.

## Créditos

Mapa e dados de bairros, ruas e limite urbano: © colaboradores do [OpenStreetMap](https://www.openstreetmap.org/copyright), disponíveis sob a licença ODbL. Marcas citadas no catálogo de equipamentos servem só como referência de mercado; códigos de modelo e índices de confiabilidade são fictícios. Ícones: [Phosphor Icons](https://phosphoricons.com). Fonte: Archivo (Fontsource).
