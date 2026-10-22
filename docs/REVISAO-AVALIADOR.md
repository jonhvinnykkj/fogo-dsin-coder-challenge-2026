# Revisão como avaliador — F.O.G.O.

Revisão feita em **19/10/2026** sobre a `main` em `aa55a21`, simulando a comissão do DSIN Coder Challenge testando o sistema pela primeira vez. Nada foi corrigido: este documento só registra o que foi encontrado, como reproduzir e uma sugestão de correção.

Máquina: Windows 11, Node 22.23.2, npm 10.9.2, Docker Desktop 4.37.1 (engine 27.4.0). Navegador: Chromium do Playwright 1.64.1 e Chrome instalado (com janela).

**Classificação**

| Nível | Significado |
|---|---|
| **Bloqueante** | A comissão não consegue rodar ou usar uma das três partes |
| **Importante** | A comissão provavelmente percebe e perde ponto (critério de uso, qualidade técnica ou "rodar de primeira") |
| **Detalhe** | Polimento: só um avaliador minucioso nota |

## Resumo

- **Nenhum bloqueante.** O sistema roda de primeira com `npm install && npm start` (2 min 18 s do zero) e com `docker compose up --build` (2 min 23 s do zero).
- **6 importantes** (I1–I6) e **13 detalhes** (D1–D13).
- O **zoom errado do mapa em 800 px não foi reproduzido** em 15 cenários; a seção [Mapa da Central em 800 px](#mapa-da-central-em-800-px-não-reproduzido) lista o que foi testado, as hipóteses e um reforço que evita o problema de qualquer forma.
- Pontos fortes que a comissão vai notar: nenhum erro de console e nenhuma rolagem horizontal em 48 combinações de tela × largura; 5 minutos a 60× sem vazamento de memória, rotas abaixo de 35 ms, interface a 49–61 fps e previsões idênticas antes e depois; validações e mensagens em português claras na maioria dos casos.

## 1. Instalação "máquina limpa"

Feita num `git worktree` novo da `main` (sem `node_modules`, `dist` nem `data/`), o mesmo estado de quem baixa o zip.

| Etapa | Resultado |
|---|---|
| `npm install` | 121 s, 0 vulnerabilidades |
| `npm start` (build + semente + subir) | 17 s: build 2,4 s; semente 8,9 s (350 equipamentos, 80 agentes, 17.585 ocorrências, 451.978 horas de telemetria) |
| **Total até abrir a Central** | **≈ 2 min 18 s** |
| `docker compose up --build` (`PORT=3341`) | 132 s de build + 11 s até `/api/saude` = **2 min 23 s**; semente em 5,8 s; imagem de 789 MB |
| Porta 3333 ocupada | Mensagem clara em português com o comando para outra porta (Windows e macOS/Linux) — mas só depois do build e da semente (ver D8) |
| `npm test` / `npm run typecheck` | 386 testes em 53 arquivos passando (110 s); typecheck sem erros |
| `npm run e2e` | 4 de 4 passam, mas termina com erro no Windows (ver I3) |
| `npm run empacotar` | 334 arquivos, 2,25 MB (limite: 50 MB) |

## 2. Telas em 1440, 1024, 800 e 390 px

Percorridas: `/`, `/equipamentos`, `/equipamentos/1`, `/equipamentos/novo`, `/equipamentos/1/editar`, `/agentes`, `/agentes/1`, `/agentes/novo`, `/manutencao`, `/alertas`, `/previsoes` e uma rota inexistente, nas quatro larguras (48 combinações).

- **Nenhum erro de console** e **nenhuma rolagem horizontal** em nenhuma das 48.
- Página não encontrada tem tela própria com volta para a Central.
- Em 1024 px e abaixo, a coluna de alertas/regiões vira gaveta ("Alertas e regiões") e o menu vira botão; funciona bem.
- O visual cumpre a direção do design (blocos de cor cheia, ícones cheios com palavra, nada "genérico de IA").

### Mapa da Central em 800 px (não reproduzido)

**Relato:** em 800 px o mapa da Central abre num zoom errado (uma rua só, com um polígono vermelho cobrindo tudo).

**O que foi testado** (zoom lido pela URL dos blocos do mapa; esperado: 12 a 13, a cidade inteira):

| Cenário | Zoom |
|---|---|
| Carga direta 800 × 500, 600, 700, 768 e 900 | 12, 12, 12, 12, 13 |
| Abrir em 1440 × 900 e estreitar para 800 | 13 |
| Abrir em 1024 × 768 e estreitar para 800 | 12 |
| Abrir `/equipamentos` em 800 e ir para a Central pelo menu | 12 |
| Chrome real com janela, escala de tela 100%, 125% e 150% | 12 |
| Janela real estreitada aos poucos: 1440 → 1100 → 950 → 816 | 13 |
| F5 na Central depois de um "Ver no mapa" | 12 |

Em nenhum caso o mapa abriu fechado numa rua.

**O que produz exatamente essa imagem:** o **foco proposital**. "Ver no mapa" (tela de Alertas ou notificação de alerta crítico), um evento injetado e o clique num bairro do painel de regiões levam o mapa ao zoom 15 e pintam o bairro de laranja-vermelho forte (`#F04A00`, preenchimento 50%) por alguns segundos (`MapaOperacional.focarPonto` e `CamadaBairros.focar` / `destacar`). Em 800 px a gaveta fecha sozinha ao focar (`Central.tsx`, `focarAlerta`), então quem clicou pode não ligar a causa ao efeito, e **não existe um botão para voltar à cidade inteira**: só o "−" várias vezes.

**Segunda hipótese (causa possível em outra versão ou máquina):** `EnquadrarCidade` (`web/src/componentes/MapaOperacional.tsx`) chama `fitBounds` **uma única vez**, quando o mapa monta. Se nesse instante a moldura estiver sem tamanho (CSS ainda não aplicado, por exemplo no `npm run dev`, ou a moldura escondida durante uma transição), o Leaflet calcula o zoom com tamanho 0 e o resultado vai para o zoom máximo. Depois, `AjustarTamanho` só chama `invalidateSize`, que **mantém** centro e zoom: o mapa nunca volta a enquadrar a cidade. Não deu para testar o `npm run dev` sem interferir no servidor de outra sessão (o proxy do Vite aponta fixo para a porta 3333).

**Sugestão (resolve as duas hipóteses):**
1. Em `EnquadrarCidade`, só enquadrar quando `mapa.getSize()` tiver largura e altura maiores que zero; se ainda não tiver, enquadrar no primeiro aviso do `ResizeObserver` com tamanho válido, enquanto a pessoa não tiver mexido no mapa.
2. Acrescentar um controle **"Cidade inteira"** abaixo do +/−, que chama o mesmo `fitBounds`.
3. **Pedir a quem viu:** navegador, largura e zoom do navegador, se foi `npm start` ou `npm run dev`, de qual tela veio e se havia clicado em algum alerta. Com isso dá para fechar a causa.

## 3. Enunciado × o que existe

O texto original do enunciado **não está no repositório**. A conferência abaixo usa a leitura dele que está em `docs/design/2026-10-17-fogo-design.md` (seção 6). Vale colar o enunciado original em `docs/` e repetir esta conferência contra ele.

Legenda: ✅ conferido funcionando na tela ou na API · 🔎 existe no código e nos testes, sem teste manual aprofundado · ⚠️ existe, mas está fraco (com referência ao achado).

### Parte 1 — Inventário Inteligente da Cidade

| Item | Situação |
|---|---|
| Lista de equipamentos com busca, filtros (tipo, situação, bairro, região, órgão, manutenção) e paginação | ✅ |
| O mesmo para agentes | ✅ |
| Cadastro e edição com campos por tipo (13 tipos) | ✅ |
| CEP com preenchimento automático (ViaCEP, opcional) | ✅ (CEP inexistente: ver D7) |
| Escolha do ponto no mapa (clique preenche GPS e sugere bairro) | ✅ — mas o bairro pode ser trocado por um que não contém o ponto (ver I4) |
| Ficha: dados, mini-mapa, linha do tempo, manutenções, telemetria, alertas | ✅ |
| Número de série único | ⚠️ maiúsculas e minúsculas contam como diferentes (D3) |
| GPS dentro do município | ✅ (API e tela) |
| Próxima manutenção obrigatória quando agendada/periódica | ✅ |
| Furtado só volta a operacional com recuperação | ✅ |
| Excluir com histórico recusado, sugerindo desativar | ✅ — mas um equipamento recém-criado também é recusado (I1) |
| API documentada em `/api/docs` | ✅ |

### Parte 2 — Central de Operações

| Item | Situação |
|---|---|
| Mapa com marcadores por tipo e situação, agrupados; agentes ao vivo; bairros pintados | ✅ |
| Faixa com 6 indicadores em blocos de cor cheia | ✅ |
| Filtros (tipo, situação, bairro, região, órgão, manutenção) | 🔎 |
| Feed de alertas em tempo real com reconhecer e resolver | ✅ |
| Painel de regiões (normal × atenção, com motivo) | ✅ |
| Clique no marcador abre a ficha lateral | 🔎 |
| Velocidade 1×/10×/60× e injetar evento | ✅ — no celular a barra fica fora da tela (I2) |

### Parte 3 — Cidade Preditiva

| Item | Situação |
|---|---|
| Risco por bairro e hora (24 h e 7 dias), mapa de calor com régua de horário | ✅ / 🔎 (régua) |
| Teste retroativo (erro médio e top 5) | ✅ — previsões iguais antes e depois de 5 min a 60× |
| Reforço de agentes com recomendação concreta | ✅ |
| Manutenção preditiva com ranking e fatores | ✅ |
| Anomalias em tempo real que viram alertas explicados | ✅ |
| Tendências (disponibilidade + projeção, patinetes por bairro, falhas por modelo) | ⚠️ a projeção é pior que a média e mesmo assim gera recomendação no resumo (I5) |
| Índice consolidado dos bairros e recomendações do dia | ✅ |

## 4. Casos de borda

### API (36 casos)

| Caso | Resposta | Avaliação |
|---|---|---|
| Corpo vazio, JSON quebrado | 400 com cada campo explicado / mensagem genérica | ✅ |
| CEP fora da faixa (`01001-000`) | 400 "O CEP precisa ser de Marília" | ✅ |
| CEP na faixa mas inexistente (`17539-999`) | 201 | Aceitável (sem rede obrigatória), ver D7 |
| Coordenada em São Paulo | 400 "A coordenada precisa ficar dentro de Marília" | ✅ |
| Ponto em Higienópolis com `bairroId` de Alto Cafezal | **201** | I4 |
| `bairroId` inexistente | 400 "Bairro não encontrado" | ✅ |
| Data `2026-02-30` | **201, gravada como `2026-02-30`** | D1 |
| Instalação em 2099; próxima manutenção antes da última | **201** | D2 |
| Periódica sem periodicidade; característica inválida; cidade "Bauru"; série só com espaços | 400 com mensagem certa | ✅ |
| Série duplicada | 409 | ✅ |
| Série duplicada mudando só maiúsculas | **201** | D3 |
| PUT trocando o tipo | 400 "O tipo do equipamento não pode ser alterado" | ✅ |
| PUT com o mesmo objeto que o GET devolveu | 200 | ✅ |
| Excluir equipamento com alertas | 409 "Use a situação 'Desativado'" | ✅ |
| Excluir equipamento criado há poucos segundos | **409 "tem histórico"** | I1 |
| `:id` não numérico ou inexistente | 404 | ✅ |
| `porPagina=1000`; filtro com tipo inválido; busca `%` | 400; 400; 0 resultados (não casa tudo) | ✅ |
| Sair de furtado sem recuperação; mudar situação sem motivo | 400 | ✅ |
| Agente fora de Marília; com equipamento inexistente | 400 | ✅ |
| Agente vinculado a uma **câmera** | **201** | D4 |
| Telemetria sem token | 401 | ✅ |
| Velocidade 7×; evento "meteoro"; rota `/api/xyz` | 400; 400; 404 | ✅ |

### Interface

| Caso | Resultado |
|---|---|
| Enviar o formulário vazio | Resumo "Corrija os 10 campos destacados abaixo", foco vai para o primeiro campo. Algumas mensagens são cruas (D6) |
| CEP de São Paulo | "Este CEP é de São Paulo/SP, fora de Marília/SP" ✅ |
| CEP inexistente da faixa | "Não foi possível buscar o CEP — preencha o endereço" (D7) |
| CEP válido (`17501-110`) | Preenche "Rua Marechal Deodoro" ✅ |
| Clique no mapa fora do município | Aviso e erro no campo ✅ |
| Latitude e longitude de São Paulo digitadas | Erro "A coordenada precisa ficar dentro de Marília" ✅ |
| Excluir equipamento com histórico pela ficha | Diálogo mostra a recusa e oferece "Desativar em vez de excluir" ✅ |

### 60× por 5 minutos (Central aberta no navegador o tempo todo)

| Momento | Memória do servidor | Rotas (indicadores / mapa / regiões / alertas) | Alertas abertos (críticos) | Regiões C/N/S/L/O | Tela |
|---|---|---|---|---|---|
| Antes (1×) | 89 MB | 6 / 20 / 14 / 10 ms | 19 (1) | 38/27/30/9/30 | 31 fps |
| 60 s | 90 MB | 19 / 18 / 19 / 9 ms | 37 (2) | 92/49/30/9/52 | 49 fps |
| 150 s | 77 MB | 20 / 10 / 25 / 11 ms | 29 (2) | 71/27/30/9/52 | 60 fps |
| 300 s | 93 MB | 19 / 17 / 7 / 5 ms | 30 (4) | 61/27/62/9/41 | 61 fps |
| 5 s depois de voltar a 1× | 93 MB | 18 / 5 / 15 / 4 ms | 22 (4) | 83/22/30/9/41 | 61 fps |

- Memória estável (77–94 MB), banco cresceu 1 MB, heap da página parado em 10 MB, ~1.000–1.300 nós no DOM: **sem vazamento**.
- Nenhum erro na página.
- Teste retroativo e falhas prováveis **idênticos** antes e depois (MAE 0,5391 × 0,5806, ganho 7,1%, top 5 = 3,8; primeiras falhas FOGO-CAM-0045, 0059, 0020). Confirma o que o README promete.
- Os críticos sobem de 1 para 4 e não descem ao voltar para 1×: são os furtos ao vivo, que só fecham com uma pessoa (comportamento documentado no README).

## 5. Achados

### Importantes

#### I1. Equipamento recém-cadastrado não pode mais ser excluído depois de poucos segundos

**Passos:** cadastrar um equipamento com situação "Operacional" → abrir a ficha (histórico vazio, nenhum alerta) → Excluir.
**Resultado:** 409 "Este equipamento tem histórico. Use a situação 'Desativado' em vez de excluir." Pela API, excluir no mesmo segundo do cadastro funciona (204); alguns segundos depois, não.
**Causa:** o simulador manda a primeira leitura de telemetria no próximo tick (2 s), e `contarVinculos` (`server/repositorios/equipamentos.ts`, usado por `excluirEquipamento` em `server/servicos/equipamentos.ts`) conta `telemetria_hora`. A ficha não mostra telemetria como "histórico", então a mensagem contradiz a tela.
**Por que importa:** é exatamente o teste que um avaliador faz: cadastrar algo de teste e apagar.
**Sugestão:** não contar telemetria como vínculo que impede a exclusão (apagar as linhas de `telemetria_hora` junto) e manter a recusa para alertas, ocorrências, manutenções e mudanças de situação; ou, no mínimo, dizer na mensagem qual histórico existe ("recebeu 3 leituras de telemetria").

#### I2. No celular, a barra de simulação fica fora da tela e o mapa "rouba" a rolagem

**Passos:** abrir `/` em 390 × 844 (ou 360 × 640).
**Resultado:** o botão "Injetar evento" fica em y = 827–863 numa tela de 844 (em 360 × 640: 696–732 numa tela de 655). Ele só aparece rolando o contêiner da página, e como o mapa ocupa quase toda a tela, arrastar o dedo sobre ele move o mapa em vez de rolar.
**Sugestão:** em telas estreitas, prender a barra no rodapé da tela (`position: sticky` / `fixed` com `bottom` e `env(safe-area-inset-bottom)`) ou dimensionar a moldura do mapa com `100dvh` menos a altura real dos indicadores para que tudo caiba.

#### I3. `npm run e2e` termina com erro no Windows e deixa o banco de teste para trás

**Passos:** `npm run e2e` no Windows.
**Resultado:** os 4 testes passam, mas o processo termina com `Error: EBUSY: resource busy or locked, unlink '...\data\e2e.db'` em `e2e/limpeza.ts:5`, e `data/e2e.db*` fica no disco.
**Causa:** o `globalTeardown` roda enquanto o servidor ainda segura o arquivo; no Windows não dá para apagar arquivo aberto.
**Sugestão:** `rmSync(..., { force: true, maxRetries: 10, retryDelay: 300 })` e, se ainda falhar, avisar sem derrubar o processo; ou apagar o banco no começo do próximo E2E.

#### I4. O bairro do cadastro pode não conter o ponto do GPS

**Passos:** `POST /api/equipamentos` com o ponto de Higienópolis (`-22.230058, -49.968438`) e `bairroId: 1` (Alto Cafezal).
**Resultado:** 201. O equipamento aparece em Alto Cafezal (região Centro) na lista e no índice das regiões, mas o marcador fica em Higienópolis (região Oeste).
**Sugestão:** no serviço, conferir com `server/geo/marilia.ts` se o ponto cai no polígono do bairro (com uma pequena tolerância na divisa) e responder 400 com "O ponto fica em Higienópolis; escolha esse bairro ou mova o ponto". Outra saída é o servidor deduzir o bairro pelo ponto.

#### I5. O resumo do dia recomenda ação com base numa projeção que a própria tela diz ser pior que a média

**Passos:** abrir `/previsoes` → "Resumo do dia".
**Resultado:** aparece "Disponibilidade de veículos de transporte em queda: 88% em 7 dias … Antecipe as preventivas desse tipo", vinda da reta de tendência. Na mesma tela (e no README), o teste retroativo mostra que essa projeção erra mais (4,9 p.p.) do que repetir a média de 30 dias (4,1 p.p.).
**Por que importa:** um avaliador atento vê a contradição entre a recomendação e o "use para ver a direção".
**Sugestão:** só levar a tendência ao resumo quando a média recente também estiver abaixo da média de 30 dias, ou rebaixar para "informação" (sem "Antecipe…") e citar a confiabilidade no próprio cartão.

#### I6. O enunciado original não está no repositório

A conferência da seção 3 foi feita contra a interpretação do documento de design. Se o enunciado pedir algo que o design deixou de fora, nenhum teste pega.
**Sugestão:** salvar o enunciado em `docs/` e refazer a seção 3 item por item.

### Detalhes

| # | Achado | Passos | Sugestão |
|---|---|---|---|
| D1 | Data impossível aceita e gravada como veio (`instaladoEm: "2026-02-30"`) | `POST /api/equipamentos` com essa data | Em `dataIso` (`shared/schemas.ts`), conferir que `new Date(v).toISOString().slice(0, 10) === v.slice(0, 10)`: o `Date.parse` do V8 aceita 30/02 e vira 02/03 |
| D2 | Instalação no futuro (2099) e próxima manutenção antes da última são aceitas | `POST` com essas datas | Regras no `superRefine`: instalação ≤ hoje; próxima ≥ última |
| D3 | Número de série duplicado entra se mudar só maiúsculas/minúsculas (`REV-X` × `rev-x`) | `POST` duas vezes | `UNIQUE COLLATE NOCASE` no `schema.sql` (e migração) ou normalizar para maiúsculas ao gravar |
| D4 | Agente pode ser vinculado a uma câmera (ou a um veículo já de outro agente) | `POST /api/agentes` com `equipamentoId: 2` | Aceitar só `moto_agente` e `viatura` que não estejam vinculadas a outro agente |
| D5 | Equipamento **furtado** aparece no quadro de Manutenção como "Próximos 30 dias" (ex.: FOGO-SEM-0001); o cadastro também aceita já nascer "furtado", sem alerta | `/manutencao`, coluna azul | Tirar furtados e desativados do quadro preventivo; no cadastro, limitar a `nao_instalado` / `operacional` / `em_manutencao` |
| D6 | Formulário vazio mostra "Tipo: valor inválido", "Órgão responsável: valor inválido" e, para CEP vazio, "CEP inválido: use o formato 00000-000" | Enviar `/equipamentos/novo` vazio | Mensagem própria para vazio: "Escolha o tipo", "Escolha o órgão", "Informe o CEP" |
| D7 | CEP inexistente aparece como "Não foi possível buscar o CEP", igual a uma falha de rede | Digitar `17539-999` | Separar o `{ erro: true }` do ViaCEP ("CEP não encontrado — confira ou preencha o endereço") da falha de rede |
| D8 | Com a porta ocupada, o aviso só aparece depois do build e da semente (17 s) | `npm start` com 3333 em uso | Testar a porta antes (em `scripts/checar-node.mjs` ou no começo de `server/index.ts`) |
| D9 | No Docker, o log diz "no ar em http://localhost:3333" mesmo publicado em outra porta; a imagem tem 789 MB (leva as dependências de desenvolvimento) | `PORT=3341 docker compose up --build` | Dizer "porta 3333 do contêiner (veja o mapeamento)"; `npm prune --omit=dev` mantendo `tsx`, ou compilar o servidor |
| D10 | Linhas finas e um retângulo de tom diferente no fundo do mapa (emendas dos blocos) | Central em 1440 ou 800, olhar o fundo do mapa | Efeito conhecido de zoom fracionado (`zoomSnap = 0.5`) com `filter` no `.leaflet-tile-pane` (`web/src/estilo/base.css`): usar zoom inteiro no enquadramento ou aplicar o filtro com `will-change: transform` / sobreposição de 0,5 px nos blocos |
| D11 | Em 800 × 600 o mapa da Central fica com 280 px de altura (os indicadores ocupam duas linhas) | Abrir `/` em 800 × 600 | Indicadores compactos (uma linha rolável) abaixo de ~900 px de largura ou altura mínima para o mapa |
| D12 | README e guia desatualizados: "376 testes em 52 arquivos" (hoje 386 em 53); semente "3,6 s" (8,9 s nesta máquina, 5,8 s no Docker) | `npm test` | Atualizar os números, ou escrever "cerca de 380 testes" e "poucos segundos" |
| D13 | `npm install` numa máquina limpa altera o `package-lock.json` (`"hasInstallScript": true` no `better-sqlite3`) | `npm install` num clone novo e `git status` | Rodar `npm install` e commitar o lock atualizado; é a mesma linha que aparece modificada na pasta de trabalho principal |

## 6. Como estes testes foram feitos

- Instalação e servidor num `git worktree` separado, porta 3340 (a 3333 estava ocupada por outra sessão), banco próprio.
- Telas: script Playwright que abre cada rota em cada largura, espera 4 s, guarda a captura, os erros de console, a diferença `scrollWidth − innerWidth` e o zoom dos blocos do mapa.
- API: script com `fetch` para os 36 casos acima.
- Carga: `PATCH /api/simulacao { velocidade: 60 }` por 5 minutos, com amostras a cada 30 s da memória do processo (Windows `WorkingSet64`), do tempo das rotas, dos alertas, do índice das regiões e dos quadros por segundo da página aberta.
