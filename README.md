# F.O.G.O. — Ferramenta Onisciente de Gestão e Operações

Sistema web de monitoramento de equipamentos de trânsito e segurança de **Marília-SP**, feito para a etapa bônus do **DSIN Coder Challenge 2026**. Tudo em português do Brasil, sem serviço externo obrigatório.

São três partes, num único sistema:

1. **Inventário Inteligente da Cidade** — cadastro de 13 tipos de equipamento IoT (radares, câmeras, semáforos, patinetes…) e de agentes (trânsito, guarda municipal, PM), com busca, filtros, ficha, mapa e API documentada.
2. **Central de Operações** — mapa ao vivo com equipamentos e agentes se mexendo, seis indicadores, feed de alertas em tempo real e situação de cada região; dá para acelerar a simulação e injetar acidente, furto, falha ou alagamento.
3. **Cidade Preditiva** — risco por bairro e hora (24 h e 7 dias), reforço de agentes, equipamentos com chance de falhar, anomalias e tendências; cada previsão diz o que prevê, com quais dados, como ajuda e **quão certa ela foi no passado**.

Por cima das três partes, uma **camada de segurança**: login com quatro papéis (gestor, operador, agente, somente consulta), permissão conferida em cada rota, dados pessoais dos agentes mascarados (LGPD), posição de policiais e guardas (e do veículo de cada um) aproximada para quem só consulta, trilha de auditoria com antes e depois, senhas em scrypt, tokens de dispositivo só como hash, conferência do `Origin` em toda escrita, faixas de validação na telemetria, CSP e limite de requisições. Detalhes em [docs/SEGURANCA.md](docs/SEGURANCA.md).

![Central de Operações](docs/telas/central.png)

## Como rodar em 1 minuto

**Com Node.js 22.14 ou mais novo** (recomendado: a LTS atual). Confira com `node -v`: numa versão mais velha, o `npm start` para logo no começo com uma mensagem em português que sugere instalar a LTS ou usar o Docker (o `better-sqlite3` 13 traz o binário pronto para a Node-API 10, que chegou no Node 22.14). Com Node 20, o `npm install` mostra avisos `EBADENGINE` (são só avisos) e o `npm start` explica o que fazer.

```bash
npm install && npm start
```

Abra **http://localhost:3333**. Na primeira vez o sistema compila a interface (em silêncio) e cria sozinho o banco `data/fogo.db` com a cidade inteira (poucos segundos); no fim, o terminal mostra um bloco com o endereço e as senhas. Não há banco, chave ou conta para configurar. O servidor escuta só em localhost (`127.0.0.1` e `::1`); o Docker expõe a porta por conta própria.

**Entrada:** a tela de entrada tem um botão por papel (**Gestor**, Operador da central, Agente em campo, Somente consulta), e o **Gestor** vem marcado como "Recomendado para avaliar: vê tudo". É o modo demonstração, ligado por padrão para a avaliação rodar de primeira. Na primeira partida o terminal também mostra as senhas aleatórias dos quatro usuários (`gestor`, `operador`, `agente`, `consulta`), para entrar com usuário e senha; `FOGO_DEMO=0` desliga os botões (veja [docs/SEGURANCA.md](docs/SEGURANCA.md)).

**Com Docker** (se preferir não instalar o Node):

```bash
docker compose up --build
```

O projeto do compose se chama `fogo-dsin` (não herda o nome da pasta, então não colide com outro da mesma máquina). O banco fica num volume: sobrevive a `docker compose down`; `docker compose down -v` recomeça do zero.

Porta ocupada? O sistema avisa e sugere a próxima. Para escolher a porta ou outro arquivo de banco:

| Terminal | Outra porta | Outro arquivo de banco |
|---|---|---|
| macOS / Linux | `PORT=3334 npm start` | `FOGO_DB=./data/outro.db npm start` |
| Windows (PowerShell) | `$env:PORT=3334; npm start` | `$env:FOGO_DB="./data/outro.db"; npm start` |
| Windows (cmd) | `set PORT=3334&& npm start` | `set FOGO_DB=./data/outro.db&& npm start` |

No PowerShell e no cmd a variável vale até fechar aquele terminal.

> Só os **blocos do mapa** (OpenStreetMap) precisam de internet. Sem ela, o mapa fica sem o fundo de ruas, mas os pontos, polígonos e o resto continuam funcionando.

## O que olhar primeiro (roteiro de 2 minutos)

0. **Entrada** (`/entrar`): clique em **Gestor**. Depois, para ver as permissões em ação, clique em **Sair do sistema** (ícone no topo) e entre como **Somente consulta**: os botões de ação somem, telefone e matrícula dos agentes aparecem mascarados e o servidor recusa qualquer escrita com 403 ("Seu perfil (Somente consulta) não tem permissão para esta ação"). Volte a entrar como Gestor para os passos seguintes.
1. **Central** (`/`): seis placas de cor cheia (equipamentos, operacionais, indisponíveis, disponibilidade, agentes em atividade, alertas críticos), mapa com equipamentos agrupados por situação, agentes deslizando, bairros pintados pelo índice de atenção e o feed de alertas à direita. Os **Filtros** abrem por cima do mapa.
2. Barra no rodapé do mapa: com a velocidade em **1×**, clique em **Injetar evento** e escolha **Acidente** (o menu também tem Furto, Falha de equipamento, Alagamento e Congestionamento). Na hora aparece o alerta **crítico** "Acidente em <bairro>" (o acidente injetado usa sempre a gravidade máxima), o agente mais próximo é despachado ao local e o índice do bairro sobe 29 pontos (alerta crítico + ocorrência; na medição de 22/10/2026 o Jardim Santa Paula passou de normal (12) para atenção (41)). Em 1× a ocorrência dura alguns minutos; quando termina, o alerta se resolve sozinho (fica registrado como resolução automática).
3. Agora clique em **60×**: agentes e patinetes andam mais depressa e chegam ocorrências e alertas sem parar. A 60× tudo dura segundos, inclusive um acidente injetado. Mesmo depois de alguns minutos assim, as regiões continuam distintas (a simulação é aleatória: os números mudam a cada rodada, então não espere valores iguais aos de outra execução; o que se repete é a diferença entre as regiões), porque o índice mede a cidade no ritmo real (veja "Decisões e limitações"). Volte para **1×** quando quiser.
4. Clique num marcador: a **ficha lateral** abre com situação, manutenção e ações; "Abrir ficha completa" mostra a linha do tempo, o gráfico de telemetria e os alertas.
5. **Previsões** (`/previsoes`): comece pelo "Resumo do dia" e abra a aba **"Quanto acertou"**: é o teste retroativo, onde a previsão feita na véspera é comparada com o que de fato aconteceu.
6. Interruptor **Sala de controle** (topo): modo escuro grafite, só por escolha do usuário.

## Telas

| | |
|---|---|
| ![Ocorrência injetada](docs/telas/central-acidente.png) **Acidente injetado**: alerta, agente despachado e bairro em atenção | ![Ficha lateral](docs/telas/central-ficha.png) **Ficha do equipamento** sem sair do mapa |
| ![Regiões](docs/telas/central-regioes.png) **Regiões**: quem opera normal e quem exige atenção | ![Equipamentos](docs/telas/equipamentos.png) **Inventário** com busca e filtros |
| ![Ficha completa](docs/telas/equipamento-ficha.png) **Ficha completa**: situação, manutenção, telemetria | ![Teste retroativo](docs/telas/previsoes-retroativo.png) **Teste retroativo** da previsão |
| ![Sala de controle](docs/telas/central-sala-de-controle.png) **Sala de controle** (modo escuro) | ![Semana escura](docs/telas/previsoes-semana-escuro.png) **Risco dos próximos 7 dias** |

Tela de Previsões completa: [docs/telas/previsoes-topo.png](docs/telas/previsoes-topo.png).

## Modo Campo (o celular do agente)

Abra **http://localhost:3333/campo** no celular (ou no navegador em 390 px), ou use "Modo Campo" no menu. É a outra ponta da Central: o gestor vê o agente no mapa, e o agente conta daqui o que acontece na rua.

- **Quem sou eu**: quem entra como **Agente em campo** cai direto no próprio painel (e só enxerga o próprio despacho: a API recusa o de outro agente). Gestor e operador também abrem o Modo Campo e escolhem um agente, para acompanhar ou demonstrar; essa escolha fica guardada no aparelho.
- **Minha situação** em quatro botões grandes (em serviço, em ocorrência, pausa, fora de serviço), pela mesma rota da tela de Agentes.
- **Despacho**: a ocorrência para a qual a Central o mandou, com rua, bairro e distância; **"Cheguei ao local"** e depois **"Concluir ocorrência"**, que encerra a ocorrência, fecha o alerta dela e o devolve para "em serviço".
- **Perto de mim**: os 5 equipamentos mais próximos, com a situação de cada um; **"Relatar problema"** (mau funcionamento, furtado ou vandalizado, com observação) só vale a até 500 m do equipamento, muda a situação e abre o alerta na Central pelo mesmo caminho da tela do gestor. O texto do relato cita só o nome do agente, nunca a matrícula.
- **Ao vivo**: um despacho novo chega pelo `/api/stream`, com destaque na tela e vibração quando o aparelho permite.
- **Sair e Central**: o topo tem **Sair** e, para gestor e operador, **Central** (volta ao mapa).

Para ver o ciclo inteiro, deixe a Central e o `/campo` lado a lado: o simulador despacha agentes o tempo todo, e um acidente injetado vai para o agente de trânsito ou PM em serviço mais próximo. No celular de quem foi despachado, o aviso aparece na hora; "Concluir ocorrência" faz o alerta sumir da Central.

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
 (60 dias de histórico        calculadas só sobre o HISTÓRICO e comparadas com o passado
  + o que chega ao vivo)      (o que a simulação gera ao vivo fica de fora)
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
| **equipamentos** | código legível (`FOGO-RAD-0007`), tipo (13), nº de série único (sem diferenciar maiúsculas; normalizado em NFKC), marca, modelo, órgão, **situação** (`operacional`, `mau_funcionamento`, `em_manutencao`, `desativado`, `furtado`, `nao_instalado`; o cadastro só aceita nascer `nao_instalado`, `operacional` ou `em_manutencao`; **furtado** só sai com um registro de recuperação, para qualquer situação menos `desativado`), endereço (CEP, logradouro, referência, bairro, cidade/UF), latitude/longitude (o ponto precisa cair no bairro escolhido, com 30 m de tolerância na divisa), posição atual (móveis), último sinal, manutenção (necessidade, periodicidade, última e próxima data), características do tipo (JSON validado) |
| **historico_situacao** | cada mudança de situação, com motivo, data e origem (`historico` da semente ou `ao_vivo`, do simulador e da tela) |
| **agentes** | nome, matrícula (normalizada em NFKC), telefone (brasileiro, validado e gravado num formato só, com máscara na tela), categoria, órgão, situação (`em_servico`, `em_ocorrencia`, `pausa`, `fora_de_servico`), turno, base (o ponto também precisa cair no bairro), posição, equipamento vinculado (só moto de agente ou viatura, e de um agente só; precisa combinar com a categoria: trânsito leva moto de agente, guarda e PM levam viatura do mesmo órgão) |
| **bairros** | 65 bairros reais de Marília (OpenStreetMap): região (Centro/Norte/Sul/Leste/Oeste), centro e polígono |
| **ocorrencias** | acidente, congestionamento, infração, furto/vandalismo, veículo quebrado, alagamento, segurança; gravidade, local, início/fim, origem (`historico`, `tempo_real`, `injetado`), agente e o peso no índice das regiões |
| **telemetria_hora** | uma linha por equipamento e hora, com as métricas do tipo (fluxo, bateria, sinal…) |
| **manutencoes** | ordens (preventiva/corretiva), previstas e concluídas |
| **alertas** | criticidade (crítica, alta, média, baixa), tipo (inclui o preventivo `falha_provavel`: equipamento operacional com 50% ou mais de chance de falhar em 7 dias), explicação, reconhecido/resolvido (manual ou automático) |
| **clima_dia** | chuva que caiu e a previsão do tempo da véspera (as previsões usam a previsão, nunca a chuva que caiu no dia previsto) |

Datas aceitas a partir de 2000; texto com caractere de controle é recusado. Viatura tem o órgão responsável igual ao órgão dela. Datas no banco: texto ISO 8601 em UTC. Na tela: `dd/mm/aaaa HH:mm` no fuso de São Paulo. Toda coordenada cadastrada precisa cair dentro do limite do município. Cidade/UF é fixo em Marília/SP por decisão de escopo (o sistema atende um único município e as coordenadas precisam cair dentro dele), por isso o formulário não pede esses dois campos.

## Como cada previsão funciona

Fórmula em uma linha e um exemplo. Os exemplos saíram de um banco novo criado em 22/10/2026 às 17h27 (quinta-feira) e consultado às 17h33; num outro dia ou hora os números mudam um pouco, porque o histórico de 60 dias termina na hora em que o banco é criado. Os detalhes passo a passo estão no [guia do time](docs/GUIA-DO-TIME.md).

- **Risco por bairro e hora** — `taxa = base do bairro × perfil da região naquele dia da semana e hora × chuva prevista do dia × tendência da cidade`; o índice (0 a 100) compara a taxa com o percentil 99 das próximas 24 h. Ex.: bairro Centro na sexta às 7 h: 1,232 × 1,90 (região Centro, sexta 7 h) × 1 (sem chuva prevista) × 0,99 = 2,33 ocorrências/h → 2,33 ÷ 1,40 (p99) passa de 100 e vira índice 100 (crítico); na sexta às 3 h: 1,232 × 0,32 × 1 × 0,99 = 0,40 → 0,40 ÷ 1,40 = índice 28 (moderado).
- **Reforço de agentes** — `carga por agente = ocorrências esperadas na região no turno ÷ agentes escalados`; move-se 1 agente por vez da região mais folgada para a mais sobrecarregada, enquanto a maior carga passar 20% da média da cidade. Ex.: tarde de quinta (17h às 22h), região Centro com 37,0 ocorrências esperadas para 7 agentes = 5,3 por agente, contra 2,3 na Zona Leste → "mande 1 agente da Zona Leste para a região Centro" (Centro cai para 4,6).
- **Chance de falha em 7 dias** — `λ = taxa do tipo × fator do modelo × (1 + anos/5) × atraso da manutenção × quedas de sinal recentes; chance = 1 − e^(−7λ)`. As horas de sinal fraco só contam depois da última manutenção ou recuperação do equipamento. Ex.: a câmera FOGO-CAM-0026 (Vigilux VX-200, 7,3 anos, 7 horas com sinal fraco nas últimas 72 h) aparece em primeiro, com cerca de 64%. Pela fórmula, λ = 0,02 por dia dá 1 − e^(−0,14) = 13%.
- **Anomalias em tempo real** — compara cada leitura com a média e o desvio **do mesmo equipamento, na mesma hora e tipo de dia**; vira alerta quando |z| ≥ 3 (com confirmação em leituras seguidas). Ex.: radar com fluxo ≈ 0 no horário de pico. Anomalia não é previsão, é um sinal para olhar: os alertas só existem com o sistema rodando, então uma instalação nova não tem como conferir quantos viraram falha, e o cartão da tela explica isso no lugar da medida de acerto.
- **Tendências** — disponibilidade por tipo (30 dias + reta de mínimos quadrados por 7 dias), uso de patinetes por bairro e falhas por 100 equipamentos de cada marca/modelo. Ex.: o modelo ruim (Vigilux VX-200) tem 243 falhas por 100 câmeras contra 68 do modelo mediano. A taxa pode passar de 100 porque conta **falhas**, não equipamentos: o mesmo equipamento pode falhar mais de uma vez em 60 dias.

### Quão certas elas são (teste retroativo)

A tela de Previsões **refaz a previsão como se fosse a véspera, 14 dias seguidos**, e compara com o que aconteceu. Cada dia é previsto só com os dados até a meia-noite anterior, e a chuva do dia entra pela **previsão do tempo guardada** (que às vezes erra), nunca pela chuva que caiu. Todos os números abaixo são de uma mesma medição: banco novo, 22/10/2026 às 17h27 (dias avaliados: 08/10 a 21/10). A tela recalcula a cada dia, então eles variam um pouco (o ganho de erro, por exemplo, ficou entre 7,5% e 7,6% em bancos criados com meia hora de diferença).

| Medida | Resultado |
|---|---|
| Erro por bairro em blocos de 3 h, contra repetir a média de cada bairro | 0,53 × 0,58 ocorrência: **7,5% menor** |
| Dos 5 bairros apontados como mais arriscados à noite (18h–2h), quantos acertou | **3,6 de 5**, contra 3,4 da média simples: ganho pequeno |
| Falhas de equipamento na última semana | **32 previstas** (32,2) **× 41 ocorridas** |
| Os 10% de equipamentos apontados como mais arriscados | concentraram **22%** das falhas da semana (ao acaso seriam 10%) |
| Projeção de disponibilidade em 7 dias | erra 4,4 p.p., **pior** que repetir o último valor (3,9) e igual a repetir a média de 30 dias (4,4): a tela avisa "use para ver a direção", e o Resumo do dia não manda agir pela tendência quando ela perde para a média |

Em outra medição (banco novo, 22/10/2026 às 18h02), cerca de 11 minutos a 60× geraram 319 ocorrências e 44 falhas ao vivo (o histórico inteiro de 60 dias tem 17.637 ocorrências e 292 falhas). O mapa de risco, o teste retroativo e as tendências **não mudaram**: as previsões só aprendem com o histórico. Só a lista de "falhas prováveis" muda, de propósito, porque mostra os equipamentos em operação agora e quem falhou ao vivo sai dela.

**Por que o ganho de ~7,5% e não 30%?** Por bairro e hora quase sempre há 0 ou 1 ocorrência, então boa parte do erro é pura sorte. Mesmo conhecendo as taxas verdadeiras usadas para gerar os dados, o máximo de melhora possível seria cerca de 10% (cálculo com o próprio gerador); o modelo chega a cerca de três quartos desse teto. Antes de trocarmos a chuva observada pela previsão guardada, a mesma tela mostrava ~8%: a diferença é o preço de não deixar o dia previsto vazar para a previsão. Preferimos mostrar o número honesto a escolher uma métrica que o inflasse.

## Boletim do dia (para a reunião)

Abra **http://localhost:3333/boletim** (ou "Boletim do dia" no menu): a cidade numa folha A4, pronta para **Imprimir / Salvar PDF** (o botão abre a impressão do navegador; na folha não sai o menu nem os botões).

- Cabeçalho com data, hora de emissão e as ações do **resumo do dia** (Previsões).
- Os **6 indicadores** da Central e a **situação das 5 regiões** (normal, atenção, crítico).
- Os **5 bairros de maior risco** nas próximas 24 h, com a hora de pico e o porquê (os mesmos fatores da tela de Previsões).
- **Alertas críticos abertos**, **manutenções vencidas ou dos próximos 7 dias**, os **10 equipamentos com maior chance de falha** e a **recomendação de reforço de agentes**.
- **Exportar CSV**: inventário de equipamentos, agentes e manutenções pendentes. O arquivo é gerado no próprio navegador com `;` como separador, vírgula decimal, datas dd/mm/aaaa e BOM UTF-8, para abrir direto no Excel em português com os acentos certos.

Tudo vem das rotas que as telas já usam (`/api/central/*`, `/api/alertas`, `/api/previsoes/*`, `/api/manutencao/painel`): o boletim não calcula número novo, só recorta e escreve.

## API

Documentação interativa (Swagger): **http://localhost:3333/api/docs**. Principais rotas:

| Grupo | Rotas |
|---|---|
| Inventário | `GET/POST /api/equipamentos` (o `GET` aceita `ordem` e `direcao`; o `POST` devolve o `tokenDispositivo` uma única vez), `GET/PUT/DELETE /api/equipamentos/:id`, `PATCH …/situacao`, `POST …/manutencoes`, `GET …/telemetria`; `GET/POST /api/agentes`, `GET/PUT/DELETE /api/agentes/:id`, `PATCH …/situacao`; `GET /api/bairros`, `GET /api/tipos-equipamento` (com as métricas de telemetria de cada tipo) |
| Central | `GET /api/central/{indicadores,mapa,regioes,ocorrencias}`, `GET /api/alertas`, `PATCH /api/alertas/:id/{reconhecer,resolver}`, `GET /api/manutencao/painel` |
| Tempo real | `POST /api/telemetria`, `GET /api/stream` (SSE), `GET/PATCH /api/simulacao`, `POST /api/simulacao/eventos` |
| Previsões | `GET /api/previsoes/{risco,backtest,reforco,falhas,tendencias,resumo}` (`backtest` = o teste retroativo do risco) |
| Acesso | `POST /api/auth/{entrar,sair,demo}`, `GET /api/auth/{eu,modo}`, `GET /api/auditoria` (gestor), `POST /api/equipamentos/:id/token` (gestor: gera token novo do dispositivo) |
| Modo Campo | `GET /api/campo/agentes/:id/{despacho,equipamentos-proximos}`, `POST /api/campo/agentes/:id/despachos/:ocorrenciaId/{chegada,conclusao}`, `POST /api/campo/agentes/:id/reportes` |
| Saúde | `GET /api/saude` |

O Swagger traz o corpo, os filtros e os códigos de resposta de cada rota, gerados dos mesmos esquemas zod que validam a entrada. Toda escrita confere o `Origin` (menos a telemetria). Toda rota, menos saúde, entrada e telemetria, exige a sessão (cookie `fogo_sessao`, aberto pela entrada). Sem ela: `401`. Sem permissão para o papel: `403`. A tabela de quem pode o quê está em [docs/SEGURANCA.md](docs/SEGURANCA.md).

**Enviando uma leitura como se fosse um equipamento.** Cada equipamento tem um token, e o banco guarda só o hash dele, então ninguém o lê de volta. O script abaixo **gera um token novo** para um equipamento do **seu banco local** (o anterior deixa de valer) e o mostra uma vez; com ele, mande uma leitura (com o servidor ligado):

macOS / Linux:

```bash
TOKEN=$(npm run -s token -- FOGO-RAD-0001)

curl -X POST http://localhost:3333/api/telemetria \
  -H "content-type: application/json" \
  -H "x-dispositivo-token: $TOKEN" \
  -d '{"codigo":"FOGO-RAD-0001","metricas":{"fluxo":412,"velocidadeMedia":38.5,"infracoes":3}}'
# → 202 {"aceita":true}
```

Windows (PowerShell):

```powershell
$token = npx tsx scripts/token.ts FOGO-RAD-0001   # o mesmo que "npm run token", sem o "--" que o PowerShell pode engolir

Invoke-RestMethod -Method Post -Uri http://localhost:3333/api/telemetria `
  -ContentType "application/json" -Headers @{ "x-dispositivo-token" = $token } `
  -Body '{"codigo":"FOGO-RAD-0001","metricas":{"fluxo":412,"velocidadeMedia":38.5,"infracoes":3}}'
# → aceita: True
```

As métricas aceitas dependem do tipo (ex.: radar = `fluxo`, `velocidadeMedia`, `infracoes`): a lista completa, com rótulo e unidade, está no campo `metricas` de `GET /api/tipos-equipamento`. Métrica que não existe para o tipo responde `400` dizendo quais valem. Valor fora da faixa da métrica (percentuais de 0 a 100, velocidades até 300 km/h…), posição de equipamento fixo ou hora com mais de 6 h de atraso também são recusados, e 30 recusas por minuto de um mesmo IP bloqueiam o IP (429) por um instante. Sem token, ou com o token de outro equipamento, a resposta é `401`.

## Desempenho (medido)

Medido em 23/10/2026 num Mac com Node 22, banco novo, Chrome sem janela pelo Playwright (o "notebook fraco" é a CPU do navegador 4× mais lenta, pelo próprio Chrome). Os números mudam de máquina para máquina; a ordem de grandeza é o que importa.

| O quê | Resultado |
|---|---|
| Do zero até "no ar" (`npm start`: build + semente de 60 dias + servidor) | cerca de 4 s; a semente sozinha, 1,4 s |
| Rotas da API | 1 a 2 ms; o primeiro cálculo das previsões, 131 ms (depois fica guardado por 1 min) |
| Central ao vivo (CPU do navegador) | 2% a 1×, 5% a 60×; 60 quadros por segundo, nenhuma tarefa longa |
| Abrir cada tela no notebook fraco | 0,1 a 0,5 s; Previsões mostra o resumo em 0,6 s e "Próximos 7 dias" em 0,5 s ao chegar nele |
| Servidor depois de 30 min | 43 MB de memória; banco com 38 MB |
| Interface entregue | 1,6 MB de JavaScript viram 0,54 MB (versões brotli/gzip geradas no build) |

Como ficou assim:
- **Arquivos da interface comprimidos no build** (`scripts/comprimir-build.mjs`, chamado pelo `vite.config.ts`): o servidor entrega a versão pronta conforme o navegador aceita, sem comprimir a cada pedido. A API e o tempo real (SSE) não são comprimidos: rodando na mesma máquina, comprimir só gastaria CPU.
- **Cache certo para cada arquivo**: os arquivos com o código do build no nome (`/assets/index-abc123.js`) ficam guardados no navegador por um ano, porque nunca mudam; a página principal é sempre conferida, para um build novo aparecer na hora.
- **Telas sob demanda**: cada tela é um arquivo separado, baixado só quando aberto; "Próximos 7 dias" só calcula quando a pessoa rola até ele.
- **Previsões guardadas**: o cálculo pesado roda no máximo uma vez por minuto, e as telas leem o resultado pronto.

## Testes

```bash
npm test            # Vitest: servidor, regras, previsões, segurança e interface
npm run typecheck   # TypeScript estrito, servidor e interface
npm run e2e         # Playwright: sobe o app com banco próprio (porta 3399) e confere Central, Previsões e Equipamentos
```

O E2E usa `data/e2e.db`, apaga o banco velho antes de começar e o apaga de novo ao terminar (no Windows, se o arquivo ainda estiver preso, o próximo `npm run e2e` o remove); não mexe no seu `data/fogo.db`. Na primeira execução do Playwright pode ser preciso `npx playwright install chromium`.

`npm run empacotar` gera `fogo-dsin-coder-challenge.zip` (sem `node_modules`, `dist`, bancos, `docs/design/`, `docs/relatorio/`, `video/` e pastas de trabalho; falha se passar de 50 MB). O PDF do relatório técnico vai junto.

## Decisões e limitações (sem maquiagem)

- **Os dados são sintéticos.** Bairros e ruas são reais (OpenStreetMap), mas equipamentos, agentes, ocorrências e 60 dias de telemetria são gerados com semente fixa e **padrões plantados** de propósito (picos de 7–9 h e 17–19 h, sexta/sábado à noite no Centro, chuva com mais acidentes, um modelo de câmera pouco confiável, furtos de patinete em dois bairros). A previsão "redescobre" esses padrões; isso prova que o método funciona, **não** que ele acertaria numa cidade real sem ajuste.
- **O simulador é acelerado de propósito** para a demonstração: ocorrências, falhas e furtos ao vivo acontecem muito mais depressa que na vida real. Por isso as previsões aprendem **só com o histórico**: todas as entradas (ocorrências, falhas, telemetria, mudanças de situação) param no fim do histórico gerado, e as mudanças de situação feitas ao vivo levam a marca `ao_vivo`, então continuam de fora mesmo depois de reiniciar. Eventos injetados também ficam de fora. A lista de "falhas prováveis" mostra os equipamentos em operação **agora**: um equipamento que o simulador consertou volta para a lista.
- **A situação das regiões mede a cidade no ritmo real.** O índice soma 4 pontos por ocorrência das últimas 3 h, mas cada ocorrência gerada ao vivo pesa 1 ÷ (8 × a velocidade em que começou), porque o simulador produz 8 vezes o ritmo real (vezes 10 ou 60); histórico e eventos injetados pesam 1. O painel mostra as duas contas ("192 ocorrências nas últimas 3 h (contam como 6,5 no ritmo real)").
- **A simulação ao vivo é calma na partida e coerente depois.** Chuva comum não alaga (só temporal, a partir de uns 20 mm no dia), e nenhum bairro começa com mais de 2 equipamentos indisponíveis. "Injetar evento → Alagamento" escolhe um bairro sem alagamento aberto (se todos já alagam, devolve o alerta existente, sem duplicar por bairro). Acidentes seguem a gravidade (1 baixa, 2 média, 3 alta, 4 crítica; o injetado é sempre crítico), uma falha provável fecha na hora em que o equipamento sai de operação, e com a simulação pausada o relógio do estado também para.
- **Furtos ao vivo só fecham com uma pessoa**: o patinete furtado fica fora da cidade e com alerta crítico até alguém registrar a recuperação (ele volta ao ponto-base e o alerta fecha) ou resolver o alerta. Deixando 60× ligado por muito tempo, esses furtos se acumulam no índice dos bairros.
- A velocidade 10× e 60× multiplica o ritmo de eventos, mas o relógio é o relógio real (nada é gravado no futuro).
- **Se o avaliador abrir dias depois**, o histórico é completado até "agora" ao iniciar (a lacuna é preenchida), então "próximas 24 h" continua valendo. A lacuna não cria falhas novas de equipamento; o simulador ao vivo cria.
- O ganho do risco por bairro é modesto (~7,5%) e, nos 5 bairros mais arriscados à noite, o modelo ganha pouco da média simples (3,6 contra 3,4), pelas razões acima; a projeção linear de disponibilidade não ganha de repetir a média nem o último valor nesta cidade estável. Dizemos isso na própria tela.
- **O modo demonstração entra sem senha, de propósito**: é o que permite à comissão avaliar com um clique. Ele aparece no terminal e se desliga com `FOGO_DEMO=0`; o que ficou fora da segurança (HTTPS próprio, 2FA, tela de usuários) está em [docs/SEGURANCA.md](docs/SEGURANCA.md).
- O mapa precisa de internet para o fundo de ruas; o ViaCEP (preenchimento de CEP) é opcional e o cadastro funciona sem ele.
- SQLite atende bem a um município simulado; para milhões de leituras por dia o caminho seria um banco de séries temporais (discutido no guia).

## Relatório técnico

O relatório completo do projeto, no formato da ABNT (NBR 10719), está em [docs/Relatorio-Tecnico-FOGO.pdf](docs/Relatorio-Tecnico-FOGO.pdf): requisitos com onde cada um é atendido, metodologia e uso de IA, arquitetura e modelo de dados, as três partes com capturas do sistema, as fórmulas das previsões e o teste retroativo, segurança, testes, desempenho, execução e limitações. Ele é gerado a partir de `docs/relatorio/` com `node docs/relatorio/scripts/gerar-pdf.mjs` (as capturas, com o sistema rodando numa porta própria, com `node docs/relatorio/scripts/capturar-telas.mjs`).

## Vídeo de demonstração

**Assista:** [fogo-demonstracao.mp4](https://github.com/jonhvinnykkj/fogo-dsin-coder-challenge-2026/releases/download/v1.0/fogo-demonstracao.mp4) (3 min 52 s, 1080p, com narração), na página da [versão v1.0](https://github.com/jonhvinnykkj/fogo-dsin-coder-challenge-2026/releases/tag/v1.0). Mostra a entrada por papel, o inventário, a Central, o Modo Campo com o celular do agente ao lado da Central, as previsões, o Boletim do dia, a consulta mascarada e a auditoria.

O código do vídeo (projeto Remotion, pasta `video/`) fica no repositório do projeto; ele não é o sistema, então não vai neste .zip.

## Uso de IA

Este projeto foi construído com **Claude Code**: o **Claude Opus 5.5** orquestrou o trabalho, revisou e implementou as partes mais complexas; o **Claude Sonnet 5.5** implementou e revisou tarefas; o **Claude Haiku 5.5** fez revisões curtas. Cada tarefa passou por testes escritos antes do código e por revisão independente.

O time **revisou, testou e estudou** cada módulo. O [guia do time](docs/GUIA-DO-TIME.md) reúne o mapa do código, o caminho de um dado IoT, as fórmulas com exemplos e as perguntas prováveis da comissão com respostas.

## Créditos

Mapa e dados de bairros, ruas e limite urbano: © colaboradores do [OpenStreetMap](https://www.openstreetmap.org/copyright), disponíveis sob a licença ODbL. Marcas citadas no catálogo de equipamentos servem só como referência de mercado; códigos de modelo e índices de confiabilidade são fictícios. Ícones: [Phosphor Icons](https://phosphoricons.com). Fonte: Archivo (Fontsource).
