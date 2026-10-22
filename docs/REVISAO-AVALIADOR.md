# Revisão como avaliador — F.O.G.O.

Revisão feita em **19/10/2026** (a rodada 2, de 22/10, está na seção 7) sobre a `main` em `aa55a21`, simulando a comissão do DSIN Coder Challenge testando o sistema pela primeira vez. Este documento registra o que foi encontrado, como reproduzir e uma sugestão de correção. Os itens marcados **Corrigido** (I3, I5, I6, D8, D9, D12 e D13) foram resolvidos na branch `correcao/infra`; os demais estão tratados em outras branches ou seguem abertos.

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
| Porta 3333 ocupada | Mensagem clara em português com o comando para outra porta (Windows e macOS/Linux). **Corrigido (D8):** agora sai em 0,1 s, antes do build e da semente |
| `npm test` / `npm run typecheck` | 386 testes em 53 arquivos passando (110 s); typecheck sem erros |
| `npm run e2e` | 4 de 4 passam, mas termina com erro no Windows. **Corrigido (I3)** |
| `npm run empacotar` | 334 arquivos, 2,25 MB (limite: 50 MB) |

### Correções desta seção (branch `correcao/infra`)

| # | O que mudou |
|---|---|
| **I3** (Corrigido) | `scripts/apagar-banco-e2e.mjs` apaga `data/e2e.db*` tentando até 5 a 10 vezes com espera e **nunca derruba o processo**: se o Windows ainda segurar o arquivo, `e2e/limpeza.ts` só avisa. O Playwright só derruba o servidor depois do `globalTeardown`, então no Windows a primeira limpeza pode falhar; por isso o `webServer` agora roda `node scripts/apagar-banco-e2e.mjs && npm start`, que apaga a sobra antes de subir. Teste: `scripts/apagar-banco-e2e.test.ts` (simula EBUSY) |
| **D8** (Corrigido) | `scripts/checar-porta.mjs` (no `npm start` e no `npm run dev`, logo depois de `checar-node.mjs`) tenta ocupar a porta e, se estiver em uso ou `PORT` for inválida, mostra a mesma mensagem de antes. As mensagens passaram a morar nesse script e `server/porta.ts` as reexporta. Teste: `scripts/checar-porta.test.ts` (ocupa uma porta de verdade e confere a mensagem e que sai em menos de 5 s) |
| **D9** (Corrigido) | O log diz `F.O.G.O. no ar. Abra http://localhost:3341 (porta 3333 dentro do contêiner…)`: o `docker-compose.yml` manda `FOGO_PORTA_PUBLICADA`. Imagem de 789 MB para cerca de 312 MB: o Dockerfile faz `npm ci --omit=dev` (o `tsx` virou dependência de produção, e React, Leaflet, Recharts etc. foram para `devDependencies`, porque a interface vai compilada em `dist/web`), e o `npm ci` repete até 5 vezes quando a rede derruba a conexão. Verificado com `PORT=3441 docker compose up --build`: semente, `/api/saude` 200 e a nova mensagem |
| **D12** (Corrigido) | README e guia dizem "poucos segundos" e "mais de 450 testes" (hoje 470 em 64 arquivos) |
| **D13** (Corrigido) | `package-lock.json` regenerado por uma instalação limpa (`npm install` numa pasta nova): traz `"hasInstallScript": true` no `better-sqlite3`; um novo `npm install` não altera mais o arquivo |

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

Conferido item por item contra o texto **original** do enunciado, salvo em [ENUNCIADO.md](ENUNCIADO.md), no código e no sistema rodando (API em `localhost` com o gestor da entrada de demonstração e a interface aberta no Chromium). A versão anterior desta seção usava a leitura do documento de design.

Legenda: ✅ atendido e conferido · ⚠️ atendido em parte ou com ressalva · ❌ não atendido.

### Principais instruções e entrega

| O enunciado pede | Situação | Onde |
|---|---|---|
| Informar qual IA foi usada e mostrar que o time entende o que foi construído | ✅ | README, seção "Uso de IA"; [GUIA-DO-TIME.md](GUIA-DO-TIME.md) (mapa de código, fórmulas, perguntas da comissão) |
| Mandar tudo o que for preciso para rodar; "roda de primeira" | ✅ | `npm install && npm start` ou `docker compose up --build` (seção 1); README com Windows e macOS/Linux |
| Limite de 50 MB no envio | ✅ | `npm run empacotar` gera o zip só com o código (cerca de 2 MB) |
| Vídeo do sistema rodando vale ponto extra | ❌ | O projeto Remotion fica em `video/` no repositório, mas `video/` não vai no zip (o zip leva só o sistema); o README explica isso na seção "Vídeo de demonstração" |
| Formato livre, front-end opcional | ✅ | Sistema web completo (Fastify + React) e API documentada em `/api/docs` |

### 1ª Parte — Inventário Inteligente da Cidade

| O enunciado pede | Situação | Onde |
|---|---|---|
| **Tipo**: radar (velocidade, semáforo, retorno proibido…), câmera, balança, veículo autônomo de fiscalização do rotativo, cancela, veículos de transporte (táxi, mototáxi, escolar), totem do rotativo, patinete, moto de agente, viatura da GM e da PM, "entre outros" | ✅ | 13 tipos em `shared/tipos-equipamento.ts` (os 10 pedidos mais semáforo inteligente, painel de mensagem e sensor de alagamento); `GET /api/tipos-equipamento`. Radar tem modalidade (velocidade, avanço de semáforo, conversão proibida, retorno proibido, parada sobre faixa); transporte tem categoria (táxi, mototáxi, escolar). "Autônomo" só no rótulo do veículo do rotativo: não há campo que diga se é autônomo |
| **Número de série, marca e modelo** | ✅ | Obrigatórios no cadastro (`shared/schemas.ts`); aparecem na lista, na ficha e na API. Série repetida é recusada, mas maiúsculas e minúsculas contam como diferentes (D3) |
| **Localização**: CEP, bairro, cidade/UF, nome de rua, referência, GPS | ✅ | Todos os campos existem (CEP com busca automática no ViaCEP, logradouro, bairro, referência livre, latitude e longitude, ponto no mapa). Cidade e UF são fixas em Marília/SP e não aparecem como campo editável, **por decisão de escopo, agora dita no README** (dicionário de dados): o sistema atende um município e as coordenadas precisam cair dentro dele. A referência é um texto livre (a semente traz "nº 1213", "KM 203", "S/N", "oposto ao nº…", "junto a…"), sem modelos prontos |
| **Situação**: não instalado, operacional, mau funcionamento, desativado, furtado "etc." | ✅ | Seis situações (as cinco citadas mais "Em manutenção"), com histórico de mudanças na ficha. Furtado só volta com recuperação registrada |
| **Necessidade de manutenção**: imediata ou agendada/periódica, com a data da próxima | ✅ | Nenhuma, imediata, agendada, periódica (com periodicidade); data obrigatória nas duas últimas; registro de ordens na ficha e no quadro `/manutencao`. **Mau funcionamento torna a necessidade "imediata" sozinho**, pela tela, pela API, pela simulação e pelo relato do Modo Campo (`gravarSituacao` em `server/repositorios/equipamentos.ts`). A semente grava "imediata" em todo equipamento em mau funcionamento (`server/semente/semear.ts`) e `migrar` corrige uma vez os bancos que já existiam (`garantirImediataNoMauFuncionamento`). Ao concluir uma manutenção, vale a regra de antes (volta a operar; a periódica reagenda pela periodicidade) |
| **Outras características por tipo** (câmera: visão noturna, resolução, cor; radar: velocidade máxima…) | ✅ | Campos próprios por tipo, validados no servidor e mostrados na ficha: câmera com resolução, visão noturna, colorida ou preto e branco, PTZ, ângulo e armazenamento; radar com modalidade, velocidade máxima, faixas e sentido |
| **Cadastro de agentes** (agentes de trânsito, guardas municipais, policiais) | ✅ | `/agentes`, `/agentes/novo`, ficha e `POST/PATCH /api/agentes`: nome, matrícula, categoria, órgão, turno, situação, base (rua, bairro, GPS), telefone e moto/viatura vinculada. Os três perfis do enunciado estão na semente (10, 7 e 8 agentes na primeira página da API) |
| Agentes fazem parte da visão integrada | ✅ | Mapa, indicador "Agentes em atividade", reforço previsto, Modo Campo no celular |

### 2ª Parte — Central de Operações

| O enunciado pede | Situação | Onde |
|---|---|---|
| Dashboard integrado a um mapa; informações contínuas, em tempo real | ✅ | `/` (Central): mapa Leaflet, posições dos agentes e alertas por SSE (`/api/stream`), velocidades 1×, 10× e 60× |
| Ver no mapa **todos** os equipamentos e agentes, com ícones ou identificações diferentes por tipo | ✅ | 350 equipamentos e 80 agentes na API do mapa; ícone do tipo dentro do bloco colorido; agentes em losango com o ícone da categoria; marcadores agrupados |
| Situação simples de ler | ✅ | Cor cheia por situação (não instalado tracejado), legenda no mapa, etiqueta nas fichas |
| Indicadores: total, operacionais, indisponíveis, % de disponibilidade, agentes em atividade | ✅ | Faixa com seis blocos (`GET /api/central/indicadores`) |
| Filtros por tipo, situação, bairro, região, órgão responsável | ✅ | Barra de filtros da Central (tipo, situação, região, bairro, órgão, manutenção), guardados no endereço e **agrupados pelo alcance**: "Equipamentos e agentes" (região, bairro e órgão; do agente vale a base), "Só equipamentos" (situação, tipo, manutenção) e "Só agentes" (categoria e situação do agente, novos), com uma linha de ajuda. Quem filtra por tipo ou situação do equipamento continua vendo os agentes no mapa (`server/servicos/central.ts`, `clausulaAgentes`) |
| **Destacar** equipamentos com manutenção imediata ou próximos da data prevista | ✅ | **O marcador do mapa agora tem um selo**: chave inglesa em disco cheio para manutenção imediata ou atrasada, relógio em disco vazado para os próximos 7 dias (mesmo critério e mesmo campo `manutencao` do filtro e do quadro `/manutencao`). O **grupo** de marcadores que esconde algum desses ganha um selo com a chave inglesa e a conta de quantos precisam de manutenção; o título do marcador e o resumo do grupo (leitores de tela) citam a manutenção, e a Legenda explica os dois selos (`web/src/mapa/iconesMapa.ts`, `CamadaEquipamentos.tsx`, `MapaOperacional.tsx`). Continua existindo o filtro "Manutenção", o quadro `/manutencao`, o selo do menu e o alerta "Manutenção atrasada" |
| Alertas para situações críticas, com destaque no painel | ✅ | Feed com reconhecer e resolver, contorno do bairro no mapa para alerta crítico, notificação e contador de críticos |
| Consultar detalhes de equipamento **ou agente** pelo mapa | ✅ | Clique no marcador abre a ficha lateral; para agente mostra situação, ocorrência atual, turno, órgão, base e último sinal, com "Abrir ficha completa" (conferido clicando num agente) |
| Visão consolidada: regiões normais × que exigem atenção | ✅ | Painel de regiões e bairros com índice, nível e motivos em texto |
| Novos indicadores, mapas de calor, criticidade, agrupamento por região (opcional) | ✅ | Níveis de criticidade, índice por bairro, mapa de calor em Previsões, região em tudo |
| "Se algo estiver acontecendo agora, PROMETHEUS perceberá?" | ✅ | Injetar evento e simulação em 60×: o alerta aparece em segundos (seção 4). No celular a barra de simulação fica fora da tela (I2) |

### 3ª Parte — Cidade Preditiva

| O enunciado pede | Situação | Onde |
|---|---|---|
| Regiões, dias ou horários com maior probabilidade de ocorrências | ✅ | `/api/previsoes/risco`: bairro por hora (24 h e 7 dias), mapa de calor, grade da semana e régua de horário |
| Estimar quando uma região precisará de reforço de agentes | ✅ | `/api/previsoes/reforco`: de que região mover quantos agentes, em que faixa de horas |
| Comportamentos fora do padrão | ✅ | `server/tempo-real/anomalias.ts` e lista de anomalias (20 alertas "Leitura fora do normal" na semente) |
| Tendências de disponibilidade e utilização | ⚠️ | Existem (disponibilidade por tipo, patinetes por bairro, falhas por modelo), mas a projeção de 7 dias erra mais que repetir a média (4,9 × 4,1 p.p.). Depois da correção de I5 a tela diz isso e o resumo não manda agir por ela |
| Índices ou níveis de risco por bairro, região ou período | ✅ | Índice 0 a 100 e níveis (normal, atenção, alto, crítico) por bairro e hora; resumo do dia com o índice de todos os bairros |
| Alertas preventivos ou recomendações | ✅ | Recomendações: sim (resumo do dia, reforço, falhas prováveis). Alertas preventivos no painel: manutenção atrasada, leitura fora do padrão e, **novo, a falha provável** (`falha_provavel`): quando a previsão dá 50% ou mais de chance de falha em 7 dias para um equipamento operacional, o motor abre um alerta de criticidade média (alta a partir de 80%) com os fatores da previsão e a ação "agende uma manutenção preventiva". Um alerta por equipamento; fecha com a manutenção registrada, quando a chance cai abaixo de 40% ou quando o equipamento sai de operação; não reabre nos 3 dias seguintes a uma manutenção. Num banco recém-semeado abrem 4 (`server/tempo-real/motor-alertas.ts`, `varrerFalhasProvaveis`); o tipo aparece nos filtros e rótulos de Alertas |
| Qualquer outra previsão útil | ✅ | Falhas prováveis por equipamento (ranking com fatores) |
| **Deixar claro o que é previsto, quais informações foram consideradas e como ajuda** | ✅ | Cada seção tem um cartão "O que prevê / Dados usados / Como ajuda" com a confiabilidade medida (7 conjuntos de textos na tela `/previsoes`) |
| Gráficos, mapas de calor, indicadores, recomendações (opcional) | ✅ | Todos presentes; o teste retroativo ("Quanto acertou") compara com uma regra simples |

### Lacunas para decidir

1. ❌ **Vídeo da execução** (ponto extra): gravar e citar no README, ou aceitar sem o ponto.
2. ✅ **Marcador de manutenção no mapa**: fechado (selo no marcador e no grupo, e linha na Legenda; ver a tabela da 2ª parte).
3. ✅ **Chance de falha como alerta preventivo**: fechado (alerta `falha_provavel` no motor de alertas; ver a tabela da 3ª parte).
4. ✅ **Cidade e UF**: fixas em Marília/SP; a decisão de escopo agora está dita no README.
5. ⚠️ **"Autônomo"** no veículo de fiscalização do rotativo: só existe no rótulo; um campo "autônomo" resolveria.
6. ✅ **Mau funcionamento marca manutenção imediata** sozinho: fechado, na regra que grava a situação (vale para tela, API, simulação e Modo Campo), na semente e na migração dos bancos existentes.
7. ✅ **Filtros do mapa e agentes**: fechado. Região, bairro e órgão filtram agentes e equipamentos; categoria e situação do agente são filtros novos; tipo, situação e manutenção de equipamento seguem sem esconder agente, e a barra diz o alcance de cada grupo.

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

#### I3. `npm run e2e` termina com erro no Windows e deixa o banco de teste para trás (Corrigido)

**Passos:** `npm run e2e` no Windows.
**Resultado:** os 4 testes passam, mas o processo termina com `Error: EBUSY: resource busy or locked, unlink '...\data\e2e.db'` em `e2e/limpeza.ts:5`, e `data/e2e.db*` fica no disco.
**Causa:** o `globalTeardown` roda enquanto o servidor ainda segura o arquivo; no Windows não dá para apagar arquivo aberto.
**Sugestão:** `rmSync(..., { force: true, maxRetries: 10, retryDelay: 300 })` e, se ainda falhar, avisar sem derrubar o processo; ou apagar o banco no começo do próximo E2E.

#### I4. O bairro do cadastro pode não conter o ponto do GPS

**Passos:** `POST /api/equipamentos` com o ponto de Higienópolis (`-22.230058, -49.968438`) e `bairroId: 1` (Alto Cafezal).
**Resultado:** 201. O equipamento aparece em Alto Cafezal (região Centro) na lista e no índice das regiões, mas o marcador fica em Higienópolis (região Oeste).
**Sugestão:** no serviço, conferir com `server/geo/marilia.ts` se o ponto cai no polígono do bairro (com uma pequena tolerância na divisa) e responder 400 com "O ponto fica em Higienópolis; escolha esse bairro ou mova o ponto". Outra saída é o servidor deduzir o bairro pelo ponto.

#### I5. O resumo do dia recomenda ação com base numa projeção que a própria tela diz ser pior que a média (Corrigido)

**Passos:** abrir `/previsoes` → "Resumo do dia".
**Resultado:** aparece "Disponibilidade de veículos de transporte em queda: 88% em 7 dias … Antecipe as preventivas desse tipo", vinda da reta de tendência. Na mesma tela (e no README), o teste retroativo mostra que essa projeção erra mais (4,9 p.p.) do que repetir a média de 30 dias (4,1 p.p.).
**Por que importa:** um avaliador atento vê a contradição entre a recomendação e o "use para ver a direção".
**Sugestão:** só levar a tendência ao resumo quando a média recente também estiver abaixo da média de 30 dias, ou rebaixar para "informação" (sem "Antecipe…") e citar a confiabilidade no próprio cartão.
**Corrigido:** `calcularTendencias` devolve `testeProjecao` (erro da reta, do último valor e da média). Se a reta não errar menos que as duas regras simples, o cartão vira "Informação:" (`natureza: 'informacao'`, prioridade baixa, selo próprio na tela), sem "Antecipe" e com "Confiabilidade baixa: errou 4,9 p.p., mais que repetir a média (4,1 p.p.)". Com os dados da semente ele fica de fora do top 5 (cede a vaga a recomendações de ação), mas aparece se houver espaço. Testes em `server/preditivo/resumo.test.ts`.

#### I6. O enunciado original não está no repositório (Corrigido)

A conferência da seção 3 foi feita contra a interpretação do documento de design. Se o enunciado pedir algo que o design deixou de fora, nenhum teste pega.
**Sugestão:** salvar o enunciado em `docs/` e refazer a seção 3 item por item.
**Corrigido:** o enunciado está em [ENUNCIADO.md](ENUNCIADO.md) e a seção 3 foi refeita contra ele; trouxe sete lacunas para decidir.

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
| D8 (Corrigido) | Com a porta ocupada, o aviso só aparece depois do build e da semente (17 s) | `npm start` com 3333 em uso | Testar a porta antes (em `scripts/checar-node.mjs` ou no começo de `server/index.ts`) |
| D9 (Corrigido) | No Docker, o log diz "no ar em http://localhost:3333" mesmo publicado em outra porta; a imagem tem 789 MB (leva as dependências de desenvolvimento) | `PORT=3341 docker compose up --build` | Dizer "porta 3333 do contêiner (veja o mapeamento)"; `npm prune --omit=dev` mantendo `tsx`, ou compilar o servidor |
| D10 | Linhas finas e um retângulo de tom diferente no fundo do mapa (emendas dos blocos) | Central em 1440 ou 800, olhar o fundo do mapa | Efeito conhecido de zoom fracionado (`zoomSnap = 0.5`) com `filter` no `.leaflet-tile-pane` (`web/src/estilo/base.css`): usar zoom inteiro no enquadramento ou aplicar o filtro com `will-change: transform` / sobreposição de 0,5 px nos blocos |
| D11 | Em 800 × 600 o mapa da Central fica com 280 px de altura (os indicadores ocupam duas linhas) | Abrir `/` em 800 × 600 | Indicadores compactos (uma linha rolável) abaixo de ~900 px de largura ou altura mínima para o mapa |
| D12 (Corrigido) | README e guia desatualizados: "376 testes em 52 arquivos" (hoje 386 em 53); semente "3,6 s" (8,9 s nesta máquina, 5,8 s no Docker) | `npm test` | Atualizar os números, ou escrever "cerca de 380 testes" e "poucos segundos" |
| D13 (Corrigido) | `npm install` numa máquina limpa altera o `package-lock.json` (`"hasInstallScript": true` no `better-sqlite3`) | `npm install` num clone novo e `git status` | Rodar `npm install` e commitar o lock atualizado; é a mesma linha que aparece modificada na pasta de trabalho principal |

## 6. Como estes testes foram feitos

- Instalação e servidor num `git worktree` separado, porta 3340 (a 3333 estava ocupada por outra sessão), banco próprio.
- Telas: script Playwright que abre cada rota em cada largura, espera 4 s, guarda a captura, os erros de console, a diferença `scrollWidth − innerWidth` e o zoom dos blocos do mapa.
- API: script com `fetch` para os 36 casos acima.
- Carga: `PATCH /api/simulacao { velocidade: 60 }` por 5 minutos, com amostras a cada 30 s da memória do processo (Windows `WorkingSet64`), do tempo das rotas, dos alertas, do índice das regiões e dos quadros por segundo da página aberta.

## 7. Rodada 2 (22/10)

Cinco testadores independentes exploraram o sistema depois das correções da primeira revisão, cada um numa frente: **API e segurança**, **cadastro**, **Central**, **Previsões, Boletim, Modo Campo e Auditoria**, e **instalação**. Os achados principais, todos **corrigidos** nesta rodada:

| Frente | Achados principais | Estado |
|---|---|---|
| API e segurança | Posição do veículo do agente exata para "somente consulta"; relato do Modo Campo com matrícula no texto e sem limite de distância; tempo real aberto depois da saída ou do vencimento da sessão; telemetria sem faixa por métrica, com posição de equipamento fixo e hora antiga; auditoria do Modo Campo sem antes/depois; `Origin` não conferido em toda escrita; busca de agentes alcançava a matrícula; sem `X-Frame-Options`; Swagger sem corpo, filtros e códigos | Corrigido |
| Cadastro | Furtado saía sem recuperação; telefone sem validação; token do dispositivo invisível na tela; lista sem ordenação; órgão da viatura e veículo do agente incoerentes; datas antigas, caracteres de controle e série/matrícula sem normalização | Corrigido |
| Central | Filtros escondidos sob o mapa; alertas e regiões ignorando região e bairro do filtro; selo de manutenção dos grupos misturando chave e relógio; alertas ilegíveis no celular e "Reconhecer" reordenando o feed; partida com chuva comum alagando e bairros com muitos indisponíveis; "Injetar alagamento" duplicando; acidente sempre crítico; falha provável que não fechava; relógio andando com a simulação pausada; bairros sem acento | Corrigido |
| Previsões, Boletim, Campo e Auditoria | Sinal fraco contado antes da última manutenção e lista de falhas instável; ganho do teste retroativo com casas decimais diferentes entre textos; anomalias com bloco vazio no lugar da explicação; Resumo do dia mandando agir por uma tendência que perdia para a média; Boletim imprimindo rodapé órfão; auditoria sem filtros e com valores crus; "Registrar manutenção" visível a quem não pode; Modo Campo sem Sair e Central | Corrigido |
| Instalação | Servidor sem escutar em IPv6 (`::1`); build ruidoso no `npm start`; zip com `docs/design/` e `video/`; projeto do Docker Compose sem nome fixo; `npm run dev` recusado com `dist/web` de um `npm start` anterior | Corrigido |

Os números do README e do guia foram remedidos num banco novo no fim da rodada (22/10/2026).
